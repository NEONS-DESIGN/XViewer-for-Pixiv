import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlideshow } from '../../../src/content/viewer/slideshow.js';
import { SLIDESHOW_MODES } from '../../../src/common/constants.js';
import { flush } from '../../helpers/dom.js';

/**
 * 手で発火させる偽のタイマー。張られた待ちと関数を記録する。
 * @returns {{setTimeout: Function, clearTimeout: Function, pending: () => Array<{id: number, fn: Function, ms: number}>, fire: () => void}}
 */
function fakeTimer() {
	const timers = new Map();
	let nextId = 1;
	return {
		setTimeout: (fn, ms) => {
			const id = nextId++;
			timers.set(id, { id, fn, ms });
			return id;
		},
		clearTimeout: (id) => { timers.delete(id); },
		pending: () => [...timers.values()],
		fire: () => {
			const entries = [...timers.values()];
			assert.equal(entries.length, 1, 'タイマーはちょうど 1 本であること');
			timers.delete(entries[0].id);
			entries[0].fn();
		},
	};
}

/**
 * 依存の代わりを作る。呼ばれた内容を記録する。
 * @param {object} [options] 設定とページの状態の初期値、依存の上書き
 * @returns {object} 依存と記録
 */
function fakeDeps(options = {}) {
	const timer = fakeTimer();
	const deps = {
		settings: { slideshow: SLIDESHOW_MODES.WORK, slideshowInterval: 3, slideshowIntervalCustom: 5, slideshowLoop: false, ...options.settings },
		page: options.page ?? 0,
		count: options.count === undefined ? 3 : options.count,
		workId: options.workId ?? '100',
		moves: [],
		shownPages: [],
		workMoves: [],
		firstMoves: 0,
		changes: [],
		moveWorkResult: true,
		moveToFirstResult: true,
		getSettings: () => deps.settings,
		canMovePage: (direction) => deps.count !== null && deps.page + direction >= 0 && deps.page + direction < deps.count,
		movePage: (direction) => { deps.moves.push(direction); deps.page += direction; },
		showPage: (index) => { deps.shownPages.push(index); deps.page = index; },
		pageCount: () => deps.count,
		moveWork: async (direction) => { deps.workMoves.push(direction); return deps.moveWorkResult; },
		moveToFirst: async () => { deps.firstMoves += 1; return deps.moveToFirstResult; },
		currentWorkId: () => deps.workId,
		onChange: (state) => { deps.changes.push(state); },
		setTimeout: timer.setTimeout,
		clearTimeout: timer.clearTimeout,
		timer,
		...options.overrides,
	};
	return deps;
}

/**
 * 再生中で、今のページが表示し終わった状態の自動送りを作る。
 * @param {object} [options] fakeDeps へ渡すもの
 * @returns {{deps: object, slideshow: object}}
 */
function playingSlideshow(options) {
	const deps = fakeDeps(options);
	const slideshow = createSlideshow(deps);
	slideshow.pageShown();
	slideshow.play();
	return { deps, slideshow };
}

/**
 * 解決を手で決められる Promise を作る。
 * @returns {{promise: Promise<boolean>, resolve: (value: boolean) => void}}
 */
function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

test('開いた直後は停止していて、pageShown だけではタイマーを張らない', () => {
	const deps = fakeDeps();
	const slideshow = createSlideshow(deps);
	assert.equal(slideshow.isPlaying(), false);
	slideshow.pageShown();
	assert.equal(deps.timer.pending().length, 0);
});

test('表示済みで play するとその場で間隔のタイマーを張る', () => {
	const deps = fakeDeps();
	const slideshow = createSlideshow(deps);
	slideshow.pageShown();
	slideshow.play();
	assert.equal(slideshow.isPlaying(), true);
	assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [3000]);
	assert.deepEqual(deps.changes.at(-1), { playing: true, durationMs: 3000 });
});

test('表示前に play したら、pageShown でタイマーを張る', () => {
	const deps = fakeDeps();
	const slideshow = createSlideshow(deps);
	slideshow.play();
	assert.equal(deps.timer.pending().length, 0);
	assert.deepEqual(deps.changes.at(-1), { playing: true, durationMs: null });
	slideshow.pageShown();
	assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [3000]);
});

test('カスタムの間隔はその秒数で張る', () => {
	const { deps } = playingSlideshow({ settings: { slideshowInterval: 'custom', slideshowIntervalCustom: 7.5 } });
	assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [7500]);
});

test('workLoading で外れ、pageShown で張り直す', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.workLoading();
	assert.equal(deps.timer.pending().length, 0);
	assert.deepEqual(deps.changes.at(-1), { playing: true, durationMs: null });
	slideshow.pageShown();
	assert.equal(deps.timer.pending().length, 1);
});

test('pageLoading で外れ、pageShown で最初から張り直す。再生は続ける', () => {
	const { deps, slideshow } = playingSlideshow();
	const before = deps.timer.pending()[0].id;
	slideshow.pageLoading();
	assert.equal(deps.timer.pending().length, 0);
	assert.equal(slideshow.isPlaying(), true);
	assert.deepEqual(deps.changes.at(-1), { playing: true, durationMs: null });
	// 理由を上げ下げしても、表示し終えるまでは張らない
	slideshow.setSuspended('zoom', true);
	slideshow.setSuspended('zoom', false);
	assert.equal(deps.timer.pending().length, 0);
	slideshow.pageShown();
	const after = deps.timer.pending();
	assert.deepEqual(after.map((entry) => entry.ms), [3000]);
	assert.notEqual(after[0].id, before);
});

test('pageShown は計時を最初から数え直す (タイマーは 1 本のまま)', () => {
	const { deps, slideshow } = playingSlideshow();
	const before = deps.timer.pending()[0].id;
	slideshow.pageShown();
	const after = deps.timer.pending();
	assert.equal(after.length, 1);
	assert.notEqual(after[0].id, before);
});

test('計時中に数え直すと、止めたことと張り直したことを続けて知らせる', () => {
	const { deps, slideshow } = playingSlideshow();
	const from = deps.changes.length;
	slideshow.pageShown();
	assert.deepEqual(deps.changes.slice(from), [{ playing: true, durationMs: null }, { playing: true, durationMs: 3000 }]);
});

test('pause でタイマーを外し、停止を知らせる', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.pause();
	assert.equal(slideshow.isPlaying(), false);
	assert.equal(deps.timer.pending().length, 0);
	assert.deepEqual(deps.changes.at(-1), { playing: false, durationMs: null });
});

test('toggle で再生と停止を切り替える', () => {
	const deps = fakeDeps();
	const slideshow = createSlideshow(deps);
	slideshow.toggle();
	assert.equal(slideshow.isPlaying(), true);
	slideshow.toggle();
	assert.equal(slideshow.isPlaying(), false);
});

test('モードが off の間は play しても再生しない', () => {
	const deps = fakeDeps({ settings: { slideshow: SLIDESHOW_MODES.OFF } });
	const slideshow = createSlideshow(deps);
	slideshow.pageShown();
	slideshow.play();
	assert.equal(slideshow.isPlaying(), false);
	assert.equal(deps.timer.pending().length, 0);
});

test('同じ状態を続けて知らせない', () => {
	const deps = fakeDeps();
	const slideshow = createSlideshow(deps);
	slideshow.pause();
	slideshow.workLoading();
	assert.deepEqual(deps.changes, []);
});

test('理由を 1 つでも立てると外れ、全部下ろすと最初から張り直す', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.setSuspended('zoom', true);
	assert.equal(deps.timer.pending().length, 0);
	slideshow.setSuspended('zoom', false);
	assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [3000]);
});

test('理由を 2 つ立てて 1 つ下ろしても張らない', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.setSuspended('zoom', true);
	slideshow.setSuspended('hidden', true);
	slideshow.setSuspended('zoom', false);
	assert.equal(deps.timer.pending().length, 0);
	slideshow.setSuspended('hidden', false);
	assert.equal(deps.timer.pending().length, 1);
});

test('理由が立っている間の pageShown は表示済みにするだけで、下ろしたときに張る', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.workLoading();
	slideshow.setSuspended('zoom', true);
	slideshow.pageShown();
	assert.equal(deps.timer.pending().length, 0);
	slideshow.setSuspended('zoom', false);
	assert.equal(deps.timer.pending().length, 1);
});

test('立っていない理由を下ろしても張り直さない', () => {
	const { deps, slideshow } = playingSlideshow();
	const before = deps.timer.pending()[0].id;
	slideshow.setSuspended('panel', false);
	assert.equal(deps.timer.pending()[0].id, before);
});

test('知らない理由は無視する', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.setSuspended('unknown', true);
	assert.equal(deps.timer.pending().length, 1);
});

test('refresh: 間隔を 4 に変えると 4000 で張り直す', () => {
	const { deps, slideshow } = playingSlideshow();
	deps.settings = { ...deps.settings, slideshowInterval: 4 };
	slideshow.refresh();
	assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [4000]);
	assert.deepEqual(deps.changes.at(-1), { playing: true, durationMs: 4000 });
});

test('refresh: off にすると停止して知らせる', () => {
	const { deps, slideshow } = playingSlideshow();
	deps.settings = { ...deps.settings, slideshow: SLIDESHOW_MODES.OFF };
	slideshow.refresh();
	assert.equal(slideshow.isPlaying(), false);
	assert.equal(deps.timer.pending().length, 0);
	assert.deepEqual(deps.changes.at(-1), { playing: false, durationMs: null });
});

test('refresh: 計時していなければタイマーを張らない', () => {
	const deps = fakeDeps();
	const slideshow = createSlideshow(deps);
	slideshow.pageShown();
	slideshow.refresh();
	assert.equal(deps.timer.pending().length, 0);
});

test('reset で停止し、理由も表示済みも捨てる', () => {
	const { deps, slideshow } = playingSlideshow();
	slideshow.setSuspended('zoom', true);
	slideshow.reset();
	assert.equal(slideshow.isPlaying(), false);
	assert.equal(deps.timer.pending().length, 0);
	assert.deepEqual(deps.changes.at(-1), { playing: false, durationMs: null });
	slideshow.play();
	assert.equal(deps.timer.pending().length, 0, '表示済みが捨てられているので張らない');
	slideshow.pageShown();
	assert.equal(deps.timer.pending().length, 1, 'zoom の理由も捨てられている');
});

/* 表 2.3: タイマーが切れたときの送り */

test('work で次のページがあれば次のページへ', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 0 });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.moves, [1]);
	assert.equal(slideshow.isPlaying(), true);
});

test('work の最後のページでループ オフなら停止', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2 });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.moves, []);
	assert.deepEqual(deps.shownPages, []);
	assert.equal(slideshow.isPlaying(), false);
	assert.deepEqual(deps.changes.at(-1), { playing: false, durationMs: null });
});

test('work の最後のページでループ オンなら 1 ページ目へ', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshowLoop: true } });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.shownPages, [0]);
	assert.equal(slideshow.isPlaying(), true);
});

test('work の 1 ページの作品はループ オンでも停止', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 0, count: 1, settings: { slideshowLoop: true } });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.shownPages, []);
	assert.equal(slideshow.isPlaying(), false);
});

test('work で画像の無いペイン (ページ数 null) はループ オンでも停止', async () => {
	const { deps, slideshow } = playingSlideshow({ count: null, settings: { slideshowLoop: true } });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.shownPages, []);
	assert.equal(slideshow.isPlaying(), false);
});

test('ページを送ったら、次の pageShown まで計時しない', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 0 });
	deps.timer.fire();
	await flush();
	assert.equal(deps.timer.pending().length, 0);
	slideshow.pageShown();
	assert.equal(deps.timer.pending().length, 1);
});

test('sequence で次のページがあれば次のページへ', async () => {
	const { deps } = playingSlideshow({ page: 1, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE } });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.moves, [1]);
	assert.deepEqual(deps.workMoves, []);
});

test('sequence の最後のページでループ オフなら次の作品へ', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE } });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.workMoves, [1]);
	assert.equal(deps.firstMoves, 0);
	assert.equal(slideshow.isPlaying(), true);
});

test('sequence の並びの端でループ オフなら停止', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE } });
	deps.moveWorkResult = false;
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.workMoves, [1]);
	assert.equal(deps.firstMoves, 0);
	assert.equal(slideshow.isPlaying(), false);
});

test('sequence の最後のページでループ オンなら次の作品へ', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.workMoves, [1]);
	assert.equal(deps.firstMoves, 0);
	assert.equal(slideshow.isPlaying(), true);
});

test('sequence の並びの端でループ オンなら並びの先頭の作品へ', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	deps.moveWorkResult = false;
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.workMoves, [1]);
	assert.equal(deps.firstMoves, 1);
	assert.deepEqual(deps.shownPages, []);
	assert.equal(slideshow.isPlaying(), true);
});

test('sequence で moveToFirst が false (並びが 1 件) で複数ページなら 1 ページ目へ', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	deps.moveWorkResult = false;
	deps.moveToFirstResult = false;
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.shownPages, [0]);
	assert.equal(slideshow.isPlaying(), true);
});

test('sequence で moveToFirst が false (並びが 1 件) で 1 ページなら停止', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 0, count: 1, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	deps.moveWorkResult = false;
	deps.moveToFirstResult = false;
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.shownPages, []);
	assert.equal(slideshow.isPlaying(), false);
});

test('sequence で moveToFirst が false でページ数 null (うごイラ) なら停止', async () => {
	const { deps, slideshow } = playingSlideshow({ count: null, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	deps.moveWorkResult = false;
	deps.moveToFirstResult = false;
	deps.timer.fire();
	await flush();
	assert.deepEqual(deps.shownPages, []);
	assert.equal(slideshow.isPlaying(), false);
});

test('moveWork が例外を投げたら移れなかったとみなす (ループ オフなら停止)', async () => {
	const original = console.warn;
	const warned = [];
	console.warn = (...args) => { warned.push(args); };
	try {
		const { deps, slideshow } = playingSlideshow({
			page: 2,
			settings: { slideshow: SLIDESHOW_MODES.SEQUENCE },
			overrides: { moveWork: async () => { throw new Error('open failed'); } },
		});
		deps.timer.fire();
		await flush();
		assert.equal(slideshow.isPlaying(), false);
		assert.equal(warned.length, 1);
	} finally {
		console.warn = original;
	}
});

test('moveToFirst が例外を投げたら移れなかったとみなす', async () => {
	const original = console.warn;
	console.warn = () => {};
	try {
		const { deps, slideshow } = playingSlideshow({
			page: 2,
			settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true },
			overrides: { moveToFirst: async () => { throw new Error('open failed'); } },
		});
		deps.moveWorkResult = false;
		deps.timer.fire();
		await flush();
		assert.deepEqual(deps.shownPages, [0]);
		assert.equal(slideshow.isPlaying(), true);
	} finally {
		console.warn = original;
	}
});

test('moveWork を待っている間に作品が変わったら、false が返っても停止しない', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE } });
	const pending = deferred();
	deps.moveWork = () => pending.promise;
	deps.timer.fire();
	deps.workId = '200';
	pending.resolve(false);
	await flush();
	assert.equal(slideshow.isPlaying(), true);
	assert.equal(deps.firstMoves, 0);
});

test('reset 後に解決した moveWork は何もしない', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	const pending = deferred();
	deps.moveWork = () => pending.promise;
	deps.timer.fire();
	slideshow.reset();
	const changes = deps.changes.length;
	pending.resolve(false);
	await flush();
	assert.equal(deps.firstMoves, 0);
	assert.deepEqual(deps.shownPages, []);
	assert.equal(deps.changes.length, changes);
});

test('moveWork を待っている間に停止されたら、端でも先頭へ戻らない', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	const pending = deferred();
	deps.moveWork = () => pending.promise;
	deps.timer.fire();
	slideshow.pause();
	pending.resolve(false);
	await flush();
	assert.equal(deps.firstMoves, 0);
	assert.deepEqual(deps.shownPages, []);
});

/* 作品の移動を待っている間 */

/**
 * sequence・ループ オンの最後のページで、moveWork を待たせた状態の自動送りを作る。
 * @param {(slideshow: object, deps: object) => void} start 送りを始める処理
 * @returns {{deps: object, slideshow: object, pending: {promise: Promise<boolean>, resolve: (value: boolean) => void}, calls: {moveWork: number, moveToFirst: number}}}
 */
function waitingForWorkMove(start) {
	const { deps, slideshow } = playingSlideshow({ page: 2, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	const pending = deferred();
	const calls = { moveWork: 0, moveToFirst: 0 };
	deps.moveWork = () => { calls.moveWork += 1; return pending.promise; };
	deps.moveToFirst = async () => { calls.moveToFirst += 1; return true; };
	start(slideshow, deps);
	return { deps, slideshow, pending, calls };
}

/** 送りの始め方。ボタンとタイマーの両方で確かめる */
const STARTERS = Object.freeze({
	ボタン: (slideshow) => { slideshow.step(1); },
	タイマー: (slideshow, deps) => { deps.timer.fire(); },
});

for (const [label, start] of Object.entries(STARTERS)) {
	test(`${label}: 作品の移動を待っている間に理由を下ろしてもタイマーを張らない`, async () => {
		const { deps, slideshow, calls } = waitingForWorkMove((show, d) => {
			show.setSuspended('hidden', true);
			show.setSuspended('hidden', false);
			start(show, d);
		});
		slideshow.setSuspended('zoom', true);
		slideshow.setSuspended('zoom', false);
		await flush();
		assert.equal(deps.timer.pending().length, 0);
		assert.deepEqual(calls, { moveWork: 1, moveToFirst: 0 });
	});

	test(`${label}: 作品の移動を待っている間の 2 回目の step(1) は何もしない`, async () => {
		const { deps, slideshow, calls } = waitingForWorkMove(start);
		await slideshow.step(1);
		await flush();
		assert.equal(deps.timer.pending().length, 0);
		assert.deepEqual(calls, { moveWork: 1, moveToFirst: 0 });
		assert.deepEqual(deps.moves, []);
		assert.deepEqual(deps.shownPages, []);
	});

	test(`${label}: 作品の移動を待っている間に停止して再生してもタイマーを張らず、移れなくても先頭へ戻らない`, async () => {
		const { deps, slideshow, pending, calls } = waitingForWorkMove(start);
		slideshow.pause();
		slideshow.play();
		await flush();
		assert.equal(deps.timer.pending().length, 0);
		assert.deepEqual(calls, { moveWork: 1, moveToFirst: 0 });
		pending.resolve(false);
		await flush();
		assert.deepEqual(calls, { moveWork: 1, moveToFirst: 0 });
		assert.equal(slideshow.isPlaying(), true);
		assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [3000], '移れなかったので今のページで数え直す');
	});

	test(`${label}: 作品の移動を待っている間に送った先の表示が終わったら、移り終えてから数える`, async () => {
		const { deps, slideshow, pending } = waitingForWorkMove(start);
		slideshow.workLoading();
		deps.workId = '200';
		slideshow.pageShown();
		assert.equal(deps.timer.pending().length, 0);
		pending.resolve(true);
		await flush();
		assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [3000]);
	});

	test(`${label}: 作品の移動を待っている間に送った先の表示が終わっていなければ、移り終えても数えない`, async () => {
		const { deps, slideshow, pending } = waitingForWorkMove(start);
		slideshow.workLoading();
		deps.workId = '200';
		pending.resolve(true);
		await flush();
		assert.equal(deps.timer.pending().length, 0);
		slideshow.pageShown();
		assert.equal(deps.timer.pending().length, 1);
	});
}

test('作品の移動が終われば、次の step は受け付ける', async () => {
	const { deps, slideshow, pending, calls } = waitingForWorkMove(STARTERS.ボタン);
	pending.resolve(false);
	await flush();
	assert.equal(calls.moveToFirst, 1);
	deps.moveWork = async () => { calls.moveWork += 1; return true; };
	await slideshow.step(1);
	assert.equal(calls.moveWork, 2);
});

/* 表 2.4: 前へ */

test('前のページがあれば前のページへ', async () => {
	const deps = fakeDeps({ page: 1 });
	const slideshow = createSlideshow(deps);
	await slideshow.step(-1);
	assert.deepEqual(deps.moves, [-1]);
});

test('work の 1 ページ目でループ オンなら最後のページへ', async () => {
	const deps = fakeDeps({ page: 0, settings: { slideshowLoop: true } });
	const slideshow = createSlideshow(deps);
	await slideshow.step(-1);
	assert.deepEqual(deps.shownPages, [2]);
});

test('work の 1 ページ目でループ オフなら何もしない', async () => {
	const deps = fakeDeps({ page: 0 });
	const slideshow = createSlideshow(deps);
	await slideshow.step(-1);
	assert.deepEqual(deps.moves, []);
	assert.deepEqual(deps.shownPages, []);
});

test('sequence の 1 ページ目なら前の作品へ', async () => {
	const deps = fakeDeps({ page: 0, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE } });
	const slideshow = createSlideshow(deps);
	await slideshow.step(-1);
	assert.deepEqual(deps.workMoves, [-1]);
	assert.deepEqual(deps.shownPages, []);
});

test('sequence の並びの先頭なら何もしない', async () => {
	const deps = fakeDeps({ page: 0, settings: { slideshow: SLIDESHOW_MODES.SEQUENCE, slideshowLoop: true } });
	deps.moveWorkResult = false;
	const slideshow = createSlideshow(deps);
	await slideshow.step(-1);
	assert.deepEqual(deps.workMoves, [-1]);
	assert.equal(deps.firstMoves, 0);
	assert.deepEqual(deps.shownPages, []);
});

/* ボタンからの step */

test('ボタンの step(1) は送るものが無くても再生を止めない', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 2 });
	await slideshow.step(1);
	assert.equal(slideshow.isPlaying(), true);
	assert.deepEqual(deps.timer.pending().map((entry) => entry.ms), [3000], '計時は最初からやり直す');
});

test('ボタンの step は停止中に再生を始めない', async () => {
	const deps = fakeDeps({ page: 0 });
	const slideshow = createSlideshow(deps);
	slideshow.pageShown();
	await slideshow.step(1);
	assert.deepEqual(deps.moves, [1]);
	assert.equal(slideshow.isPlaying(), false);
	assert.equal(deps.timer.pending().length, 0);
});

test('ボタンの step でページを送ったら、次の pageShown まで計時しない', async () => {
	const { deps, slideshow } = playingSlideshow({ page: 0 });
	await slideshow.step(1);
	assert.equal(deps.timer.pending().length, 0);
	slideshow.pageShown();
	assert.equal(deps.timer.pending().length, 1);
});

test('step の途中で依存が例外を投げても reject しない', async () => {
	const original = console.warn;
	console.warn = () => {};
	try {
		const deps = fakeDeps({ overrides: { canMovePage: () => { throw new Error('broken'); } } });
		const slideshow = createSlideshow(deps);
		await slideshow.step(1);
	} finally {
		console.warn = original;
	}
});
