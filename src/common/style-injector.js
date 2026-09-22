/**
 * light DOM へ `<style>` を 1 枚だけ差し込み、後で外すための小さな部品。
 *
 * グリッドのフォーカス枠・ピックアップ欄の非表示・sentinel の見た目・ページャ隠しは
 * どれも「id 付きの style を head に 1 枚入れ、dispose で外す」だけなので、ここに集める。
 * 失敗しても呼び出し側を巻き込まない。(見た目が素になるだけで機能は続く)
 */
import { warn } from './log.js';

/**
 * @typedef {object} StyleHandle
 * @property {() => void} show CSS を差し込む。既にあれば足さない
 * @property {() => void} hide 差し込んだ CSS を外す
 * @property {() => boolean} isActive 差し込み中か
 * @property {() => void} dispose hide と同じ。撤去の呼び出しを揃えるための別名
 */

/**
 * id 付きの style を出し入れする操作を作る。作った時点では何もしない。
 * @param {Document} doc 対象のドキュメント
 * @param {string} id style 要素の id。二重注入を防ぐ目印も兼ねる
 * @param {string} css 差し込む CSS
 * @param {string} label 失敗時のログに出す名前
 * @returns {StyleHandle} 出し入れ
 */
export function createStyleHandle(doc, id, css, label) {
	/** @type {Element|null} 差し込んだ style。出していなければ null */
	let style = null;

	function show() {
		try {
			const root = doc.head ?? doc.body;
			if (!root) return;
			// 既に入っていれば足さない。dispose() で外せるよう参照は持ち直す
			style = doc.getElementById(id);
			if (style) return;
			style = doc.createElement('style');
			style.id = id;
			// innerHTML は使わない。(SPEC §13) CSS は textContent で入る
			style.textContent = css;
			root.appendChild(style);
		} catch (error) {
			warn(`${label} style failed`, error);
			style = null;
		}
	}

	function hide() {
		try {
			style?.remove();
		} catch (error) {
			warn(`${label} style removal failed`, error);
		}
		style = null;
	}

	return {
		show,
		hide,
		isActive: () => style !== null,
		dispose: hide,
	};
}
