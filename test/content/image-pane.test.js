import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPageUrls, prefetchTargets } from '../../src/content/viewer/image-pane.js';

/** 実際の CDN と同じ形の URL を作る。安全側の関門を通す必要があるため。 */
const cdn = (name) => `https://i.pximg.net/img-master/img/2026/09/10/00/00/00/${name}.jpg`;

test('pickPageUrls は指定した解像度の URL を並べる', () => {
	const pages = [
		{ urls: { small: cdn('s0'), regular: cdn('r0'), original: cdn('o0') } },
		{ urls: { small: cdn('s1'), regular: cdn('r1'), original: cdn('o1') } },
	];
	assert.deepEqual(pickPageUrls(pages, 'regular'), [cdn('r0'), cdn('r1')]);
	assert.deepEqual(pickPageUrls(pages, 'original'), [cdn('o0'), cdn('o1')]);
});

test('pickPageUrls は指定した解像度が無ければ regular へ落とす', () => {
	const pages = [{ urls: { regular: cdn('r0') } }];
	assert.deepEqual(pickPageUrls(pages, 'original'), [cdn('r0')]);
});

test('pickPageUrls は CDN 以外の URL を空文字に落とす', () => {
	// 応答の値はそのまま img の src になるので、外部オリジンへ出させない。
	// 空文字にすれば img の error ハンドラが拾い、ペインが自分でエラーを出す
	const pages = [
		{ urls: { regular: 'https://evil.example.com/x.jpg' } },
		{ urls: { regular: 'javascript:alert(1)' } },
		{ urls: { regular: '/relative/x.jpg' } },
		{ urls: { regular: 'http://i.pximg.net/x.jpg' } },
	];
	assert.deepEqual(pickPageUrls(pages, 'regular'), ['', '', '', '']);
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
