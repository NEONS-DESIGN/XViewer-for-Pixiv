import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachInfiniteScroll, SENTINEL_TEXT } from '../../src/content/infinite.js';
import {
	INFINITE_SCROLL, GV_CARD_ATTR, SENTINEL_ATTR, SENTINEL_MARGIN_PX,
	BOOKMARK_BUTTON_SELECTOR, BOOKMARKED_FILL,
} from '../../src/common/constants.js';
import { makeCard, makeGrid, el, fakeComputedStyle } from '../helpers/card.js';

/**
 * IntersectionObserver の偽物。trigger() で「見えた」を起こす。
 * @returns {{create: Function, trigger: Function, state: object}} 生成関数と操作
 */
function fakeObserver() {
	const state = { observed: [], disconnected: 0, callback: null, init: null, inits: [], created: 0 };
	const create = (callback, init) => {
		state.callback = callback;
		state.init = init;
		state.inits.push(init);
		state.created += 1;
		// 作り直したら監視対象も仕切り直す
		state.observed = [];
		return {
			observe(node) { state.observed.push(node); },
			unobserve(node) { state.observed = state.observed.filter((one) => one !== node); },
			disconnect() { state.disconnected += 1; },
		};
	};
	const trigger = () => state.callback?.([{ isIntersecting: true, target: state.observed[0] }]);
	return { create, trigger, state };
}

/**
 * 1 ページ 2 件のページ供給の偽物。
 * @param {number} pages ページ数
 * @param {{bookmarked?: boolean}} [options] 作品の状態
 * @returns {{source: object, loaded: number[]}} 供給と読んだページ番号
 */
function fakeSource(pages, options = {}) {
	const loaded = [];
	return {
		loaded,
		source: {
			async pageCount() { return pages; },
			async loadPage(page) {
				loaded.push(page);
				if (page > pages) return [];
				// 2 件目は複数枚。バッジ付きのカード (雛形が multi) も継ぎ足しに混ぜる
				return [1, 2].map((n) => ({
					id: `${page}${n}`, title: `作品${page}-${n}`, pageCount: n, userId: '9',
					url: `https://i.pximg.net/${page}${n}.jpg`, alt: `作品${page}-${n}`,
					bookmarkData: options.bookmarked ? { id: `b${page}${n}`, private: false } : null,
				}));
			},
		},
	};
}

/**
 * 継ぎ足したカードだけを拾う。
 * @param {object} ul グリッドの ul
 * @returns {object[]} カード (li)
 */
function addedCards(ul) {
	return [...ul.querySelectorAll('li')].filter((li) => li.getAttribute(GV_CARD_ATTR));
}

/**
 * ページに入った sentinel を拾う。
 * @param {object} wrap ul の親
 * @returns {object|null} sentinel
 */
function sentinelOf(wrap) {
	return wrap.querySelector(`[${SENTINEL_ATTR}]`);
}

/**
 * sentinel に出ている文言。
 * @param {object} wrap ul の親
 * @returns {string} 文言。何も出ていなければ空文字
 */
function sentinelMessage(wrap) {
	return sentinelOf(wrap)?.querySelector('p')?.textContent ?? '';
}

/**
 * sentinel に出ている再試行ボタン。
 * @param {object} wrap ul の親
 * @returns {object|null} button。出ていなければ null
 */
function retryButton(wrap) {
	return sentinelOf(wrap)?.querySelector('button') ?? null;
}

/**
 * 偽のドキュメント。
 * ハートの押下を doc で受けるので、購読と ownerDocument の行き先も持たせる。
 * @param {object} wrap ul の親
 * @returns {object} doc の代わり
 */
function fakeDoc(wrap) {
	const doc = el('#document');
	doc.createElement = (tag) => el(tag);
	// readSession() が引く。__NEXT_DATA__ は無い = 未ログイン扱い (トークンは空)
	doc.getElementById = () => null;
	doc.head = el('head');
	doc.body = wrap;
	// 出来事が wrap から doc まで上がれるようにする
	wrap.ownerDocument = doc;
	return doc;
}

/**
 * 継ぎ足しを組み立てる。
 * @param {{pages?: number, mode?: string, startPage?: number, trailing?: boolean,
 *   bookmarked?: boolean, actions?: object}} [options] 上書き
 * @returns {{ul: object, wrap: object, doc: object, handle: object, loaded: number[],
 *   observer: object, trailing: object|null}} 材料一式
 */
function setup(options = {}) {
	const { ul, wrap } = makeGrid([makeCard({ id: '1' }), makeCard({ id: '2', pages: 2 })]);
	// pixiv は ul の後ろにページャを置く。sentinel はそれより前 (= ul の直後) に入らないといけない
	const trailing = options.trailing ? wrap.appendChild(el('nav')) : null;
	const { source, loaded } = fakeSource(options.pages ?? 3, { bookmarked: options.bookmarked === true });
	const observer = fakeObserver();
	const doc = fakeDoc(wrap);
	const handle = attachInfiniteScroll(doc, {
		ul,
		source,
		mode: options.mode ?? INFINITE_SCROLL.ON_REACH,
		loggedIn: true,
		startPage: options.startPage ?? 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle, actions: options.actions },
	});
	return { ul, wrap, doc, handle, loaded, observer, trailing };
}

test('組み立てただけでは読み込まない', () => {
	// 下まで来ていないのに通信しない
	const { loaded } = setup();
	assert.deepEqual(loaded, []);
});

test('sentinel は ul の直後に置かれ、監視される', () => {
	const { ul, wrap, observer } = setup();
	const sentinels = [...wrap.querySelectorAll(`[${SENTINEL_ATTR}]`)];
	assert.equal(sentinels.length, 1);
	assert.equal(ul.nextSibling, sentinels[0], 'sentinel が ul の直後に無い');
	assert.equal([...ul.querySelectorAll(`[${SENTINEL_ATTR}]`)].length, 0, 'ul の中に入れてはいけない');
	assert.deepEqual(observer.state.observed, sentinels);
});

test('ul の後ろにページャがあっても sentinel はその前 (ul の直後) に入る', () => {
	// 親の末尾に置くとページャの下に落ち、rootMargin が 0 の prefetch で発火が遅れる
	const { ul, wrap, trailing } = setup({ trailing: true, mode: INFINITE_SCROLL.PREFETCH });
	const sentinel = sentinelOf(wrap);
	assert.equal(ul.nextSibling, sentinel, 'sentinel が ul の直後に無い');
	assert.deepEqual(wrap.children, [ul, sentinel, trailing], '並びが ul -> sentinel -> ページャ になっていない');
});

test('何もしていないときの sentinel は空', () => {
	const { wrap } = setup();
	assert.equal(sentinelOf(wrap).children.length, 0);
	assert.equal(sentinelMessage(wrap), '');
});

test('sentinel のスタイルは 1 度だけ入る', () => {
	const { ul, wrap } = makeGrid([makeCard({ id: '1' })]);
	const doc = fakeDoc(wrap);
	const observer = fakeObserver();
	const { source } = fakeSource(3);
	const attach = () => attachInfiniteScroll(doc, {
		ul, source, mode: INFINITE_SCROLL.ON_REACH, loggedIn: true, startPage: 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle },
	});
	attach().dispose();
	attach().dispose();
	assert.equal([...doc.head.querySelectorAll('style')].length, 1);
});

test('下まで来たら次のページを継ぎ足す', async () => {
	const { ul, loaded, observer } = setup();
	await observer.trigger();
	assert.deepEqual(loaded, [2], '2 ページ目を読んでいない');
	const added = addedCards(ul);
	assert.equal(added.length, 2);
	assert.equal(added[0].getAttribute(GV_CARD_ATTR), '21');
});

test('読み込み中に下まで来ても二重に読まない', async () => {
	const { loaded, observer } = setup();
	const first = observer.trigger();
	observer.trigger();
	await first;
	assert.deepEqual(loaded, [2]);
});

test('prefetch は 1 ページ描いた時点で次を取っておく', async () => {
	// 下に着く前に次が手元にある状態にする
	const { loaded, observer } = setup({ mode: INFINITE_SCROLL.PREFETCH });
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3], '先読みが走っていない');
});

test('prefetch で持っている分は読み直さずに並べる', async () => {
	const { ul, loaded, observer } = setup({ mode: INFINITE_SCROLL.PREFETCH, pages: 5 });
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3]);
	await observer.trigger();
	// 3 ページ目は手元にあるので読み直さず、4 ページ目を先読みするだけ
	assert.deepEqual(loaded, [2, 3, 4]);
	assert.equal(addedCards(ul).length, 4);
});

test('onReach は先読みしない', async () => {
	const { loaded, observer } = setup({ mode: INFINITE_SCROLL.ON_REACH });
	await observer.trigger();
	assert.deepEqual(loaded, [2]);
});

test('?p= の途中から始めたらその次のページを読む', async () => {
	// /users/1/illustrations?p=3 を直接開いた場合
	const { loaded, observer } = setup({ startPage: 3, pages: 5 });
	await observer.trigger();
	assert.deepEqual(loaded, [4]);
});

test('読み切ったら監視をやめる', async () => {
	const { observer } = setup({ pages: 2 });
	await observer.trigger();
	assert.equal(observer.state.disconnected, 1, '全部読んだのに監視が続いている');
});

test('読み切った後に見えても読みに行かない', async () => {
	const { loaded, observer } = setup({ pages: 2 });
	await observer.trigger();
	await observer.trigger();
	assert.deepEqual(loaded, [2]);
});

test('空のページが返ったらそこで終わる', async () => {
	// pageCount が実際より多い場合の保険
	const { observer, loaded } = setup({ startPage: 3, pages: 3 });
	await observer.trigger();
	assert.deepEqual(loaded, [4]);
	assert.equal(observer.state.disconnected, 1);
});

/**
 * 1 回目だけ失敗する供給で継ぎ足しを組み立てる。
 * @returns {{ul: object, wrap: object, handle: object, observer: object}} 材料一式
 */
function setupFlaky() {
	const { ul, wrap } = makeGrid([makeCard({ id: '1' })]);
	const observer = fakeObserver();
	let calls = 0;
	const source = {
		async pageCount() { return 3; },
		async loadPage() {
			calls += 1;
			if (calls === 1) throw new Error('boom');
			return [{ id: '99', title: '作品', pageCount: 1, userId: '9', url: 'https://i.pximg.net/99.jpg', alt: '作品', bookmarkData: null }];
		},
	};
	const handle = attachInfiniteScroll(fakeDoc(wrap), {
		ul, source, mode: INFINITE_SCROLL.ON_REACH, loggedIn: true, startPage: 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle },
	});
	return { ul, wrap, handle, observer };
}

test('失敗しても落ちず、もう一度見えたら読み直す', async () => {
	const { ul, observer } = setupFlaky();
	await observer.trigger();
	await observer.trigger();
	assert.equal(addedCards(ul).length, 1);
});

test('失敗したら sentinel に文言と再試行ボタンが出る', async () => {
	const { wrap, observer } = setupFlaky();
	await observer.trigger();
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.ERROR);
	// 失敗の通知は role="alert" の段落 (UI_DESIGN_KIT §6)
	assert.equal(sentinelOf(wrap).querySelector('p').getAttribute('role'), 'alert');
	const button = retryButton(wrap);
	assert.ok(button, '再試行ボタンが出ていない');
	assert.equal(button.textContent, SENTINEL_TEXT.RETRY);
	assert.equal(button.getAttribute('type'), 'button');
});

test('再試行ボタンを押すと読み直し、成功したら表示が消える', async () => {
	// IntersectionObserver は交差が変わったときしか鳴らない。
	// 下端に留まったままの人はこのボタンでしか読み直せない
	const { ul, wrap, observer } = setupFlaky();
	await observer.trigger();
	assert.equal(addedCards(ul).length, 0);
	await retryButton(wrap).click();
	assert.equal(addedCards(ul).length, 1, '再試行でカードが増えていない');
	assert.equal(retryButton(wrap), null, '成功したのに再試行ボタンが残っている');
	assert.equal(sentinelMessage(wrap), '');
});

test('読み込み中は読み込み中と出る', async () => {
	let release = () => {};
	const gate = new Promise((resolve) => { release = resolve; });
	const { ul, wrap } = makeGrid([makeCard({ id: '1' })]);
	const observer = fakeObserver();
	const source = {
		async pageCount() { return 3; },
		async loadPage() {
			await gate;
			return [{ id: '99', title: '作品', pageCount: 1, userId: '9', url: 'https://i.pximg.net/99.jpg', alt: '作品', bookmarkData: null }];
		},
	};
	attachInfiniteScroll(fakeDoc(wrap), {
		ul, source, mode: INFINITE_SCROLL.ON_REACH, loggedIn: true, startPage: 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle },
	});
	const pending = observer.trigger();
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.LOADING);
	// 読み上げにも伝わる形にする
	assert.equal(sentinelOf(wrap).querySelector('p').getAttribute('role'), 'status');
	assert.equal(retryButton(wrap), null, '読み込み中に再試行ボタンを出さない');
	release();
	await pending;
	assert.equal(sentinelMessage(wrap), '', '終わったのに表示が残っている');
});

test('読み切ったら読み終わりと出て、再試行ボタンは出ない', async () => {
	const { wrap, observer } = setup({ pages: 2 });
	await observer.trigger();
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.DONE);
	assert.equal(sentinelOf(wrap).querySelector('p').getAttribute('role'), 'status');
	assert.equal(retryButton(wrap), null);
});

test('読み切った後の再試行ボタンは無いので読み直せない', async () => {
	const { wrap, loaded, observer } = setup({ pages: 2 });
	await observer.trigger();
	assert.equal(retryButton(wrap), null);
	assert.deepEqual(loaded, [2]);
});

test('雛形が採れなければ何もしない', () => {
	// 画像が 1 枚も読み込まれていないページ
	const { ul, wrap } = makeGrid([makeCard({ id: '1', loaded: false })]);
	const observer = fakeObserver();
	const { source, loaded } = fakeSource(3);
	const doc = { createElement: (tag) => el(tag), body: wrap };
	const handle = attachInfiniteScroll(doc, {
		ul, source, mode: INFINITE_SCROLL.ON_REACH, loggedIn: true, startPage: 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle },
	});
	assert.equal(handle.isActive(), false);
	assert.deepEqual(loaded, []);
	assert.equal([...wrap.querySelectorAll(`[${SENTINEL_ATTR}]`)].length, 0, 'sentinel を置いてはいけない');
	assert.doesNotThrow(() => handle.dispose());
	assert.doesNotThrow(() => handle.setMode(INFINITE_SCROLL.PREFETCH));
});

test('雛形が採れていれば動いている', () => {
	const { handle } = setup();
	assert.equal(handle.isActive(), true);
});

test('dispose で継ぎ足したカードと sentinel が消える', async () => {
	const { ul, wrap, handle, observer } = setup();
	await observer.trigger();
	handle.dispose();
	assert.equal(addedCards(ul).length, 0);
	assert.equal([...wrap.querySelectorAll(`[${SENTINEL_ATTR}]`)].length, 0);
	assert.equal(observer.state.disconnected, 1);
	assert.equal(handle.isActive(), false, 'dispose 後は動いていない');
});

test('observe() が投げても observer は切られ、sentinel も残らない', () => {
	const { ul, wrap } = makeGrid([makeCard({ id: '1' })]);
	let disconnected = 0;
	const createObserver = () => ({
		observe() { throw new Error('observe failed'); },
		unobserve() {},
		disconnect() { disconnected += 1; },
	});
	const { source } = fakeSource(3);
	const handle = attachInfiniteScroll(fakeDoc(wrap), {
		ul, source, mode: INFINITE_SCROLL.ON_REACH, loggedIn: true, startPage: 1,
		deps: { createObserver, computedStyle: fakeComputedStyle },
	});
	assert.equal(disconnected, 1, '投げた observer が切られずに残っている');
	assert.equal(handle.isActive(), false);
	assert.equal(sentinelOf(wrap), null, 'sentinel が残っている');
});

test('sentinel の撤去が失敗しても継ぎ足したカードは消える', async () => {
	// 撤去し損ねたカードが残るのは「オフにしたのに元へ戻らない」状態なので避ける
	const { ul, wrap, handle, observer } = setup();
	await observer.trigger();
	assert.equal(addedCards(ul).length, 2);
	sentinelOf(wrap).remove = () => { throw new Error('remove failed'); };
	handle.dispose();
	assert.equal(addedCards(ul).length, 0, 'sentinel の撤去に巻き込まれてカードが残っている');
});

test('dispose 後は見えても読まない', async () => {
	const { handle, loaded, observer } = setup();
	handle.dispose();
	await observer.trigger();
	assert.deepEqual(loaded, []);
});

test('dispose は本体のカードを消さない', async () => {
	const { ul, handle, observer } = setup();
	await observer.trigger();
	handle.dispose();
	assert.equal([...ul.querySelectorAll('li')].length, 2, '本体の 2 枚まで消している');
});

test('onReach は sentinel を手前から見張る', () => {
	const { observer } = setup({ mode: INFINITE_SCROLL.ON_REACH });
	assert.equal(observer.state.init.rootMargin, `${SENTINEL_MARGIN_PX}px`);
});

test('prefetch は手元にあるので sentinel が見えてから動く', () => {
	const { observer } = setup({ mode: INFINITE_SCROLL.PREFETCH });
	assert.equal(observer.state.init.rootMargin, '0px');
});

test('setMode でモードを変えたら rootMargin を変えて監視し直す', () => {
	const { wrap, handle, observer } = setup({ mode: INFINITE_SCROLL.ON_REACH });
	handle.setMode(INFINITE_SCROLL.PREFETCH);
	assert.equal(observer.state.created, 2, 'observer を作り直していない');
	assert.equal(observer.state.disconnected, 1, '前の observer を切っていない');
	assert.deepEqual(observer.state.inits.map((init) => init.rootMargin), [`${SENTINEL_MARGIN_PX}px`, '0px']);
	const sentinels = [...wrap.querySelectorAll(`[${SENTINEL_ATTR}]`)];
	assert.deepEqual(observer.state.observed, sentinels, 'sentinel を監視し直していない');
});

test('setMode でも継ぎ足したカードは残る', async () => {
	// 設定を切り替えただけで読み進めた場所を失わせない
	const { ul, handle, observer } = setup({ pages: 5 });
	await observer.trigger();
	assert.equal(addedCards(ul).length, 2);
	handle.setMode(INFINITE_SCROLL.PREFETCH);
	assert.equal(addedCards(ul).length, 2, '読み進めた分が消えている');
	assert.equal(handle.isActive(), true);
});

test('setMode で作り直した observer でも継ぎ足せる', async () => {
	const { ul, loaded, handle, observer } = setup({ pages: 5 });
	handle.setMode(INFINITE_SCROLL.PREFETCH);
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3]);
	assert.equal(addedCards(ul).length, 2);
});

test('同じモードを渡されたら何もしない', () => {
	const { handle, observer } = setup({ mode: INFINITE_SCROLL.ON_REACH });
	handle.setMode(INFINITE_SCROLL.ON_REACH);
	assert.equal(observer.state.created, 1);
	assert.equal(observer.state.disconnected, 0);
});

test('読み切った後に setMode しても監視は再開しない', async () => {
	const { handle, loaded, observer } = setup({ pages: 2 });
	await observer.trigger();
	assert.equal(observer.state.disconnected, 1);
	handle.setMode(INFINITE_SCROLL.PREFETCH);
	assert.equal(observer.state.created, 1, '読み切ったのに監視し直している');
	await observer.trigger();
	assert.deepEqual(loaded, [2]);
});

test('dispose 後の setMode は監視を作り直さない', () => {
	const { handle, observer } = setup();
	handle.dispose();
	handle.setMode(INFINITE_SCROLL.PREFETCH);
	assert.equal(observer.state.created, 1);
	assert.equal(observer.state.disconnected, 1);
});

test('setMode で先読みの持ち分を捨てる', async () => {
	const { loaded, observer, handle } = setup({ mode: INFINITE_SCROLL.PREFETCH, pages: 5 });
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3]);
	handle.setMode(INFINITE_SCROLL.ON_REACH);
	await observer.trigger();
	// 捨てた分を読み直す。先読みはもうしない
	assert.deepEqual(loaded, [2, 3, 3]);
});

/**
 * 継ぎ足したカードを 1 枚拾う。
 * @param {object} ul グリッドの ul
 * @param {string} id 作品 ID
 * @returns {object} カード (li)
 */
function addedCard(ul, id) {
	return [...ul.querySelectorAll('li')].find((li) => li.getAttribute(GV_CARD_ATTR) === id);
}

/**
 * ハートの塗り。複数枚バッジの path と混ざらないよう、ボタンの中だけを見る。
 * @param {object} card カード (li)
 * @returns {(string|undefined)[]} path ごとの fill
 */
function heartFillsOf(card) {
	const box = card.querySelector(BOOKMARK_BUTTON_SELECTOR);
	return [...box.querySelectorAll('path')].map((path) => path.style.values.fill);
}

/**
 * ハートを押す。押されたのは button という出来事にする。
 * @param {object} card カード (li)
 * @param {{shiftKey?: boolean}} [options] 押し方
 * @returns {Promise<void>|undefined} 送信の待ち
 */
function pressHeart(card, options = {}) {
	const button = card.querySelector('button');
	return button.dispatch('click', {
		target: button, shiftKey: options.shiftKey === true, preventDefault() {}, stopPropagation() {},
	});
}

/**
 * ブックマークの更新系の偽物。呼ばれた内容を calls へ積む。
 * @param {string[][]} calls 呼ばれた内容の置き場
 * @returns {{addBookmark: Function, deleteBookmark: Function}} 更新系
 */
function fakeActions(calls) {
	return {
		async addBookmark(id, isPrivate) { calls.push(['add', id, isPrivate]); return '999'; },
		async deleteBookmark(id) { calls.push(['delete', id]); },
	};
}

test('継ぎ足したカードのハートを押すとブックマークされる', async () => {
	const calls = [];
	const { ul, observer } = setup({
		actions: {
			async addBookmark(id, isPrivate) { calls.push(['add', id, isPrivate]); return '999'; },
			async deleteBookmark(id) { calls.push(['delete', id]); },
		},
	});
	await observer.trigger();
	const card = ul.querySelectorAll('li').find((li) => li.getAttribute(GV_CARD_ATTR) === '21');
	await card.querySelector('button').dispatch('click', { target: card.querySelector('button'), shiftKey: false, preventDefault() {}, stopPropagation() {} });
	assert.deepEqual(calls, [['add', '21', false]]);
	assert.equal(card.querySelectorAll('path')[0].style.values.fill, '#ff4060');
	assert.equal(card.getAttribute('data-gv-bookmark-id'), '999');
});

test('Shift を押しながらだと非公開ブックマークになる', async () => {
	const calls = [];
	const { ul, observer } = setup({
		actions: { async addBookmark(id, isPrivate) { calls.push(isPrivate); return '999'; }, async deleteBookmark() {} },
	});
	await observer.trigger();
	const card = ul.querySelectorAll('li').find((li) => li.getAttribute(GV_CARD_ATTR) === '21');
	const button = card.querySelector('button');
	await button.dispatch('click', { target: button, shiftKey: true, preventDefault() {}, stopPropagation() {} });
	assert.deepEqual(calls, [true]);
});

test('ブックマーク済みをもう一度押すと外れる', async () => {
	const calls = [];
	const { ul, observer } = setup({
		bookmarked: true,
		actions: { async addBookmark() { return '1'; }, async deleteBookmark(id) { calls.push(id); } },
	});
	await observer.trigger();
	const card = ul.querySelectorAll('li').find((li) => li.getAttribute(GV_CARD_ATTR) === '21');
	const button = card.querySelector('button');
	await button.dispatch('click', { target: button, shiftKey: false, preventDefault() {}, stopPropagation() {} });
	assert.deepEqual(calls, ['b21'], 'bookmarkData.id で消していない');
	assert.equal(card.getAttribute('data-gv-bookmark-id'), null);
});

test('失敗したらハートの色を戻す', async () => {
	const { ul, observer } = setup({
		actions: { async addBookmark() { throw new Error('boom'); }, async deleteBookmark() {} },
	});
	await observer.trigger();
	const card = ul.querySelectorAll('li').find((li) => li.getAttribute(GV_CARD_ATTR) === '21');
	const button = card.querySelector('button');
	await button.dispatch('click', { target: button, shiftKey: false, preventDefault() {}, stopPropagation() {} });
	assert.equal(card.querySelectorAll('path')[0].style.values.fill, 'rgb(31, 31, 31)');
	assert.equal(card.getAttribute('data-gv-bookmark-id'), null);
});

test('本体のカードのハートには触らない', async () => {
	// 本体のハートは React が持っている。preventDefault すると本来の動作を壊す
	const calls = [];
	let prevented = 0;
	const { ul, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	const original = ul.querySelectorAll('li').find((li) => !li.getAttribute(GV_CARD_ATTR));
	const button = original.querySelector('button');
	await button.dispatch('click', { target: button, shiftKey: false, preventDefault() { prevented += 1; }, stopPropagation() {} });
	assert.deepEqual(calls, [], '本体のカードのハートを自前で処理している');
	assert.equal(prevented, 0, '本体のハートの本来の動作を止めている');
});

test('dispose でハートの購読も外れる', async () => {
	const calls = [];
	const { ul, handle, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	const card = ul.querySelectorAll('li').find((li) => li.getAttribute(GV_CARD_ATTR) === '21');
	handle.dispose();
	// 撤去済みのカードでも、購読が残っていれば押下を拾ってしまう。戻して確かめる
	ul.appendChild(card);
	const button = card.querySelector('button');
	await button.dispatch('click', { target: button, shiftKey: false, preventDefault() {}, stopPropagation() {} });
	assert.deepEqual(calls, [], 'dispose 後もハートの押下を拾っている');
});

test('削除に失敗したら赤とブックマーク ID を戻す', async () => {
	// 失敗時の戻しは追加と削除で戻す先が違う。削除の側も見る
	const { ul, observer } = setup({
		bookmarked: true,
		actions: {
			async addBookmark() { return '1'; },
			async deleteBookmark() { throw new Error('boom'); },
		},
	});
	await observer.trigger();
	const card = addedCard(ul, '21');
	await pressHeart(card);
	assert.deepEqual(heartFillsOf(card), [BOOKMARKED_FILL, BOOKMARKED_FILL], '外れたままの色で残っている');
	assert.equal(card.getAttribute('data-gv-bookmark-id'), 'b21', '消せていないのにブックマーク ID を落としている');
});

test('返事を待っている間の二度押しは捨てる', async () => {
	// data-gv-bookmark-id は返事が返るまで付かない。素直に書くと連打で余分なブックマークが残る
	let release = () => {};
	const gate = new Promise((resolve) => { release = resolve; });
	const calls = [];
	const { ul, observer } = setup({
		actions: {
			async addBookmark(id) { calls.push(id); await gate; return '999'; },
			async deleteBookmark() {},
		},
	});
	await observer.trigger();
	const card = addedCard(ul, '21');
	const first = pressHeart(card);
	const second = pressHeart(card);
	release();
	await first;
	await second;
	assert.deepEqual(calls, ['21'], '連打で 2 回送っている');
	assert.equal(card.getAttribute('data-gv-bookmark-id'), '999');
});

test('複数枚バッジのアイコンまで塗らない', async () => {
	// カード全体から path を集めると、色も heartFills との index 対応もずれる
	const { ul, observer } = setup({ actions: fakeActions([]) });
	await observer.trigger();
	const card = addedCard(ul, '22');
	const hearts = card.querySelector(BOOKMARK_BUTTON_SELECTOR).querySelectorAll('path');
	const others = [...card.querySelectorAll('path')].filter((path) => !hearts.includes(path));
	assert.equal(others.length, 1, 'バッジの path がある前提のテスト');
	await pressHeart(card);
	assert.deepEqual(heartFillsOf(card), [BOOKMARKED_FILL, BOOKMARKED_FILL]);
	assert.notEqual(others[0].style.values.fill, BOOKMARKED_FILL, 'バッジのアイコンまで塗っている');
});
