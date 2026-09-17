/**
 * 表示用の整形。DOM も pixiv も知らない純粋関数だけを置く。
 */

/** 数値の区切りに使うロケール。pixiv 本体 (日本語 UI) と同じ見え方にする。 */
const COUNT_LOCALE = 'ja-JP';

/**
 * 数値を 3 桁区切りにする。数値でなければ 0 として扱う。
 * @param {number|null|undefined} value 数値
 * @returns {string} 区切った文字列
 */
export function formatCount(value) {
	const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
	return number.toLocaleString(COUNT_LOCALE);
}
