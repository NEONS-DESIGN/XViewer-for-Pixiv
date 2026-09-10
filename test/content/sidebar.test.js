import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, formatDate, splitComment } from '../../src/content/viewer/sidebar.js';

test('formatCount は 3 桁区切りにする', () => {
	assert.equal(formatCount(2740), '2,740');
	assert.equal(formatCount(0), '0');
	assert.equal(formatCount(42852), '42,852');
});

test('formatCount は数値でない値を 0 として扱う', () => {
	assert.equal(formatCount(undefined), '0');
	assert.equal(formatCount(null), '0');
});

test('formatDate は日本語の日時にする', () => {
	// createDate は ISO 8601。タイムゾーンの表記が 2 種類あることを SITE_SPEC で確認済み
	assert.equal(formatDate('2026-09-08T17:45:00+09:00'), '2026年9月8日 17:45');
});

test('formatDate は読めない値で空文字を返す', () => {
	assert.equal(formatDate('よくわからない'), '');
	assert.equal(formatDate(''), '');
});

test('splitComment は br で分割する', () => {
	assert.deepEqual(
		splitComment('1行目<br />2行目<br>3行目'),
		[[{ type: 'text', value: '1行目' }], [{ type: 'text', value: '2行目' }], [{ type: 'text', value: '3行目' }]],
	);
});

test('splitComment は a タグをリンクとして取り出す', () => {
	const lines = splitComment('見て<a href="https://example.com/x" target="_blank">ここ</a>ね');
	assert.deepEqual(lines, [[
		{ type: 'text', value: '見て' },
		{ type: 'link', value: 'ここ', href: 'https://example.com/x' },
		{ type: 'text', value: 'ね' },
	]]);
});

test('splitComment は javascript: のリンクを本文として扱う', () => {
	// 外部由来の HTML なので、危険なスキームはリンクにしない
	const lines = splitComment('<a href="javascript:alert(1)">押して</a>');
	assert.deepEqual(lines, [[{ type: 'text', value: '押して' }]]);
});

test('splitComment は実体参照を戻す', () => {
	assert.deepEqual(splitComment('a&amp;b&lt;c&gt;d&quot;e&#39;f'), [[{ type: 'text', value: 'a&b<c>d"e\'f' }]]);
});

test('splitComment は空文字で空配列を返す', () => {
	assert.deepEqual(splitComment(''), []);
	assert.deepEqual(splitComment(null), []);
});
