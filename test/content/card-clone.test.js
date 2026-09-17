import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	captureTemplates, findBadge, findOverlayLabels, buildCard, paintHeart, heartPaths, hexToRgb, isBookmarkedFill,
} from '../../src/content/card-clone.js';
import {
	XV_CARD_ATTR, XV_BOOKMARK_ID_ATTR, BOOKMARKED_FILL, TAB_SKIP_MARK_ATTR, TAB_SKIP_LABEL_ATTR,
} from '../../src/common/constants.js';
import { el, makeCard, makeGrid, fakeComputedStyle } from '../helpers/card.js';

/**
 * ハートの path が持つ inline の fill を集める。書いていなければ undefined。
 * @param {object} card カード (li)
 * @returns {(string|undefined)[]} path ごとの inline の fill
 */
function inlineHeartFills(card) {
	return heartPaths(card).map((path) => path.style.values.fill);
}

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
	assert.equal(templates.single.querySelector('img').getAttribute('data-xv-src-id'), null);
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
	// 未ブックマークの色は雛形 (本体の CSS) に任せるので、雛形は色を持ち歩かない
	assert.equal('heartFills' in templates, false);
});

test('ブックマーク済みの判定は BOOKMARKED_FILL から導く', () => {
	// hex と rgb() の 2 通りを別々の定数で持つと、片方だけ変えたときに判定が壊れる
	assert.equal(hexToRgb(BOOKMARKED_FILL), 'rgb(255, 64, 96)');
	assert.equal(hexToRgb('not a color'), null);
	assert.equal(isBookmarkedFill('rgb(255, 64, 96)'), true);
	assert.equal(isBookmarkedFill(BOOKMARKED_FILL), true);
	assert.equal(isBookmarkedFill('rgb(31, 31, 31)'), false);
	assert.equal(isBookmarkedFill(undefined), false);
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

test('ハートを持つカードがあれば、ハート無しのカードは雛形にしない', () => {
	// bookmark_button が無いとハートの色を採れず、未ブックマーク判定ができない。
	// 読み込み途中などで 1 枚だけ欠けたカードを掴むと、継ぎ足し分だけブックマークできなくなる
	const { ul } = makeGrid([makeCardWithoutHeart('1'), makeCard({ id: '2' })]);
	const templates = captureTemplates(ul, { computedStyle: fakeComputedStyle });
	assert.equal(templates.single.querySelector('[data-ga4-label="bookmark_button"]') === null, false);
});

test('どのカードにもハートが無ければ、ハート無しのまま雛形にする', () => {
	// 自分のユーザーページ。pixiv が自分の作品にブックマークボタンを描かない (SITE_SPEC §4)。
	// ここで諦めると自分のページだけ無限スクロールが起動しない
	const { ul } = makeGrid([makeCardWithoutHeart('1'), makeCardWithoutHeart('2')]);
	const templates = captureTemplates(ul, { computedStyle: fakeComputedStyle });
	assert.notEqual(templates, null);
	assert.equal(templates.single.querySelector('[data-ga4-label="bookmark_button"]'), null);
	assert.equal(templates.multi, null);
});

test('ハート無しでも複数枚のカードは multi に採る', () => {
	const { ul } = makeGrid([makeCard({ id: '1', heart: false }), makeCard({ id: '2', pages: 3, heart: false })]);
	const templates = captureTemplates(ul, { computedStyle: fakeComputedStyle });
	assert.equal(templates.multi.querySelector('span').textContent, '3');
	assert.equal(templates.single.querySelector('span'), null);
});

test('ハート無しのカードを雛形にしても組み立てられる', () => {
	// ログイン済みでブックマーク済みの作品でも、塗る先が無いだけで落ちてはいけない
	const { ul } = makeGrid([makeCard({ id: '1', heart: false })]);
	const templates = captureTemplates(ul, { computedStyle: fakeComputedStyle });
	const card = buildCard(templates, work({ bookmarkData: { id: '5' } }), { loggedIn: true });
	assert.notEqual(card, null);
	assert.equal(card.querySelector('[data-ga4-label="bookmark_button"]'), null);
	// 塗れないので ID も書かない。押せるハートが無い以上、持っていても使い道がない
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), null);
});

test('自分が継ぎ足したカードしか無ければ null', () => {
	// XV_CARD_ATTR 付きのカードを雛形にすると、劣化コピーが連鎖する事故になる
	const card = makeCard({ id: '1' });
	card.setAttribute(XV_CARD_ATTR, '1');
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
	assert.equal(thumb.hasAttribute(TAB_SKIP_LABEL_ATTR), false);
});

test('雛形に残った tabindex="-1" と目印を外す', () => {
	// 雛形は tab-skip が当てた後に採られることが多い。ビュワーを切った後 (tab-skip が居ない) に
	// 組んだカードだけ Tab 順が違ってはいけない。当て直しは生きている tab-skip に任せる
	const source = makeCard({ id: '1', tabSkipped: true });
	const title = source.querySelectorAll('a[href^="/artworks/"]').find((link) => !link.querySelector('img'));
	title.setAttribute('tabindex', '-1');
	title.setAttribute(TAB_SKIP_MARK_ATTR, '');
	const templates = capture([source]);
	const card = buildCard(templates, work(), { loggedIn: true });
	for (const el of [card.querySelector('button'), ...card.querySelectorAll('a[href^="/artworks/"]')]) {
		assert.equal(el.getAttribute('tabindex'), null, `${el.tag} に tabindex が残っている`);
		assert.equal(el.hasAttribute(TAB_SKIP_MARK_ATTR), false, `${el.tag} に目印が残っている`);
	}
});

test('pixiv 側が持たせた tabindex (目印なし) はそのまま残す', () => {
	const source = makeCard({ id: '1', tabSkipped: false });
	source.querySelector('button').setAttribute('tabindex', '0');
	const templates = capture([source]);
	const card = buildCard(templates, work(), { loggedIn: true });
	assert.equal(card.querySelector('button').getAttribute('tabindex'), '0');
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
	const templates = { single: makeCard({ id: '1', pages: 2 }), multi: null };
	const card = buildCard(templates, work({ pageCount: 1 }), { loggedIn: true });
	assert.equal(card.querySelector('span'), null);
});

test('ブックマーク済みならハートを ff4060 にする', () => {
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work({ bookmarkData: { id: '555', private: false } }), { loggedIn: true });
	assert.deepEqual(inlineHeartFills(card), [BOOKMARKED_FILL, BOOKMARKED_FILL]);
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), '555');
});

test('未ブックマークならハートに色を書かない (本体の CSS に任せる)', () => {
	// 未ブックマークの色はテーマで変わる (SITE_SPEC §3)。inline で焼き付けると
	// テーマを切り替えたときに継ぎ足したカードだけ前の色で残る
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work(), { loggedIn: true });
	assert.deepEqual(inlineHeartFills(card), [undefined, undefined]);
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), null);
});

test('ブックマーク済みの色は paintHeart(card, false) で外れて本体の CSS に戻る', () => {
	// 取り消しのときは雛形の色を書き戻すのではなく inline を外す
	const templates = capture([makeCard({ id: '1' })]);
	const card = buildCard(templates, work({ bookmarkData: { id: '555', private: false } }), { loggedIn: true });
	paintHeart(card, false);
	assert.deepEqual(inlineHeartFills(card), ['', '']);
});

test('複数枚バッジのアイコンまで塗らない', () => {
	// カード全体から path を集めると、バッジのアイコンまでハートの色になる
	const templates = capture([makeCard({ id: '1' }), makeCard({ id: '2', pages: 2 })]);
	const card = buildCard(templates, work({ pageCount: 3, bookmarkData: { id: '1', private: false } }), { loggedIn: true });
	const badgePaths = card.querySelectorAll('path').filter((path) => !heartPaths(card).includes(path));
	assert.equal(badgePaths.length, 1);
	assert.equal(badgePaths[0].style.values.fill, undefined);
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
	assert.equal(card.getAttribute(XV_CARD_ATTR), '777');
});

test('paintHeart は色の控えが無くても落ちない', () => {
	// export された公開関数なので、呼び出し側が渡し忘れても落とさない
	const card = makeCard({ id: '1' });
	assert.doesNotThrow(() => paintHeart(card, true));
	assert.deepEqual(heartPaths(card).map((path) => path.style.values.fill), [BOOKMARKED_FILL, BOOKMARKED_FILL]);
	assert.doesNotThrow(() => paintHeart(card, false));
	assert.deepEqual(heartPaths(card).map((path) => path.style.values.fill), ['', '']);
});

test('雛形のラベルは継ぎ足したカードに引き継がない', () => {
	// R-18 / 非公開 は雛形になった作品のもの。残すと別の作品に他人のラベルが付く。
	// 作品ごとに付け直す手当ては無いので、出さないほうを選ぶ (SPEC §16)
	const { ul } = makeGrid([makeCard({ id: '1', label: '非公開' })]);
	const templates = captureTemplates(ul, { computedStyle: fakeComputedStyle });
	const card = buildCard(templates, work(), { loggedIn: true });
	assert.equal(card.textContent.includes('非公開'), false);
});

test('ラベルを落としても複数枚バッジは残る', () => {
	// ラベルとバッジは同じ層に並ぶ。まとめて消すとページ数まで消える
	const { ul } = makeGrid([makeCard({ id: '1', pages: 4, label: 'R-18' })]);
	const templates = captureTemplates(ul, { computedStyle: fakeComputedStyle });
	const card = buildCard(templates, work({ pageCount: 3 }), { loggedIn: true });
	assert.equal(card.textContent.includes('R-18'), false);
	assert.equal(findBadge(card).querySelector('span').textContent, '3');
});

test('findOverlayLabels はバッジも画像もラベルとして拾わない', () => {
	const withAll = makeCard({ id: '1', pages: 2, label: 'R-18' });
	assert.deepEqual(findOverlayLabels(withAll).map((node) => node.textContent), ['R-18']);
	// ラベルの無いカードでは 1 つも拾わない (空のオーバーレイ層や img を掴まない)
	assert.deepEqual(findOverlayLabels(makeCard({ id: '2', pages: 2 })), []);
});
