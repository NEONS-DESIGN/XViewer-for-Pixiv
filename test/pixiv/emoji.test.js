import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIXIV_EMOJI, parseCommentText } from '../../src/pixiv/emoji.js';

test('絵文字の名前と ID の対応は pixiv の表と一致する', () => {
	// SITE_SPEC 実測: pixiv のフロント JS が持つ表をそのまま写した
	assert.equal(PIXIV_EMOJI.normal, 101);
	assert.equal(PIXIV_EMOJI.heaven, 104);
	assert.equal(PIXIV_EMOJI.love3, 310);
	assert.equal(PIXIV_EMOJI.star, 503);
	assert.equal(Object.keys(PIXIV_EMOJI).length, 38);
});

test('絵文字を含まない本文はそのまま 1 つの断片になる', () => {
	assert.deepEqual(parseCommentText('かわいい'), [
		{ kind: 'text', text: 'かわいい' },
	]);
});

test('本文の末尾の絵文字を切り出す', () => {
	assert.deepEqual(parseCommentText('damnnnnn (heaven)'), [
		{ kind: 'text', text: 'damnnnnn ' },
		{ kind: 'emoji', text: '(heaven)', id: 104 },
	]);
});

test('連続した絵文字をすべて切り出す', () => {
	assert.deepEqual(parseCommentText('(heaven)(heaven)(heaven)'), [
		{ kind: 'emoji', text: '(heaven)', id: 104 },
		{ kind: 'emoji', text: '(heaven)', id: 104 },
		{ kind: 'emoji', text: '(heaven)', id: 104 },
	]);
});

test('表に無い名前は文字のまま残す', () => {
	// pixiv 本体も画像にせず括弧付きの文字として出す
	assert.deepEqual(parseCommentText('(unknown)'), [
		{ kind: 'text', text: '(unknown)' },
	]);
});

test('大文字や記号を含む括弧は絵文字にしない', () => {
	// 名前として通るのは [0-9a-z] だけ
	assert.deepEqual(parseCommentText('(Heaven)'), [{ kind: 'text', text: '(Heaven)' }]);
	assert.deepEqual(parseCommentText('(・∀・)'), [{ kind: 'text', text: '(・∀・)' }]);
});

test('Object.prototype に居る名前を絵文字と勘違いしない', () => {
	// (constructor) や (tostring) は名前の規則 [0-9a-z] を満たしてしまう
	assert.deepEqual(parseCommentText('(constructor)'), [
		{ kind: 'text', text: '(constructor)' },
	]);
});

test('入れ子の括弧でも中身だけを絵文字にする', () => {
	assert.deepEqual(parseCommentText('((heaven))'), [
		{ kind: 'text', text: '(' },
		{ kind: 'emoji', text: '(heaven)', id: 104 },
		{ kind: 'text', text: ')' },
	]);
});

test('閉じていない括弧でも落ちない', () => {
	assert.deepEqual(parseCommentText('わーい('), [
		{ kind: 'text', text: 'わーい' },
		{ kind: 'text', text: '(' },
	]);
});

test('改行を含む本文でも断片を保つ', () => {
	assert.deepEqual(parseCommentText('1 行目\n2 行目'), [
		{ kind: 'text', text: '1 行目\n2 行目' },
	]);
});

test('空の本文は断片を作らない', () => {
	assert.deepEqual(parseCommentText(''), []);
	assert.deepEqual(parseCommentText(null), []);
	assert.deepEqual(parseCommentText(undefined), []);
});
