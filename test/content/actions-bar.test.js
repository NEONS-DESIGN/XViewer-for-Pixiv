import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	bookmarkLabel,
	likeLabel,
	followLabel,
	createActionsBar,
	clearFollowCache,
} from '../../src/content/viewer/actions-bar.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

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

/**
 * classList と replaceChild まで持つ要素の代わり。
 * アクションバーはボタンの見た目を後から差し替えるので、そこまで再現する。
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function fakeElement(tag) {
	let text = '';
	const classes = new Set();
	const element = {
		tag,
		children: [],
		attributes: {},
		innerHTML: '',
		disabled: false,
		title: '',
		className: '',
		classList: {
			add: (name) => classes.add(name),
			remove: (name) => classes.delete(name),
			toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
			contains: (name) => classes.has(name),
		},
		listeners: {},
		appendChild(child) { element.children.push(child); return child; },
		append(...nodes) { for (const node of nodes) element.appendChild(node); },
		replaceChild(next, previous) {
			const at = element.children.indexOf(previous);
			if (at >= 0) element.children[at] = next;
			return previous;
		},
		setAttribute(name, value) { element.attributes[name] = value; },
		getAttribute(name) { return element.attributes[name] ?? null; },
		removeAttribute(name) { delete element.attributes[name]; },
		addEventListener(type, handler) { element.listeners[type] = handler; },
		querySelector(selector) {
			const tagName = selector.replace(/^\./, '');
			return element.children.find((child) => (
				selector.startsWith('.') ? child.className === tagName : child.tag === tagName
			)) ?? null;
		},
	};
	Object.defineProperty(element, 'textContent', {
		get() { return text; },
		set(value) { text = value; element.children = []; },
	});
	return element;
}

/**
 * ログイン済みの __NEXT_DATA__ を返す document の代わり。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const nextData = JSON.stringify({
		props: {
			pageProps: {
				isLoggedIn: true,
				serverSerializedPreloadedState: JSON.stringify({
					api: { token: 'csrf-token' },
					userData: { self: { xRestrict: 1, hideAiWorks: false } },
				}),
			},
		},
	});
	return {
		getElementById: () => ({ textContent: nextData }),
		createElement: (tag) => fakeElement(tag),
		createElementNS: (_ns, tag) => fakeElement(tag),
	};
}

/** アクションバーへ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149425016',
	userId: '54734418',
	likedByMe: false,
	bookmarkId: null,
});

/**
 * createIcon が描いた svg から図形の名前を割り出す。
 * @param {object} icon svg の代わり
 * @returns {string|undefined} ICON_SHAPES のキー
 */
function iconName(icon) {
	return Object.keys(ICON_SHAPES).find((name) => ICON_SHAPES[name].markup === icon.innerHTML);
}

/**
 * 描画先ひとそろいとアクションバーを用意する。
 * @param {(userId: string) => Promise<object>} fetchUser ユーザー情報の取得
 * @returns {{container: object, followContainer: object, bar: object}} 描画先とバー
 */
function setup(fetchUser) {
	clearFollowCache();
	const container = fakeElement('div');
	const followContainer = fakeElement('div');
	const bar = createActionsBar({ doc: fakeDoc(), container, followContainer, fetchUser });
	return { container, followContainer, bar };
}

test('いいねは顔、ブックマークはハートのアイコンで描く', () => {
	// pixiv 本体と逆にすると意味が入れ替わって見える
	const { container, bar } = setup(async () => ({ isFollowed: false }));
	bar.render(DETAIL);
	const buttons = container.children.filter((child) => child.tag === 'button');
	assert.deepEqual(buttons.map((button) => iconName(button.children[0])), ['like', 'favorite']);
	bar.dispose();
});

test('フォローボタンは作者行の枠へ描く', () => {
	const { container, followContainer, bar } = setup(async () => ({ isFollowed: false }));
	bar.render(DETAIL);
	// いいね・ブックマークと同じ列に並べない
	assert.equal(container.children.filter((child) => child.tag === 'button').length, 2);
	assert.equal(followContainer.children.length, 1);
	assert.equal(followContainer.children[0].className, 'action action-follow');
	bar.dispose();
});

test('フォローボタンは状態が分かるまで押せない', () => {
	const { followContainer, bar } = setup(() => new Promise(() => {}));
	bar.render(DETAIL);
	const button = followContainer.children[0];
	assert.equal(button.disabled, true);
	assert.equal(button.getAttribute('aria-busy'), 'true');
	bar.dispose();
});

test('フォロー済みなら「フォロー中」で描き直す', async () => {
	const { followContainer, bar } = setup(async () => ({ isFollowed: true }));
	bar.render(DETAIL);
	await new Promise((resolve) => setTimeout(resolve, 0));
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
	const { bar } = setup(fetchUser);
	bar.render(DETAIL);
	await new Promise((resolve) => setTimeout(resolve, 0));
	bar.dispose();

	// 同じ作者の別の作品へ移っても取り直さない。ユーザーページでは作者が変わらない
	const container = fakeElement('div');
	const followContainer = fakeElement('div');
	const second = createActionsBar({ doc: fakeDoc(), container, followContainer, fetchUser });
	second.render({ ...DETAIL, id: '149425017' });
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(calls, 1);
	assert.equal(followContainer.children[0].title, 'フォロー中');
	second.dispose();
});

test('フォロー状態を取れなくてもボタンは押せる状態に戻す', async () => {
	const { followContainer, bar } = setup(async () => { throw new Error('401'); });
	bar.render(DETAIL);
	await new Promise((resolve) => setTimeout(resolve, 0));
	const button = followContainer.children[0];
	assert.equal(button.disabled, false);
	assert.equal(button.title, 'フォロー');
	bar.dispose();
});
