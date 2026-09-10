import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canView, normalizeDetail, ILLUST_TYPES } from '../../src/pixiv/normalize.js';

test('canView は作品の xRestrict とユーザー設定を比べる', () => {
	// SITE_SPEC 実測: 設定 OFF (self.xRestrict=0) では R-18 の /pages が 404 になる
	assert.equal(canView({ xRestrict: 0 }, { xRestrict: 0 }), true);
	assert.equal(canView({ xRestrict: 1 }, { xRestrict: 0 }), false);
	assert.equal(canView({ xRestrict: 1 }, { xRestrict: 1 }), true);
	assert.equal(canView({ xRestrict: 2 }, { xRestrict: 1 }), false);
	assert.equal(canView({ xRestrict: 2 }, { xRestrict: 2 }), true);
});

test('canView は未ログイン (self が null) を全年齢のみとして扱う', () => {
	assert.equal(canView({ xRestrict: 0 }, null), true);
	assert.equal(canView({ xRestrict: 1 }, null), false);
});

test('normalizeDetail は詳細をまとめ、いいね済みとブックマーク ID を取り出す', () => {
	const raw = {
		illustId: '149425016',
		illustTitle: '音の伝わり方',
		illustComment: '本文',
		illustType: 0,
		pageCount: 1,
		xRestrict: 0,
		aiType: 1,
		userId: '54734418',
		userName: 'Pt',
		createDate: '2026-09-08T08:45:00+00:00',
		likeCount: 2299,
		bookmarkCount: 2740,
		viewCount: 42852,
		commentCount: 58,
		commentOff: 0,
		likeData: true,
		bookmarkData: { id: '38764402172', private: false },
		tags: { tags: [{ tag: 'オリジナル' }, { tag: '狛神みこと' }] },
		urls: { mini: 'm', thumb: 't', small: 's', regular: 'r', original: 'o' },
	};
	const detail = normalizeDetail(raw);
	assert.equal(detail.id, '149425016');
	assert.equal(detail.title, '音の伝わり方');
	assert.equal(detail.comment, '本文');
	assert.equal(detail.likeCount, 2299);
	assert.equal(detail.likedByMe, true);
	assert.equal(detail.bookmarkId, '38764402172');
	assert.deepEqual(detail.tags, ['オリジナル', '狛神みこと']);
	assert.equal(detail.urls.original, 'o');
	assert.equal(detail.commentOff, false);
});

test('normalizeDetail はブックマークしていない作品の bookmarkId を null にする', () => {
	const detail = normalizeDetail({
		illustId: '1', illustTitle: 'x', illustComment: '', illustType: 0, pageCount: 1,
		xRestrict: 0, aiType: 1, userId: '2', userName: 'y', createDate: '',
		likeCount: 0, bookmarkCount: 0, viewCount: 0, commentCount: 0, commentOff: 0,
		likeData: false, bookmarkData: null, tags: { tags: [] }, urls: {},
	});
	assert.equal(detail.bookmarkId, null);
	assert.equal(detail.likedByMe, false);
});

test('ILLUST_TYPES はうごイラを 2 とする', () => {
	assert.equal(ILLUST_TYPES.ILLUST, 0);
	assert.equal(ILLUST_TYPES.MANGA, 1);
	assert.equal(ILLUST_TYPES.UGOIRA, 2);
});
