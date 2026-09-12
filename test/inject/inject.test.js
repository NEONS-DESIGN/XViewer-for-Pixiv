import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_EVENTS, NAV_HOOK_FLAG } from '../../src/common/constants.js';

/**
 * 注入スクリプトが触る page world の最小の代役を用意する。
 * inject.js は window と history をグローバルとして参照するので、
 * 読み込む前に globalThis へ置いておく。
 * 実ページでは window.history と history は同じオブジェクトなので、代役でも繋いでおく。
 * 別物にすると「フラグは window、パッチ先は history」の対応が崩れても気づけない。
 * @returns {{window: EventTarget, calls: string[], originals: object}} 代役と観測用の記録
 */
function installPageWorld() {
	const calls = [];
	const originals = {
		pushState(...args) {
			calls.push(`pushState:${args[2]}`);
			return 'push-result';
		},
		replaceState(...args) {
			calls.push(`replaceState:${args[2]}`);
			return 'replace-result';
		},
	};
	const win = new EventTarget();
	const hist = { ...originals };
	win.history = hist;
	globalThis.window = win;
	globalThis.history = hist;
	return { window: win, calls, originals };
}

const page = installPageWorld();

/** 注入側から届いた遷移通知の回数。 */
let navigateCount = 0;
page.window.addEventListener(NAV_EVENTS.NAVIGATE, () => { navigateCount += 1; });

// 副作用 (hook の実行) が要るので、代役を置いたあとに読み込む
await import('../../src/inject/inject.js');

test('読み込んだ時点で history を包み、フラグを立てる', () => {
	assert.notEqual(globalThis.history.pushState, page.originals.pushState);
	assert.ok(page.window[NAV_HOOK_FLAG]);
	// フラグを置く先とパッチする先を取り違えていないこと。
	// サイト本体が呼ぶのは window.history なので、そちらから見て包まれている必要がある
	assert.equal(page.window.history.pushState, globalThis.history.pushState);
	assert.equal(page.window.history[NAV_HOOK_FLAG], undefined);
});

test('pushState は元の戻り値を返しつつ遷移を通知する', () => {
	navigateCount = 0;
	const result = globalThis.history.pushState({}, '', '/users/1');
	assert.equal(result, 'push-result');
	assert.equal(navigateCount, 1);
	assert.equal(page.calls.at(-1), 'pushState:/users/1');
});

test('replaceState も同じように透過に通知する', () => {
	navigateCount = 0;
	assert.equal(globalThis.history.replaceState({}, '', '/artworks/1'), 'replace-result');
	assert.equal(navigateCount, 1);
});

test('rehook を二重に受けても包みは 1 枚だけ', () => {
	page.window.dispatchEvent(new CustomEvent(NAV_EVENTS.REHOOK));
	navigateCount = 0;
	globalThis.history.pushState({}, '', '/users/2');
	// 二重に包まれていれば通知が 2 回来る
	assert.equal(navigateCount, 1);
});

test('unhook で元のメソッドへ戻し、フラグも消す', () => {
	page.window.dispatchEvent(new CustomEvent(NAV_EVENTS.UNHOOK));
	assert.equal(globalThis.history.pushState, page.originals.pushState);
	assert.equal(globalThis.history.replaceState, page.originals.replaceState);
	assert.equal(page.window[NAV_HOOK_FLAG], undefined);

	navigateCount = 0;
	globalThis.history.pushState({}, '', '/users/3');
	assert.equal(navigateCount, 0);
});

test('unhook のあと rehook で張り直せる', () => {
	page.window.dispatchEvent(new CustomEvent(NAV_EVENTS.REHOOK));
	assert.notEqual(globalThis.history.pushState, page.originals.pushState);
	navigateCount = 0;
	globalThis.history.pushState({}, '', '/users/4');
	assert.equal(navigateCount, 1);
});
