import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureFocusStyle, FOCUS_STYLE_ID, GRID_FOCUS_CSS } from '../../src/content/grid-focus.js';

/**
 * document の代わり。head への出し入れだけを持つ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const head = {
		children: [],
		appendChild(el) { this.children.push(el); return el; },
	};
	return {
		head,
		createElement(tagName) {
			const el = {
				tagName: tagName.toUpperCase(),
				id: '',
				textContent: '',
				remove() {
					const index = head.children.indexOf(el);
					if (index >= 0) head.children.splice(index, 1);
				},
			};
			return el;
		},
		getElementById(id) { return head.children.find((el) => el.id === id) ?? null; },
	};
}

test('ensureFocusStyle は head に style を 1 枚入れる', () => {
	const doc = fakeDoc();
	ensureFocusStyle(doc);
	assert.equal(doc.head.children.length, 1);
	assert.equal(doc.head.children[0].tagName, 'STYLE');
	assert.equal(doc.head.children[0].id, FOCUS_STYLE_ID);
});

test('ensureFocusStyle を 2 回呼んでも style は増えない', () => {
	// SPA 遷移で apply() が何度も走るため
	const doc = fakeDoc();
	ensureFocusStyle(doc);
	ensureFocusStyle(doc);
	assert.equal(doc.head.children.length, 1);
});

test('dispose で style が消える', () => {
	const doc = fakeDoc();
	const handle = ensureFocusStyle(doc);
	handle.dispose();
	assert.equal(doc.head.children.length, 0);
});

test('dispose を 2 回呼んでも投げない', () => {
	const doc = fakeDoc();
	const handle = ensureFocusStyle(doc);
	handle.dispose();
	assert.doesNotThrow(() => handle.dispose());
});

test('head が無くても投げない', () => {
	const doc = fakeDoc();
	doc.head = null;
	let handle;
	assert.doesNotThrow(() => { handle = ensureFocusStyle(doc); });
	assert.doesNotThrow(() => handle.dispose());
});

test('枠を出すのはキーボード操作のサムネイルだけ', () => {
	// :focus-visible が無いとクリックでも枠が出る。:has(img) が無いとタイトルにも出る
	assert.match(GRID_FOCUS_CSS, /:focus-visible/);
	assert.match(GRID_FOCUS_CSS, /:has\(img\)/);
});

test('pixiv 標準のフォーカスリングを消さない', () => {
	// UI_DESIGN_KIT の原則。代わりの表示が出なくなったとき、何も見えなくなるのを防ぐ
	assert.doesNotMatch(GRID_FOCUS_CSS, /outline\s*:\s*none/);
});
