import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImagePane } from '../../src/content/viewer/image-pane.js';
import { createSidebar } from '../../src/content/viewer/sidebar.js';
import { renderWork, disposeAll } from '../../src/content/viewer/panes.js';

/**
 * class セレクタだけを解する最小の要素の代わり。
 * ペインが「自分が作った DOM を自分で片付ける」ことだけを確かめるので、
 * 親子関係と remove() が動けば足りる。
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function fakeElement(tag) {
	let text = '';
	const element = {
		tag,
		children: [],
		parent: null,
		className: '',
		appendChild(child) {
			child.parent = element;
			element.children.push(child);
			return child;
		},
		append(...nodes) {
			for (const node of nodes) element.appendChild(node);
		},
		remove() {
			if (!element.parent) return;
			element.parent.children = element.parent.children.filter((child) => child !== element);
			element.parent = null;
		},
		setAttribute() {},
		getAttribute() { return null; },
		addEventListener() {},
		removeEventListener() {},
		querySelectorAll(selector) { return findByClass(element, selector); },
		querySelector(selector) { return findByClass(element, selector)[0] ?? null; },
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) {
			text = value;
			// 実際の DOM と同じく、文字列を入れると子は消える
			element.children = [];
		},
	});
	return element;
}

/**
 * class セレクタの並びに合う子孫を集める。
 * @param {object} root 探す起点
 * @param {string} selector '.status, .frame' のような並び
 * @returns {object[]} 見つかった要素
 */
function findByClass(root, selector) {
	const classes = selector.split(',').map((part) => part.trim().replace(/^\./, ''));
	const found = [];
	const walk = (node) => {
		for (const child of node.children) {
			if (String(child.className).split(/\s+/).some((name) => classes.includes(name))) found.push(child);
			walk(child);
		}
	};
	walk(root);
	return found;
}

/**
 * document の代わり。要素を作る役だけを持つ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	return {
		// actions-bar が readSession で __NEXT_DATA__ を引く。未ログイン扱いで十分
		getElementById: () => null,
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

/** 未ログインのセッション。全年齢作品はこれでも見られる。 */
const ANONYMOUS = Object.freeze({ isLoggedIn: false, self: null });

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
	commentCount: 4,
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
	return { stage: fakeElement('div'), sidebar: fakeElement('div') };
}

test('画像ペインは dispose で自分の枠を DOM から外す', async () => {
	const container = fakeElement('div');
	const pane = createImagePane({
		doc: fakeDoc(),
		container,
		// 先読みを 0 にして Image を作らせない (node には Image が無い)
		settings: { imageQuality: 'regular', prefetch: 0 },
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
	const pane = createSidebar({ doc: fakeDoc(), container });
	pane.render(DETAIL);
	assert.ok(container.children.length > 0);

	pane.dispose();
	assert.equal(container.children.length, 0);
});

test('renderWork はサイドバーにコメント区画とアクションを作る', async () => {
	const { stage, sidebar } = fakeTargets();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc: fakeDoc(), stage, sidebar, onError: () => {} });

	assert.equal(sidebar.hidden, false);
	assert.ok(sidebar.querySelectorAll('.comments')[0].children.length > 0);
	assert.ok(sidebar.querySelectorAll('.actions')[0].children.length > 0);
	disposeAll();
});

test('サイドバーを OFF から ON へ戻すと hidden が下りる', async () => {
	// Task 17 で実際に壊れた組み合わせ。hidden を立てる側しか書いていなかったため、
	// 設定を戻して次の作品へ移ってもサイドバーが出てこなかった。
	// 判断 (planPanes) ではなく、毎回明示的に代入する renderWork 側を見る必要がある
	const { stage, sidebar } = fakeTargets();
	const doc = fakeDoc();
	const off = { ...SETTINGS, showSidebar: false };

	await renderWork(DETAIL, ANONYMOUS, off, { doc, stage, sidebar, onError: () => {} });
	assert.equal(sidebar.hidden, true);

	disposeAll();
	await renderWork(DETAIL, ANONYMOUS, SETTINGS, { doc, stage, sidebar, onError: () => {} });
	assert.equal(sidebar.hidden, false);
	disposeAll();
});

test('主役の描画を待つ間に古くなったらコメントとアクションを作らない', async () => {
	// 古い renderWork が再開して、新しい作品のサイドバーへ
	// 古い作品のコメントとアクションを差し込むのを防ぐ。
	// いいねは取り消せないので、対象を間違えると実害が出る
	const { stage, sidebar } = fakeTargets();
	let stale = false;
	const rendering = renderWork(DETAIL, ANONYMOUS, SETTINGS, {
		doc: fakeDoc(),
		stage,
		sidebar,
		onError: () => {},
		isStale: () => stale,
	});
	// 主役 (画像ペイン) の await の途中で別の作品へ移った
	stale = true;
	await rendering;

	// サイドバー自体と主役は描かれている。増えないのはコメントとアクションだけ
	assert.ok(sidebar.querySelectorAll('.title').length > 0);
	assert.equal(stage.querySelectorAll('.frame').length, 1);
	assert.equal(sidebar.querySelectorAll('.comments')[0].children.length, 0);
	assert.equal(sidebar.querySelectorAll('.actions')[0].children.length, 0);
	disposeAll();
});
