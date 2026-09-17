import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPageUrls, prefetchTargets, createImagePane } from '../../src/content/viewer/image-pane.js';
import { fakeElement, fakeDoc, find, findAll, flush } from '../helpers/dom.js';
import { fakeFetch, fakeApiFetch } from '../helpers/pixiv.js';

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

/** 画像ペインへ渡す作品詳細の代わり。3 ページある作品 */
const DETAIL = Object.freeze({
	id: '149425016',
	title: 'タイトル',
	pageCount: 3,
	urls: { regular: cdn('r0'), original: cdn('o0') },
});

/** /pages の応答の代わり。 */
const PAGES = [
	{ urls: { regular: cdn('r0'), original: cdn('o0') } },
	{ urls: { regular: cdn('r1'), original: cdn('o1') } },
	{ urls: { regular: cdn('r2'), original: cdn('o2') } },
];

/**
 * 画像ペインを組み立てる。
 * @param {object} [options] 差し替え
 * @param {Function} [options.fetchImpl] 通信の代わり
 * @param {number} [options.prefetch] 先読みの枚数
 * @returns {{container: object, pane: object, created: object[]}} 描画先・ペイン・作った先読み Image
 */
function build({ fetchImpl, prefetch = 0 } = {}) {
	const container = fakeElement('div');
	const created = [];
	const pane = createImagePane({
		doc: fakeDoc(),
		container,
		settings: { imageQuality: 'regular', prefetch },
		fetchImpl,
		createImage: () => {
			const img = fakeElement('img');
			created.push(img);
			return img;
		},
	});
	return { container, pane, created };
}

test('render は 1 枚目を /pages を待たずに出し、届いたら矢印とカウンタを揃える', async () => {
	const { impl, calls } = fakeApiFetch(PAGES);
	const { container, pane } = build({ fetchImpl: impl });
	const rendering = pane.render(DETAIL);
	// まだ /pages を待っている時点で 1 枚目は入っている
	assert.equal(find(container, 'img').src, cdn('r0'));
	assert.equal(find(container, '.counter').textContent, '1/1');
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

test('dispose した後に /pages が届いても DOM を触らない', async () => {
	let respond;
	const fetchImpl = () => new Promise((resolve) => { respond = resolve; });
	const { container, pane } = build({ fetchImpl });
	const rendering = pane.render(DETAIL);
	const frame = find(container, '.frame');
	const counter = find(frame, '.counter');
	pane.dispose();
	assert.equal(container.children.length, 0);
	respond({ ok: true, status: 200, json: async () => ({ error: false, body: PAGES }) });
	await rendering;
	// 捨てた枠のカウンタも書き換えない
	assert.equal(counter.textContent, '1/1');
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

test('先読みは URL ごとに 1 度だけ Image を作り、空の URL は飛ばす', async () => {
	// 3 ページ目が CDN 以外で弾かれた作品
	const pages = [PAGES[0], PAGES[1], { urls: { regular: 'https://evil.example.com/x.jpg' } }];
	const { impl } = fakeApiFetch(pages);
	const { pane, created } = build({ fetchImpl: impl, prefetch: 3 });
	await pane.render(DETAIL);
	// 1 ページ目にいるので 2 ページ目だけ。3 ページ目は空文字なので読みに行かない
	assert.deepEqual(created.map((img) => img.src), [cdn('r1')]);
	pane.next();
	pane.prev();
	pane.next();
	// 行き来しても作り直さない
	assert.deepEqual(created.map((img) => img.src), [cdn('r1'), cdn('r0')]);
});

test('dispose で先読みの Image を手放し、画像の error を外す', async () => {
	const { impl } = fakeApiFetch(PAGES);
	const { container, pane } = build({ fetchImpl: impl, prefetch: 1 });
	await pane.render(DETAIL);
	const image = find(container, 'img');
	pane.dispose();
	assert.equal(image.src, '');
	assert.equal((image.listeners.error ?? []).length, 0);
	await flush();
});
