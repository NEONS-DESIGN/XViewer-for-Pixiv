/**
 * 開発者向けのログ。
 * 接頭辞を 1 か所で持ち、各モジュールが文字列を直書きしないようにする。
 * 利用者向けの文言はここを通さない。(画面に出すものは各モジュールの定数で持つ)
 */

/** 拡張のログに付ける接頭辞。DevTools で自分の出力だけを絞り込むために使う。 */
export const LOG_PREFIX = '[XViewer]';

/**
 * 警告を出す。握りつぶした例外の詳細を残すときに使う。(SPEC §12)
 * @param {string} message 何が起きたか
 * @param {...unknown} details 例外や値
 * @returns {void}
 */
export function warn(message, ...details) {
	console.warn(`${LOG_PREFIX} ${message}`, ...details);
}

/**
 * 情報を出す。起動したことの記録など、失敗ではない節目に使う。
 * @param {string} message 何が起きたか
 * @param {...unknown} details 値
 * @returns {void}
 */
export function info(message, ...details) {
	console.log(`${LOG_PREFIX} ${message}`, ...details);
}

/**
 * エラーを出す。画面全体に関わる失敗 (起動できない等) に使う。
 * @param {string} message 何が起きたか
 * @param {...unknown} details 例外や値
 * @returns {void}
 */
export function logError(message, ...details) {
	console.error(`${LOG_PREFIX} ${message}`, ...details);
}
