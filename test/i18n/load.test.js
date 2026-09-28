import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStrings } from '../../src/i18n/load.js';
import { createStrings } from '../../src/i18n/index.js';

test('loadStrings は createStrings と同じ中身を返す', async () => {
	for (const lang of ['ja', 'en', 'ko', 'zh-CN', 'zh-TW']) {
		const loaded = await loadStrings(lang);
		assert.equal(loaded.lang, lang);
		assert.deepEqual(Object.keys(loaded).sort(), Object.keys(createStrings(lang)).sort());
	}
});

test('loadStrings は未知の言語を既定の言語に倒す', async () => {
	assert.equal((await loadStrings('xx')).lang, 'ja');
});

test('loadStrings は指定した言語のカタログしか読まない', async () => {
	const called = [];
	const loaders = Object.fromEntries(['ja', 'en', 'ko', 'zh-CN', 'zh-TW'].map((lang) => [lang, async () => {
		called.push(lang);
		return { default: { sample: lang } };
	}]));
	const strings = await loadStrings('ko', { loaders });
	assert.deepEqual(called, ['ko']);
	assert.equal(strings.sample, 'ko');
	assert.ok(Object.isFrozen(strings));
});
