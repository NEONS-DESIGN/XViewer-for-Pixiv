import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIcon } from '../../src/common/icons.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

/**
 * createElementNS だけを持つ最小の Document の代わり。
 * jsdom を入れずに済ませるため、必要な口だけを備えた偽物を使う。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return {
		createElementNS(_ns, tag) {
			return {
				tagName: tag,
				attributes: {},
				innerHTML: '',
				setAttribute(name, value) { this.attributes[name] = value; },
			};
		},
	};
}

test('ICON_SHAPES に必要な図形が入っている', () => {
	assert.ok(ICON_SHAPES.close.viewBox);
	assert.ok(ICON_SHAPES.close.markup.includes('<path'));
});

test('createIcon は viewBox をそのまま使う', () => {
	const svg = createIcon(fakeDoc(), 'close');
	assert.equal(svg.attributes.viewBox, ICON_SHAPES.close.viewBox);
	assert.equal(svg.attributes.fill, 'currentColor');
	assert.equal(svg.attributes['aria-hidden'], 'true');
	assert.equal(svg.attributes.focusable, 'false');
});

test('createIcon は未知の名前でも空の svg を返す', () => {
	const svg = createIcon(fakeDoc(), 'no-such-icon');
	assert.equal(svg.attributes.viewBox, '0 0 24 24');
	assert.equal(svg.innerHTML, '');
});

test('createIcon は innerHTML が投げても落ちない', () => {
	// Trusted Types を強制するページでは innerHTML への代入が TypeError になる
	const doc = {
		createElementNS() {
			return {
				attributes: {},
				set innerHTML(_v) { throw new TypeError('Trusted Types'); },
				get innerHTML() { return ''; },
				setAttribute(name, value) { this.attributes[name] = value; },
			};
		},
	};
	assert.doesNotThrow(() => createIcon(doc, 'close'));
});

test('ICON_SHAPES に自前の like (pixiv 式の顔) が入っている', () => {
	// pixiv の「いいね」はハートではなく顔。ハートはブックマークを指す (SITE_SPEC §8)
	assert.equal(ICON_SHAPES.like.viewBox, '0 0 24 24');
	assert.equal(ICON_SHAPES.like.markup.match(/<circle/g).length, 2);
	assert.ok(ICON_SHAPES.like.markup.includes('stroke-linecap="round"'));
});

test('ICON_SHAPES からリボン型の bookmark は外してある', () => {
	// ブックマークはハート (favorite) で表す。取り違えの元になるので図形ごと持たない
	assert.equal(ICON_SHAPES.bookmark, undefined);
	assert.ok(ICON_SHAPES.favorite.markup.includes('<path'));
});
