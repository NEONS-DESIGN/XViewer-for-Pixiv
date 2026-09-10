/**
 * 拡張機能をビルドする。
 * content script は MV3 で ESM を読めないため IIFE 1 本にまとめる。
 * page world へ注入する inject.js は world が違うので別の束にする。
 * viewer.css は text loader で文字列として取り込み、Shadow DOM へ注入する。
 */
import { context } from 'esbuild';
import { cp, rm, mkdir } from 'node:fs/promises';

/** 監視モードで起動するか。 */
const WATCH = process.argv.includes('--watch');

/** 出力先。 */
const OUT_DIR = 'dist';

/** そのままコピーする静的ファイル。[コピー元, コピー先] の順。 */
const STATIC_FILES = [
	['src/manifest.json', `${OUT_DIR}/manifest.json`],
	['src/popup/popup.html', `${OUT_DIR}/popup/popup.html`],
	['src/popup/popup.css', `${OUT_DIR}/popup/popup.css`],
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
 * 静的ファイルを dist へコピーする。
 * @returns {Promise<void>}
 */
async function copyStatic() {
	await mkdir(`${OUT_DIR}/popup`, { recursive: true });
	for (const [from, to] of STATIC_FILES) {
		await cp(from, to);
	}
}

await rm(OUT_DIR, { recursive: true, force: true });
const ctx = await context(BUILD_OPTIONS);

if (WATCH) {
	await ctx.watch();
	await copyStatic();
	console.log('watching...');
} else {
	await ctx.rebuild();
	await copyStatic();
	await ctx.dispose();
}
