import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount } from '../../src/common/format.js';

test('formatCount は 3 桁区切りにする', () => {
	assert.equal(formatCount(1234567, 'ja'), '1,234,567');
	assert.equal(formatCount(0, 'ja'), '0');
});

test('formatCount は数値でない値と NaN を 0 として扱う', () => {
	assert.equal(formatCount(null, 'ja'), '0');
	assert.equal(formatCount(undefined, 'ja'), '0');
	assert.equal(formatCount('12', 'ja'), '0');
	assert.equal(formatCount(Number.NaN, 'ja'), '0');
});

test('formatCount は対応しているどの言語でも同じ 3 桁区切りになる', () => {
	for (const language of ['ja', 'en', 'ko', 'zh-CN', 'zh-TW']) {
		assert.equal(formatCount(1234567, language), '1,234,567', language);
	}
});

test('formatCount は知らない言語を日本語の書式へ倒し、投げない', () => {
	assert.equal(formatCount(1234567, 'xx'), '1,234,567');
	assert.equal(formatCount(1234567, undefined), '1,234,567');
});
