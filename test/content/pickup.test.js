import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachPickupHider, PICKUP_STYLE_ID, PICKUP_HIDE_CSS } from '../../src/content/pickup.js';
import { ARTWORK_LINK_SELECTOR, PICKUP_SECTION_SELECTOR } from '../../src/common/constants.js';
import { fakeDoc } from '../helpers/dom.js';

test('作っただけでは何も差し込まない', () => {
	// 既定はオフ。設定を入れていない人のページへ CSS を足さない
	const doc = fakeDoc();
	const hider = attachPickupHider(doc);
	assert.equal(doc.head.children.length, 0);
	assert.equal(hider.isActive(), false);
});

test('setActive(true) で head に style が 1 枚入る', () => {
	const doc = fakeDoc();
	const hider = attachPickupHider(doc);
	hider.setActive(true);
	assert.equal(doc.head.children.length, 1);
	assert.equal(doc.head.children[0].tagName, 'STYLE');
	assert.equal(doc.head.children[0].id, PICKUP_STYLE_ID);
	assert.equal(doc.head.children[0].textContent, PICKUP_HIDE_CSS);
	assert.equal(hider.isActive(), true);
});

test('setActive(true) を重ねても style は増えない', () => {
	// SPA でホーム内を行き来するたびに呼ばれる
	const doc = fakeDoc();
	const hider = attachPickupHider(doc);
	hider.setActive(true);
	hider.setActive(true);
	assert.equal(doc.head.children.length, 1);
});

test('setActive(false) で style が消える', () => {
	// ホーム以外のページでは pixiv 標準へ戻す
	const doc = fakeDoc();
	const hider = attachPickupHider(doc);
	hider.setActive(true);
	hider.setActive(false);
	assert.equal(doc.head.children.length, 0);
	assert.equal(hider.isActive(), false);
});

test('出し入れを繰り返しても style は 1 枚のまま', () => {
	const doc = fakeDoc();
	const hider = attachPickupHider(doc);
	for (let i = 0; i < 3; i += 1) {
		hider.setActive(true);
		hider.setActive(false);
	}
	hider.setActive(true);
	assert.equal(doc.head.children.length, 1);
});

test('dispose で style が消え、2 回呼んでも投げない', () => {
	const doc = fakeDoc();
	const hider = attachPickupHider(doc);
	hider.setActive(true);
	hider.dispose();
	assert.equal(doc.head.children.length, 0);
	assert.doesNotThrow(() => hider.dispose());
});

test('head も body も無くても投げない', () => {
	// 共通の偽 doc は body を持つ。head だけ消すと本物と同じく body へ入るので、両方消して「入れ先が無い」経路を踏む
	const doc = fakeDoc();
	doc.head = null;
	doc.body = null;
	const hider = attachPickupHider(doc);
	assert.doesNotThrow(() => hider.setActive(true));
	assert.equal(hider.isActive(), false);
	assert.doesNotThrow(() => hider.dispose());
});

test('appendChild が投げても投げず、isActive は false のまま', (t) => {
	// 欄が隠れないだけでページは読める。content script ごと巻き込まない
	const warn = t.mock.method(console, 'warn', () => {});
	const doc = fakeDoc();
	doc.head.appendChild = () => { throw new Error('head is sealed'); };
	const hider = attachPickupHider(doc);
	assert.doesNotThrow(() => hider.setActive(true));
	assert.equal(hider.isActive(), false);
	assert.equal(warn.mock.callCount(), 1);
});

test('隠すのは作品リンクを持つ section だけ', () => {
	// クラス名は掴まない。(SPEC §2) 作品と無関係な section を巻き込まないため作品リンクまで求める
	assert.equal(PICKUP_SECTION_SELECTOR, `section:has(${ARTWORK_LINK_SELECTOR})`);
	assert.doesNotMatch(PICKUP_SECTION_SELECTOR, /sc-/);
	assert.match(PICKUP_HIDE_CSS, /display:\s*none\s*!important/);
});

test('隠す規則は 1 本だけ', () => {
	// 他所の見た目まで変えると、原因の切り分けができなくなる
	assert.equal((PICKUP_HIDE_CSS.match(/\{/g) ?? []).length, 1);
});
