import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DISCLAIMER, PROJECT_LICENSE, THIRD_PARTY } from '../../src/common/licenses.js';

const NOTICE = await readFile(new URL('../../NOTICE', import.meta.url), 'utf8');
const LICENSE = await readFile(new URL('../../LICENSE', import.meta.url), 'utf8');

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
		for (const key of ['name', 'copyright', 'license', 'url', 'note']) {
			assert.ok(item[key]?.length > 0, `${item.name} の ${key} が無い`);
		}
	}
});

// 同じ内容が NOTICE と licenses.js の 2 か所にある。片方だけ直すと食い違うので、
// licenses.js を出どころとして NOTICE 側に載っていることをここで縛る。
test('第三者の成果物は NOTICE にも載っている', () => {
	for (const item of THIRD_PARTY) {
		for (const key of ['name', 'copyright', 'license', 'url']) {
			assert.ok(NOTICE.includes(item[key]), `NOTICE に ${item.name} の ${key} (${item[key]}) が無い`);
		}
	}
});

test('この拡張のライセンス表記は LICENSE と一致する', () => {
	assert.ok(LICENSE.includes(PROJECT_LICENSE.name), 'LICENSE にライセンス名が無い');
	assert.ok(LICENSE.includes(PROJECT_LICENSE.copyright), 'LICENSE に著作権表示が無い');
});
