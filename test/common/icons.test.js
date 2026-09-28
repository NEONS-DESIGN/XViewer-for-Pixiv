import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createIcon } from '../../src/common/icons.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';
import { LOG_PREFIX } from '../../src/common/log.js';
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS } from '../../scripts/svg-elements.mjs';
import { fakeDoc, fakeElement, iconName } from '../helpers/dom.js';

/** 図形が見つからないときに createIcon が使う空の描画領域。(icons.js の EMPTY_VIEW_BOX と同じ値) */
const EMPTY_VIEW_BOX = '0 0 24 24';

/** SVG の名前空間。(icons.js の SVG_NS と同じ値) */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * createElementNS に渡された名前空間を要素へ記録する doc を作る。
 * 共通の fakeDoc は名前空間を捨てるので、子要素まで SVG で作られたかを確かめるときに使う。
 * @returns {object} doc の代わり。作った要素は namespaceURI を持つ
 */
function namespaceRecordingDoc() {
	const doc = fakeDoc();
	doc.createElementNS = (ns, tag) => {
		const element = fakeElement(tag);
		element.namespaceURI = ns;
		return element;
	};
	return doc;
}

/**
 * 子要素を要素名と属性の組に戻す。図形データ (elements) と同じ形にして突き合わせる。
 * @param {object} svg createIcon が返した svg
 * @returns {Array<{tag: string, attrs: Record<string, string>}>} 子要素
 */
function drawnElements(svg) {
	return svg.children.map((child) => ({ tag: child.tag, attrs: { ...child.attributes } }));
}

test('ICON_SHAPES に必要な図形が入っている', () => {
	assert.ok(ICON_SHAPES.close.viewBox);
	assert.equal(ICON_SHAPES.close.elements[0].tag, 'path');
	assert.ok(ICON_SHAPES.close.elements[0].attrs.d);
});

test('ICON_SHAPES のどの図形も、許した要素だけを 1 つ以上持ち、文字列の markup を持たない', () => {
	// innerHTML へ流し込む文字列を持たないこと自体が、この形にした理由
	for (const [name, shape] of Object.entries(ICON_SHAPES)) {
		assert.ok(shape.viewBox, name);
		assert.equal(shape.markup, undefined, name);
		assert.ok(Array.isArray(shape.elements) && shape.elements.length > 0, name);
		for (const { tag, attrs } of shape.elements) {
			assert.ok(ALLOWED_TAGS.includes(tag), `${name}: ${tag}`);
			assert.ok(Object.keys(attrs).length > 0, `${name}: ${tag}`);
			for (const [attribute, value] of Object.entries(attrs)) {
				assert.ok(ALLOWED_ATTRIBUTES.includes(attribute), `${name}: ${attribute}`);
				assert.equal(typeof value, 'string', name);
				assert.ok(!value.includes('&'), `${name}: ${attribute}`);
			}
		}
	}
});

test('ICON_SHAPES は入れ子まで凍っている', () => {
	// 図形データを誤って書き換えると、以後のすべてのアイコンが変わる
	assert.ok(Object.isFrozen(ICON_SHAPES));
	for (const [name, shape] of Object.entries(ICON_SHAPES)) {
		assert.ok(Object.isFrozen(shape), name);
		assert.ok(Object.isFrozen(shape.elements), name);
		for (const element of shape.elements) {
			assert.ok(Object.isFrozen(element), name);
			assert.ok(Object.isFrozen(element.attrs), name);
		}
	}
});

test('createIcon は viewBox をそのまま使い、図形を子要素として組み立てる', () => {
	const svg = createIcon(fakeDoc(), 'close');
	assert.equal(svg.attributes.viewBox, ICON_SHAPES.close.viewBox);
	assert.equal(svg.attributes.fill, 'currentColor');
	assert.equal(svg.attributes['aria-hidden'], 'true');
	assert.equal(svg.attributes.focusable, 'false');
	assert.deepEqual(drawnElements(svg), ICON_SHAPES.close.elements);
});

test('createIcon は svg も子要素も SVG の名前空間で作る', () => {
	// 子要素を HTML の名前空間で作ると、DOM には入っても何も描かれない
	const svg = createIcon(namespaceRecordingDoc(), 'like');
	assert.equal(svg.namespaceURI, SVG_NS);
	assert.equal(svg.children.length, ICON_SHAPES.like.elements.length);
	for (const child of svg.children) assert.equal(child.namespaceURI, SVG_NS);
});

test('createIcon は like の口 (線だけの path) の属性を欠かさず写す', () => {
	// fill="none" と stroke が欠けると、口が塗りつぶしの塊に見える
	const svg = createIcon(fakeDoc(), 'like');
	assert.deepEqual(drawnElements(svg), ICON_SHAPES.like.elements);
	const mouth = svg.children.find((child) => child.tag === 'path');
	assert.equal(mouth.attributes.fill, 'none');
	assert.equal(mouth.attributes.stroke, 'currentColor');
	assert.equal(mouth.attributes['stroke-width'], '4');
	assert.equal(mouth.attributes['stroke-linecap'], 'round');
});

test('createIcon はどの図形でも図形データどおりに描き、iconName で名前へ戻せる', () => {
	for (const name of Object.keys(ICON_SHAPES)) {
		const svg = createIcon(fakeDoc(), name);
		assert.deepEqual(drawnElements(svg), ICON_SHAPES[name].elements, name);
		// 図形が互いに重ならないことも兼ねる (重なると iconName が先の名前を返す)
		assert.equal(iconName(svg), name);
	}
});

test('createIcon は呼ぶたびに別の要素を作る', () => {
	// 同じ要素を使い回すと、2 つ目のボタンへ入れた時点で 1 つ目から図形が抜ける
	const doc = fakeDoc();
	const first = createIcon(doc, 'close');
	const second = createIcon(doc, 'close');
	assert.notEqual(first, second);
	assert.notEqual(first.children[0], second.children[0]);
	assert.equal(first.children[0].parent, first);
	assert.equal(second.children[0].parent, second);
});

test('createIcon は未知の名前でも空の svg を返し、warn で名前を残す', () => {
	// 文字列参照のタイプミスに気づけるよう警告だけ出す。UI 構築は止めない
	const warn = mock.method(console, 'warn', () => {});
	try {
		const svg = createIcon(fakeDoc(), 'no-such-icon');
		assert.equal(svg.attributes.viewBox, EMPTY_VIEW_BOX);
		assert.equal(svg.children.length, 0);
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

test('createIcon は innerHTML に触れないので、innerHTML が投げるページでも図形を描ける', () => {
	// Trusted Types を強制するページでは innerHTML への代入が TypeError になる。
	// createIcon は代入しないので、それでも図形がそのまま出ることを見る
	const doc = fakeDoc();
	doc.createElementNS = (_ns, tag) => {
		const element = fakeElement(tag);
		Object.defineProperty(element, 'innerHTML', {
			get() { return ''; },
			set() { throw new TypeError('Trusted Types'); },
		});
		return element;
	};
	const warn = mock.method(console, 'warn', () => {});
	try {
		let svg = null;
		assert.doesNotThrow(() => { svg = createIcon(doc, 'close'); });
		assert.deepEqual(drawnElements(svg), ICON_SHAPES.close.elements);
		assert.equal(warn.mock.callCount(), 0);
	} finally {
		warn.mock.restore();
	}
});

test('createIcon は子要素を作る途中で投げても、属性の付いた空の svg で続行する', () => {
	// 落とさないだけでなく、図形の一部だけが描かれた半端な svg も返さない
	const doc = fakeDoc();
	doc.createElementNS = (_ns, tag) => {
		// like は circle 2 つの後に path を作る。3 つ目で投げさせ、先に作った circle が残らないことを見る
		if (tag === 'path') throw new TypeError('createElementNS failed');
		return fakeElement(tag);
	};
	const warn = mock.method(console, 'warn', () => {});
	try {
		let svg = null;
		assert.doesNotThrow(() => { svg = createIcon(doc, 'like'); });
		assert.equal(svg.tag, 'svg');
		assert.equal(svg.attributes.viewBox, ICON_SHAPES.like.viewBox);
		assert.equal(svg.attributes['aria-hidden'], 'true');
		assert.equal(svg.attributes.focusable, 'false');
		assert.equal(svg.children.length, 0);
		assert.equal(warn.mock.callCount(), 1);
		assert.ok(String(warn.mock.calls[0].arguments[0]).startsWith(LOG_PREFIX));
		assert.equal(warn.mock.calls[0].arguments[1], 'like');
	} finally {
		warn.mock.restore();
	}
});

test('createIcon は setAttribute が投げても空の svg で続行する', () => {
	const doc = fakeDoc();
	doc.createElementNS = (_ns, tag) => {
		const element = fakeElement(tag);
		if (tag !== 'svg') element.setAttribute = () => { throw new TypeError('setAttribute failed'); };
		return element;
	};
	const warn = mock.method(console, 'warn', () => {});
	try {
		let svg = null;
		assert.doesNotThrow(() => { svg = createIcon(doc, 'close'); });
		assert.equal(svg.attributes.viewBox, ICON_SHAPES.close.viewBox);
		assert.equal(svg.children.length, 0);
		assert.equal(warn.mock.callCount(), 1);
	} finally {
		warn.mock.restore();
	}
});

test('ICON_SHAPES に自前の like (pixiv 式の顔) が入っている', () => {
	// pixiv の「いいね」はハートではなく顔。ハートはブックマークを指す
	assert.equal(ICON_SHAPES.like.viewBox, '0 0 24 24');
	assert.equal(ICON_SHAPES.like.elements.filter((element) => element.tag === 'circle').length, 2);
	assert.ok(ICON_SHAPES.like.elements.some((element) => element.attrs['stroke-linecap'] === 'round'));
});

test('ICON_SHAPES からリボン型の bookmark は外してある', () => {
	// ブックマークはハート (favorite) で表す。取り違えの元になるので図形ごと持たない
	assert.equal(ICON_SHAPES.bookmark, undefined);
	assert.equal(ICON_SHAPES.favorite.elements[0].tag, 'path');
});
