import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workIdFromLink, collectWorkIds, attachGridListener, findGridList } from '../../src/content/grid.js';
import { CARD_SELECTOR } from '../../src/common/constants.js';
import { el, makeCard, makeGrid } from '../helpers/card.js';

/**
 * querySelectorAll だけを持つ最小の要素の代わり。
 * @param {string[]} hrefs リンクの href
 * @returns {object} root の代わり
 */
function fakeRoot(hrefs) {
	return {
		querySelectorAll() {
			return hrefs.map((href) => ({ getAttribute: () => href }));
		},
	};
}

const ORIGIN = 'https://www.pixiv.net';

/** Node.DOCUMENT_NODE。document の代わりに付ける */
const DOCUMENT_NODE = 9;

/**
 * プロフィールのホームの代わり。ピックアップ欄 (section の中の ul > li) の後に作品グリッドが並ぶ。(SITE_SPEC §3)
 * @param {{pickup?: string[], grid?: string[], header?: string[]}} [options] 各所に置く作品 ID
 * @returns {{doc: object, ul: object|null}} document の代わりとグリッドの ul
 */
function fakeHome(options = {}) {
	const { pickup = [], grid = [], header = [] } = options;
	const doc = el('#document');
	doc.nodeType = DOCUMENT_NODE;
	const nav = doc.appendChild(el('nav'));
	for (const id of header) nav.appendChild(el('a', { href: `/artworks/${id}` }));
	if (pickup.length > 0) {
		const section = doc.appendChild(el('section'));
		section.appendChild(makeGrid(pickup.map((id) => makeCard({ id }))).wrap);
	}
	let ul = null;
	if (grid.length > 0) {
		const made = makeGrid(grid.map((id) => makeCard({ id })));
		doc.appendChild(made.wrap);
		ul = made.ul;
	}
	return { doc, ul };
}

test('findGridList は作品カード (li) の親の ul を返す', () => {
	const { doc, ul } = fakeHome({ grid: ['3', '2', '1'] });
	assert.equal(findGridList(doc), ul);
});

test('findGridList はピックアップ欄 (section) の ul を掴まない', () => {
	// ホームではピックアップ欄がグリッドより先に並ぶ。先頭のカードを掴むとピックアップの ul になる
	const { doc, ul } = fakeHome({ pickup: ['9', '8', '7'], grid: ['3', '2', '1'] });
	assert.equal(findGridList(doc), ul);
});

test('findGridList はカードに入っていない作品リンクを起点にしない', () => {
	const { doc, ul } = fakeHome({ header: ['99'], grid: ['3'] });
	assert.equal(findGridList(doc), ul);
});

test('findGridList はグリッドが無ければ null', () => {
	const { doc } = fakeHome({ header: ['99'] });
	assert.equal(findGridList(doc), null);
	assert.equal(findGridList(fakeHome({ pickup: ['1'] }).doc), null);
});

test('findGridList は querySelectorAll が投げても null', (t) => {
	// 失敗は警告に留める。テストの出力を汚さないよう差し替える (テストの終わりに自動で戻る)
	const warn = t.mock.method(console, 'warn', () => {});
	const doc = { querySelectorAll() { throw new Error('壊れた DOM'); } };
	assert.equal(findGridList(doc), null);
	assert.equal(warn.mock.callCount(), 1);
});

test('collectWorkIds は document を渡されたら作品グリッドの ul だけを集める', () => {
	// ピックアップ欄やヘッダの作品リンクを並びに混ぜない。混ぜるとグリッドの作品から
	// 下キーを押したときにピックアップの次の作品へ飛ぶ
	const { doc } = fakeHome({ header: ['99'], pickup: ['9', '3'], grid: ['3', '2', '1'] });
	assert.deepEqual(collectWorkIds(doc, ORIGIN), ['3', '2', '1']);
});

test('collectWorkIds はグリッドが無ければ document 全体から集める', () => {
	const { doc } = fakeHome({ header: ['99'] });
	assert.deepEqual(collectWorkIds(doc, ORIGIN), ['99']);
});

test('作品リンクから ID を取り出す', () => {
	assert.equal(workIdFromLink('/artworks/149425016', ORIGIN), '149425016');
	assert.equal(workIdFromLink('https://www.pixiv.net/artworks/149425016', ORIGIN), '149425016');
});

test('タグ絞り込みリンクは作品リンクとして扱わない', () => {
	assert.equal(workIdFromLink('/users/54734418/artworks/オリジナル', ORIGIN), null);
});

test('壊れた href でも例外を投げない', () => {
	assert.equal(workIdFromLink('', ORIGIN), null);
	assert.equal(workIdFromLink(null, ORIGIN), null);
});

test('collectWorkIds は DOM 順で ID を集める', () => {
	const root = fakeRoot(['/artworks/3', '/artworks/2', '/artworks/1']);
	assert.deepEqual(collectWorkIds(root, ORIGIN), ['3', '2', '1']);
});

test('collectWorkIds は同じ作品の 2 本目のリンクを捨てる', () => {
	// 1 作品につき画像用とタイトル用の 2 本のリンクがある
	const root = fakeRoot(['/artworks/3', '/artworks/3', '/artworks/2', '/artworks/2']);
	assert.deepEqual(collectWorkIds(root, ORIGIN), ['3', '2']);
});

test('collectWorkIds はタグ絞り込みリンクを混ぜない', () => {
	const root = fakeRoot(['/users/1/artworks/tag', '/artworks/5']);
	assert.deepEqual(collectWorkIds(root, ORIGIN), ['5']);
});

/**
 * document の代わり。リスナーの登録と発火を記録する。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const listeners = [];
	return {
		location: { origin: ORIGIN },
		addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
		removeEventListener(type, fn, capture) {
			const index = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
			if (index >= 0) listeners.splice(index, 1);
		},
		listenerCount() { return listeners.length; },
		fire(event) { for (const listener of [...listeners]) listener.fn(event); },
	};
}

/**
 * クリックの代わり。href が null なら作品リンクの外を押したことにする。
 * @param {string|null} href closest が返すリンクの href
 * @param {object} [overrides] button や修飾キーの上書き。inCard: false でカードの外のリンクにする
 * @returns {object} event の代わり
 */
function fakeClick(href, overrides = {}) {
	const { inCard = true, ...rest } = overrides;
	const link = href === null ? null : {
		getAttribute: () => href,
		closest: (selector) => (selector === CARD_SELECTOR && inCard ? { tag: CARD_SELECTOR } : null),
	};
	const event = {
		button: 0,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		defaultPrevented: false,
		propagationStopped: false,
		target: { closest: () => link },
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() { this.propagationStopped = true; },
	};
	return Object.assign(event, rest);
}

test('attachGridListener はカードの外の作品リンクを横取りしない', () => {
	// ヘッダの通知などに出る作品リンクは pixiv 本体に任せる
	const doc = fakeDoc();
	const opened = [];
	attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
	const event = fakeClick('/artworks/1', { inCard: false });
	doc.fire(event);
	assert.deepEqual(opened, []);
	assert.equal(event.defaultPrevented, false);
});

test('attachGridListener は作品リンクのクリックを横取りする', () => {
	const doc = fakeDoc();
	const opened = [];
	attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
	const event = fakeClick('/artworks/149425016');
	doc.fire(event);
	assert.deepEqual(opened, ['149425016']);
	assert.equal(event.defaultPrevented, true);
	assert.equal(event.propagationStopped, true);
});

test('attachGridListener は修飾キー付きのクリックを横取りしない', () => {
	// 新しいタブで開く操作を邪魔しないため
	for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
		const doc = fakeDoc();
		const opened = [];
		attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
		const event = fakeClick('/artworks/1', { [key]: true });
		doc.fire(event);
		assert.deepEqual(opened, [], `${key} を押しながらのクリックを横取りしてしまった`);
		assert.equal(event.defaultPrevented, false);
	}
});

test('attachGridListener は中クリックを横取りしない', () => {
	const doc = fakeDoc();
	const opened = [];
	attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
	const event = fakeClick('/artworks/1', { button: 1 });
	doc.fire(event);
	assert.deepEqual(opened, []);
	assert.equal(event.defaultPrevented, false);
});

test('attachGridListener は作品リンク以外のクリックを無視する', () => {
	const doc = fakeDoc();
	const opened = [];
	attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
	const event = fakeClick(null);
	doc.fire(event);
	assert.deepEqual(opened, []);
	assert.equal(event.defaultPrevented, false);
});

test('attachGridListener はタグ絞り込みリンクを横取りしない', () => {
	const doc = fakeDoc();
	const opened = [];
	attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
	const event = fakeClick('/users/54734418/artworks/オリジナル');
	doc.fire(event);
	assert.deepEqual(opened, []);
	assert.equal(event.defaultPrevented, false);
});

test('attachGridListener は origin を渡さなければ doc.location から取る', () => {
	const doc = fakeDoc();
	const opened = [];
	attachGridListener(doc, (id) => opened.push(id));
	doc.fire(fakeClick('/artworks/42'));
	assert.deepEqual(opened, ['42']);
});

test('attachGridListener の dispose でリスナーが外れる', () => {
	const doc = fakeDoc();
	const opened = [];
	const handle = attachGridListener(doc, (id) => opened.push(id), { origin: ORIGIN });
	assert.equal(doc.listenerCount(), 1);
	handle.dispose();
	assert.equal(doc.listenerCount(), 0);
	doc.fire(fakeClick('/artworks/1'));
	assert.deepEqual(opened, []);
});

test('英語表示 (/en 付き) の作品リンクからも ID を取り出す', () => {
	assert.equal(workIdFromLink('/en/artworks/149425016', ORIGIN), '149425016');
	assert.equal(workIdFromLink('https://www.pixiv.net/en/artworks/149425016', ORIGIN), '149425016');
	// タグ絞り込みリンクは接頭辞が付いても作品リンクではない
	assert.equal(workIdFromLink('/en/users/54734418/artworks/オリジナル', ORIGIN), null);
});

test('英語表示のグリッドからも作品 ID を集める', () => {
	// 接頭辞を知らないままだとセレクタが 1 本も当たらず、並びが空になる
	const cards = ['1', '2', '3'].map((id) => makeCard({ id, localePrefix: '/en' }));
	const { ul } = makeGrid(cards);
	assert.deepEqual(collectWorkIds(ul, ORIGIN), ['1', '2', '3']);
	assert.equal(findGridList(ul.parent), ul);
});
