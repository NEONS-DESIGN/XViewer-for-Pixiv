import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixivError, PIXIV_ERROR_KINDS, kindFromStatus } from '../../src/pixiv/errors.js';

test('PixivError は種別とステータスを保持する', () => {
	const error = new PixivError(PIXIV_ERROR_KINDS.NOT_FOUND, '見つかりません', 404);
	assert.equal(error.kind, 'not-found');
	assert.equal(error.status, 404);
	assert.equal(error.message, '見つかりません');
	assert.equal(error.name, 'PixivError');
	assert.ok(error instanceof Error);
});

test('PixivError は元の例外を cause に残す', () => {
	// 通信失敗の元例外を String() で潰すと、DevTools で原因を追えない
	const cause = new TypeError('Failed to fetch');
	const error = new PixivError(PIXIV_ERROR_KINDS.NETWORK, '通信に失敗しました', undefined, { cause });
	assert.equal(error.cause, cause);
	assert.equal(error.status, undefined);
});

test('PixivError は cause を渡さなければ cause を持たない', () => {
	const error = new PixivError(PIXIV_ERROR_KINDS.API, 'x');
	assert.equal(Object.hasOwn(error, 'cause'), false);
});

test('PIXIV_ERROR_KINDS に中断の種別がある', () => {
	// dispose 後に届いた応答を呼び出し側が黙って捨てるための種別
	assert.equal(PIXIV_ERROR_KINDS.ABORTED, 'aborted');
});

test('kindFromStatus は HTTP ステータスを種別へ写す', () => {
	// 401 は未ログイン。SITE_SPEC 実測: follow_latest / discovery / bookmarks が返す
	assert.equal(kindFromStatus(401), 'unauthorized');
	// 404 は R-18 を表示できないときの /pages。異常ではなく正常な応答
	assert.equal(kindFromStatus(404), 'not-found');
	// 400 は sensitiveFilterMode に不正な値を渡したときなど
	assert.equal(kindFromStatus(400), 'bad-request');
	assert.equal(kindFromStatus(500), 'api');
	assert.equal(kindFromStatus(200), 'api');
});
