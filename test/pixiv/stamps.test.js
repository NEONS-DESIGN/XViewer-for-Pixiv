import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampIds, STAMP_GROUPS, STAMPS_PER_GROUP } from '../../src/pixiv/stamps.js';
import { stampUrl } from '../../src/pixiv/endpoints.js';

test('スタンプは 4 グループ 10 個ずつの 40 個', () => {
	const ids = stampIds();
	assert.equal(ids.length, STAMP_GROUPS.length * STAMPS_PER_GROUP);
	assert.equal(ids.length, 40);
});

test('並びは pixiv 本体と同じ 3xx -> 4xx -> 2xx -> 1xx', () => {
	const ids = stampIds();
	assert.equal(ids[0], '301');
	assert.equal(ids[9], '310');
	assert.equal(ids[10], '401');
	assert.equal(ids[20], '201');
	assert.equal(ids[30], '101');
	assert.equal(ids[39], '110');
});

test('本体が隠しているグループは持たない', () => {
	// 601-610 / 701-710 は hidden: true で本体も出さない (SITE_SPEC 実測)
	const ids = stampIds();
	assert.equal(ids.some((id) => id.startsWith('6') || id.startsWith('7')), false);
});

test('すべて stampUrl に通る', () => {
	// stampUrl は数字でない ID を null にする。一覧の ID がその関門を通らないと画像が出ない
	assert.equal(stampIds().every((id) => stampUrl(id) !== null), true);
});
