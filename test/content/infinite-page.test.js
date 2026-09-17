import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVisiblePage, VISIBLE_PAGE_TOP } from '../../src/content/infinite-page.js';

/**
 * 印の並びを組む。
 * @param {Array<[number, number]>} pairs [ページ番号, 上端 px] の並び
 * @returns {{marks: object[], topOf: (node: object) => number}} 印と上端の読み取り
 */
function marksOf(pairs) {
	const tops = new Map();
	const marks = pairs.map(([page, top]) => {
		const node = { page };
		tops.set(node, top);
		return { page, el: node };
	});
	return { marks, topOf: (node) => tops.get(node) };
}

test('印が無ければページは分からない', () => {
	assert.equal(pickVisiblePage([], () => 0), null);
	assert.equal(pickVisiblePage(null, () => 0), null);
});

test('上端を越えた印のうち、一番後ろのページを返す', () => {
	// 1 ページ目と 2 ページ目の先頭は画面の上へ流れ、3 ページ目の先頭はまだ下にある
	const { marks, topOf } = marksOf([[1, -900], [2, -300], [3, 400]]);
	assert.equal(pickVisiblePage(marks, topOf), 2);
});

test('どの印も越えていなければ先頭のページを返す', () => {
	// 一番上まで戻った状態。最初の印すら上端より下にいる
	const { marks, topOf } = marksOf([[1, 120], [2, 800]]);
	assert.equal(pickVisiblePage(marks, topOf), 1);
});

test('上端ちょうどの印は越えた扱いにする', () => {
	const { marks, topOf } = marksOf([[1, -500], [2, VISIBLE_PAGE_TOP]]);
	assert.equal(pickVisiblePage(marks, topOf), 2);
});

test('全ての印が上端より上なら最後のページを返す', () => {
	// 下端まで読み進めた状態
	const { marks, topOf } = marksOf([[1, -2000], [2, -1200], [3, -400]]);
	assert.equal(pickVisiblePage(marks, topOf), 3);
});

test('上端が読めない印は飛ばす', () => {
	// DOM から外れた印の rect は数にならないことがある。そこで止まらない
	const { marks, topOf } = marksOf([[1, -900], [2, Number.NaN], [3, 500]]);
	assert.equal(pickVisiblePage(marks, topOf), 1);
});

test('閾値は差し替えられる', () => {
	const { marks, topOf } = marksOf([[1, -900], [2, 80]]);
	assert.equal(pickVisiblePage(marks, topOf, 100), 2);
});
