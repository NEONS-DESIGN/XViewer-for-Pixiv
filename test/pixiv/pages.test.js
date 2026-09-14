import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPageSource, clearPageSourceCache } from '../../src/pixiv/pages.js';
import { WORK_CATEGORY } from '../../src/common/constants.js';

// 各テストが同じ userId '1' を使うため、キャッシュを挟むと前のテストの ID が漏れる。
// 実装のキャッシュ自体は正しい挙動なので、テスト側を独立させる。
beforeEach(() => {
	clearPageSourceCache();
});

/**
 * profile/all と profile/illusts に応える偽の getJson を作る。
 * @param {string[]} illustIds illusts のキー
 * @param {string[]} [mangaIds] manga のキー
 * @returns {{impl: Function, urls: string[]}} 偽の getJson と呼ばれた URL
 */
function fakeGet(illustIds, mangaIds = []) {
	const urls = [];
	const impl = async (url) => {
		urls.push(url);
		if (url.includes('/profile/all')) {
			return {
				illusts: Object.fromEntries(illustIds.map((id) => [id, null])),
				manga: Object.fromEntries(mangaIds.map((id) => [id, null])),
			};
		}
		// 渡された ids[] を拾って、わざと逆順の Map で返す (順序保証が無いことの再現)
		const ids = [...new URL(url, 'https://www.pixiv.net').searchParams.getAll('ids[]')];
		return { works: Object.fromEntries([...ids].reverse().map((id) => [id, { id, title: `作品${id}` }])) };
	};
	return { impl, urls };
}

test('ID の数値降順で 48 件ずつ切り出す', async () => {
	// 本体のページャと同じ並びになることが要 (SITE_SPEC §3 で実測確認済み)
	const ids = Array.from({ length: 100 }, (_, i) => String(1000 + i));
	const { impl } = fakeGet(ids);
	const source = createPageSource('1', null, { getJsonImpl: impl });
	const page1 = await source.loadPage(1);
	assert.equal(page1.length, 48);
	assert.equal(page1[0].id, '1099', '先頭が一番新しい ID になっていない');
	assert.equal(page1[47].id, '1052');
	const page2 = await source.loadPage(2);
	assert.equal(page2[0].id, '1051');
});

test('works の Map の順序ではなく渡した ID の順に並べる', async () => {
	const ids = ['300', '200', '100'];
	const { impl } = fakeGet(ids);
	const source = createPageSource('1', null, { getJsonImpl: impl });
	const page = await source.loadPage(1);
	assert.deepEqual(page.map((w) => w.id), ['300', '200', '100']);
});

test('最後のページは端数になり、その先は空', async () => {
	const ids = Array.from({ length: 50 }, (_, i) => String(1000 + i));
	const { impl } = fakeGet(ids);
	const source = createPageSource('1', null, { getJsonImpl: impl });
	assert.equal((await source.loadPage(2)).length, 2);
	assert.equal((await source.loadPage(3)).length, 0);
	assert.equal(await source.pageCount(), 2);
});

test('category を渡すとその種別だけを並べる', async () => {
	// イラストタブで漫画が混ざると、画面のグリッドに無い作品が出てしまう
	const { impl } = fakeGet(['300', '100'], ['200']);
	const source = createPageSource('1', WORK_CATEGORY.ILLUST, { getJsonImpl: impl });
	assert.deepEqual((await source.loadPage(1)).map((w) => w.id), ['300', '100']);
});

test('category が null なら両方を繋いで降順にする', async () => {
	const { impl } = fakeGet(['300', '100'], ['200']);
	const source = createPageSource('1', null, { getJsonImpl: impl });
	assert.deepEqual((await source.loadPage(1)).map((w) => w.id), ['300', '200', '100']);
});

test('profile/all は何ページ読んでも 1 回しか引かない', async () => {
	const ids = Array.from({ length: 100 }, (_, i) => String(1000 + i));
	const { impl, urls } = fakeGet(ids);
	const source = createPageSource('1', null, { getJsonImpl: impl });
	await source.loadPage(1);
	await source.loadPage(2);
	await source.pageCount();
	assert.equal(urls.filter((u) => u.includes('/profile/all')).length, 1);
});

test('同時に呼ばれても profile/all は 1 本にまとまる', async () => {
	const ids = ['300', '200'];
	const { impl, urls } = fakeGet(ids);
	const source = createPageSource('1', null, { getJsonImpl: impl });
	await Promise.all([source.loadPage(1), source.pageCount()]);
	assert.equal(urls.filter((u) => u.includes('/profile/all')).length, 1);
});

test('失敗は投げ、覚え込まない', async () => {
	// 覚えると、通信が戻っても失敗したままになる
	let calls = 0;
	const impl = async (url) => {
		calls += 1;
		if (calls === 1) throw new Error('boom');
		if (url.includes('/profile/all')) return { illusts: { 100: null } };
		return { works: { 100: { id: '100' } } };
	};
	const source = createPageSource('1', null, { getJsonImpl: impl });
	await assert.rejects(() => source.loadPage(1));
	assert.deepEqual((await source.loadPage(1)).map((w) => w.id), ['100']);
});
