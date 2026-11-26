import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInfiniteController, infiniteModeOf } from '../../src/content/infinite-controller.js';
import { INFINITE_SCROLL } from '../../src/common/constants.js';
import { el, makeCard, makeGrid } from '../helpers/card.js';

const ORIGIN = 'https://www.pixiv.net';

/** 無限スクロールの対象になる作者ページ (イラストのタブ) */
const ILLUSTS_PATH = '/users/9/illustrations';

/**
 * window の代わり。location は URL を差し替えて動かし、popstate の購読を覚える。
 * @param {string} path 最初のパス (クエリ付きでもよい)
 * @returns {{win: object, go: (path: string) => void, popstate: () => void, listeners: () => number}}
 *   win と、URL を動かす関数、popstate を起こす関数、張られている popstate の購読の数
 */
function fakeWindow(path) {
	const location = {};
	/** @type {Function[]} */
	let popstate = [];
	const go = (next) => {
		const url = new URL(next, ORIGIN);
		location.href = url.href;
		location.pathname = url.pathname;
		location.search = url.search;
	};
	go(path);
	const win = {
		location,
		addEventListener(type, fn) { if (type === 'popstate') popstate.push(fn); },
	};
	return {
		win,
		go,
		popstate() {
			const fns = popstate;
			popstate = [];
			for (const fn of fns) fn();
		},
		listeners: () => popstate.length,
	};
}

/**
 * document の代わり。作品グリッドの ul を 1 つ持つ。
 * @param {string[]} [ids] グリッドに並ぶ作品 ID
 * @returns {{doc: object, ul: object, wrap: object}} doc とグリッド
 */
function fakeDocument(ids = ['3', '2', '1']) {
	const doc = el('#document');
	const { ul, wrap } = makeGrid(ids.map((id) => makeCard({ id })));
	doc.appendChild(wrap);
	// 偽の要素は isConnected を持たない。文書に入っている ul として扱う
	ul.isConnected = true;
	return { doc, ul, wrap };
}

/**
 * attachInfiniteScroll の代わり。張った回数と渡された材料を覚え、操作の記録を持つ handle を返す。
 * @param {{active?: boolean, page?: number|null, throws?: boolean}} [options] handle の状態
 * @returns {{attach: Function, calls: object[], handles: object[]}} 生成関数と記録
 */
function fakeAttach(options = {}) {
	const calls = [];
	const handles = [];
	const attach = (doc, init) => {
		if (options.throws) throw new Error('setup failed');
		calls.push(init);
		let disposed = false;
		const handle = {
			modes: [],
			disposed: () => disposed,
			isActive: () => (options.active ?? true) && !disposed,
			setMode(mode) { handle.modes.push(mode); },
			currentPage: () => options.page ?? null,
			dispose() { disposed = true; },
		};
		handles.push(handle);
		return handle;
	};
	return { attach, calls, handles };
}

/**
 * 追従を組み立てる。
 * @param {{path?: string, mode?: string, viewing?: boolean, viewerOpen?: boolean,
 *   attach?: object, doc?: object, replaceUrl?: Function}} [options] 上書き
 * @returns {object} 追従と材料一式
 */
function setup(options = {}) {
	const win = fakeWindow(options.path ?? ILLUSTS_PATH);
	const { doc, ul, wrap } = options.doc ?? fakeDocument();
	const fake = options.attach ?? fakeAttach();
	const state = {
		settings: { infiniteScroll: options.mode ?? INFINITE_SCROLL.ON_REACH },
		viewing: options.viewing ?? false,
		viewerOpen: options.viewerOpen ?? false,
	};
	const written = [];
	const sources = [];
	const controller = createInfiniteController({
		doc,
		win: win.win,
		getSettings: () => state.settings,
		getStrings: () => ({ lang: 'ja', infinite: {} }),
		isViewingOwnWork: () => state.viewing,
		isViewerOpen: () => state.viewerOpen,
		attach: fake.attach,
		createSource: (...args) => { sources.push(args); return { args }; },
		isLoggedIn: () => true,
		replaceUrl: options.replaceUrl ?? ((url) => { written.push(url); win.go(url); }),
	});
	return { controller, win, doc, ul, wrap, fake, state, written, sources };
}

test('infiniteModeOf は設定が無ければ off', () => {
	assert.equal(infiniteModeOf(null), INFINITE_SCROLL.OFF);
	assert.equal(infiniteModeOf({}), INFINITE_SCROLL.OFF);
	assert.equal(infiniteModeOf({ infiniteScroll: INFINITE_SCROLL.PREFETCH }), INFINITE_SCROLL.PREFETCH);
});

test('作者ページのグリッドに張り、基準ページの次から読む材料を渡す', () => {
	const { controller, fake, ul, sources } = setup({ path: `${ILLUSTS_PATH}?p=3` });
	controller.sync();
	assert.equal(fake.calls.length, 1);
	assert.equal(fake.calls[0].ul, ul);
	assert.equal(fake.calls[0].startPage, 3);
	assert.equal(fake.calls[0].mode, INFINITE_SCROLL.ON_REACH);
	assert.equal(fake.calls[0].loggedIn, true);
	assert.deepEqual(sources, [['9', 'illusts', 'ja']]);
	assert.equal(controller.needsCheck(), false);
});

test('同じグリッドのまま設定を変えても張り直さず、モードだけ差し替える', () => {
	// 作り直すと継ぎ足したカードが消えて、読み進めた場所を失う
	const { controller, fake, state } = setup();
	controller.sync();
	state.settings = { infiniteScroll: INFINITE_SCROLL.PREFETCH };
	controller.sync();
	assert.equal(fake.calls.length, 1);
	assert.deepEqual(fake.handles[0].modes, [INFINITE_SCROLL.PREFETCH]);
});

test('オフにしたら撤去し、?p= を基準ページへ書き戻す', () => {
	const { controller, fake, state, win, written } = setup({ path: `${ILLUSTS_PATH}?p=2` });
	controller.sync();
	// 継ぎ足して 4 ページ目まで読み進めた
	fake.calls[0].onPageChange(4);
	assert.equal(win.win.location.search, '?p=4');
	state.settings = { infiniteScroll: INFINITE_SCROLL.OFF };
	controller.sync();
	assert.equal(fake.handles[0].disposed(), true);
	assert.equal(win.win.location.search, '?p=2', '撤去したのに継ぎ足した位置の ?p= が残っている');
	assert.equal(written.length, 2);
	assert.equal(controller.isIdle(), true);
});

test('1 ページ目へ戻すときは ?p= を付けない', () => {
	const { controller, fake, win } = setup();
	controller.sync();
	fake.calls[0].onPageChange(3);
	fake.calls[0].onPageChange(1);
	assert.equal(win.win.location.search, '');
});

test('同じ ?p= なら書かない', () => {
	const { controller, fake, written } = setup({ path: `${ILLUSTS_PATH}?p=2` });
	controller.sync();
	fake.calls[0].onPageChange(2);
	assert.deepEqual(written, []);
});

test('モーダルが開いている間と、別のページへ移った後は ?p= を書かない', () => {
	const { controller, fake, state, win, written } = setup();
	controller.sync();
	state.viewerOpen = true;
	fake.calls[0].onPageChange(3);
	assert.deepEqual(written, [], 'モーダルの URL に ?p= を書いている');
	state.viewerOpen = false;
	// pixiv 本体がホームへ遷移した直後。遅らせた追従が撤去するまでの間にも知らせは来る
	win.go('/');
	fake.calls[0].onPageChange(3);
	assert.deepEqual(written, [], '遷移先の URL に ?p= を残している');
});

test('?p= を書けなかったら、自分が書いた値の記憶を戻す', (t) => {
	t.mock.method(console, 'warn', () => {});
	let fail = true;
	const writes = [];
	const box = {};
	const { controller, fake, win } = setup({
		replaceUrl: (url) => {
			if (fail) throw new Error('replace failed');
			writes.push(url);
			box.win.go(url);
		},
	});
	box.win = win;
	controller.sync();
	fake.calls[0].onPageChange(3);
	fail = false;
	assert.deepEqual(writes, []);
	// pixiv のページャで 3 ページ目へ移った。書けていない 3 を自分の値と思い込むと、pixiv が動かしたことを見落とす
	win.go(`${ILLUSTS_PATH}?p=3`);
	controller.sync();
	assert.equal(fake.calls.length, 2, '書けなかった値を自分の書き込みと取り違えている');
	assert.equal(fake.calls[1].startPage, 3);
});

test('pixiv が ?p= を基準ページへ戻しただけなら、張ったまま今の位置へ書き直す', () => {
	// モーダルを閉じた直後に Next.js が自分の履歴 state の URL へ replaceState し直すことがある
	const attach = fakeAttach({ page: 4 });
	const { controller, fake, win } = setup({ path: `${ILLUSTS_PATH}?p=2`, attach });
	controller.sync();
	fake.calls[0].onPageChange(4);
	win.go(`${ILLUSTS_PATH}?p=2`);
	controller.sync();
	assert.equal(fake.calls.length, 1, '張り直している');
	assert.equal(win.win.location.search, '?p=4');
});

test('pixiv が ?p= を動かしたら (ページャ・戻る)、その値を基準ページにして張り直す', () => {
	const { controller, fake, win } = setup();
	controller.sync();
	win.go(`${ILLUSTS_PATH}?p=5`);
	controller.sync();
	assert.equal(fake.calls.length, 2);
	assert.equal(fake.handles[0].disposed(), true);
	assert.equal(fake.calls[1].startPage, 5);
});

test('自分のモーダルの最中は何もしない', () => {
	// URL は /artworks/{id} で対象外に見えるが、撤去すると継ぎ足したカードごと消える
	const { controller, fake, state, win } = setup();
	controller.sync();
	state.viewing = true;
	win.go('/artworks/1');
	controller.sync();
	assert.equal(fake.handles[0].disposed(), false);
});

test('対象外のページへ出たら撤去し、グリッドの記憶も捨てる', () => {
	const { controller, fake, win } = setup({ path: `${ILLUSTS_PATH}?p=3` });
	controller.sync();
	win.go('/users/9/bookmarks/artworks');
	controller.sync();
	assert.equal(fake.handles[0].disposed(), true);
	// 戻ってきたら ?p= の無い URL なので 1 ページ目から張り直す
	win.go(ILLUSTS_PATH);
	controller.sync();
	assert.equal(fake.calls[1].startPage, 1);
});

test('グリッドがまだ描かれていなければ張らず、現れたら張る', () => {
	const doc = el('#document');
	const { controller, fake } = setup({ doc: { doc } });
	controller.sync();
	assert.equal(fake.calls.length, 0);
	assert.equal(controller.needsCheck(), true);
	const { ul, wrap } = makeGrid([makeCard({ id: '1' })]);
	ul.isConnected = true;
	doc.appendChild(wrap);
	controller.sync();
	assert.equal(fake.calls.length, 1);
});

test('張れなかった ul では、画像が増えるか別の ul が現れるまで試し直さない', () => {
	// 全カードがブックマーク済みの作者ページ等では、何度試しても雛形が採れない
	const attach = fakeAttach({ active: false });
	const { controller, fake, ul } = setup({ attach });
	controller.sync();
	controller.sync();
	assert.equal(fake.calls.length, 1, '同じ ul で作り直しを繰り返している');
	assert.equal(controller.needsCheck(), true);
	ul.appendChild(makeCard({ id: '0' }));
	controller.sync();
	assert.equal(fake.calls.length, 2, '画像が増えたのに試し直していない');
});

test('張るときに投げても落ちず、同じ ul では作り直しを繰り返さない', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	const attach = fakeAttach({ throws: true });
	const { controller } = setup({ attach });
	assert.doesNotThrow(() => controller.sync());
	controller.sync();
	assert.equal(warn.mock.callCount(), 1);
});

test('グリッドが描き直されて ul が外れたら張り直す', () => {
	const { controller, fake, ul, doc } = setup();
	controller.sync();
	ul.isConnected = false;
	assert.equal(controller.needsCheck(), true);
	const next = makeGrid([makeCard({ id: '1' })]);
	next.ul.isConnected = true;
	doc.children = [];
	doc.appendChild(next.wrap);
	controller.sync();
	assert.equal(fake.calls.length, 2);
	assert.equal(fake.calls[1].ul, next.ul);
});

test('自分の ?p= の書き込みで呼び戻されても 2 本張らない', () => {
	// 書き込みは注入側を通って遷移の通知になり、同期で sync() へ戻ってくることがある
	let controllerRef = null;
	const attach = fakeAttach();
	const wrapped = {
		...attach,
		attach: (doc, init) => {
			const handle = attach.attach(doc, init);
			controllerRef.sync();
			return handle;
		},
	};
	const { controller, fake } = setup({ attach: wrapped });
	controllerRef = controller;
	controller.sync();
	assert.equal(fake.calls.length, 1);
});

test('isIdle は使っておらず何も張っていないときだけ true', () => {
	const off = setup({ mode: INFINITE_SCROLL.OFF });
	assert.equal(off.controller.isIdle(), true);
	const elsewhere = setup({ path: '/users/9/bookmarks/artworks' });
	assert.equal(elsewhere.controller.isIdle(), true);
	const on = setup();
	assert.equal(on.controller.isIdle(), false);
	on.controller.sync();
	on.state.settings = { infiniteScroll: INFINITE_SCROLL.OFF };
	// 張ったまま設定だけ切った状態。撤去まで済んでいないので idle ではない
	assert.equal(on.controller.isIdle(), false);
});

test('disposeAfterClose はモーダルでなければすぐ撤去する', () => {
	const { controller, fake, win } = setup();
	controller.sync();
	controller.disposeAfterClose(() => false);
	assert.equal(fake.handles[0].disposed(), true);
	assert.equal(win.listeners(), 0);
});

test('disposeAfterClose はモーダルの最中なら閉じる popstate を待ち、待ちは 1 本だけ張る', () => {
	// 作品ページの URL のままでは ?p= を基準ページへ書き戻せない
	const { controller, fake, state, win } = setup({ path: `${ILLUSTS_PATH}?p=2` });
	controller.sync();
	fake.calls[0].onPageChange(4);
	state.viewing = true;
	win.go('/artworks/1');
	controller.disposeAfterClose(() => false);
	controller.disposeAfterClose(() => false);
	assert.equal(fake.handles[0].disposed(), false);
	assert.equal(win.listeners(), 1, '待ちが並んでいる');
	state.viewing = false;
	win.go(`${ILLUSTS_PATH}?p=4`);
	win.popstate();
	assert.equal(fake.handles[0].disposed(), true);
	assert.equal(win.win.location.search, '?p=2');
});

test('disposeAfterClose は待つ間に監視が張り直されたら撤去しない', () => {
	const { controller, fake, state, win } = setup();
	controller.sync();
	state.viewing = true;
	controller.disposeAfterClose(() => true);
	state.viewing = false;
	win.popstate();
	assert.equal(fake.handles[0].disposed(), false);
});

test('restoreParam は継ぎ足しが動いていなければ何もしない', () => {
	const { controller, written } = setup();
	assert.doesNotThrow(() => controller.restoreParam());
	assert.deepEqual(written, []);
});
