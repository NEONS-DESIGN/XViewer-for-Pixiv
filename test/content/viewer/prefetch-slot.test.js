import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrefetchSlot } from '../../../src/content/viewer/prefetch-slot.js';

test('同じ ID を期限内に take すると同じ Promise を返し、枠は空になる', () => {
	let t = 0;
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => t });
	const p = Promise.resolve(1);
	slot.put('1', () => p);
	t = 50;
	assert.equal(slot.take('1'), p);
	assert.equal(slot.take('1'), null);
});

test('期限切れ・別の ID の take は null を返し、走っている取得を止める', () => {
	let t = 0;
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => t });
	let signal;
	slot.put('1', (s) => { signal = s; return new Promise(() => {}); });
	assert.equal(slot.take('2'), null);
	assert.equal(signal.aborted, true);
	slot.put('1', (s) => { signal = s; return new Promise(() => {}); });
	t = 101;
	assert.equal(slot.take('1'), null);
	assert.equal(signal.aborted, true);
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

test('drop は中身を止めて空にする', () => {
	const slot = createPrefetchSlot({ ttlMs: 100, now: () => 0 });
	let signal;
	slot.put('1', (s) => { signal = s; return new Promise(() => {}); });
	slot.drop();
	assert.equal(signal.aborted, true);
	assert.equal(slot.peekId(), null);
	assert.equal(slot.peekPromise(), null);
});
