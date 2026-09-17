/**
 * 「今どのページを見ているか」の判断。
 *
 * 無限スクロールの `?p=` は「読み込んだ最後のページ」ではなく「画面に出ているページ」を指す
 * (SPEC §6.8.5)。上へ戻れば戻ったぶんだけ減らないと、再読み込みで別の場所へ飛ぶ。
 * infinite-sync.js と同じく、判断だけを純粋関数に閉じ込めて DOM から切り離す。
 */

/**
 * 印が「越えた」と見なされる位置 (ビューポート上端からの px)。
 * 0 = 画面の一番上。ここより上へ流れた印はもう読み終えたページと見なす。
 */
export const VISIBLE_PAGE_TOP = 0;

/**
 * @typedef {object} PageMark
 * @property {number} page ページ番号 (1 始まり)
 * @property {object} el そのページの先頭に並んだカード (li)
 */

/**
 * 印の並びから、今見えているページを選ぶ。
 *
 * 後ろから見て、最初に「上端を越えている」印のページを採る。
 * どれも越えていなければ (一番上まで戻っていれば) 先頭の印のページ。
 * 上端が数として読めない印 (DOM から外れた等) は飛ばす。
 * @param {PageMark[]} marks ページの先頭カードの印。page の昇順
 * @param {(el: object) => number} topOf 要素の上端 (ビューポート基準の px) を読む
 * @param {number} [threshold] この位置より上に来た印を「越えた」と見なす
 * @returns {number|null} ページ番号。印が無ければ null
 */
export function pickVisiblePage(marks, topOf, threshold = VISIBLE_PAGE_TOP) {
	if (!Array.isArray(marks) || marks.length === 0) return null;
	for (let i = marks.length - 1; i >= 0; i -= 1) {
		const top = topOf(marks[i].el);
		if (Number.isFinite(top) && top <= threshold) return marks[i].page;
	}
	return marks[0].page;
}
