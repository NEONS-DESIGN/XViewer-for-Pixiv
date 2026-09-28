import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minifyCssText } from '../../scripts/css-text-plugin.mjs';

test('minifyCssText はコメントと改行を落とす', async () => {
	const out = await minifyCssText('/* 説明 */\r\n.a {\r\n\tcolor: red;\r\n}\r\n', 'chrome120');
	assert.equal(out.includes('説明'), false);
	assert.equal(out.includes('\r'), false);
	assert.match(out, /\.a\{color:red\}/);
});

test('minifyCssText は color-mix を target の範囲で残す', async () => {
	const out = await minifyCssText('.a { color: color-mix(in srgb, red 50%, blue); }', ['chrome120', 'firefox140']);
	assert.match(out, /color-mix\(/);
});
