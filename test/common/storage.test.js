import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, loadSettings, saveSetting, resetSettings, watchSettings } from '../../src/common/storage.js';
import { LOG_PREFIX } from '../../src/common/log.js';
import { fakeArea } from '../helpers/storage.js';
import { flush } from '../helpers/dom.js';
import { SETTINGS_DEFAULTS, GRID_TAB_SKIP, POPUP_THEMES, SIDEBAR_SCROLL, INFINITE_SCROLL, PREFETCH_CHOICES, IMAGE_QUALITY } from '../../src/common/constants.js';

test('normalizeSettings は空の入力を既定へ倒す', () => {
	assert.deepEqual(normalizeSettings({}), SETTINGS_DEFAULTS);
	assert.deepEqual(normalizeSettings(null), SETTINGS_DEFAULTS);
});

test('既定値は「初めて入れた人がそのまま使える」側に寄せる', () => {
	// 初期化ボタンも SETTINGS_DEFAULTS をそのまま書くので、ここが唯一の出どころ。
	// 3 つとも「拡張が勝手に変える度合いを下げる」向きに倒してある
	assert.equal(SETTINGS_DEFAULTS.sidebarScroll, SIDEBAR_SCROLL.WHOLE, 'サイドバーは丸ごと送る');
	assert.equal(SETTINGS_DEFAULTS.prefetch, 1, '先読みは前後 1 枚 (通信量と端末の負荷を抑える)');
	assert.equal(SETTINGS_DEFAULTS.gridTabSkip, GRID_TAB_SKIP.NONE, 'Tab 順は pixiv 標準のまま');
	assert.equal(SETTINGS_DEFAULTS.clickZoom, false, 'クリックで原寸表示は既定でオフ');
	assert.equal(SETTINGS_DEFAULTS.infiniteScroll, INFINITE_SCROLL.OFF, '無限スクロールは既定でオフ (知らないうちにページの動きを変えない)');
	assert.ok(PREFETCH_CHOICES.includes(SETTINGS_DEFAULTS.prefetch), '既定が選択肢に無い');
});

test('normalizeSettings は正しい値をそのまま通す', () => {
	const input = {
		enabled: false,
		imageQuality: IMAGE_QUALITY.ORIGINAL,
		prefetch: 1,
		showSidebar: false,
		sidebarScroll: SIDEBAR_SCROLL.WHOLE,
		closeOnBackdrop: false,
		clickZoom: true,
		gridTabSkip: GRID_TAB_SKIP.TITLE,
		hidePickup: true,
		infiniteScroll: INFINITE_SCROLL.ON_REACH,
		popupTheme: POPUP_THEMES.LIGHT,
	};
	assert.deepEqual(normalizeSettings(input), input);
});

test('normalizeSettings はピックアップ非表示を真偽値へ丸める', () => {
	// 既定はオフ。壊れた保存値で勝手に隠れると、欄が消えた理由が分からなくなる
	assert.equal(normalizeSettings({}).hidePickup, false);
	assert.equal(normalizeSettings({ hidePickup: 'yes' }).hidePickup, false);
	assert.equal(normalizeSettings({ hidePickup: 1 }).hidePickup, false);
	assert.equal(normalizeSettings({ hidePickup: true }).hidePickup, true);
});

test('normalizeSettings はクリックで原寸表示を真偽値へ丸める', () => {
	// 既定はオフ。壊れた保存値で勝手に開くと、画像を押しただけで全画面になる
	assert.equal(normalizeSettings({}).clickZoom, false);
	assert.equal(normalizeSettings({ clickZoom: 'on' }).clickZoom, false);
	assert.equal(normalizeSettings({ clickZoom: 1 }).clickZoom, false);
	assert.equal(normalizeSettings({ clickZoom: true }).clickZoom, true);
});

test('normalizeSettings は知らないサイドバーの送り方を既定へ倒す', () => {
	assert.equal(normalizeSettings({ sidebarScroll: 'both' }).sidebarScroll, SIDEBAR_SCROLL.WHOLE);
	assert.equal(normalizeSettings({ sidebarScroll: 42 }).sidebarScroll, SIDEBAR_SCROLL.WHOLE);
});

test('normalizeSettings は知らない解像度を既定へ倒す', () => {
	assert.equal(normalizeSettings({ imageQuality: 'huge' }).imageQuality, IMAGE_QUALITY.REGULAR);
});

test('normalizeSettings は選択肢に無い先読み数を既定へ倒す', () => {
	assert.equal(normalizeSettings({ prefetch: 99 }).prefetch, 1);
	assert.equal(normalizeSettings({ prefetch: '3' }).prefetch, 1);
});

test('normalizeSettings は選択肢に無い Tab スキップの指定を既定へ倒す', () => {
	assert.equal(normalizeSettings({ gridTabSkip: 'everything' }).gridTabSkip, GRID_TAB_SKIP.NONE);
	assert.equal(normalizeSettings({ gridTabSkip: 3 }).gridTabSkip, GRID_TAB_SKIP.NONE);
});

test('normalizeSettings は Tab スキップの選択肢をそのまま通す', () => {
	assert.equal(normalizeSettings({ gridTabSkip: GRID_TAB_SKIP.BOTH }).gridTabSkip, GRID_TAB_SKIP.BOTH);
});

test('normalizeSettings は真偽値でない値を既定へ倒す', () => {
	assert.equal(normalizeSettings({ enabled: 'yes' }).enabled, true);
});

test('loadSettings は保存値と既定を混ぜて返す', async () => {
	const { area } = fakeArea({ imageQuality: IMAGE_QUALITY.ORIGINAL });
	const settings = await loadSettings({ area });
	assert.equal(settings.imageQuality, IMAGE_QUALITY.ORIGINAL);
	assert.equal(settings.prefetch, SETTINGS_DEFAULTS.prefetch);
});

test('loadSettings は storage が失敗しても既定を返す', async () => {
	const area = { get: async () => { throw new Error('no storage'); } };
	assert.deepEqual(await loadSettings({ area }), SETTINGS_DEFAULTS);
});

test('保存領域が無くても投げず、既定で動く', async () => {
	// area: null は「領域なし」。language-store と同じ意味で、既定の chrome.storage.sync へは落ちない
	assert.deepEqual(await loadSettings({ area: null }), SETTINGS_DEFAULTS);
	assert.equal(await saveSetting('enabled', false, { area: null }), false);
	assert.equal(await resetSettings({ area: null }), false);
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

test('saveSetting は SETTINGS_DEFAULTS に無いキーを書かず false を返す', async () => {
	// 知らないキーは読み出しで捨てられるだけなのに sync 領域の容量を食う
	const { area, written } = fakeArea();
	const warn = mock.method(console, 'warn', () => {});
	try {
		assert.equal(await saveSetting('noSuchKey', true, { area }), false);
		assert.equal(await saveSetting('toString', true, { area }), false);
		assert.deepEqual(written, {});
		assert.equal(warn.mock.callCount(), 2);
		assert.ok(String(warn.mock.calls[0].arguments[0]).startsWith(LOG_PREFIX));
	} finally {
		warn.mock.restore();
	}
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
	await flush();
	assert.equal(received.length, 1);
	assert.equal(received[0].prefetch, 1);
	// 別の領域の変更は無視する
	listener({}, 'local');
	await flush();
	assert.equal(received.length, 1);
	watch.dispose();
	assert.equal(listener, null);
});

test('watchSettings はコールバックが投げても unhandled rejection にせず warn に残す', async () => {
	let listener = null;
	const { area } = fakeArea();
	const storage = {
		sync: area,
		onChanged: {
			addListener(fn) { listener = fn; },
			removeListener() { listener = null; },
		},
	};
	const warn = mock.method(console, 'warn', () => {});
	const unhandled = [];
	const onUnhandled = (reason) => unhandled.push(reason);
	process.on('unhandledRejection', onUnhandled);
	try {
		const watch = watchSettings(() => { throw new Error('描画で落ちた'); }, { storage });
		listener({}, 'sync');
		await flush();
		assert.equal(warn.mock.callCount(), 1);
		assert.ok(String(warn.mock.calls[0].arguments[0]).startsWith(LOG_PREFIX));
		assert.equal(warn.mock.calls[0].arguments[1].message, '描画で落ちた');
		assert.deepEqual(unhandled, []);
		watch.dispose();
	} finally {
		process.off('unhandledRejection', onUnhandled);
		warn.mock.restore();
	}
});

test('watchSettings は storage.onChanged が無ければ何もしない dispose を返す', () => {
	// 拡張の外 (テストや紹介サイトの埋め込み) でも、購読の解除まで同じ形で呼べること
	for (const storage of [{}, { onChanged: undefined }]) {
		const watch = watchSettings(() => { throw new Error('呼ばれてはいけない'); }, { storage });
		assert.equal(typeof watch.dispose, 'function');
		assert.doesNotThrow(() => watch.dispose());
	}
});

test('normalizeSettings は知らない無限スクロールの指定を off へ倒す', () => {
	assert.equal(normalizeSettings({ infiniteScroll: 'sometimes' }).infiniteScroll, INFINITE_SCROLL.OFF);
	assert.equal(normalizeSettings({ infiniteScroll: true }).infiniteScroll, INFINITE_SCROLL.OFF);
});

test('normalizeSettings は無限スクロールの onReach と prefetch をそのまま通す', () => {
	for (const value of [INFINITE_SCROLL.ON_REACH, INFINITE_SCROLL.PREFETCH]) {
		assert.equal(normalizeSettings({ infiniteScroll: value }).infiniteScroll, value);
	}
});
