import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareMenu } from '../../src/content/viewer/share-menu.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

/**
 * リスナを配列で覚える要素の代わり。
 * シェアメニューは開閉と外側クリックを扱うので、そこまで再現する。
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function fakeElement(tag) {
	let text = '';
	const element = {
		tag,
		children: [],
		parent: null,
		attributes: {},
		innerHTML: '',
		className: '',
		hidden: false,
		href: '',
		type: '',
		title: '',
		focused: false,
		listeners: {},
		appendChild(child) { child.parent = element; element.children.push(child); return child; },
		append(...nodes) { for (const node of nodes) element.appendChild(node); },
		setAttribute(name, value) { element.attributes[name] = String(value); },
		getAttribute(name) { return element.attributes[name] ?? null; },
		removeAttribute(name) { delete element.attributes[name]; },
		addEventListener(type, handler) { (element.listeners[type] ??= []).push(handler); },
		removeEventListener(type, handler) {
			element.listeners[type] = (element.listeners[type] ?? []).filter((one) => one !== handler);
		},
		focus() { element.focused = true; },
		dispatch(type, event = {}) {
			for (const handler of [...(element.listeners[type] ?? [])]) handler(event);
		},
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) { text = value; element.children = []; },
	});
	return element;
}

/**
 * document の代わり。要素を作り、自分に付いたリスナも覚える。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const doc = fakeElement('#document');
	doc.createElement = (tag) => fakeElement(tag);
	doc.createElementNS = (_ns, tag) => fakeElement(tag);
	doc.createTextNode = (value) => {
		const node = fakeElement('#text');
		node.textContent = value;
		return node;
	};
	return doc;
}

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

/**
 * createIcon が描いた svg から図形の名前を割り出す。
 * @param {object} icon svg の代わり
 * @returns {string|undefined} ICON_SHAPES のキー
 */
function iconName(icon) {
	return Object.keys(ICON_SHAPES).find((name) => ICON_SHAPES[name].markup === icon.innerHTML);
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
