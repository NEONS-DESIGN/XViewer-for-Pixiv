import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workIdFromLink, collectWorkIds } from '../../src/content/grid.js';

/**
 * querySelectorAll だけを持つ最小の要素の代わり。
 * @param {string[]} hrefs リンクの href
 * @returns {object} root の代わり
 */
function fakeRoot(hrefs) {
	return {
		querySelectorAll() {
			return hrefs.map((href) => ({ getAttribute: () => href }));
		},
	};
}

const ORIGIN = 'https://www.pixiv.net';

test('作品リンクから ID を取り出す', () => {
	assert.equal(workIdFromLink('/artworks/149425016', ORIGIN), '149425016');
	assert.equal(workIdFromLink('https://www.pixiv.net/artworks/149425016', ORIGIN), '149425016');
});

test('タグ絞り込みリンクは作品リンクとして扱わない', () => {
	assert.equal(workIdFromLink('/users/54734418/artworks/オリジナル', ORIGIN), null);
});

test('壊れた href でも例外を投げない', () => {
	assert.equal(workIdFromLink('', ORIGIN), null);
	assert.equal(workIdFromLink(null, ORIGIN), null);
});

test('collectWorkIds は DOM 順で ID を集める', () => {
	const root = fakeRoot(['/artworks/3', '/artworks/2', '/artworks/1']);
	assert.deepEqual(collectWorkIds(root, ORIGIN), ['3', '2', '1']);
});

test('collectWorkIds は同じ作品の 2 本目のリンクを捨てる', () => {
	// 1 作品につき画像用とタイトル用の 2 本のリンクがある
	const root = fakeRoot(['/artworks/3', '/artworks/3', '/artworks/2', '/artworks/2']);
	assert.deepEqual(collectWorkIds(root, ORIGIN), ['3', '2']);
});

test('collectWorkIds はタグ絞り込みリンクを混ぜない', () => {
	const root = fakeRoot(['/users/1/artworks/tag', '/artworks/5']);
	assert.deepEqual(collectWorkIds(root, ORIGIN), ['5']);
});
