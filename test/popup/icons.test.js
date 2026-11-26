import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createIcon, POPUP_ICON_SHAPES } from '../../src/popup/icons.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';
import { THEME_TOGGLE } from '../../src/common/constants.js';
import { fakeDoc, iconName } from '../helpers/dom.js';

test('popup の図形の表は ICON_SHAPES の同じ名前の図形を指す', () => {
	for (const [name, shape] of Object.entries(POPUP_ICON_SHAPES)) {
		assert.equal(shape, ICON_SHAPES[name], name);
	}
});

test('テーマ切り替えのアイコンはすべて popup の図形の表にある', () => {
	// THEME_TOGGLE の icon は名前で持つので、表へ足し忘れると空のアイコンになる
	for (const entry of Object.values(THEME_TOGGLE)) {
		assert.ok(Object.hasOwn(POPUP_ICON_SHAPES, entry.icon), entry.icon);
	}
});

test('popup の createIcon は名前どおりの図形を描く', () => {
	for (const name of Object.keys(POPUP_ICON_SHAPES)) {
		assert.equal(iconName(createIcon(fakeDoc(), name)), name);
	}
});

test('popup の createIcon は表に無い名前なら空の svg を返し、warn を出す', () => {
	const warn = mock.method(console, 'warn', () => {});
	try {
		const svg = createIcon(fakeDoc(), 'close');
		assert.equal(svg.children.length, 0);
		assert.equal(warn.mock.callCount(), 1);
		assert.equal(warn.mock.calls[0].arguments[1], 'close');
	} finally {
		warn.mock.restore();
	}
});
