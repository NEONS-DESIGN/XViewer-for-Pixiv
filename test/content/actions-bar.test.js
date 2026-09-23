import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	bookmarkLabel,
	likeLabel,
	followLabel,
	countLabel,
	createActionsBar,
} from '../../src/content/viewer/actions-bar.js';
import { clearSessionCache } from '../../src/content/session.js';
import { PixivError, PIXIV_ERROR_KINDS } from '../../src/pixiv/errors.js';
import { createStrings } from '../../src/i18n/index.js';
import { find } from '../helpers/dom.js';
import { fakeElement, fakeDoc as fakeDocWith, iconName, flush as settle } from '../helpers/dom.js';
import { buildNextData } from '../helpers/pixiv.js';

/** このファイルの既定の表示言語。文言は日本語のまま揃える。 */
const STRINGS = createStrings('ja');

/** ブックマークを非公開で入れる操作の手掛かり。title にだけ添える。(画面には出ない) */
const BOOKMARK_PRIVATE_HINT = STRINGS.actionsBar.BOOKMARK_PRIVATE_HINT;

test('ブックマークのラベルは状態で変わる', () => {
	assert.equal(bookmarkLabel(null, STRINGS), 'ブックマークに追加');
	assert.equal(bookmarkLabel('38764402172', STRINGS), 'ブックマークから削除');
});

test('いいねのラベルは取り消せないことを明記する', () => {
	// pixiv の仕様上いいねは解除できない。押す前に分かるようにしておく
	assert.equal(likeLabel(false, STRINGS), 'いいね (取り消せません)');
	assert.equal(likeLabel(true, STRINGS), 'いいね済み');
});

test('フォローのラベルは状態で変わる', () => {
	assert.equal(followLabel(false, STRINGS), 'フォロー');
	assert.equal(followLabel(true, STRINGS), 'フォロー中');
});

test('押せるカウンタの文言は操作の説明と件数を両方持つ', () => {
	// 見えているのはアイコンと数字だけなので、これが唯一の説明になる
	assert.equal(countLabel('いいね済み', 2740, STRINGS), 'いいね済み 2,740 件');
	assert.equal(countLabel('ブックマークに追加', 0, STRINGS), 'ブックマークに追加 0 件');
});

test('ラベル関数は英語のカタログで英語を返す', () => {
	const en = createStrings('en');
	assert.equal(bookmarkLabel('123', en), 'Remove bookmark');
	assert.equal(bookmarkLabel(null, en), 'Add bookmark');
	assert.equal(likeLabel(true, en), 'Liked');
	assert.equal(likeLabel(false, en), 'Like (cannot be undone)');
	assert.equal(followLabel(true, en), 'Following');
});

test('countLabel は英語では助数詞を付けない', () => {
	assert.equal(countLabel('Likes', 1234, createStrings('en')), 'Likes 1,234');
	assert.equal(countLabel('いいね', 1234, createStrings('ja')), 'いいね 1,234 件');
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
 * patchUser は既定で記録だけする。(pixiv/user.js のキャッシュへ書かない)
 * @param {object} [overrides] fetchUser / patchUser / actions の差し替え
 * @returns {{container: object, followContainer: object, bar: object, patched: object[], like: () => object, bookmark: () => object}} 一式
 */
function setup(overrides = {}) {
	const container = fakeCounts();
	const followContainer = fakeElement('div');
	const patched = [];
	const bar = createActionsBar({
		doc: fakeDoc(),
		container,
		followContainer,
		fetchUser: overrides.fetchUser ?? (async () => ({ isFollowed: false })),
		patchUser: overrides.patchUser ?? ((userId, patch) => { patched.push([userId, patch]); }),
		actions: overrides.actions,
		strings: STRINGS,
	});
	return {
		container,
		followContainer,
		bar,
		patched,
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
	assert.equal(like().getAttribute('aria-label'), 'いいね (取り消せません) 2,299 件');
	assert.equal(bookmark().children[1].textContent, '2,740');
	assert.equal(bookmark().getAttribute('aria-label'), 'ブックマークに追加 2,740 件');
	bar.dispose();
});

test('未ブックマークのカウンタは title にだけ Shift で非公開になる手掛かりを添える', () => {
	// 非公開の入れ方はコードと SPEC にしか無かった。操作の説明は title に持たせる。(UI_DESIGN_KIT §6)
	// 読み上げ (aria-label) には足さない。件数の後ろに長い説明が付くと毎回読まれて邪魔になる
	const { bar, bookmark } = setup();
	bar.render(DETAIL);
	assert.equal(bookmark().title, `ブックマークに追加 2,740 件 ${BOOKMARK_PRIVATE_HINT}`);
	assert.equal(bookmark().getAttribute('aria-label'), 'ブックマークに追加 2,740 件');
	bar.dispose();
});

test('ブックマーク済みのカウンタには非公開の手掛かりを付けない', () => {
	// 押すと削除なので Shift の説明は嘘になる
	const { bar, bookmark } = setup();
	bar.render({ ...DETAIL, bookmarkId: '38764402172' });
	assert.equal(bookmark().title, 'ブックマークから削除 2,740 件');
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
	assert.equal(bookmark().title, `ブックマークに追加 2,740 件 ${BOOKMARK_PRIVATE_HINT}`);
	assert.equal(bookmark().classList.contains('is-on'), false);
	bar.dispose();
});

test('Shift を押しながらのブックマークは非公開で送る', async () => {
	const sent = [];
	const { bar, bookmark, container } = setup({
		actions: { addBookmark: async (id, isPrivate) => { sent.push(isPrivate); return '38764402172'; } },
	});
	bar.render(DETAIL);
	await bookmark().dispatch('click', { shiftKey: true });
	assert.deepEqual(sent, [true]);
	assert.equal(find(container, '.action-status').textContent, '非公開でブックマークしました');
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

test('ブックマークの応答を待つ間に破棄されたら、外れたボタンを触らない', async () => {
	// SPEC §10.12「すべての await の後に if (disposed) return」。
	// 作品を送った直後に前の作品の応答が返っても、古いボタンの見た目と件数を書き換えない
	let finish;
	const { bar, bookmark } = setup({
		actions: { addBookmark: () => new Promise((resolve) => { finish = resolve; }) },
	});
	bar.render(DETAIL);
	const clicking = bookmark().dispatch('click', { shiftKey: false });
	const button = bookmark();
	bar.dispose();
	finish('38764402172');
	await clicking;
	assert.equal(button.children[1].textContent, '2,740');
	assert.equal(button.classList.contains('is-on'), false);
});

test('未ログインならカウンタを差し替えず案内だけ出す', () => {
	// 他のテストが覚えたログイン済みのセッションを捨てる
	clearSessionCache();
	const container = fakeCounts();
	const bar = createActionsBar({
		// nextData を渡さない = __NEXT_DATA__ が無い = 未ログイン
		doc: fakeDocWith(),
		container,
		followContainer: fakeElement('div'),
		strings: STRINGS,
	});
	bar.render(DETAIL);
	// 件数は読めるままにする
	assert.equal(container.querySelector('.count-like').tag, 'span');
	assert.ok(container.children.some((child) => child.textContent === 'ログインするといいねやブックマークができます'));
	// 押せるものが無いので、結果を読み上げる領域も作らない
	assert.equal(find(container, '.action-status'), null);
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

test('フォローボタンは文言が見えているので aria-label を重ねない', () => {
	// 可視テキストと同じ aria-label は二度読まれるだけ。title は操作の説明として残す
	const { followContainer, bar } = setup();
	bar.render(DETAIL);
	const button = followContainer.children[0];
	assert.equal(button.getAttribute('aria-label'), null);
	assert.equal(button.title, 'フォロー');
	assert.equal(button.children[1].textContent, 'フォロー');
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

test('フォローを切り替えたら覚えているユーザー情報へ書き戻す', async () => {
	// フォロー状態を覚えるのは pixiv/user.js の 1 か所。ここに別のキャッシュは持たない。
	// 書き戻さないと、次の作品で fetchUser が古い応答を返して「フォロー」に戻って見える
	const { followContainer, bar, patched } = setup({
		actions: { followUser: async () => {}, unfollowUser: async () => {} },
	});
	bar.render(DETAIL);
	await settle();
	const button = followContainer.children[0];
	await button.dispatch('click');
	assert.deepEqual(patched, [['54734418', { isFollowed: true }]]);
	assert.equal(button.title, 'フォロー中');
	await button.dispatch('click');
	assert.deepEqual(patched[1], ['54734418', { isFollowed: false }]);
	assert.equal(button.title, 'フォロー');
	bar.dispose();
});

test('フォローに失敗したら書き戻さない', async () => {
	const { followContainer, bar, patched } = setup({
		actions: { followUser: async () => { throw new Error('500'); } },
	});
	bar.render(DETAIL);
	await settle();
	await followContainer.children[0].dispatch('click');
	assert.deepEqual(patched, []);
	assert.equal(followContainer.children[0].title, 'フォロー');
	bar.dispose();
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

test('ログインが切れていたら (401) 再読み込みまで案内する', async () => {
	// __NEXT_DATA__ は SPA 遷移で更新されない。(SITE_SPEC §0)
	// 別タブでログインし直しても古い CSRF トークンを読むので、押し直しでは復帰できない
	const unauthorized = new PixivError(PIXIV_ERROR_KINDS.UNAUTHORIZED, '401', 401);
	const { bar, like, container } = setup({ actions: { likeIllust: async () => { throw unauthorized; } } });
	bar.render(DETAIL);
	await like().dispatch('click');
	const status = find(container, '.action-status');
	assert.equal(status.textContent, 'ログインが切れています。pixiv にログインし直し、このページを再読み込みしてください');
	assert.equal(status.getAttribute('data-kind'), 'error');
	bar.dispose();
});

test('自分の作品ではカウンタを差し替えずフォローも出さない', () => {
	// 自分にはいいね・ブックマーク・フォローのどれもできない。
	// pixiv 本体も自分の作品では 3 つとも描かない。(SITE_SPEC §4)
	// 押せば必ず失敗するボタンを出さないのが正しい
	clearSessionCache();
	const container = fakeCounts();
	const followContainer = fakeElement('div');
	const calls = [];
	const bar = createActionsBar({
		doc: fakeDocWith({
			nextData: buildNextData({ token: 'csrf-token', self: { id: DETAIL.userId, xRestrict: 1 } }),
		}),
		container,
		followContainer,
		// 呼ばれたら「自分かどうか」を見ずにフォロー状態を引きに行っている
		fetchUser: async (userId) => { calls.push(userId); return { isFollowed: false }; },
		strings: STRINGS,
	});
	bar.render(DETAIL);
	// 件数は読めるままにする (未ログインのときと同じ扱い)
	assert.equal(container.querySelector('.count-like').tag, 'span');
	assert.equal(container.querySelector('.count-bookmark').tag, 'span');
	assert.equal(followContainer.children.length, 0);
	// 押せるものが無いので、結果を読み上げる領域も作らない
	assert.equal(find(container, '.action-status'), null);
	// 自分の作品なら /ajax/user も引かない
	assert.deepEqual(calls, []);
	bar.dispose();
	clearSessionCache();
});

test('他人の作品なら self.id があってもボタンを出す', () => {
	// 判定は ID の一致だけ。ログイン済みなら他人の作品はこれまでどおり押せる
	clearSessionCache();
	const container = fakeCounts();
	const followContainer = fakeElement('div');
	const bar = createActionsBar({
		doc: fakeDocWith({
			nextData: buildNextData({ token: 'csrf-token', self: { id: '16343044', xRestrict: 1 } }),
		}),
		container,
		followContainer,
		fetchUser: async () => ({ isFollowed: false }),
		patchUser: () => {},
		strings: STRINGS,
	});
	bar.render(DETAIL);
	assert.equal(container.querySelector('.count-like').tag, 'button');
	assert.equal(followContainer.children.length, 1);
	bar.dispose();
	clearSessionCache();
});
