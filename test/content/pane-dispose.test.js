import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSidebar } from '../../src/content/viewer/sidebar.js';
import { renderWork, disposeAll, consumeKey } from '../../src/content/viewer/panes.js';
import { clearSessionCache } from '../../src/content/session.js';
// fakeDoc は nextData を渡さない = __NEXT_DATA__ が無い = actions-bar から見て未ログイン
import { fakeElement, fakeDoc, flush } from '../helpers/dom.js';
import { buildNextData } from '../helpers/pixiv.js';
import { createStrings } from '../../src/i18n/index.js';

/** 未ログインのセッション。全年齢作品はこれでも見られる。 */
const ANONYMOUS = Object.freeze({ isLoggedIn: false, self: null });

/** ログイン済みで R-18 まで見られるセッション。 */
const LOGGED_IN = Object.freeze({ isLoggedIn: true, self: { xRestrict: 1, hideAiWorks: false } });

/** サイドバーへ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149425016',
	userId: '54734418',
	userName: '作者',
	title: 'タイトル',
	comment: '本文<br />2行目',
	tags: ['オリジナル'],
	likeCount: 1,
	bookmarkCount: 2,
	viewCount: 3,
	createDate: '2026-09-08T17:45:00+09:00',
	pageCount: 1,
	urls: { regular: 'https://i.pximg.net/img-master/x_p0_master1200.jpg' },
	illustType: 0,
	xRestrict: 0,
	aiType: 0,
	commentOff: false,
	// 0 件にしておくとコメントの取得へ行かない。ここで見たいのは区画を作るかどうかだけ
	commentCount: 0,
});

/** renderWork へ渡す設定の代わり。 */
const SETTINGS = Object.freeze({ showSidebar: true, imageQuality: 'regular', prefetch: 0 });

/**
 * renderWork の描画先をひとそろい作る。
 * @returns {{stage: object, sidebar: object}} ステージとサイドバー
 */
function fakeTargets() {
	// fetchUser を差し込んで作者アイコンの取得で通信させない
	return {
		stage: fakeElement('div'),
		sidebar: fakeElement('div'),
		fetchUser: async () => ({}),
		strings: createStrings('ja'),
	};
}

// panes.js はモジュール変数の単体なので、途中の assert で落ちると次のテストに前のペインが残って連鎖する。
// renderWork を呼ぶテストは t.after(disposeAll) で必ず片付ける

test('サイドバーは dispose で中身を空にする', () => {
	const container = fakeElement('div');
	const pane = createSidebar({ doc: fakeDoc(), container, fetchUser: async () => ({}), strings: createStrings('ja') });
	pane.render(DETAIL);
	assert.ok(container.children.length > 0);

	pane.dispose();
	assert.equal(container.children.length, 0);
});

test('renderWork はサイドバーにコメント区画とアクションを作る', async (t) => {
	t.after(disposeAll);
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, fetchUser, strings });

	assert.equal(sidebar.hidden, false);
	assert.ok(sidebar.querySelectorAll('.comments')[0].children.length > 0);
	// アクションはカウンタの行へ入る。未ログインなので差し替えは起きず、案内が足される
	const counts = sidebar.querySelectorAll('.counts')[0];
	assert.ok(counts.children.some((child) => child.className === 'status'));
});

test('renderWork は fetchUser をサイドバーとアクションの両方へ渡す', async (t) => {
	t.after(() => {
		disposeAll();
		clearSessionCache();
	});
	// ログイン済みだとアクションがフォロー状態を引く。差し替え口が渡っていないと
	// 既定の fetchUserProfile が本物の /ajax/user を叩きに行く (node では TypeError で失敗する)
	const { stage, sidebar, strings } = fakeTargets();
	const asked = [];
	const fetchUser = async (userId) => { asked.push(userId); return { isFollowed: true }; };
	const doc = fakeDoc({
		nextData: buildNextData({ token: 'csrf-token', self: { xRestrict: 1, hideAiWorks: false } }),
	});
	// 前のテストが覚えた未ログインのセッションを捨て、この doc から読み直させる
	clearSessionCache();
	await renderWork(DETAIL, LOGGED_IN, SETTINGS, { doc, stage, sidebar, fetchUser, strings });
	await flush();
	// サイドバー (作者アイコン) とアクション (フォロー状態) の両方から同じ差し替え口が呼ばれる
	assert.deepEqual(asked, ['54734418', '54734418']);
	assert.equal(sidebar.querySelectorAll('.action-follow')[0].title, 'フォロー中');
});

test('サイドバーを OFF から ON へ戻すと hidden が下りる', async (t) => {
	t.after(disposeAll);
	// Task 17 で実際に壊れた組み合わせ。hidden を立てる側しか書いていなかったため、
	// 設定を戻して次の作品へ移ってもサイドバーが出てこなかった。
	// 判断 (planPanes) ではなく、毎回明示的に代入する renderWork 側を見る必要がある
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	const doc = fakeDoc();
	const off = { ...SETTINGS, showSidebar: false };

	await renderWork(DETAIL, ANONYMOUS, off, { doc, stage, sidebar, fetchUser, strings });
	assert.equal(sidebar.hidden, true);

	disposeAll();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc, stage, sidebar, fetchUser, strings });
	assert.equal(sidebar.hidden, false);
});

test('コメントとアクションは主役の描画を待たずに作る', async (t) => {
	t.after(disposeAll);
	// 主役 (画像ペイン) の await の前にサイドバーの中身を全部作り終える。
	// await をまたがないので、別の作品へ移ったあとに古い作品のコメントや
	// いいねを新しいサイドバーへ差し込むことがない (いいねは取り消せない)
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	const rendering = renderWork(DETAIL, ANONYMOUS, SETTINGS, {
		doc: fakeDoc(),
		stage,
		sidebar,
		fetchUser,
		strings,
	});
	// まだ主役の await を抜けていない時点で、コメント区画と案内が入っている
	assert.ok(sidebar.querySelectorAll('.comments')[0].children.length > 0);
	assert.ok(sidebar.querySelectorAll('.counts')[0].children.some((child) => child.className === 'status'));
	await rendering;
	assert.equal(stage.querySelectorAll('.frame').length, 1);
});

test('consumeKey はシェアメニューが開いているときだけ上下キーを食い止める', async (t) => {
	t.after(disposeAll);
	// 本体は上下キーを作品の移動に使う。開いたメニューの項目送りを横取りされないように先に聞く。
	// Escape も同じ経路で聞く (viewer.test.js が固定している)
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, fetchUser, strings });
	const down = { key: 'ArrowDown', preventDefault() {} };
	assert.equal(consumeKey(down), false);
	sidebar.querySelectorAll('.share-button')[0].click();
	assert.equal(consumeKey(down), true);
	// ペインを捨てた後は必ず false
	disposeAll();
	assert.equal(consumeKey(down), false);
});
