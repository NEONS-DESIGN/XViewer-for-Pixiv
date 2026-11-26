/**
 * 説明文の段落。設定項目・選択肢・ライセンスの注記で同じ形を使う。
 * id を持たせるのは、フォーム部品から aria-describedby で結び付けるため。
 * 読み上げ環境ではラベルだけでは意味が伝わらない。
 */

/**
 * 説明文の段落を作る。
 * @param {Document} doc 対象のドキュメント
 * @param {string} text 本文
 * @param {string} [id] data-role と id に使う名前。省略すると目印を持たない
 * @returns {HTMLParagraphElement} 段落
 */
export function createDescription(doc, text, id) {
	const paragraph = doc.createElement('p');
	paragraph.className = 'description';
	paragraph.textContent = text;
	if (id) {
		paragraph.dataset.role = id;
		paragraph.setAttribute('id', id);
	}
	return paragraph;
}

/**
 * 空白区切りの属性値へ語を足す・外す。(aria-describedby の付け外しに使う)
 * ほかの語は残すので、同じ属性へ別々の書き手が語を結び付けていてもぶつからない。
 * @param {Element} element 対象
 * @param {string} name 属性名
 * @param {string} token 語
 * @param {boolean} present 足すなら true
 * @returns {void}
 */
export function toggleToken(element, name, token, present) {
	const tokens = (element.getAttribute(name) ?? '').split(/\s+/).filter((one) => one && one !== token);
	if (present) tokens.push(token);
	if (tokens.length > 0) element.setAttribute(name, tokens.join(' '));
	else element.removeAttribute(name);
}
