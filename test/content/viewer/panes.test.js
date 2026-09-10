import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPanes, MAIN_PANE } from '../../../src/content/viewer/panes.js';
import { ILLUST_TYPES } from '../../../src/pixiv/normalize.js';

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

test('サイドバーを OFF から ON へ戻すと再び出す', () => {
	// Task 17 で実際に壊れた組み合わせ。判断が設定だけで決まることを固定する
	const work = detail();
	assert.equal(planPanes(work, LOGGED_IN, settings(false)).sidebar, false);
	assert.equal(planPanes(work, LOGGED_IN, settings(true)).sidebar, true);
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
