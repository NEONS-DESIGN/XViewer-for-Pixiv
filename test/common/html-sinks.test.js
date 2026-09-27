import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

/** 見張る範囲。拡張に入るコードはすべて src/ の下にある。 */
const SRC_DIR = new URL('../../src/', import.meta.url);

/**
 * 文字列を HTML として解す API。ホストページが Trusted Types を強制すると投げ、
 * AMO の lint (web-ext lint) も UNSAFE_VAR_ASSIGNMENT などの警告を出す。
 * 偽 DOM の要素は innerHTML の代入を黙って受け入れるので、単体テストだけでは入り直しに気づけない。
 */
const HTML_SINK_PATTERNS = Object.freeze([
	/\.(?:innerHTML|outerHTML)\s*\+?=(?!=)/,
	/\.insertAdjacentHTML\s*\(/,
	/\.createContextualFragment\s*\(/,
	/\.setHTMLUnsafe\s*\(/,
	/\bdocument\.write(?:ln)?\s*\(/,
	/\bnew\s+DOMParser\b/,
]);

/**
 * コメントを落とす。コメントの中で API の名前に触れているだけの行を拾わないため。
 * 行コメントは `https://` のような URL の中の // を避けて、直前が : でないものだけを落とす。
 * @param {string} source JavaScript のソース
 * @returns {string} コメントを除いたソース
 */
function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * ソースの中から HTML を解す API の使用を探す。
 * @param {string} source JavaScript のソース
 * @returns {string[]} 見つかった行 (前後の空白を落としたもの)
 */
function findHtmlSinks(source) {
	return stripComments(source)
		.split(/\r?\n/)
		.filter((line) => HTML_SINK_PATTERNS.some((pattern) => pattern.test(line)))
		.map((line) => line.trim());
}

test('findHtmlSinks は代入や呼び出しを見つけ、コメントや比較は拾わない', () => {
	// 見張りそのものが効いていることを先に確かめる (効いていないと下のテストが素通りする)
	assert.deepEqual(findHtmlSinks("svg.innerHTML = shape?.markup ?? '';"), ["svg.innerHTML = shape?.markup ?? '';"]);
	assert.equal(findHtmlSinks('el.outerHTML += html;').length, 1);
	assert.equal(findHtmlSinks("el.insertAdjacentHTML('beforeend', html);").length, 1);
	assert.equal(findHtmlSinks('const doc = new DOMParser().parseFromString(s, "text/html");').length, 1);
	assert.equal(findHtmlSinks('// innerHTML は使わない。el.innerHTML = x と書かない').length, 0);
	assert.equal(findHtmlSinks('/* el.innerHTML = x */ const a = 1;').length, 0);
	assert.equal(findHtmlSinks("if (el.innerHTML === '') return;").length, 0);
	assert.equal(findHtmlSinks("const url = 'https://example.com/'; el.innerHTML = url;").length, 1);
});

test('src/ の JavaScript は HTML を文字列から解す API を使わない', async () => {
	const files = (await readdir(SRC_DIR, { recursive: true }))
		.map((path) => path.replaceAll('\\', '/'))
		.filter((path) => path.endsWith('.js'));
	assert.ok(files.length > 0);
	const found = [];
	for (const path of files) {
		const source = await readFile(new URL(path, SRC_DIR), 'utf8');
		for (const line of findHtmlSinks(source)) found.push(`${path}: ${line}`);
	}
	assert.deepEqual(found, []);
});
