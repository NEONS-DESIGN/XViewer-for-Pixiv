import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createIcon } from '../../src/common/icons.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';
import { LOG_PREFIX } from '../../src/common/log.js';
import { fakeDoc, fakeElement } from '../helpers/dom.js';

/** 図形が見つからないときに createIcon が使う空の描画領域。(icons.js の EMPTY_VIEW_BOX と同じ値) */
const EMPTY_VIEW_BOX = '0 0 24 24';

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
	assert.equal(svg.innerHTML, ICON_SHAPES.close.markup);
});

test('createIcon は未知の名前でも空の svg を返し、warn で名前を残す', () => {
	// 文字列参照のタイプミスに気づけるよう警告だけ出す。UI 構築は止めない
	const warn = mock.method(console, 'warn', () => {});
	try {
		const svg = createIcon(fakeDoc(), 'no-such-icon');
		assert.equal(svg.attributes.viewBox, EMPTY_VIEW_BOX);
		assert.equal(svg.innerHTML, '');
		assert.equal(warn.mock.callCount(), 1);
		assert.ok(String(warn.mock.calls[0].arguments[0]).startsWith(LOG_PREFIX));
		assert.equal(warn.mock.calls[0].arguments[1], 'no-such-icon');
	} finally {
		warn.mock.restore();
	}
});

test('createIcon は知っている名前では warn を出さない', () => {
	const warn = mock.method(console, 'warn', () => {});
	try {
		createIcon(fakeDoc(), 'close');
		assert.equal(warn.mock.callCount(), 0);
	} finally {
		warn.mock.restore();
	}
});

test('createIcon は innerHTML が投げても空の svg で続行する', () => {
	// Trusted Types を強制するページでは innerHTML への代入が TypeError になる。
	// 落とさないだけでなく、属性の付いた svg を返して UI 構築を続けられること (SPEC §12)
	const doc = fakeDoc();
	doc.createElementNS = (_ns, tag) => {
		const element = fakeElement(tag);
		Object.defineProperty(element, 'innerHTML', {
			get() { return ''; },
			set() { throw new TypeError('Trusted Types'); },
		});
		return element;
	};
	let svg = null;
	assert.doesNotThrow(() => { svg = createIcon(doc, 'close'); });
	assert.equal(svg.tag, 'svg');
	assert.equal(svg.attributes.viewBox, ICON_SHAPES.close.viewBox);
	assert.equal(svg.attributes['aria-hidden'], 'true');
	assert.equal(svg.attributes.focusable, 'false');
	assert.equal(svg.innerHTML, '');
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
