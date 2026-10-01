import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStrings } from '../../src/i18n/load.js';
import { createStrings } from '../../src/i18n/index.js';
import { SUPPORTED_LANGUAGES } from '../../src/common/language.js';

test('loadStrings はすべての対応言語で createStrings と同じカタログを返す', async () => {
	// 入れ子と書式の関数まで比べる。(同じモジュールを読むので関数は同じ参照になる)
	for (const lang of SUPPORTED_LANGUAGES) {
		const loaded = await loadStrings(lang);
		assert.equal(loaded.lang, lang);
		assert.deepEqual(loaded, createStrings(lang));
	}
});

test('loadStrings は未知の言語を既定の言語に倒す', async () => {
	assert.equal((await loadStrings('xx')).lang, 'ja');
});

test('loadStrings は指定した言語のカタログしか読まない', async () => {
	const called = [];
	const loaders = Object.fromEntries(SUPPORTED_LANGUAGES.map((lang) => [lang, async () => {
		called.push(lang);
		return { default: { sample: lang } };
	}]));
	const strings = await loadStrings('ko', { loaders });
	assert.deepEqual(called, ['ko']);
	assert.equal(strings.sample, 'ko');
	assert.ok(Object.isFrozen(strings));
});

test('loadStrings は読み込みの表に無い対応言語を既定の言語に倒す', async () => {
	// SUPPORTED_LANGUAGES へ足して LOADERS へ足し忘れても、設定画面ごと出なくなることはない
	const loaders = { ja: async () => ({ default: { sample: 'ja' } }) };
	const strings = await loadStrings('ko', { loaders });
	assert.equal(strings.lang, 'ja');
	assert.equal(strings.sample, 'ja');
});
