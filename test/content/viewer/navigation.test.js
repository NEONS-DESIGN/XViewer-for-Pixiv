import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from '../../../src/content/viewer/navigation.js';
import { KEYS } from '../../../src/common/constants.js';

/**
 * ID の配列から並びの代わりを作る。
 * @param {string[]} ids 作品 ID
 * @returns {{next: (id: string) => string|null, prev: (id: string) => string|null}} 並びの代わり
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
 * @returns {object} event の代わり
 */
function fakeEvent(key) {
	return { key, prevented: 0, preventDefault() { this.prevented += 1; } };
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

test('広げるのに失敗しても投げず、端で止まる', async () => {
	const deps = fakeDeps({
		canExtendSequence: () => true,
		extendSequence: async () => { throw new Error('取得に失敗'); },
	});
	const nav = createNavigation(deps);
	nav.setSequence(fakeSequence(['1', '2']));
	nav.setCurrentWorkId('2');

	// 失敗は警告に留める。ついでにテストの出力を汚さないよう差し替える
	const original = console.warn;
	let warned = 0;
	console.warn = () => { warned += 1; };
	try {
		// catch が無いと unhandled rejection になる
		await nav.moveWork(1);
	} finally {
		console.warn = original;
	}
	assert.equal(warned, 1);
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
