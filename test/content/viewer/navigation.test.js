import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from '../../../src/content/viewer/navigation.js';
import { KEYS } from '../../../src/common/constants.js';
import { flush } from '../../helpers/dom.js';

/**
 * ID の配列から並びの代わりを作る。
 * @param {string[]} ids 作品 ID
 * @returns {{next: (id: string) => string|null, prev: (id: string) => string|null, has: (id: string) => boolean}} 並びの代わり
 */
function fakeSequence(ids) {
	const at = (id, offset) => {
		const index = ids.indexOf(id);
		if (index < 0) return null;
		return ids[index + offset] ?? null;
	};
	return {
		next: (id) => at(id, 1),
		prev: (id) => at(id, -1),
		has: (id) => ids.includes(id),
	};
}

/**
 * 依存の代わりを作る。呼ばれた内容を記録する。
 * @param {object} [overrides] 上書きする依存
 * @returns {object} 依存と記録
 */
function fakeDeps(overrides = {}) {
	const opened = [];
	const navigated = [];
	const pages = [];
	const base = {
		openWork: async (workId) => { opened.push(workId); },
		isOpen: () => true,
		onRequestClose: () => { base.closed += 1; },
		onNavigate: (workId) => { navigated.push(workId); },
		canExtendSequence: () => false,
		extendSequence: async (current) => current,
		movePage: (direction) => { pages.push(direction); },
		focusNext: () => { base.focused += 1; },
		closed: 0,
		focused: 0,
		opened,
		navigated,
		pages,
	};
	return Object.assign(base, overrides);
}

/**
 * キーイベントの代わりを作る。
 * @param {string} key 押されたキー
 * @param {object} [init] repeat や修飾キーなどの上書き
 * @returns {object} event の代わり
 */
function fakeEvent(key, init = {}) {
	return {
		key,
		repeat: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		isComposing: false,
		prevented: 0,
		preventDefault() { this.prevented += 1; },
		...init,
	};
}

/**
 * 並びを渡して作品を開いた状態の navigation を作る。
 * @param {object} deps fakeDeps の戻り値
 * @param {string[]} ids 並び
 * @param {string} current 今開いている作品
 * @returns {object} navigation
 */
function openedNavigation(deps, ids, current) {
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(ids));
	nav.setCurrentWorkId(current);
	return nav;
}

test('下キーで次の作品へ移り、URL の差し替えを頼む', async () => {
	const deps = fakeDeps();
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2', '3']));
	nav.setCurrentWorkId('2');

	await nav.moveWork(1);
	assert.deepEqual(deps.navigated, ['3']);
	assert.deepEqual(deps.opened, ['3']);
});

test('端で広げられないときは何もしない', async () => {
	const deps = fakeDeps();
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('2');

	await nav.moveWork(1);
	assert.deepEqual(deps.opened, []);
});

test('端では並びを広げてもう一度探す', async () => {
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => fakeSequence(['1', '2', '3', '4']),
	});
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('2');

	await nav.moveWork(1);
	assert.deepEqual(deps.opened, ['3']);
});

test('広げるのに失敗しても投げず、端で止まる', async (t) => {
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => { throw new Error('取得に失敗'); },
	});
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('2');

	// 失敗は警告に留める。テストの出力を汚さないよう差し替える (テストの終わりに自動で戻る)
	const warn = t.mock.method(console, 'warn', () => {});
	// catch が無いと unhandled rejection になる
	await nav.moveWork(1);
	assert.equal(warn.mock.callCount(), 1);
	assert.deepEqual(deps.opened, []);
});

test('広げている間に別の作品へ移ったら勝手に進めない', async () => {
	let resolveExtend;
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: () => new Promise((resolve) => { resolveExtend = resolve; }),
	});
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('2');

	const moving = nav.moveWork(1);
	// 待っている間に上キーで戻った
	nav.setCurrentWorkId('1');
	resolveExtend(fakeSequence(['1', '2', '3']));
	await moving;
	assert.deepEqual(deps.opened, []);
});

test('広げ済みの並びでも端なら、もう一度は取りに行かない', async () => {
	// 全作品の最後で下キーを押すたびに profile/all を取り直さないため
	let extended = 0;
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => { extended += 1; return fakeSequence(['1', '2', '3']); },
	});
	const nav = openedNavigation(deps, ['1', '2'], '2');

	await nav.moveWork(1);
	assert.deepEqual(deps.opened, ['3']);
	nav.setCurrentWorkId('3');
	await nav.moveWork(1);
	await nav.moveWork(1);
	assert.equal(extended, 1, '広げ済みなのに取り直している');
	assert.deepEqual(deps.opened, ['3']);
});

test('setSequence で並びを差し替えたら、また広げられる', async () => {
	let extended = 0;
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => { extended += 1; return fakeSequence(['1', '2', '3']); },
	});
	const nav = openedNavigation(deps, ['1', '2'], '2');
	await nav.moveWork(1);
	assert.equal(extended, 1);

	// 別のグリッドから開き直した
	nav.setSequence(fakeSequence(['8', '9']));
	nav.setCurrentWorkId('9');
	await nav.moveWork(1);
	assert.equal(extended, 2);
});

test('広げた並びに今の作品が無ければ、元の並びを保つ', async () => {
	// ピックアップ欄から開いた作品が種別の絞り込みで落ちる、非公開化直後など。
	// 差し替えると next も prev も null になり、元の並びで戻れたはずの上キーまで効かなくなる
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => fakeSequence(['5', '6']),
	});
	const nav = openedNavigation(deps, ['1', '2'], '2');

	await nav.moveWork(1);
	assert.deepEqual(deps.opened, [], '含まれていない並びへ進んでしまった');
	await nav.moveWork(-1);
	assert.deepEqual(deps.opened, ['1'], '元の並びで戻れなくなっている');
});

test('reset の後に広がった並びは捨てる', async () => {
	// モーダルを閉じた後に extend が解決しても、次の open() が渡す並びより前に残さない
	let resolveExtend;
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: () => new Promise((resolve) => { resolveExtend = resolve; }),
	});
	const nav = openedNavigation(deps, ['1', '2'], '2');

	const moving = nav.moveWork(1);
	nav.reset();
	resolveExtend(fakeSequence(['1', '2', '3']));
	await moving;
	assert.deepEqual(deps.opened, []);

	// 並びを渡さずに作品だけ記録しても、捨てた並びで動いてはいけない
	nav.setCurrentWorkId('2');
	await nav.moveWork(1);
	assert.deepEqual(deps.opened, []);
});

test('reset で広げ済みの印も戻る', async () => {
	let extended = 0;
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => { extended += 1; return fakeSequence(['1', '2', '3']); },
	});
	const nav = openedNavigation(deps, ['1', '2'], '2');
	await nav.moveWork(1);
	nav.reset();
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('2');
	await nav.moveWork(1);
	assert.equal(extended, 2);
});

test('下キーの押しっぱなし (キーリピート) では作品を移動しない', async () => {
	// リピートごとに openWork (通信) と replaceState が走り、1 秒で 30 作品ぶん進んでしまう
	const deps = fakeDeps();
	const nav = openedNavigation(deps, ['1', '2', '3', '4'], '1');

	nav.onKeyDown(fakeEvent(KEYS.NEXT_WORK));
	const repeated = fakeEvent(KEYS.NEXT_WORK, { repeat: true });
	nav.onKeyDown(repeated);
	nav.onKeyDown(fakeEvent(KEYS.PREV_WORK, { repeat: true }));
	await flush();
	assert.deepEqual(deps.opened, ['2']);
	// ページのスクロールは起こさない
	assert.equal(repeated.prevented, 1);
});

test('修飾キー付きの矢印キーは奪わない', () => {
	// Alt+← はブラウザの「戻る」、Ctrl+← は OS の操作。ビュワーが潰してはいけない
	for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
		const deps = fakeDeps();
		const nav = openedNavigation(deps, ['1', '2'], '1');
		for (const key of [KEYS.NEXT_PAGE, KEYS.PREV_PAGE, KEYS.NEXT_WORK, KEYS.PREV_WORK]) {
			const event = fakeEvent(key, { [modifier]: true });
			nav.onKeyDown(event);
			assert.equal(event.prevented, 0, `${modifier} + ${key} を奪っている`);
		}
		assert.deepEqual(deps.pages, []);
		assert.deepEqual(deps.opened, []);
	}
});

test('IME の変換中はキーを奪わない', () => {
	// 変換中の矢印は候補の選択、Escape は変換の取り消し
	const deps = fakeDeps();
	const nav = openedNavigation(deps, ['1', '2'], '1');
	for (const key of [KEYS.NEXT_PAGE, KEYS.NEXT_WORK, KEYS.CLOSE]) {
		const event = fakeEvent(key, { isComposing: true });
		nav.onKeyDown(event);
		assert.equal(event.prevented, 0, `変換中の ${key} を奪っている`);
	}
	assert.deepEqual(deps.pages, []);
	assert.equal(deps.closed, 0);
});

test('Escape は修飾キーが付いていても閉じる', () => {
	// 閉じる操作は奪っても失うものが無い
	const deps = fakeDeps();
	const nav = openedNavigation(deps, ['1', '2'], '1');
	nav.onKeyDown(fakeEvent(KEYS.CLOSE, { ctrlKey: true }));
	assert.equal(deps.closed, 1);
});

test('Shift+Tab はフォーカスの巡回へ渡す', () => {
	const deps = fakeDeps();
	const nav = openedNavigation(deps, ['1', '2'], '1');
	nav.onKeyDown(fakeEvent(KEYS.FOCUS_NEXT, { shiftKey: true }));
	assert.equal(deps.focused, 1);
});

test('キー操作を割り振る', () => {
	const deps = fakeDeps();
	const nav = createNavigation(deps);

	nav.onKeyDown(fakeEvent(KEYS.NEXT_PAGE));
	nav.onKeyDown(fakeEvent(KEYS.PREV_PAGE));
	assert.deepEqual(deps.pages, [1, -1]);

	nav.onKeyDown(fakeEvent(KEYS.CLOSE));
	assert.equal(deps.closed, 1);

	nav.onKeyDown(fakeEvent(KEYS.FOCUS_NEXT));
	assert.equal(deps.focused, 1);
});

test('閉じているときはキーを拾わない', () => {
	const deps = fakeDeps({ isOpen: () => false });
	const nav = createNavigation(deps);
	nav.onKeyDown(fakeEvent(KEYS.CLOSE));
	nav.onKeyDown(fakeEvent(KEYS.NEXT_PAGE));
	assert.equal(deps.closed, 0);
	assert.deepEqual(deps.pages, []);
});

test('reset で並びと今の作品を捨てる', async () => {
	const deps = fakeDeps();
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('1');
	nav.reset();

	assert.equal(nav.currentWorkId(), null);
	await nav.moveWork(1);
	assert.deepEqual(deps.opened, []);
});
