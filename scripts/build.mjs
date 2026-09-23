/**
 * 拡張機能をビルドする。
 * content script は MV3 で ESM を読めないため IIFE 1 本にまとめる。
 * page world へ注入する inject.js は world が違うので別の束にする。
 * viewer.css と common/tokens.css は text loader で文字列として取り込み、Shadow DOM へ注入する。
 * tokens.css は popup.html も <link> で読むので、静的ファイルとして dist/common/ にも置く。
 *
 * version の出どころは package.json 1 か所。src/manifest.json は version を持たず、
 * ここで差し込む。(CLAUDE.md「バージョン管理」) minimum_chrome_version も同様に
 * scripts/targets.mjs から差し込む。
 */
import { build as bundle, context } from 'esbuild';
import { copyFile, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applyVersion, applyMinimumChromeVersion, toManifestVersion } from './manifest-version.mjs';
import { ICON_OUTPUTS, iconFileName } from './icon-svg.mjs';
import { ESBUILD_TARGET, MINIMUM_CHROME_VERSION } from './targets.mjs';

/** 監視モードで起動するか。 */
const WATCH = process.argv.includes('--watch');

/** 出力先。 */
const OUT_DIR = 'dist';

/** version の出どころ。 */
const PACKAGE_JSON = 'package.json';

/** manifest の雛形と出力先。version を差し込むので STATIC_FILES とは別に扱う。 */
const MANIFEST_SOURCE = 'src/manifest.json';
const MANIFEST_OUTPUT = `${OUT_DIR}/manifest.json`;

/**
 * そのままコピーする静的ファイル。[コピー元, コピー先] の順。
 * アイコンは build-icons.mjs が作った生成物で、サイズの出どころは ICON_OUTPUTS 1 か所。
 */
const STATIC_FILES = [
	['src/popup/popup.html', `${OUT_DIR}/popup/popup.html`],
	['src/popup/popup.css', `${OUT_DIR}/popup/popup.css`],
	// 配色トークン。popup.html が ../common/tokens.css で読むので、src と同じ相対配置で置く。
	// viewer.js は同じファイルを text loader で束ねるため、こちらは popup のためだけのコピー
	['src/common/tokens.css', `${OUT_DIR}/common/tokens.css`],
	...ICON_OUTPUTS.map(({ size }) => [
		`src/icons/${iconFileName(size)}`,
		`${OUT_DIR}/icons/${iconFileName(size)}`,
	]),
	// manifest の name / description の訳。__MSG_*__ の解決に使うので dist/_locales に置く。
	// ここだけは pixiv の表示言語ではなくブラウザの UI 言語に従う (chrome.i18n の仕様)
	['src/_locales/ja/messages.json', `${OUT_DIR}/_locales/ja/messages.json`],
	['src/_locales/en/messages.json', `${OUT_DIR}/_locales/en/messages.json`],
	// ライセンス文。配布する zip は dist をそのまま固めるので、ここに無いと受け取った人に届かない。
	// Apache-2.0 §4(a) は本文の写しを渡すことを求める (Material Symbols の図形を同梱しているため)
	['LICENSE', `${OUT_DIR}/LICENSE`],
	['NOTICE', `${OUT_DIR}/NOTICE`],
	['LICENSES/Apache-2.0.txt', `${OUT_DIR}/LICENSES/Apache-2.0.txt`],
];

/** @type {import('esbuild').BuildOptions} */
const BUILD_OPTIONS = {
	entryPoints: {
		content: 'src/content/main.js',
		// page world へ注入する分。content.js とは別 world なので束を分ける
		inject: 'src/inject/inject.js',
		'popup/popup': 'src/popup/popup.js',
	},
	outdir: OUT_DIR,
	bundle: true,
	format: 'iife',
	// manifest の minimum_chrome_version と同じ出どころ (targets.mjs)
	target: ESBUILD_TARGET,
	// viewer.css と common/tokens.css を文字列として import するため。CSS 自体は変換しない
	loader: { '.css': 'text' },
	logLevel: 'info',
};

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
 * version と minimum_chrome_version を差し込んだ manifest を dist へ書く。
 * @param {string} packageVersion package.json の version
 * @returns {Promise<string>} 書き込んだ version
 * @throws {Error} 雛形に version 等が残っているとき、version が規則に合わないとき
 */
async function writeManifest(packageVersion) {
	const manifest = await readJson(MANIFEST_SOURCE);
	const applied = applyMinimumChromeVersion(applyVersion(manifest, packageVersion), MINIMUM_CHROME_VERSION);
	// src/manifest.json と同じくタブ字下げで書く
	await writeFile(MANIFEST_OUTPUT, `${JSON.stringify(applied, null, '\t')}\n`, 'utf8');
	return applied.version;
}

/**
 * 静的ファイルを dist へ置く。manifest は version を差し込むので別。(writeManifest)
 * @returns {Promise<void>}
 */
async function copyStatic() {
	await Promise.all(STATIC_FILES.map(async ([from, to]) => {
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
 * 束ね以外の成果物 (静的ファイルと manifest) を dist へ置く。
 * @param {string} packageVersion package.json の version
 * @returns {Promise<void>}
 */
async function emitAssets(packageVersion) {
	await copyStatic();
	console.log(`manifest version ${await writeManifest(packageVersion)}`);
}

/**
 * ビルドを実行する。
 * @returns {Promise<void>}
 */
async function build() {
	const packageVersion = await readPackageVersion();
	await rm(OUT_DIR, { recursive: true, force: true });
	// writeManifest が dist の存在を esbuild 任せにしないよう、先に作っておく
	await mkdir(OUT_DIR, { recursive: true });

	if (WATCH) {
		const ctx = await context(BUILD_OPTIONS);
		await ctx.watch();
		await emitAssets(packageVersion);
		// esbuild が見張るのは JS だけ。manifest / popup / version を変えたら再起動する
		console.log('watching... (静的ファイルと version の同期は起動時の 1 回だけ)');
		return;
	}

	await bundle(BUILD_OPTIONS);
	await emitAssets(packageVersion);
}

try {
	await build();
} catch (error) {
	console.error(`[build] ${error?.message ?? error}`);
	// 途中で落ちた dist を残すと、古い成果物を読み込んで動かしてしまう。
	// 片付け自体が失敗 (Chrome が dist を掴んでいる等) しても、元のエラーの表示を邪魔しない
	try {
		await rm(OUT_DIR, { recursive: true, force: true });
	} catch (cleanupError) {
		console.error(`[build] ${OUT_DIR} を消せませんでした: ${cleanupError?.message ?? cleanupError}`);
	}
	process.exit(1);
}
