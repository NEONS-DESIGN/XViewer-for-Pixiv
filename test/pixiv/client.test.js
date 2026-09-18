import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getJson, postJson, postFormRaw, postFormData } from '../../src/pixiv/client.js';
import { PIXIV_ERROR_KINDS } from '../../src/pixiv/errors.js';
import { fakeFetch } from '../helpers/pixiv.js';

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

test('getJson は通信の失敗を network として投げ、元の例外を cause に残す', async () => {
	const failure = new TypeError('Failed to fetch');
	const { impl } = fakeFetch({ throws: failure });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'network' && error.cause === failure,
	);
});

test('getJson は JSON として読めない 200 応答を parse として投げる', async () => {
	const { impl } = fakeFetch({ status: 200 });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'parse' && error.status === 200,
	);
});

test('getJson は非 JSON の 401 を parse ではなく unauthorized として投げる', async () => {
	// ログイン失効でログインページ (HTML) へ誘導されたとき。
	// JSON 解析を先にすると parse に化けて、セッションを捨てる分岐が動かない
	const { impl } = fakeFetch({ status: 401 });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'unauthorized' && error.status === 401,
	);
});

test('getJson は非 JSON の 403 を api として投げる', async () => {
	// SITE_SPEC 実測: ranking.php?mode=daily_r18 は 403 で HTML を返す
	const { impl } = fakeFetch({ status: 403 });
	await assert.rejects(
		() => getJson('/ranking.php', { fetchImpl: impl }),
		(error) => error.kind === 'api' && error.status === 403,
	);
});

test('getJson は応答が null なら parse として投げる', async () => {
	const { impl } = fakeFetch({ text: 'null' });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'parse',
	);
});

test('getJson は応答がオブジェクトでなければ parse として投げる', async () => {
	const { impl } = fakeFetch({ text: '"ok"' });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'parse',
	);
});

test('getJson は body が無い応答を parse として投げる', async () => {
	// undefined を返すと上位の normalizeDetail が TypeError で落ち、種別で分岐できない
	const { impl } = fakeFetch({ json: { error: false, message: '' } });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === 'parse',
	);
});

test('getJson は body が null でもそのまま返す', async () => {
	// 「無い」と「null」は区別する。null は API が意図して返した値
	const { impl } = fakeFetch({ json: { error: false, body: null } });
	assert.equal(await getJson('/ajax/x', { fetchImpl: impl }), null);
});

test('getJson は signal を fetch へ渡す', async () => {
	const { impl, calls } = fakeFetch({ json: { error: false, body: {} } });
	const controller = new AbortController();
	await getJson('/ajax/x', { fetchImpl: impl, signal: controller.signal });
	assert.equal(calls[0].init.signal, controller.signal);
});

test('getJson は中断を aborted として投げる', async () => {
	// 呼び出し側は dispose 後の中断を kind で見分けて黙れる
	const abort = new DOMException('The operation was aborted', 'AbortError');
	const { impl } = fakeFetch({ throws: abort });
	await assert.rejects(
		() => getJson('/ajax/x', { fetchImpl: impl }),
		(error) => error.kind === PIXIV_ERROR_KINDS.ABORTED && error.cause === abort,
	);
});

test('postJson は JSON と CSRF トークンを送る', async () => {
	const { impl, calls } = fakeFetch({ json: { error: false, body: { is_liked: false } } });
	const body = await postJson('/ajax/illusts/like', { illust_id: '1' }, 'TOKEN', { fetchImpl: impl });
	assert.deepEqual(body, { is_liked: false });
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.credentials, 'include');
	assert.equal(calls[0].init.headers.accept, 'application/json');
	assert.equal(calls[0].init.headers['content-type'], 'application/json; charset=utf-8');
	assert.equal(calls[0].init.headers['x-csrf-token'], 'TOKEN');
	assert.equal(calls[0].init.body, '{"illust_id":"1"}');
});

test('postFormRaw は urlencoded で送り、応答を展開せずに返す', async () => {
	// フォロー系の旧 PHP は {error, message, body} で包まない。展開すると成功しても PARSE になる
	const { impl, calls } = fakeFetch({ json: [] });
	const body = await postFormRaw('/bookmark_add.php', { mode: 'add', user_id: '934903' }, 'TOKEN', { fetchImpl: impl });
	assert.deepEqual(body, []);
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.credentials, 'include');
	assert.equal(calls[0].init.headers.accept, 'application/json');
	assert.equal(calls[0].init.headers['content-type'], 'application/x-www-form-urlencoded; charset=utf-8');
	assert.equal(calls[0].init.headers['x-csrf-token'], 'TOKEN');
	assert.equal(calls[0].init.body, 'mode=add&user_id=934903');
});

test('postFormData は FormData で送り、content-type は指定しない', async () => {
	// 境界文字列付きの content-type はブラウザが付ける。手で書くと境界が合わなくなる
	const { impl, calls } = fakeFetch({ json: { error: false, body: [] } });
	const body = await postFormData('/ajax/illusts/bookmarks/delete', { bookmark_id: '1' }, 'TOKEN', { fetchImpl: impl });
	assert.deepEqual(body, []);
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.credentials, 'include');
	assert.equal(calls[0].init.headers['x-csrf-token'], 'TOKEN');
	assert.equal(calls[0].init.headers['content-type'], undefined);
	assert.ok(calls[0].init.body instanceof FormData);
	assert.equal(calls[0].init.body.get('bookmark_id'), '1');
});

test('POST は signal を fetch へ渡す', async () => {
	const { impl, calls } = fakeFetch({ json: { error: false, body: {} } });
	const controller = new AbortController();
	await postJson('/ajax/x', {}, 'TOKEN', { fetchImpl: impl, signal: controller.signal });
	assert.equal(calls[0].init.signal, controller.signal);
});

test('POST は CSRF トークンが空なら通信せずに unauthorized として投げる', async () => {
	// 空のトークンを送っても 401 が返るだけ。往復を省き、呼び出し側の 401 と同じ分岐へ寄せる
	for (const token of ['', null, undefined]) {
		const { impl, calls } = fakeFetch({ json: { error: false, body: {} } });
		await assert.rejects(
			() => postJson('/ajax/illusts/like', {}, token, { fetchImpl: impl }),
			(error) => error.kind === 'unauthorized',
		);
		await assert.rejects(
			() => postFormRaw('/bookmark_add.php', {}, token, { fetchImpl: impl }),
			(error) => error.kind === 'unauthorized',
		);
		await assert.rejects(
			() => postFormData('/ajax/illusts/bookmarks/delete', {}, token, { fetchImpl: impl }),
			(error) => error.kind === 'unauthorized',
		);
		assert.equal(calls.length, 0);
	}
});
