import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareMenu } from '../../src/content/viewer/share-menu.js';
import { fakeElement, fakeDoc, iconName } from '../helpers/dom.js';

/** シェア対象の作品詳細の代わり。 */
const DETAIL = Object.freeze({ id: '149431011', title: 'モンブラン', userName: 'チャイ' });

/**
 * メニューを組み立てる。
 * @param {object} [overrides] 依存の差し替え
 * @returns {object} doc / menu / button / list をまとめたもの
 */
function build(overrides = {}) {
	const doc = fakeDoc();
	const menu = createShareMenu({ doc, detail: DETAIL, ...overrides });
	const button = menu.element.children[0];
	const list = menu.element.children[1];
	return { doc, menu, button, list };
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

test('項目は X / Facebook / Pawoo / リンクをコピーの順に並ぶ', () => {
	const { list } = build();
	const items = list.children.filter((child) => child.className === 'share-item');
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

test('リンクをコピーは作品 URL をクリップボードへ書く', async () => {
	const written = [];
	const { list } = build({ writeText: async (value) => { written.push(value); } });
	const copy = list.children.find((child) => child.tag === 'button');
	copy.dispatch('click', {});
	await Promise.resolve();
	assert.deepEqual(written, ['https://www.pixiv.net/artworks/149431011']);
});

test('コピーに失敗しても落ちず、その旨を伝える', async () => {
	const { menu, button, list } = build({ writeText: async () => { throw new Error('拒否された'); } });
	button.dispatch('click', {});
	const copy = list.children.find((child) => child.tag === 'button');
	copy.dispatch('click', {});
	await Promise.resolve();
	await Promise.resolve();
	const status = list.children.find((child) => child.className === 'share-status');
	assert.equal(status.textContent, 'コピーできませんでした');
	assert.equal(menu.isOpen(), true);
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

test('dispose は document に付けたリスナを外す', () => {
	const { doc, menu } = build();
	menu.dispose();
	assert.equal((doc.listeners.pointerdown ?? []).length, 0);
});
