import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachInfiniteScroll, SENTINEL_STYLE_ID, PAGER_STYLE_ID, CARD_STYLE_ID } from '../../src/content/infinite.js';
import {
	INFINITE_SCROLL, XV_CARD_ATTR, XV_BOOKMARK_ID_ATTR, SENTINEL_ATTR,
	BOOKMARK_BUTTON_SELECTOR, BOOKMARKED_FILL, PAGER_SELECTOR,
} from '../../src/common/constants.js';
import { clearSessionCache } from '../../src/content/session.js';
import { createStrings } from '../../src/i18n/index.js';
import { makeCard, makeGrid, el, fakeComputedStyle } from '../helpers/card.js';

/** 日本語の sentinel の文言。createStrings('ja').infinite の短縮 */
const SENTINEL_TEXT = createStrings('ja').infinite;

/** 継ぎ足しの既定の総ページ数 */
const DEFAULT_PAGES = 3;

/** 画像 URL が pximg でない作品。buildCard が null を返す (SPEC §9.2) */
const UNBUILDABLE_URL = 'https://example.com/99.jpg';

// ハートを押すテストは readSession() を通り、session.js のモジュール共有キャッシュに
// この偽 doc のセッションが残る。次のテストへ持ち越さない
afterEach(clearSessionCache);

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
 * observe() が投げる IntersectionObserver の偽物を作る生成関数。
 * @param {{onDisconnect?: () => void}} [options] disconnect() された合図
 * @returns {Function} 生成関数
 */
function throwingObserver(options = {}) {
	return () => ({
		observe() { throw new Error('observe failed'); },
		unobserve() {},
		disconnect() { options.onDisconnect?.(); },
	});
}

/**
 * 1 枚だけのカードになる作品サマリ。
 * @param {string} id 作品 ID
 * @param {string} [url] 画像 URL。既定は pximg
 * @returns {object} 作品サマリ
 */
function singleWork(id, url = `https://i.pximg.net/${id}.jpg`) {
	return { id: String(id), title: `作品${id}`, pageCount: 1, userId: '9', url, alt: `作品${id}`, bookmarkData: null };
}

/**
 * 1 ページ 2 件のページ供給の偽物。
 * @param {number} pages ページ数
 * @param {{bookmarked?: boolean, claimedPages?: number}} [options] 作品の状態。
 *   claimedPages を渡すと pageCount はその値を名乗る (実際より多い総ページ数の再現)
 * @returns {{source: object, loaded: number[]}} 供給と読んだページ番号
 */
function fakeSource(pages, options = {}) {
	return sourceOf((page) => {
		if (page > pages) return [];
		// 2 件目は複数枚。バッジ付きのカード (雛形が multi) も継ぎ足しに混ぜる
		return [1, 2].map((n) => ({
			id: `${page}${n}`, title: `作品${page}-${n}`, pageCount: n, userId: '9',
			url: `https://i.pximg.net/${page}${n}.jpg`, alt: `作品${page}-${n}`,
			bookmarkData: options.bookmarked ? { id: `b${page}${n}`, private: false } : null,
		}));
	}, options.claimedPages ?? pages);
}

/**
 * 任意の応答を返すページ供給。読んだページ番号を loaded に積む。
 * @param {(page: number) => object[]|Promise<object[]>} loadPage ページの応答。投げれば通信の失敗
 * @param {number|(() => number)} [pageCount] 総ページ数。関数なら呼んで決める (投げれば取得の失敗)
 * @returns {{source: object, loaded: number[]}} 供給と読んだページ番号
 */
function sourceOf(loadPage, pageCount = DEFAULT_PAGES) {
	const loaded = [];
	return {
		loaded,
		source: {
			async pageCount() { return typeof pageCount === 'function' ? pageCount() : pageCount; },
			async loadPage(page) {
				loaded.push(page);
				return loadPage(page);
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
	return [...ul.querySelectorAll('li')].filter((li) => li.getAttribute(XV_CARD_ATTR));
}

/**
 * 継ぎ足したカードを 1 枚拾う。
 * @param {object} ul グリッドの ul
 * @param {string} id 作品 ID
 * @returns {object} カード (li)
 */
function addedCard(ul, id) {
	return addedCards(ul).find((li) => li.getAttribute(XV_CARD_ATTR) === id);
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
 * body (ul の親) は setup() / adoptBody() が後から結ぶ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const doc = el('#document');
	doc.createElement = (tag) => withIdProperty(el(tag));
	doc.head = el('head');
	// style-injector は id で二重注入を見る。head の中だけを引く。
	// readSession() が引く __NEXT_DATA__ は head に無い = 未ログイン扱い (トークンは空)
	doc.getElementById = (id) => doc.head.querySelector(`[id="${id}"]`);
	doc.body = null;
	return doc;
}

/**
 * ul の親を doc の body にし、出来事が wrap から doc まで上がれるようにする。
 * @param {object} doc 偽のドキュメント
 * @param {object} wrap ul の親
 * @returns {void}
 */
function adoptBody(doc, wrap) {
	doc.body = wrap;
	wrap.ownerDocument = doc;
}

/**
 * 本物と同じく `node.id = 'x'` が id 属性へ届くようにする。
 * style-injector は id をプロパティで書き、テストは属性で読むため。
 * @param {object} node 要素の代わり
 * @returns {object} 同じ要素
 */
function withIdProperty(node) {
	Object.defineProperty(node, 'id', {
		get() { return node.getAttribute('id') ?? ''; },
		set(value) { node.setAttribute('id', value); },
	});
	return node;
}

/**
 * head に入っている style を拾う。
 * @param {object} doc 偽のドキュメント
 * @param {string} [id] 絞り込む style の id。省略すると全部
 * @returns {object[]} style 要素
 */
function stylesIn(doc, id) {
	const styles = [...doc.head.querySelectorAll('style')];
	return id === undefined ? styles : styles.filter((node) => node.getAttribute('id') === id);
}

/**
 * メソッドを包み、呼ばれた引数を記録する。元の処理はそのまま呼ぶ。
 * @param {object} target メソッドの持ち主
 * @param {string} name メソッド名
 * @returns {unknown[][]} 呼ばれた引数の並び (呼ばれた順)
 */
function recordCalls(target, name) {
	const calls = [];
	const original = target[name];
	target[name] = (...args) => {
		calls.push(args);
		return original.call(target, ...args);
	};
	return calls;
}

/**
 * 1 tick 待つ。捨てた先読みが終わるのを待つときに使う。
 * @returns {Promise<void>} 待ち
 */
function tick() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 継ぎ足しを組み立てる。
 * source を渡さなければ fakeSource (1 ページ 2 件) を使う。
 * @param {{cards?: object[], pages?: number, claimedPages?: number, mode?: string, startPage?: number,
 *   trailing?: boolean, bookmarked?: boolean, loggedIn?: boolean, actions?: object, onPageChange?: Function,
 *   strings?: object, source?: object, doc?: object, createObserver?: Function, deps?: object}} [options] 上書き。
 *   cards はグリッドに最初から並ぶカード、source はページ供給 (sourceOf で作る)、
 *   doc は偽のドキュメント (fakeDoc で作る。購読の記録を仕込んでから渡す)、
 *   createObserver は IntersectionObserver の生成関数、deps は deps への追加 (rectTop / schedule 等)。
 *   strings は文言のカタログ (既定は日本語)
 * @returns {{ul: object, wrap: object, doc: object, handle: object, loaded: number[],
 *   observer: object, trailing: object|null}} 材料一式。loaded は source を渡したときは空のまま
 */
function setup(options = {}) {
	const { ul, wrap } = makeGrid(options.cards ?? [makeCard({ id: '1' }), makeCard({ id: '2', pages: 2 })]);
	// pixiv は ul の後ろにページャを置く。sentinel はそれより前 (= ul の直後) に入らないといけない
	const trailing = options.trailing ? wrap.appendChild(el('nav')) : null;
	const fake = options.source
		? { source: options.source, loaded: [] }
		: fakeSource(options.pages ?? DEFAULT_PAGES, {
			bookmarked: options.bookmarked === true, claimedPages: options.claimedPages,
		});
	const observer = fakeObserver();
	const doc = options.doc ?? fakeDoc();
	adoptBody(doc, wrap);
	const handle = attachInfiniteScroll(doc, {
		ul,
		source: fake.source,
		mode: options.mode ?? INFINITE_SCROLL.ON_REACH,
		loggedIn: options.loggedIn ?? true,
		startPage: options.startPage ?? 1,
		onPageChange: options.onPageChange,
		strings: options.strings ?? createStrings('ja'),
		deps: {
			createObserver: options.createObserver ?? observer.create,
			computedStyle: fakeComputedStyle,
			actions: options.actions,
			...options.deps,
		},
	});
	return { ul, wrap, doc, handle, loaded: fake.loaded, observer, trailing };
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
	// 親の末尾に置くとページャの下に落ち、その高さのぶんだけ発火が遅れる
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

test('strings に英語のカタログを渡すと sentinel の文言も英語になる', async () => {
	// カタログの値そのものはテストしない (createStrings 側の責務)。
	// ここで見るのは attachInfiniteScroll が SENTINEL_TEXT を直書きせず、
	// 渡された strings.infinite を実際に引いているかどうか
	const { wrap, observer } = setup({ pages: 1, strings: createStrings('en') });
	const pending = observer.trigger();
	assert.equal(sentinelMessage(wrap), 'Loading artworks');
	await pending;
	assert.equal(sentinelMessage(wrap), 'You have reached the end');
});

test('sentinel は中身が入る前から読み上げの領域として置かれる', () => {
	// role="status" は「空の領域が先にあって、後から中身が変わる」形でないと鳴らない。
	// 中身入りで差し込むと読み上げられず、出していないのと同じになる (UI_DESIGN_KIT §6)
	const { wrap } = setup();
	const sentinel = sentinelOf(wrap);
	assert.equal(sentinel.getAttribute('role'), 'status');
	assert.equal(sentinel.getAttribute('aria-live'), 'polite');
	assert.equal(sentinel.children.length, 0, '領域は空のまま置かれていないといけない');
});

test('状態が変わっても sentinel 自身は置き換えない', async () => {
	// 読み上げの領域は作り直すと鳴らなくなる。中の要素だけを差し替える
	const { wrap, observer } = setup({ pages: 2 });
	const before = sentinelOf(wrap);
	await observer.trigger();
	assert.equal(sentinelOf(wrap), before, 'sentinel を作り直している');
	assert.equal(before.getAttribute('role'), 'status');
});

test('sentinel のスタイルは同じ doc に 1 枚しか入らない', () => {
	const doc = fakeDoc();
	setup({ doc });
	setup({ doc });
	assert.equal(stylesIn(doc, SENTINEL_STYLE_ID).length, 1);
});

test('dispose で sentinel / ページャ / カードのスタイルが全て外れる', () => {
	// 「オフにしたら元へ戻す」を 3 枚とも揃える (SPEC §6.7)。
	// ページャが隠れたまま残ると、拡張をオフにしたのにページ送りの手段が無い
	const { doc, handle } = setup();
	for (const id of [SENTINEL_STYLE_ID, PAGER_STYLE_ID, CARD_STYLE_ID]) {
		assert.equal(stylesIn(doc, id).length, 1, `${id} が入っていない`);
	}
	handle.dispose();
	for (const id of [SENTINEL_STYLE_ID, PAGER_STYLE_ID, CARD_STYLE_ID]) {
		assert.equal(stylesIn(doc, id).length, 0, `${id} が残っている`);
	}
});

test('下まで来たら次のページを継ぎ足す', async () => {
	const { ul, loaded, observer } = setup();
	await observer.trigger();
	assert.deepEqual(loaded, [2], '2 ページ目を読んでいない');
	const added = addedCards(ul);
	assert.equal(added.length, 2);
	assert.equal(added[0].getAttribute(XV_CARD_ATTR), '21');
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

test('先読みした空のページは読み直さずに終わる', async () => {
	// pageCount が実際より多いとき、空の先読みを捨てると同じページを読み直してから終わる。
	// 空のまま持ち分にすれば 1 リクエスト減る
	const { loaded, observer, wrap } = setup({ mode: INFINITE_SCROLL.PREFETCH, pages: 2, claimedPages: 3 });
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3]);
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3], '空だった 3 ページ目を読み直している');
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.DONE);
	assert.equal(observer.state.disconnected, 1);
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

test('最終ページを越えていたら読まずに終わる', async () => {
	// /users/1/illustrations?p=3 を直接開いて、それが最終ページだった場合。
	// 総ページ数は先に見るので、無い 4 ページ目を読みに行かない
	const { observer, loaded, wrap } = setup({ startPage: 3, pages: 3 });
	await observer.trigger();
	assert.deepEqual(loaded, [], '最終ページの先を読みに行っている');
	assert.equal(observer.state.disconnected, 1);
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.DONE);
});

test('空のページが返ったらそこで終わる', async () => {
	// pageCount が実際より多い場合の保険
	const { observer, loaded } = setup({ startPage: 3, pages: 3, claimedPages: 5 });
	await observer.trigger();
	assert.deepEqual(loaded, [4]);
	assert.equal(observer.state.disconnected, 1);
});

test('総ページ数が取れなかったら何も並べずに失敗として出す', async () => {
	// 並べてから失敗を出すと「描いたのに失敗表示」になり、lastPage も ?p= も進んでしまう
	const pages = [];
	const { source, loaded } = sourceOf(() => [singleWork('99')], () => { throw new Error('boom'); });
	const { ul, wrap, observer } = setup({
		cards: [makeCard({ id: '1' })], source, onPageChange: (page) => pages.push(page),
	});
	await observer.trigger();
	assert.deepEqual(loaded, [], '総ページ数が分からないのに読みに行っている');
	assert.equal(addedCards(ul).length, 0);
	assert.deepEqual(pages, []);
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.ERROR);
	assert.ok(retryButton(wrap));
});

/**
 * 1 回目だけ失敗する供給で継ぎ足しを組み立てる。
 * @returns {{ul: object, wrap: object, handle: object, observer: object, loaded: number[]}} 材料一式
 */
function setupFlaky() {
	let calls = 0;
	const { source, loaded } = sourceOf(() => {
		calls += 1;
		if (calls === 1) throw new Error('boom');
		return [singleWork('99')];
	});
	return { ...setup({ cards: [makeCard({ id: '1' })], source }), loaded };
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
	// 読み上げの領域は sentinel の 1 つだけ。中に role="alert" を入れて入れ子にすると、
	// 実装によっては外側の polite 領域も鳴って二重に読み上げられる
	assert.equal(sentinelOf(wrap).querySelector('p').getAttribute('role'), null, 'live region が入れ子になっている');
	// 失敗は気づいてほしいので、sentinel 側の強さを assertive へ切り替える (UI_DESIGN_KIT §6)
	assert.equal(sentinelOf(wrap).getAttribute('aria-live'), 'assertive');
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
	// 失敗の間だけ assertive。抜けたら polite へ戻さないと、以降の文言まで割り込んで読まれる
	assert.equal(sentinelOf(wrap).getAttribute('aria-live'), 'polite', 'assertive のまま残っている');
});

/**
 * 作品は返るのに 1 枚も組めない供給で継ぎ足しを組み立てる。
 * 画像 URL が pximg でなければ buildCard が null を返す。(SPEC §9.2)
 * @param {{onPageChange?: Function}} [options] 上書き
 * @returns {{ul: object, wrap: object, loaded: number[], observer: object}} 材料一式
 */
function setupUnbuildable(options = {}) {
	const { source, loaded } = sourceOf(() => [singleWork('99', UNBUILDABLE_URL)]);
	return { ...setup({ cards: [makeCard({ id: '1' })], source, onPageChange: options.onPageChange }), loaded };
}

test('作品が返っても 1 枚も組めなかったら黙って止まらず、失敗として出す', async () => {
	// カードが増えないと sentinel も動かない。IntersectionObserver は交差が変わったときに
	// しか鳴らないので、idle のままにすると二度と先へ進めなくなる。
	// 通信は成功しているので、文言は「読み込めなかった」ではなく「表示できなかった」
	const { ul, wrap, observer } = setupUnbuildable();
	await observer.trigger();
	assert.equal(addedCards(ul).length, 0, '組めないはずのカードが並んでいる');
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.BUILD_FAILED, '何も出ないまま止まっている');
	assert.notEqual(SENTINEL_TEXT.BUILD_FAILED, SENTINEL_TEXT.ERROR, '通信の失敗と同じ文言になっている');
	assert.equal(sentinelOf(wrap).getAttribute('aria-live'), 'assertive');
	assert.ok(retryButton(wrap), '再試行ボタンが出ていない');
});

/**
 * 1 ページ目の作品 (ID 1 と 2) をもう一度返す供給で継ぎ足しを組み立てる。
 * pixiv がグリッドを描き直したときに基準ページの記憶がずれた場合の再現。
 * @param {{pages?: number, duplicatePages?: number[]}} [options] 総ページ数と、重複だけを返すページ
 * @returns {{ul: object, wrap: object, loaded: number[], observer: object, pages: number[]}} 材料一式
 */
function setupDuplicating(options = {}) {
	const pages = [];
	const duplicatePages = options.duplicatePages ?? [2];
	const { source, loaded } = sourceOf((page) => {
		const ids = duplicatePages.includes(page) ? ['1', '2'] : [`${page}1`, '2'];
		return ids.map((id) => singleWork(id));
	}, options.pages ?? 4);
	return { ...setup({ source, onPageChange: (page) => pages.push(page) }), loaded, pages };
}

test('既に並んでいる作品は継ぎ足さない', async () => {
	// 基準ページの記憶がずれても同じ作品が二重に並ばないための保険 (XV_CARD_ATTR の役割)
	const { ul, observer } = setupDuplicating({ duplicatePages: [] });
	await observer.trigger();
	const added = addedCards(ul);
	assert.deepEqual(added.map((li) => li.getAttribute(XV_CARD_ATTR)), ['21'], 'ID 2 が二重に並んでいる');
});

test('全件が既に並んでいたページは失敗にせず、ページを進めて次を読む', async () => {
	// カードが増えないと sentinel が動かず IntersectionObserver が鳴らないので、続けて次を読む
	const { ul, wrap, loaded, observer, pages } = setupDuplicating({ duplicatePages: [2] });
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3], '重複だけのページで止まっている');
	// 1 枚も並ばなかったページは画面に出ていないので ?p= にも現れない (印を持たない)
	assert.deepEqual(pages, [3], '画面に出ていないページを知らせている');
	assert.deepEqual(addedCards(ul).map((li) => li.getAttribute(XV_CARD_ATTR)), ['31']);
	assert.equal(retryButton(wrap), null, '重複を失敗として出している');
	assert.equal(sentinelMessage(wrap), '');
});

test('重複だけのページが最終ページなら読み終わりとして出す', async () => {
	const { wrap, observer, pages } = setupDuplicating({ pages: 2, duplicatePages: [2] });
	await observer.trigger();
	// 並んだカードは 1 ページ目のぶんだけ。?p= は動かさない
	assert.deepEqual(pages, []);
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.DONE);
	assert.equal(observer.state.disconnected, 1);
});

test('1 枚も組めなかったらページを進めない', async () => {
	// 1 枚も出ていないのに ?p= だけ進むと、URL とグリッドの中身がずれる
	const pages = [];
	const { loaded, wrap, observer } = setupUnbuildable({ onPageChange: (page) => pages.push(page) });
	await observer.trigger();
	assert.deepEqual(pages, [], '並べていないのにページの移動を知らせている');
	await retryButton(wrap).click();
	assert.deepEqual(loaded, [2, 2], '読み直しで同じページへ戻っていない');
});

test('読み込み中は読み込み中と出る', async () => {
	let release = () => {};
	const gate = new Promise((resolve) => { release = resolve; });
	const { source } = sourceOf(async () => {
		await gate;
		return [singleWork('99')];
	});
	const { wrap, observer } = setup({ cards: [makeCard({ id: '1' })], source });
	const pending = observer.trigger();
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.LOADING);
	// 読み上げは永続する sentinel の role="status" が受け持つ。段落側には持たせない
	assert.equal(sentinelOf(wrap).getAttribute('role'), 'status');
	assert.equal(sentinelOf(wrap).querySelector('p').getAttribute('role'), null);
	assert.equal(retryButton(wrap), null, '読み込み中に再試行ボタンを出さない');
	release();
	await pending;
	assert.equal(sentinelMessage(wrap), '', '終わったのに表示が残っている');
});

/**
 * 3 ページ目の先読みだけを止められる供給で prefetch の継ぎ足しを組み立てる。
 * @returns {{ul: object, wrap: object, handle: object, observer: object, loaded: number[],
 *   reached: Promise<void>, release: () => void}} 材料一式と、先読みが始まった合図・先読みを進める操作
 */
function setupSlowPrefetch() {
	let release = () => {};
	const gate = new Promise((resolve) => { release = resolve; });
	let entered = () => {};
	const reached = new Promise((resolve) => { entered = resolve; });
	const { source, loaded } = sourceOf(async (page) => {
		// 先読み (3 ページ目) だけ待たせる
		if (page === 3) {
			entered();
			await gate;
		}
		return [singleWork(page)];
	}, 5);
	return {
		...setup({ cards: [makeCard({ id: '1' })], source, mode: INFINITE_SCROLL.PREFETCH }),
		loaded, reached, release,
	};
}

test('先読みの間は読み込み中を出さず、並べ終えた時点で表示を戻す', async () => {
	// 先読みは黙って読む。(SPEC §6.8) 手元の作品を並べるだけのときにスピナーと
	// 「作品を読み込んでいます」の読み上げを出さない
	const { wrap, observer, reached, release } = setupSlowPrefetch();
	const pending = observer.trigger();
	await reached;
	await pending;
	assert.equal(sentinelMessage(wrap), '', '先読みの間も読み込み中が出ている');
	release();
});

test('先読みが終わる前に下まで来ても継ぎ足しは止まらない', async () => {
	// 先読みを「読み込み中」に含めると、その間の advance() が弾かれる。
	// 描画で sentinel が画面内に留まると IntersectionObserver は二度と鳴らず、
	// 先読みした作品を持ったまま並ばなくなる
	const { ul, observer, loaded, reached, release } = setupSlowPrefetch();
	await observer.trigger();
	await reached;
	// 先読み中に再び下端へ着いた。読み直さず、先読みの終わりを待って並べる
	const second = observer.trigger();
	assert.deepEqual(loaded, [2, 3], '先読み中の同じページを読み直している');
	release();
	await second;
	assert.equal(addedCards(ul).length, 2, '先読みした 3 ページ目が並んでいない');
	assert.deepEqual(loaded, [2, 3, 4], '3 ページ目を並べた後の先読みが走っていない');
});

test('先読みの途中でモードを変えたら、その先読みは持ち分にしない', async () => {
	const { handle, observer, loaded, reached, release } = setupSlowPrefetch();
	await observer.trigger();
	await reached;
	handle.setMode(INFINITE_SCROLL.ON_REACH);
	release();
	// 捨てた先読みが終わるのを待ってから、下端へ着く
	await tick();
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3, 3], '捨てたはずの先読みを使っている');
});

test('dispose 後に先読みが終わっても投げない', async () => {
	// 持ち分に入れないこと自体は外から観測できない。少なくとも後始末で投げないことを見る。
	// 先読みは別系統の Promise なので、投げれば unhandled rejection としてこのテストが落ちる
	const { handle, observer, loaded, reached, release } = setupSlowPrefetch();
	await observer.trigger();
	await reached;
	handle.dispose();
	release();
	await tick();
	assert.deepEqual(loaded, [2, 3], 'dispose 後に読み直している');
});

test('dispose 後の currentPage は null', async () => {
	// 動いていなければ null。呼び出し側は「継ぎ足しが無い」として ?p= を触らない
	const { handle, observer } = setup({ startPage: 3, pages: 5 });
	await observer.trigger();
	assert.equal(handle.currentPage(), 4);
	handle.dispose();
	assert.equal(handle.currentPage(), null, 'dispose 後もページを名乗っている');
});

test('rect が測れない環境では、並んでいる最後のページを見ているものとして扱う', async () => {
	// 上端が読めないカードは全て「上端の上」に倒れる。一番後ろの印 = 最後に並べたページ
	const { handle, observer } = setup({ startPage: 3, pages: 5 });
	assert.equal(handle.currentPage(), 3);
	await observer.trigger();
	assert.equal(handle.currentPage(), 4);
});

test('DOM から外れた印は飛ばし、その上のページを名乗る', async () => {
	// 外れた要素の getBoundingClientRect() は 0 を返すので、そのままでは「越えた」に倒れる。
	// 印のカードを pixiv に消されても、その上にいながらそのページを名乗らない
	const { ul, handle, observer } = setup({ startPage: 3, pages: 5 });
	await observer.trigger();
	assert.equal(handle.currentPage(), 4);
	addedCard(ul, '41').isConnected = false;
	assert.equal(handle.currentPage(), 3, '外れた印のページを名乗っている');
});

test('表示の組み立てが途中で失敗しても中途半端な中身を残さない', async () => {
	// state だけ進めると、中身が半端なまま次に同じ状態を頼まれても組み直せなくなる
	const doc = fakeDoc();
	let failButton = true;
	doc.createElement = (tag) => {
		if (tag === 'button' && failButton) {
			failButton = false;
			throw new Error('boom');
		}
		return el(tag);
	};
	let calls = 0;
	const { source } = sourceOf(() => {
		calls += 1;
		throw new Error(`boom ${calls}`);
	});
	const { wrap, observer } = setup({ cards: [makeCard({ id: '1' })], source, doc });
	await observer.trigger();
	// 再試行ボタンを作れなかった。押せない文言だけを残さない
	assert.equal(sentinelOf(wrap).children.length, 0, '半端な中身が残っている');
	assert.equal(retryButton(wrap), null);
	await observer.trigger();
	assert.ok(retryButton(wrap), '一度失敗したら二度と組み直せなくなっている');
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.ERROR);
});

test('読み切ったら読み終わりと出て、再試行ボタンは出ない', async () => {
	const { wrap, observer } = setup({ pages: 2 });
	await observer.trigger();
	assert.equal(sentinelMessage(wrap), SENTINEL_TEXT.DONE);
	assert.equal(sentinelOf(wrap).getAttribute('role'), 'status');
	assert.equal(sentinelOf(wrap).querySelector('p').getAttribute('role'), null);
	assert.equal(retryButton(wrap), null);
});

test('雛形が採れなければ何もしない', () => {
	// 画像が 1 枚も読み込まれていないページ。head の無い最小の doc でも投げない
	const doc = { createElement: (tag) => el(tag) };
	const { wrap, handle, loaded } = setup({ cards: [makeCard({ id: '1', loaded: false })], doc });
	assert.equal(handle.isActive(), false);
	assert.deepEqual(loaded, []);
	assert.equal([...wrap.querySelectorAll(`[${SENTINEL_ATTR}]`)].length, 0, 'sentinel を置いてはいけない');
	assert.doesNotThrow(() => handle.dispose());
	assert.doesNotThrow(() => handle.setMode(INFINITE_SCROLL.PREFETCH));
	assert.equal(handle.currentPage(), null, '何も並べていないのにページを名乗っている');
});

test('雛形が採れていれば動いている', () => {
	const { handle } = setup();
	assert.equal(handle.isActive(), true);
});

test('雛形が採れたら本体のページャを隠す CSS が入る', () => {
	const { doc } = setup();
	const styles = stylesIn(doc, PAGER_STYLE_ID);
	assert.equal(styles.length, 1, 'ページャを隠す style が入っていない');
	assert.ok(styles[0].textContent.includes(PAGER_SELECTOR), 'ページャのセレクタで隠していない');
	assert.ok(/display:[^;]*none[^;]*!important/.test(styles[0].textContent), 'pixiv 側の指定に競り勝てない');
});

test('雛形が採れなければページャもカードの CSS も入らない', () => {
	// 継ぎ足せないのにページ送りの手段を消してはいけない
	const { doc, handle } = setup({ cards: [makeCard({ id: '1', loaded: false })] });
	assert.equal(handle.isActive(), false);
	assert.equal(stylesIn(doc).length, 0, '継ぎ足せないのに style を入れている');
});

test('sentinel を置けなければページャを隠さない', () => {
	// 監視を張れずに継ぎ足しを諦めた場合も、ページ送りの手段は残さないといけない
	const { doc, handle } = setup({ cards: [makeCard({ id: '1' })], createObserver: throwingObserver() });
	assert.equal(handle.isActive(), false);
	assert.equal(stylesIn(doc, PAGER_STYLE_ID).length, 0, '継ぎ足せないのにページャを隠している');
});

test('雛形が採れたら継ぎ足したカードの display を取り戻す CSS が入る', () => {
	// pixiv のグリッドは 1 ページぶんより先の li を display:none にする。(SITE_SPEC §3)
	// 打ち消さないと、継ぎ足したカードが DOM にだけ積み上がって画面に出ない
	const { doc } = setup();
	const styles = stylesIn(doc, CARD_STYLE_ID);
	assert.equal(styles.length, 1, 'カードを出す style が入っていない');
	assert.ok(styles[0].textContent.includes(XV_CARD_ATTR), '継ぎ足したカードの目印で選んでいない');
	assert.ok(/display:[^;]*!important/.test(styles[0].textContent), 'pixiv 側の display:none に競り勝てない');
});

test('ページャの CSS は二重に入らない', () => {
	// 同じ doc で組み直しても 1 枚だけ
	const doc = fakeDoc();
	const first = setup({ doc, cards: [makeCard({ id: '1' })] }).handle;
	const second = setup({ doc, cards: [makeCard({ id: '1' })] }).handle;
	assert.equal(stylesIn(doc, PAGER_STYLE_ID).length, 1);
	second.dispose();
	first.dispose();
	assert.equal(stylesIn(doc, PAGER_STYLE_ID).length, 0);
});

test('ページを継ぎ足したら ?p= の変更を知らせる', async () => {
	const pages = [];
	const { observer } = setup({ onPageChange: (page) => pages.push(page) });
	await observer.trigger();
	assert.deepEqual(pages, [2]);
});

test('継ぎ足すたびに ?p= の変更を知らせる', async () => {
	const pages = [];
	const { observer } = setup({ pages: 5, onPageChange: (page) => pages.push(page) });
	await observer.trigger();
	await observer.trigger();
	assert.deepEqual(pages, [2, 3]);
});

test('読み切る最後のページも知らせる', async () => {
	const pages = [];
	const { observer } = setup({ pages: 2, onPageChange: (page) => pages.push(page) });
	await observer.trigger();
	assert.deepEqual(pages, [2]);
});

test('空のページで終わったときは知らせない', async () => {
	// 1 枚も並んでいないのに ?p= を進めると、リロードで空のページが開く
	const pages = [];
	const { observer, loaded } = setup({ startPage: 3, pages: 3, claimedPages: 5, onPageChange: (page) => pages.push(page) });
	await observer.trigger();
	assert.deepEqual(loaded, [4]);
	assert.deepEqual(pages, []);
});

test('?p= の知らせが投げても継ぎ足しは続く', async () => {
	const { ul, loaded, observer } = setup({
		pages: 5,
		onPageChange() { throw new Error('boom'); },
	});
	await observer.trigger();
	assert.deepEqual(loaded, [2], 'ページは読めている');
	assert.equal(addedCards(ul).length, 2, '知らせの失敗に巻き込まれてカードが並んでいない');
	await observer.trigger();
	assert.deepEqual(loaded, [2, 3], '次の継ぎ足しまで止まっている');
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
	let disconnected = 0;
	const { wrap, handle } = setup({
		cards: [makeCard({ id: '1' })],
		createObserver: throwingObserver({ onDisconnect: () => { disconnected += 1; } }),
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

test('onReach は sentinel が見えてから動く', () => {
	// 「一番下に着いてから読む」と案内している。手前から読み始めたら先読みとの差が無くなる
	const { observer } = setup({ mode: INFINITE_SCROLL.ON_REACH });
	assert.equal(observer.state.init.rootMargin, '0px');
});

test('prefetch は sentinel を 1 画面ぶん手前から見張る', () => {
	// 作品は手元にあるので、下端が見えるより前に並べ終えられる
	const { observer } = setup({ mode: INFINITE_SCROLL.PREFETCH });
	assert.equal(observer.state.init.rootMargin, '100%');
});

test('先読みのほうが手前で発火する', () => {
	// 2 つの値を取り違えると「下まで来たら」のほうが早く読み始めてしまい、
	// 設定画面の説明と逆になる (0.22.1 までの不具合)
	const onReach = setup({ mode: INFINITE_SCROLL.ON_REACH }).observer.state.init.rootMargin;
	const prefetch = setup({ mode: INFINITE_SCROLL.PREFETCH }).observer.state.init.rootMargin;
	const distance = (margin) => Number.parseFloat(margin);
	assert.equal(distance(onReach), 0, 'onReach が下端より手前で発火している');
	assert.ok(distance(prefetch) > 0, 'prefetch が下端に着くまで発火しない');
});

test('setMode でモードを変えたら rootMargin を変えて監視し直す', () => {
	const { wrap, handle, observer } = setup({ mode: INFINITE_SCROLL.ON_REACH });
	handle.setMode(INFINITE_SCROLL.PREFETCH);
	assert.equal(observer.state.created, 2, 'observer を作り直していない');
	assert.equal(observer.state.disconnected, 1, '前の observer を切っていない');
	assert.deepEqual(observer.state.inits.map((init) => init.rootMargin), ['0px', '100%']);
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
 * @param {{shiftKey?: boolean, preventDefault?: Function}} [options] 押し方。
 *   preventDefault を渡すと既定の動作を止められた回数を数えられる
 * @returns {Promise<void>|undefined} 送信の待ち
 */
function pressHeart(card, options = {}) {
	const button = card.querySelector('button');
	return button.dispatch('click', {
		target: button,
		shiftKey: options.shiftKey === true,
		preventDefault: options.preventDefault ?? (() => {}),
		stopPropagation() {},
	});
}

/**
 * ブックマークの更新系の偽物。呼ばれた内容を calls へ積む。
 * @param {string[][]} calls 呼ばれた内容の置き場
 * @param {{addBookmark?: Function, deleteBookmark?: Function}} [overrides] 差し替え (失敗させる等)
 * @returns {{addBookmark: Function, deleteBookmark: Function}} 更新系
 */
function fakeActions(calls, overrides = {}) {
	return {
		async addBookmark(id, isPrivate) { calls.push(['add', id, isPrivate]); return '999'; },
		async deleteBookmark(id) { calls.push(['delete', id]); },
		...overrides,
	};
}

test('継ぎ足したカードのハートを押すとブックマークされる', async () => {
	const calls = [];
	const { ul, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	const card = addedCard(ul, '21');
	await pressHeart(card);
	assert.deepEqual(calls, [['add', '21', false]]);
	assert.deepEqual(heartFillsOf(card), [BOOKMARKED_FILL, BOOKMARKED_FILL]);
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), '999');
});

test('Shift を押しながらだと非公開ブックマークになる', async () => {
	const calls = [];
	const { ul, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	await pressHeart(addedCard(ul, '21'), { shiftKey: true });
	assert.deepEqual(calls, [['add', '21', true]]);
});

test('ブックマーク済みをもう一度押すと外れる', async () => {
	const calls = [];
	const { ul, observer } = setup({ bookmarked: true, actions: fakeActions(calls) });
	await observer.trigger();
	const card = addedCard(ul, '21');
	await pressHeart(card);
	assert.deepEqual(calls, [['delete', 'b21']], 'bookmarkData.id で消していない');
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), null);
});

test('失敗したらハートの色を戻す', async () => {
	const { ul, observer } = setup({
		actions: fakeActions([], { async addBookmark() { throw new Error('boom'); } }),
	});
	await observer.trigger();
	const card = addedCard(ul, '21');
	await pressHeart(card);
	// 未ブックマークの色は inline を外して本体の CSS に任せる (paintHeart の決まり)
	assert.deepEqual(heartFillsOf(card), ['', '']);
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), null);
});

test('本体のカードのハートには触らない', async () => {
	// 本体のハートは React が持っている。preventDefault すると本来の動作を壊す
	const calls = [];
	let prevented = 0;
	const { ul, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	const original = [...ul.querySelectorAll('li')].find((li) => !li.getAttribute(XV_CARD_ATTR));
	await pressHeart(original, { preventDefault() { prevented += 1; } });
	assert.deepEqual(calls, [], '本体のカードのハートを自前で処理している');
	assert.equal(prevented, 0, '本体のハートの本来の動作を止めている');
});

test('未ログインならハートの購読を張らない', () => {
	// buildCard が未ログインではボタンごと外すので、購読は全クリックで空振りするだけになる
	const doc = fakeDoc();
	const bound = recordCalls(doc, 'addEventListener');
	const { handle } = setup({ cards: [makeCard({ id: '1' })], doc, loggedIn: false });
	assert.equal(handle.isActive(), true);
	assert.deepEqual(bound, [], '未ログインなのに doc へ購読を張っている');
});

test('雛形にハートが無ければ購読を張らない', () => {
	// 自分のユーザーページ。pixiv が自分の作品にブックマークボタンを描かないので (SITE_SPEC §4)、
	// 継ぎ足したカードにも押せるハートは無い。購読は全クリックで空振りするだけになる
	const doc = fakeDoc();
	const bound = recordCalls(doc, 'addEventListener');
	const { handle } = setup({ cards: [makeCard({ id: '1', heart: false })], doc });
	// 継ぎ足し自体は動く。ハートが無いだけで、無限スクロールを諦める理由にはならない
	assert.equal(handle.isActive(), true);
	assert.deepEqual(bound, [], '押せるハートが無いのに doc へ購読を張っている');
});

test('dispose でハートの購読も外れる', async () => {
	// handler は disposed で抜けるので、押下が拾われないことだけでは購読が外れたかは分からない。
	// doc の removeEventListener が capture 付きで呼ばれることを見る
	const calls = [];
	const { ul, doc, handle, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	const card = addedCard(ul, '21');
	const unbound = recordCalls(doc, 'removeEventListener');
	handle.dispose();
	assert.deepEqual(unbound.map(([type, , capture]) => [type, capture]), [['click', true]], 'dispose で doc の購読を外していない');
	// 撤去済みのカードを戻して押しても拾わない
	ul.appendChild(card);
	await pressHeart(card);
	assert.deepEqual(calls, [], 'dispose 後もハートの押下を拾っている');
});

test('削除に失敗したら赤とブックマーク ID を戻す', async () => {
	// 失敗時の戻しは追加と削除で戻す先が違う。削除の側も見る
	const { ul, observer } = setup({
		bookmarked: true,
		actions: fakeActions([], { async deleteBookmark() { throw new Error('boom'); } }),
	});
	await observer.trigger();
	const card = addedCard(ul, '21');
	await pressHeart(card);
	assert.deepEqual(heartFillsOf(card), [BOOKMARKED_FILL, BOOKMARKED_FILL], '外れたままの色で残っている');
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), 'b21', '消せていないのにブックマーク ID を落としている');
});

test('返事を待っている間の二度押しは捨てる', async () => {
	// data-xv-bookmark-id は返事が返るまで付かない。素直に書くと連打で余分なブックマークが残る
	let release = () => {};
	const gate = new Promise((resolve) => { release = resolve; });
	const calls = [];
	const { ul, observer } = setup({
		actions: fakeActions(calls, {
			async addBookmark(id) { calls.push(id); await gate; return '999'; },
		}),
	});
	await observer.trigger();
	const card = addedCard(ul, '21');
	const first = pressHeart(card);
	const second = pressHeart(card);
	release();
	await first;
	await second;
	assert.deepEqual(calls, ['21'], '連打で 2 回送っている');
	assert.equal(card.getAttribute(XV_BOOKMARK_ID_ATTR), '999');
});

test('カードの属性が読めなくても押せなくなったままにならない', async () => {
	// 属性の読み取りで投げると finally を通らず、そのカードが二度と押せなくなる
	const calls = [];
	const { ul, observer } = setup({ actions: fakeActions(calls) });
	await observer.trigger();
	const card = addedCard(ul, '21');
	const original = card.getAttribute;
	let failed = false;
	card.getAttribute = (name) => {
		if (!failed && name === XV_BOOKMARK_ID_ATTR) {
			failed = true;
			throw new Error('boom');
		}
		return original(name);
	};
	await assert.doesNotReject(async () => { await pressHeart(card); });
	assert.deepEqual(calls, [], '属性が読めないのに送っている');
	await pressHeart(card);
	assert.deepEqual(calls, [['add', '21', false]], '二度と押せなくなっている');
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

/** テストの中でカード 1 枚が占める高さ (px)。実寸ではなく、印の上下関係を作るためだけの値 */
const TEST_CARD_HEIGHT = 100;

/**
 * スクロールに合わせた ?p= の追従を見るための組み立て。
 *
 * 本物の rect は測れないので、「カードは ul の中で上から順に TEST_CARD_HEIGHT ずつ積まれる」
 * と決めて上端を計算する。scrollTo() で画面を動かし、scroll を起こす。
 * setScrollY() は位置だけ動かして scroll を起こさない。(resize 等、別の出来事で見直させるとき)
 * @param {{pages?: number}} [options] 上書き
 * @returns {{ul: object, handle: object, observer: object, view: object, pages: number[],
 *   scrollTo: (y: number) => void, setScrollY: (y: number) => void, loaded: number[]}} 材料一式
 */
function setupScroll(options = {}) {
	const doc = fakeDoc();
	const view = el('#window');
	doc.defaultView = view;
	const pages = [];
	let scrollY = 0;
	const { ul, handle, observer, loaded } = setup({
		doc,
		pages: options.pages ?? 4,
		onPageChange: (page) => pages.push(page),
		deps: {
			rectTop: (node) => ul.children.indexOf(node) * TEST_CARD_HEIGHT - scrollY,
			// 1 フレーム待たずにその場で判定させる
			schedule: (fn) => fn(),
		},
	});
	/**
	 * 位置だけ動かす。scroll は起こさない。
	 * @param {number} y 一番上からの移動量 (px)
	 * @returns {void}
	 */
	const setScrollY = (y) => { scrollY = y; };
	/**
	 * 画面を動かす。
	 * @param {number} y 一番上からの移動量 (px)
	 * @returns {void}
	 */
	const scrollTo = (y) => {
		setScrollY(y);
		view.dispatchEvent({ type: 'scroll' });
	};
	return { ul, handle, observer, view, pages, scrollTo, setScrollY, loaded };
}

test('上へ戻ると ?p= が見えているページまで下がる', async () => {
	// 継ぎ足した後に一番上まで戻ったのに ?p= が下がらないと、再読み込みで別の場所へ飛ぶ
	const { observer, scrollTo, pages } = setupScroll();
	await observer.trigger();
	await observer.trigger();
	// 3 ページ目の先頭カード (上から 5 枚目 = 400px) が画面の上へ流れた
	scrollTo(450);
	assert.equal(pages.at(-1), 3);
	// 2 ページ目の先頭カード (200px) まで戻る
	scrollTo(250);
	assert.equal(pages.at(-1), 2, '上へ戻ったのにページが下がっていない');
	scrollTo(0);
	assert.equal(pages.at(-1), 1, '一番上まで戻ったのに 1 ページ目に戻っていない');
});

test('見えているページが変わらなければ知らせない', async () => {
	// 知らせるたびに replaceState が走る。呼び過ぎるとブラウザに絞られる
	const { observer, scrollTo, pages } = setupScroll();
	await observer.trigger();
	await observer.trigger();
	scrollTo(450);
	scrollTo(460);
	scrollTo(470);
	assert.deepEqual(pages, [3], '同じページを何度も知らせている');
});

test('上にいるまま継ぎ足しても ?p= は進まない', async () => {
	// 先読みや下端での読み込みで ?p= だけ進むと、URL と画面の見えている場所がずれる
	const { observer, pages } = setupScroll();
	await observer.trigger();
	await observer.trigger();
	assert.deepEqual(pages, [], '画面は 1 ページ目のままなのにページを知らせている');
});

test('下端に留まったまま継ぎ足したら、そのぶん ?p= が進む', async () => {
	const { observer, scrollTo, pages } = setupScroll();
	scrollTo(1000);
	assert.deepEqual(pages, [], 'まだ 1 ページ目しか無いのに知らせている');
	await observer.trigger();
	assert.equal(pages.at(-1), 2, '継ぎ足したページに追いついていない');
});

test('画面の大きさが変わっても見直す', async () => {
	// 折り返しが変わるとカードの位置が動く。スクロールしていなくても見えているページは変わる
	const { observer, view, pages, setScrollY } = setupScroll();
	await observer.trigger();
	await observer.trigger();
	// 位置だけ動いた (scroll は鳴っていない) 状況で resize が来る
	setScrollY(450);
	assert.deepEqual(pages, [], 'まだ見直していないのに知らせている');
	view.dispatchEvent({ type: 'resize' });
	assert.deepEqual(pages, [3], 'resize で見直していない');
});

test('dispose するとスクロールを見なくなる', async () => {
	// handler は disposed で抜けるので、知らせが来ないことだけでは購読が外れたかは分からない。
	// window の removeEventListener が scroll と resize の両方で呼ばれることを見る
	const { handle, observer, view, scrollTo, pages } = setupScroll();
	await observer.trigger();
	await observer.trigger();
	scrollTo(450);
	const unbound = recordCalls(view, 'removeEventListener');
	handle.dispose();
	assert.deepEqual(unbound.map(([type]) => type).sort(), ['resize', 'scroll'], 'window の購読が残っている');
	scrollTo(0);
	assert.deepEqual(pages, [3], 'dispose した後も知らせている');
});

test('currentPage は今見えているページを返す', async () => {
	// 呼び出し側がモーダルを閉じた後に ?p= を書き直すときに読む
	const { handle, observer, scrollTo } = setupScroll();
	await observer.trigger();
	await observer.trigger();
	scrollTo(450);
	assert.equal(handle.currentPage(), 3);
	scrollTo(0);
	assert.equal(handle.currentPage(), 1);
});
