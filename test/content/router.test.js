import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, createEntryTracker, replaceUrlKeepingState } from '../../src/content/router.js';
import { NAV_EVENTS } from '../../src/common/constants.js';

/**
 * window の代わり。history と location の動きを記録する。
 * history.state は読まれた回数を数える。(isolated world から読むと古い値が返るため、読まないことを確かめる)
 * @param {string} pathname 初期パス
 * @returns {object} 偽の window
 */
function fakeWindow(pathname = '/users/1/artworks') {
	const calls = [];
	/** @type {Record<string, Function[]>} */
	const listeners = {};
	let state = null;
	const win = {
		calls,
		stateReads: 0,
		location: { pathname },
		history: {
			get state() { win.stateReads += 1; return state; },
			// 本物と同じく、pushState / replaceState で location と state も動く
			pushState(next, _title, url) { calls.push(['push', url]); win.location.pathname = url; state = next; },
			replaceState(next, _title, url) { calls.push(['replace', url]); win.location.pathname = url; state = next; },
			back() { calls.push(['back']); },
		},
		/** テストから今のエントリの state を差し替える。(読んだ回数には数えない) */
		setState(next) { state = next; },
		addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
		// 本物と同じく、登録した関数と一致したときだけ外す。(別の関数を渡す dispose を通さないため)
		removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
		dispatchEvent(event) { for (const fn of [...(listeners[event.type] || [])]) fn(event); return true; },
		/** popstate を配る。本物と同じく、戻った先のエントリの state を event.state に載せる */
		fire(type, eventState = state) { for (const fn of [...(listeners[type] || [])]) fn({ type, state: eventState }); },
		hasListener(type) { return (listeners[type] || []).length > 0; },
	};
	return win;
}

test('open は履歴を積む', () => {
	const win = fakeWindow();
	const router = createRouter(() => {}, { window: win });
	router.open('149425016');
	assert.deepEqual(win.calls[0], ['push', '/artworks/149425016']);
});

test('replace は履歴を積まない', () => {
	const win = fakeWindow();
	const router = createRouter(() => {}, { window: win });
	router.replace('149485890');
	assert.deepEqual(win.calls[0], ['replace', '/artworks/149485890']);
});

test('close は履歴を 1 つ戻す', () => {
	const win = fakeWindow();
	const router = createRouter(() => {}, { window: win });
	router.close();
	assert.deepEqual(win.calls[0], ['back']);
});

test('popstate が届く前に close を重ねても履歴は 1 つしか戻らない', () => {
	// 閉じるボタンの連打や背景クリック直後の Esc で 2 回戻ると、
	// ユーザーページより前のページへ出てしまう
	const win = fakeWindow();
	const router = createRouter(() => {}, { window: win });
	router.close();
	router.close();
	assert.deepEqual(win.calls, [['back']]);
	// popstate が来たら次の close は通る
	win.fire('popstate');
	router.close();
	assert.deepEqual(win.calls, [['back'], ['back']]);
});

test('createEntryTracker は自分が積んだエントリだけを認める', () => {
	// pixiv 本体が /artworks/{id} へ遷移したときの state は本体のもの
	const win = fakeWindow();
	const entry = createEntryTracker(win);
	assert.equal(entry.isOwn(), false);
	const router = createRouter(() => {}, { window: win, entry });
	router.open('1');
	assert.equal(entry.isOwn(), true);
	router.replace('2');
	assert.equal(entry.isOwn(), true);
	// 戻る / 進むでは、戻った先の state で判定し直す
	win.fire('popstate', { __N: true });
	assert.equal(entry.isOwn(), false);
	win.fire('popstate', { xviewer: true });
	assert.equal(entry.isOwn(), true);
	win.fire('popstate', null);
	assert.equal(entry.isOwn(), false);
});

test('pixiv 本体が履歴を動かしたら自分のエントリではなくなる', () => {
	const win = fakeWindow();
	const entry = createEntryTracker(win);
	const router = createRouter(() => {}, { window: win, entry });
	router.open('1');
	win.dispatchEvent({ type: NAV_EVENTS.NAVIGATE });
	assert.equal(entry.isOwn(), false);
});

test('ルーターとエントリの判定は history.state を読まない', () => {
	// isolated world の history.state は、ページ側が先に読むと古い値を返す。(SITE_SPEC §8)
	// 読んで書き戻すと Next.js の state を拡張の目印で上書きしてしまい、戻るで画面が切り替わらなくなる
	const win = fakeWindow();
	const entry = createEntryTracker(win);
	const router = createRouter(() => {}, { window: win, entry });
	router.open('1');
	entry.isOwn();
	router.replace('2');
	win.fire('popstate', { __N: true });
	entry.isOwn();
	router.close();
	assert.equal(win.stateReads, 0);
});

test('createEntryTracker の dispose で購読を解除する', () => {
	const win = fakeWindow();
	const entry = createEntryTracker(win);
	entry.dispose();
	assert.equal(win.hasListener('popstate'), false);
	assert.equal(win.hasListener(NAV_EVENTS.NAVIGATE), false);
});

test('replaceUrlKeepingState は URL を注入側へ渡して書き換えさせる', () => {
	const win = fakeWindow();
	win.location.href = 'https://www.pixiv.net/users/1/illustrations?p=2';
	const received = [];
	// 注入側の代役。page world で history.state を保ったまま URL だけ差し替える
	win.addEventListener(NAV_EVENTS.REPLACE_URL, (event) => {
		received.push(event.detail);
		win.location.href = event.detail;
	});
	replaceUrlKeepingState('https://www.pixiv.net/users/1/illustrations?p=3', win);
	assert.deepEqual(received, ['https://www.pixiv.net/users/1/illustrations?p=3']);
	assert.equal(win.stateReads, 0);
});

test('replaceUrlKeepingState は注入側が書き換えなかったら投げる', () => {
	// 注入スクリプトが居ないと URL は変わらない。黙って成功扱いにすると ?p= の記憶だけがずれる
	const win = fakeWindow();
	win.location.href = 'https://www.pixiv.net/users/1/illustrations?p=2';
	assert.throws(() => replaceUrlKeepingState('https://www.pixiv.net/users/1/illustrations?p=3', win));
});

test('popstate で今の作品 ID を通知する', () => {
	const win = fakeWindow('/users/1/artworks');
	const seen = [];
	createRouter((id) => seen.push(id), { window: win });
	win.location.pathname = '/artworks/1';
	win.fire('popstate');
	win.location.pathname = '/users/1/artworks';
	win.fire('popstate');
	assert.deepEqual(seen, ['1', null]);
});

test('dispose で購読を解除する', () => {
	const win = fakeWindow();
	const router = createRouter(() => {}, { window: win });
	assert.equal(win.hasListener('popstate'), true);
	router.dispose();
	assert.equal(win.hasListener('popstate'), false);
});

test('英語表示では /en を保ったまま履歴を積む', () => {
	// 接頭辞を落とすと、モーダルを閉じた後やリロードで日本語ページに飛ぶ
	const win = fakeWindow('/en/users/1/artworks');
	const router = createRouter(() => {}, { window: win });
	router.open('149425016');
	assert.deepEqual(win.calls[0], ['push', '/en/artworks/149425016']);
	// 開いている間の URL も /en 付きなので、作品を移っても接頭辞は残る
	router.replace('149485890');
	assert.deepEqual(win.calls[1], ['replace', '/en/artworks/149485890']);
});

test('英語表示でも popstate から作品 ID を読める', () => {
	const win = fakeWindow('/en/users/1/artworks');
	const seen = [];
	createRouter((id) => seen.push(id), { window: win });
	win.location.pathname = '/en/artworks/1';
	win.fire('popstate');
	win.location.pathname = '/en/users/1/artworks';
	win.fire('popstate');
	assert.deepEqual(seen, ['1', null]);
});
