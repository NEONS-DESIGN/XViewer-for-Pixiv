/**
 * 表示用の整形。DOM も pixiv も知らない純粋関数だけを置く。
 */

/** 言語ごとの数の書式。件数の桁区切りに使う。未知の言語は日本語へ倒す。 */
const COUNT_LOCALES = Object.freeze({ ja: 'ja-JP', en: 'en-US' });

/**
 * 作った Intl.NumberFormat の使い回し。解決後のロケール (ja-JP 等) をキーにする。
 * 解決前の言語をキーにすると、未知の言語ごとに同じ ja-JP の書式を別々に作ってしまう。
 */
const formatters = new Map();

/**
 * 言語に対応する Intl.NumberFormat を返す。無ければ作って覚える。
 * @param {string} lang 言語サブタグ (strings.lang)。未知なら日本語の書式
 * @returns {Intl.NumberFormat} 桁区切りの書式
 */
function formatterFor(lang) {
	const locale = COUNT_LOCALES[lang] ?? COUNT_LOCALES.ja;
	let formatter = formatters.get(locale);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale);
		formatters.set(locale, formatter);
	}
	return formatter;
}

/**
 * 数値を言語ごとの桁区切りにする。数値でなければ 0 として扱う。
 * @param {number|null|undefined} value 数値
 * @param {string} lang 言語サブタグ (strings.lang)
 * @returns {string} 区切った文字列
 */
export function formatCount(value, lang) {
	const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
	return formatterFor(lang).format(number);
}
