import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TITLE } from '../../src/popup/sections.js';

/**
 * messages.json を読む。
 * @param {string} lang 言語
 * @returns {Promise<object>} 中身
 */
async function readMessages(lang) {
	return JSON.parse(await readFile(new URL(`../../src/_locales/${lang}/messages.json`, import.meta.url), 'utf8'));
}

test('すべての言語の messages.json が同じキーを持つ', async () => {
	const ja = await readMessages('ja');
	const en = await readMessages('en');
	assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort());
	for (const key of Object.keys(ja)) {
		assert.equal(typeof ja[key].message, 'string', `${key} に message がありません`);
		assert.notEqual(en[key].message.trim(), '', `${key} の英語が空です`);
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
	for (const lang of ['ja', 'en']) {
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
