import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrefetchSlot } from '../../../src/content/viewer/prefetch-slot.js';

test('同じ ID を期限内に takeEntry すると同じ Promise を返し、枠は空になる', () => {
	let t = 0;
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => t });
	const p = Promise.resolve(1);
	slot.put('1', () => p);
	t = 50;
	assert.equal(slot.takeEntry('1').promise, p);
	assert.equal(slot.takeEntry('1'), null);
});

test('put は前の中身を止めて差し替える。同じ ID なら何もしない', () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	let first;
	let calls = 0;
	slot.put('1', (s) => { first = s; calls += 1; return new Promise(() => {}); });
	slot.put('1', () => { calls += 1; return new Promise(() => {}); });
	assert.equal(calls, 1);
	slot.put('2', () => new Promise(() => {}));
	assert.equal(first.aborted, true);
	assert.equal(slot.peekId(), '2');
});

test('中の Promise が拒否しても未処理の拒否にならない', async () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	slot.put('1', () => Promise.reject(new Error('x')));
	slot.drop();
	await new Promise((resolve) => setImmediate(resolve));
});

test('peekPromise は空にせずに中身の Promise を覗く', () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	assert.equal(slot.peekPromise(), null);
	const p = new Promise(() => {});
	slot.put('1', () => p);
	assert.equal(slot.peekPromise(), p);
	// 覗くだけでは空にならない
	assert.equal(slot.peekId(), '1');
});

test('takeEntry は当たれば Promise と AbortController を渡して空にする', () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	let signal;
	const p = new Promise(() => {});
	slot.put('1', (s) => { signal = s; return p; });
	const entry = slot.takeEntry('1');
	assert.equal(entry.promise, p);
	// 受け取った側が止められる
	entry.controller.abort();
	assert.equal(signal.aborted, true);
	assert.equal(slot.peekId(), null);
	assert.equal(slot.takeEntry('1'), null);
});

test('takeEntry は外れたら走っている取得を止めて null を返す', () => {
	let t = 0;
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => t });
	let signal;
	slot.put('1', (s) => { signal = s; return new Promise(() => {}); });
	assert.equal(slot.takeEntry('2'), null);
	assert.equal(signal.aborted, true);
	slot.put('1', (s) => { signal = s; return new Promise(() => {}); });
	t = 101;
	assert.equal(slot.takeEntry('1'), null);
	assert.equal(signal.aborted, true);
});

test('drop は中身を止めて空にする', () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	let signal;
	slot.put('1', (s) => { signal = s; return new Promise(() => {}); });
	slot.drop();
	assert.equal(signal.aborted, true);
	assert.equal(slot.peekId(), null);
	assert.equal(slot.peekPromise(), null);
});

test('peekId は寿命が切れた中身の ID を返さない', () => {
	// 切れた中身は開いても使われない。同じ ID だからと温め直しを止めない
	let t = 0;
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => t });
	slot.put('1', () => new Promise(() => {}));
	assert.equal(slot.peekId(), '1');
	t = 100;
	assert.equal(slot.peekId(), null);
	let calls = 0;
	slot.put('1', () => { calls += 1; return new Promise(() => {}); });
	assert.equal(calls, 1, '切れていれば入れ直す');
	assert.equal(slot.peekId(), '1');
});

test('中身が失敗したら自分で空にし、同じ ID を入れ直せば取り直す', async () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	let calls = 0;
	slot.put('1', () => { calls += 1; return Promise.reject(new Error('offline')); });
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(slot.peekId(), null);
	assert.equal(slot.takeEntry('1'), null, '失敗した中身を開くときに渡さない');
	slot.put('1', () => { calls += 1; return new Promise(() => {}); });
	assert.equal(calls, 2);
});

test('失敗したのが前の中身なら、差し替えた後の中身は消さない', async () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	let fail;
	slot.put('1', () => new Promise((_, reject) => { fail = reject; }));
	const next = new Promise(() => {});
	slot.put('2', () => next);
	fail(new Error('aborted'));
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(slot.peekPromise(), next);
});
