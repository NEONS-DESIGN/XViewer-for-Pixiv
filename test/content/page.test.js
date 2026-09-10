import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserPage, parseArtworkPath, isViewerTarget } from '../../src/content/page.js';

test('ユーザーページの各タブを認識する', () => {
	assert.deepEqual(parseUserPage('/users/54734418'), { userId: '54734418', isTagFiltered: false });
	assert.deepEqual(parseUserPage('/users/54734418/artworks'), { userId: '54734418', isTagFiltered: false });
	assert.deepEqual(parseUserPage('/users/54734418/illustrations'), { userId: '54734418', isTagFiltered: false });
	assert.deepEqual(parseUserPage('/users/54734418/manga'), { userId: '54734418', isTagFiltered: false });
	assert.deepEqual(parseUserPage('/users/54734418/bookmarks/artworks'), { userId: '54734418', isTagFiltered: false });
});

test('タグ絞り込み中のユーザーページを見分ける', () => {
	// この状態では profile/all と並び順が一致しないので、作品間移動を DOM の範囲に限る
	const page = parseUserPage('/users/54734418/artworks/%E3%82%AA%E3%83%AA%E3%82%B8%E3%83%8A%E3%83%AB');
	assert.deepEqual(page, { userId: '54734418', isTagFiltered: true });
});

test('ユーザーページでない URL は null', () => {
	assert.equal(parseUserPage('/artworks/149425016'), null);
	assert.equal(parseUserPage('/'), null);
	assert.equal(parseUserPage('/ranking.php'), null);
});

test('作品パスから ID を取り出す', () => {
	assert.equal(parseArtworkPath('/artworks/149425016'), '149425016');
});

test('作品パスでない URL は null', () => {
	// タグ絞り込みリンクを作品リンクと取り違えないことの確認
	assert.equal(parseArtworkPath('/users/54734418/artworks/オリジナル'), null);
	assert.equal(parseArtworkPath('/artworks/'), null);
	assert.equal(parseArtworkPath('/artworks/abc'), null);
	assert.equal(parseArtworkPath('/artworks/123/extra'), null);
});

test('isViewerTarget はユーザーページでだけ true', () => {
	assert.equal(isViewerTarget('/users/54734418/artworks'), true);
	assert.equal(isViewerTarget('/artworks/149425016'), false);
	assert.equal(isViewerTarget('/'), false);
});
