import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImagePane } from '../../src/content/viewer/image-pane.js';
import { createSidebar } from '../../src/content/viewer/sidebar.js';

/**
 * class セレクタだけを解する最小の要素の代わり。
 * ペインが「自分が作った DOM を自分で片付ける」ことだけを確かめるので、
 * 親子関係と remove() が動けば足りる。
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function fakeElement(tag) {
	let text = '';
	const element = {
		tag,
		children: [],
		parent: null,
		className: '',
		appendChild(child) {
			child.parent = element;
			element.children.push(child);
			return child;
		},
		append(...nodes) {
			for (const node of nodes) element.appendChild(node);
		},
		remove() {
			if (!element.parent) return;
			element.parent.children = element.parent.children.filter((child) => child !== element);
			element.parent = null;
		},
		setAttribute() {},
		getAttribute() { return null; },
		addEventListener() {},
		removeEventListener() {},
		querySelectorAll(selector) { return findByClass(element, selector); },
		querySelector(selector) { return findByClass(element, selector)[0] ?? null; },
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) {
			text = value;
			// 実際の DOM と同じく、文字列を入れると子は消える
			element.children = [];
		},
	});
	return element;
}

/**
 * class セレクタの並びに合う子孫を集める。
 * @param {object} root 探す起点
 * @param {string} selector '.status, .frame' のような並び
 * @returns {object[]} 見つかった要素
 */
function findByClass(root, selector) {
	const classes = selector.split(',').map((part) => part.trim().replace(/^\./, ''));
	const found = [];
	const walk = (node) => {
		for (const child of node.children) {
			if (String(child.className).split(/\s+/).some((name) => classes.includes(name))) found.push(child);
			walk(child);
		}
	};
	walk(root);
	return found;
}

/**
 * document の代わり。要素を作る役だけを持つ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return {
		createElement: (tag) => fakeElement(tag),
		createElementNS: (_ns, tag) => fakeElement(tag),
		createDocumentFragment: () => fakeElement('#fragment'),
		createTextNode: (value) => {
			const node = fakeElement('#text');
			node.textContent = value;
			return node;
		},
	};
}

/** サイドバーへ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149425016',
	userId: '54734418',
	userName: '作者',
	title: 'タイトル',
	comment: '本文<br />2行目',
	tags: ['オリジナル'],
	likeCount: 1,
	bookmarkCount: 2,
	viewCount: 3,
	commentCount: 4,
	createDate: '2026-09-08T17:45:00+09:00',
	pageCount: 1,
	urls: { regular: 'https://i.pximg.net/img-master/x_p0_master1200.jpg' },
});

test('画像ペインは dispose で自分の枠を DOM から外す', async () => {
	const container = fakeElement('div');
	const pane = createImagePane({
		doc: fakeDoc(),
		container,
		// 先読みを 0 にして Image を作らせない (node には Image が無い)
		settings: { imageQuality: 'regular', prefetch: 0 },
	});
	await pane.render(DETAIL);
	assert.equal(container.querySelectorAll('.frame').length, 1);

	pane.dispose();
	// 枠が残ると、次の作品を読み込んでいる間に前の作品の矢印とカウンタが見えてしまう
	assert.equal(container.querySelectorAll('.frame').length, 0);
	assert.equal(container.children.length, 0);
});

test('サイドバーは dispose で中身を空にする', () => {
	const container = fakeElement('div');
	const pane = createSidebar({ doc: fakeDoc(), container });
	pane.render(DETAIL);
	assert.ok(container.children.length > 0);

	pane.dispose();
	assert.equal(container.children.length, 0);
});
