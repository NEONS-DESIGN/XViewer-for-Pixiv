import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsRichOptions } from '../../src/common/rich-select.js';

test('CSS.supports が真なら対応とみなす', () => {
	const win = { CSS: { supports: (property, value) => property === 'appearance' && value === 'base-select' } };
	assert.equal(supportsRichOptions(win), true);
});

test('CSS.supports が偽なら非対応へ倒す', () => {
	const win = { CSS: { supports: () => false } };
	assert.equal(supportsRichOptions(win), false);
});

test('window が無ければ非対応へ倒す', () => {
	assert.equal(supportsRichOptions(undefined), false);
	assert.equal(supportsRichOptions({}), false);
});

test('判定そのものが投げても非対応として続行する', () => {
	const win = { CSS: { supports() { throw new Error('だめ'); } } };
	assert.equal(supportsRichOptions(win), false);
});
