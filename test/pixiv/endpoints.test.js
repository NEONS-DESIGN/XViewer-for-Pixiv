import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	illustUrl,
	illustPagesUrl,
	ugoiraMetaUrl,
	commentRootsUrl,
	userProfileAllUrl,
	userProfileIllustsUrl,
	userUrl,
	safeCdnUrl,
} from '../../src/pixiv/endpoints.js';

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

test('profile/illusts は is_first_page が false なら 0 を入れる', () => {
	const url = userProfileIllustsUrl('54734418', ['1'], false);
	assert.ok(url.includes('is_first_page=0'));
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
