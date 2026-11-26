import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPopupToggle, setPlayToggleLook, setButtonLook } from '../../../src/content/viewer/control-parts.js';
import { fakeDoc, iconName } from '../../helpers/dom.js';

/** 再生ボタンの文言の代わり。 */
const TEXT = Object.freeze({ PLAY: '再生', PAUSE: '一時停止' });

/**
 * ボタンとポップアップを wrap で包んだ部品を組み、開閉を作る。
 * @param {object} [options] createPopupToggle へ足す依存
 * @returns {object} 部品・開閉・開閉の記録
 */
function build(options = {}) {
	const doc = fakeDoc();
	const wrap = doc.createElement('div');
	const button = doc.createElement('button');
	const popup = doc.createElement('div');
	const item = doc.createElement('button');
	const outside = doc.createElement('button');
	popup.append(item);
	popup.hidden = true;
	wrap.append(button, popup);
	doc.body.append(wrap, outside);
	const changes = [];
	const toggle = createPopupToggle({ doc, wrap, button, popup, onChange: (open) => changes.push(open), ...options });
	return { doc, wrap, button, popup, item, outside, toggle, changes };
}

test('ボタンを押すと開いて focusOnOpen の先へフォーカスし、もう一度押すと閉じる', async () => {
	const parts = build({ focusOnOpen: () => parts?.item });
	const { doc, button, popup, item, toggle, changes } = parts;
	await button.click();
	assert.equal(toggle.isOpen(), true);
	assert.equal(popup.hidden, false);
	assert.equal(button.getAttribute('aria-expanded'), 'true');
	assert.equal(doc.activeElement, item);
	await button.click();
	assert.equal(toggle.isOpen(), false);
	assert.equal(popup.hidden, true);
	assert.equal(button.getAttribute('aria-expanded'), 'false');
	assert.deepEqual(changes, [true, false]);
});

test('document の pointerdown は開いている間だけ張り、外を押すと閉じる', async () => {
	const { doc, wrap, button, outside, toggle, changes } = build();
	assert.deepEqual(doc.listeners.pointerdown ?? [], [], '閉じている間は張らない');
	await button.click();
	assert.equal(doc.listeners.pointerdown.length, 1);
	await doc.dispatch('pointerdown', { composedPath: () => [button, wrap] });
	assert.equal(toggle.isOpen(), true, '中を押しても閉じない');
	await doc.dispatch('pointerdown', { composedPath: () => [outside] });
	assert.equal(toggle.isOpen(), false);
	assert.deepEqual(doc.listeners.pointerdown, []);
	assert.deepEqual(changes, [true, false]);
});

test('フォーカスが外へ出たら閉じ、中や行き先の無い移動では閉じない', async () => {
	const { wrap, button, item, outside, toggle } = build();
	await button.click();
	await wrap.dispatch('focusout', { relatedTarget: item });
	await wrap.dispatch('focusout', { relatedTarget: null });
	assert.equal(toggle.isOpen(), true);
	await wrap.dispatch('focusout', { relatedTarget: outside });
	assert.equal(toggle.isOpen(), false);
});

test('close(true) はボタンへフォーカスを戻し、閉じていれば何もしない', async () => {
	const { doc, button, item, toggle, changes } = build();
	toggle.close(true);
	assert.deepEqual(changes, []);
	await button.click();
	item.focus();
	toggle.close(true);
	assert.equal(doc.activeElement, button);
	assert.deepEqual(changes, [true, false]);
});

test('dispose はリスナを外して閉じ、onChange は呼ばない', async () => {
	const { doc, wrap, button, popup, toggle, changes } = build();
	await button.click();
	toggle.dispose();
	assert.equal(popup.hidden, true);
	assert.deepEqual(changes, [true]);
	assert.deepEqual(doc.listeners.pointerdown, []);
	assert.deepEqual(wrap.listeners.focusout, []);
	await button.click();
	assert.equal(toggle.isOpen(), false, '外した後のボタンでは開かない');
});

test('setPlayToggleLook は「押すと何になるか」のアイコンと名前を出す', () => {
	const doc = fakeDoc();
	const button = doc.createElement('button');
	setPlayToggleLook(doc, button, true, TEXT);
	assert.equal(button.getAttribute('aria-label'), '一時停止');
	assert.equal(button.title, '一時停止');
	assert.equal(iconName(button.children[0]), 'pause');
	setPlayToggleLook(doc, button, false, TEXT);
	assert.equal(button.getAttribute('aria-label'), '再生');
	assert.equal(button.children.length, 1);
	assert.equal(iconName(button.children[0]), 'play');
});

test('setButtonLook はアイコンを差し替え、読み上げ名と title を揃える', () => {
	const doc = fakeDoc();
	const button = doc.createElement('button');
	setButtonLook(doc, button, 'repeat', 'ループ');
	setButtonLook(doc, button, 'timer', '間隔');
	assert.equal(button.getAttribute('aria-label'), '間隔');
	assert.equal(button.title, '間隔');
	assert.equal(button.children.length, 1);
	assert.equal(iconName(button.children[0]), 'timer');
});
