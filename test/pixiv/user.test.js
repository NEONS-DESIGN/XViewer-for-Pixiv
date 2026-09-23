import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	fetchUserProfile,
	patchUserProfile,
	clearUserCache,
	USER_PROFILE_CACHE_LIMIT,
} from '../../src/pixiv/user.js';

beforeEach(() => { clearUserCache(); });

/**
 * 呼ばれた URL を記録する getJson の差し替えを作る。
 * @param {(url: string) => object} [respond] URL から応答を作る
 * @returns {{getJsonImpl: (url: string) => Promise<object>, urls: string[]}} 差し替えと記録
 */
function fakeGetJson(respond = () => ({ name: '作者' })) {
	const urls = [];
	const getJsonImpl = async (url) => { urls.push(url); return respond(url); };
	return { getJsonImpl, urls };
}

test('既定では /ajax/user/{id}?full=1 を取りに行く', async () => {
	const { getJsonImpl, urls } = fakeGetJson();
	await fetchUserProfile('54734418', 'ja', { getJsonImpl });
	assert.deepEqual(urls, ['/ajax/user/54734418?full=1&lang=ja']);
});

test('同じユーザーは一度しか取りに行かない', async () => {
	// サイドバー (アイコン) と actions-bar (フォロー状態) が同じ API を使う。
	// 作品を送るたびに 2 本走ると無駄な通信になる
	const { getJsonImpl, urls } = fakeGetJson();
	await fetchUserProfile('1', 'ja', { getJsonImpl });
	await fetchUserProfile('1', 'ja', { getJsonImpl });
	assert.equal(urls.length, 1);
});

test('取得中に同じユーザーを求められても 1 本にまとめる', async () => {
	let calls = 0;
	const getJsonImpl = async () => {
		calls += 1;
		await Promise.resolve();
		return { name: '作者' };
	};
	const [first, second] = await Promise.all([
		fetchUserProfile('1', 'ja', { getJsonImpl }),
		fetchUserProfile('1', 'ja', { getJsonImpl }),
	]);
	assert.equal(calls, 1);
	assert.deepEqual(first, second);
});

test('ユーザーが違えば別に取りに行く', async () => {
	const { getJsonImpl, urls } = fakeGetJson();
	await fetchUserProfile('1', 'ja', { getJsonImpl });
	await fetchUserProfile('2', 'ja', { getJsonImpl });
	assert.equal(urls.length, 2);
	assert.ok(urls[0].includes('/user/1?'));
	assert.ok(urls[1].includes('/user/2?'));
});

test('失敗は覚えない。次に呼ばれたらもう一度取りに行く', async () => {
	let calls = 0;
	const getJsonImpl = async () => {
		calls += 1;
		if (calls === 1) throw new Error('落ちた');
		return { name: '作者' };
	};
	await assert.rejects(() => fetchUserProfile('1', 'ja', { getJsonImpl }));
	assert.deepEqual(await fetchUserProfile('1', 'ja', { getJsonImpl }), { name: '作者' });
	assert.equal(calls, 2);
});

test('差し替えが同期的に投げても失敗として返す', async () => {
	// 覚える前に投げられると catch を付ける相手が無い。必ず Promise に包んでから覚える
	const getJsonImpl = () => { throw new Error('同期的に落ちた'); };
	await assert.rejects(() => fetchUserProfile('1', 'ja', { getJsonImpl }));
	const { getJsonImpl: ok, urls } = fakeGetJson();
	await fetchUserProfile('1', 'ja', { getJsonImpl: ok });
	assert.equal(urls.length, 1);
});

test('上限を超えたら最古のユーザーから捨てる', async () => {
	// ブックマーク一覧を長く流し見すると作者の数だけ増えるので、定常に保つ
	const { getJsonImpl, urls } = fakeGetJson();
	for (let i = 0; i < USER_PROFILE_CACHE_LIMIT; i += 1) {
		await fetchUserProfile(String(i), 'ja', { getJsonImpl });
	}
	assert.equal(urls.length, USER_PROFILE_CACHE_LIMIT);
	// まだ上限内。最古 (0) は残っている
	await fetchUserProfile('0', 'ja', { getJsonImpl });
	assert.equal(urls.length, USER_PROFILE_CACHE_LIMIT);
	// 1 人増えると最古 (0) が押し出され、次に求めると取り直す (そのとき次に古い 1 が押し出される)
	await fetchUserProfile('new', 'ja', { getJsonImpl });
	await fetchUserProfile('0', 'ja', { getJsonImpl });
	assert.equal(urls.length, USER_PROFILE_CACHE_LIMIT + 2);
	// 押し出されていない 2 と new は残っている
	await fetchUserProfile('2', 'ja', { getJsonImpl });
	await fetchUserProfile('new', 'ja', { getJsonImpl });
	assert.equal(urls.length, USER_PROFILE_CACHE_LIMIT + 2);
});

test('clearUserCache で覚えた内容を捨てる', async () => {
	const { getJsonImpl, urls } = fakeGetJson();
	await fetchUserProfile('1', 'ja', { getJsonImpl });
	clearUserCache();
	await fetchUserProfile('1', 'ja', { getJsonImpl });
	assert.equal(urls.length, 2);
});

test('patchUserProfile は覚えた内容に差分を重ねる', async () => {
	// フォロー切替後に isFollowed を書き換える。取り直さずに済ませ、状態の出どころを 1 つにする
	const { getJsonImpl, urls } = fakeGetJson(() => ({ name: '作者', isFollowed: false }));
	await fetchUserProfile('1', 'ja', { getJsonImpl });
	assert.equal(patchUserProfile('1', { isFollowed: true }), true);
	assert.deepEqual(await fetchUserProfile('1', 'ja', { getJsonImpl }), { name: '作者', isFollowed: true });
	assert.equal(urls.length, 1);
});

test('patchUserProfile は取得中でも完了後の内容に差分を重ねる', async () => {
	let resolve;
	const gate = new Promise((r) => { resolve = r; });
	const getJsonImpl = () => gate;
	const pending = fetchUserProfile('1', 'ja', { getJsonImpl });
	patchUserProfile('1', { isFollowed: true });
	resolve({ name: '作者', isFollowed: false });
	assert.deepEqual(await pending, { name: '作者', isFollowed: false });
	assert.deepEqual(await fetchUserProfile('1', 'ja', { getJsonImpl }), { name: '作者', isFollowed: true });
});

test('patchUserProfile は覚えていないユーザーには何もしない', async () => {
	assert.equal(patchUserProfile('nobody', { isFollowed: true }), false);
	const { getJsonImpl, urls } = fakeGetJson();
	await fetchUserProfile('nobody', 'ja', { getJsonImpl });
	assert.equal(urls.length, 1);
});

test('patchUserProfile は取得が失敗したときも失敗を覚えない', async () => {
	let calls = 0;
	const getJsonImpl = async () => {
		calls += 1;
		await Promise.resolve();
		if (calls === 1) throw new Error('落ちた');
		return { name: '作者' };
	};
	const pending = fetchUserProfile('1', 'ja', { getJsonImpl });
	patchUserProfile('1', { isFollowed: true });
	await assert.rejects(() => pending);
	await Promise.resolve();
	assert.deepEqual(await fetchUserProfile('1', 'ja', { getJsonImpl }), { name: '作者' });
	assert.equal(calls, 2);
});
