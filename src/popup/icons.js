/**
 * 設定画面 (popup) のアイコン。
 * popup が使う図形だけを名前つきで import し、図形の表 (ICON_SHAPES) 全体を束に入れない。
 * popup で新しいアイコンを使うときは POPUP_ICON_SHAPES へ足す。
 */
import { createIconFromShape } from '../common/icons.js';
import { ICON_ERROR, ICON_LIGHT_MODE, ICON_DARK_MODE } from '../common/icon-shapes.js';

/** popup が使う図形。キーは common/icons.js の createIcon に渡す名前と同じ。 */
export const POPUP_ICON_SHAPES = Object.freeze({
	error: ICON_ERROR,
	lightMode: ICON_LIGHT_MODE,
	darkMode: ICON_DARK_MODE,
});

/**
 * アイコンの svg 要素を名前から作る。common/icons.js の createIcon と同じ振る舞いで、引ける名前は POPUP_ICON_SHAPES だけ。
 * @param {Document} doc 対象のドキュメント
 * @param {string} name POPUP_ICON_SHAPES のキー
 * @returns {SVGSVGElement} svg 要素。表に無い名前なら中身が空の svg (warn で名前を残す)
 */
export function createIcon(doc, name) {
	return createIconFromShape(doc, Object.hasOwn(POPUP_ICON_SHAPES, name) ? POPUP_ICON_SHAPES[name] : undefined, name);
}
