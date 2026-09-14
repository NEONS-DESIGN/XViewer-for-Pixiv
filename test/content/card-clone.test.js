import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureTemplates, findBadge, buildCard, paintHeart, heartPaths } from '../../src/content/card-clone.js';
import { GV_CARD_ATTR, BOOKMARKED_FILL } from '../../src/common/constants.js';
import { el, makeCard, makeGrid, fakeComputedStyle } from '../helpers/card.js';

/**
 * 作品サマリの代わり。
 * @param {object} [over] 上書きしたい値
 * @returns {object} 作品サマリ
 */
function work(over = {}) {
	return {
		id: '777', title: '新しい作品', pageCount: 1, illustType: 0, xRestrict: 0,
		url: 'https://i.pximg.net/c/250x250_80_a2/img-master/777_p0_square1200.jpg',
		alt: '#オリジナル 新しい作品 - 作者のイラスト',
		userId: '9', bookmarkData: null, ...over,
	};
}

/**
 * 雛形を採る。getComputedStyle は偽物を渡す。
 * @param {object[]} cards カード
 * @returns {object|null} 雛形
 */
function capture(cards) {
	const { ul } = makeGrid(cards);
	return captureTemplates(ul, { computedStyle: fakeComputedStyle });
}

/**
 * ブックマークボタンを持たないカードを組む。ハートの色が採れない状況を作るため。
 * @param {string} id 作品 id
 * @returns {object} li の代わり
 */
function makeCardWithoutHeart(id) {
	const li = el('li');
	const outer = li.appendChild(el('div'));
	const thumbBox = outer.appendChild(el('div'));
	const sized = thumbBox.appendChild(el('div', { width: '184', height: '184' }));
	const thumb = sized.appendChild(el('a', {
		href: `/artworks/${id}`,
		'data-ga4-label': 'thumbnail_link',
		'data-gtm-value': id,
	}));
	const imgBox = thumb.appendChild(el('div')).appendChild(el('div', { radius: '4' }));
	imgBox.appendChild(el('img', { src: `https://i.pximg.net/${id}.jpg` }));
	return li;
}

/**
 * node が ancestor の子孫かどうか (自分自身は含めない)。
 * @param {object} node 調べたい要素
 * @param {object} ancestor 祖先の候補
 * @returns {boolean} 子孫なら true
 */
function isDescendantOf(node, ancestor) {
	let current = node.parent;
	while (current) {
		if (current === ancestor) return true;
		current = current.parent;
	}
	return false;
}

test('画像が読み込まれたカードだけを雛形にする', () => {
	// figure のままのカードを雛形にすると、継ぎ足したカードに img が無くなる
	const templates = capture([makeCard({ id: '1', loaded: false }), makeCard({ id: '2', loaded: true })]);
	assert.notEqual(templates, null);
	assert.equal(templates.single.querySelector('img').getAttribute('data-gv-src-id'), null);
	assert.equal(templates.single.querySelector('a[data-ga4-label="thumbnail_link"]').getAttribute('data-gtm-value'), '2');
});

test('画像が 1 枚も読み込まれていなければ null', () => {
	// 継ぎ足しを始めてはいけない状況。呼び出し側はページャを隠さない
	assert.equal(capture([makeCard({ loaded: false })]), null);
});

test('ブックマーク済みのカードは雛形にしない', () => {
	// 済みのカードから採ると、未ブックマークの色が #ff4060 になってしまう
	const templates = capture([makeCard({ id: '1', bookmarked: true }), makeCard({ id: '2' })]);
	assert.equal(templates.single.querySelector('a[data-ga4-label="thumbnail_link"]').getAttribute('data-gtm-value'), '2');
	assert.deepEqual(templates.heartFills, ['rgb(31, 31, 31)', 'rgb(245, 245, 245)']);
});

test('ブックマーク済みしか無ければ null', () => {
	assert.equal(capture([makeCard({ bookmarked: true })]), null);
});

test('複数枚のカードがあれば multi に採る', () => {
	const templates = capture([makeCard({ id: '1' }), makeCard({ id: '2', pages: 3 })]);
	assert.notEqual(templates.multi, null);
	assert.equal(templates.multi.querySelector('span').textContent, '3');
	assert.equal(templates.single.querySelector('span'), null);
});

test('複数枚のカードが無ければ multi は null', () => {
	const templates = capture([makeCard({ id: '1' })]);
	assert.equal(templates.multi, null);
});

test('複数枚しか無ければ single はバッジを外したものになる', () => {
	// 全作品が複数枚の作者。バッジ付きの雛形で単枚を出すと数字が嘘になる
	const templates = capture([makeCard({ id: '1', pages: 2 })]);
	assert.equal(templates.single.querySelector('span'), null);
	assert.notEqual(templates.multi, null);
});

test('雛形は元のカードから切り離されている', () => {
	// 雛形を書き換えてページ上のカードが変わってはいけない
	const card = makeCard({ id: '1' });
	const templates = capture([card]);
	templates.single.setAttribute('data-touched', '1');
	assert.equal(card.getAttribute('data-touched'), null);
});

test('ハートが見つからないカードは雛形にしない', () => {
	// bookmark_button が無いとハートの色を採れず、未ブックマーク判定ができない
	const { ul } = makeGrid([makeCardWithoutHeart('1')]);
	assert.equal(captureTemplates(ul, { computedStyle: fakeComputedStyle }), null);
});

test('自分が継ぎ足したカードしか無ければ null', () => {
	// GV_CARD_ATTR 付きのカードを雛形にすると、劣化コピーが連鎖する事故になる
	const card = makeCard({ id: '1' });
	card.setAttribute(GV_CARD_ATTR, '1');
	assert.equal(capture([card]), null);
});

test('findBadge は想定より浅い構造でも thumb の外の無関係なノードを返さない', () => {
	// オーバーレイ層を挟まず、span が thumb の直接の子である極端に浅い構造
	const li = el('li');
	const wrap = li.appendChild(el('div'));
	const sized = wrap.appendChild(el('div', { width: '184', height: '184' }));
	const thumb = sized.appendChild(el('a', {
		href: '/artworks/1',
		'data-ga4-label': 'thumbnail_link',
		'data-gtm-value': '1',
	}));
	thumb.appendChild(el('img', { src: 'https://i.pximg.net/1.jpg' }));
	const span = thumb.appendChild(el('span'));
	span.textContent = '3';

	const result = findBadge(li);
	// null か、thumb 自身か、thumb の子孫のどれかでなければならない (thumb の外は不可)
	assert.ok(result === null || result === thumb || isDescendantOf(result, thumb));
});

test('リンクと ID を差し替える', () => {
	const templates = capture([makeCard({ id: '1', userId: '9' })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	for (const link of card.querySelectorAll('a[href^="/artworks/"]')) {
		assert.equal(link.getAttribute('href'), '/artworks/777');
	}
	assert.equal(card.querySelector('a[data-ga4-label="thumbnail_link"]').getAttribute('data-gtm-value'), '777');
});

test('画像の src と alt を差し替え、遅延読み込みにする', () => {
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	const img = card.querySelector('img');
	assert.match(img.getAttribute('src'), /777_p0_square1200\.jpg$/);
	assert.equal(img.getAttribute('alt'), '#オリジナル 新しい作品 - 作者のイラスト');
	assert.equal(img.getAttribute('loading'), 'lazy');
});

test('pximg 以外の画像 URL は捨ててカードを作らない', () => {
	// API が返した URL をそのまま img へ渡さない (SPEC §9.2)
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work({ url: 'https://evil.example.com/x.jpg' }), { loggedIn: true });
	assert.equal(card, null);
});

test('タイトルを差し替える', () => {
	const templates = capture([makeCard({ id: '1', title: '古い作品' })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	const links = card.querySelectorAll('a[href^="/artworks/"]');
	const titleLink = links.find((link) => !link.querySelector('img'));
	assert.equal(titleLink.textContent, '新しい作品');
});

test('雛形に残った aria-label を消す', () => {
	// tab-skip.js が雛形へ前の作品名を書き込んでいる。消さないと読み上げが全部同じ名前になる
	const templates = capture([makeCard({ id: '1', title: '古い作品', tabSkipped: true })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	const thumb = card.querySelector('a[data-ga4-label="thumbnail_link"]');
	assert.equal(thumb.getAttribute('aria-label'), null);
	assert.equal(thumb.getAttribute('data-pm-label'), null);
});

test('複数枚の作品はバッジ付きの雛形を使い、数字を差し替える', () => {
	const templates = capture([makeCard({ id: '1' }), makeCard({ id: '2', pages: 2 })]);
	const card = buildCard(templates, work({ pageCount: 5 }), { loggedIn: true });
	assert.equal(card.querySelector('span').textContent, '5');
});

test('複数枚の雛形が無ければバッジ無しで出す', () => {
	// 実害はバッジが出ないことだけ。カードを落とすよりは出す
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work({ pageCount: 5 }), { loggedIn: true });
	assert.notEqual(card, null);
	assert.equal(card.querySelector('span'), null);
});

test('単枚の作品はバッジを外す', () => {
	const templates = capture([makeCard({ id: '1', pages: 2 })]);
	const card = buildCard(templates, work({ pageCount: 1 }), { loggedIn: true });
	assert.equal(card.querySelector('span'), null);
});

test('single にバッジ付きの雛形が渡されても単枚の作品はバッジを外す', () => {
	// captureTemplates が返す single は常にバッジ無しなので、上のテストだけでは
	// buildCard 自身のバッジ除去 (badge && !wantsBadge) を一度も通らない。
	// buildCard は templates を引数で受け取る公開関数なので、この入力も契約上ありえる
	const templates = { single: makeCard({ id: '1', pages: 2 }), multi: null, heartFills: ['rgb(31, 31, 31)', 'rgb(245, 245, 245)'] };
	const card = buildCard(templates, work({ pageCount: 1 }), { loggedIn: true });
	assert.equal(card.querySelector('span'), null);
});

test('ブックマーク済みならハートを ff4060 にする', () => {
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work({ bookmarkData: { id: '555', private: false } }), { loggedIn: true });
	for (const path of card.querySelectorAll('path')) {
		assert.equal(path.style.values.fill, '#ff4060');
	}
	assert.equal(card.getAttribute('data-gv-bookmark-id'), '555');
});

test('未ブックマークなら雛形から採った色に戻す', () => {
	// ライトテーマでは色が違う。固定値を書かない
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	const fills = card.querySelectorAll('path').map((path) => path.style.values.fill);
	assert.deepEqual(fills, ['rgb(31, 31, 31)', 'rgb(245, 245, 245)']);
	assert.equal(card.getAttribute('data-gv-bookmark-id'), null);
});

test('未ログインならハートごと消す', () => {
	// 押せないボタンを出さない (actions-bar.js と同じ判断)
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work(), { loggedIn: false });
	assert.equal(card.querySelector('[data-ga4-label="bookmark_button"]'), null);
});

test('自分が作ったカードには目印が付く', () => {
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	assert.equal(card.getAttribute(GV_CARD_ATTR), '777');
});

test('paintHeart は色の控えが無くても落ちない', () => {
	// export された公開関数なので、呼び出し側が渡し忘れても落とさない
	const card = makeCard({ id: '1' });
	assert.doesNotThrow(() => paintHeart(card, true));
	assert.deepEqual(heartPaths(card).map((path) => path.style.values.fill), [BOOKMARKED_FILL, BOOKMARKED_FILL]);
	assert.doesNotThrow(() => paintHeart(card, false));
	assert.deepEqual(heartPaths(card).map((path) => path.style.values.fill), ['', '']);
});
