/**
 * 表示用の整形。DOM も pixiv も知らない純粋関数だけを置く。
 */

/** 言語ごとの数の書式。件数の桁区切りに使う。未知の言語は日本語へ倒す。 */
const COUNT_LOCALES = Object.freeze({ ja: 'ja-JP', en: 'en-US' });

/** 作った Intl.NumberFormat の使い回し。言語をキーにする。 */
const formatters = new Map();

/**
 * 言語に対応する Intl.NumberFormat を返す。無ければ作って覚える。
 * @param {string} lang 言語サブタグ (strings.lang)
 * @returns {Intl.NumberFormat} 桁区切りの書式
 */
function formatterFor(lang) {
	let formatter = formatters.get(lang);
	if (!formatter) {
		formatter = new Intl.NumberFormat(COUNT_LOCALES[lang] ?? COUNT_LOCALES.ja);
		formatters.set(lang, formatter);
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
