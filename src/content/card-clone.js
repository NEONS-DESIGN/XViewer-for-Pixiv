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
	GV_BOOKMARK_ID_ATTR,
	CARD_SELECTOR,
	TAB_SKIP_MARK_ATTR,
	TAB_SKIP_LABEL_ATTR,
} from '../common/constants.js';
import { warn } from '../common/log.js';
import { safeCdnUrl, artworkPath } from '../pixiv/endpoints.js';

/**
 * #rrggbb を getComputedStyle が返す rgb(r, g, b) の形にする。
 * @param {string} hex 6 桁の hex 表記
 * @returns {string|null} rgb() 表記。hex として読めなければ null
 */
export function hexToRgb(hex) {
	const parsed = /^#([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
	if (!parsed) return null;
	const value = Number.parseInt(parsed[1], 16);
	return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

/**
 * ブックマーク済みの色として扱う表記。hex は定数、rgb() はそこから導く (片方だけ変わる事故を防ぐ)。
 * @type {Set<string>}
 */
const BOOKMARKED_FILLS = new Set([BOOKMARKED_FILL, hexToRgb(BOOKMARKED_FILL)].filter(Boolean).map((fill) => fill.toLowerCase()));

/**
 * computed の fill がブックマーク済みの色か。
 * @param {unknown} fill getComputedStyle(path).fill
 * @returns {boolean} ブックマーク済みの色なら true
 */
export function isBookmarkedFill(fill) {
	return BOOKMARKED_FILLS.has(String(fill ?? '').trim().toLowerCase());
}

/**
 * カードの中のハートの path を集める。
 * 集める先はブックマークボタンの中だけ。カード全体から集めると複数枚バッジのアイコンまで混ざる。
 * @param {object} card カード (li)
 * @returns {object[]} path
 */
export function heartPaths(card) {
	const box = card.querySelector(BOOKMARK_BUTTON_SELECTOR);
	return box ? [...box.querySelectorAll('path')] : [];
}

/**
 * カードのハートを塗る。
 * ブックマーク済みなら BOOKMARKED_FILL を inline で書き、未ブックマークなら inline を外して本体の CSS に戻す。
 * 未ブックマークの色はテーマで変わる (SITE_SPEC §3) ので、値を持ち歩かず CSS に任せる。
 * カードを組むときと、継ぎ足したカードのハートを押されたときの両方から呼ぶ。
 * @param {object} card カード (li)
 * @param {boolean} bookmarked ブックマーク済みの色にするか
 * @returns {void}
 */
export function paintHeart(card, bookmarked) {
	for (const path of heartPaths(card)) {
		// 空文字を書くと inline の宣言が消える (removeProperty と同じ)
		path.style.setProperty('fill', bookmarked ? BOOKMARKED_FILL : '');
	}
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
			const parent = node.parentElement ?? null;
			const grandparent = parent?.parentElement ?? null;
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
 * 1 番目は劣化コピーの連鎖、2 番目は img ごと欠ける、3・4 番目はハートが未ブックマークの見た目にならない。
 * @param {object} ul グリッドの ul
 * @param {{computedStyle?: Function}} [deps] テスト用の依存
 * @returns {{single: object, multi: object|null}|null} 雛形。採れなければ null
 */
export function captureTemplates(ul, deps = {}) {
	const computed = deps.computedStyle ?? ((node) => globalThis.getComputedStyle(node));
	let single = null;
	let multi = null;
	try {
		for (const card of [...ul.querySelectorAll(CARD_SELECTOR)]) {
			// 自分が継ぎ足したカードを雛形にすると、劣化コピーが連鎖する (原因が分かりにくい事故)
			if (card.hasAttribute(GV_CARD_ATTR)) continue;
			if (!card.querySelector('img')) continue;
			const paths = heartPaths(card);
			// ハートが見つからないカードは未ブックマークの見た目を確かめられないので雛形にしない
			if (paths.length === 0) continue;
			if (paths.some((path) => isBookmarkedFill(computed(path).fill))) continue;
			const badge = findBadge(card);
			if (badge && !multi) multi = card.cloneNode(true);
			if (!badge && !single) single = card.cloneNode(true);
			if (single && multi) break;
		}
		// 全作品が複数枚の作者では single が採れない。multi からバッジを外して使う
		if (!single && multi) {
			single = multi.cloneNode(true);
			findBadge(single)?.remove();
		}
		return single ? { single, multi } : null;
	} catch (error) {
		// 雛形が採れないだけ。継ぎ足しを諦めてページャを残す
		warn('card template capture failed', error);
		return null;
	}
}

/**
 * tab-skip.js が雛形へ書き込んだ印を落とす。
 * tabindex="-1" は残すとビュワーを切った後に組んだカードだけ Tab 順が違ってしまい、
 * aria-label は残すと読み上げが全部同じ作品名になる。tab-skip が生きていれば次の当て直しで付け直される。
 * @param {object} card 組み立て中のカード (li)
 * @returns {void}
 */
function stripTabSkipMarks(card) {
	for (const el of card.querySelectorAll(`[${TAB_SKIP_MARK_ATTR}]`)) {
		el.removeAttribute('tabindex');
		el.removeAttribute(TAB_SKIP_MARK_ATTR);
	}
	for (const el of card.querySelectorAll(`[${TAB_SKIP_LABEL_ATTR}]`)) {
		el.removeAttribute('aria-label');
		el.removeAttribute(TAB_SKIP_LABEL_ATTR);
	}
}

/**
 * 1 作品ぶんのカードを組む。
 *
 * 画像 URL が pximg でなければカードを作らない。API の値をそのまま img へ渡さないため (SPEC §9.2)。
 * @param {{single: object, multi: object|null}} templates 雛形
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

		const links = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)];
		for (const link of links) {
			link.setAttribute('href', artworkPath(work.id));
			if (link.getAttribute('data-gtm-value')) link.setAttribute('data-gtm-value', String(work.id));
			if (link.getAttribute('data-gtm-user-id')) link.setAttribute('data-gtm-user-id', String(work.userId));
		}
		stripTabSkipMarks(card);

		const img = card.querySelector('img');
		if (img) {
			img.setAttribute('src', src);
			img.setAttribute('alt', String(work.alt ?? work.title ?? ''));
			// 48 枚を一度に足すので、読み込みはブラウザの遅延読み込みに任せる
			img.setAttribute('loading', 'lazy');
		}

		const titleLink = links.find((link) => !link.querySelector('img'));
		if (titleLink) titleLink.textContent = String(work.title ?? '');

		const badge = findBadge(card);
		if (badge && !wantsBadge) badge.remove();
		else if (badge && wantsBadge) {
			const count = [...badge.querySelectorAll('span')].find((span) => /^\d+$/.test((span.textContent ?? '').trim()));
			if (count) count.textContent = String(work.pageCount);
		}

		const heartBox = card.querySelector(BOOKMARK_BUTTON_SELECTOR);
		if (!deps.loggedIn) heartBox?.remove();
		else if (heartBox && work.bookmarkData) {
			// 未ブックマークのときは何も書かない。雛形は未ブックマークのカードなので本体の CSS がそのまま効く
			paintHeart(card, true);
			card.setAttribute(GV_BOOKMARK_ID_ATTR, String(work.bookmarkData.id));
		}

		card.setAttribute(GV_CARD_ATTR, String(work.id));
		return card;
	} catch (error) {
		// 1 枚作れなくても他のカードは出す
		warn('card build failed', error);
		return null;
	}
}
