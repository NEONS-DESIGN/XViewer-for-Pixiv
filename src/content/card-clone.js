/**
 * pixiv 本体の作品カードを雛形にして、別の作品のカードを組む。
 *
 * 自分でカードを描かずに本体の li を cloneNode するのは、styled-components の
 * ハッシュクラスを再現せずに見た目を完全に一致させるため。掴んでよいのは
 * 計測用の data 属性と位置関係だけで、クラス名は読まない。
 */
import {
	ARTWORK_LINK_SELECTOR,
	THUMB_LINK_SELECTOR,
	BOOKMARK_BUTTON_SELECTOR,
	BOOKMARKED_FILL,
	XV_CARD_ATTR,
	XV_BOOKMARK_ID_ATTR,
	CARD_SELECTOR,
} from '../common/constants.js';
import { warn } from '../common/log.js';
import { setImageSrcAttribute } from '../common/image-source.js';
import { currentLocalePrefix } from '../common/locale.js';
import { safeCdnUrl, artworkPath } from '../pixiv/endpoints.js';
import { stripTabSkipMarks } from './tab-skip.js';

/** 数字だけの文字列。複数枚バッジの枚数の span を見分ける */
const DIGITS_PATTERN = /^\d+$/;

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
 * ブックマーク済みの色として扱う表記。hex は定数、rgb() はそこから導く。(片方だけ変わる事故を防ぐ)
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
 * 未ブックマークの色はテーマで変わるので、値を持ち歩かず CSS に任せる。
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
 * バッジはサムネリンクのオーバーレイ層にだけ現れる数字。
 * @param {object} card カード (li)
 * @returns {object|null} バッジのノード。無ければ null
 */
export function findBadge(card) {
	const thumb = card.querySelector(THUMB_LINK_SELECTOR);
	if (!thumb) return null;
	for (const span of [...thumb.querySelectorAll('span')]) {
		if (!DIGITS_PATTERN.test((span.textContent ?? '').trim())) continue;
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
 * 雛形から、雛形にした作品に紐づく印を落とす。雛形を作った時点で 1 回だけ呼ぶ。
 * 落とすのは tab-skip の印 (tabindex="-1" / aria-label) と、オーバーレイ層のラベル (R-18 / 非公開)。
 * どちらも作品ごとに付け直す手当てが無く、残すと継ぎ足した全カードに同じものが付く。
 * @param {object} template 雛形 (cloneNode 済みの li)
 * @returns {object} 同じ雛形
 */
function cleanTemplate(template) {
	stripTabSkipMarks(template);
	for (const label of findOverlayLabels(template)) label.remove();
	return template;
}

/**
 * カードの並びから single / multi の 2 枚を選ぶ。
 * accept を満たすカードだけを見て、単枚とバッジ付きが揃った時点で切り上げる。
 * (getComputedStyle を並び全部に呼ばないため)
 * 返す雛形は cleanTemplate 済みで、single は必ずバッジを持たない。
 * @param {object[]} cards 候補のカード (li)
 * @param {(card: object) => boolean} accept 雛形にしてよいか
 * @returns {{single: object, multi: object|null}|null} 雛形。採れなければ null
 */
function pickTemplates(cards, accept) {
	let single = null;
	let multi = null;
	for (const card of cards) {
		if (!accept(card)) continue;
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
	if (!single) return null;
	return { single: cleanTemplate(single), multi: multi ? cleanTemplate(multi) : null };
}

/**
 * サムネのオーバーレイ層にある、雛形の作品に紐づいたラベルを集める。
 *
 * 「R-18」「非公開」のような表示で、**複数枚バッジと同じ層に、バッジより前に並ぶ**。
 * 雛形を cloneNode するとこれも付いてくるので、雛形を作るときに落とす。(cleanTemplate)
 * 残すと別の作品に他人のラベルが付く。
 *
 * 掴み方は findBadge と同じく「祖先の祖先が thumb」。そこから画像の入れ物 (文字を持たない) と
 * バッジ (数字だけ) を除いたものがラベルになる。クラス名は読まない。
 * @param {object} card カード (li)
 * @returns {object[]} ラベルのノード
 */
export function findOverlayLabels(card) {
	const thumb = card.querySelector(THUMB_LINK_SELECTOR);
	if (!thumb) return [];
	const badge = findBadge(card);
	const labels = [];
	for (const node of [...thumb.querySelectorAll('div')]) {
		if (node === badge) continue;
		if (node.parentElement?.parentElement !== thumb) continue;
		const text = (node.textContent ?? '').trim();
		// 文字を持たない層は画像の入れ物。数字だけのものは findBadge が拾えなかったバッジ
		if (text === '' || DIGITS_PATTERN.test(text)) continue;
		labels.push(node);
	}
	return labels;
}

/**
 * ページ上のカードから雛形を採る。
 *
 * 自分が継ぎ足したカード (XV_CARD_ATTR 付き) と、画像が読み込まれていないカード (figure のまま) は
 * 最初に落とす。前者は劣化コピーが連鎖し、後者は img ごと欠ける。
 *
 * 残りからは **未ブックマークのハートを持つカードを優先する**。ブックマーク済みのカードは
 * ハートが塗られた見た目になるので雛形にしない。
 * 1 枚もハートが無ければ (自分のユーザーページ)、ハート無しのカードで組む。
 * 返す雛形は、雛形にした作品の印 (tab-skip の印とラベル) を落としてある。
 * @param {object} ul グリッドの ul
 * @param {{computedStyle?: Function}} [deps] テスト用の依存
 * @returns {{single: object, multi: object|null}|null} 雛形。採れなければ null
 */
export function captureTemplates(ul, deps = {}) {
	const computed = deps.computedStyle ?? ((node) => globalThis.getComputedStyle(node));
	try {
		const cards = [...ul.querySelectorAll(CARD_SELECTOR)]
			.filter((card) => !card.hasAttribute(XV_CARD_ATTR) && card.querySelector('img'));
		const plain = pickTemplates(cards, (card) => {
			const paths = heartPaths(card);
			return paths.length > 0 && !paths.some((path) => isBookmarkedFill(computed(path).fill));
		});
		return plain ?? pickTemplates(cards, (card) => heartPaths(card).length === 0);
	} catch (error) {
		// 雛形が採れないだけ。継ぎ足しを諦めてページャを残す
		warn('card template capture failed', error);
		return null;
	}
}

/**
 * 1 作品ぶんのカードを組む。
 *
 * 画像 URL が pximg でなければカードを作らない。API の値をそのまま img へ渡さないため。
 * templates は captureTemplates の戻り値を渡す。(印を落とし済みで、single はバッジを持たない前提で組む)
 * @param {{single: object, multi: object|null}} templates 雛形
 * @param {object} work 作品サマリ (profile/illusts の 1 件)
 * @param {{loggedIn: boolean, localePrefix?: string}} deps セッションの状態。
 *   `localePrefix` は href に付ける表示言語の接頭辞 (`/en` か空文字)。
 *   省略したら今見ているページから読む
 * @returns {object|null} li。作れなければ null
 */
export function buildCard(templates, work, deps) {
	const src = safeCdnUrl(work?.url);
	if (!src) return null;
	try {
		const useMulti = Number(work.pageCount) > 1 && Boolean(templates.multi);
		const card = (useMulti ? templates.multi : templates.single).cloneNode(true);

		// 雛形は pixiv 本体のカードなので、href の接頭辞も今の表示言語に揃える
		const localePrefix = deps.localePrefix ?? currentLocalePrefix();
		const links = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)];
		for (const link of links) {
			link.setAttribute('href', artworkPath(work.id, localePrefix));
			if (link.getAttribute('data-gtm-value')) link.setAttribute('data-gtm-value', String(work.id));
			if (link.getAttribute('data-gtm-user-id')) link.setAttribute('data-gtm-user-id', String(work.userId));
		}

		const img = card.querySelector('img');
		if (img) {
			// 48 枚を一度に足すので、読み込みはブラウザの遅延読み込みに任せる。
			// src を入れる前に付けないと、対応しないブラウザで一括読み込みが走ってしまう
			img.setAttribute('loading', 'lazy');
			img.setAttribute('alt', String(work.alt ?? work.title ?? ''));
			setImageSrcAttribute(img, src);
		}

		const titleLink = links.find((link) => !link.querySelector('img'));
		if (titleLink) titleLink.textContent = String(work.title ?? '');

		if (useMulti) {
			const spans = findBadge(card)?.querySelectorAll('span') ?? [];
			const count = [...spans].find((span) => DIGITS_PATTERN.test((span.textContent ?? '').trim()));
			if (count) count.textContent = String(work.pageCount);
		}

		// 自分のユーザーページでは雛形にハートが無い。塗る先も外す先も無いだけで、
		// カードは組める。ブックマーク ID も書かない (押せるハートが無いので使い道がない)
		const heartBox = card.querySelector(BOOKMARK_BUTTON_SELECTOR);
		if (!deps.loggedIn) heartBox?.remove();
		else if (heartBox && work.bookmarkData) {
			// 未ブックマークのときは何も書かない。雛形は未ブックマークのカードなので本体の CSS がそのまま効く
			paintHeart(card, true);
			card.setAttribute(XV_BOOKMARK_ID_ATTR, String(work.bookmarkData.id));
		}

		card.setAttribute(XV_CARD_ATTR, String(work.id));
		return card;
	} catch (error) {
		// 1 枚作れなくても他のカードは出す
		warn('card build failed', error);
		return null;
	}
}
