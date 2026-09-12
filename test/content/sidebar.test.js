import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, formatDate, splitComment, createSidebar } from '../../src/content/viewer/sidebar.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

test('formatCount は 3 桁区切りにする', () => {
	assert.equal(formatCount(2740), '2,740');
	assert.equal(formatCount(0), '0');
	assert.equal(formatCount(42852), '42,852');
});

test('formatCount は数値でない値を 0 として扱う', () => {
	assert.equal(formatCount(undefined), '0');
	assert.equal(formatCount(null), '0');
});

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

test('splitComment は空文字で空配列を返す', () => {
	assert.deepEqual(splitComment(''), []);
	assert.deepEqual(splitComment(null), []);
});

/**
 * class 名と親子関係だけを持つ最小の要素の代わり。
 * ここで確かめたいのは「どの順で何を積んだか」だけなので、これで足りる。
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function fakeElement(tag) {
	let text = '';
	const element = {
		tag,
		children: [],
		className: '',
		attributes: {},
		innerHTML: '',
		style: {},
		src: '',
		href: '',
		type: '',
		title: '',
		hidden: false,
		focus() {},
		appendChild(child) { element.children.push(child); return child; },
		append(...nodes) { for (const node of nodes) element.appendChild(node); },
		setAttribute(name, value) { element.attributes[name] = String(value); },
		getAttribute(name) { return element.attributes[name] ?? null; },
		removeAttribute(name) { delete element.attributes[name]; },
		listeners: {},
		addEventListener(type, handler) { element.listeners[type] = handler; },
		removeEventListener() {},
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) { text = value; element.children = []; },
	});
	return element;
}

/**
 * document の代わり。要素を作る役だけを持つ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return {
		addEventListener() {},
		removeEventListener() {},
		createElement: (tag) => fakeElement(tag),
		createElementNS: (_ns, tag) => fakeElement(tag),
		createDocumentFragment: () => fakeElement('#fragment'),
		createTextNode: (value) => {
			const node = fakeElement('#text');
			node.textContent = value;
			return node;
		},
	};
}

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
	assert.deepEqual(author.children.map((child) => child.className), ['author-avatar', 'author-identity']);
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
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(avatarOf(container).src, image);
	assert.equal(avatarOf(container).attributes.alt, '');
});

test('CDN 以外を指すアイコンは読み込まず枠だけ残す', async () => {
	// 応答の値をそのまま外部オリジンへのリクエストにしない
	const { container, sidebar } = build({ fetchUser: async () => ({ image: 'https://example.com/a.png' }) });
	sidebar.render(DETAIL);
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(avatarOf(container).src, '');
	assert.equal(avatarOf(container).style.visibility, 'hidden');
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
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(avatarOf(container).src, '');
});

test('取得に失敗してもサイドバーは壊れない', async () => {
	const { container, sidebar } = build({ fetchUser: async () => { throw new Error('落ちた'); } });
	sidebar.render(DETAIL);
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(avatarOf(container).style.visibility, 'hidden');
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
	row.children[1].children[0].listeners.click();
	assert.equal(sidebar.consumeEscape(), true);
	assert.equal(sidebar.consumeEscape(), false);
});

/**
 * createIcon が描いた svg から図形の名前を割り出す。
 * 偽の要素は innerHTML を覚えるだけなので、図形データと突き合わせて名前へ戻す。
 * @param {object} icon svg の代わり
 * @returns {string|undefined} ICON_SHAPES のキー
 */
function iconName(icon) {
	return Object.keys(ICON_SHAPES).find((name) => ICON_SHAPES[name].markup === icon.innerHTML);
}

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
