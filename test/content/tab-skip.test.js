import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSkipTargets, attachTabSkip } from '../../src/content/tab-skip.js';
import { GRID_TAB_SKIP } from '../../src/common/constants.js';

/**
 * 要素の代わり。属性の読み書きだけを持つ。
 * @param {string} tagName タグ名 (大文字)
 * @param {Record<string, string>} [attrs] 初期の属性
 * @param {string} [textContent] 文字列
 * @returns {object} 要素の代わり
 */
function fakeEl(tagName, attrs = {}, textContent = '') {
	return {
		tagName,
		textContent,
		attrs: { ...attrs },
		getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
		setAttribute(name, value) { this.attrs[name] = String(value); },
		removeAttribute(name) { delete this.attrs[name]; },
		hasAttribute(name) { return name in this.attrs; },
	};
}

/**
 * 作品カード (li) の代わり。
 * 受け取るセレクタは作品リンクと button の 2 種類だけを解釈する。
 * @param {object[]} children カードの中の要素
 * @returns {object} カードの代わり
 */
function fakeCard(children) {
	return {
		tagName: 'LI',
		children,
		querySelectorAll(selector) {
			if (selector === 'button') return children.filter((el) => el.tagName === 'BUTTON');
			return children.filter((el) => el.tagName === 'A' && String(el.getAttribute('href')).startsWith('/artworks/'));
		},
	};
}

/**
 * 作品カードの代わりを 1 枚作る。実測どおり「サムネ → ブックマーク → タイトル」の並び。
 * 中の要素は closest('li') で自分のカードへ戻れる (attachTabSkip がカードを引くため)。
 * @param {string} [id] 作品 ID
 * @returns {{card: object, thumb: object, button: object, title: object}}
 */
function makeCard(id = '1') {
	const thumb = fakeEl('A', { href: `/artworks/${id}` });
	const button = fakeEl('BUTTON', { type: 'button' });
	const title = fakeEl('A', { href: `/artworks/${id}` }, `作品${id}`);
	const card = fakeCard([thumb, button, title]);
	for (const el of [thumb, button, title]) el.closest = (selector) => (selector === 'li' ? card : null);
	return { card, thumb, button, title };
}

test('both はタイトルリンクとブックマークボタンを外す', () => {
	const { card, thumb, button, title } = makeCard();
	const targets = planSkipTargets(card, GRID_TAB_SKIP.BOTH);
	assert.equal(targets.includes(title), true, 'タイトルリンクが対象に入っていない');
	assert.equal(targets.includes(button), true, 'ブックマークボタンが対象に入っていない');
	assert.equal(targets.includes(thumb), false, 'サムネイルを外してはいけない');
});

test('title はタイトルリンクだけを外す', () => {
	const { card, thumb, button, title } = makeCard();
	const targets = planSkipTargets(card, GRID_TAB_SKIP.TITLE);
	assert.deepEqual(targets, [title]);
	assert.equal(targets.includes(button), false);
	assert.equal(targets.includes(thumb), false);
});

test('none は何も外さない', () => {
	const { card } = makeCard();
	assert.deepEqual(planSkipTargets(card, GRID_TAB_SKIP.NONE), []);
});

test('知らない指定は何も外さない', () => {
	const { card } = makeCard();
	assert.deepEqual(planSkipTargets(card, 'よくわからない'), []);
});

test('リンクが 1 本だけのカードではサムネイルを外さない', () => {
	// タイトルを持たない置き方をされても、サムネイルまで飛ばしては開けなくなる
	const thumb = fakeEl('A', { href: '/artworks/9' });
	const button = fakeEl('BUTTON', {});
	const card = fakeCard([thumb, button]);
	assert.deepEqual(planSkipTargets(card, GRID_TAB_SKIP.BOTH), [button]);
});

/**
 * document の代わり。作品リンクと目印付きの要素を引ける。
 * @param {object[]} cards makeCard の戻り値の配列
 * @returns {object} doc の代わり
 */
function fakeDoc(cards) {
	return {
		body: { nodeName: 'BODY' },
		cards,
		querySelectorAll(selector) {
			const all = this.cards.flatMap((c) => c.card.children);
			if (selector.startsWith('[')) {
				const name = selector.slice(1, -1);
				return all.filter((el) => el.hasAttribute(name));
			}
			return all.filter((el) => el.tagName === 'A' && String(el.getAttribute('href')).startsWith('/artworks/'));
		},
	};
}

/**
 * MutationObserver の代わりを差し込む deps を作る。
 * @returns {{deps: object, trigger: () => void, disconnected: () => boolean}}
 */
function fakeObserverDeps() {
	let callback = null;
	let disconnected = false;
	return {
		deps: {
			createObserver(fn) {
				callback = fn;
				return { observe() {}, disconnect() { disconnected = true; } };
			},
			// タイマを挟まず即座に走らせる
			schedule(fn) { fn(); return 1; },
			cancel() {},
		},
		trigger() { callback?.(); },
		disconnected() { return disconnected; },
	};
}

test('attachTabSkip はタイトルとブックマークをフォーカス順から外す', () => {
	const cards = [makeCard('1')];
	const { deps } = fakeObserverDeps();
	attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].title.getAttribute('tabindex'), '-1');
	assert.equal(cards[0].button.getAttribute('tabindex'), '-1');
	assert.equal(cards[0].thumb.getAttribute('tabindex'), null, 'サムネイルを外してはいけない');
});

test('attachTabSkip は元から tabindex を持つ要素に触らない', () => {
	const cards = [makeCard('1')];
	cards[0].title.setAttribute('tabindex', '0');
	const { deps } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].title.getAttribute('tabindex'), '0');
	handle.dispose();
	assert.equal(cards[0].title.getAttribute('tabindex'), '0', 'pixiv 側の値を消してしまった');
});

test('attachTabSkip の dispose で pixiv 標準のフォーカス順に戻る', () => {
	const cards = [makeCard('1')];
	const { deps, disconnected } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	handle.dispose();
	assert.equal(cards[0].title.getAttribute('tabindex'), null);
	assert.equal(cards[0].button.getAttribute('tabindex'), null);
	assert.equal(disconnected(), true, '監視が外れていない');
});

test('setMode(title) でブックマークだけフォーカス順に戻る', () => {
	const cards = [makeCard('1')];
	const { deps } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	handle.setMode(GRID_TAB_SKIP.TITLE);
	assert.equal(cards[0].button.getAttribute('tabindex'), null);
	assert.equal(cards[0].title.getAttribute('tabindex'), '-1');
});

test('setMode(none) で全部フォーカス順に戻る', () => {
	const cards = [makeCard('1')];
	const { deps } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	handle.setMode(GRID_TAB_SKIP.NONE);
	assert.equal(cards[0].title.getAttribute('tabindex'), null);
	assert.equal(cards[0].button.getAttribute('tabindex'), null);
});

test('タイトルを外すときはサムネイルに作品名を補う', () => {
	// タイトルのリンクを飛ばすと読み上げから作品名が消えるため
	const cards = [makeCard('7')];
	const { deps } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].thumb.getAttribute('aria-label'), '作品7');
	handle.dispose();
	assert.equal(cards[0].thumb.getAttribute('aria-label'), null);
});

test('サムネイルが元から aria-label を持っていれば触らない', () => {
	const cards = [makeCard('7')];
	cards[0].thumb.setAttribute('aria-label', 'pixiv がつけた名前');
	const { deps } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].thumb.getAttribute('aria-label'), 'pixiv がつけた名前');
	handle.dispose();
	assert.equal(cards[0].thumb.getAttribute('aria-label'), 'pixiv がつけた名前');
});

test('カードが見つからないリンクがあっても例外を投げない', () => {
	const cards = [makeCard('1')];
	cards[0].thumb.closest = () => null;
	cards[0].title.closest = () => null;
	const { deps } = fakeObserverDeps();
	assert.doesNotThrow(() => attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps));
});

test('後から増えたカードにも当たる', () => {
	// 無限スクロールで追加される分。MutationObserver の通知で追いかける
	const doc = fakeDoc([makeCard('1')]);
	const { deps, trigger } = fakeObserverDeps();
	attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	const added = makeCard('2');
	doc.cards.push(added);
	trigger();
	assert.equal(added.title.getAttribute('tabindex'), '-1');
	assert.equal(added.button.getAttribute('tabindex'), '-1');
});

test('none のときは DOM の変化で当て直しを予約しない', () => {
	// 何も外さない設定で、無限スクロールの再描画ごとに空振りのタイマを積まないため
	const doc = fakeDoc([makeCard('1')]);
	let scheduled = 0;
	const deps = {
		createObserver(fn) { deps.callback = fn; return { observe() {}, disconnect() {} }; },
		schedule(fn) { scheduled += 1; fn(); return 1; },
		cancel() {},
	};
	const handle = attachTabSkip(doc, GRID_TAB_SKIP.NONE, deps);
	deps.callback();
	assert.equal(scheduled, 0);
	handle.setMode(GRID_TAB_SKIP.BOTH);
	deps.callback();
	assert.equal(scheduled, 1);
});

test('予約が発火する前の DOM の変化は 1 回の当て直しにまとめる', () => {
	const doc = fakeDoc([makeCard('1')]);
	const queued = [];
	const deps = {
		createObserver(fn) { deps.callback = fn; return { observe() {}, disconnect() {} }; },
		schedule(fn) { queued.push(fn); return queued.length; },
		cancel() {},
	};
	attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	deps.callback();
	deps.callback();
	assert.equal(queued.length, 1);
	// 発火したら次の変化でまた予約できる
	queued[0]();
	deps.callback();
	assert.equal(queued.length, 2);
});
