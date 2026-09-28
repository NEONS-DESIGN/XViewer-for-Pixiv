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
		loadPageLanguage: async () => 'th',
		getUILanguage: () => 'ja',
	}), 'en');
	assert.equal(await resolvePopupLanguage({
		loadPageLanguage: async () => null,
		getUILanguage: () => 'ms-MY',
	}), 'en');
});

test('ブラウザの UI 言語が中国語なら字体で簡体字と繁体字を分ける', async () => {
	// getUILanguage() は zh-TW / zh-HK / zh-CN のように地域付きで返る
	for (const [browser, expected] of [['zh-TW', 'zh-TW'], ['zh-HK', 'zh-TW'], ['zh-CN', 'zh-CN'], ['ko', 'ko']]) {
		assert.equal(await resolvePopupLanguage({
			loadPageLanguage: async () => null,
			getUILanguage: () => browser,
		}), expected, browser);
	}
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
