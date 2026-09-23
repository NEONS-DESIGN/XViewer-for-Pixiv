import test from 'node:test';
import assert from 'node:assert/strict';
import { savePageLanguage, loadPageLanguage } from '../../src/common/language-store.js';
import { fakeArea } from '../helpers/storage.js';

test('savePageLanguage は言語を保存する', async () => {
	const { area } = fakeArea();
	assert.equal(await savePageLanguage('en', { area }), true);
	assert.equal(await loadPageLanguage({ area }), 'en');
});

test('loadPageLanguage は保存が無ければ null を返す', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea().area }), null);
});

test('loadPageLanguage は壊れた保存値を null にする', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: 42 }).area }), null);
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: '' }).area }), null);
});

test('loadPageLanguage は保存値を正規化して返す', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: 'en-US' }).area }), 'en');
});

test('保存領域が無くても投げない', async () => {
	assert.equal(await savePageLanguage('en', { area: null }), false);
	assert.equal(await loadPageLanguage({ area: null }), null);
});

test('保存領域が失敗しても投げない', async () => {
	const broken = {
		async get() { throw new Error('storage error'); },
		async set() { throw new Error('storage error'); },
	};
	assert.equal(await savePageLanguage('en', { area: broken }), false);
	assert.equal(await loadPageLanguage({ area: broken }), null);
});
