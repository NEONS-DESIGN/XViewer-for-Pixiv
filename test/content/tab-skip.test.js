import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSkipTargets, attachTabSkip } from '../../src/content/tab-skip.js';
import { GRID_TAB_SKIP, TAB_SKIP_MARK_ATTR, TAB_SKIP_LABEL_ATTR } from '../../src/common/constants.js';

/**
 * 要素の代わり。属性の読み書きと、子の img を引く口だけを持つ。
 * @param {string} tagName タグ名 (大文字)
 * @param {Record<string, string>} [attrs] 初期の属性
 * @param {string} [textContent] 文字列
 * @param {object[]} [children] 子 (サムネリンクの中の img など)
 * @returns {object} 要素の代わり
 */
function fakeEl(tagName, attrs = {}, textContent = '', children = []) {
	return {
		tagName,
		textContent,
		attrs: { ...attrs },
		getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
		setAttribute(name, value) { this.attrs[name] = String(value); },
		removeAttribute(name) { delete this.attrs[name]; },
		hasAttribute(name) { return name in this.attrs; },
		querySelector(selector) { return children.find((el) => el.tagName === selector.toUpperCase()) ?? null; },
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
 * 中の要素は closest('li') で自分のカードへ戻れる。(attachTabSkip がカードを引くため)
 * @param {string} [id] 作品 ID
 * @param {{alt?: string}} [options] alt を渡すとサムネリンクの中に img を置く (実機はこちら。SITE_SPEC §3)
 * @returns {{card: object, thumb: object, button: object, title: object}}
 */
function makeCard(id = '1', options = {}) {
	const img = options.alt === undefined ? [] : [fakeEl('IMG', { alt: options.alt })];
	const thumb = fakeEl('A', { href: `/artworks/${id}` }, '', img);
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
		/** 全走査の回数。増えた部分木だけを見ているかを確かめる */
		scans: 0,
		querySelectorAll(selector) {
			this.scans += 1;
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
 * MutationObserver の通知 (records) の代わり。childList で増えたノードだけを持つ。
 * @param {object[]} added 増えたノード
 * @returns {object[]} records の代わり
 */
function addedRecords(added) {
	return [{ addedNodes: added, removedNodes: [] }];
}

/**
 * MutationObserver の代わりを差し込む deps を作る。
 * @returns {{deps: object, trigger: (...added: object[]) => void, disconnected: () => boolean}}
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
		trigger(...added) { callback?.(addedRecords(added)); },
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

test('サムネイルの img に alt が無いときだけ作品名を補う', () => {
	// タイトルのリンクを飛ばすと読み上げから作品名が消えるため。alt が空なら名前が無いので補う
	const cards = [makeCard('7', { alt: '' })];
	const { deps } = fakeObserverDeps();
	const handle = attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].thumb.getAttribute('aria-label'), '作品7');
	assert.equal(cards[0].thumb.hasAttribute(TAB_SKIP_LABEL_ATTR), true, '自分が足した目印が無い');
	handle.dispose();
	assert.equal(cards[0].thumb.getAttribute('aria-label'), null);
	assert.equal(cards[0].thumb.hasAttribute(TAB_SKIP_LABEL_ATTR), false);
});

test('img が無いサムネイル (未読込) にも作品名を補う', () => {
	// figure のままの間は alt が無い。読み上げ名が空になるよりは補う
	const cards = [makeCard('7')];
	const { deps } = fakeObserverDeps();
	attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].thumb.getAttribute('aria-label'), '作品7');
});

test('サムネイルの img に alt があれば aria-label を足さない', () => {
	// 実機の alt は「#タグ タイトル - 作者のイラスト」で作品名を含む。(SITE_SPEC §3)
	// aria-label を足すと alt 由来の名前を上書きし、タグと作者名が読み上げから消える
	const cards = [makeCard('7', { alt: '#タグ 作品7 - 作者のイラスト' })];
	const { deps } = fakeObserverDeps();
	attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].thumb.getAttribute('aria-label'), null);
	assert.equal(cards[0].thumb.hasAttribute(TAB_SKIP_LABEL_ATTR), false);
	// タイトルを飛ばす処理そのものは変わらない
	assert.equal(cards[0].title.getAttribute('tabindex'), '-1');
});

test('自分が足した tabindex には目印が付く', () => {
	// card-clone.js が雛形から印を落とすときの手掛かり
	const cards = [makeCard('1')];
	const { deps } = fakeObserverDeps();
	attachTabSkip(fakeDoc(cards), GRID_TAB_SKIP.BOTH, deps);
	assert.equal(cards[0].title.hasAttribute(TAB_SKIP_MARK_ATTR), true);
	assert.equal(cards[0].button.hasAttribute(TAB_SKIP_MARK_ATTR), true);
	assert.equal(cards[0].thumb.hasAttribute(TAB_SKIP_MARK_ATTR), false);
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
	trigger(added.card);
	assert.equal(added.title.getAttribute('tabindex'), '-1');
	assert.equal(added.button.getAttribute('tabindex'), '-1');
});

test('DOM の変化では増えた部分木だけを見て、全カードを走査し直さない', () => {
	// 1000 枚を超えたグリッドで、変化のたびに全カードを引き直さないため
	const doc = fakeDoc([makeCard('1')]);
	const { deps, trigger } = fakeObserverDeps();
	attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	const scansAfterAttach = doc.scans;
	const added = makeCard('2');
	doc.cards.push(added);
	trigger(added.card);
	assert.equal(doc.scans, scansAfterAttach, 'document 全体を引き直している');
	assert.equal(added.title.getAttribute('tabindex'), '-1');
});

test('増えたノードが作品リンクそのものでも当たる', () => {
	// React がカードの中のリンクだけを差し替えることがある
	const doc = fakeDoc([makeCard('1')]);
	const { deps, trigger } = fakeObserverDeps();
	attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	const added = makeCard('2');
	doc.cards.push(added);
	added.title.querySelectorAll = () => [];
	added.title.matches = (selector) => selector === 'a[href^="/artworks/"]';
	trigger(added.title);
	assert.equal(added.title.getAttribute('tabindex'), '-1');
});

test('要素でないノード (テキスト) が増えても投げない', () => {
	const doc = fakeDoc([makeCard('1')]);
	const { deps, trigger } = fakeObserverDeps();
	attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	assert.doesNotThrow(() => trigger({ nodeType: 3, textContent: 'text' }));
});

test('同期で発火するスケジューラでも 2 回目以降の通知を捨てない', () => {
	// timer の ID を予約中の印に使うと、同期で発火した後に ID が代入されて予約中のまま固まる
	const doc = fakeDoc([makeCard('1')]);
	const { deps, trigger } = fakeObserverDeps();
	attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	for (const id of ['2', '3']) {
		const added = makeCard(id);
		doc.cards.push(added);
		trigger(added.card);
		assert.equal(added.title.getAttribute('tabindex'), '-1', `${id} 枚目に当たっていない`);
	}
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
	deps.callback(addedRecords([makeCard('2').card]));
	assert.equal(scheduled, 0);
	handle.setMode(GRID_TAB_SKIP.BOTH);
	deps.callback(addedRecords([makeCard('3').card]));
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
	const second = makeCard('2');
	const third = makeCard('3');
	doc.cards.push(second, third);
	deps.callback(addedRecords([second.card]));
	deps.callback(addedRecords([third.card]));
	assert.equal(queued.length, 1);
	// 発火したときには、予約中に増えたぶんもまとめて当たる
	queued[0]();
	assert.equal(second.title.getAttribute('tabindex'), '-1');
	assert.equal(third.title.getAttribute('tabindex'), '-1');
	// 発火したら次の変化でまた予約できる
	deps.callback(addedRecords([makeCard('4').card]));
	assert.equal(queued.length, 2);
});

test('dispose で予約を取り消し、以後の通知では動かない', () => {
	const doc = fakeDoc([makeCard('1')]);
	const queued = [];
	const cancelled = [];
	const deps = {
		createObserver(fn) { deps.callback = fn; return { observe() {}, disconnect() {} }; },
		schedule(fn) { queued.push(fn); return queued.length; },
		cancel(id) { cancelled.push(id); },
	};
	const handle = attachTabSkip(doc, GRID_TAB_SKIP.BOTH, deps);
	deps.callback(addedRecords([makeCard('2').card]));
	handle.dispose();
	assert.deepEqual(cancelled, [1]);
});
