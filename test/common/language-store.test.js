import test from 'node:test';
import assert from 'node:assert/strict';
import { savePageLanguage, loadPageLanguage } from '../../src/common/language-store.js';

/**
 * chrome.storage.local の代わりになる偽の保存領域。
 */
class FakeStorage {
	constructor() {
		this.store = {};
	}

	async get(keys) {
		const result = {};
		for (const key of keys) {
			if (this.store.hasOwnProperty(key)) {
				result[key] = this.store[key];
			}
		}
		return result;
	}

	async set(data) {
		Object.assign(this.store, data);
	}
}

test('savePageLanguage: 正規化済みの言語を保存する', async () => {
	const storage = new FakeStorage();
	const ok = await savePageLanguage('ja', { area: storage });
	assert.equal(ok, true);
	const stored = await storage.get(['pageLanguage']);
	assert.equal(stored.pageLanguage, 'ja');
});

test('loadPageLanguage: 保存した言語を読む', async () => {
	const storage = new FakeStorage();
	await storage.set({ pageLanguage: 'en' });
	const lang = await loadPageLanguage({ area: storage });
	assert.equal(lang, 'en');
});

test('loadPageLanguage: 無い場合は null を返す', async () => {
	const storage = new FakeStorage();
	const lang = await loadPageLanguage({ area: storage });
	assert.equal(lang, null);
});

test('loadPageLanguage: 壊れた値は normalizeLanguage を通す', async () => {
	const storage = new FakeStorage();
	await storage.set({ pageLanguage: 'INVALID' });
	const lang = await loadPageLanguage({ area: storage });
	// 'INVALID' は小文字化されて 'invalid' になり、最初の 2-3 文字 'inv' が正規化される
	assert.equal(lang, 'inv');
});

test('savePageLanguage: 保存領域が無いときは false を返す', async () => {
	const ok = await savePageLanguage('ja', { area: null });
	assert.equal(ok, false);
});

test('保存領域が投げても投げない', async () => {
	const broken = {
		async get() { throw new Error('storage error'); },
		async set() { throw new Error('storage error'); },
	};
	assert.equal(await savePageLanguage('en', { area: broken }), false);
	assert.equal(await loadPageLanguage({ area: broken }), null);
});
