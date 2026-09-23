import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePopupLanguage } from '../../src/popup/app.js';
import { bootPopup } from '../helpers/popup.js';

test('保存されている pixiv の言語を使う', async () => {
	const lang = await resolvePopupLanguage({
		loadPageLanguage: async () => 'en',
		getUILanguage: () => 'ja',
	});
	assert.equal(lang, 'en');
});

test('保存が無ければブラウザの UI 言語を使う', async () => {
	const lang = await resolvePopupLanguage({
		loadPageLanguage: async () => null,
		getUILanguage: () => 'en-US',
	});
	assert.equal(lang, 'en');
});

test('未対応の言語は英語へ倒す', async () => {
	// content script と同じ規則。popup にだけ別の規則を持たせない
	assert.equal(await resolvePopupLanguage({
		loadPageLanguage: async () => 'ko',
		getUILanguage: () => 'ja',
	}), 'en');
	assert.equal(await resolvePopupLanguage({
		loadPageLanguage: async () => null,
		getUILanguage: () => 'zh-TW',
	}), 'en');
});

test('どちらも読めなければ日本語へ倒す', async () => {
	assert.equal(await resolvePopupLanguage({
		loadPageLanguage: async () => null,
		getUILanguage: () => '',
	}), 'ja');
});

test('保存の読み出しが失敗しても日本語で描ける', async () => {
	assert.equal(await resolvePopupLanguage({
		loadPageLanguage: async () => { throw new Error('storage error'); },
		getUILanguage: () => '',
	}), 'ja');
});

test('documentElement.lang が描いた言語に合う', async () => {
	const { doc } = await bootPopup({
		deps: {
			loadPageLanguage: async () => 'en',
			getUILanguage: () => 'ja',
		},
	});
	assert.equal(doc.documentElement.lang, 'en');
});
