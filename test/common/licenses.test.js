import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROJECT_LICENSE, THIRD_PARTY } from '../../src/common/licenses.js';
import { createStrings } from '../../src/i18n/index.js';

const NOTICE = await readFile(new URL('../../NOTICE', import.meta.url), 'utf8');
const LICENSE = await readFile(new URL('../../LICENSE', import.meta.url), 'utf8');
const APACHE_2 = await readFile(new URL('../../LICENSES/Apache-2.0.txt', import.meta.url), 'utf8');
const BUILD_SCRIPT = await readFile(new URL('../../scripts/build.mjs', import.meta.url), 'utf8');
// NOTICE は日本語のままなので、比較は日本語カタログに対して行う
const DISCLAIMER = createStrings('ja').licenses.disclaimer;
const NOTES = createStrings('ja').licenses.notes;

test('免責の本文は商標ガイドラインが求める 2 つの表記を含む', () => {
	const body = DISCLAIMER.body.join('\n');
	assert.match(body, /pixiv プラットフォームを利用して開発した/);
	assert.match(body, /作成・配布するものではありません/);
});

test('設定タブに残す 1 行は、非公式であることとライセンスタブへの誘導を兼ねる', () => {
	assert.match(DISCLAIMER.brief, /非公式/);
	assert.match(DISCLAIMER.brief, /ライセンス/);
});

test('同梱しているのは Material Symbols と Font Awesome Free', () => {
	assert.deepEqual(THIRD_PARTY.map((item) => item.name), ['Material Symbols', 'Font Awesome Free']);
});

test('第三者の成果物は名前・権利者・ライセンス・出どころ・用途をすべて持つ', () => {
	for (const item of THIRD_PARTY) {
		for (const key of ['name', 'copyright', 'license', 'licenseUrl', 'url']) {
			assert.ok(item[key]?.length > 0, `${item.name} の ${key} が無い`);
		}
		assert.ok(NOTES[item.name]?.length > 0, `${item.name} の note が無い`);
	}
});

// 同じ内容が NOTICE と licenses.js の 2 か所にある。片方だけ直すと食い違うので、
// licenses.js を出どころとして NOTICE 側に載っていることをここで縛る。
test('第三者の成果物は NOTICE にも載っている', () => {
	for (const item of THIRD_PARTY) {
		for (const key of ['name', 'copyright', 'license', 'licenseUrl', 'url']) {
			assert.ok(NOTICE.includes(item[key]), `NOTICE に ${item.name} の ${key} (${item[key]}) が無い`);
		}
	}
});

test('この拡張のライセンス表記は LICENSE と一致する', () => {
	assert.ok(LICENSE.includes(PROJECT_LICENSE.name), 'LICENSE にライセンス名が無い');
	assert.ok(LICENSE.includes(PROJECT_LICENSE.copyright), 'LICENSE に著作権表示が無い');
});

// Apache-2.0 §4(a) は本文の写しを渡すことを求める。名前と URL だけでは足りない
test('Apache License 2.0 の本文をリポジトリに持っている', () => {
	assert.match(APACHE_2, /Apache License\s+Version 2\.0, January 2004/);
	assert.match(APACHE_2, /END OF TERMS AND CONDITIONS/);
});

// 配布する zip は dist をそのまま固める。ライセンス文がコピー対象から落ちると、受け取った人に届かない
test('ビルドは LICENSE / NOTICE / Apache-2.0 の本文を dist へコピーする', () => {
	for (const file of ['LICENSE', 'NOTICE', 'LICENSES/Apache-2.0.txt']) {
		assert.ok(BUILD_SCRIPT.includes(`['${file}',`), `STATIC_FILES に ${file} が無い`);
	}
});
