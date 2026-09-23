import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePopupLanguage, main } from '../../src/popup/app.js';
import { SETTINGS_DEFAULTS } from '../../src/common/constants.js';
import { fakeElement, fakeDoc, flush } from '../helpers/dom.js';

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
	const doc = fakeDoc();
	doc.documentElement = fakeElement('html');
	const root = fakeElement('main');
	root.dataset.role = 'app';
	doc.getElementById = (id) => (id === 'app' ? root : null);

	await main({
		doc,
		loadSettings: async () => ({ ...SETTINGS_DEFAULTS }),
		saveSetting: async () => true,
		resetSettings: async () => true,
		renderPopup: () => ({ currentTab: () => null }),
		loadPageLanguage: async () => 'en',
		getUILanguage: () => 'ja',
	});
	await flush();

	assert.equal(doc.documentElement.lang, 'en');
});
