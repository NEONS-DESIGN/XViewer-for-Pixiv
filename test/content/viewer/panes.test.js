import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPanes, MAIN_PANE, renderWork, rerenderMain, currentPage, disposeAll } from '../../../src/content/viewer/panes.js';
import { ILLUST_TYPES } from '../../../src/pixiv/normalize.js';
import { fakeDoc, fakeElement } from '../../helpers/dom.js';
import { createStrings } from '../../../src/i18n/index.js';

/**
 * 作品詳細の代わり。planPanes が見るキーだけを持つ。
 * @param {object} [overrides] 上書きする値
 * @returns {object} detail の代わり
 */
function detail(overrides = {}) {
	return {
		id: '149425016',
		illustType: ILLUST_TYPES.ILLUST,
		xRestrict: 0,
		aiType: 0,
		commentOff: false,
		commentCount: 3,
		...overrides,
	};
}

/** ログイン済みで R-18 まで見られるセッション。 */
const LOGGED_IN = Object.freeze({ isLoggedIn: true, self: { xRestrict: 1, hideAiWorks: false } });

/** 未ログインのセッション。 */
const ANONYMOUS = Object.freeze({ isLoggedIn: false, self: null });

/**
 * 設定の代わり。planPanes が見るのはサイドバーの有無だけ。
 * @param {boolean} showSidebar サイドバーを出すか
 * @returns {object} settings の代わり
 */
function settings(showSidebar) {
	return { showSidebar, imageQuality: 'regular', prefetch: 3, enabled: true, closeOnBackdrop: true };
}

test('一枚絵はサイドバーとコメントとアクションを揃えて出す', () => {
	const plan = planPanes(detail(), LOGGED_IN, settings(true));
	assert.deepEqual(plan, {
		main: MAIN_PANE.IMAGE,
		sidebar: true,
		comments: true,
		actions: true,
		reason: null,
	});
});

test('サイドバーを閉じているとコメントとアクションも出さない', () => {
	// コメントとアクションはサイドバーの中に入るので、単独では出せない
	const plan = planPanes(detail(), LOGGED_IN, settings(false));
	assert.equal(plan.sidebar, false);
	assert.equal(plan.comments, false);
	assert.equal(plan.actions, false);
	assert.equal(plan.main, MAIN_PANE.IMAGE);
});

test('見られない作品はブロック表示。サイドバーは出すがコメントとアクションは出さない', () => {
	const plan = planPanes(detail({ xRestrict: 2 }), LOGGED_IN, settings(true));
	assert.equal(plan.main, MAIN_PANE.BLOCKED);
	// タイトル・タグ・カウンタは pixiv 本体でも見える情報なので隠さない
	assert.equal(plan.sidebar, true);
	assert.equal(plan.comments, false);
	assert.equal(plan.actions, false);
	assert.equal(plan.reason.kind, 'setting');
});

test('ブロックでもサイドバーを閉じていれば出さない', () => {
	const plan = planPanes(detail({ xRestrict: 2 }), LOGGED_IN, settings(false));
	assert.equal(plan.main, MAIN_PANE.BLOCKED);
	assert.equal(plan.sidebar, false);
});

test('未ログインの R-18 はログインを促すブロック表示になる', () => {
	const plan = planPanes(detail({ xRestrict: 1 }), ANONYMOUS, settings(true));
	assert.equal(plan.main, MAIN_PANE.BLOCKED);
	assert.equal(plan.reason.kind, 'login');
});

test('うごイラはうごイラのペインを出す', () => {
	const plan = planPanes(detail({ illustType: ILLUST_TYPES.UGOIRA }), LOGGED_IN, settings(true));
	assert.equal(plan.main, MAIN_PANE.UGOIRA);
});

test('うごイラでも見られない作品はブロックが勝つ', () => {
	// 見られない作品を再生してはいけないので、ブロックの判定が先
	const plan = planPanes(
		detail({ illustType: ILLUST_TYPES.UGOIRA, xRestrict: 2 }),
		LOGGED_IN,
		settings(true),
	);
	assert.equal(plan.main, MAIN_PANE.BLOCKED);
});

test('コメント無効と 0 件でもコメント区画は作る', () => {
	// 「受け付けていません」「まだコメントはありません」を出す場所が要るので、
	// 区画を作るかどうかはサイドバーの有無だけで決まる
	assert.equal(planPanes(detail({ commentOff: true }), LOGGED_IN, settings(true)).comments, true);
	assert.equal(planPanes(detail({ commentCount: 0 }), LOGGED_IN, settings(true)).comments, true);
	// サイドバーが無ければどちらの文言も出せない
	assert.equal(planPanes(detail({ commentOff: true }), LOGGED_IN, settings(false)).comments, false);
});

test('showSidebar が真偽値でなければサイドバーを出さない', () => {
	// 設定が壊れていても描けること。storage 側で丸めているが、ここでも倒す
	assert.equal(planPanes(detail(), LOGGED_IN, { showSidebar: undefined }).sidebar, false);
});

/**
 * サイドバーの代わり。commentsSlot / countsSlot / followSlot は
 * createComments / createActionsBar (実物) がそのまま使うので、器になる要素を返す。
 * @param {string[]} order 呼ばれた順番を書き込む配列
 * @returns {object} サイドバーペインの代わり
 */
function fakeSidebarPane(order) {
	return {
		render() { order.push('sidebar'); },
		commentsSlot: () => fakeElement('div'),
		countsSlot: () => fakeElement('div'),
		followSlot: () => fakeElement('div'),
		bumpCommentCount() {},
		setCommentCount() {},
		consumeKey: () => false,
		dispose() {},
	};
}

/**
 * renderWork へ渡す描画先の代わり。
 * コメントは commentOff で受け付けを止め、実物のコメント区画が通信をしないようにする。
 * アクション区画は fakeDoc に __NEXT_DATA__ が無く未ログイン扱いになるので、通信の手前で止まる。
 * @returns {{doc: object, stage: object, sidebar: object, strings: object}} 描画先
 */
function targets() {
	const doc = fakeDoc();
	return {
		doc,
		stage: fakeElement('div'),
		sidebar: fakeElement('div'),
		strings: createStrings('ja'),
	};
}

test('主役の描画 (src の代入) はサイドバーより先に始まる', async () => {
	const order = [];
	await renderWork(detail({ commentOff: true }), LOGGED_IN, settings(true), {
		...targets(),
		createImagePane: () => ({
			render: () => { order.push('main'); return Promise.resolve(); },
			dispose() {},
		}),
		createSidebar: () => fakeSidebarPane(order),
	});
	disposeAll();
	assert.deepEqual(order.slice(0, 2), ['main', 'sidebar']);
});

test('うごイラでも主役の描画はサイドバーより先に始まる', async () => {
	const order = [];
	await renderWork(detail({ illustType: ILLUST_TYPES.UGOIRA, commentOff: true }), LOGGED_IN, settings(true), {
		...targets(),
		createUgoiraPlayer: () => ({
			render: () => { order.push('main'); return Promise.resolve(); },
			dispose() {},
		}),
		createSidebar: () => fakeSidebarPane(order),
	});
	disposeAll();
	assert.deepEqual(order.slice(0, 2), ['main', 'sidebar']);
});

test('主役の render は await の前、サイドバーより前に呼ばれている', async () => {
	// renderWork が返る前に主役の Promise を待っていることも確かめる。
	// 待っていなければ、この then が走る前に renderWork が返ってしまう
	let mainSettled = false;
	await renderWork(detail({ commentOff: true }), LOGGED_IN, settings(true), {
		...targets(),
		createImagePane: () => ({
			render: () => Promise.resolve().then(() => { mainSettled = true; }),
			dispose() {},
		}),
		createSidebar: () => fakeSidebarPane([]),
	});
	disposeAll();
	assert.equal(mainSettled, true);
});

test('ブロック表示は今どおりサイドバーを先に作ってから描く', async () => {
	const order = [];
	await renderWork(detail({ xRestrict: 2, commentOff: true }), LOGGED_IN, settings(true), {
		...targets(),
		createImagePane: () => ({
			render: () => { order.push('main'); return Promise.resolve(); },
			dispose() {},
		}),
		createSidebar: () => fakeSidebarPane(order),
	});
	disposeAll();
	// ブロック表示では画像ペインの工場を一切呼ばない
	assert.deepEqual(order, ['sidebar']);
});

test('うごイラのペインへ温めた meta を手渡ししない', async () => {
	// 隣の先読みで取った ugoira_meta は作品単位で覚える取得 (pixiv/illust-assets.js) に入り、再生器が自分で引く
	let received;
	await renderWork(detail({ illustType: ILLUST_TYPES.UGOIRA }), LOGGED_IN, settings(false), {
		...targets(),
		createUgoiraPlayer: (deps) => {
			received = deps;
			return { render: () => Promise.resolve(), dispose() {} };
		},
	});
	disposeAll();
	assert.equal('preloadedMeta' in received, false);
});

test('rerenderMain は主役だけを作り直し、サイドバーは作り直さない。今のページから開く', async () => {
	const order = [];
	const disposed = [];
	let startPage;
	let made = 0;
	const base = {
		...targets(),
		createImagePane: () => {
			made += 1;
			const id = made;
			return {
				render: (_detail, options) => { order.push(`main${id}`); startPage = options.startPage; return Promise.resolve(); },
				pageIndex: () => 2,
				dispose() { disposed.push(id); },
			};
		},
		createSidebar: () => fakeSidebarPane(order),
	};
	await renderWork(detail({ commentOff: true }), LOGGED_IN, settings(true), base);
	assert.equal(currentPage(), 2);
	const result = rerenderMain(detail({ commentOff: true }), LOGGED_IN, settings(true), { ...base, startPage: currentPage() }, ['imageQuality']);
	assert.equal(result.rebuilt, true);
	await result.done;
	disposeAll();
	assert.deepEqual(order, ['main1', 'sidebar', 'main2']);
	assert.equal(startPage, 2);
	assert.deepEqual(disposed, [1, 2]);
});

test('rerenderMain は主役が読まない設定の変更では何もしない', async () => {
	let made = 0;
	const base = {
		...targets(),
		createUgoiraPlayer: () => { made += 1; return { render: () => Promise.resolve(), dispose() {} }; },
	};
	const ugoira = detail({ illustType: ILLUST_TYPES.UGOIRA });
	await renderWork(ugoira, LOGGED_IN, settings(false), base);
	// 先読みの枚数や原寸表示はうごイラに関係しない。作り直すと zip を読み直すことになる
	assert.equal(rerenderMain(ugoira, LOGGED_IN, settings(false), base, ['prefetch', 'clickZoom']).rebuilt, false);
	assert.equal(rerenderMain(ugoira, LOGGED_IN, settings(false), base, ['imageQuality']).rebuilt, true);
	// ブロック表示は設定を読まない
	assert.equal(rerenderMain(detail({ xRestrict: 2 }), LOGGED_IN, settings(false), base, ['imageQuality']).rebuilt, false);
	disposeAll();
	assert.equal(made, 2);
	assert.equal(currentPage(), null, '画像ペインが無ければ null');
});
