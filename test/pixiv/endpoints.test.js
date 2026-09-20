import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	illustUrl,
	illustPagesUrl,
	ugoiraMetaUrl,
	commentRootsUrl,
	commentRepliesUrl,
	userProfileAllUrl,
	userProfileIllustsUrl,
	userUrl,
	safeCdnUrl,
	emojiUrl,
	stampUrl,
	ACTION_URLS,
} from '../../src/pixiv/endpoints.js';
import { WORK_CATEGORY } from '../../src/common/constants.js';

test('作品まわりの URL を組み立てる', () => {
	assert.equal(illustUrl('149425016'), '/ajax/illust/149425016?lang=ja');
	assert.equal(illustPagesUrl('149425016'), '/ajax/illust/149425016/pages?lang=ja');
	assert.equal(ugoiraMetaUrl('149448910'), '/ajax/illust/149448910/ugoira_meta?lang=ja');
});

test('コメントの URL に offset と limit が入る', () => {
	assert.equal(
		commentRootsUrl('149425016', 0, 30),
		'/ajax/illusts/comments/roots?illust_id=149425016&offset=0&limit=30&lang=ja',
	);
});

test('返信の URL は page 始まりで組み立てる', () => {
	// SITE_SPEC §4 実測: offset/limit ではなく 1 始まりの page
	assert.equal(
		commentRepliesUrl('233573595', 1),
		'/ajax/illusts/comments/replies?comment_id=233573595&page=1&lang=ja',
	);
	assert.equal(
		commentRepliesUrl('233573595', 2),
		'/ajax/illusts/comments/replies?comment_id=233573595&page=2&lang=ja',
	);
});

test('ユーザーまわりの URL を組み立てる', () => {
	assert.equal(userUrl('54734418'), '/ajax/user/54734418?full=1&lang=ja');
	assert.equal(userProfileAllUrl('54734418'), '/ajax/user/54734418/profile/all?lang=ja');
});

test('profile/illusts は ids[] を URL エンコードして並べる', () => {
	// SITE_SPEC 実測: ids%5B%5D= 形式。sensitiveFilterMode は省略してよい
	assert.equal(
		userProfileIllustsUrl('54734418', ['1', '2'], true),
		'/ajax/user/54734418/profile/illusts?ids%5B%5D=1&ids%5B%5D=2'
			+ '&work_category=illustManga&is_first_page=1&lang=ja',
	);
});

test('profile/illusts の work_category はタブの種別に合わせる', () => {
	// SITE_SPEC 実測: pixiv 本体はイラストタブで illust を送る。
	// WORK_CATEGORY.ILLUST は profile/all の応答キー (illusts) なので、そのままでは送れない
	assert.ok(
		userProfileIllustsUrl('54734418', ['1'], true, WORK_CATEGORY.ILLUST)
			.includes('&work_category=illust&'),
	);
	assert.ok(
		userProfileIllustsUrl('54734418', ['1'], true, WORK_CATEGORY.MANGA)
			.includes('&work_category=manga&'),
	);
	// null は /users/{id}/artworks タブ (イラストと漫画の両方)
	assert.ok(
		userProfileIllustsUrl('54734418', ['1'], true, null)
			.includes('&work_category=illustManga&'),
	);
});

test('profile/illusts は知らない種別を両方 (illustManga) に倒す', () => {
	// 値は WORK_CATEGORY_BY_TAB 経由でしか来ないが、来ても pixiv に知らない値を送らない
	assert.ok(
		userProfileIllustsUrl('54734418', ['1'], true, 'novels')
			.includes('&work_category=illustManga&'),
	);
	assert.ok(
		userProfileIllustsUrl('54734418', ['1'], true, undefined)
			.includes('&work_category=illustManga&'),
	);
});

test('profile/illusts は is_first_page が false なら 0 を入れる', () => {
	const url = userProfileIllustsUrl('54734418', ['1'], false);
	assert.ok(url.includes('is_first_page=0'));
});

test('絵文字の画像 URL を組み立てる', () => {
	// SITE_SPEC 実測: 静的ファイルの CDN に ID そのままの png が置いてある
	assert.equal(emojiUrl(104), 'https://s.pximg.net/common/images/emoji/104.png');
});

test('スタンプの画像 URL を組み立てる', () => {
	assert.equal(
		stampUrl('304'),
		'https://s.pximg.net/common/images/stamp/generated-stamps/304_s.jpg',
	);
	// API は文字列で返すが、数値で来ても同じ URL にする
	assert.equal(stampUrl(304), 'https://s.pximg.net/common/images/stamp/generated-stamps/304_s.jpg');
});

test('スタンプの ID が数字でなければ URL を作らない', () => {
	// API の値をそのままパスに埋めない。safeCdnUrl と同じ考え方
	assert.equal(stampUrl('../../evil'), null);
	assert.equal(stampUrl('304.jpg'), null);
	assert.equal(stampUrl(''), null);
	assert.equal(stampUrl(null), null);
	assert.equal(stampUrl(undefined), null);
});

test('safeCdnUrl は pixiv の CDN の URL だけを通す', () => {
	const url = 'https://i.pximg.net/user-profile/img/2026/01/01/00/00/00/1_50.jpg';
	assert.equal(safeCdnUrl(url), url);
	assert.equal(safeCdnUrl('https://s.pximg.net/common/images/x.png'), 'https://s.pximg.net/common/images/x.png');
});

test('safeCdnUrl は別のホストと http を弾く', () => {
	// API の応答をそのまま外部オリジンへのリクエストにしないための関門
	assert.equal(safeCdnUrl('https://example.com/a.jpg'), null);
	assert.equal(safeCdnUrl('https://evil.i.pximg.net/a.jpg'), null);
	assert.equal(safeCdnUrl('http://i.pximg.net/a.jpg'), null);
});

test('safeCdnUrl は URL でない値と空を弾く', () => {
	assert.equal(safeCdnUrl('javascript:alert(1)'), null);
	assert.equal(safeCdnUrl('/img/a.jpg'), null);
	assert.equal(safeCdnUrl(''), null);
	assert.equal(safeCdnUrl(null), null);
	assert.equal(safeCdnUrl(undefined), null);
});

test('コメント投稿は旧 RPC のパス', () => {
	assert.equal(ACTION_URLS.POST_COMMENT, '/rpc/post_comment.php');
});
