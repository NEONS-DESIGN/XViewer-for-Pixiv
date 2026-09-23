import test from 'node:test';
import assert from 'node:assert/strict';
import { savePageLanguage, loadPageLanguage } from '../../src/common/language-store.js';

/**
 * chrome.storage.local の代わりになる偽の保存領域。
 * @param {object} [initial] 最初から入っている値
 * @returns {object} get / set を持つ領域
 */
function fakeArea(initial = {}) {
	const store = { ...initial };
	return {
		store,
		async get(keys) {
			const wanted = Array.isArray(keys) ? keys : [keys];
			return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
		},
		async set(patch) {
			Object.assign(store, patch);
		},
	};
}

test('savePageLanguage は言語を保存する', async () => {
	const area = fakeArea();
	assert.equal(await savePageLanguage('en', { area }), true);
	assert.equal(await loadPageLanguage({ area }), 'en');
});

test('loadPageLanguage は保存が無ければ null を返す', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea() }), null);
});

test('loadPageLanguage は壊れた保存値を null にする', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: 42 }) }), null);
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: '' }) }), null);
});

test('loadPageLanguage は保存値を正規化して返す', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: 'en-US' }) }), 'en');
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
