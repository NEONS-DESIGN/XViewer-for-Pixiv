import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPromiseCache } from '../../src/pixiv/promise-cache.js';

/** テストで使う上限。実際の値 (pages.js / user.js) は問わない。 */
const LIMIT = 3;

/**
 * マイクロタスクを全部流す。Promise の catch が走ってキャッシュから消えるのを待つ。
 * 段数に依存しないよう、マクロタスクを 1 つ挟む。
 * @returns {Promise<void>}
 */
function settle() {
	return new Promise((resolve) => { setImmediate(resolve); });
}

test('remember した Promise を get で返す', async () => {
	const cache = createPromiseCache(LIMIT);
	const promise = cache.remember('a', () => 'A');
	assert.equal(cache.get('a'), promise);
	assert.equal(await promise, 'A');
});

test('覚えていないキーは undefined', () => {
	const cache = createPromiseCache(LIMIT);
	assert.equal(cache.get('nobody'), undefined);
});

test('取得中でも同じ Promise を返す (同時に呼ばれても 1 本にまとまる)', async () => {
	let calls = 0;
	const cache = createPromiseCache(LIMIT);
	const task = async () => { calls += 1; await Promise.resolve(); return 'A'; };
	const first = cache.get('a') ?? cache.remember('a', task);
	const second = cache.get('a') ?? cache.remember('a', task);
	assert.equal(first, second);
	await Promise.all([first, second]);
	assert.equal(calls, 1);
});

test('失敗は覚えない。次に呼ばれたらもう一度走らせられる', async () => {
	// 覚えると、通信が戻っても失敗したままになる
	const cache = createPromiseCache(LIMIT);
	await assert.rejects(() => cache.remember('a', () => Promise.reject(new Error('落ちた'))));
	await settle();
	assert.equal(cache.get('a'), undefined);
});

test('task が同期的に投げても失敗した Promise として返す', async () => {
	// 覚える前に投げられると catch を付ける相手が無い。必ず Promise に包んでから覚える
	const cache = createPromiseCache(LIMIT);
	const task = () => { throw new Error('同期的に落ちた'); };
	await assert.rejects(() => cache.remember('a', task));
	await settle();
	assert.equal(cache.get('a'), undefined);
});

test('clear を挟むと、古い Promise が後から失敗しても新しいものは残る', async () => {
	// 発行中の古い Promise が失敗したとき、無条件に消すと
	// clear 後に乗った健全なキャッシュまで巻き添えで消えてしまう
	const cache = createPromiseCache(LIMIT);
	let rejectOld;
	const gate = new Promise((_, reject) => { rejectOld = reject; });
	const old = cache.remember('a', () => gate);
	cache.clear();
	const fresh = cache.remember('a', () => 'A');
	rejectOld(new Error('古い呼び出し'));
	await assert.rejects(() => old);
	await settle();
	assert.equal(cache.get('a'), fresh, '古い失敗で新しいキャッシュが消されている');
});

test('上限を超えたら最古のキーから捨てる', async () => {
	const cache = createPromiseCache(LIMIT);
	for (let i = 0; i < LIMIT; i += 1) {
		cache.remember(String(i), () => i);
	}
	// まだ上限内。最古 (0) は残っている
	assert.notEqual(cache.get('0'), undefined);
	// 1 つ増えると最古 (0) が押し出される。次に古い 1 と新しい new は残る
	cache.remember('new', () => 'new');
	assert.equal(cache.get('0'), undefined);
	assert.notEqual(cache.get('1'), undefined);
	assert.notEqual(cache.get('new'), undefined);
});

test('replace は覚えている Promise を差し替え、数は増やさない', async () => {
	const cache = createPromiseCache(LIMIT);
	for (let i = 0; i < LIMIT; i += 1) {
		cache.remember(String(i), () => i);
	}
	const replaced = Promise.resolve('差し替え');
	cache.replace('1', replaced);
	assert.equal(cache.get('1'), replaced);
	// 上限に達した状態で replace しても最古 (0) は押し出されない
	assert.notEqual(cache.get('0'), undefined);
});

test('replace した Promise が失敗したらそれも覚えない', async () => {
	const cache = createPromiseCache(LIMIT);
	cache.remember('a', () => 'A');
	cache.replace('a', Promise.reject(new Error('落ちた')));
	await settle();
	assert.equal(cache.get('a'), undefined);
});

test('失敗した Promise が消すのは自分だけ。replace 済みなら消さない', async () => {
	const cache = createPromiseCache(LIMIT);
	let rejectOld;
	const gate = new Promise((_, reject) => { rejectOld = reject; });
	const old = cache.remember('a', () => gate);
	const fresh = Promise.resolve('A');
	cache.replace('a', fresh);
	rejectOld(new Error('古い呼び出し'));
	await assert.rejects(() => old);
	await settle();
	assert.equal(cache.get('a'), fresh);
});

test('clear で全部捨てる', () => {
	const cache = createPromiseCache(LIMIT);
	cache.remember('a', () => 'A');
	cache.remember('b', () => 'B');
	cache.clear();
	assert.equal(cache.get('a'), undefined);
	assert.equal(cache.get('b'), undefined);
});
