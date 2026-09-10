import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComment, renderCommentText, renderStamp } from '../../src/content/viewer/comments.js';

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
		appendChild(child) { element.children.push(child); return child; },
		append(...nodes) { for (const node of nodes) element.appendChild(node); },
		setAttribute(name, value) { element.attributes[name] = value; },
		addEventListener(type, handler) { (element.listeners[type] ??= []).push(handler); },
		replaceWith(...nodes) { element.replacedWith = nodes; },
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) { text = value; element.children = []; },
	});
	return element;
}

/**
 * document の代わり。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return {
		createElement: (tag) => fakeElement(tag),
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
