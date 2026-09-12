import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, loadSettings, saveSetting, resetSettings, watchSettings } from '../../src/common/storage.js';
import { SETTINGS_DEFAULTS, GRID_TAB_SKIP, POPUP_THEMES } from '../../src/common/constants.js';

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
	const input = {
		enabled: false,
		imageQuality: 'original',
		prefetch: 1,
		showSidebar: false,
		closeOnBackdrop: false,
		gridTabSkip: GRID_TAB_SKIP.TITLE,
		popupTheme: POPUP_THEMES.LIGHT,
	};
	assert.deepEqual(normalizeSettings(input), input);
});

test('normalizeSettings は知らない解像度を既定へ倒す', () => {
	assert.equal(normalizeSettings({ imageQuality: 'huge' }).imageQuality, 'regular');
});

test('normalizeSettings は選択肢に無い先読み数を既定へ倒す', () => {
	assert.equal(normalizeSettings({ prefetch: 99 }).prefetch, 3);
	assert.equal(normalizeSettings({ prefetch: '3' }).prefetch, 3);
});

test('normalizeSettings は選択肢に無い Tab スキップの指定を既定へ倒す', () => {
	assert.equal(normalizeSettings({ gridTabSkip: 'everything' }).gridTabSkip, GRID_TAB_SKIP.BOTH);
	assert.equal(normalizeSettings({ gridTabSkip: 3 }).gridTabSkip, GRID_TAB_SKIP.BOTH);
});

test('normalizeSettings は Tab スキップの選択肢をそのまま通す', () => {
	assert.equal(normalizeSettings({ gridTabSkip: GRID_TAB_SKIP.NONE }).gridTabSkip, GRID_TAB_SKIP.NONE);
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

test('normalizeSettings は知らない配色を既定 (OS に従う) へ倒す', () => {
	assert.equal(normalizeSettings({ popupTheme: 'むらさき' }).popupTheme, POPUP_THEMES.SYSTEM);
	assert.equal(normalizeSettings({}).popupTheme, POPUP_THEMES.SYSTEM);
});

test('normalizeSettings は配色の選択肢をそのまま通す', () => {
	assert.equal(normalizeSettings({ popupTheme: POPUP_THEMES.DARK }).popupTheme, POPUP_THEMES.DARK);
});

test('resetSettings は全項目を既定で書き戻す', async () => {
	// 1 項目ずつ消すのではなく既定を書く。読み出し側が欠けた項目を既定へ倒す実装なので
	// 消しても同じ結果になるが、書き戻す方が storage の中身と画面の表示が一致する
	const { area, written } = fakeArea({ enabled: false, popupTheme: POPUP_THEMES.LIGHT });
	assert.equal(await resetSettings({ area }), true);
	assert.deepEqual(written, { ...SETTINGS_DEFAULTS });
});

test('resetSettings は保存に失敗したら false を返す', async () => {
	const area = { set: async () => { throw new Error('no storage'); } };
	assert.equal(await resetSettings({ area }), false);
});

test('watchSettings は差し替えた storage の sync 領域から読み直す', async () => {
	// 既定の chrome.storage.sync へ戻ると、差し替えた領域に書いた値が届かない
	let listener = null;
	const { area } = fakeArea({ prefetch: 1 });
	const storage = {
		sync: area,
		onChanged: {
			addListener(fn) { listener = fn; },
			removeListener() { listener = null; },
		},
	};
	const received = [];
	const watch = watchSettings((settings) => received.push(settings), { storage });
	listener({}, 'sync');
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(received.length, 1);
	assert.equal(received[0].prefetch, 1);
	// 別の領域の変更は無視する
	listener({}, 'local');
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(received.length, 1);
	watch.dispose();
	assert.equal(listener, null);
});
