/**
 * 拡張機能をビルドする。
 * content script は MV3 で ESM を読めないため IIFE 1 本にまとめる。
 * page world へ注入する inject.js は world が違うので別の束にする。
 * viewer.css は text loader で文字列として取り込み、Shadow DOM へ注入する。
 *
 * version の出どころは package.json 1 か所。src/manifest.json は version を持たず、
 * ここで差し込む (CLAUDE.md「バージョン管理」)。
 */
import { context } from 'esbuild';
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applyVersion } from './manifest-version.mjs';
import { ICON_OUTPUTS, iconFileName } from './icon-svg.mjs';

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
	...ICON_OUTPUTS.map(({ size }) => [
		`src/icons/${iconFileName(size)}`,
		`${OUT_DIR}/icons/${iconFileName(size)}`,
	]),
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
	target: 'chrome120',
	// viewer.css を文字列として import するため。CSS 自体は変換しない
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
 * package.json の version を差し込んだ manifest を dist へ書く。
 * @returns {Promise<string>} 書き込んだ version
 * @throws {Error} version が manifest の規則に合わないとき
 */
async function writeManifest() {
	const [packageJson, manifest] = await Promise.all([
		readJson(PACKAGE_JSON),
		readJson(MANIFEST_SOURCE),
	]);
	const applied = applyVersion(manifest, packageJson.version);
	// src/manifest.json と同じくタブ字下げで書く
	await writeFile(MANIFEST_OUTPUT, `${JSON.stringify(applied, null, '\t')}\n`, 'utf8');
	return applied.version;
}

/**
 * 静的ファイルを dist へ置く。
 * @returns {Promise<void>}
 */
async function copyStatic() {
	await Promise.all(STATIC_FILES.map(async ([from, to]) => {
		// コピー先からディレクトリを決める。置き場所が増えても書き足さなくて済む
		await mkdir(dirname(to), { recursive: true });
		try {
			await cp(from, to);
		} catch (error) {
			// ENOENT の素の文言だけでは、アイコンの生成忘れ (npm run build:icons) に気づきにくい
			throw new Error(`${from} をコピーできません: ${error.message}`);
		}
	}));
	console.log(`manifest version ${await writeManifest()}`);
}

/**
 * ビルドを実行する。
 * @returns {Promise<void>}
 */
async function build() {
	await rm(OUT_DIR, { recursive: true, force: true });
	const ctx = await context(BUILD_OPTIONS);

	if (WATCH) {
		await ctx.watch();
		await copyStatic();
		// esbuild が見張るのは JS だけ。manifest / popup / version を変えたら再起動する
		console.log('watching... (静的ファイルと version の同期は起動時の 1 回だけ)');
		return;
	}

	try {
		await ctx.rebuild();
		await copyStatic();
	} finally {
		await ctx.dispose();
	}
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
