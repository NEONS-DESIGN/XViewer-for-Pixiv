import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockReason } from '../../src/content/viewer/blocked.js';

test('全年齢作品は誰でも見られる', () => {
	assert.equal(blockReason({ xRestrict: 0 }, { isLoggedIn: true, self: { xRestrict: 0 } }), null);
	assert.equal(blockReason({ xRestrict: 0 }, { isLoggedIn: false, self: null }), null);
});

test('未ログインの R-18 はログインを促す', () => {
	const reason = blockReason({ xRestrict: 1 }, { isLoggedIn: false, self: null });
	assert.equal(reason.kind, 'login');
	assert.match(reason.message, /ログイン/);
});

test('ログイン済みで設定が足りない R-18 は設定を促す', () => {
	const reason = blockReason({ xRestrict: 1 }, { isLoggedIn: true, self: { xRestrict: 0 } });
	assert.equal(reason.kind, 'setting');
	assert.match(reason.message, /表示設定/);
});

test('R-18G は設定が 1 でも止まる', () => {
	const reason = blockReason({ xRestrict: 2 }, { isLoggedIn: true, self: { xRestrict: 1 } });
	assert.equal(reason.kind, 'setting');
});

test('設定が足りていれば R-18G も見られる', () => {
	assert.equal(blockReason({ xRestrict: 2 }, { isLoggedIn: true, self: { xRestrict: 2 } }), null);
});
