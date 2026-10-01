import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { TITLE } from '../../src/popup/sections.js';
import { MANIFEST_LOCALES } from '../../scripts/static-files.mjs';

/** Chrome ウェブストアが manifest の description に認める文字数の上限。 */
const DESCRIPTION_MAX_LENGTH = 132;

/**
 * messages.json を読む。
 * @param {string} lang 言語
 * @returns {Promise<object>} 中身
 */
async function readMessages(lang) {
	return JSON.parse(await readFile(new URL(`../../src/_locales/${lang}/messages.json`, import.meta.url), 'utf8'));
}

test('src/_locales のフォルダはすべてビルドのコピー対象に入っている', async () => {
	// 足したフォルダを MANIFEST_LOCALES に書き忘れると、dist に入らずブラウザが訳を使わない
	const entries = await readdir(new URL('../../src/_locales/', import.meta.url), { withFileTypes: true });
	const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	assert.deepEqual(folders.sort(), [...MANIFEST_LOCALES].sort());
});

test('すべての言語の messages.json が同じキーを持つ', async () => {
	const ja = await readMessages('ja');
	for (const locale of MANIFEST_LOCALES) {
		const other = await readMessages(locale);
		assert.deepEqual(Object.keys(other).sort(), Object.keys(ja).sort(), `${locale} のキーが ja と違う`);
		for (const key of Object.keys(ja)) {
			assert.equal(typeof other[key].message, 'string', `${locale}: ${key} に message がありません`);
			assert.notEqual(other[key].message.trim(), '', `${locale}: ${key} が空です`);
		}
	}
});

/**
 * 文字数の上限を見ない言語。英語は商標ガイドラインが求める非公式の旨を含めると上限を超える。
 */
const DESCRIPTION_LENGTH_EXEMPT = Object.freeze(['en']);

test('説明はストアの文字数の上限に収まる', async () => {
	for (const locale of MANIFEST_LOCALES.filter((one) => !DESCRIPTION_LENGTH_EXEMPT.includes(one))) {
		const { extDescription } = await readMessages(locale);
		assert.ok(extDescription.message.length <= DESCRIPTION_MAX_LENGTH, `${locale} の説明が ${extDescription.message.length} 文字ある`);
	}
});

/** Edge アドオンが受け付ける説明の文字数の上限。上限を見ない言語にも掛かる */
const EDGE_DESCRIPTION_MAX_LENGTH = 190;

test('どの言語の説明も Edge アドオンの文字数の上限に収まる', async () => {
	for (const locale of MANIFEST_LOCALES) {
		const { extDescription } = await readMessages(locale);
		assert.ok(extDescription.message.length <= EDGE_DESCRIPTION_MAX_LENGTH, `${locale} の説明が ${extDescription.message.length} 文字ある`);
	}
});

test('どの言語の説明にも pixiv Inc. と無関係である旨が残っている', async () => {
	// 日英は文面まで下のテストで縛る。他の言語は社名の表記だけを見る
	for (const locale of MANIFEST_LOCALES.filter((one) => one !== 'ja')) {
		const { extDescription } = await readMessages(locale);
		assert.match(extDescription.message, /pixiv Inc./, `${locale} の説明に pixiv Inc. が無い`);
	}
});

test('manifest が __MSG__ を使い default_locale を持つ', async () => {
	// name / description はブラウザの UI 言語にしか従えないため _locales へ切り出した
	const manifest = JSON.parse(await readFile(new URL('../../src/manifest.json', import.meta.url), 'utf8'));
	assert.equal(manifest.name, '__MSG_extName__');
	assert.equal(manifest.description, '__MSG_extDescription__');
	assert.equal(manifest.default_locale, 'ja');
});

test('拡張の名前は _locales と popup の見出し・title で一致する', async () => {
	// 名前は sections.js の TITLE / popup.html の <title> / _locales の extName の 3 か所にある。
	// 改名したときに片方だけ残らないよう、sections.js を出どころとして突き合わせる
	const html = await readFile(new URL('../../src/popup/popup.html', import.meta.url), 'utf8');
	assert.ok(html.includes(`<title>${TITLE}</title>`), 'popup.html の <title> が TITLE と違う');
	for (const lang of MANIFEST_LOCALES) {
		const messages = await readMessages(lang);
		assert.equal(messages.extName.message, TITLE, `${lang} の extName が TITLE と違う`);
	}
});

test('日本語の説明に商標ガイドラインが求める非公式である旨が残っている', async () => {
	// ストアの一覧に出る文なのでここが要。要求される 2 表記をそれぞれ確認する
	const ja = await readMessages('ja');
	assert.match(ja.extDescription.message, /非公式/);
	assert.match(ja.extDescription.message, /作成・配布するものではありません/);
});

test('英語の説明に商標ガイドラインが求める非公式である旨が残っている', async () => {
	const en = await readMessages('en');
	// 文面を変えたときに検出できるよう、要求される 2 表記をそれぞれ確認する
	assert.match(en.extDescription.message, /pixiv platform/);
	assert.match(en.extDescription.message, /not created or distributed by pixiv Inc/);
});
