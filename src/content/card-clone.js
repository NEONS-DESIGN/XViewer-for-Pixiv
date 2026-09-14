/**
 * pixiv 本体の作品カードを雛形にして、別の作品のカードを組む。
 *
 * 自分でカードを描かずに本体の li を cloneNode するのは、styled-components の
 * ハッシュクラスを再現せずに見た目を完全に一致させるため。掴んでよいのは
 * 計測用の data 属性と位置関係だけで、クラス名は読まない (SPEC §2)。
 */
import {
	ARTWORK_LINK_SELECTOR,
	THUMB_LINK_SELECTOR,
	BOOKMARK_BUTTON_SELECTOR,
	BOOKMARKED_FILL,
	GV_CARD_ATTR,
} from '../common/constants.js';
import { safeCdnUrl, artworkPath } from '../pixiv/endpoints.js';

/** ブックマーク済みの色。雛形がこの色ならブックマーク済みのカードなので雛形にしない。 */
const BOOKMARKED_FILL_RGB = 'rgb(255, 64, 96)';

/**
 * 要素の親を返す。本物の DOM は parentElement、テスト用の偽物は parent を持つ。
 * @param {object} node 要素
 * @returns {object|null} 親要素。無ければ null
 */
export function parentOf(node) {
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
		// span からオーバーレイ層の直下 (祖先の祖先が thumb) まで遡る。そのノードごと足したり外したりする。
		// 想定より浅い構造で thumb 自身や外まで出てしまう場合は、安全側 (バッジ無し) に倒して null を返す。
		let node = span;
		while (node !== thumb) {
			const parent = parentOf(node);
			const grandparent = parent ? parentOf(parent) : null;
			if (grandparent === thumb) return node;
			if (!parent || parent === thumb) return null;
			node = parent;
		}
		return null;
	}
	return null;
}

/**
 * ページ上のカードから雛形を採る。
 *
 * 自分が継ぎ足したカード (GV_CARD_ATTR 付き)、画像が読み込まれていないカード (figure のまま)、
 * ハートが見つからないカード、ブックマーク済みのカードは雛形にしない。
 * 1 番目は劣化コピーの連鎖、2 番目は img ごと欠ける、3・4 番目は未ブックマークの色が採れない。
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
			// 自分が継ぎ足したカードを雛形にすると、劣化コピーが連鎖する (原因が分かりにくい事故)
			if (card.hasAttribute(GV_CARD_ATTR)) continue;
			if (!card.querySelector('img')) continue;
			const paths = heartPaths(card);
			const fills = paths.map((path) => computed(path).fill);
			// ハートが見つからないカードは未ブックマークの色が採れないので雛形にしない
			if (fills.length === 0) continue;
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

/** 自分が付けたブックマーク ID の置き場。削除に要る。 */
export const GV_BOOKMARK_ID_ATTR = 'data-gv-bookmark-id';

/**
 * 1 作品ぶんのカードを組む。
 *
 * 画像 URL が pximg でなければカードを作らない。API の値をそのまま img へ渡さないため (SPEC §9.2)。
 * @param {{single: object, multi: object|null, heartFills: string[]}} templates 雛形
 * @param {object} work 作品サマリ (profile/illusts の 1 件)
 * @param {{loggedIn: boolean}} deps セッションの状態
 * @returns {object|null} li。作れなければ null
 */
export function buildCard(templates, work, deps) {
	const src = safeCdnUrl(work?.url);
	if (!src) return null;
	try {
		const wantsBadge = Number(work.pageCount) > 1;
		const base = wantsBadge && templates.multi ? templates.multi : templates.single;
		const card = base.cloneNode(true);

		for (const link of card.querySelectorAll(ARTWORK_LINK_SELECTOR)) {
			link.setAttribute('href', artworkPath(work.id));
			if (link.getAttribute('data-gtm-value')) link.setAttribute('data-gtm-value', String(work.id));
			if (link.getAttribute('data-gtm-user-id')) link.setAttribute('data-gtm-user-id', String(work.userId));
			// tab-skip.js が雛形へ書き込んだ前の作品名を消す。残すと読み上げが全部同じ名前になる
			if (link.hasAttribute('data-pm-label')) {
				link.removeAttribute('aria-label');
				link.removeAttribute('data-pm-label');
			}
		}

		const img = card.querySelector('img');
		if (img) {
			img.setAttribute('src', src);
			img.setAttribute('alt', String(work.alt ?? work.title ?? ''));
			// 48 枚を一度に足すので、読み込みはブラウザの遅延読み込みに任せる
			img.setAttribute('loading', 'lazy');
		}

		const titleLink = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)].find((link) => !link.querySelector('img'));
		if (titleLink) titleLink.textContent = String(work.title ?? '');

		const badge = findBadge(card);
		if (badge && !wantsBadge) badge.remove();
		else if (badge && wantsBadge) {
			const count = [...badge.querySelectorAll('span')].find((span) => /^\d+$/.test((span.textContent ?? '').trim()));
			if (count) count.textContent = String(work.pageCount);
		}

		const heartBox = card.querySelector(BOOKMARK_BUTTON_SELECTOR);
		if (!deps.loggedIn) heartBox?.remove();
		else if (heartBox) {
			const bookmarked = Boolean(work.bookmarkData);
			const paths = [...heartBox.querySelectorAll('path')];
			paths.forEach((path, index) => {
				path.style.setProperty('fill', bookmarked ? BOOKMARKED_FILL : templates.heartFills[index] ?? '');
			});
			if (bookmarked) card.setAttribute(GV_BOOKMARK_ID_ATTR, String(work.bookmarkData.id));
		}

		card.setAttribute(GV_CARD_ATTR, String(work.id));
		return card;
	} catch (error) {
		// 1 枚作れなくても他のカードは出す
		console.warn('[GridViewer] card build failed', error);
		return null;
	}
}
