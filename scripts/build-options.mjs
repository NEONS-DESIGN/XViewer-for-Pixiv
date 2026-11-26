/**
 * esbuild の設定。build.mjs が使い、テストからも読むので副作用を持たせない。
 * content / inject は IIFE、popup は ESM で言語のカタログを分割する。
 * パスはリポジトリのルートを作業フォルダにして解く。(実行時のカレントに依らない)
 */
import { cssTextPlugin } from './css-text-plugin.mjs';
import { ROOT_DIR } from './paths.mjs';
import { staleChunksPlugin } from './stale-chunks-plugin.mjs';

/** 束ねる入口。出力先からの相対パスで置く。 */
export const ENTRY_POINTS = Object.freeze({
	content: 'src/content/main.js',
	// page world へ注入する分。content.js とは別 world なので束を分ける
	inject: 'src/inject/inject.js',
});

/** popup だけの束ねる入口。popup は拡張のページなので ESM で言語のカタログを分割できる。 */
export const POPUP_ENTRY_POINTS = Object.freeze({ 'popup/popup': 'src/popup/popup.js' });

/** popup の分割した断片を置くフォルダ。出力先からの相対パス。 */
export const POPUP_CHUNK_DIR = 'popup/chunks';

/**
 * @typedef {object} BuildMode
 * @property {boolean} [watch] 監視モードか。(縮めず、古い断片を消すプラグインを足す)
 */

/**
 * ブラウザごとの esbuild の設定を作る。
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @param {BuildMode} [mode] ビルドの種類
 * @returns {import('esbuild').BuildOptions} esbuild の設定
 */
export function buildOptionsFor(target, { watch = false } = {}) {
	return {
		absWorkingDir: ROOT_DIR,
		entryPoints: ENTRY_POINTS,
		outdir: target.outDir,
		bundle: true,
		format: 'iife',
		target: target.esbuildTarget,
		// 監視中は読みやすさを残す。配布物は縮める
		minify: !watch,
		// 日本語などの文字を \uXXXX に逃がさず UTF-8 のまま出す
		charset: 'utf8',
		// viewer.css と common/tokens.css を圧縮してから文字列として import する
		plugins: [cssTextPlugin(target.esbuildTarget)],
		logLevel: 'info',
	};
}

/**
 * popup の esbuild の設定を作る。
 * popup は拡張のページなので ESM を読める。言語のカタログを分割し、使う 1 言語だけを読む。
 * 監視モードでは、再ビルドで出力されなくなった断片を消すプラグインを足す。
 * @param {import('./browsers.mjs').BrowserTarget} target 作るブラウザ
 * @param {BuildMode} [mode] ビルドの種類
 * @returns {import('esbuild').BuildOptions} esbuild の設定
 */
export function popupOptionsFor(target, { watch = false } = {}) {
	const base = buildOptionsFor(target, { watch });
	return {
		...base,
		entryPoints: POPUP_ENTRY_POINTS,
		format: 'esm',
		splitting: true,
		// 分割した断片は popup/ の下へ置く。(web_accessible にしない。拡張のページからしか読まない)
		chunkNames: `${POPUP_CHUNK_DIR}/[name]-[hash]`,
		plugins: watch
			? [...base.plugins, staleChunksPlugin(`${target.outDir}/${POPUP_CHUNK_DIR}`)]
			: base.plugins,
	};
}

/**
 * ビルドが失敗したときの出力先の扱い。
 * - remove: 手を付けた (出力先を消して作り直し始めた) が作り終えていない。途中の出力なので消す
 * - completed: 作り終えている。残す
 * - untouched: 手を付ける前に落ちた。前回のビルドの出力なので残す
 * @typedef {'remove' | 'completed' | 'untouched'} FailureAction
 */

/**
 * ビルドが失敗したときに、ブラウザごとの出力先をどう扱うかを決める。
 * @param {ReadonlyArray<import('./browsers.mjs').BrowserTarget>} targets 今回作るブラウザ
 * @param {ReadonlySet<string>} started 出力先に手を付けたブラウザの名前
 * @param {ReadonlySet<string>} completed 作り終えたブラウザの名前
 * @returns {{ target: import('./browsers.mjs').BrowserTarget, action: FailureAction }[]} ブラウザごとの扱い (targets の順)
 */
export function planFailureCleanup(targets, started, completed) {
	return targets.map((target) => {
		if (completed.has(target.name)) return { target, action: 'completed' };
		if (started.has(target.name)) return { target, action: 'remove' };
		return { target, action: 'untouched' };
	});
}
