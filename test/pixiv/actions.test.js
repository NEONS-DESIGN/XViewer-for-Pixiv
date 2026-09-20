import { test } from 'node:test';
import assert from 'node:assert/strict';
import { likeIllust, addBookmark, deleteBookmark, followUser, unfollowUser, postComment, postStamp } from '../../src/pixiv/actions.js';
import { PIXIV_ERROR_KINDS } from '../../src/pixiv/errors.js';
import { fakeApiFetch, fakeFetch as fakeRawFetch } from '../helpers/pixiv.js';

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

/**
 * フォロー系の旧 PHP エンドポイント用の偽 fetch。
 * これらは {error, message, body} で包まず、値をそのまま返す (SITE_SPEC §4-5/6)。
 * @param {unknown} json 応答そのもの
 * @returns {{impl: Function, calls: Array<{url: string, init: object}>}} 偽の fetch と呼び出しの記録
 */
function fakeLegacyFetch(json) {
	return fakeRawFetch({ json });
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
	const { impl, calls } = fakeLegacyFetch([]);
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
	const { impl, calls } = fakeLegacyFetch({ user_id: '934903' });
	await unfollowUser('934903', 'TOKEN', { fetchImpl: impl });
	assert.equal(calls[0].url, '/rpc_group_setting.php');
	const params = new URLSearchParams(calls[0].init.body);
	assert.equal(params.get('mode'), 'del');
	assert.equal(params.get('type'), 'bookuser');
	assert.equal(params.get('id'), '934903');
});

test('followUser は空配列の応答を成功として扱う', async () => {
	// 成功の応答は {error, message, body} ではなく素の空配列。
	// envelope を期待すると成功しても PARSE で失敗になり、ボタンが切り替わらない
	const { impl } = fakeLegacyFetch([]);
	await assert.doesNotReject(followUser('934903', 'TOKEN', { fetchImpl: impl }));
});

test('followUser は中身のある配列 (エラー文言) を失敗として投げる', async () => {
	const { impl } = fakeLegacyFetch(['エラーが発生しました']);
	await assert.rejects(followUser('934903', 'TOKEN', { fetchImpl: impl }), (error) => {
		assert.equal(error.kind, 'api');
		assert.equal(error.message, 'エラーが発生しました');
		return true;
	});
});

test('followUser は配列でない応答を失敗として投げる', async () => {
	// 形が変わったときに成功と誤認すると、フォローできていないのにボタンが「フォロー中」になる
	const { impl } = fakeLegacyFetch({ error: false, message: '', body: [] });
	await assert.rejects(followUser('934903', 'TOKEN', { fetchImpl: impl }), (error) => {
		assert.equal(error.kind, 'parse');
		return true;
	});
});

test('unfollowUser は送った ID が返ってくれば成功として扱う', async () => {
	// 応答は {user_id}。数値で返ることもあるので文字列にそろえて比べる
	const { impl } = fakeLegacyFetch({ user_id: 934903 });
	await assert.doesNotReject(unfollowUser('934903', 'TOKEN', { fetchImpl: impl }));
});

test('unfollowUser は ID が返らなければ失敗として投げる', async () => {
	const { impl } = fakeLegacyFetch({ user_id: '1' });
	await assert.rejects(unfollowUser('934903', 'TOKEN', { fetchImpl: impl }), (error) => {
		assert.equal(error.kind, 'api');
		return true;
	});
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

/** 投稿 API が返す body の実測値 (SITE_SPEC §4)。 */
const POSTED = Object.freeze({
	user_id: '54734418',
	user_name: 'NEONS',
	comment_id: '233867999',
	comment: 'いいですね',
	stamp_id: null,
});

test('postComment は type=comment の urlencoded を送る', async () => {
	const { impl, calls } = fakeFetch(POSTED);
	const posted = await postComment('149425016', '54734418', 'いいですね', null, 'TOKEN', { fetchImpl: impl });
	assert.equal(calls[0].url, '/rpc/post_comment.php');
	const sent = [...new URLSearchParams(calls[0].init.body).entries()];
	assert.deepEqual(sent, [
		['type', 'comment'],
		['illust_id', '149425016'],
		['author_user_id', '54734418'],
		['comment', 'いいですね'],
	]);
	assert.deepEqual(posted, {
		id: '233867999', userId: '54734418', userName: 'NEONS', text: 'いいですね', stampId: null,
	});
});

test('postComment は返信のときだけ parent_id を送る', async () => {
	const { impl, calls } = fakeFetch(POSTED);
	await postComment('149425016', '54734418', 'あ', '233867786', 'TOKEN', { fetchImpl: impl });
	assert.equal(new URLSearchParams(calls[0].init.body).get('parent_id'), '233867786');
});

test('postStamp は type=stamp と stamp_id を送る', async () => {
	const { impl, calls } = fakeFetch({ ...POSTED, comment: '', stamp_id: '304' });
	const posted = await postStamp('149425016', '54734418', '304', null, 'TOKEN', { fetchImpl: impl });
	const sent = new URLSearchParams(calls[0].init.body);
	assert.equal(sent.get('type'), 'stamp');
	assert.equal(sent.get('stamp_id'), '304');
	assert.equal(sent.has('parent_id'), false);
	assert.equal(posted.stampId, '304');
	assert.equal(posted.text, '');
});

test('postStamp も返信なら parent_id を送る', async () => {
	const { impl, calls } = fakeFetch({ ...POSTED, stamp_id: '304' });
	await postStamp('1', '2', '304', '9', 'T', { fetchImpl: impl });
	assert.equal(new URLSearchParams(calls[0].init.body).get('parent_id'), '9');
});

test('comment_id が無ければ投稿は失敗として扱う', async () => {
	// ID 無しで成功にすると、画面へ差し込んだ 1 件が実体と結び付かない
	const { impl } = fakeFetch({ user_id: '1', user_name: 'x' });
	await assert.rejects(
		() => postComment('1', '2', 'a', null, 'T', { fetchImpl: impl }),
		(error) => error.kind === PIXIV_ERROR_KINDS.API,
	);
});
