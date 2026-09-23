import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentPicker } from '../../../src/content/viewer/comment-picker.js';
import { fakeDoc, fakeElement, find, findAll } from '../../helpers/dom.js';
import { createStrings } from '../../../src/i18n/index.js';

/** テストで使う文言のカタログ。日本語の文言は元の MESSAGES と同じ値。 */
const STRINGS = createStrings('ja');

/**
 * ピッカーと差し込み先を作る。
 * @param {object} [strings] 文言のカタログ。省略すると日本語
 * @returns {{doc: object, slot: object, picker: object, opened: {emoji: string[], stamps: string[]}}} 一式
 */
function build(strings = STRINGS) {
	const doc = fakeDoc();
	const slot = fakeElement('span');
	const opened = { emoji: [], stamps: [] };
	const picker = createCommentPicker({ doc, strings });
	return { doc, slot, picker, opened };
}

/**
 * ピッカーを開く。
 * @param {object} one build() の戻り値
 * @returns {object} パネル要素
 */
function open(one) {
	one.picker.open(one.slot, {
		onEmoji: (name) => one.opened.emoji.push(name),
		onStamp: (id) => one.opened.stamps.push(id),
	});
	return find(one.slot, '.comment-picker');
}

test('開くと差し込み先にパネルが入る', () => {
	const one = build();
	assert.equal(one.picker.isOpen(), false);
	const panel = open(one);
	assert.ok(panel);
	assert.equal(one.picker.isOpen(), true);
});

test('タブは絵文字とスタンプの 2 枚', () => {
	const one = build();
	const panel = open(one);
	const tabs = findAll(panel, '.comment-picker-tab');
	assert.deepEqual(tabs.map((tab) => tab.textContent), ['絵文字', 'スタンプ']);
	assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
	assert.equal(tabs[1].getAttribute('aria-selected'), 'false');
});

test('絵文字を選ぶと名前を返して閉じる', async () => {
	const one = build();
	const panel = open(one);
	const items = findAll(panel, '.comment-picker-item');
	// PIXIV_EMOJI の宣言順。先頭は normal
	assert.equal(items[0].getAttribute('aria-label'), '(normal)');
	await items[0].click();
	assert.deepEqual(one.opened.emoji, ['normal']);
	assert.equal(one.picker.isOpen(), false);
});

test('スタンプのタブに切り替えると 40 個並ぶ', async () => {
	const one = build();
	const panel = open(one);
	await findAll(panel, '.comment-picker-tab')[1].click();
	const items = findAll(panel, '.comment-picker-item');
	assert.equal(items.length, 40);
	assert.equal(items[0].getAttribute('aria-label'), 'スタンプ 301');
});

test('スタンプを選ぶと ID を返して閉じる', async () => {
	const one = build();
	const panel = open(one);
	await findAll(panel, '.comment-picker-tab')[1].click();
	await findAll(panel, '.comment-picker-item')[0].click();
	assert.deepEqual(one.opened.stamps, ['301']);
	assert.equal(one.picker.isOpen(), false);
});

test('Escape で閉じる', () => {
	const one = build();
	open(one);
	assert.equal(one.picker.consumeKey({ key: 'Escape' }), true);
	assert.equal(one.picker.isOpen(), false);
});

test('閉じているときは Escape を食い止めない', () => {
	const one = build();
	assert.equal(one.picker.consumeKey({ key: 'Escape' }), false);
});

test('開き直すと同じパネルを使い回す', () => {
	const one = build();
	const first = open(one);
	one.picker.close();
	const second = open(one);
	assert.equal(first, second);
	assert.equal(one.slot.children.length, 1);
});

/**
 * 位置を測れるピッカーを作る。
 * パネル以外を測ることは無いので、作る要素すべてに同じ値を返させる。
 * @param {() => number} panelTop 既定 (上向き) で描いたときのパネルの上端 (画面座標)
 * @returns {{doc: object, slot: object, picker: object, opened: {emoji: string[], stamps: string[]}}} 一式
 */
function measurable(panelTop) {
	const one = build();
	const create = one.doc.createElement;
	one.doc.createElement = (tag) => {
		const element = create(tag);
		element.getBoundingClientRect = () => ({ top: panelTop(), height: 248, bottom: panelTop() + 248 });
		return element;
	};
	return one;
}

test('上に余地が無ければ下へ開く', () => {
	// 入力欄が上端に貼り付いていると、上へ開いたパネルは画面の外へ出て触れなくなる
	const one = measurable(() => -171);
	assert.equal(open(one).classList.contains('is-below'), true);
});

test('上に余地があれば上のまま開く', () => {
	// 一覧に重なるほうが、一覧を押し下げるより読みやすい
	const one = measurable(() => 120);
	assert.equal(open(one).classList.contains('is-below'), false);
});

test('開き直すたびに向きを測り直す', () => {
	let top = -171;
	const one = measurable(() => top);
	assert.equal(open(one).classList.contains('is-below'), true);
	one.picker.close();
	top = 120;
	assert.equal(open(one).classList.contains('is-below'), false);
});

test('位置を測れなければ既定の向き (上) のままにする', () => {
	const one = build();
	assert.equal(open(one).classList.contains('is-below'), false);
});

/**
 * 開くボタン付きでピッカーを開く。
 * @param {object} one build() の戻り値
 * @param {object} opener 開くボタン
 * @param {object} [handlers] 受け口の差し替え
 * @returns {object} パネル要素
 */
function openFrom(one, opener, handlers = {}) {
	one.picker.open(one.slot, {
		opener,
		onEmoji: handlers.onEmoji ?? ((name) => one.opened.emoji.push(name)),
		onStamp: handlers.onStamp ?? ((id) => one.opened.stamps.push(id)),
	});
	return find(one.slot, '.comment-picker');
}

test('左右キーでタブを移り、フォーカスも中身も一緒に動く', () => {
	// tabindex="-1" で Tab から外している以上、左右キーが無いとスタンプのタブへ辿り着けない
	const one = build();
	const panel = open(one);
	const tabs = findAll(panel, '.comment-picker-tab');
	tabs[0].focus();
	assert.equal(one.picker.consumeKey({ key: 'ArrowRight' }), true);
	assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
	assert.equal(tabs[1].getAttribute('tabindex'), '0');
	assert.equal(tabs[0].getAttribute('tabindex'), '-1');
	assert.equal(tabs[1].focused, true);
	assert.equal(findAll(panel, '.comment-picker-item').length, 40);
});

test('端では左右キーで折り返す', () => {
	const one = build();
	const panel = open(one);
	const tabs = findAll(panel, '.comment-picker-tab');
	tabs[0].focus();
	assert.equal(one.picker.consumeKey({ key: 'ArrowLeft' }), true);
	assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
	assert.equal(one.picker.consumeKey({ key: 'ArrowRight' }), true);
	assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
});

test('タブの外で押した左右キーは奪わない', () => {
	// 本文を書いている最中のキャレット移動を止めない。閉じている間はビュワーのページ送り
	const one = build();
	const input = fakeElement('textarea');
	one.slot.appendChild(input);
	assert.equal(one.picker.consumeKey({ key: 'ArrowRight' }), false);
	open(one);
	input.focus();
	assert.equal(one.picker.consumeKey({ key: 'ArrowRight' }), false);
	assert.equal(findAll(find(one.slot, '.comment-picker'), '.comment-picker-tab')[0].getAttribute('aria-selected'), 'true');
});

test('タブとパネルを aria で結ぶ', async () => {
	const one = build();
	const panel = open(one);
	const grid = find(panel, '.comment-picker-grid');
	const tabs = findAll(panel, '.comment-picker-tab');
	assert.equal(grid.getAttribute('role'), 'tabpanel');
	assert.ok(grid.getAttribute('id'));
	assert.equal(tabs[0].getAttribute('aria-controls'), grid.getAttribute('id'));
	assert.equal(tabs[1].getAttribute('aria-controls'), grid.getAttribute('id'));
	assert.equal(grid.getAttribute('aria-labelledby'), tabs[0].getAttribute('id'));
	// 見出しは選ばれているタブ。切り替えたら付け替える
	await tabs[1].click();
	assert.equal(grid.getAttribute('aria-labelledby'), tabs[1].getAttribute('id'));
});

test('項目を選んで閉じたら開いたボタンへフォーカスを戻す', async () => {
	// 選んだ項目ごと DOM から消える。戻さないとフォーカスが body へ落ち、Escape がビュワーまで届く
	const one = build();
	const opener = fakeElement('button');
	one.slot.appendChild(opener);
	const panel = openFrom(one, opener);
	const items = findAll(panel, '.comment-picker-item');
	items[0].focus();
	await items[0].click();
	assert.equal(opener.focused, true);
});

test('受け口が入力欄へ移したフォーカスは奪わない', async () => {
	// 絵文字は続きを書けるよう入力欄へ返す。ピッカーが上書きしてはいけない
	const one = build();
	const opener = fakeElement('button');
	const input = fakeElement('textarea');
	one.slot.append(opener, input);
	const panel = openFrom(one, opener, { onEmoji: () => { input.focus(); } });
	const items = findAll(panel, '.comment-picker-item');
	items[0].focus();
	await items[0].click();
	assert.equal(input.focused, true);
	assert.equal(opener.focused, false);
});

test('Escape で閉じたときもパネルの中のフォーカスは開いたボタンへ戻す', () => {
	const one = build();
	const opener = fakeElement('button');
	one.slot.appendChild(opener);
	const panel = openFrom(one, opener);
	findAll(panel, '.comment-picker-tab')[0].focus();
	assert.equal(one.picker.consumeKey({ key: 'Escape' }), true);
	assert.equal(opener.focused, true);
});

test('パネルの外にフォーカスがあるなら閉じても動かさない', () => {
	// 入力欄で書いている途中の Escape。ボタンへ飛ばされると続きが書けなくなる
	const one = build();
	const opener = fakeElement('button');
	const input = fakeElement('textarea');
	one.slot.append(opener, input);
	openFrom(one, opener);
	input.focus();
	assert.equal(one.picker.consumeKey({ key: 'Escape' }), true);
	assert.equal(input.focused, true);
	assert.equal(opener.focused, false);
});

/**
 * スクロールする祖先の中へ差し込むピッカーを作る。
 * @param {number} panelTop 既定 (上向き) で描いたときのパネルの上端 (画面座標)
 * @param {number} scrollportTop スクロール領域の上端 (画面座標)
 * @returns {object} 一式
 */
function inScrollport(panelTop, scrollportTop) {
	const one = build();
	const scrollport = fakeElement('div');
	scrollport.getBoundingClientRect = () => ({ top: scrollportTop, height: 400, bottom: scrollportTop + 400 });
	scrollport.appendChild(one.slot);
	one.doc.defaultView = {
		getComputedStyle: (el) => ({ overflowY: el === scrollport ? 'auto' : 'visible' }),
	};
	const create = one.doc.createElement;
	one.doc.createElement = (tag) => {
		const element = create(tag);
		element.getBoundingClientRect = () => ({ top: panelTop, height: 248, bottom: panelTop + 248 });
		return element;
	};
	return one;
}

test('スクロール領域の上端で切れるなら下へ開く', () => {
	// 「コメントだけを送る」設定では .comment-scroll が切り取る。画面には入っていても触れない
	const one = inScrollport(120, 200);
	assert.equal(open(one).classList.contains('is-below'), true);
});

test('スクロール領域の中でも余地があれば上のまま開く', () => {
	const one = inScrollport(300, 200);
	assert.equal(open(one).classList.contains('is-below'), false);
});

test('英語のカタログではパネルの読み上げ名が英語になる', () => {
	const one = build(createStrings('en'));
	const panel = open(one);
	assert.equal(panel.getAttribute('aria-label'), 'Emoji and stamps');
});
