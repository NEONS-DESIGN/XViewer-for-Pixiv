import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../src/popup/app.js';
import { SETTINGS_DEFAULTS } from '../../src/common/constants.js';
import { createStrings } from '../../src/i18n/index.js';
import { fakeElement, fakeDoc as fakeDocWith, flush } from '../helpers/dom.js';

const { SAVE_FAILED, RESET_FAILED } = createStrings('ja').popup;

/**
 * data-role で要素を探す。
 * @param {object} node 探し始める要素
 * @param {string} role 探す data-role
 * @returns {object|null} 見つかった要素
 */
function findRole(node, role) {
	if (node.dataset?.role === role) return node;
	for (const child of node.children ?? []) {
		const found = findRole(child, role);
		if (found) return found;
	}
	return null;
}

/**
 * 後から決着させられる Promise。保存の完了のタイミングを試験側で握る。
 * @returns {{promise: Promise<boolean>, resolve: (value: boolean) => void}} 組
 */
function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

/**
 * 画面を起動する。storage と描画を偽物にし、呼び出しを記録する。
 * @param {object} [options] 差し替え
 * @param {boolean|(() => Promise<boolean>)} [options.save] saveSetting の結果 (関数なら都度呼ぶ)
 * @param {boolean} [options.reset] resetSettings の結果
 * @param {boolean} [options.hasRoot] #app が存在するか
 * @param {Function} [options.renderPopup] 描画の差し替え
 * @returns {Promise<object>} 記録
 */
async function boot(options = {}) {
	const { save = true, reset = true, hasRoot = true } = options;
	const doc = fakeDocWith();
	// app.js が doc.documentElement.lang を書き換えるので、実物の <html> の代わりを用意する
	doc.documentElement = fakeElement('html');
	const root = fakeElement('main');
	root.dataset.role = 'app';
	// 共通の偽物は属性セレクタを解さないので、app.js が使う [data-role="x"] だけ受ける
	root.querySelector = (selector) => findRole(root, /\[data-role="([^"]+)"\]/.exec(selector)[1]);
	doc.getElementById = (id) => (hasRoot && id === 'app' ? root : null);

	const stored = { ...SETTINGS_DEFAULTS };
	const renders = [];
	const loads = [];
	const reports = [];
	let tab = 'settings';

	const deps = {
		doc,
		loadSettings: async () => {
			loads.push({ ...stored });
			return { ...stored };
		},
		saveSetting: async (key, value) => {
			const ok = typeof save === 'function' ? await save(key, value) : save;
			if (ok) stored[key] = value;
			return ok;
		},
		resetSettings: async () => {
			if (reset) Object.assign(stored, SETTINGS_DEFAULTS);
			return reset;
		},
		renderPopup: options.renderPopup ?? ((args) => {
			renders.push(args);
			// 描いたものの代わり。フォーカスの戻り先になる要素だけ置く
			const parts = [...Object.keys(SETTINGS_DEFAULTS), 'reset'].map((role) => {
				const element = fakeElement('button');
				element.dataset.role = role;
				return element;
			});
			args.root.replaceChildren(...parts);
			return { currentTab: () => tab };
		}),
		report: (...args) => reports.push(args),
	};

	await main(deps);
	return {
		root,
		stored,
		renders,
		loads,
		reports,
		setTab: (id) => { tab = id; },
		last: () => renders.at(-1),
		change: (patch) => renders.at(-1).onChange(patch),
		resetNow: () => renders.at(-1).onReset(),
	};
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

test('失敗の描き直しでは変えた項目へフォーカスを戻す', async () => {
	// 丸ごと作り直すとフォーカスが body へ落ち、キーボードの現在地が失われる
	const { root, change } = await boot({ save: false });
	change({ showSidebar: false });
	await flush();
	assert.equal(findRole(root, 'showSidebar').focused, true);
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
