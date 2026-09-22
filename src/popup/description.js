/**
 * 説明文の段落。設定項目・選択肢・ライセンスの注記で同じ形を使う。
 * id を持たせるのは、フォーム部品から aria-describedby で結び付けるため。
 * 読み上げ環境ではラベルだけでは意味が伝わらない。(UI_DESIGN_KIT §1 原則 6)
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
