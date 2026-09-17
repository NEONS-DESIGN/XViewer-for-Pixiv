import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZoomLayer } from '../../../src/content/viewer/zoom.js';
import { KEYS, INERT_ATTRIBUTE } from '../../../src/common/constants.js';
import { fakeElement, fakeDoc, find } from '../../helpers/dom.js';

/** 実際の CDN と同じ形の URL。safeCdnUrl の関門は通した後の値を渡す前提。 */
const cdn = (name) => `https://i.pximg.net/img-original/img/2026/09/10/00/00/00/${name}.jpg`;

/** 3 ページぶんの原寸 URL。 */
const URLS = [cdn('o0'), cdn('o1'), cdn('o2')];

/**
 * 原寸レイヤを組み立てる。
 * container はビュワーの overlay 役で、既に子 (ステージ) を 1 つ持っている。
 * @param {object} [options] 差し替え
 * @param {() => void} [options.restoreFocus] 閉じたときに呼ばれる
 * @returns {{container: object, stage: object, zoom: object}} 描画先・既存の子・レイヤ
 */
function build({ restoreFocus } = {}) {
	const container = fakeElement('div');
	const stage = fakeElement('div');
	stage.className = 'stage';
	container.appendChild(stage);
	const zoom = createZoomLayer({ doc: fakeDoc(), container, restoreFocus });
	return { container, stage, zoom };
}

/**
 * ページの指定をまとめる。
 * @param {object} [overrides] 上書きする値
 * @returns {object} open() へ渡す指定
 */
function pages(overrides = {}) {
	return { urls: URLS, index: 0, alt: 'タイトル', ...overrides };
}

test('open は原寸の画像とカウンタを出す', () => {
	const { container, zoom } = build();
	zoom.open(pages());
	assert.equal(zoom.isOpen(), true);
	const image = find(container, '.zoom-image');
	assert.equal(image.src, URLS[0]);
	assert.equal(image.getAttribute('alt'), 'タイトル');
	assert.equal(find(container, '.zoom-counter').textContent, '1/3');
});

test('open は途中のページからでも開ける', () => {
	const { container, zoom } = build();
	zoom.open(pages({ index: 2 }));
	assert.equal(find(container, '.zoom-image').src, URLS[2]);
	assert.equal(find(container, '.zoom-counter').textContent, '3/3');
});

test('1 枚だけの作品ではカウンタも左右のクリック領域も出さない', () => {
	const { container, zoom } = build();
	zoom.open(pages({ urls: [URLS[0]] }));
	assert.equal(find(container, '.zoom-counter').hidden, true);
	assert.equal(find(container, '.zoom-zone-prev').hidden, true);
	assert.equal(find(container, '.zoom-zone-next').hidden, true);
});

test('端ではその向きのクリック領域を押せなくする', () => {
	const { container, zoom } = build();
	zoom.open(pages());
	const prev = find(container, '.zoom-zone-prev');
	const next = find(container, '.zoom-zone-next');
	assert.equal(prev.disabled, true);
	assert.equal(next.disabled, false);
	zoom.open(pages({ index: 2 }));
	assert.equal(find(container, '.zoom-zone-prev').disabled, false);
	assert.equal(find(container, '.zoom-zone-next').disabled, true);
});

test('右のクリック領域でページが進み、呼び出し元へ番号を返す', async () => {
	const { container, zoom } = build();
	const seen = [];
	zoom.open(pages({ onIndexChange: (index) => seen.push(index) }));
	await find(container, '.zoom-zone-next').click();
	assert.equal(find(container, '.zoom-image').src, URLS[1]);
	assert.equal(find(container, '.zoom-counter').textContent, '2/3');
	assert.deepEqual(seen, [1]);
});

test('左のクリック領域でページが戻る', async () => {
	const { container, zoom } = build();
	zoom.open(pages({ index: 1 }));
	await find(container, '.zoom-zone-prev').click();
	assert.equal(find(container, '.zoom-image').src, URLS[0]);
});

test('ページを送ったらスクロール位置を先頭へ戻す', async () => {
	const { container, zoom } = build();
	zoom.open(pages());
	const layer = find(container, '.zoom');
	layer.scrollTop = 800;
	layer.scrollLeft = 400;
	await find(container, '.zoom-zone-next').click();
	assert.equal(layer.scrollTop, 0);
	assert.equal(layer.scrollLeft, 0);
});

test('画像の上を押すと閉じる', async () => {
	const { container, zoom } = build();
	zoom.open(pages());
	await find(container, '.zoom').click();
	assert.equal(zoom.isOpen(), false);
	assert.equal(find(container, '.zoom'), null);
});

test('閉じたらフォーカスを呼び出し元へ返す', async () => {
	let restored = 0;
	const { container, zoom } = build({ restoreFocus: () => { restored += 1; } });
	zoom.open(pages());
	assert.equal(find(container, '.zoom').focused, true);
	await find(container, '.zoom').click();
	assert.equal(restored, 1);
});

test('Escape は原寸表示だけを閉じる', () => {
	const { zoom } = build();
	zoom.open(pages());
	assert.equal(zoom.consumeKey({ key: KEYS.CLOSE }), true);
	assert.equal(zoom.isOpen(), false);
});

test('左右キーでページを送る', () => {
	const { container, zoom } = build();
	zoom.open(pages());
	assert.equal(zoom.consumeKey({ key: KEYS.NEXT_PAGE }), true);
	assert.equal(find(container, '.zoom-image').src, URLS[1]);
	assert.equal(zoom.consumeKey({ key: KEYS.PREV_PAGE }), true);
	assert.equal(find(container, '.zoom-image').src, URLS[0]);
});

test('端で左右キーを押しても番号は動かない', () => {
	const seen = [];
	const { container, zoom } = build();
	zoom.open(pages({ onIndexChange: (index) => seen.push(index) }));
	assert.equal(zoom.consumeKey({ key: KEYS.PREV_PAGE }), true);
	assert.equal(find(container, '.zoom-image').src, URLS[0]);
	assert.deepEqual(seen, []);
});

test('上下キーは原寸表示を閉じてから本体へ渡す', () => {
	const { zoom } = build();
	zoom.open(pages());
	// 作品を移ったあとも原寸のままだと、次の作品の巨大な画像を毎回読むことになる
	assert.equal(zoom.consumeKey({ key: KEYS.NEXT_WORK }), false);
	assert.equal(zoom.isOpen(), false);
});

test('Tab は奪わない (フォーカスの巡回は本体に任せる)', () => {
	const { zoom } = build();
	zoom.open(pages());
	assert.equal(zoom.consumeKey({ key: KEYS.FOCUS_NEXT }), false);
	assert.equal(zoom.isOpen(), true);
});

test('修飾キー付きの左右キーは奪わない', () => {
	const { container, zoom } = build();
	zoom.open(pages());
	assert.equal(zoom.consumeKey({ key: KEYS.NEXT_PAGE, altKey: true }), false);
	assert.equal(find(container, '.zoom-image').src, URLS[0]);
});

test('IME の変換中はキーを奪わない', () => {
	const { zoom } = build();
	zoom.open(pages());
	assert.equal(zoom.consumeKey({ key: KEYS.CLOSE, isComposing: true }), false);
	assert.equal(zoom.isOpen(), true);
});

test('閉じているときはキーを奪わない', () => {
	const { zoom } = build();
	assert.equal(zoom.consumeKey({ key: KEYS.CLOSE }), false);
});

test('開いている間は背後の部品をフォーカスと読み上げから外す', () => {
	const { container, stage, zoom } = build();
	zoom.open(pages());
	assert.equal(stage.getAttribute(INERT_ATTRIBUTE), '');
	assert.equal(find(container, '.zoom').getAttribute(INERT_ATTRIBUTE), null);
	zoom.close();
	assert.equal(stage.getAttribute(INERT_ATTRIBUTE), null);
});

test('元から inert だった部品は閉じるときに剥がさない', () => {
	const { stage, zoom } = build();
	stage.setAttribute(INERT_ATTRIBUTE, '');
	zoom.open(pages());
	zoom.close();
	assert.equal(stage.getAttribute(INERT_ATTRIBUTE), '');
});

test('URL が無ければ開かない', () => {
	const { container, zoom } = build();
	// safeCdnUrl に弾かれたページは空文字になる。開いても真っ黒な画面が出るだけ
	zoom.open(pages({ urls: [''] }));
	assert.equal(zoom.isOpen(), false);
	assert.equal(find(container, '.zoom'), null);
});

test('開き直しても前のレイヤは残らない', () => {
	const { container, zoom } = build();
	zoom.open(pages());
	zoom.open(pages({ index: 1 }));
	assert.equal(container.querySelectorAll('.zoom').length, 1);
	assert.equal(find(container, '.zoom-image').src, URLS[1]);
});

test('dispose で DOM を片付ける', () => {
	const { container, stage, zoom } = build();
	zoom.open(pages());
	zoom.dispose();
	assert.equal(zoom.isOpen(), false);
	assert.equal(find(container, '.zoom'), null);
	assert.equal(stage.getAttribute(INERT_ATTRIBUTE), null);
});

test('閉じているときに閉じてもフォーカスは戻さない', () => {
	let restored = 0;
	const { zoom } = build({ restoreFocus: () => { restored += 1; } });
	zoom.close();
	assert.equal(restored, 0);
});
