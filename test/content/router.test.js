import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, isOwnHistoryEntry } from '../../src/content/router.js';

/**
 * window の代わり。history と location の動きを記録する。
 * @param {string} pathname 初期パス
 * @returns {object} 偽の window
 */
function fakeWindow(pathname = '/users/1/artworks') {
	const calls = [];
	const listeners = {};
	const win = {
		calls,
		location: { pathname },
		history: {
			state: null,
			// 本物と同じく、pushState / replaceState で location と state も動く
			pushState(state, _title, url) { calls.push(['push', url]); win.location.pathname = url; win.history.state = state; },
			replaceState(state, _title, url) { calls.push(['replace', url]); win.location.pathname = url; win.history.state = state; },
			back() { calls.push(['back']); },
		},
		addEventListener(type, fn) { listeners[type] = fn; },
		removeEventListener(type) { delete listeners[type]; },
		fire(type) { listeners[type]?.(); },
		hasListener(type) { return Boolean(listeners[type]); },
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

test('isOwnHistoryEntry は自分が積んだ state だけを認める', () => {
	// pixiv 本体が /artworks/{id} へ遷移したときの state は本体のもの
	const win = fakeWindow();
	assert.equal(isOwnHistoryEntry(win), false);
	const router = createRouter(() => {}, { window: win });
	router.open('1');
	assert.equal(isOwnHistoryEntry(win), true);
	win.history.state = { __N: true };
	assert.equal(isOwnHistoryEntry(win), false);
	win.history.state = null;
	assert.equal(isOwnHistoryEntry(win), false);
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
