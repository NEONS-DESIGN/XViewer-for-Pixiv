import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUserProfile, clearUserCache } from '../../src/pixiv/user.js';

beforeEach(() => { clearUserCache(); });

test('同じユーザーは一度しか取りに行かない', async () => {
	// サイドバー (アイコン) と actions-bar (フォロー状態) が同じ API を使う。
	// 作品を送るたびに 2 本走ると無駄な通信になる
	let calls = 0;
	const fetchJson = async () => { calls += 1; return { name: '作者' }; };
	await fetchUserProfile('1', fetchJson);
	await fetchUserProfile('1', fetchJson);
	assert.equal(calls, 1);
});

test('取得中に同じユーザーを求められても 1 本にまとめる', async () => {
	let calls = 0;
	const fetchJson = async () => {
		calls += 1;
		await Promise.resolve();
		return { name: '作者' };
	};
	const [first, second] = await Promise.all([fetchUserProfile('1', fetchJson), fetchUserProfile('1', fetchJson)]);
	assert.equal(calls, 1);
	assert.deepEqual(first, second);
});

test('ユーザーが違えば別に取りに行く', async () => {
	const seen = [];
	const fetchJson = async (userId) => { seen.push(userId); return { name: userId }; };
	await fetchUserProfile('1', fetchJson);
	await fetchUserProfile('2', fetchJson);
	assert.deepEqual(seen, ['1', '2']);
});

test('失敗は覚えない。次に呼ばれたらもう一度取りに行く', async () => {
	let calls = 0;
	const fetchJson = async () => {
		calls += 1;
		if (calls === 1) throw new Error('落ちた');
		return { name: '作者' };
	};
	await assert.rejects(() => fetchUserProfile('1', fetchJson));
	assert.deepEqual(await fetchUserProfile('1', fetchJson), { name: '作者' });
	assert.equal(calls, 2);
});

test('clearUserCache で覚えた内容を捨てる', async () => {
	let calls = 0;
	const fetchJson = async () => { calls += 1; return { name: '作者' }; };
	await fetchUserProfile('1', fetchJson);
	clearUserCache();
	await fetchUserProfile('1', fetchJson);
	assert.equal(calls, 2);
});
