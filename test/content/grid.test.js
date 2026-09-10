import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workIdFromLink, collectWorkIds, attachGridListener } from '../../src/content/grid.js';

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
 * @param {object} [overrides] button や修飾キーの上書き
 * @returns {object} event の代わり
 */
function fakeClick(href, overrides = {}) {
	const event = {
		button: 0,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		defaultPrevented: false,
		propagationStopped: false,
		target: { closest: () => (href === null ? null : { getAttribute: () => href }) },
		preventDefault() { this.defaultPrevented = true; },
		stopPropagation() { this.propagationStopped = true; },
	};
	return Object.assign(event, overrides);
}

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
