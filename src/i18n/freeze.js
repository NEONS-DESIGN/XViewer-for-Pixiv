/**
 * カタログの凍結。
 * index.js (content script 用。5 言語まとめて読む) と load.js (popup 用。1 言語だけ読む) の
 * 両方から使うので、深く凍結する処理だけをここへ切り出す。
 */

/**
 * 深く凍結する。カタログはどこからも書き換えられてはいけない。
 * 辿るのはオブジェクトと配列だけで、書式の関数は凍結しない。(関数にプロパティを生やす用途は無い)
 * @param {object} value 凍結するもの
 * @returns {object} 同じもの (凍結済み)
 */
function deepFreeze(value) {
	for (const key of Object.getOwnPropertyNames(value)) {
		const child = value[key];
		if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
	}
	return Object.freeze(value);
}

/**
 * カタログに自分の言語を添えて凍結する。
 * @param {string} lang 言語コード
 * @param {object} catalog 言語のカタログ (ja.js などの default export)
 * @returns {object} 文言のカタログ。自分の言語を lang として持つ
 */
export function buildStrings(lang, catalog) {
	return deepFreeze({ lang, ...catalog });
}
