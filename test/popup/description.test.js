import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleToken } from '../../src/popup/description.js';
import { fakeElement } from '../helpers/dom.js';

test('toggleToken は語を足し引きし、ほかの語を残す', () => {
	const input = fakeElement('input');
	toggleToken(input, 'aria-describedby', 'a-lock', true);
	assert.equal(input.getAttribute('aria-describedby'), 'a-lock');
	toggleToken(input, 'aria-describedby', 'a-warning', true);
	assert.equal(input.getAttribute('aria-describedby'), 'a-lock a-warning');
	// 同じ語を 2 度足しても重ならない
	toggleToken(input, 'aria-describedby', 'a-lock', true);
	assert.equal(input.getAttribute('aria-describedby'), 'a-warning a-lock');
	// 片方の書き手が外しても、もう片方の語は消えない
	toggleToken(input, 'aria-describedby', 'a-warning', false);
	assert.equal(input.getAttribute('aria-describedby'), 'a-lock');
});

test('toggleToken は最後の語を外すと属性ごと消す', () => {
	const input = fakeElement('input');
	toggleToken(input, 'aria-describedby', 'a-lock', true);
	toggleToken(input, 'aria-describedby', 'a-lock', false);
	assert.equal(input.getAttribute('aria-describedby'), null);
	// 無い語を外しても何も起きない
	toggleToken(input, 'aria-describedby', 'a-lock', false);
	assert.equal(input.getAttribute('aria-describedby'), null);
});
