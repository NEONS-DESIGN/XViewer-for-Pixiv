import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchIllustPages, fetchUgoiraMeta, clearIllustAssetCache } from '../../src/pixiv/illust-assets.js';
import { PixivError, PIXIV_ERROR_KINDS } from '../../src/pixiv/errors.js';

// 覚えた内容がテストをまたいで漏れないようにする
beforeEach(() => {
	clearIllustAssetCache();
});

const PAGES = [
	{ urls: { regular: 'https://i.pximg.net/img-master/img/1_p0_master1200.jpg' }, width: 800, height: 1105 },
	{ urls: { regular: 'https://i.pximg.net/img-master/img/1_p1_master1200.jpg' }, width: 800, height: 1105 },
];

const META = { src: 'https://i.pximg.net/img-zip-ugoira/img/1_ugoira600x600.zip', frames: [{ file: '000000.jpg', delay: 100 }] };

/**
 * 呼ばれた URL を記録し、決まった body を返す偽の getJson を作る。
 * @param {(url: string, count: number) => unknown} respond 応答を決める関数。投げれば失敗になる
 * @returns {{impl: Function, calls: Array<{url: string, deps: unknown, init: unknown}>}} 偽の getJson と呼び出しの記録
 */
function fakeGet(respond) {
	const calls = [];
	const impl = async (url, deps, init) => {
		calls.push({ url, deps, init });
		return respond(url, calls.length);
	};
	return { impl, calls };
}

test('fetchIllustPages は /pages の body を返し、同じ作品は 2 回目以降取りに行かない', async () => {
	const { impl, calls } = fakeGet(() => PAGES);
	const first = await fetchIllustPages('1', 'ja', { getJsonImpl: impl });
	const second = await fetchIllustPages('1', 'ja', { getJsonImpl: impl });
	assert.deepEqual(first, PAGES);
	assert.equal(second, first);
	assert.equal(calls.length, 1);
	assert.match(calls[0].url, /^\/ajax\/illust\/1\/pages\?lang=ja$/);
});

test('fetchIllustPages は同時に呼ばれても 1 本にまとめる', async () => {
	const { impl, calls } = fakeGet(() => PAGES);
	await Promise.all([
		fetchIllustPages('1', 'ja', { getJsonImpl: impl }),
		fetchIllustPages('1', 'ja', { getJsonImpl: impl }),
	]);
	assert.equal(calls.length, 1);
});

test('fetchIllustPages は数値の ID でも文字列と同じキーで覚える', async () => {
	const { impl, calls } = fakeGet(() => PAGES);
	await fetchIllustPages(1, 'ja', { getJsonImpl: impl });
	await fetchIllustPages('1', 'ja', { getJsonImpl: impl });
	assert.equal(calls.length, 1);
});

test('fetchIllustPages は中断の合図を渡さない (共有するので片方の中断で巻き込まない)', async () => {
	const { impl, calls } = fakeGet(() => PAGES);
	await fetchIllustPages('1', 'ja', { getJsonImpl: impl });
	assert.equal(calls[0].deps, undefined);
});

test('fetchIllustPages は失敗を覚えず、次の呼び出しで取り直す', async () => {
	const { impl, calls } = fakeGet((_url, count) => {
		if (count === 1) throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, '落ちた');
		return PAGES;
	});
	await assert.rejects(() => fetchIllustPages('1', 'ja', { getJsonImpl: impl }), (error) => error.kind === PIXIV_ERROR_KINDS.NETWORK);
	assert.deepEqual(await fetchIllustPages('1', 'ja', { getJsonImpl: impl }), PAGES);
	assert.equal(calls.length, 2);
});

test('fetchIllustPages は body が配列でなければ parse で拒否し、覚えない', async () => {
	const { impl, calls } = fakeGet((_url, count) => (count === 1 ? null : PAGES));
	await assert.rejects(() => fetchIllustPages('1', 'ja', { getJsonImpl: impl }), (error) => error.kind === PIXIV_ERROR_KINDS.PARSE);
	assert.deepEqual(await fetchIllustPages('1', 'ja', { getJsonImpl: impl }), PAGES);
	assert.equal(calls.length, 2);
});

test('fetchUgoiraMeta は ugoira_meta の body を返し、同じ作品は 2 回目以降取りに行かない', async () => {
	const { impl, calls } = fakeGet(() => META);
	const first = await fetchUgoiraMeta('1', 'ja', { getJsonImpl: impl });
	const second = await fetchUgoiraMeta('1', 'ja', { getJsonImpl: impl });
	assert.deepEqual(first, META);
	assert.equal(second, first);
	assert.equal(calls.length, 1);
	assert.match(calls[0].url, /^\/ajax\/illust\/1\/ugoira_meta\?lang=ja$/);
});

test('fetchUgoiraMeta は body がオブジェクトでなければ parse で拒否し、覚えない', async () => {
	const { impl, calls } = fakeGet((_url, count) => (count === 1 ? [] : META));
	await assert.rejects(() => fetchUgoiraMeta('1', 'ja', { getJsonImpl: impl }), (error) => error.kind === PIXIV_ERROR_KINDS.PARSE);
	assert.deepEqual(await fetchUgoiraMeta('1', 'ja', { getJsonImpl: impl }), META);
	assert.equal(calls.length, 2);
});

test('/pages と ugoira_meta は別々に覚える', async () => {
	const { impl, calls } = fakeGet((url) => (url.includes('/pages') ? PAGES : META));
	assert.deepEqual(await fetchIllustPages('1', 'ja', { getJsonImpl: impl }), PAGES);
	assert.deepEqual(await fetchUgoiraMeta('1', 'ja', { getJsonImpl: impl }), META);
	assert.equal(calls.length, 2);
});
