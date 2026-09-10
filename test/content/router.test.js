import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../../src/content/router.js';

/**
 * window の代わり。history と location の動きを記録する。
 * @param {string} pathname 初期パス
 * @returns {object} 偽の window
 */
function fakeWindow(pathname = '/users/1/artworks') {
	const calls = [];
	const listeners = {};
	return {
		calls,
		location: { pathname },
		history: {
			pushState(state, _title, url) { calls.push(['push', url]); this._win.location.pathname = url; },
			replaceState(state, _title, url) { calls.push(['replace', url]); this._win.location.pathname = url; },
			back() { calls.push(['back']); },
			_win: null,
		},
		addEventListener(type, fn) { listeners[type] = fn; },
		removeEventListener(type) { delete listeners[type]; },
		fire(type) { listeners[type]?.(); },
		hasListener(type) { return Boolean(listeners[type]); },
	};
}

test('open は履歴を積む', () => {
	const win = fakeWindow();
	win.history._win = win;
	const router = createRouter(() => {}, { window: win });
	router.open('149425016');
	assert.deepEqual(win.calls[0], ['push', '/artworks/149425016']);
});

test('replace は履歴を積まない', () => {
	const win = fakeWindow();
	win.history._win = win;
	const router = createRouter(() => {}, { window: win });
	router.replace('149485890');
	assert.deepEqual(win.calls[0], ['replace', '/artworks/149485890']);
});

test('close は履歴を 1 つ戻す', () => {
	const win = fakeWindow();
	win.history._win = win;
	const router = createRouter(() => {}, { window: win });
	router.close();
	assert.deepEqual(win.calls[0], ['back']);
});

test('currentWorkId は今の URL の作品 ID を返す', () => {
	const win = fakeWindow('/artworks/149425016');
	win.history._win = win;
	const router = createRouter(() => {}, { window: win });
	assert.equal(router.currentWorkId(), '149425016');
});

test('ユーザーページに戻ると currentWorkId は null', () => {
	const win = fakeWindow('/users/54734418/artworks');
	win.history._win = win;
	const router = createRouter(() => {}, { window: win });
	assert.equal(router.currentWorkId(), null);
});

test('popstate で今の作品 ID を通知する', () => {
	const win = fakeWindow('/users/1/artworks');
	win.history._win = win;
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
	win.history._win = win;
	const router = createRouter(() => {}, { window: win });
	assert.equal(win.hasListener('popstate'), true);
	router.dispose();
	assert.equal(win.hasListener('popstate'), false);
});
