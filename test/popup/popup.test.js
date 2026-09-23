import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS } from '../../src/common/constants.js';
import { createStrings } from '../../src/i18n/index.js';
import { renderPopup } from '../../src/popup/popup-ui.js';
import { findRole, flush } from '../helpers/dom.js';
import { bootPopup as boot } from '../helpers/popup.js';

const { SAVE_FAILED, RESET_FAILED } = createStrings('ja').popup;

/**
 * 後から決着させられる Promise。保存の完了のタイミングを試験側で握る。
 * @returns {{promise: Promise<boolean>, resolve: (value: boolean) => void}} 組
 */
function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

test('起動時に設定を読んで通知なしで描く', async () => {
	const { renders, root } = await boot();
	assert.equal(renders.length, 1);
	assert.equal(renders[0].notice, null);
	assert.equal(renders[0].root, root);
	assert.deepEqual(renders[0].settings, { ...SETTINGS_DEFAULTS });
});

test('#app が無ければ何もしない', async () => {
	const { renders } = await boot({ hasRoot: false });
	assert.equal(renders.length, 0);
});

test('保存が成功したら描き直さない', async () => {
	// 見た目は既に変わっている。描き直すとフォーカスとスクロール位置を失うだけ
	const { renders, stored, change } = await boot();
	change({ enabled: false });
	await flush();
	assert.equal(stored.enabled, false);
	assert.equal(renders.length, 1);
});

test('保存に失敗したら通知を出して保存済みの値で描き直す', async () => {
	// 画面が嘘をつかないように、storage に入らなかった変更は画面からも戻す
	const { renders, last, change } = await boot({ save: false });
	change({ enabled: false });
	await flush();
	assert.equal(renders.length, 2);
	assert.equal(last().notice, SAVE_FAILED);
	assert.equal(last().settings.enabled, true);
});

test('保存が reject しても失敗として通知を出し、記録も残す', async () => {
	// saveSetting は false を返す契約だが、差し替えた実装が投げたときにログだけで終わると
	// 画面は変えたままの値を出し続ける
	const failure = new Error('storage が壊れた');
	const { renders, last, reports, change } = await boot({ save: async () => { throw failure; } });
	change({ enabled: false });
	await flush();
	assert.equal(renders.length, 2);
	assert.equal(last().notice, SAVE_FAILED);
	assert.equal(reports.length, 1);
	assert.match(reports[0][0], /保存に失敗/);
	assert.equal(reports[0][1], failure);
});

test('変更が 1 項目でなければ保存せず記録する', async () => {
	// イベントハンドラの中で素の例外を投げると report を通らない
	const { stored, reports, change } = await boot();
	change({});
	change({ enabled: false, showSidebar: false });
	await flush();
	assert.deepEqual(stored, { ...SETTINGS_DEFAULTS });
	assert.equal(reports.length, 2);
	for (const report of reports) assert.match(report[0], /1 項目ずつ/);
});

test('失敗の描き直しでは変えた項目へフォーカスを戻す', async () => {
	// 丸ごと作り直すとフォーカスが body へ落ち、キーボードの現在地が失われる
	const { root, change } = await boot({ save: false });
	change({ showSidebar: false });
	await flush();
	assert.equal(findRole(root, 'showSidebar').focused, true);
});

test('テーマ切り替えの保存に失敗しても切り替えボタンへフォーカスが戻る (実物の描画)', async () => {
	// 偽の描画は設定キーごとに data-role を生やすので、実物のボタンの data-role がキーと違っても
	// 上の検査は通ってしまう。実物の renderPopup で見出しのボタンまで確かめる
	const { root, reports } = await boot({ save: false, renderPopup });
	findRole(root, 'popupTheme').dispatch('click');
	await flush();
	assert.deepEqual(reports, []);
	assert.equal(findRole(root, 'notice').textContent, SAVE_FAILED);
	assert.equal(findRole(root, 'popupTheme').focused, true);
});

test('失敗の通知は次の保存が成功したときに消える', async () => {
	// 出しっぱなしだと、直った後も「保存できませんでした」が画面に残る (UI_DESIGN_KIT §4.8)
	let ok = false;
	const { renders, last, change } = await boot({ save: async () => ok });
	change({ enabled: false });
	await flush();
	assert.equal(last().notice, SAVE_FAILED);
	ok = true;
	change({ enabled: false });
	await flush();
	assert.equal(renders.length, 3);
	assert.equal(last().notice, null);
});

test('描き直しは開いていたタブを引き継ぐ', async () => {
	const { last, change, setTab } = await boot({ save: false });
	assert.equal(last().initialTab, null);
	setTab('license');
	change({ enabled: false });
	await flush();
	assert.equal(last().initialTab, 'license');
});

test('初期化は既定を書き戻して描き直し、フォーカスを初期化ボタンへ戻す', async () => {
	const { root, renders, last, stored, change, resetNow } = await boot();
	change({ enabled: false });
	await flush();
	assert.equal(stored.enabled, false);
	resetNow();
	await flush();
	assert.equal(stored.enabled, true);
	assert.equal(renders.length, 2);
	assert.equal(last().notice, null);
	assert.equal(findRole(root, 'reset').focused, true);
});

test('初期化に失敗したらその旨を通知して描き直す', async () => {
	const { last, resetNow } = await boot({ reset: false });
	resetNow();
	await flush();
	assert.equal(last().notice, RESET_FAILED);
});

test('描き直しは進行中の保存を待ってから読み直す', async () => {
	// A の失敗で読み直す間に B を変えると、B の set より前に get が返って画面が B の旧値になる
	const saves = [];
	const { loads, change } = await boot({
		save: (key) => {
			const gate = deferred();
			saves.push({ key, gate });
			return gate.promise;
		},
	});
	change({ enabled: false });
	change({ showSidebar: false });
	saves[0].gate.resolve(false);
	await flush();
	assert.equal(loads.length, 1, 'B の保存が終わる前に読み直している');
	saves[1].gate.resolve(true);
	await flush();
	// A の失敗の描き直しと、通知が出ている間に B が成功したことによる描き直しの 2 回。
	// どちらも B の保存が終わった後に読んでいる
	assert.equal(loads.length, 3);
	for (const load of loads.slice(1)) assert.equal(load.showSidebar, false);
});

test('描画が例外を投げても握りつぶさず記録する', async () => {
	// 素の unhandled rejection では接頭辞が付かず、拡張のログとして絞り込めない
	const failure = new Error('描けない');
	const { reports } = await boot({ renderPopup: () => { throw failure; } });
	assert.equal(reports.length, 1);
	assert.match(reports[0][0], /描画に失敗/);
	assert.equal(reports[0][1], failure);
});
