import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachInfiniteScroll } from '../../src/content/infinite.js';
import { INFINITE_SCROLL, GV_CARD_ATTR, SENTINEL_ATTR, SENTINEL_MARGIN_PX } from '../../src/common/constants.js';
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
 * @returns {{source: object, loaded: number[]}} 供給と読んだページ番号
 */
function fakeSource(pages) {
	const loaded = [];
	return {
		loaded,
		source: {
			async pageCount() { return pages; },
			async loadPage(page) {
				loaded.push(page);
				if (page > pages) return [];
				return [1, 2].map((n) => ({
					id: `${page}${n}`, title: `作品${page}-${n}`, pageCount: 1, userId: '9',
					url: `https://i.pximg.net/${page}${n}.jpg`, alt: `作品${page}-${n}`, bookmarkData: null,
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
 * 継ぎ足しを組み立てる。
 * @param {{pages?: number, mode?: string, startPage?: number}} [options] 上書き
 * @returns {{ul: object, wrap: object, handle: object, loaded: number[], observer: object}} 材料一式
 */
function setup(options = {}) {
	const { ul, wrap } = makeGrid([makeCard({ id: '1' }), makeCard({ id: '2', pages: 2 })]);
	const { source, loaded } = fakeSource(options.pages ?? 3);
	const observer = fakeObserver();
	const doc = { createElement: (tag) => el(tag), body: wrap };
	const handle = attachInfiniteScroll(doc, {
		ul,
		source,
		mode: options.mode ?? INFINITE_SCROLL.ON_REACH,
		loggedIn: true,
		startPage: options.startPage ?? 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle },
	});
	return { ul, wrap, handle, loaded, observer };
}

test('組み立てただけでは読み込まない', () => {
	// 下まで来ていないのに通信しない
	const { loaded } = setup();
	assert.deepEqual(loaded, []);
});

test('sentinel は ul の直後 (親の末尾) に置かれ、監視される', () => {
	const { ul, wrap, observer } = setup();
	const sentinels = [...wrap.querySelectorAll(`[${SENTINEL_ATTR}]`)];
	assert.equal(sentinels.length, 1);
	assert.equal(wrap.children.at(-1), sentinels[0], 'sentinel が ul の後ろに無い');
	assert.equal([...ul.querySelectorAll(`[${SENTINEL_ATTR}]`)].length, 0, 'ul の中に入れてはいけない');
	assert.deepEqual(observer.state.observed, sentinels);
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

test('失敗しても落ちず、もう一度見えたら読み直す', async () => {
	const { ul } = makeGrid([makeCard({ id: '1' })]);
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
	const doc = { createElement: (tag) => el(tag), body: ul.parent };
	attachInfiniteScroll(doc, {
		ul, source, mode: INFINITE_SCROLL.ON_REACH, loggedIn: true, startPage: 1,
		deps: { createObserver: observer.create, computedStyle: fakeComputedStyle },
	});
	await observer.trigger();
	await observer.trigger();
	assert.equal(addedCards(ul).length, 1);
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
