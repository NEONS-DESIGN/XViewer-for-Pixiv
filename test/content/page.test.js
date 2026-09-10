import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserPage, parseArtworkPath, isViewerTarget, pageKey } from '../../src/content/page.js';

test('ユーザーページの各タブを認識する', () => {
	const works = { userId: '54734418', isWorksGrid: true, isTagFiltered: false };
	assert.deepEqual(parseUserPage('/users/54734418'), works);
	assert.deepEqual(parseUserPage('/users/54734418/artworks'), works);
	assert.deepEqual(parseUserPage('/users/54734418/illustrations'), works);
	assert.deepEqual(parseUserPage('/users/54734418/manga'), works);
	// ブックマークもユーザーページだが、並んでいるのは他人の作品なので作品グリッドではない
	assert.deepEqual(parseUserPage('/users/54734418/bookmarks/artworks'),
		{ userId: '54734418', isWorksGrid: false, isTagFiltered: false });
});

test('タグ絞り込み中のユーザーページを見分ける', () => {
	// この状態では profile/all と並び順が一致しないので、作品間移動を DOM の範囲に限る
	const page = parseUserPage('/users/54734418/artworks/%E3%82%AA%E3%83%AA%E3%82%B8%E3%83%8A%E3%83%AB');
	assert.deepEqual(page, { userId: '54734418', isWorksGrid: true, isTagFiltered: true });
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

test('pageKey は同じ作者の作品グリッドを同じキーにする', () => {
	// pixiv 本体のタブ操作で行き来しても、購読を組み直す必要はない
	assert.equal(pageKey('/users/1'), pageKey('/users/1/artworks'));
	assert.equal(pageKey('/users/1'), pageKey('/users/1/illustrations'));
	assert.equal(pageKey('/users/1'), pageKey('/users/1/manga'));
});

test('pageKey は作品グリッド以外を別のキーにする', () => {
	// ブックマークやフォロー中に並んでいるのは他人の作品。
	// 作品グリッドの判断を掴んだままにすると、端で「この作者の全作品」へ広げてしまう
	assert.notEqual(pageKey('/users/1'), pageKey('/users/1/bookmarks/artworks'));
	assert.notEqual(pageKey('/users/1'), pageKey('/users/1/following'));
	assert.notEqual(pageKey('/users/1'), pageKey('/users/1/mypixiv'));
});

test('parseUserPage は作品グリッドかどうかを見分ける', () => {
	assert.equal(parseUserPage('/users/1').isWorksGrid, true);
	assert.equal(parseUserPage('/users/1/artworks').isWorksGrid, true);
	assert.equal(parseUserPage('/users/1/manga').isWorksGrid, true);
	// 絞り込み中も作品グリッドではある (広げるかどうかは isTagFiltered が決める)
	assert.equal(parseUserPage('/users/1/artworks/東方').isWorksGrid, true);
	assert.equal(parseUserPage('/users/1/bookmarks/artworks').isWorksGrid, false);
	assert.equal(parseUserPage('/users/1/following').isWorksGrid, false);
	assert.equal(parseUserPage('/users/1/request').isWorksGrid, false);
});

test('pageKey は作者が違えば別のキーにする', () => {
	assert.notEqual(pageKey('/users/1'), pageKey('/users/2'));
});

test('pageKey はタグ絞り込みを別のキーにする', () => {
	// 絞り込み中は profile/all と並びが一致しないので、組み直さないといけない
	assert.notEqual(pageKey('/users/1'), pageKey('/users/1/artworks/東方'));
});

test('pageKey はタグ違いを区別しない', () => {
	// 絞り込みの有無しか見ない。タグが変わっても掴む値 (userId と絞り込み中か) は同じで、
	// 並びはクリック時に collectWorkIds が取り直すため、組み直す必要が無い
	assert.equal(pageKey('/users/1/artworks/東方'), pageKey('/users/1/artworks/オリジナル'));
});

test('pageKey はユーザーページでないパスをそのまま返す', () => {
	assert.equal(pageKey('/'), '/');
	assert.equal(pageKey('/artworks/149425016'), '/artworks/149425016');
});
