/**
 * 拡張機能をビルドする。
 * content script は MV3 で ESM を読めないため IIFE 1 本にまとめる。
 * page world へ注入する inject.js は world が違うので別の束にする。
 * viewer.css と common/tokens.css は text loader で文字列として取り込み、Shadow DOM へ注入する。
 * tokens.css は popup.html も <link> で読むので、静的ファイルとして <出力先>/common/ にも置く。(static-files.mjs)
 * popup は拡張のページとして開くので ESM を読める。content/inject とは別の設定で束ね、
 * 言語のカタログを分割して使う 1 言語だけを読む。(build-options.mjs の popupOptionsFor)
 *
 * 出力はブラウザごとに分ける。(scripts/browsers.mjs) Chrome 系は dist、Firefox は dist-firefox。
 * 束ねる元のソースは同じで、違うのは esbuild の target と manifest に差し込むキーだけ。
 *   node scripts/build.mjs                    両方
 *   node scripts/build.mjs --target=chrome    Chrome 系だけ
 *   node scripts/build.mjs --target=firefox   Firefox だけ
 *
 * パスはリポジトリのルートから解く。どのフォルダから実行しても、ルートの dist / dist-firefox を作る。
 *
 * version の出どころは package.json 1 か所。src/manifest.json は version を持たず、
 * ここで差し込む。minimum_chrome_version / strict_min_version も同様に
 * scripts/targets.mjs から差し込む。
 */
import { build as bundle, context } from 'esbuild';
import { copyFile, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { toManifestVersion } from './manifest-version.mjs';
// コピーする静的ファイルの表は static-files.mjs にある。(副作用なしのモジュールにしてテストからも読む)
import { staticFilesFor } from './static-files.mjs';
import { resolveTargets } from './browsers.mjs';
import { minifyCssText } from './css-text-plugin.mjs';
import { buildOptionsFor, popupOptionsFor, planFailureCleanup } from './build-options.mjs';
import { PACKAGE_JSON, readJson } from './json.mjs';
import { ROOT_DIR } from './paths.mjs';

// 出力先・静的ファイルの表はルートからの相対パスなので、カレントをルートへ移してから使う
process.chdir(ROOT_DIR);

/** 監視モードで起動するか。 */
const WATCH = process.argv.includes('--watch');

/** esbuild の設定に渡すビルドの種類。 */
const MODE = Object.freeze({ watch: WATCH });

/** manifest の雛形。version を差し込むので静的ファイルの表とは別に扱う。 */
const MANIFEST_SOURCE = 'src/manifest.json';

/** 静的ファイルのうち、コピーの代わりに圧縮して書き出すもの。(popup が <link> で読む CSS) 監視中は素のまま置く。 */
const CSS_FILE_PATTERN = /\.css$/;

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
			if (CSS_FILE_PATTERN.test(from) && !WATCH) {
				await writeFile(to, await minifyCssText(await readFile(from, 'utf8'), target.esbuildTarget), 'utf8');
			} else {
				await copyFile(from, to);
			}
		} catch (error) {
			// コピー元の名前を付ける。(npm run build:icons の生成忘れなどに気づけるように)
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
 * 出力先に手を付けたブラウザの名前。失敗したときに、ここに無い出力は前回のまま残す。
 * @type {Set<string>}
 */
const started = new Set();

/**
 * 作り終えたブラウザの名前。失敗したときに、ここに入っている出力は消さずに残す。
 * @type {Set<string>}
 */
const completed = new Set();

/**
 * 出力先を空にして作り直す。消す前に started へ入れる。(消し始めた出力先は途中で落ちても片付けの対象にする)
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @returns {Promise<void>}
 */
async function resetOutDir(target) {
	started.add(target.name);
	await rm(target.outDir, { recursive: true, force: true });
	// writeManifest が出力先の存在を esbuild 任せにしないよう、先に作っておく
	await mkdir(target.outDir, { recursive: true });
}

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
			const ctx = await context(buildOptionsFor(target, MODE));
			const popupCtx = await context(popupOptionsFor(target, MODE));
			await ctx.watch();
			await popupCtx.watch();
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
		await bundle(buildOptionsFor(target, MODE));
		await bundle(popupOptionsFor(target, MODE));
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
	// 作り始めて作り終えていないブラウザの出力だけを消す。片付けの失敗は表示するだけにする
	for (const { target, action } of planFailureCleanup(targets, started, completed)) {
		if (action === 'completed') {
			console.error(`[build] ${target.outDir} は作り終えているので残します`);
			continue;
		}
		if (action === 'untouched') {
			console.error(`[build] ${target.outDir} は手を付ける前に止まったので前回のまま残します`);
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
