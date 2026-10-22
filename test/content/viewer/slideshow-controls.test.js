import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlideshowControls } from '../../../src/content/viewer/slideshow-controls.js';
import { SLIDESHOW_CONTROLS_IDLE_MS, SLIDESHOW_INTERVAL_CUSTOM_RANGE } from '../../../src/common/constants.js';
import { createStrings } from '../../../src/i18n/index.js';
import { fakeDoc, find, findAll, iconName } from '../../helpers/dom.js';

const STRINGS = createStrings('ja');

/** 既定の設定 (正規化済みの形のうち、コントローラーが読む項目だけ) */
const SETTINGS = Object.freeze({
	slideshowInterval: 3,
	slideshowIntervalCustom: 5,
	slideshowLoop: false,
});

/**
 * 手で発火させる偽のタイマー。
 * @returns {{setTimeout: Function, clearTimeout: Function, pending: () => Array<{id: number, fn: Function, ms: number}>, fire: () => void}}
 */
function fakeTimer() {
	const timers = new Map();
	let nextId = 1;
	return {
		setTimeout: (fn, ms) => {
			const id = nextId;
			nextId += 1;
			timers.set(id, { id, fn, ms });
			return id;
		},
		clearTimeout: (id) => { timers.delete(id); },
		pending: () => [...timers.values()],
		fire() {
			const due = [...timers.values()];
			timers.clear();
			for (const timer of due) timer.fn();
		},
	};
}

/**
 * コントローラーを偽の DOM の上に組む。overlay > stage の入れ子にし、stage を置き場にする。
 * @param {object} [options] 差し替える依存
 * @returns {object} 組んだ部品と、呼ばれたコールバックの記録
 */
function build(options = {}) {
	const doc = fakeDoc();
	const overlay = doc.createElement('div');
	const stage = doc.createElement('div');
	overlay.append(stage);
	doc.body.append(overlay);
	const timer = fakeTimer();
	const calls = { toggle: 0, step: [], loop: [], interval: [], panel: [] };
	const controls = createSlideshowControls({
		doc,
		container: stage,
		activityTarget: overlay,
		strings: options.strings ?? STRINGS,
		settings: options.settings ?? SETTINGS,
		onToggle: () => { calls.toggle += 1; },
		onStep: (direction) => calls.step.push(direction),
		onLoopChange: (loop) => calls.loop.push(loop),
		onIntervalChange: (change) => calls.interval.push(change),
		onPanelChange: (open) => calls.panel.push(open),
		setTimeout: timer.setTimeout,
		clearTimeout: timer.clearTimeout,
		matchMedia: options.matchMedia,
	});
	const part = (selector) => find(stage, selector);
	return { doc, overlay, stage, timer, calls, controls, part };
}

/**
 * キーの代わり。composedPath の先頭に押された要素を置く。
 * @param {string} key キー名
 * @param {object} [target] 押された要素
 * @returns {object} KeyboardEvent の代わり
 */
function key(key, target) {
	return { key, composedPath: () => (target ? [target] : []), preventDefault() { this.prevented = true; } };
}

/**
 * 速度の項目を、間隔の値で引く。
 * @param {object} stage 置き場
 * @param {string} value data-interval の値
 * @returns {object} 項目
 */
function option(stage, value) {
	return findAll(stage, '.slideshow-speed-option').find((one) => one.dataset.interval === value);
}

test('帯を置き場へ差し込み、読み上げ名と部品を揃える。作っただけではフォーカスを奪わない', () => {
	const { doc, stage, controls, part } = build();
	assert.equal(controls.element.parent, stage);
	assert.equal(controls.element.className, 'slideshow-controls');
	assert.equal(controls.element.getAttribute('role'), 'group');
	assert.equal(controls.element.getAttribute('aria-label'), '自動送り');
	assert.equal(part('.slideshow-progress').getAttribute('aria-hidden'), 'true');
	// アイコンだけのボタンは読み上げ名と、マウスで見る名前の両方を持つ
	for (const [selector, label, icon] of [
		['.slideshow-prev', '前へ', 'skipPrevious'],
		['.slideshow-toggle', '自動送りを再生', 'play'],
		['.slideshow-next', '次へ', 'skipNext'],
		['.slideshow-loop', 'ループ', 'repeat'],
	]) {
		const button = part(selector);
		assert.equal(button.getAttribute('aria-label'), label, selector);
		assert.equal(button.title, label, selector);
		assert.equal(iconName(button.children[0]), icon, selector);
	}
	assert.equal(part('.slideshow-loop').getAttribute('aria-pressed'), 'false');
	const speed = part('.slideshow-speed');
	assert.equal(speed.getAttribute('aria-haspopup'), 'dialog');
	assert.equal(speed.getAttribute('aria-expanded'), 'false');
	const panel = part('.slideshow-speed-panel');
	assert.equal(panel.getAttribute('role'), 'dialog');
	assert.equal(panel.getAttribute('aria-label'), '送る間隔');
	assert.equal(panel.hidden, true);
	assert.equal(part('[role="radiogroup"]').getAttribute('aria-label'), '送る間隔');
	assert.deepEqual(findAll(stage, '[role="radio"]').map((one) => one.textContent), ['2 秒', '3 秒', '4 秒', 'カスタム']);
	assert.equal(doc.activeElement, null, '開いたときのフォーカスはビュワーが決める');
	controls.dispose();
});

test('再生ボタンは押すと何になるかを示し、押されたら知らせる', async () => {
	const { calls, controls, part } = build();
	const toggle = part('.slideshow-toggle');
	controls.setState({ playing: true, durationMs: null });
	assert.equal(iconName(toggle.children[0]), 'pause');
	assert.equal(toggle.getAttribute('aria-label'), '自動送りを停止');
	assert.equal(toggle.title, '自動送りを停止');
	controls.setState({ playing: false, durationMs: null });
	assert.equal(iconName(toggle.children[0]), 'play');
	assert.equal(toggle.getAttribute('aria-label'), '自動送りを再生');
	await toggle.click();
	assert.equal(calls.toggle, 1);
	controls.dispose();
});

test('前へ・次へは向きを付けて知らせる', async () => {
	const { calls, controls, part } = build();
	await part('.slideshow-prev').click();
	await part('.slideshow-next').click();
	assert.deepEqual(calls.step, [-1, 1]);
	controls.dispose();
});

test('ループは押すたびに切り替え、押された状態を aria-pressed で示す', async () => {
	const { calls, controls, part } = build();
	const loop = part('.slideshow-loop');
	await loop.click();
	assert.deepEqual(calls.loop, [true]);
	assert.equal(loop.getAttribute('aria-pressed'), 'true');
	await loop.click();
	assert.deepEqual(calls.loop, [true, false]);
	assert.equal(loop.getAttribute('aria-pressed'), 'false');
	controls.dispose();
});

test('速度のボタンは今の間隔を出す。小数は末尾の 0 を付けない', () => {
	const { controls, part } = build({ settings: { ...SETTINGS, slideshowInterval: 'custom', slideshowIntervalCustom: 12.5 } });
	const speed = part('.slideshow-speed');
	assert.equal(iconName(speed.children[0]), 'timer');
	assert.equal(part('.slideshow-speed-label').textContent, '12.5 秒');
	assert.equal(speed.getAttribute('aria-label'), '送る間隔: 12.5 秒');
	assert.equal(speed.title, '送る間隔: 12.5 秒');
	controls.dispose();
});

test('setSettings でループと速度の表示を合わせる。コールバックは呼ばない', () => {
	const { calls, stage, controls, part } = build();
	controls.setSettings({ slideshowInterval: 4, slideshowIntervalCustom: 7.5, slideshowLoop: true });
	assert.equal(part('.slideshow-loop').getAttribute('aria-pressed'), 'true');
	assert.equal(part('.slideshow-speed-label').textContent, '4 秒');
	assert.equal(option(stage, '4').getAttribute('aria-checked'), 'true');
	assert.equal(option(stage, '3').getAttribute('aria-checked'), 'false');
	assert.equal(part('.slideshow-custom').hidden, true);
	controls.setSettings({ slideshowInterval: 'custom', slideshowIntervalCustom: 7.5, slideshowLoop: false });
	assert.equal(part('.slideshow-speed-label').textContent, '7.5 秒');
	assert.equal(part('.slideshow-custom').hidden, false);
	assert.equal(part('.slideshow-custom-range').value, '7.5');
	assert.equal(part('.slideshow-custom-value').textContent, '7.5 秒');
	assert.deepEqual(calls.loop, []);
	assert.deepEqual(calls.interval, []);
	controls.dispose();
});

test('速度のボタンでパネルを開き、選んでいる項目へフォーカスする。矢印で選び直すとその場で知らせる', async () => {
	const { doc, calls, stage, controls, part } = build();
	const speed = part('.slideshow-speed');
	await speed.click();
	assert.equal(part('.slideshow-speed-panel').hidden, false);
	assert.equal(speed.getAttribute('aria-expanded'), 'true');
	assert.deepEqual(calls.panel, [true]);
	const three = option(stage, '3');
	assert.equal(doc.activeElement, three);
	// 選んでいる項目だけが Tab で止まる
	assert.deepEqual(findAll(stage, '[role="radio"]').map((one) => one.getAttribute('tabindex')), ['-1', '0', '-1', '-1']);

	const down = key('ArrowDown', three);
	assert.equal(controls.consumeKey(down), true);
	assert.equal(down.prevented, true);
	assert.deepEqual(calls.interval, [{ slideshowInterval: 4 }]);
	assert.equal(doc.activeElement, option(stage, '4'));
	assert.equal(option(stage, '4').getAttribute('aria-checked'), 'true');
	assert.equal(three.getAttribute('aria-checked'), 'false');
	assert.equal(option(stage, '4').getAttribute('tabindex'), '0');
	assert.equal(part('.slideshow-speed-label').textContent, '4 秒');

	assert.equal(controls.consumeKey(key('ArrowRight', option(stage, '4'))), true);
	assert.deepEqual(calls.interval.at(-1), { slideshowInterval: 'custom' });
	assert.equal(part('.slideshow-custom').hidden, false, 'カスタムでスライダーを出す');
	// 端から先は反対の端へ回る
	assert.equal(controls.consumeKey(key('ArrowDown', option(stage, 'custom'))), true);
	assert.deepEqual(calls.interval.at(-1), { slideshowInterval: 2 });
	assert.equal(part('.slideshow-custom').hidden, true);
	assert.equal(controls.consumeKey(key('ArrowUp', option(stage, '2'))), true);
	assert.deepEqual(calls.interval.at(-1), { slideshowInterval: 'custom' });
	assert.equal(controls.consumeKey(key('Home', option(stage, 'custom'))), true);
	assert.deepEqual(calls.interval.at(-1), { slideshowInterval: 2 });
	assert.equal(controls.consumeKey(key('End', option(stage, '2'))), true);
	assert.deepEqual(calls.interval.at(-1), { slideshowInterval: 'custom' });
	assert.equal(controls.consumeKey(key('ArrowLeft', option(stage, 'custom'))), true);
	assert.deepEqual(calls.interval.at(-1), { slideshowInterval: 4 });
	assert.equal(calls.interval.length, 7);
	controls.dispose();
});

test('項目の上で矢印を押し続けた分 (repeat) は選び直さないが、本体へも渡さない', async () => {
	const { doc, calls, stage, controls, part } = build();
	await part('.slideshow-speed').click();
	const three = option(stage, '3');
	const held = { ...key('ArrowDown', three), repeat: true };
	assert.equal(controls.consumeKey(held), true, '作品を送らせない');
	assert.equal(held.prevented, true);
	assert.deepEqual(calls.interval, []);
	assert.equal(three.getAttribute('aria-checked'), 'true');
	assert.equal(doc.activeElement, three);
	// 押し直せば選び直す
	assert.equal(controls.consumeKey(key('ArrowDown', three)), true);
	assert.deepEqual(calls.interval, [{ slideshowInterval: 4 }]);
	controls.dispose();
});

test('項目を押すと選び、同じ項目をもう一度押しても知らせない', async () => {
	const { calls, stage, controls, part } = build();
	await part('.slideshow-speed').click();
	await option(stage, '2').click();
	assert.deepEqual(calls.interval, [{ slideshowInterval: 2 }]);
	assert.equal(option(stage, '2').getAttribute('aria-checked'), 'true');
	await option(stage, '2').click();
	assert.equal(calls.interval.length, 1);
	assert.equal(part('.slideshow-speed-panel').hidden, false, '選んでもパネルは開いたまま');
	controls.dispose();
});

test('カスタムのスライダーは input で表示だけ変え、change で秒数を知らせる', async () => {
	const { calls, stage, controls, part } = build();
	await part('.slideshow-speed').click();
	await option(stage, 'custom').click();
	assert.deepEqual(calls.interval, [{ slideshowInterval: 'custom' }]);
	const range = part('.slideshow-custom-range');
	assert.equal(range.type, 'range');
	assert.equal(range.min, String(SLIDESHOW_INTERVAL_CUSTOM_RANGE.min));
	assert.equal(range.max, String(SLIDESHOW_INTERVAL_CUSTOM_RANGE.max));
	assert.equal(range.step, String(SLIDESHOW_INTERVAL_CUSTOM_RANGE.step));
	assert.equal(range.value, '5');
	assert.equal(part('.slideshow-custom-label').textContent, '間隔 (秒)');
	assert.equal(part('.slideshow-speed-label').textContent, '5 秒');

	range.value = '12.5';
	await range.dispatch('input', {});
	assert.equal(part('.slideshow-custom-value').textContent, '12.5 秒');
	assert.equal(range.getAttribute('aria-valuetext'), '12.5 秒');
	assert.equal(calls.interval.length, 1, 'input では知らせない');
	await range.dispatch('change', {});
	assert.deepEqual(calls.interval.at(-1), { slideshowIntervalCustom: 12.5 });
	assert.equal(part('.slideshow-speed-label').textContent, '12.5 秒');
	controls.dispose();
});

test('パネルが開いている間の Escape はパネルだけ閉じ、速度のボタンへフォーカスを戻す。閉じていれば本体へ渡す', async () => {
	const { doc, calls, controls, part } = build();
	assert.equal(controls.consumeKey(key('Escape')), false, '閉じている間はビュワーを閉じる');
	assert.equal(controls.consumeKey(key('ArrowDown')), false, '閉じている間は作品を送る');
	const speed = part('.slideshow-speed');
	await speed.click();
	const escape = key('Escape', doc.activeElement);
	assert.equal(controls.consumeKey(escape), true);
	assert.equal(escape.prevented, true);
	assert.equal(part('.slideshow-speed-panel').hidden, true);
	assert.equal(speed.getAttribute('aria-expanded'), 'false');
	assert.equal(doc.activeElement, speed);
	assert.deepEqual(calls.panel, [true, false]);
	assert.equal(controls.consumeKey(key('Escape', speed)), false);
	controls.dispose();
});

test('スライダーの上の左右と端のキーはブラウザに任せ、上下は作品を送らせないよう食い止める', async () => {
	const { doc, calls, stage, controls, part } = build({ settings: { ...SETTINGS, slideshowInterval: 'custom' } });
	await part('.slideshow-speed').click();
	assert.equal(doc.activeElement, option(stage, 'custom'));
	const range = part('.slideshow-custom-range');
	for (const name of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
		const event = key(name, range);
		assert.equal(controls.consumeKey(event), false, name);
		assert.equal(event.prevented, undefined, `${name} の既定の動作 (つまみを動かす) を止めない`);
	}
	assert.equal(controls.consumeKey(key('ArrowUp', range)), true);
	assert.equal(controls.consumeKey(key('ArrowDown', range)), true);
	assert.deepEqual(calls.interval, [], 'スライダーの上のキーで項目を選び直さない');
	assert.equal(controls.consumeKey(key('Tab', range)), false, 'Tab は食い止めない');
	assert.equal(controls.consumeKey(key('Tab', option(stage, 'custom'))), false);
	assert.equal(controls.consumeKey(key('Escape', range)), true);
	assert.equal(part('.slideshow-speed-panel').hidden, true);
	controls.dispose();
});

test('パネルが開いていても、項目の上でなければ矢印と端のキーで選び直さない', async () => {
	const { doc, calls, controls, part } = build();
	const speed = part('.slideshow-speed');
	await speed.click();
	speed.focus();
	assert.equal(doc.activeElement, speed);
	for (const name of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
		const onButton = key(name, speed);
		assert.equal(controls.consumeKey(onButton), false, `${name} (速度のボタンの上)`);
		assert.equal(onButton.prevented, undefined, name);
		assert.equal(controls.consumeKey(key(name)), false, `${name} (対象が分からない)`);
	}
	assert.deepEqual(calls.interval, []);
	assert.equal(part('.slideshow-speed-label').textContent, '3 秒');
	assert.equal(part('.slideshow-speed-panel').hidden, false);
	controls.dispose();
});

test('パネルの外を押すと閉じ、中を押しても閉じない', async () => {
	const { doc, overlay, calls, controls, part } = build();
	await part('.slideshow-speed').click();
	const wrap = part('.slideshow-speed-wrap');
	await doc.dispatch('pointerdown', { composedPath: () => [part('.slideshow-speed-option'), wrap, controls.element] });
	assert.equal(part('.slideshow-speed-panel').hidden, false);
	await doc.dispatch('pointerdown', { composedPath: () => [overlay] });
	assert.equal(part('.slideshow-speed-panel').hidden, true);
	assert.deepEqual(calls.panel, [true, false]);
	controls.dispose();
});

test('フォーカスが速度の部品の外へ出たら閉じる。行き先が分からないときは閉じない', async () => {
	const { calls, controls, part } = build();
	await part('.slideshow-speed').click();
	const wrap = part('.slideshow-speed-wrap');
	await wrap.dispatch('focusout', { relatedTarget: part('.slideshow-speed') });
	await wrap.dispatch('focusout', { relatedTarget: null });
	assert.equal(part('.slideshow-speed-panel').hidden, false);
	await wrap.dispatch('focusout', { relatedTarget: part('.slideshow-loop') });
	assert.equal(part('.slideshow-speed-panel').hidden, true);
	assert.deepEqual(calls.panel, [true, false]);
	controls.dispose();
});

test('速度のボタンをもう一度押すと閉じる', async () => {
	const { calls, controls, part } = build();
	await part('.slideshow-speed').click();
	await part('.slideshow-speed').click();
	assert.equal(part('.slideshow-speed-panel').hidden, true);
	assert.deepEqual(calls.panel, [true, false]);
	controls.dispose();
});

test('操作が無いまま待つと data-idle を付け、ビュワーの上でポインタが動けば外す', async () => {
	const { overlay, timer, controls } = build();
	assert.deepEqual(timer.pending().map((one) => one.ms), [SLIDESHOW_CONTROLS_IDLE_MS], '出した直後から数える');
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), true);
	await overlay.dispatch('pointermove', {});
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	assert.equal(timer.pending().length, 1, '数え直す');
	timer.fire();
	await overlay.dispatch('pointerdown', {});
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	timer.fire();
	controls.wake();
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	assert.equal(timer.pending().length, 1, 'wake でも数え直す');
	controls.dispose();
});

test('帯の上にカーソルがある間は隠さない。離れたら数え直す', async () => {
	const { timer, controls } = build();
	await controls.element.dispatch('pointerenter', {});
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	await controls.element.dispatch('pointerleave', {});
	assert.equal(timer.pending().length, 1);
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), true);
	controls.dispose();
});

/**
 * フォーカスの輪郭が出ているか (:focus-visible) の判定を差し替える。
 * 偽の DOM は :focus-visible を解せないので、キーボードで来たかどうかをここで決める。
 * @param {object} button 対象のボタン
 * @param {boolean} visible キーボードで来たフォーカスなら true
 * @returns {void}
 */
function setFocusVisible(button, visible) {
	const original = button.matches;
	button.matches = (selector) => (selector === ':focus-visible' ? visible : original(selector));
}

test('マウスで押したボタンにフォーカスが残っていても、待てば隠す', async () => {
	const { calls, timer, controls, part } = build();
	const toggle = part('.slideshow-toggle');
	setFocusVisible(toggle, false);
	toggle.focus();
	await toggle.click();
	assert.equal(calls.toggle, 1);
	assert.equal(timer.pending().map((one) => one.ms).at(-1), SLIDESHOW_CONTROLS_IDLE_MS);
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), true);
	controls.dispose();
});

test(':focus-visible を判定できないときは、マウスで来たフォーカスと同じく隠す', () => {
	const { timer, controls, part } = build();
	// 偽の DOM の matches は解せないセレクタで投げる
	part('.slideshow-loop').focus();
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), true);
	controls.dispose();
});

test('キーボードで帯の中にフォーカスしている間は隠さない。外へ出たら数え直す', async () => {
	const { overlay, timer, controls, part } = build();
	const toggle = part('.slideshow-toggle');
	setFocusVisible(toggle, true);
	toggle.focus();
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	overlay.focus();
	await controls.element.dispatch('focusout', { relatedTarget: overlay });
	assert.equal(timer.pending().length, 1);
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), true);
	controls.dispose();
});

test('パネルが開いている間は隠さない。閉じたら数え直す', async () => {
	const { doc, overlay, timer, controls, part } = build();
	await part('.slideshow-speed').click();
	// フォーカスが外にあっても、開いているだけで隠さない
	overlay.focus();
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), false);
	await doc.dispatch('pointerdown', { composedPath: () => [overlay] });
	assert.equal(timer.pending().length, 1);
	timer.fire();
	assert.equal(controls.element.hasAttribute('data-idle'), true);
	controls.dispose();
});

test('計時の長さが届くたびに進捗の線を 0 から描き直し、null なら消す', () => {
	const { controls, part } = build();
	const progress = part('.slideshow-progress');
	/** 描き直しを起こすための読み取りの時点で、走っている印が外れていたか */
	const reflows = [];
	Object.defineProperty(progress, 'offsetWidth', {
		get() {
			reflows.push(progress.hasAttribute('data-running'));
			return 0;
		},
	});
	assert.equal(progress.hasAttribute('data-running'), false);
	controls.setState({ playing: true, durationMs: 3000 });
	assert.equal(progress.hasAttribute('data-running'), true);
	assert.equal(progress.style.getPropertyValue('--slideshow-duration'), '3000ms');
	// 同じ長さが続けて届いても、計時の始め直しなので描き直す
	controls.setState({ playing: true, durationMs: null });
	assert.equal(progress.hasAttribute('data-running'), false);
	controls.setState({ playing: true, durationMs: 3000 });
	controls.setState({ playing: true, durationMs: 3000 });
	assert.deepEqual(reflows, [false, false, false]);
	assert.equal(progress.hasAttribute('data-running'), true);
	controls.setState({ playing: false, durationMs: null });
	assert.equal(progress.hasAttribute('data-running'), false);
	controls.dispose();
});

test('動きを減らす設定では進捗の線を走らせない', () => {
	const queries = [];
	const { controls, part } = build({
		matchMedia: (query) => {
			queries.push(query);
			return { matches: true };
		},
	});
	controls.setState({ playing: true, durationMs: 3000 });
	assert.equal(part('.slideshow-progress').hasAttribute('data-running'), false);
	assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)']);
	controls.dispose();
});

test('dispose で要素を外し、document と overlay のリスナとタイマーを片付ける', async () => {
	const { doc, overlay, stage, timer, calls, controls, part } = build();
	await part('.slideshow-speed').click();
	controls.dispose();
	assert.equal(find(stage, '.slideshow-controls'), null);
	assert.deepEqual(doc.listeners.pointerdown, []);
	assert.deepEqual(overlay.listeners.pointermove, []);
	assert.deepEqual(overlay.listeners.pointerdown, []);
	assert.deepEqual(timer.pending(), []);
	// 片付けた後に届いた操作では何も起こさない
	await overlay.dispatch('pointermove', {});
	assert.deepEqual(timer.pending(), []);
	assert.deepEqual(calls.panel, [true]);
	controls.dispose();
});

test('英語の文言で読み上げ名と秒数を出す', () => {
	const { controls, part } = build({ strings: createStrings('en') });
	assert.equal(controls.element.getAttribute('aria-label'), 'Auto-advance');
	assert.equal(part('.slideshow-toggle').getAttribute('aria-label'), 'Start auto-advance');
	assert.equal(part('.slideshow-speed-label').textContent, '3 s');
	controls.dispose();
});
