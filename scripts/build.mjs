/**
 * 拡張機能をビルドする。
 * content script は MV3 で ESM を読めないため IIFE 1 本にまとめる。
 * page world へ注入する inject.js は world が違うので別の束にする。
 * viewer.css と common/tokens.css は text loader で文字列として取り込み、Shadow DOM へ注入する。
 * tokens.css は popup.html も <link> で読むので、静的ファイルとして <出力先>/common/ にも置く。(static-files.mjs)
 *
 * 出力はブラウザごとに分ける。(scripts/browsers.mjs) Chrome 系は dist、Firefox は dist-firefox。
 * 束ねる元のソースは同じで、違うのは esbuild の target と manifest に差し込むキーだけ。
 *   node scripts/build.mjs                    両方
 *   node scripts/build.mjs --target=chrome    Chrome 系だけ
 *   node scripts/build.mjs --target=firefox   Firefox だけ
 *
 * version の出どころは package.json 1 か所。src/manifest.json は version を持たず、
 * ここで差し込む。(SPEC.md §5.1) minimum_chrome_version / strict_min_version も同様に
 * scripts/targets.mjs から差し込む。
 */
import { build as bundle, context } from 'esbuild';
import { copyFile, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { toManifestVersion } from './manifest-version.mjs';
// コピーする静的ファイルの表は static-files.mjs にある。(副作用なしのモジュールにしてテストからも読む)
import { staticFilesFor } from './static-files.mjs';
import { resolveTargets } from './browsers.mjs';

/** 監視モードで起動するか。 */
const WATCH = process.argv.includes('--watch');

/** version の出どころ。 */
const PACKAGE_JSON = 'package.json';

/** manifest の雛形。version を差し込むので静的ファイルの表とは別に扱う。 */
const MANIFEST_SOURCE = 'src/manifest.json';

/** 束ねる入口。出力先からの相対パスで置く。 */
const ENTRY_POINTS = Object.freeze({
	content: 'src/content/main.js',
	// page world へ注入する分。content.js とは別 world なので束を分ける
	inject: 'src/inject/inject.js',
	'popup/popup': 'src/popup/popup.js',
});

/**
 * ブラウザごとの esbuild の設定を作る。
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @returns {import('esbuild').BuildOptions} esbuild の設定
 */
function buildOptionsFor(target) {
	return {
		entryPoints: ENTRY_POINTS,
		outdir: target.outDir,
		bundle: true,
		format: 'iife',
		// manifest に書く下限と同じ出どころ (targets.mjs)
		target: target.esbuildTarget,
		// viewer.css と common/tokens.css を文字列として import するため。CSS 自体は変換しない
		loader: { '.css': 'text' },
		logLevel: 'info',
	};
}

/**
 * JSON ファイルを読む。
 * @param {string} path ファイルの場所
 * @returns {Promise<object>} 中身
 * @throws {Error} 読めない・JSON として解釈できないとき
 */
async function readJson(path) {
	let text;
	try {
		text = await readFile(path, 'utf8');
	} catch (error) {
		throw new Error(`${path} を読めません: ${error.message}`);
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${path} を JSON として読めません: ${error.message}`);
	}
}

/**
 * package.json の version を読んで検証する。
 * esbuild より前に呼び、不正な version で束ね終わってから落ちるのを避ける。(fail fast)
 * @returns {Promise<string>} package.json の version (semver のまま)
 * @throws {Error} version が manifest の規則に合わないとき
 */
async function readPackageVersion() {
	const { version } = await readJson(PACKAGE_JSON);
	toManifestVersion(version);
	return version;
}

/**
 * ブラウザ向けのキーを差し込んだ manifest を出力先へ書く。
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @param {string} packageVersion package.json の version
 * @returns {Promise<string>} 書き込んだ version
 * @throws {Error} 雛形に version 等が残っているとき、version が規則に合わないとき
 */
async function writeManifest(target, packageVersion) {
	const manifest = await readJson(MANIFEST_SOURCE);
	const applied = target.buildManifest(manifest, packageVersion);
	// src/manifest.json と同じくタブ字下げで書く
	await writeFile(`${target.outDir}/manifest.json`, `${JSON.stringify(applied, null, '\t')}\n`, 'utf8');
	return applied.version;
}

/**
 * 静的ファイルを出力先へ置く。manifest は version を差し込むので別。(writeManifest)
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @returns {Promise<void>}
 */
async function copyStatic(target) {
	await Promise.all(staticFilesFor(target.outDir).map(async ([from, to]) => {
		// コピー先からディレクトリを決める。置き場所が増えても書き足さなくて済む
		await mkdir(dirname(to), { recursive: true });
		try {
			await copyFile(from, to);
		} catch (error) {
			// ENOENT の素の文言だけでは、アイコンの生成忘れ (npm run build:icons) に気づきにくい
			throw new Error(`${from} をコピーできません: ${error.message}`);
		}
	}));
}

/**
 * 束ね以外の成果物 (静的ファイルと manifest) を出力先へ置く。
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @param {string} packageVersion package.json の version
 * @returns {Promise<void>}
 */
async function emitAssets(target, packageVersion) {
	await copyStatic(target);
	console.log(`[${target.name}] ${target.outDir}/ manifest version ${await writeManifest(target, packageVersion)}`);
}

/**
 * 出力先を空にして作り直す。
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @returns {Promise<void>}
 */
async function resetOutDir(target) {
	await rm(target.outDir, { recursive: true, force: true });
	// writeManifest が出力先の存在を esbuild 任せにしないよう、先に作っておく
	await mkdir(target.outDir, { recursive: true });
}

/**
 * 作り終えたブラウザの名前。失敗したときに、ここに入っている出力は消さずに残す。
 * @type {Set<string>}
 */
const completed = new Set();

/**
 * ビルドを実行する。1 ブラウザ作り終えるたびに completed へ入れる。
 * @param {import('./browsers.mjs').BrowserTarget[]} targets 作るブラウザ
 * @returns {Promise<void>}
 */
async function build(targets) {
	const packageVersion = await readPackageVersion();

	if (WATCH) {
		for (const target of targets) {
			await resetOutDir(target);
			const ctx = await context(buildOptionsFor(target));
			await ctx.watch();
			await emitAssets(target, packageVersion);
			completed.add(target.name);
		}
		// esbuild が見張るのは JS だけ。manifest / popup / version を変えたら再起動する
		console.log('watching... (静的ファイルと version の同期は起動時の 1 回だけ)');
		return;
	}

	// 1 ブラウザずつ最後まで作る。Chrome 系が先なので、Firefox 側で落ちても dist は作り終えている
	for (const target of targets) {
		await resetOutDir(target);
		await bundle(buildOptionsFor(target));
		await emitAssets(target, packageVersion);
		completed.add(target.name);
	}
}

/** 今回作るブラウザ。引数が正しくなければ何も消さずに止める。 */
let targets;
try {
	targets = resolveTargets(process.argv.slice(2));
} catch (error) {
	console.error(`[build] ${error?.message ?? error}`);
	process.exit(1);
}

try {
	await build(targets);
} catch (error) {
	console.error(`[build] ${error?.message ?? error}`);
	// 途中で落ちた出力を残すと、古い成果物を読み込んで動かしてしまう。
	// 落ちたブラウザと、まだ手を付けていないブラウザ (前の版が残っている) の出力を消す。
	// **作り終えた出力は残す。** Firefox 側の失敗で Chrome 系の dist を巻き込まないため
	// 片付け自体が失敗 (ブラウザが出力先を掴んでいる等) しても、元のエラーの表示を邪魔しない
	for (const target of targets) {
		if (completed.has(target.name)) {
			console.error(`[build] ${target.outDir} は作り終えているので残します`);
			continue;
		}
		try {
			await rm(target.outDir, { recursive: true, force: true });
		} catch (cleanupError) {
			console.error(`[build] ${target.outDir} を消せませんでした: ${cleanupError?.message ?? cleanupError}`);
		}
	}
	process.exit(1);
}
