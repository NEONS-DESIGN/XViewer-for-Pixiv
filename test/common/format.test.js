import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount } from '../../src/common/format.js';

test('formatCount は 3 桁区切りにする', () => {
	assert.equal(formatCount(1234567), '1,234,567');
	assert.equal(formatCount(0), '0');
});

test('formatCount は数値でない値と NaN を 0 として扱う', () => {
	assert.equal(formatCount(null), '0');
	assert.equal(formatCount(undefined), '0');
	assert.equal(formatCount('12'), '0');
	assert.equal(formatCount(Number.NaN), '0');
});
