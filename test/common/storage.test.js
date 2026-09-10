import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, loadSettings, saveSetting } from '../../src/common/storage.js';
import { SETTINGS_DEFAULTS } from '../../src/common/constants.js';

/**
 * chrome.storage.sync の偽物を作る。
 * @param {object} stored 保存済みの値
 * @returns {{area: object, written: object}}
 */
function fakeArea(stored = {}) {
	const written = {};
	const area = {
		get: async () => ({ ...stored }),
		set: async (items) => { Object.assign(written, items); },
	};
	return { area, written };
}

test('normalizeSettings は空の入力を既定へ倒す', () => {
	assert.deepEqual(normalizeSettings({}), SETTINGS_DEFAULTS);
	assert.deepEqual(normalizeSettings(null), SETTINGS_DEFAULTS);
});

test('normalizeSettings は正しい値をそのまま通す', () => {
	const input = { enabled: false, imageQuality: 'original', prefetch: 1, showSidebar: false, closeOnBackdrop: false };
	assert.deepEqual(normalizeSettings(input), input);
});

test('normalizeSettings は知らない解像度を既定へ倒す', () => {
	assert.equal(normalizeSettings({ imageQuality: 'huge' }).imageQuality, 'regular');
});

test('normalizeSettings は選択肢に無い先読み数を既定へ倒す', () => {
	assert.equal(normalizeSettings({ prefetch: 99 }).prefetch, 3);
	assert.equal(normalizeSettings({ prefetch: '3' }).prefetch, 3);
});

test('normalizeSettings は真偽値でない値を既定へ倒す', () => {
	assert.equal(normalizeSettings({ enabled: 'yes' }).enabled, true);
});

test('loadSettings は保存値と既定を混ぜて返す', async () => {
	const { area } = fakeArea({ imageQuality: 'original' });
	const settings = await loadSettings({ area });
	assert.equal(settings.imageQuality, 'original');
	assert.equal(settings.prefetch, 3);
});

test('loadSettings は storage が失敗しても既定を返す', async () => {
	const area = { get: async () => { throw new Error('no storage'); } };
	assert.deepEqual(await loadSettings({ area }), SETTINGS_DEFAULTS);
});

test('saveSetting は 1 項目だけ書く', async () => {
	const { area, written } = fakeArea();
	await saveSetting('enabled', false, { area });
	assert.deepEqual(written, { enabled: false });
});

test('saveSetting は保存できたら true を返す', async () => {
	const { area } = fakeArea();
	assert.equal(await saveSetting('enabled', false, { area }), true);
});

test('saveSetting は保存に失敗したら false を返す', async () => {
	// 呼び出し側が画面に出せるよう、握りつぶさず成否を返すこと
	const area = { set: async () => { throw new Error('no storage'); } };
	assert.equal(await saveSetting('enabled', false, { area }), false);
});
