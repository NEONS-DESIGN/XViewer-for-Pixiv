import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNextData } from '../../src/pixiv/session.js';
import { buildNextData } from '../helpers/pixiv.js';

test('ログイン中のセッションを読む', () => {
	const text = buildNextData({ isLoggedIn: true, self: { xRestrict: 2, hideAiWorks: true }, token: 'abc' });
	const session = parseNextData(text);
	assert.equal(session.isLoggedIn, true);
	assert.equal(session.self.xRestrict, 2);
	assert.equal(session.self.hideAiWorks, true);
	assert.equal(session.csrfToken, 'abc');
});

test('未ログインなら self は null', () => {
	const session = parseNextData(buildNextData({ isLoggedIn: false, self: null }));
	assert.equal(session.isLoggedIn, false);
	assert.equal(session.self, null);
});

test('self に xRestrict が無ければ 0 に丸める', () => {
	const session = parseNextData(buildNextData({ self: {} }));
	assert.equal(session.self.xRestrict, 0);
	assert.equal(session.self.hideAiWorks, false);
});

test('壊れた JSON でも例外を投げず未ログイン相当を返す', () => {
	const session = parseNextData('{壊れている');
	assert.deepEqual(session, { isLoggedIn: false, self: null, csrfToken: null });
});

test('null を渡しても未ログイン相当を返す', () => {
	assert.deepEqual(parseNextData(null), { isLoggedIn: false, self: null, csrfToken: null });
});

test('api.token が無ければ csrfToken は null', () => {
	// 旧 UI ページなど token を持たない __NEXT_DATA__。client.js が空トークンを unauthorized に倒す
	const text = JSON.stringify({
		props: {
			pageProps: {
				isLoggedIn: true,
				serverSerializedPreloadedState: JSON.stringify({ userData: { self: { xRestrict: 1 } } }),
			},
		},
	});
	const session = parseNextData(text);
	assert.equal(session.isLoggedIn, true);
	assert.equal(session.csrfToken, null);
	assert.equal(session.self.xRestrict, 1);
});

test('preloadedState が壊れていてもログイン状態だけは読める', () => {
	const text = JSON.stringify({
		props: { pageProps: { isLoggedIn: true, serverSerializedPreloadedState: '{壊れている' } },
	});
	const session = parseNextData(text);
	assert.equal(session.isLoggedIn, true);
	assert.equal(session.self, null);
	assert.equal(session.csrfToken, null);
});

test('自分のユーザー ID を self.id として読む', () => {
	// 自分の作品にいいね・ブックマーク・フォローを出さないための判定材料 (SITE_SPEC §6)
	const session = parseNextData(buildNextData({ self: { id: '16343044', xRestrict: 1 } }));
	assert.equal(session.self.id, '16343044');
});

test('self.id が数値で来ても文字列にそろえる', () => {
	// 作品詳細の userId は文字列。=== で比べるので型をそろえておく
	const session = parseNextData(buildNextData({ self: { id: 16343044 } }));
	assert.equal(session.self.id, '16343044');
});

test('self.id が無ければ null にする', () => {
	// 判定できないときは「自分ではない」に倒す。空文字と ID の一致で誤判定しないため
	assert.equal(parseNextData(buildNextData({ self: {} })).self.id, null);
	assert.equal(parseNextData(buildNextData({ self: { id: '' } })).self.id, null);
});
