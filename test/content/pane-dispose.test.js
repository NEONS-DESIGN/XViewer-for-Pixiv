import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImagePane } from '../../src/content/viewer/image-pane.js';
import { createSidebar } from '../../src/content/viewer/sidebar.js';
import { renderWork, disposeAll, consumeEscape, consumeKey } from '../../src/content/viewer/panes.js';
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

test('画像ペインは dispose で自分の枠を DOM から外す', async () => {
	const container = fakeElement('div');
	const pane = createImagePane({
		doc: fakeDoc(),
		container,
		// 先読みを 0 にして Image を作らせない (node には Image が無い)
		settings: { imageQuality: 'regular', prefetch: 0 },
		strings: createStrings('ja'),
	});
	await pane.render(DETAIL);
	assert.equal(container.querySelectorAll('.frame').length, 1);

	pane.dispose();
	// 枠が残ると、次の作品を読み込んでいる間に前の作品の矢印とカウンタが見えてしまう
	assert.equal(container.querySelectorAll('.frame').length, 0);
	assert.equal(container.children.length, 0);
});

test('サイドバーは dispose で中身を空にする', () => {
	const container = fakeElement('div');
	const pane = createSidebar({ doc: fakeDoc(), container, fetchUser: async () => ({}), strings: createStrings('ja') });
	pane.render(DETAIL);
	assert.ok(container.children.length > 0);

	pane.dispose();
	assert.equal(container.children.length, 0);
});

test('renderWork はサイドバーにコメント区画とアクションを作る', async () => {
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, fetchUser, strings });

	assert.equal(sidebar.hidden, false);
	assert.ok(sidebar.querySelectorAll('.comments')[0].children.length > 0);
	// アクションはカウンタの行へ入る。未ログインなので差し替えは起きず、案内が足される
	const counts = sidebar.querySelectorAll('.counts')[0];
	assert.equal(counts.children.length, 5);
	assert.ok(counts.children.some((child) => child.className === 'status'));
	disposeAll();
});

test('renderWork は fetchUser をサイドバーとアクションの両方へ渡す', async () => {
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
	disposeAll();
	clearSessionCache();
});

test('サイドバーを OFF から ON へ戻すと hidden が下りる', async () => {
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
	disposeAll();
});

test('コメントとアクションは主役の描画を待たずに作る', async () => {
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
	assert.ok(sidebar.querySelectorAll('.counts')[0].children.length > 4);
	await rendering;
	assert.equal(stage.querySelectorAll('.frame').length, 1);
	disposeAll();
});


test('consumeEscape はシェアメニューが開いているときだけ true を返す', async () => {
	// ビュワー本体の Escape (モーダルを閉じる) より先に呼ばれる。
	// 開いていないのに true を返すと、Escape でモーダルが閉じられなくなる
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, fetchUser, strings });
	assert.equal(consumeEscape(), false);

	sidebar.querySelectorAll('.share-button')[0].click();
	assert.equal(consumeEscape(), true);
	assert.equal(consumeEscape(), false);
	disposeAll();
});

test('consumeKey はシェアメニューが開いているときだけ上下キーを食い止める', async () => {
	// 本体は上下キーを作品の移動に使う。開いたメニューの項目送りを横取りされないように先に聞く
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, fetchUser, strings });
	const down = { key: 'ArrowDown', preventDefault() {} };
	assert.equal(consumeKey(down), false);
	sidebar.querySelectorAll('.share-button')[0].click();
	assert.equal(consumeKey(down), true);
	disposeAll();
	assert.equal(consumeKey(down), false);
});

test('ペインを捨てた後の consumeEscape は false を返す', async () => {
	const { stage, sidebar, fetchUser, strings } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, fetchUser, strings });
	sidebar.querySelectorAll('.share-button')[0].click();
	disposeAll();
	assert.equal(consumeEscape(), false);
});
