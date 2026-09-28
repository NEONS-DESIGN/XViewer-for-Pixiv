import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoticeArea, NOTICE_KINDS } from '../../src/common/notice.js';
import { fakeDoc, fakeElement, findAll } from '../helpers/dom.js';

/**
 * テスト用の入れ物と通知エリアを組み立てる。
 * setTimeout / clearTimeout は擬似の実装に差し替え、タイマーを手で進められるようにする。
 * @returns {{doc: object, container: object, area: object, timers: Array<{fn: Function|null, ms: number}>}}
 */
function setup() {
	const doc = fakeDoc();
	const container = fakeElement('div');
	const timers = [];
	const area = createNoticeArea(doc, container, {
		setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
		clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
	});
	return { doc, container, area, timers };
}

test('createNoticeArea は中身より先に空の live region を置く', () => {
	// 既にある live region の中身が変わったときだけ読み上げる支援技術があるため
	const { container } = setup();
	const areas = findAll(container, '.notice-area');
	assert.equal(areas.length, 1);
	assert.equal(areas[0].getAttribute('role'), 'status');
	assert.equal(areas[0].getAttribute('aria-live'), 'polite');
	assert.equal(findAll(container, '.notice').length, 0);
});

test('show は上部の入れ物に 1 件出し、role=status の入れ物は 1 つだけ作る', () => {
	const { container, area } = setup();
	area.show({ id: 'a', message: 'one' });
	area.show({ id: 'b', message: 'two' });
	assert.equal(findAll(container, '.notice-area').length, 1);
	assert.equal(findAll(container, '.notice').length, 2);
	assert.equal(findAll(container, '.notice-area')[0].getAttribute('role'), 'status');
});

test('同じ id の show は差し替えで、重ならない', () => {
	const { container, area } = setup();
	area.show({ id: 'a', message: 'one' });
	area.show({ id: 'a', message: 'two', kind: NOTICE_KINDS.PROGRESS });
	const items = findAll(container, '.notice');
	assert.equal(items.length, 1);
	assert.equal(items[0].dataset.kind, 'progress');
	assert.match(items[0].textContent, /two/);
});

test('dismiss と handle.dismiss で消えても、空の入れ物は残す', () => {
	const { container, area } = setup();
	const handle = area.show({ id: 'a', message: 'one' });
	const before = findAll(container, '.notice-area')[0];
	handle.dismiss();
	assert.equal(findAll(container, '.notice').length, 0);
	const after = findAll(container, '.notice-area');
	assert.equal(after.length, 1);
	assert.equal(after[0], before);
});

test('timeoutMs を渡したときだけ自動で消える', () => {
	const { container, area, timers } = setup();
	area.show({ id: 'a', message: 'one' });
	assert.equal(timers.length, 0);
	area.show({ id: 'b', message: 'two', timeoutMs: 1000 });
	timers[0].fn();
	assert.equal(findAll(container, '.notice').length, 1);
});

test('error は role=alert を持つ', () => {
	const { container, area } = setup();
	area.show({ id: 'a', message: 'x', kind: NOTICE_KINDS.ERROR });
	assert.equal(findAll(container, '.notice')[0].getAttribute('role'), 'alert');
});

test('handle.update は文言だけを替え、消えた後は何もしない', () => {
	const { container, area } = setup();
	const handle = area.show({ id: 'a', message: 'one' });
	handle.update('two');
	assert.match(findAll(container, '.notice')[0].textContent, /two/);
	handle.dismiss();
	handle.update('three');
	assert.equal(findAll(container, '.notice').length, 0);
});

test('dismiss(id) は area.dismiss からも同じ 1 件を消せる', () => {
	const { container, area } = setup();
	area.show({ id: 'a', message: 'one' });
	area.dismiss('a');
	assert.equal(findAll(container, '.notice').length, 0);
});

test('clear は全件消して入れ物を残し、dispose は入れ物ごと外す', () => {
	const { container, area, timers } = setup();
	area.show({ id: 'a', message: 'one' });
	area.show({ id: 'b', message: 'two' });
	area.clear();
	assert.equal(findAll(container, '.notice').length, 0);
	assert.equal(findAll(container, '.notice-area').length, 1);
	area.show({ id: 'c', message: 'three', timeoutMs: 1000 });
	area.dispose();
	assert.equal(findAll(container, '.notice-area').length, 0);
	assert.equal(timers[0].fn, null);
});

test('dispose の後の show は何も出さない', () => {
	const { container, area } = setup();
	area.dispose();
	const handle = area.show({ id: 'a', message: 'one' });
	assert.equal(findAll(container, '.notice-area').length, 0);
	assert.equal(findAll(container, '.notice').length, 0);
	handle.update('two');
	handle.dismiss();
});

test('info と error はアイコンを持ち、progress は回転する印を持つ', () => {
	const { container, area } = setup();
	area.show({ id: 'a', message: 'x', kind: NOTICE_KINDS.INFO });
	area.show({ id: 'b', message: 'y', kind: NOTICE_KINDS.ERROR });
	area.show({ id: 'c', message: 'z', kind: NOTICE_KINDS.PROGRESS });
	const items = findAll(container, '.notice');
	assert.equal(findAll(items[0], 'svg').length, 1);
	assert.equal(findAll(items[1], 'svg').length, 1);
	assert.equal(findAll(items[2], '.notice-spinner').length, 1);
});
