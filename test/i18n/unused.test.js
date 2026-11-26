/**
 * カタログに、コードから引かれなくなったキーが残っていないかを確かめる。
 *
 * 判定は粗い。葉ごとに次のどちらかを満たす src/ のファイルが 1 つでもあれば使っているとみなす。
 * - 最上位の名前空間の語と、葉の語の両方を含む (strings.viewer.CLOSE なら、viewer と CLOSE の両方を含むファイル)
 * - 葉の名前を引用符で囲んだ文字列を含む (labelKey: 'PLAY' のように、表に名前を書いて引く形)
 * 取りこぼしはあり得るが、コードから引く箇所を消したのにカタログにだけ残っている、という典型は拾える。
 * 名前を値から組み立てて引く名前空間は、coverage.test.js がコード側の表と突き合わせているのでここでは見ない。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DEFAULT_LANGUAGE } from '../../src/common/language.js';
import { CATALOG_PARTS } from '../helpers/popup.js';

/** 探す先。 */
const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url));

/** 探さないファイル。(カタログそのものと、語が偶然に混ざる生成物) */
const IGNORED_FILE_PATTERN = /(^|[\\/])(i18n[\\/]|common[\\/]icon-shapes\.js$)/;

/** 名前を値から組み立てて引く名前空間。(coverage.test.js が見る) 点区切りの頭で比べる */
const DYNAMIC_PREFIXES = Object.freeze(['popup.fields', 'theme', 'licenses.notes', 'infinite']);

/**
 * 正規表現の特別な文字を逃がす。
 * @param {string} text 文字列
 * @returns {string} 逃がした文字列
 */
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * カタログの葉 (文字列・関数・配列) の道筋を集める。
 * @param {object} catalog カタログ
 * @param {string[]} [path] 今の道筋
 * @returns {string[][]} 葉ごとの道筋
 */
function leafPaths(catalog, path = []) {
	return Object.entries(catalog).flatMap(([key, value]) => {
		const here = [...path, key];
		return value && typeof value === 'object' && !Array.isArray(value) ? leafPaths(value, here) : [here];
	});
}

/**
 * src/ の JavaScript を読む。
 * @returns {string[]} ファイルの中身
 */
function sourceTexts() {
	return readdirSync(SRC_DIR, { recursive: true })
		.filter((file) => file.endsWith('.js') && !IGNORED_FILE_PATTERN.test(file))
		.map((file) => readFileSync(join(SRC_DIR, file), 'utf8'));
}

test('カタログのキーはどれも src/ のどこかから引かれている', () => {
	const texts = sourceTexts();
	assert.ok(texts.length > 0, 'src/ のファイルを読めていない');
	const { viewer, popup } = CATALOG_PARTS[DEFAULT_LANGUAGE];
	const unused = [...leafPaths(viewer), ...leafPaths(popup)]
		.filter((path) => !DYNAMIC_PREFIXES.some((prefix) => `${path.join('.')}.`.startsWith(`${prefix}.`)))
		.filter((path) => {
			const namespace = new RegExp(String.raw`\b${escapeRegExp(path[0])}\b`);
			const leaf = new RegExp(String.raw`\b${escapeRegExp(path.at(-1))}\b`);
			const quotedLeaf = new RegExp(String.raw`(['"\x60])${escapeRegExp(path.at(-1))}\1`);
			return !texts.some((text) => (namespace.test(text) && leaf.test(text)) || quotedLeaf.test(text));
		})
		.map((path) => path.join('.'));
	assert.deepEqual(unused, []);
});
