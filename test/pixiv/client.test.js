import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJson, postJson, postForm } from '../../src/pixiv/client.js';

/**
 * fetch の偽物を作る。
 * @param {{status?: number, json?: unknown, throws?: boolean}} options
 * @returns {{impl: Function, calls: Array<{url: string, init: object}>}}
 */
function fakeFetch(options) {
	const calls = [];
	const impl = async (url, init) => {
		calls.push({ url, init });
		if (options.throws) throw new TypeError('Failed to fetch');
		return {
			ok: (options.status ?? 200) < 400,
			status: options.status ?? 200,
			json: async () => {
				if (options.json === undefined) throw new SyntaxError('Unexpected token');
				return options.json;
			},
		};
	};
	return { impl, calls };
}

test('getJson は body を取り出して返す', async () => {
	const { impl } = fakeFetch({ json: { error: false, message: '', body: { id: '1' } } });
	const body = await getJson('/ajax/illust/1', { fetchImpl: impl });
	assert.deepEqual(body, { id: '1' });
});

test('getJson は Cookie を送る', async () => {
	const { impl, calls } = fakeFetch({ json: { error: false, body: {} } });
	await getJson('/ajax/illust/1', { fetchImpl: impl });
	assert.equal(calls[0].init.credentials, 'include');
});

test('getJson は 401 を unauthorized として投げる', async () => {
	// SITE_SPEC 実測: 未ログインで follow_latest 等が 401 を返す
	const { impl } = fakeFetch({ status: 401, json: { error: true, message: '不明なエラーが発生しました' } });
	await assert.rejects(
		() => getJson('/ajax/follow_latest/illust', { fetchImpl: impl }),
		(error) => error.kind === 'unauthorized' && error.status === 401,
	);
});

test('getJson は 404 を not-found として投げる', async () => {
	// SITE_SPEC 実測: R-18 を表示できないときの /pages
	const { impl } = fakeFetch({ status: 404, json: { error: true, message: '' } });
	await assert.rejects(
		() => getJson('/ajax/illust/1/pages', { fetchImpl: impl }),
		(error) => error.kind === 'not-found',
	);
});

test('getJson は 200 でも error:true なら投げる', async () => {
	const { impl } = fakeFetch({ json: { error: true, message: '不正なリクエストです。' } });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'api' && error.message === '不正なリクエストです。',
	);
});

test('getJson は通信の失敗を network として投げる', async () => {
	const { impl } = fakeFetch({ throws: true });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'network',
	);
});

test('getJson は JSON として読めない応答を parse として投げる', async () => {
	// SITE_SPEC 実測: ranking.php?mode=daily_r18 は 403 で HTML を返す
	const { impl } = fakeFetch({ status: 200 });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'parse',
	);
});

test('postJson は JSON と CSRF トークンを送る', async () => {
	const { impl, calls } = fakeFetch({ json: { error: false, body: { is_liked: false } } });
	const body = await postJson('/ajax/illusts/like', { illust_id: '1' }, 'TOKEN', { fetchImpl: impl });
	assert.deepEqual(body, { is_liked: false });
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.headers['content-type'], 'application/json; charset=utf-8');
	assert.equal(calls[0].init.headers['x-csrf-token'], 'TOKEN');
	assert.equal(calls[0].init.body, '{"illust_id":"1"}');
});

test('postForm は urlencoded で送る', async () => {
	const { impl, calls } = fakeFetch({ json: { error: false, body: {} } });
	await postForm('/bookmark_add.php', { mode: 'add', user_id: '934903' }, 'TOKEN', { fetchImpl: impl });
	assert.equal(calls[0].init.headers['content-type'], 'application/x-www-form-urlencoded; charset=utf-8');
	assert.equal(calls[0].init.body, 'mode=add&user_id=934903');
});
