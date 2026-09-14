/**
 * pixiv 本体の作品カードを雛形にして、別の作品のカードを組む。
 *
 * 自分でカードを描かずに本体の li を cloneNode するのは、styled-components の
 * ハッシュクラスを再現せずに見た目を完全に一致させるため。掴んでよいのは
 * 計測用の data 属性と位置関係だけで、クラス名は読まない (SPEC §2)。
 */
import {
	THUMB_LINK_SELECTOR,
	BOOKMARK_BUTTON_SELECTOR,
	BOOKMARKED_FILL,
} from '../common/constants.js';

/** ブックマーク済みの色。雛形がこの色ならブックマーク済みのカードなので雛形にしない。 */
const BOOKMARKED_FILL_RGB = 'rgb(255, 64, 96)';

/**
 * 要素の親を返す。本物の DOM は parentElement、テスト用の偽物は parent を持つ。
 * @param {object} node 要素
 * @returns {object|null} 親要素。無ければ null
 */
function parentOf(node) {
	return node.parentElement ?? node.parent ?? null;
}

/**
 * カードの中のハートの path を集める。
 * @param {object} card カード (li)
 * @returns {object[]} path
 */
function heartPaths(card) {
	const box = card.querySelector(BOOKMARK_BUTTON_SELECTOR);
	return box ? [...box.querySelectorAll('path')] : [];
}

/**
 * カードが複数枚バッジを持つか。
 * バッジはサムネリンクのオーバーレイ層にだけ現れる数字 (SITE_SPEC §3)。
 * @param {object} card カード (li)
 * @returns {object|null} バッジのノード。無ければ null
 */
export function findBadge(card) {
	const thumb = card.querySelector(THUMB_LINK_SELECTOR);
	if (!thumb) return null;
	for (const span of [...thumb.querySelectorAll('span')]) {
		if (!/^\d+$/.test((span.textContent ?? '').trim())) continue;
		// span からオーバーレイ層の直下まで遡る。そのノードごと足したり外したりする
		let node = span;
		while (parentOf(node) && parentOf(parentOf(node)) !== thumb) node = parentOf(node);
		return parentOf(node) === thumb ? null : node;
	}
	return null;
}

/**
 * ページ上のカードから雛形を採る。
 *
 * 画像が読み込まれていないカード (figure のまま) と、ブックマーク済みのカードは
 * 雛形にしない。前者は img ごと欠け、後者は未ブックマークの色が採れない。
 * @param {object} ul グリッドの ul
 * @param {{computedStyle?: Function}} [deps] テスト用の依存
 * @returns {{single: object, multi: object|null, heartFills: string[]}|null} 雛形。採れなければ null
 */
export function captureTemplates(ul, deps = {}) {
	const computed = deps.computedStyle ?? ((node) => globalThis.getComputedStyle(node));
	let single = null;
	let multi = null;
	let heartFills = [];
	try {
		for (const card of [...ul.querySelectorAll('li')]) {
			if (!card.querySelector('img')) continue;
			const paths = heartPaths(card);
			const fills = paths.map((path) => computed(path).fill);
			if (fills.some((fill) => fill === BOOKMARKED_FILL_RGB || fill === BOOKMARKED_FILL)) continue;
			const badge = findBadge(card);
			if (badge && !multi) multi = card.cloneNode(true);
			if (!badge && !single) single = card.cloneNode(true);
			if (heartFills.length === 0) heartFills = fills;
			if (single && multi) break;
		}
		// 全作品が複数枚の作者では single が採れない。multi からバッジを外して使う
		if (!single && multi) {
			single = multi.cloneNode(true);
			findBadge(single)?.remove();
		}
		return single ? { single, multi, heartFills } : null;
	} catch (error) {
		// 雛形が採れないだけ。継ぎ足しを諦めてページャを残す
		console.warn('[GridViewer] card template capture failed', error);
		return null;
	}
}
