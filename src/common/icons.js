/**
 * アイコンを DOM へ起こす役。図形データは icon-shapes.js が持つ。
 * アイコンは常に装飾で、意味は親のテキストか aria-label が持つ。
 */
import { ICON_SHAPES } from './icon-shapes.js';
import { warn } from './log.js';

/** SVG の名前空間。createElementNS に渡す。 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 図形が見つからないときに使う空の描画領域。 */
const EMPTY_VIEW_BOX = '0 0 24 24';

/**
 * アイコンの svg 要素を作る。
 * viewBox は図形ごとの値をそのまま使う。(Material Symbols は 0 -960 960 960)
 * 返す svg は寸法を持たない。大きさは使う側の CSS が決める約束。
 * 中身は innerHTML を使わず createElementNS で組み立てる。
 * (innerHTML はホストページが Trusted Types を強制すると例外になり、アイコンが空になる)
 * @param {Document} doc 対象のドキュメント
 * @param {string} name ICON_SHAPES のキー
 * @returns {SVGSVGElement} svg 要素。未知の名前なら中身が空の svg (warn で名前を残す)
 */
export function createIcon(doc, name) {
	const shape = ICON_SHAPES[name];
	// 文字列参照のタイプミスに気づけるよう警告だけ出す。UI 構築は止めない
	if (!shape) warn('知らないアイコン名です', name);
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('viewBox', shape?.viewBox ?? EMPTY_VIEW_BOX);
	svg.setAttribute('fill', 'currentColor');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	// 図形は生成物の定数だけなので通常は失敗しない。万一どこかで投げても UI 構築を途中で落とさず、
	// 空のアイコンで続行する (ボタンの aria-label / title が意味を補う)
	try {
		const children = createShapeElements(doc, shape?.elements ?? []);
		// 全部作れてから入れる。途中で失敗したときに図形の一部だけが描かれるのを避ける
		svg.append(...children);
	} catch (error) {
		warn('アイコンを描けませんでした', name, error);
	}
	return svg;
}

/**
 * 図形データから svg の子要素を作る。
 * 子要素も SVG の名前空間で作る。(createElement で作ると HTML の要素になり、何も描かれない)
 * @param {Document} doc 対象のドキュメント
 * @param {ReadonlyArray<{tag: string, attrs: Record<string, string>}>} elements 要素名と属性の組
 * @returns {SVGElement[]} 作った要素。まだどこにも入っていない
 */
function createShapeElements(doc, elements) {
	return elements.map(({ tag, attrs }) => {
		const element = doc.createElementNS(SVG_NS, tag);
		for (const [attribute, value] of Object.entries(attrs)) element.setAttribute(attribute, value);
		return element;
	});
}
