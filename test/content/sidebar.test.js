import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, splitComment, createSidebar } from '../../src/content/viewer/sidebar.js';
import { createAvatar, showAvatar } from '../../src/content/viewer/avatar.js';
import { fakeElement, fakeDoc, iconName, flush } from '../helpers/dom.js';

test('formatDate は日本語の日時にする', () => {
	// createDate は ISO 8601。タイムゾーンの表記が 2 種類あることを SITE_SPEC で確認済み
	assert.equal(formatDate('2026-09-08T17:45:00+09:00'), '2026年9月8日 17:45');
});

test('formatDate は実行環境のタイムゾーンに依らず JST で出す', () => {
	// UTC の深夜は JST では翌日。ここがローカル時刻だと閲覧地で表示が変わる
	assert.equal(formatDate('2026-09-09T15:30:00Z'), '2026年9月10日 00:30');
	assert.equal(formatDate('2026-01-01T00:05:00Z'), '2026年1月1日 09:05');
});

test('formatDate は読めない値で空文字を返す', () => {
	assert.equal(formatDate('よくわからない'), '');
	assert.equal(formatDate(''), '');
});

test('splitComment は br で分割する', () => {
	assert.deepEqual(
		splitComment('1行目<br />2行目<br>3行目'),
		[[{ type: 'text', value: '1行目' }], [{ type: 'text', value: '2行目' }], [{ type: 'text', value: '3行目' }]],
	);
});

test('splitComment は a タグをリンクとして取り出す', () => {
	const lines = splitComment('見て<a href="https://example.com/x" target="_blank">ここ</a>ね');
	assert.deepEqual(lines, [[
		{ type: 'text', value: '見て' },
		{ type: 'link', value: 'ここ', href: 'https://example.com/x' },
		{ type: 'text', value: 'ね' },
	]]);
});

test('splitComment は javascript: と data: のリンクを本文として扱う', () => {
	// 外部由来の HTML なので、危険なスキームはリンクにしない
	assert.deepEqual(
		splitComment('<a href="javascript:alert(1)">押して</a>'),
		[[{ type: 'text', value: '押して' }]],
	);
	assert.deepEqual(
		splitComment('<a href="data:text/html,x">押して</a>'),
		[[{ type: 'text', value: '押して' }]],
	);
});

test('splitComment は相対リンクを pixiv の絶対 URL にして残す', () => {
	// 投稿文の中の /users/123 のような内部リンクを本文へ落とさない
	assert.deepEqual(
		splitComment('作者は<a href="/users/123">この人</a>'),
		[[
			{ type: 'text', value: '作者は' },
			{ type: 'link', value: 'この人', href: 'https://www.pixiv.net/users/123' },
		]],
	);
});

test('splitComment は実体参照を戻す', () => {
	assert.deepEqual(splitComment('a&amp;b&lt;c&gt;d&quot;e&#39;f'), [[{ type: 'text', value: 'a&b<c>d"e\'f' }]]);
});

test('splitComment は数値参照を 10 進でも 16 進でも戻す', () => {
	// pixiv が返す範囲を実測で固定できていないので、&#39; 以外の数値参照も生のまま出さない
	assert.deepEqual(splitComment('&#x27;a&#8217;b&#X1F600;'), [[{ type: 'text', value: '\'a’b\u{1F600}' }]]);
});

test('splitComment は二重に符号化された参照を 1 段だけ戻す', () => {
	// &amp;#39; は「&#39; という文字列」の意味。名前付きを先に戻すともう一度戻ってしまう
	assert.deepEqual(splitComment('&amp;#39;'), [[{ type: 'text', value: '&#39;' }]]);
});

test('splitComment は符号位置として不正な数値参照をそのまま残す', () => {
	assert.deepEqual(splitComment('&#1114112;'), [[{ type: 'text', value: '&#1114112;' }]]);
});

test('splitComment は空文字で空配列を返す', () => {
	assert.deepEqual(splitComment(''), []);
	assert.deepEqual(splitComment(null), []);
});

/** サイドバーへ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149425016',
	userId: '54734418',
	userName: '作者',
	title: 'タイトル',
	comment: '本文',
	tags: ['オリジナル'],
	likeCount: 1,
	bookmarkCount: 2,
	viewCount: 3,
	commentCount: 4,
	createDate: '2026-09-08T17:45:00+09:00',
});

/** アバターを返さない fetchUser の代わり。テストから通信させないために既定で差し込む。 */
const NO_USER = async () => ({});

/**
 * サイドバーを組み立てる。
 * @param {object} [overrides] 依存の差し替え
 * @returns {{container: object, sidebar: object}} 描画先とサイドバー
 */
function build(overrides = {}) {
	const container = fakeElement('div');
	const sidebar = createSidebar({ doc: fakeDoc(), container, fetchUser: NO_USER, ...overrides });
	return { container, sidebar };
}

/**
 * 作者行のアイコンを取り出す。
 * @param {object} container 描画先
 * @returns {object} img の代わり
 */
function avatarOf(container) {
	return container.children[0].children[0].children[0].children[0];
}

test('サイドバーは作品情報とコメントを別の入れ物に分ける', () => {
	// スクロールするのはコメント一覧だけにしたいので、縦の領域をこの 2 つで分け合う
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	assert.deepEqual(container.children.map((child) => child.className), ['sidebar-info', 'comments']);
});

test('作品情報は作者行・読み物・日時・カウンタ・リンクの順に積む', () => {
	// いいね等のボタンがタイトルと投稿文の間に挟まると読む流れが切れる。
	// 操作用の独立した列は持たない。押せるのはカウンタ自身 (actions-bar が差し替える)。
	// 投稿日時はタグの下・カウンタの罫線の上に置く
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	assert.deepEqual(
		container.children[0].children.map((child) => child.className),
		['author-row', 'title', 'comment', 'tags', 'date', 'counts', 'link-row'],
	);
});

test('作者行はアイコン・名前・ユーザー ID・フォロー用の枠を同じ行に持つ', () => {
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	const row = container.children[0].children[0];
	assert.deepEqual(row.children.map((child) => child.className), ['author', 'follow-slot']);
	const author = row.children[0];
	assert.equal(author.href, '/users/54734418');
	// アイコンは取れるまで is-pending 付き (枠だけ)
	assert.deepEqual(author.children.map((child) => child.className), ['author-avatar is-pending', 'author-identity']);
	assert.deepEqual(
		author.children[1].children.map((child) => [child.className, child.textContent]),
		[['author-name', '作者'], ['author-id', 'ID: 54734418']],
	);
	// フォローボタンは actions ではなくこの枠へ差し込む
	assert.equal(sidebar.followSlot(), row.children[1]);
});

test('作者のアイコンは /ajax/user の image を CDN の関門に通して入れる', async () => {
	const image = 'https://i.pximg.net/user-profile/img/2020/01/01/00/00/00/1_170.jpg';
	const { container, sidebar } = build({ fetchUser: async () => ({ image }) });
	sidebar.render(DETAIL);
	await flush();
	assert.equal(avatarOf(container).src, image);
	assert.equal(avatarOf(container).attributes.alt, '');
});

test('作者のアイコンは取れるまで is-pending で枠だけにする', async () => {
	// 見た目の切り替えはインライン style ではなくクラスで持つ (他の状態と同じ流儀)
	const { container, sidebar } = build({ fetchUser: () => new Promise(() => {}) });
	sidebar.render(DETAIL);
	assert.equal(avatarOf(container).classList.contains('is-pending'), true);
	assert.equal(avatarOf(container).style.visibility, undefined);
});

test('作者のアイコンが取れたら is-pending を外す', async () => {
	const { container, sidebar } = build({
		fetchUser: async () => ({ image: 'https://i.pximg.net/user-profile/img/x_170.jpg' }),
	});
	sidebar.render(DETAIL);
	await flush();
	assert.equal(avatarOf(container).classList.contains('is-pending'), false);
});

test('CDN 以外を指すアイコンは読み込まず枠だけ残す', async () => {
	// 応答の値をそのまま外部オリジンへのリクエストにしない
	const { container, sidebar } = build({ fetchUser: async () => ({ image: 'https://example.com/a.png' }) });
	sidebar.render(DETAIL);
	await flush();
	assert.equal(avatarOf(container).src, '');
	assert.equal(avatarOf(container).classList.contains('is-pending'), true);
});

test('createAvatar は装飾扱いの img を is-pending 付きで作り、読み込み失敗でも枠だけ残す', async () => {
	// コメント一覧の投稿者アイコンも同じ形なので、共有できるよう外に出してある
	const avatar = createAvatar(fakeDoc(), 'comment-avatar');
	assert.equal(avatar.tag, 'img');
	assert.equal(avatar.className, 'comment-avatar is-pending');
	assert.equal(avatar.attributes.alt, '');
	assert.equal(showAvatar(avatar, 'https://i.pximg.net/user-profile/img/y_170.jpg'), true);
	assert.equal(avatar.classList.contains('is-pending'), false);
	await avatar.dispatch('error');
	assert.equal(avatar.classList.contains('is-pending'), true);
});

test('showAvatar は CDN 以外の URL を入れない', () => {
	const avatar = createAvatar(fakeDoc(), 'comment-avatar');
	assert.equal(showAvatar(avatar, 'https://example.com/a.png'), false);
	assert.equal(showAvatar(avatar, null), false);
	assert.equal(avatar.src, '');
	assert.equal(avatar.classList.contains('is-pending'), true);
});

test('取得を待っている間に描き直したら、前の作者のアイコンを入れない', async () => {
	let resolveFirst;
	const fetchUser = (userId) => (userId === '54734418'
		? new Promise((resolve) => { resolveFirst = resolve; })
		: Promise.resolve({}));
	const { container, sidebar } = build({ fetchUser });
	sidebar.render(DETAIL);
	sidebar.render({ ...DETAIL, userId: '999', userName: '別の作者' });
	resolveFirst({ image: 'https://i.pximg.net/user-profile/img/x_170.jpg' });
	await flush();
	assert.equal(avatarOf(container).src, '');
});

test('取得に失敗してもサイドバーは壊れない', async () => {
	const { container, sidebar } = build({ fetchUser: async () => { throw new Error('落ちた'); } });
	sidebar.render(DETAIL);
	await flush();
	assert.equal(avatarOf(container).classList.contains('is-pending'), true);
});

test('リンク行は作品ページへのリンクとシェアボタンを並べる', () => {
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	const row = container.children[0].children.find((child) => child.className === 'link-row');
	assert.deepEqual(row.children.map((child) => child.className), ['original-link', 'share-wrap']);
	const link = row.children[0];
	assert.equal(link.children[0].textContent, '作品ページを開く');
	assert.equal(link.href, '/artworks/149425016');
	assert.equal(link.attributes.target, '_blank');
	assert.equal(link.attributes.rel, 'noopener noreferrer');
});

test('consumeEscape はシェアメニューが開いているときだけ食い止める', () => {
	// ビュワー本体の Escape より先に呼ばれる。開いていなければ本体に譲る
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	assert.equal(sidebar.consumeEscape(), false);
	const row = container.children[0].children.find((child) => child.className === 'link-row');
	row.children[1].children[0].click();
	assert.equal(sidebar.consumeEscape(), true);
	assert.equal(sidebar.consumeEscape(), false);
});

test('consumeKey はシェアメニューが開いているときだけ上下キーと Escape を食い止める', () => {
	// 開いたメニューで下キーを押して、本体が次の作品へ移ってはいけない
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	const down = { key: 'ArrowDown', preventDefault() {} };
	assert.equal(sidebar.consumeKey(down), false);
	const row = container.children[0].children.find((child) => child.className === 'link-row');
	row.children[1].children[0].click();
	assert.equal(sidebar.consumeKey(down), true);
	// 左右キーはメニューが使わないので本体へ渡す
	assert.equal(sidebar.consumeKey({ key: 'ArrowLeft', preventDefault() {} }), false);
	assert.equal(sidebar.consumeKey({ key: 'Escape', preventDefault() {} }), true);
	assert.equal(sidebar.consumeKey(down), false);
});

test('カウンタはいいねを顔、ブックマークをハートで示す', () => {
	// pixiv 本体と同じ対応にする。逆にすると意味が入れ替わって見える
	const { container, sidebar } = build();
	sidebar.render(DETAIL);
	const counts = container.children[0].children.find((child) => child.className === 'counts');
	assert.deepEqual(
		counts.children.map((count) => iconName(count.children[0])),
		['like', 'favorite', 'visibility', 'comment'],
	);
});

test('押せないカウンタは何の数字かを隠し文字で持ち、aria-label に頼らない', () => {
	// role の無い span の aria-label は読み上げに届かない (ARIA 1.2)。
	// 「いいね 2,740」と読まれるよう、名前を視覚的に隠した文字として置く
	const { sidebar } = build();
	sidebar.render(DETAIL);
	const counts = sidebar.countsSlot().children;
	assert.deepEqual(
		counts.map((count) => count.children.map((child) => child.className)),
		Array(4).fill(['', 'visually-hidden', '']),
	);
	assert.deepEqual(
		counts.map((count) => count.textContent),
		['いいね 1', 'ブックマーク 2', '閲覧数 3', 'コメント 4'],
	);
	assert.equal(counts[2].title, '閲覧数 3');
	assert.equal(counts[2].getAttribute('aria-label'), null);
});

test('いいねとブックマークのカウンタには差し替え用の印が付く', () => {
	// actions-bar がこの印を頼りに、押せるボタンへ差し替える
	const { sidebar } = build();
	sidebar.render(DETAIL);
	assert.deepEqual(
		sidebar.countsSlot().children.map((count) => count.className),
		['count count-like', 'count count-bookmark', 'count', 'count'],
	);
});

test('dispose はスロットの参照も手放す', () => {
	const { sidebar } = build();
	sidebar.render(DETAIL);
	sidebar.dispose();
	assert.equal(sidebar.followSlot(), null);
	assert.equal(sidebar.countsSlot(), null);
	assert.equal(sidebar.commentsSlot(), null);
});
