import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	bookmarkLabel,
	likeLabel,
	followLabel,
	countLabel,
	createActionsBar,
	clearFollowCache,
} from '../../src/content/viewer/actions-bar.js';
import { clearSessionCache } from '../../src/content/session.js';
import { PixivError, PIXIV_ERROR_KINDS } from '../../src/pixiv/errors.js';
import { find } from '../helpers/dom.js';
import { fakeElement, fakeDoc as fakeDocWith, iconName, flush as settle } from '../helpers/dom.js';
import { buildNextData } from '../helpers/pixiv.js';

test('ブックマークのラベルは状態で変わる', () => {
	assert.equal(bookmarkLabel(null), 'ブックマークに追加');
	assert.equal(bookmarkLabel('38764402172'), 'ブックマークから削除');
});

test('いいねのラベルは取り消せないことを明記する', () => {
	// pixiv の仕様上いいねは解除できない。押す前に分かるようにしておく
	assert.equal(likeLabel(false), 'いいね (取り消せません)');
	assert.equal(likeLabel(true), 'いいね済み');
});

test('フォローのラベルは状態で変わる', () => {
	assert.equal(followLabel(false), 'フォロー');
	assert.equal(followLabel(true), 'フォロー中');
});

test('押せるカウンタの文言は操作の説明と件数を両方持つ', () => {
	// 見えているのはアイコンと数字だけなので、これが唯一の説明になる
	assert.equal(countLabel('いいね済み', 2740), 'いいね済み 2,740 件');
	assert.equal(countLabel('ブックマークに追加', 0), 'ブックマークに追加 0 件');
});

/**
 * ログイン済みの __NEXT_DATA__ を返す document の代わり。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return fakeDocWith({
		nextData: buildNextData({ token: 'csrf-token', self: { xRestrict: 1, hideAiWorks: false } }),
	});
}

/** アクションバーへ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149425016',
	userId: '54734418',
	likedByMe: false,
	bookmarkId: null,
	likeCount: 2299,
	bookmarkCount: 2740,
});

/**
 * サイドバーが描いた後のカウンタの行を作る。
 * @returns {object} .counts の代わり
 */
function fakeCounts() {
	const counts = fakeElement('div');
	counts.className = 'counts';
	for (const marker of ['count count-like', 'count count-bookmark', 'count', 'count']) {
		const item = fakeElement('span');
		item.className = marker;
		counts.appendChild(item);
	}
	return counts;
}

/**
 * 描画先ひとそろいとアクションバーを用意する。
 * @param {object} [overrides] fetchUser と actions の差し替え
 * @returns {{container: object, followContainer: object, bar: object, like: () => object, bookmark: () => object}} 一式
 */
function setup(overrides = {}) {
	clearFollowCache();
	const container = fakeCounts();
	const followContainer = fakeElement('div');
	const bar = createActionsBar({
		doc: fakeDoc(),
		container,
		followContainer,
		fetchUser: overrides.fetchUser ?? (async () => ({ isFollowed: false })),
		actions: overrides.actions,
	});
	return {
		container,
		followContainer,
		bar,
		like: () => container.querySelector('.count-like'),
		bookmark: () => container.querySelector('.count-bookmark'),
	};
}

test('いいねとブックマークのカウンタを押せるボタンへ差し替える', () => {
	// X.com と同じで、数字そのものが押す対象になる
	const { container, bar, like, bookmark } = setup();
	bar.render(DETAIL);
	assert.equal(like().tag, 'button');
	assert.equal(bookmark().tag, 'button');
	// 閲覧数とコメント数は押せないまま
	assert.deepEqual(container.children.slice(2, 4).map((child) => child.tag), ['span', 'span']);
	bar.dispose();
});

test('押せるカウンタはいいねを顔、ブックマークをハートで描く', () => {
	// pixiv 本体と逆にすると意味が入れ替わって見える
	const { bar, like, bookmark } = setup();
	bar.render(DETAIL);
	assert.equal(iconName(like().children[0]), 'like');
	assert.equal(iconName(bookmark().children[0]), 'favorite');
	bar.dispose();
});

test('押せるカウンタは差し替えた時点の件数を出す', () => {
	const { bar, like, bookmark } = setup();
	bar.render(DETAIL);
	assert.equal(like().children[1].textContent, '2,299');
	assert.equal(like().title, 'いいね (取り消せません) 2,299 件');
	assert.equal(bookmark().children[1].textContent, '2,740');
	assert.equal(bookmark().title, 'ブックマークに追加 2,740 件');
	bar.dispose();
});

test('いいねすると件数が 1 増え、押せなくなる', async () => {
	const { bar, like } = setup({ actions: { likeIllust: async () => {} } });
	bar.render(DETAIL);
	await like().dispatch('click');
	assert.equal(like().children[1].textContent, '2,300');
	assert.equal(like().title, 'いいね済み 2,300 件');
	assert.equal(like().classList.contains('is-on'), true);
	// いいねは取り消せないので二度押しさせない
	assert.equal(like().disabled, true);
	bar.dispose();
});

test('いいねに失敗したら件数を動かさない', async () => {
	const { bar, like } = setup({ actions: { likeIllust: async () => { throw new Error('400'); } } });
	bar.render(DETAIL);
	await like().dispatch('click');
	assert.equal(like().children[1].textContent, '2,299');
	assert.equal(like().disabled, false);
	assert.equal(like().classList.contains('is-on'), false);
	bar.dispose();
});

test('ブックマークの追加と削除で件数が増減する', async () => {
	const { bar, bookmark } = setup({
		actions: { addBookmark: async () => '38764402172', deleteBookmark: async () => {} },
	});
	bar.render(DETAIL);

	await bookmark().dispatch('click', { shiftKey: false });
	assert.equal(bookmark().children[1].textContent, '2,741');
	assert.equal(bookmark().title, 'ブックマークから削除 2,741 件');
	assert.equal(bookmark().classList.contains('is-on'), true);

	await bookmark().dispatch('click', { shiftKey: false });
	assert.equal(bookmark().children[1].textContent, '2,740');
	assert.equal(bookmark().title, 'ブックマークに追加 2,740 件');
	assert.equal(bookmark().classList.contains('is-on'), false);
	bar.dispose();
});

test('ブックマーク削除で件数は負の数にならない', async () => {
	// pixiv 側の集計とずれていても画面を壊さない
	const { bar, bookmark } = setup({ actions: { deleteBookmark: async () => {} } });
	bar.render({ ...DETAIL, bookmarkId: '38764402172', bookmarkCount: 0 });
	await bookmark().dispatch('click', { shiftKey: false });
	assert.equal(bookmark().children[1].textContent, '0');
	bar.dispose();
});

test('未ログインならカウンタを差し替えず案内だけ出す', () => {
	clearFollowCache();
	// 他のテストが覚えたログイン済みのセッションを捨てる
	clearSessionCache();
	const container = fakeCounts();
	const bar = createActionsBar({
		// nextData を渡さない = __NEXT_DATA__ が無い = 未ログイン
		doc: fakeDocWith(),
		container,
		followContainer: fakeElement('div'),
	});
	bar.render(DETAIL);
	// 件数は読めるままにする
	assert.equal(container.querySelector('.count-like').tag, 'span');
	assert.ok(container.children.some((child) => child.textContent === 'ログインするといいねやブックマークができます'));
	bar.dispose();
	clearSessionCache();
});

test('フォローボタンは作者行の枠へ描く', () => {
	const { container, followContainer, bar } = setup();
	bar.render(DETAIL);
	// カウンタの行に独立したボタンは増えない
	assert.equal(container.children.filter((child) => child.className.includes('action-follow')).length, 0);
	assert.equal(followContainer.children.length, 1);
	assert.equal(followContainer.children[0].className, 'action action-follow');
	bar.dispose();
});

test('フォローボタンは状態が分かるまで押せない', () => {
	const { followContainer, bar } = setup({ fetchUser: () => new Promise(() => {}) });
	bar.render(DETAIL);
	const button = followContainer.children[0];
	assert.equal(button.disabled, true);
	assert.equal(button.getAttribute('aria-busy'), 'true');
	bar.dispose();
});

test('フォロー済みなら「フォロー中」で描き直す', async () => {
	const { followContainer, bar } = setup({ fetchUser: async () => ({ isFollowed: true }) });
	bar.render(DETAIL);
	await settle();
	const button = followContainer.children[0];
	assert.equal(button.title, 'フォロー中');
	assert.equal(button.disabled, false);
	assert.equal(button.getAttribute('aria-busy'), null);
	assert.equal(button.classList.contains('is-on'), true);
	assert.equal(iconName(button.children[0]), 'personCheck');
	bar.dispose();
});

test('フォロー状態は作者ごとに 1 回だけ取りに行く', async () => {
	let calls = 0;
	const fetchUser = async () => { calls += 1; return { isFollowed: true }; };
	const first = setup({ fetchUser });
	first.bar.render(DETAIL);
	await settle();
	first.bar.dispose();

	// 同じ作者の別の作品へ移っても取り直さない。ユーザーページでは作者が変わらない
	const container = fakeCounts();
	const followContainer = fakeElement('div');
	const second = createActionsBar({ doc: fakeDoc(), container, followContainer, fetchUser });
	second.render({ ...DETAIL, id: '149425017' });
	await settle();
	assert.equal(calls, 1);
	assert.equal(followContainer.children[0].title, 'フォロー中');
	second.dispose();
});

test('フォロー状態を取れなくてもボタンは押せる状態に戻す', async () => {
	const { followContainer, bar } = setup({ fetchUser: async () => { throw new Error('401'); } });
	bar.render(DETAIL);
	await settle();
	const button = followContainer.children[0];
	assert.equal(button.disabled, false);
	assert.equal(button.title, 'フォロー');
	bar.dispose();
});

test('既にいいね済みだったと返ってきたら件数を増やさない', async () => {
	// 別タブや pixiv 本体で先に押していた場合。pixiv 側の件数は増えないので手元も増やさない
	const { bar, like } = setup({ actions: { likeIllust: async () => true } });
	bar.render(DETAIL);
	await like().dispatch('click');
	assert.equal(like().children[1].textContent, '2,299');
	assert.equal(like().title, 'いいね済み 2,299 件');
	assert.equal(like().disabled, true);
	bar.dispose();
});

test('ログインが切れていたら (401) セッションを読み直させる文言にする', async () => {
	const unauthorized = new PixivError(PIXIV_ERROR_KINDS.UNAUTHORIZED, '401', 401);
	const { bar, like, container } = setup({ actions: { likeIllust: async () => { throw unauthorized; } } });
	bar.render(DETAIL);
	await like().dispatch('click');
	const status = find(container, '.action-status');
	assert.match(status.textContent, /ログイン/);
	assert.equal(status.getAttribute('data-kind'), 'error');
	bar.dispose();
});
