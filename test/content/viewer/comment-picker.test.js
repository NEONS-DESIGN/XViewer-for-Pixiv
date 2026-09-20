import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentPicker } from '../../../src/content/viewer/comment-picker.js';
import { fakeDoc, fakeElement, find, findAll } from '../../helpers/dom.js';

/**
 * ピッカーと差し込み先を作る。
 * @returns {{doc: object, slot: object, picker: object, opened: {emoji: string[], stamps: string[]}}} 一式
 */
function build() {
	const doc = fakeDoc();
	const slot = fakeElement('span');
	const opened = { emoji: [], stamps: [] };
	const picker = createCommentPicker({ doc });
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
