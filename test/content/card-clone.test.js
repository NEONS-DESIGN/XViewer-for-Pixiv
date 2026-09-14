import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureTemplates } from '../../src/content/card-clone.js';
import { makeCard, makeGrid, fakeComputedStyle } from '../helpers/card.js';

/**
 * 雛形を採る。getComputedStyle は偽物を渡す。
 * @param {object[]} cards カード
 * @returns {object|null} 雛形
 */
function capture(cards) {
	const { ul } = makeGrid(cards);
	return captureTemplates(ul, { computedStyle: fakeComputedStyle });
}

test('画像が読み込まれたカードだけを雛形にする', () => {
	// figure のままのカードを雛形にすると、継ぎ足したカードに img が無くなる
	const templates = capture([makeCard({ id: '1', loaded: false }), makeCard({ id: '2', loaded: true })]);
	assert.notEqual(templates, null);
	assert.equal(templates.single.querySelector('img').getAttribute('data-gv-src-id'), null);
	assert.equal(templates.single.querySelector('a[data-ga4-label="thumbnail_link"]').getAttribute('data-gtm-value'), '2');
});

test('画像が 1 枚も読み込まれていなければ null', () => {
	// 継ぎ足しを始めてはいけない状況。呼び出し側はページャを隠さない
	assert.equal(capture([makeCard({ loaded: false })]), null);
});

test('ブックマーク済みのカードは雛形にしない', () => {
	// 済みのカードから採ると、未ブックマークの色が #ff4060 になってしまう
	const templates = capture([makeCard({ id: '1', bookmarked: true }), makeCard({ id: '2' })]);
	assert.equal(templates.single.querySelector('a[data-ga4-label="thumbnail_link"]').getAttribute('data-gtm-value'), '2');
	assert.deepEqual(templates.heartFills, ['rgb(31, 31, 31)', 'rgb(245, 245, 245)']);
});

test('ブックマーク済みしか無ければ null', () => {
	assert.equal(capture([makeCard({ bookmarked: true })]), null);
});

test('複数枚のカードがあれば multi に採る', () => {
	const templates = capture([makeCard({ id: '1' }), makeCard({ id: '2', pages: 3 })]);
	assert.notEqual(templates.multi, null);
	assert.equal(templates.multi.querySelector('span').textContent, '3');
	assert.equal(templates.single.querySelector('span'), null);
});

test('複数枚のカードが無ければ multi は null', () => {
	const templates = capture([makeCard({ id: '1' })]);
	assert.equal(templates.multi, null);
});

test('複数枚しか無ければ single はバッジを外したものになる', () => {
	// 全作品が複数枚の作者。バッジ付きの雛形で単枚を出すと数字が嘘になる
	const templates = capture([makeCard({ id: '1', pages: 2 })]);
	assert.equal(templates.single.querySelector('span'), null);
	assert.notEqual(templates.multi, null);
});

test('雛形は元のカードから切り離されている', () => {
	// 雛形を書き換えてページ上のカードが変わってはいけない
	const card = makeCard({ id: '1' });
	const templates = capture([card]);
	templates.single.setAttribute('data-touched', '1');
	assert.equal(card.getAttribute('data-touched'), null);
});
