/**
 * フォーカスの所在を調べる小物。
 *
 * ビュワーは Shadow DOM の中にいるので `document.activeElement` はホスト要素を返す。
 * 「どこにフォーカスがあるか」は必ず**その要素の属する木** (`getRootNode()`) から引く。
 *
 * 同じ判定を各所で持たないためにここへ寄せた。**フォーカスを真偽値で覚えないこと** —
 * `disabled` にした瞬間にブラウザがフォーカスを外すので、覚えた値はその場で嘘になる。
 */

/**
 * 要素の属する木で今フォーカスのある要素。
 * @param {Document} doc document (木から引けないときの控え)
 * @param {HTMLElement} el 基準にする要素
 * @returns {Element|null} フォーカスのある要素。無ければ null
 */
export function activeElementIn(doc, el) {
	const tree = typeof el.getRootNode === 'function' ? el.getRootNode() : null;
	return tree?.activeElement ?? doc.activeElement ?? null;
}

/**
 * その要素自身にフォーカスがあるか。
 * @param {Document} doc document
 * @param {HTMLElement} el 調べる要素
 * @returns {boolean} フォーカスがあれば true
 */
export function isFocused(doc, el) {
	return activeElementIn(doc, el) === el;
}

/**
 * その要素か中のどれかにフォーカスがあるか。
 * @param {Document} doc document
 * @param {HTMLElement} el 調べる入れ物
 * @returns {boolean} 中にフォーカスがあれば true
 */
export function hasFocusWithin(doc, el) {
	const active = activeElementIn(doc, el);
	if (active === null) return false;
	return active === el || (typeof el.contains === 'function' && el.contains(active));
}
