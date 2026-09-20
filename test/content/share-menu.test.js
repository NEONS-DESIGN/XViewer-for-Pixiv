import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareMenu } from '../../src/content/viewer/share-menu.js';
import { fakeElement, fakeDoc, iconName, flush } from '../helpers/dom.js';

/** シェア対象の作品詳細の代わり。 */
const DETAIL = Object.freeze({ id: '149431011', title: 'モンブラン', userName: 'チャイ' });

/**
 * メニューを組み立てる。
 * @param {object} [overrides] 依存の差し替え
 * @returns {object} doc / menu / button / list / items をまとめたもの
 */
function build(overrides = {}) {
	const doc = fakeDoc();
	const menu = createShareMenu({ doc, detail: DETAIL, ...overrides });
	const button = menu.element.children[0];
	const list = menu.element.children[1];
	const items = list.children.filter((child) => child.className === 'share-item');
	return { doc, menu, button, list, items };
}

/**
 * キーイベントの代わり。
 * @param {string} key キー名
 * @returns {{key: string, prevented: boolean, preventDefault: Function}} イベント
 */
function keyEvent(key) {
	const event = { key, prevented: false, preventDefault() { event.prevented = true; } };
	return event;
}

test('最初は閉じている', () => {
	const { menu, button, list } = build();
	assert.equal(menu.isOpen(), false);
	assert.equal(list.hidden, true);
	assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('ボタンを押すと開き、もう一度押すと閉じる', () => {
	const { menu, button, list } = build();
	button.dispatch('click', {});
	assert.equal(menu.isOpen(), true);
	assert.equal(list.hidden, false);
	assert.equal(button.getAttribute('aria-expanded'), 'true');
	button.dispatch('click', {});
	assert.equal(menu.isOpen(), false);
	assert.equal(list.hidden, true);
});

test('文字が見えているボタンに title を重ねない', () => {
	const { button } = build();
	assert.equal(button.title, '');
	assert.equal(button.children[1].textContent, 'この作品をシェア');
});

test('項目は X / Facebook / Pawoo / リンクをコピーの順に並ぶ', () => {
	const { items } = build();
	assert.deepEqual(items.map((item) => item.children[1].textContent), ['X', 'Facebook', 'Pawoo', 'リンクをコピー']);
	assert.deepEqual(
		items.map((item) => iconName(item.children[0])),
		['brandX', 'brandFacebook', 'brandMastodon', 'link'],
	);
});

test('外部サイトへのリンクは新しいタブで開き、opener を渡さない', () => {
	const { list } = build();
	const links = list.children.filter((child) => child.tag === 'a');
	assert.equal(links.length, 3);
	for (const link of links) {
		assert.equal(link.getAttribute('target'), '_blank');
		assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
		assert.equal(link.href.startsWith('https://'), true);
	}
});

test('リンクを押したら閉じてボタンへフォーカスを戻す', () => {
	// 押した a は hidden の中に入る。戻さないとフォーカスが body へ落ち、モーダルのキー操作が効かなくなる
	const { menu, button, list } = build();
	button.dispatch('click', {});
	button.focused = false;
	const link = list.children.find((child) => child.tag === 'a');
	link.dispatch('click', {});
	assert.equal(menu.isOpen(), false);
	assert.equal(button.focused, true);
});

test('リンクをコピーは作品 URL をクリップボードへ書く', async () => {
	const written = [];
	const { list } = build({ writeText: async (value) => { written.push(value); } });
	const copy = list.children.find((child) => child.tag === 'button');
	copy.dispatch('click', {});
	await flush();
	assert.deepEqual(written, ['https://www.pixiv.net/artworks/149431011']);
});

test('コピーに失敗しても落ちず、その旨を伝える', async () => {
	const { menu, button, list } = build({ writeText: async () => { throw new Error('拒否された'); } });
	button.dispatch('click', {});
	const copy = list.children.find((child) => child.tag === 'button');
	copy.dispatch('click', {});
	await flush();
	const status = list.children.find((child) => child.className === 'share-status');
	assert.equal(status.textContent, 'コピーできませんでした');
	assert.equal(menu.isOpen(), true);
});

test('クリップボードが無くて同期で落ちても、失敗として伝える', async () => {
	// navigator.clipboard が undefined の環境では Promise を作る前に TypeError が出る
	const { button, list } = build({ writeText: () => { throw new TypeError('clipboard is undefined'); } });
	button.dispatch('click', {});
	const copy = list.children.find((child) => child.tag === 'button');
	await copy.dispatch('click', {});
	await flush();
	const status = list.children.find((child) => child.className === 'share-status');
	assert.equal(status.textContent, 'コピーできませんでした');
});

test('consumeEscape は開いているときだけ食い止めて閉じる', () => {
	const { menu, button } = build();
	assert.equal(menu.consumeEscape(), false);
	button.dispatch('click', {});
	assert.equal(menu.consumeEscape(), true);
	assert.equal(menu.isOpen(), false);
	// 閉じたらボタンへフォーカスを戻す。モーダル全体のフォーカスが迷子にならないように
	assert.equal(button.focused, true);
});

test('開いたら最初の項目へフォーカスを置く', () => {
	const { button, items } = build();
	button.dispatch('click', {});
	assert.equal(items[0].focused, true);
});

test('上下キーで項目を巡り、端で折り返す', () => {
	const { menu, button, items } = build();
	button.dispatch('click', {});
	items[0].focus();
	const down = keyEvent('ArrowDown');
	assert.equal(menu.consumeKey(down), true);
	assert.equal(down.prevented, true);
	assert.equal(items[1].focused, true);

	items[3].focus();
	assert.equal(menu.consumeKey(keyEvent('ArrowDown')), true);
	assert.equal(items[0].focused, true);

	items[0].focus();
	assert.equal(menu.consumeKey(keyEvent('ArrowUp')), true);
	assert.equal(items[3].focused, true);
});

test('Home と End で端の項目へ移る', () => {
	const { menu, button, items } = build();
	button.dispatch('click', {});
	items[1].focus();
	assert.equal(menu.consumeKey(keyEvent('End')), true);
	assert.equal(items[3].focused, true);
	assert.equal(menu.consumeKey(keyEvent('Home')), true);
	assert.equal(items[0].focused, true);
});

test('閉じているときや関係ないキーは食い止めない', () => {
	// 食い止めると、ビュワー本体の上下キー (作品の移動) が効かなくなる
	const { menu, button } = build();
	assert.equal(menu.consumeKey(keyEvent('ArrowDown')), false);
	button.dispatch('click', {});
	const tab = keyEvent('Tab');
	assert.equal(menu.consumeKey(tab), false);
	assert.equal(tab.prevented, false);
	assert.equal(menu.consumeKey(keyEvent('ArrowRight')), false);
});

test('Escape は consumeKey でも閉じてボタンへ戻す', () => {
	const { menu, button } = build();
	button.dispatch('click', {});
	button.focused = false;
	const escape = keyEvent('Escape');
	assert.equal(menu.consumeKey(escape), true);
	assert.equal(escape.prevented, true);
	assert.equal(menu.isOpen(), false);
	assert.equal(button.focused, true);
});

test('フォーカスがメニューの外へ出たら閉じる', () => {
	const { menu, button, items } = build();
	button.dispatch('click', {});
	// 項目の間の移動では閉じない
	menu.element.dispatch('focusout', { relatedTarget: items[1] });
	assert.equal(menu.isOpen(), true);
	// ボタンへ戻っても閉じない
	menu.element.dispatch('focusout', { relatedTarget: button });
	assert.equal(menu.isOpen(), true);
	// 行き先が無い (見出しの文字を押した等) ときは閉じない。外側のクリックは pointerdown が受け持つ
	menu.element.dispatch('focusout', { relatedTarget: null });
	assert.equal(menu.isOpen(), true);
	// Tab で外へ抜けたら閉じる
	menu.element.dispatch('focusout', { relatedTarget: fakeElement('a') });
	assert.equal(menu.isOpen(), false);
});

test('メニューの外を押すと閉じる', () => {
	const { doc, menu, button, list } = build();
	button.dispatch('click', {});
	doc.dispatch('pointerdown', { composedPath: () => [fakeElement('div')] });
	assert.equal(menu.isOpen(), false);
	// 中を押しても閉じない
	button.dispatch('click', {});
	doc.dispatch('pointerdown', { composedPath: () => [list, menu.element] });
	assert.equal(menu.isOpen(), true);
});

test('dispose は document と自分に付けたリスナを外す', () => {
	const { doc, menu } = build();
	menu.dispose();
	assert.equal((doc.listeners.pointerdown ?? []).length, 0);
	assert.equal((menu.element.listeners.focusout ?? []).length, 0);
});
