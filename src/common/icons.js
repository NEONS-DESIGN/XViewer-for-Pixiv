/**
 * アイコンを DOM へ起こす役。図形データは icon-shapes.js が持つ。
 * アイコンは常に装飾で、意味は親のテキストか aria-label が持つ (UI_DESIGN_KIT §5)。
 */
import { ICON_SHAPES } from './icon-shapes.js';

/** SVG の名前空間。createElementNS に渡す。 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 図形が見つからないときに使う空の描画領域。 */
const EMPTY_VIEW_BOX = '0 0 24 24';

/**
 * アイコンの svg 要素を作る。
 * viewBox は図形ごとの値をそのまま使う (Material Symbols は 0 -960 960 960)。
 * 返す svg は寸法を持たない。大きさは使う側の CSS が決める約束。
 * @param {Document} doc 対象のドキュメント
 * @param {string} name ICON_SHAPES のキー
 * @returns {SVGSVGElement} svg 要素。未知の名前なら中身が空の svg
 */
export function createIcon(doc, name) {
	const shape = ICON_SHAPES[name];
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', shape?.viewBox ?? EMPTY_VIEW_BOX);
	svg.setAttribute('fill', 'currentColor');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	// 中身は定数だけで外部入力は混ざらない。ホストページが Trusted Types を強制していると
	// innerHTML 代入自体が TypeError を投げるため守る。失敗しても空のアイコンで続行し、
	// UI 構築を途中で落とさない (ボタンの aria-label / title が意味を補う)
	try {
		svg.innerHTML = shape?.markup ?? '';
	} catch {
		// 空のまま返す
	}
	return svg;
}
