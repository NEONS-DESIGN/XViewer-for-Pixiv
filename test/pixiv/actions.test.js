import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likeIllust, addBookmark, deleteBookmark, followUser, unfollowUser } from '../../src/pixiv/actions.js';
import { fakeApiFetch } from '../helpers/pixiv.js';

/**
 * helpers の fakeApiFetch に text() を足す。client.js の unwrap() は text() で読む。
 * @param {unknown} body 応答の body
 * @returns {{impl: Function, calls: Array<{url: string, init: object}>}} 偽の fetch と呼び出しの記録
 */
function fakeFetch(body) {
	const { impl, calls } = fakeApiFetch(body);
	const text = JSON.stringify({ error: false, message: '', body });
	const wrapped = async (url, init) => ({ ...(await impl(url, init)), text: async () => text });
	return { impl: wrapped, calls };
}

test('likeIllust は JSON を POST し、送信前のいいね状態を返す', async () => {
	const { impl, calls } = fakeFetch({ is_liked: false });
	const wasLiked = await likeIllust('149191678', 'TOKEN', { fetchImpl: impl });
	assert.equal(wasLiked, false);
	assert.equal(calls[0].url, '/ajax/illusts/like');
	assert.equal(calls[0].init.body, '{"illust_id":"149191678"}');
	assert.equal(calls[0].init.headers['x-csrf-token'], 'TOKEN');
});

test('likeIllust は既にいいね済みなら true を返す', async () => {
	const { impl } = fakeFetch({ is_liked: true });
	assert.equal(await likeIllust('1', 'T', { fetchImpl: impl }), true);
});

test('addBookmark は公開ブックマークを追加して ID を返す', async () => {
	const { impl, calls } = fakeFetch({ last_bookmark_id: '38764433361', stacc_status_id: '1' });
	const id = await addBookmark('149191678', false, 'TOKEN', { fetchImpl: impl });
	assert.equal(id, '38764433361');
	assert.equal(calls[0].url, '/ajax/illusts/bookmarks/add');
	assert.deepEqual(JSON.parse(calls[0].init.body), {
		illust_id: '149191678', restrict: 0, comment: '', tags: [],
	});
});

test('addBookmark は非公開なら restrict に 1 を入れる', async () => {
	const { impl, calls } = fakeFetch({ last_bookmark_id: '1' });
	await addBookmark('1', true, 'T', { fetchImpl: impl });
	assert.equal(JSON.parse(calls[0].init.body).restrict, 1);
});

test('deleteBookmark は FormData で bookmark_id を送る', async () => {
	const { impl, calls } = fakeFetch([]);
	await deleteBookmark('38764433361', 'TOKEN', { fetchImpl: impl });
	assert.equal(calls[0].url, '/ajax/illusts/bookmarks/delete');
	assert.ok(calls[0].init.body instanceof FormData);
	assert.equal(calls[0].init.body.get('bookmark_id'), '38764433361');
});

test('followUser は bookmark_add.php へ urlencoded で送る', async () => {
	const { impl, calls } = fakeFetch({});
	await followUser('934903', 'TOKEN', { fetchImpl: impl });
	assert.equal(calls[0].url, '/bookmark_add.php');
	const params = new URLSearchParams(calls[0].init.body);
	assert.equal(params.get('mode'), 'add');
	assert.equal(params.get('type'), 'user');
	assert.equal(params.get('user_id'), '934903');
	assert.equal(params.get('restrict'), '0');
	assert.equal(params.get('format'), 'json');
});

test('unfollowUser は rpc_group_setting.php へ送る (追加と別のエンドポイント)', async () => {
	const { impl, calls } = fakeFetch({});
	await unfollowUser('934903', 'TOKEN', { fetchImpl: impl });
	assert.equal(calls[0].url, '/rpc_group_setting.php');
	const params = new URLSearchParams(calls[0].init.body);
	assert.equal(params.get('mode'), 'del');
	assert.equal(params.get('type'), 'bookuser');
	assert.equal(params.get('id'), '934903');
});

test('addBookmark は応答に ID が無ければ失敗として投げる', async () => {
	// ID 無しで成功扱いにすると、画面はブックマーク済みなのに削除へ進めない状態になる
	const { impl } = fakeFetch({ stacc_status_id: '1' });
	await assert.rejects(addBookmark('1', false, 'T', { fetchImpl: impl }), (error) => {
		assert.equal(error.name, 'PixivError');
		return true;
	});
});

test('addBookmark は数値の ID を文字列にして返す', async () => {
	const { impl } = fakeFetch({ last_bookmark_id: 38764433361 });
	assert.equal(await addBookmark('1', false, 'T', { fetchImpl: impl }), '38764433361');
});
