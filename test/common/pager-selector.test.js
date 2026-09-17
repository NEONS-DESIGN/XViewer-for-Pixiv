import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGER_SELECTOR } from '../../src/common/constants.js';

/**
 * PAGER_SELECTOR が href の中から探している文字列。
 *
 * ここで見たいのは「セレクタが実際の URL に当たるか」なので、:has() を解する
 * CSS エンジンが要る。Node には無く、偽 DOM の matches() も :has() を解さない。
 * 代わりに [href*="..."] の探し文字列だけを取り出し、CSS の *= と同じ
 * 部分一致を実測の URL の表へ当てる。
 * @returns {string} 探し文字列
 */
function pagerNeedle() {
	const parsed = /\[href\*="([^"]+)"\]/.exec(PAGER_SELECTOR);
	assert.ok(parsed, `PAGER_SELECTOR から [href*="..."] を取り出せない: ${PAGER_SELECTOR}`);
	return parsed[1];
}

test('ページャのセレクタは実機のページャのリンクに当たる', () => {
	// SITE_SPEC §3「ページャ」の実測形。作品 461 件の作者で ?p=1 から ?p=7 まで並んでいた
	const pagerLinks = [
		'/users/54734418/illustrations?p=2',
		'/users/54734418/illustrations?p=7',
		'/users/54734418/artworks?p=2',
		'/users/54734418/manga?p=3',
	];
	const needle = pagerNeedle();
	for (const href of pagerLinks) {
		assert.ok(href.includes(needle), `ページャのリンクに当たらない: ${href}`);
	}
});

test('ページャのセレクタはタブ行のリンクに当たらない', () => {
	// 当たるとタブ行 (ホーム / イラスト / マンガ / ブックマーク) ごと消える。
	// 前半は SITE_SPEC §3 の実測形。後半は「将来タブ行のリンクにクエリが付いた版」の想定で、
	// p= だけを探していると group= や sp= の p= を拾ってしまうことを見る
	const notPager = [
		'/users/54734418',
		'/users/54734418/artworks',
		'/users/54734418/illustrations',
		'/users/54734418/manga',
		'/users/54734418/bookmarks/artworks',
		'/users/54734418/request',
		'/users/54734418/artworks?group=1',
		'/users/54734418/illustrations?lang=ja&sp=0',
	];
	const needle = pagerNeedle();
	for (const href of notPager) {
		assert.ok(!href.includes(needle), `タブ行のリンクに当たっている: ${href}`);
	}
});

test('ページャのセレクタはクエリの先頭の ?p= だけを見る', () => {
	// 承知のうえの割り切り。?p= に絞ると、別のクエリが先に付いた &p= 形式のページャには
	// 当たらない。ページャを隠すのは作品グリッドの 3 タブだけ (USER_WORKS_TAB_PATH_PATTERN)
	// で、そこで pixiv が出すのは ?p= 単独の形なので実害が無い (SITE_SPEC §3 実測)。
	// タグ絞り込みはクエリではなくパス (/users/{id}/artworks/{tag}) なので混ざらない
	assert.equal(pagerNeedle(), '?p=', 'クエリの先頭に絞られていない');
});
