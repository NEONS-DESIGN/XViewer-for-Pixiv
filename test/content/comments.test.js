import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComment, renderCommentText, renderStamp, createComments } from '../../src/content/viewer/comments.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

/**
 * 要素の代わり。イベントの登録先と差し替え先を覚えるところが本物と違う。
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
		listeners: {},
		replacedWith: null,
		innerHTML: '',
		style: {},
		src: '',
		href: '',
		type: '',
		title: '',
		hidden: false,
		disabled: false,
		dataset: {},
		parent: null,
		appendChild(child) { child.parent = element; element.children.push(child); return child; },
		append(...nodes) { for (const node of nodes) element.appendChild(node); },
		setAttribute(name, value) { element.attributes[name] = String(value); },
		getAttribute(name) { return element.attributes[name] ?? null; },
		addEventListener(type, handler) { (element.listeners[type] ??= []).push(handler); },
		replaceWith(...nodes) { element.replacedWith = nodes; },
		remove() {
			if (!element.parent) return;
			element.parent.children = element.parent.children.filter((child) => child !== element);
			element.parent = null;
		},
		click() { for (const handler of [...(element.listeners.click ?? [])]) handler({}); },
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) { text = value; element.children = []; },
	});
	return element;
}

/**
 * createIcon が描いた svg から図形の名前を割り出す。
 * @param {object} icon svg の代わり
 * @returns {string|undefined} ICON_SHAPES のキー
 */
function iconName(icon) {
	return Object.keys(ICON_SHAPES).find((name) => ICON_SHAPES[name].markup === icon.innerHTML);
}

/**
 * class 名で子孫を 1 つ探す。
 * @param {object} node 起点
 * @param {string} className 探す class 名
 * @returns {object|null} 見つかった要素
 */
function find(node, className) {
	if (String(node.className).split(/\s+/).includes(className)) return node;
	for (const child of node.children ?? []) {
		const hit = find(child, className);
		if (hit) return hit;
	}
	return null;
}

/**
 * class 名で子孫をすべて集める。
 * @param {object} node 起点
 * @param {string} className 探す class 名
 * @returns {object[]} 見つかった要素
 */
function findAll(node, className) {
	const found = String(node.className).split(/\s+/).includes(className) ? [node] : [];
	for (const child of node.children ?? []) found.push(...findAll(child, className));
	return found;
}

/**
 * document の代わり。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return {
		createElement: (tag) => fakeElement(tag),
		createElementNS: (_ns, tag) => fakeElement(tag),
		createTextNode: (value) => {
			const node = fakeElement('#text');
			node.textContent = value;
			return node;
		},
	};
}

test('コメントを共通の形にする', () => {
	const raw = {
		userId: '92064764',
		userName: 'キーー',
		img: 'https://s.pximg.net/common/images/no_profile.png',
		id: '233674946',
		comment: 'タグに橘さんを入れるなwww',
		stampId: null,
		commentDate: '2026-09-10 09:20',
		hasReplies: false,
	};
	assert.deepEqual(normalizeComment(raw), {
		id: '233674946',
		userId: '92064764',
		userName: 'キーー',
		avatarUrl: 'https://s.pximg.net/common/images/no_profile.png',
		text: 'タグに橘さんを入れるなwww',
		date: '2026-09-10 09:20',
		isStamp: false,
		stampId: null,
		hasReplies: false,
	});
});

test('スタンプのコメントは stampId を持ち回る', () => {
	// SITE_SPEC 実測: スタンプのときは comment が空で stampId に文字列が入る
	const comment = normalizeComment({ id: '1', userId: '2', userName: 'x', img: '', comment: '', stampId: '304', commentDate: '', hasReplies: false });
	assert.equal(comment.isStamp, true);
	assert.equal(comment.stampId, '304');
	assert.equal(comment.text, '');
});

test('返信があるコメントに印を付ける', () => {
	const comment = normalizeComment({ id: '1', userId: '2', userName: 'x', img: '', comment: 'a', stampId: null, commentDate: '', hasReplies: true });
	assert.equal(comment.hasReplies, true);
});

test('削除されたユーザーでも落ちない', () => {
	const comment = normalizeComment({ id: '1', isDeletedUser: true, comment: 'a', commentDate: '' });
	assert.equal(comment.userName, '退会したユーザー');
});

test('絵文字を含まない本文は文字のまま並べる', () => {
	const nodes = renderCommentText(fakeDoc(), 'かわいい');
	assert.equal(nodes.length, 1);
	assert.equal(nodes[0].tag, '#text');
	assert.equal(nodes[0].textContent, 'かわいい');
});

test('本文の絵文字を画像にする', () => {
	const nodes = renderCommentText(fakeDoc(), 'すき(heaven)');
	assert.equal(nodes.length, 2);
	assert.equal(nodes[0].textContent, 'すき');
	assert.equal(nodes[1].tag, 'img');
	assert.equal(nodes[1].className, 'comment-emoji');
	assert.equal(nodes[1].attributes.src, 'https://s.pximg.net/common/images/emoji/104.png');
	// 読み上げでも何の絵文字か分かるようにする
	assert.equal(nodes[1].attributes.alt, '(heaven)');
});

test('絵文字の画像が読めなければ元の文字に戻す', () => {
	const nodes = renderCommentText(fakeDoc(), '(heaven)');
	const image = nodes[0];
	image.listeners.error[0]();
	assert.equal(image.replacedWith.length, 1);
	assert.equal(image.replacedWith[0].textContent, '(heaven)');
});

test('スタンプを画像にする', () => {
	const stamp = renderStamp(fakeDoc(), '304');
	assert.equal(stamp.tag, 'img');
	assert.equal(stamp.className, 'comment-stamp');
	assert.equal(stamp.attributes.src, 'https://s.pximg.net/common/images/stamp/generated-stamps/304_s.jpg');
	assert.equal(stamp.attributes.alt, 'スタンプ');
});

test('スタンプの画像が読めなければ文字で伝える', () => {
	const stamp = renderStamp(fakeDoc(), '304');
	stamp.listeners.error[0]();
	assert.equal(stamp.replacedWith[0].textContent, '[スタンプ]');
});

test('スタンプの ID が使えなければ画像を出さない', () => {
	// URL を組み立てられない値でも、コメントが 1 件消えたように見せない
	const stamp = renderStamp(fakeDoc(), '../evil');
	assert.equal(stamp.tag, 'span');
	assert.equal(stamp.textContent, '[スタンプ]');
});


/** ルートコメント 1 件の生データ。 */
const ROOT = Object.freeze({
	userId: '92064764',
	userName: 'キーー',
	img: 'https://s.pximg.net/common/images/no_profile.png',
	id: '233573595',
	comment: 'かわいい',
	stampId: null,
	commentDate: '2026-09-10 09:20',
	hasReplies: true,
});

/** 返信 1 件の生データ。 */
const REPLY = Object.freeze({
	userId: '1',
	userName: '作者',
	img: 'https://s.pximg.net/common/images/no_profile.png',
	id: '233573600',
	comment: 'ありがとう(heaven)',
	stampId: null,
	commentDate: '2026-09-10 10:00',
	commentRootId: '233573595',
	hasReplies: false,
});

/** コメント区画へ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({ id: '149425016', commentOff: false, commentCount: 1 });

/**
 * コメント区画を組み立てる。
 * @param {(url: string) => Promise<object>} fetchJson 取得の差し替え
 * @returns {{container: object, comments: object}} 描画先とコメント区画
 */
function build(fetchJson) {
	const container = fakeElement('div');
	const comments = createComments({ doc: fakeDoc(), container, fetchJson });
	return { container, comments };
}

test('「もっと見る」はスクロールする領域の中、一覧の後ろに置く', async () => {
	// 一番下まで読んだときだけ見えるようにする。外に置くと常に見えて不自然になる
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: true }));
	await comments.load(DETAIL);
	assert.deepEqual(container.children.map((child) => child.className), ['comments-heading', 'comment-scroll']);
	const scroll = container.children[1];
	assert.deepEqual(scroll.children.map((child) => child.className), ['comment-list', 'more']);
	assert.equal(scroll.children[1].hidden, false);
});

test('続きが無ければ「もっと見る」は出さない', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	assert.equal(find(container, 'more').hidden, true);
});

test('返信があるコメントだけが返信の開閉ボタンを持つ', async () => {
	const { container, comments } = build(async () => ({
		comments: [ROOT, { ...ROOT, id: '2', hasReplies: false }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	const buttons = findAll(container, 'comment-replies');
	assert.equal(buttons.length, 1);
	assert.equal(buttons[0].tag, 'button');
	assert.equal(buttons[0].children[1].textContent, '返信を表示');
	assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
});

test('返信を表示すると replies API を引いてぶら下げる', async () => {
	const asked = [];
	const { container, comments } = build(async (url) => {
		asked.push(url);
		if (url.includes('replies')) return { comments: [REPLY], hasNext: false };
		return { comments: [ROOT], hasNext: false };
	});
	await comments.load(DETAIL);
	find(container, 'comment-replies').click();
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(asked[1], '/ajax/illusts/comments/replies?comment_id=233573595&page=1&lang=ja');
	const list = find(container, 'comment-reply-list');
	assert.equal(list.children.length, 1);
	// 返信の本文もルートと同じ描き方 (絵文字は画像) にする
	assert.equal(find(list, 'comment-emoji').attributes.src, 'https://s.pximg.net/common/images/emoji/104.png');
	const toggle = find(container, 'comment-replies');
	assert.equal(toggle.children[1].textContent, '返信を隠す');
	assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('もう一度押すと返信を畳む', async () => {
	const { container, comments } = build(async (url) => (url.includes('replies')
		? { comments: [REPLY], hasNext: false }
		: { comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	const toggle = find(container, 'comment-replies');
	toggle.click();
	await Promise.resolve();
	await Promise.resolve();
	toggle.click();
	assert.equal(find(container, 'comment-reply-list'), null);
	assert.equal(toggle.children[1].textContent, '返信を表示');
	assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('返信に続きがあれば「返信をもっと見る」を出して次のページを足す', async () => {
	const asked = [];
	const { container, comments } = build(async (url) => {
		asked.push(url);
		if (!url.includes('replies')) return { comments: [ROOT], hasNext: false };
		return url.includes('page=1')
			? { comments: [REPLY], hasNext: true }
			: { comments: [{ ...REPLY, id: '233573601' }], hasNext: false };
	});
	await comments.load(DETAIL);
	find(container, 'comment-replies').click();
	await Promise.resolve();
	await Promise.resolve();
	const more = find(container, 'reply-more');
	assert.equal(more.textContent, '返信をもっと見る');
	more.click();
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(asked[2], '/ajax/illusts/comments/replies?comment_id=233573595&page=2&lang=ja');
	assert.equal(find(container, 'comment-reply-list').children.length, 2);
	assert.equal(find(container, 'reply-more'), null);
});

test('返信を読み込めなくてもコメントは読めるままにする', async () => {
	const { container, comments } = build(async (url) => {
		if (url.includes('replies')) throw new Error('落ちた');
		return { comments: [ROOT], hasNext: false };
	});
	await comments.load(DETAIL);
	const toggle = find(container, 'comment-replies');
	toggle.click();
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(find(container, 'reply-error').textContent, '返信を読み込めませんでした');
	// 押し直せる状態に戻す
	assert.equal(toggle.disabled, false);
	assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('返信の開閉ボタンは開いているかが分かるアイコンを持つ', async () => {
	// 文言だけだと押した結果が分かりにくい。向きで開閉を示す
	const { container, comments } = build(async (url) => (url.includes('replies')
		? { comments: [REPLY], hasNext: false }
		: { comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	const toggle = find(container, 'comment-replies');
	const mark = toggle.children[0];
	assert.equal(iconName(mark.children[0]), 'expandMore');
	toggle.click();
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(iconName(mark.children[0]), 'expandLess');
});

test('コメントの下段は返信ボタンが左、日時が右', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	const body = find(container, 'comment-body');
	assert.deepEqual(body.children.map((child) => child.className), ['comment-name', 'comment-text', 'comment-meta']);
	const meta = find(container, 'comment-meta');
	assert.deepEqual(meta.children.map((child) => child.className), ['comment-replies-slot', 'comment-date']);
	assert.equal(meta.children[0].children[0].className, 'comment-replies');
});

test('返信が無いコメントでも日時は同じ下段に置く', async () => {
	// 返信ボタンの有無で日時の位置が動くと、一覧が揃わない
	const { container, comments } = build(async () => ({
		comments: [{ ...ROOT, hasReplies: false }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	const meta = find(container, 'comment-meta');
	assert.deepEqual(meta.children.map((child) => child.className), ['comment-replies-slot', 'comment-date']);
	assert.equal(meta.children[0].children.length, 0);
});
