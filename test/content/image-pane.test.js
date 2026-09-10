import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPageUrls, prefetchTargets } from '../../src/content/viewer/image-pane.js';

test('pickPageUrls は指定した解像度の URL を並べる', () => {
	const pages = [
		{ urls: { small: 's0', regular: 'r0', original: 'o0' } },
		{ urls: { small: 's1', regular: 'r1', original: 'o1' } },
	];
	assert.deepEqual(pickPageUrls(pages, 'regular'), ['r0', 'r1']);
	assert.deepEqual(pickPageUrls(pages, 'original'), ['o0', 'o1']);
});

test('pickPageUrls は指定した解像度が無ければ regular へ落とす', () => {
	const pages = [{ urls: { regular: 'r0' } }];
	assert.deepEqual(pickPageUrls(pages, 'original'), ['r0']);
});

test('pickPageUrls は空や不正な入力で空配列を返す', () => {
	assert.deepEqual(pickPageUrls([], 'regular'), []);
	assert.deepEqual(pickPageUrls(null, 'regular'), []);
});

test('prefetchTargets は前後の枚数分を返す', () => {
	// 5 ページの 3 枚目 (index 2) を見ていて前後 1 枚なら 1 と 3
	assert.deepEqual(prefetchTargets(2, 5, 1).sort(), [1, 3]);
});

test('prefetchTargets は端をはみ出さない', () => {
	assert.deepEqual(prefetchTargets(0, 3, 3).sort(), [1, 2]);
	assert.deepEqual(prefetchTargets(2, 3, 3).sort(), [0, 1]);
});

test('prefetchTargets は自分自身を含めない', () => {
	assert.ok(!prefetchTargets(1, 5, 2).includes(1));
});

test('prefetchTargets は 0 枚指定で空配列を返す', () => {
	assert.deepEqual(prefetchTargets(2, 5, 0), []);
});
