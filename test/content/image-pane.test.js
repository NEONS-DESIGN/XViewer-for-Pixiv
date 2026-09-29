import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPageUrls, pickPageSizes, prefetchTargets, releaseTargets, createImagePane } from '../../src/content/viewer/image-pane.js';
import { fakeElement, fakeDoc, find, findAll } from '../helpers/dom.js';
import { fakeFetch, fakeApiFetch } from '../helpers/pixiv.js';
import { createStrings } from '../../src/i18n/index.js';
import { PREFETCH_RELEASE_MARGIN, IMAGE_QUALITY } from '../../src/common/constants.js';

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

test('pickPageSizes は width/height を並べる', () => {
	const pages = [{ width: 2177, height: 3031 }, { width: 1200, height: 1800 }];
	assert.deepEqual(pickPageSizes(pages), [{ width: 2177, height: 3031 }, { width: 1200, height: 1800 }]);
});

test('pickPageSizes は width/height が数値でなければ null にする', () => {
	const pages = [{ width: 'x', height: 3031 }, {}, { width: 100, height: 200 }];
	assert.deepEqual(pickPageSizes(pages), [null, null, { width: 100, height: 200 }]);
});

test('pickPageSizes は空や不正な入力で空配列を返す', () => {
	assert.deepEqual(pickPageSizes([]), []);
	assert.deepEqual(pickPageSizes(null), []);
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

test('prefetchTargets は進んだ向きの側を先に並べる', () => {
	assert.deepEqual(prefetchTargets(2, 5, 1, 1), [3, 1]);
	assert.deepEqual(prefetchTargets(2, 5, 1, -1), [1, 3]);
});

test('releaseTargets は prefetch + margin より離れたものだけを返す', () => {
	const entries = [[0, 'a'], [5, 'b'], [20, 'c']];
	assert.deepEqual(releaseTargets(entries, 9, 1, 10), []);
	assert.deepEqual(releaseTargets(entries, 15, 1, 10), [0]);
});

/** 画像ペインへ渡す作品詳細の代わり。3 ページある作品 */
const DETAIL = Object.freeze({
	id: '149425016',
	title: 'タイトル',
	pageCount: 3,
	width: 2177,
	height: 3031,
	urls: { regular: cdn('r0'), original: cdn('o0') },
});

/** /pages の応答の代わり。 */
const PAGES = [
	{ urls: { regular: cdn('r0'), original: cdn('o0') }, width: 2177, height: 3031 },
	{ urls: { regular: cdn('r1'), original: cdn('o1') }, width: 1200, height: 1800 },
	{ urls: { regular: cdn('r2'), original: cdn('o2') }, width: 900, height: 1400 },
];

/**
 * 原寸レイヤの代わり。開かれた指定を覚えるだけ。
 * @returns {{opened: object[], open: (pages: object) => void}} レイヤの代わり
 */
function fakeZoom() {
	const opened = [];
	return { opened, open: (pages) => { opened.push(pages); } };
}

/**
 * 画像ペインを組み立てる。
 * @param {object} [options] 差し替え
 * @param {Function} [options.fetchImpl] 通信の代わり
 * @param {number} [options.prefetch] 先読みの枚数
 * @param {boolean} [options.clickZoom] クリックで原寸表示するか
 * @param {string} [options.imageQuality] 表示解像度の設定
 * @param {object} [options.zoom] 原寸レイヤの代わり
 * @param {object} [options.strings] 文言のカタログ
 * @returns {{container: object, pane: object, created: object[], zoom: object}} 描画先・ペイン・作った先読み Image・原寸レイヤ
 */
function build({ fetchImpl, prefetch = 0, clickZoom = false, imageQuality = IMAGE_QUALITY.REGULAR, zoom = fakeZoom(), strings = createStrings('ja') } = {}) {
	const container = fakeElement('div');
	const created = [];
	const pane = createImagePane({
		doc: fakeDoc(),
		container,
		settings: { imageQuality, prefetch, clickZoom },
		zoom,
		fetchImpl,
		strings,
		createImage: () => {
			const img = fakeElement('img');
			created.push(img);
			return img;
		},
	});
	return { container, pane, created, zoom };
}

test('render は 1 枚目と分母を /pages を待たずに出す', async () => {
	const { impl, calls } = fakeApiFetch(PAGES);
	const { container, pane } = build({ fetchImpl: impl });
	const rendering = pane.render(DETAIL);
	// まだ /pages を待っている時点で 1 枚目と分母 (detail.pageCount) は入っている
	assert.equal(find(container, 'img').src, cdn('r0'));
	assert.equal(find(container, '.counter').textContent, '1/3');
	await rendering;
	assert.equal(calls[0].url, '/ajax/illust/149425016/pages?lang=ja');
	assert.equal(find(container, '.counter').textContent, '1/3');
	const prev = find(container, '.arrow-prev');
	const next = find(container, '.arrow-next');
	assert.equal(prev.hidden, false);
	assert.equal(prev.disabled, true);
	assert.equal(next.hidden, false);
	assert.equal(next.disabled, false);
	pane.next();
	assert.equal(find(container, 'img').src, cdn('r1'));
	assert.equal(find(container, '.counter').textContent, '2/3');
	assert.equal(prev.disabled, false);
	pane.next();
	assert.equal(next.disabled, true);
});

test('分母と矢印は detail.pageCount で先に出る', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	assert.equal(find(container, '.counter').textContent, '1/3');
	assert.equal(find(container, '.arrow-prev').hidden, false);
	assert.equal(find(container, '.arrow-next').hidden, false);
	assert.equal(find(container, '.arrow-next').disabled, false);
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
});

test('/pages の前に押された → は届いた時点で反映される', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	pane.next();
	// 実ページがまだ 1 枚しか無いので、行き先だけ覚えて表示は動かさない
	assert.equal(find(container, '.counter').textContent, '1/3');
	assert.equal(find(container, 'img').src, cdn('r0'));
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
	assert.equal(find(container, '.counter').textContent, '2/3');
	assert.equal(find(container, 'img').src, cdn('r1'));
});

test('/pages の前に → → と押すと、届いた時点で 3 ページ目へ進む', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	pane.next();
	pane.next();
	// 分母を超える分は捨てる
	pane.next();
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
	assert.equal(find(container, '.counter').textContent, '3/3');
	assert.equal(find(container, 'img').src, cdn('r2'));
});

test('/pages の前に → ← と押すと、届いた時点で 1 ページ目のまま', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	pane.next();
	pane.prev();
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
	assert.equal(find(container, '.counter').textContent, '1/3');
	assert.equal(find(container, 'img').src, cdn('r0'));
});

test('1 枚だけの作品では矢印を隠し、/pages を叩かない', async () => {
	const { impl, calls } = fakeApiFetch(PAGES);
	const { container, pane } = build({ fetchImpl: impl });
	await pane.render({ ...DETAIL, pageCount: 1 });
	assert.equal(calls.length, 0);
	assert.equal(find(container, '.arrow-prev').hidden, true);
	assert.equal(find(container, '.arrow-next').hidden, true);
});

test('/pages に失敗しても 1 枚目は残し、ペインの中にだけ理由を出す', async () => {
	const { impl } = fakeFetch({ status: 500, json: { error: true, message: 'x' } });
	const { container, pane } = build({ fetchImpl: impl });
	await pane.render(DETAIL);
	assert.equal(find(container, 'img').src, cdn('r0'));
	const error = find(container, '.pane-error');
	assert.equal(error.textContent, '2 枚目以降を読み込めませんでした');
	assert.equal(error.getAttribute('role'), 'alert');
	// 枠の中に出す。共有の状態表示 (.status) には触らない
	assert.equal(error.parent.className, 'frame');
	assert.equal(findAll(container, '.status').length, 0);
});

test('/pages の body が配列でなければ 1 枚目を残し、複数枚の失敗として扱う', async () => {
	// そのまま採ると urls が空になり、出ていた 1 枚目が消えてカウンタが「1/0」になる
	const { impl } = fakeApiFetch({});
	const { container, pane } = build({ fetchImpl: impl });
	await pane.render(DETAIL);
	assert.equal(find(container, 'img').src, cdn('r0'));
	assert.equal(find(container, '.counter').textContent, '1/1');
	assert.equal(find(container, '.pane-error').textContent, '2 枚目以降を読み込めませんでした');
});

test('dispose した後に /pages が届いても DOM を触らない', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	const frame = find(container, '.frame');
	const counter = find(frame, '.counter');
	pane.dispose();
	assert.equal(container.children.length, 0);
	// 応答は client.js が text() で読む形にする。(json() だけだと network 失敗の経路に落ちて成功経路を通らない)
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
	// 捨てた枠は書き換えない。分母は破棄前に detail.pageCount で先に出ていた値のまま
	assert.equal(counter.textContent, '1/3');
	assert.equal(find(frame, '.pane-error'), null);
});

test('dispose した後に /pages が失敗してもエラーを出さない', async () => {
	let reject;
	const fetchImpl = () => new Promise((_resolve, rej) => { reject = rej; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	const frame = find(container, '.frame');
	pane.dispose();
	reject(new TypeError('Failed to fetch'));
	await rendering;
	assert.equal(find(frame, '.pane-error'), null);
});

test('dispose すると /pages の取得の signal を中断する', () => {
	let capturedInit;
	const fetchImpl = (url, init) => { capturedInit = init; return new Promise(() => {}); };
	const { pane } = build({ fetchImpl });
	void pane.render(DETAIL);
	pane.dispose();
	assert.equal(capturedInit.signal.aborted, true);
});

test('中断による失敗ではエラー行を出さない', async () => {
	// fetch が中断されたときの例外 (DOMException 相当)。client.js が PixivError(ABORTED) に揃える
	const abortError = new Error('aborted');
	abortError.name = 'AbortError';
	const { impl } = fakeFetch({ throws: abortError });
	const { container, pane } = build({ fetchImpl: impl });
	await pane.render(DETAIL);
	assert.equal(find(container, '.pane-error'), null);
});

test('/pages が届いても 1 枚目の src を書き直さない', async () => {
	// 同じ URL を代入し直すと img が読み込みをやり直す。1 枚目の失敗表示も消えてしまう
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane } = build({ fetchImpl: impl });
	const rendering = pane.render(DETAIL);
	const image = find(container, 'img');
	let assigned = 0;
	let value = image.src;
	Object.defineProperty(image, 'src', {
		get() { return value; },
		set(next) { value = next; assigned += 1; },
	});
	// 1 枚目が読めなかったことにする
	await image.dispatch('error');
	assert.equal(find(container, '.pane-error').textContent, '画像を読み込めませんでした');
	await rendering;
	assert.equal(assigned, 0);
	assert.equal(find(container, '.pane-error').textContent, '画像を読み込めませんでした');
	// ページを変えたら src を入れ替え、前のページのエラーは消す
	pane.next();
	assert.equal(assigned, 1);
	assert.equal(find(container, '.pane-error'), null);
});

test('表示中の画像は fetchPriority high、先読みは low', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch: 1 });
	const rendering = pane.render(DETAIL);
	const image = find(container, 'img');
	assert.equal(image.fetchPriority, 'high');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	await rendering;
	assert.equal(created[0].fetchPriority, 'low');
});

test('先読みは表示中の画像の load を待ってから始まる', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch: 1 });
	const rendering = pane.render(DETAIL);
	await rendering;
	// /pages が届いた直後は、表示中の画像がまだ読み終えていないので先読みは始まらない
	assert.equal(created.length, 0);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	assert.deepEqual(created.map((img) => img.src), [cdn('r1')]);
});

test('表示中の画像が error でも先読みは始まる', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch: 1 });
	const rendering = pane.render(DETAIL);
	await rendering;
	assert.equal(created.length, 0);
	await find(container, 'img').dispatch('error');
	assert.deepEqual(created.map((img) => img.src), [cdn('r1')]);
});

test('1 枚目が /pages より先に失敗しても、届いた後に先読みが始まる', async () => {
	// 失敗済みの画像は実ブラウザで complete: true / naturalWidth: 0 になり、
	// error は既に発火済みで二度と来ない。/pages 到着時の再描画では URL が変わらず
	// load/error も発生しないため、schedulePrefetch が complete だけで判定できないと
	// 先読みが一生始まらない
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane, created } = build({ fetchImpl, prefetch: 1 });
	const rendering = pane.render(DETAIL);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 0;
	await image.dispatch('error');
	// /pages がまだ届いていないので先読み先の URL が無い
	assert.equal(created.length, 0);
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
	assert.deepEqual(created.map((img) => img.src), [cdn('r1')]);
});

test('先読みはページ番号ごとに 1 度だけ Image を作り、空の URL は飛ばす', async () => {
	// 3 ページ目が CDN 以外で弾かれた作品
	const pages = [PAGES[0], PAGES[1], { urls: { regular: 'https://evil.example.com/x.jpg' } }];
	const { impl } = fakeApiFetch(pages);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch: 3 });
	const rendering = pane.render(DETAIL);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	await rendering;
	// 1 ページ目にいるので 2 ページ目だけ。3 ページ目は空文字なので読みに行かない
	assert.deepEqual(created.map((img) => img.src), [cdn('r1')]);
	pane.next();
	pane.prev();
	pane.next();
	// 行き来しても作り直さない
	assert.deepEqual(created.map((img) => img.src), [cdn('r1'), cdn('r0')]);
});

test('離れた先読みを解放する', async () => {
	// prefetch (1) + PREFETCH_RELEASE_MARGIN より離れると、途中で先読みした 0 ページ目の Image の src が空になる
	const prefetch = 1;
	const threshold = prefetch + PREFETCH_RELEASE_MARGIN;
	const total = threshold + 5;
	const detail = { ...DETAIL, pageCount: total };
	const pages = Array.from({ length: total }, (_, i) => ({ urls: { regular: cdn(`r${i}`), original: cdn(`o${i}`) } }));
	const { impl } = fakeApiFetch(pages);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch });
	const rendering = pane.render(detail);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	await rendering;
	pane.next();
	const page0Image = created.find((img) => img.src === cdn('r0'));
	assert.ok(page0Image, '1 つ後ろの 0 ページ目を先読みしている');
	// 既に 1 回進んでいるので、残り threshold 回で距離が threshold を超える
	for (let i = 0; i < threshold; i += 1) pane.next();
	assert.equal(page0Image.src, '');
});

test('dispose で先読みの読み込みを取り消し、画像の error を外す', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch: 1 });
	const rendering = pane.render(DETAIL);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	await rendering;
	assert.deepEqual(created.map((img) => img.src), [cdn('r1')]);
	pane.dispose();
	assert.equal(image.src, '');
	assert.equal((image.listeners.error ?? []).length, 0);
	// 参照を捨てるだけでは読み込み途中の転送が続く。src を空にして取り消す
	assert.deepEqual(created.map((img) => img.src), ['']);
});

test('loadedUrlAt は読み終えた画像だけ URL を返す', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, created } = build({ fetchImpl: impl, prefetch: 1 });
	const rendering = pane.render(DETAIL);
	const image = find(container, 'img');
	assert.equal(pane.loadedUrlAt(0), null, '読み込み中は null');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	await rendering;
	assert.equal(pane.loadedUrlAt(0), cdn('r0'), '表示中で読み終えていれば URL を返す');
	assert.equal(pane.loadedUrlAt(1), null, '先読みの Image はまだ読み終えていない');
	created[0].complete = true;
	created[0].naturalWidth = 1;
	assert.equal(pane.loadedUrlAt(1), cdn('r1'), '先読みが読み終えれば URL を返す');
	assert.equal(pane.loadedUrlAt(2), null, '先読みしていないページは null');
});

test('クリックで原寸表示がオンなら、画像を押して原寸の並びを渡す', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true });
	await pane.render(DETAIL);
	pane.next();
	const image = find(container, 'img');
	assert.ok(image.className.includes('zoomable'), '押せることが分かる見た目にする');
	await image.dispatch('click', {});
	assert.equal(zoom.opened.length, 1);
	// 設定の解像度が標準でも、原寸表示では原寸を出す
	assert.deepEqual(zoom.opened[0].urls, [cdn('o0'), cdn('o1'), cdn('o2')]);
	assert.equal(zoom.opened[0].index, 1);
	assert.equal(zoom.opened[0].alt, 'タイトル');
});

test('クリックで原寸表示がオフなら、画像を押しても開かない', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: false });
	await pane.render(DETAIL);
	const image = find(container, 'img');
	assert.ok(!image.className.includes('zoomable'));
	await image.dispatch('click', {});
	assert.equal(zoom.opened.length, 0);
});

test('/pages が届く前でも詳細の原寸 URL で開ける', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true });
	const rendering = pane.render(DETAIL);
	await find(container, 'img').dispatch('click', {});
	assert.deepEqual(zoom.opened[0].urls, [cdn('o0')]);
	await rendering;
});

test('原寸が無い作品では標準の画像で開く', async () => {
	// 未ログインでは urls.original が落ちる
	const pages = PAGES.map((page) => ({ urls: { regular: page.urls.regular } }));
	const { impl } = fakeApiFetch(pages);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true });
	await pane.render({ ...DETAIL, urls: { regular: cdn('r0') } });
	await find(container, 'img').dispatch('click', {});
	assert.deepEqual(zoom.opened[0].urls, [cdn('r0'), cdn('r1'), cdn('r2')]);
});

test('原寸表示でページを送るとペインも追従する', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true });
	await pane.render(DETAIL);
	await find(container, 'img').dispatch('click', {});
	zoom.opened[0].onIndexChange(2);
	// 閉じたときに同じページが出ていないと、見ていた場所を見失う
	assert.equal(find(container, 'img').src, cdn('r2'));
	assert.equal(find(container, '.counter').textContent, '3/3');
});

test('/pages 前は詳細の width/height を仮表示の実寸として渡す', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane, zoom } = build({ fetchImpl, clickZoom: true });
	const rendering = pane.render(DETAIL);
	await find(container, 'img').dispatch('click', {});
	assert.deepEqual(zoom.opened[0].sizes, [{ width: 2177, height: 3031 }]);
	assert.equal(typeof zoom.opened[0].placeholderAt, 'function');
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
});

test('/pages が届いたら実寸は各ページの width/height になる', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true });
	await pane.render(DETAIL);
	await find(container, 'img').dispatch('click', {});
	assert.deepEqual(zoom.opened[0].sizes, [
		{ width: 2177, height: 3031 },
		{ width: 1200, height: 1800 },
		{ width: 900, height: 1400 },
	]);
});

test('原寸表示の仮表示は読み込み済みの URL だけを返す (通信を起こさない)', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true });
	await pane.render(DETAIL);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	await find(container, 'img').dispatch('click', {});
	assert.equal(zoom.opened[0].placeholderAt(0), cdn('r0'));
	assert.equal(zoom.opened[0].placeholderAt(1), null);
});

test('解像度の設定が原寸なら仮表示用の情報を渡さない', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane, zoom } = build({ fetchImpl: impl, clickZoom: true, imageQuality: IMAGE_QUALITY.ORIGINAL });
	await pane.render(DETAIL);
	await find(container, 'img').dispatch('click', {});
	assert.equal(zoom.opened[0].placeholderAt, undefined);
	assert.equal(zoom.opened[0].sizes, undefined);
});

test('原寸内でページを戻すと、以後の先読みは戻った向きを優先する', async () => {
	const total = 5;
	const detail = { ...DETAIL, pageCount: total };
	const pagesData = Array.from({ length: total }, (_, i) => ({ urls: { regular: cdn(`r${i}`), original: cdn(`o${i}`) } }));
	const { impl } = fakeApiFetch(pagesData);
	const { container, pane, zoom, created } = build({ fetchImpl: impl, clickZoom: true, prefetch: 1 });
	await pane.render(detail);
	// 0 -> 3 まで前進しておく。lastDirection はここで 1
	pane.next();
	pane.next();
	pane.next();
	await find(container, 'img').dispatch('click', {});
	created.length = 0;
	// 原寸内で 3 -> 1 へ戻る
	zoom.opened[0].onIndexChange(1);
	const image = find(container, 'img');
	image.complete = true;
	image.naturalWidth = 1;
	await image.dispatch('load');
	// 戻った向きなので「前」(0) を先に読みに行く。直っていなければ「次」(2) が先になる
	assert.deepEqual(created.map((img) => img.src), [cdn('r0'), cdn('r2')]);
});

test('/pages 待ちの間に原寸表示を開くと、待っていた行き先を捨てる', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane, zoom } = build({ fetchImpl, clickZoom: true });
	const rendering = pane.render(DETAIL);
	// /pages 待ちなので、この矢印は pendingIndex にだけ覚える
	pane.next();
	await find(container, 'img').dispatch('click', {});
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
	// 原寸表示を開いたことで pendingIndex を捨てているので、1 枚目のまま
	assert.equal(find(container, 'img').src, cdn('r0'));
	assert.equal(find(container, '.counter').textContent, '1/3');
});

test('英語のカタログで英語の文言が出る', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane } = build({ fetchImpl: impl, strings: createStrings('en') });
	const rendering = pane.render(DETAIL);
	// 1 枚目が読めなかったことにする
	await find(container, 'img').dispatch('error');
	assert.equal(find(container, '.pane-error').textContent, 'Could not load this image');
	await rendering;
});

test('canMove は今のページから送れる向きだけ true を返す', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { pane } = build({ fetchImpl: impl });
	assert.equal(pane.canMove(1), false, '描く前は送れない');
	await pane.render(DETAIL);
	assert.equal(pane.canMove(-1), false);
	assert.equal(pane.canMove(1), true);
	pane.next();
	pane.next();
	assert.equal(pane.canMove(1), false);
	assert.equal(pane.canMove(-1), true);
	pane.dispose();
	assert.equal(pane.canMove(-1), false, '捨てた後は送れない');
});

test('canMove は /pages 待ちに覚えた行き先を起点にする', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	pane.next();
	pane.next();
	assert.equal(pane.canMove(1), false);
	respond({ ok: true, status: 200, text: async () => JSON.stringify({ error: false, body: PAGES }) });
	await rendering;
});

test('canMove は 1 枚だけの作品ではどちらにも送れない', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { pane } = build({ fetchImpl: impl });
	await pane.render({ ...DETAIL, pageCount: 1 });
	assert.equal(pane.canMove(1), false);
	assert.equal(pane.canMove(-1), false);
});
