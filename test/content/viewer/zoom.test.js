import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZoomLayer } from '../../../src/content/viewer/zoom.js';
import { KEYS, INERT_ATTRIBUTE } from '../../../src/common/constants.js';
import { fakeElement, fakeDoc, find, findAll } from '../../helpers/dom.js';
import { createStrings } from '../../../src/i18n/index.js';

/** 実際の CDN と同じ形の URL。safeCdnUrl の関門は通した後の値を渡す前提。 */
const cdn = (name) => `https://i.pximg.net/img-original/img/2026/09/10/00/00/00/${name}.jpg`;
/** 標準画質の URL。原寸表示の仮表示に使う。 */
const cdnRegular = (name) => `https://i.pximg.net/img-master/img/2026/09/10/00/00/00/${name}.jpg`;

/** 3 ページぶんの原寸 URL。 */
const URLS = [cdn('o0'), cdn('o1'), cdn('o2')];
/** 3 ページぶんの標準画質 URL。 */
const REGULAR = [cdnRegular('r0'), cdnRegular('r1'), cdnRegular('r2')];

/**
 * 原寸レイヤを組み立てる。
 * container はビュワーの overlay 役で、既に子 (ステージ) を 1 つ持っている。
 * @param {object} [options] 差し替え
 * @param {() => void} [options.restoreFocus] 閉じたときに呼ばれる
 * @param {object} [options.strings] 文言のカタログ
 * @param {() => object} [options.createImage] 原寸の読み込み役 (Image) の差し替え
 * @returns {{container: object, stage: object, zoom: object}} 描画先・既存の子・レイヤ
 */
function build({ restoreFocus, strings = createStrings('ja'), createImage } = {}) {
	const container = fakeElement('div');
	const stage = fakeElement('div');
	stage.className = 'stage';
	container.appendChild(stage);
	const zoom = createZoomLayer({ doc: fakeDoc(), container, restoreFocus, strings, createImage });
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

test('途中のページの URL が空なら真っ黒にせず文言を出し、次のページで消す', () => {
	// 1 枚目が空なら開かないが、途中のページは開いた後に分かる。画像ペインの失敗と同じ文言を出す
	const { container, zoom } = build();
	zoom.open(pages({ urls: [URLS[0], '', URLS[2]] }));
	assert.equal(find(container, '.pane-error'), null);
	zoom.consumeKey({ key: KEYS.NEXT_PAGE });
	const error = find(container, '.pane-error');
	assert.equal(error.textContent, '画像を読み込めませんでした');
	assert.equal(error.getAttribute('role'), 'alert');
	assert.equal(error.parent.className, 'zoom-canvas');
	zoom.consumeKey({ key: KEYS.NEXT_PAGE });
	assert.equal(find(container, '.pane-error'), null);
	assert.equal(find(container, '.zoom-image').src, URLS[2]);
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

test('英語のカタログで英語の文言が出る', () => {
	const { container, zoom } = build({ strings: createStrings('en') });
	zoom.open(pages());
	assert.match(find(container, '.zoom').getAttribute('aria-label'), /Actual size/);
	assert.equal(find(container, '.zoom-zone-prev').getAttribute('aria-label'), 'Previous page');
	assert.equal(find(container, '.zoom-zone-next').getAttribute('aria-label'), 'Next page');
});

/**
 * 原寸の読み込み役 (createImage の代わり) を作る。呼ばれるたびに配列へ積む。
 * @returns {{created: object[], createImage: () => object}} 作られた Image の代わりと差し替え関数
 */
function fakeUpgradeImages() {
	const created = [];
	return {
		created,
		createImage: () => {
			const img = fakeElement('img');
			created.push(img);
			return img;
		},
	};
}

test('読み込み済みの標準画質があれば仮に出し、通知を出す', () => {
	const { createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({
		placeholderAt: (index) => REGULAR[index],
		sizes: [{ width: 2000, height: 3000 }, { width: 1200, height: 1800 }, null],
	}));
	const img = find(container, '.zoom-image');
	assert.equal(img.src, REGULAR[0]);
	assert.equal(img.getAttribute('width'), '2000');
	assert.equal(img.getAttribute('height'), '3000');
	assert.equal(findAll(container, '.notice').length, 1);
	const notice = find(container, '.notice');
	assert.equal(notice.dataset.kind, 'progress');
});

test('通知の入れ物には inert を付けない', () => {
	const { createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({ placeholderAt: (index) => REGULAR[index], sizes: [{ width: 2000, height: 3000 }] }));
	const area = find(container, '.notice-area');
	assert.equal(area.getAttribute(INERT_ATTRIBUTE), null);
});

test('原寸を読み終えたら差し替え、通知を消す', async () => {
	const { created, createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({ placeholderAt: (index) => REGULAR[index], sizes: [{ width: 2000, height: 3000 }] }));
	assert.equal(created.length, 1);
	assert.equal(created[0].src, URLS[0]);
	await created[0].dispatch('load');
	const img = find(container, '.zoom-image');
	assert.equal(img.src, URLS[0]);
	assert.equal(img.getAttribute('width'), null);
	assert.equal(img.getAttribute('height'), null);
	assert.equal(findAll(container, '.notice').length, 0);
});

test('原寸の読み込みに失敗したら通知を消し、今の失敗表示を出す', async () => {
	const { created, createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({ placeholderAt: (index) => REGULAR[index], sizes: [{ width: 2000, height: 3000 }] }));
	await created[0].dispatch('error');
	assert.equal(findAll(container, '.notice').length, 0);
	const error = find(container, '.pane-error');
	assert.equal(error.textContent, '画像を読み込めませんでした');
	assert.equal(error.getAttribute('role'), 'alert');
});

test('読み込み済みでなければ仮表示せず、通知も出さない (標準画質の通信を起こさない)', () => {
	const { created, createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({ placeholderAt: () => null, sizes: [{ width: 2000, height: 3000 }] }));
	assert.equal(find(container, '.zoom-image').src, URLS[0]);
	assert.equal(created.length, 0);
	assert.equal(findAll(container, '.notice').length, 0);
});

test('placeholderAt が無ければ今までどおり原寸だけを出す', () => {
	const { created, createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages());
	assert.equal(find(container, '.zoom-image').src, URLS[0]);
	assert.equal(created.length, 0);
	assert.equal(findAll(container, '.notice').length, 0);
});

test('ページを送ったら前のページの通知と原寸の読み込みを捨てる', async () => {
	const { created, createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({
		placeholderAt: (index) => REGULAR[index],
		sizes: [{ width: 2000, height: 3000 }, { width: 1200, height: 1800 }, null],
	}));
	assert.equal(created.length, 1);
	assert.equal(findAll(container, '.notice').length, 1);
	zoom.consumeKey({ key: KEYS.NEXT_PAGE });
	// 前のページの原寸読み込みは取り消される (通信を止め、リスナも外す)
	assert.equal(created[0].src, '');
	assert.equal((created[0].listeners.load ?? []).length, 0);
	assert.equal((created[0].listeners.error ?? []).length, 0);
	// 新しいページの仮表示と通知は改めて出る
	assert.equal(created.length, 2);
	assert.equal(find(container, '.zoom-image').src, REGULAR[1]);
	assert.equal(findAll(container, '.notice').length, 1);
});

test('閉じたら通知を消す', () => {
	const { created, createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({ placeholderAt: (index) => REGULAR[index], sizes: [{ width: 2000, height: 3000 }] }));
	assert.equal(findAll(container, '.notice').length, 1);
	zoom.close();
	assert.equal(findAll(container, '.notice').length, 0);
});

test('dispose でも通知を消す', () => {
	const { createImage } = fakeUpgradeImages();
	const { container, zoom } = build({ createImage });
	zoom.open(pages({ placeholderAt: (index) => REGULAR[index], sizes: [{ width: 2000, height: 3000 }] }));
	zoom.dispose();
	assert.equal(findAll(container, '.notice').length, 0);
});
