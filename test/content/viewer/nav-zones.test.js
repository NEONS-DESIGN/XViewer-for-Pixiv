import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneAt, createNavZones, NAV_ZONE_IDLE } from '../../../src/content/viewer/nav-zones.js';
import { NAV_ZONES, NAV_ZONE_KINDS } from '../../../src/common/constants.js';
import { fakeElement, flush } from '../../helpers/dom.js';

/** ステージの矩形。幅 1000 / 高さ 800 で、左上が (100, 50) */
const RECT = Object.freeze({ left: 100, top: 50, width: 1000, height: 800 });

test('zoneAt: 割合を渡すとその幅で判定する', () => {
	// 幅 1000 の 40% は左端から 400 (x = 500) まで
	assert.equal(zoneAt(499, 450, RECT, NAV_ZONES.HORIZONTAL, 0.4), NAV_ZONE_KINDS.PREV_PAGE);
	assert.equal(zoneAt(501, 450, RECT, NAV_ZONES.HORIZONTAL, 0.4), null);
	assert.equal(zoneAt(260, 450, RECT, NAV_ZONES.HORIZONTAL, 0.15), null);
	// 高さ 800 の 15% は下端から 120 (y = 730) まで
	assert.equal(zoneAt(600, 731, RECT, NAV_ZONES.VERTICAL, 0.15), NAV_ZONE_KINDS.NEXT_WORK);
	assert.equal(zoneAt(600, 729, RECT, NAV_ZONES.VERTICAL, 0.15), null);
});

test('zoneAt: 左右は幅 25% の中でページを送る', () => {
	assert.equal(zoneAt(100, 450, RECT, NAV_ZONES.HORIZONTAL), NAV_ZONE_KINDS.PREV_PAGE);
	assert.equal(zoneAt(349, 450, RECT, NAV_ZONES.HORIZONTAL), NAV_ZONE_KINDS.PREV_PAGE);
	assert.equal(zoneAt(351, 450, RECT, NAV_ZONES.HORIZONTAL), null);
	assert.equal(zoneAt(851, 450, RECT, NAV_ZONES.HORIZONTAL), NAV_ZONE_KINDS.NEXT_PAGE);
	assert.equal(zoneAt(600, 60, RECT, NAV_ZONES.HORIZONTAL), null, '左右だけのときは上端でも作品を送らない');
});

test('zoneAt: 上下は高さ 25% の中で作品を送る。幅いっぱいに効く', () => {
	assert.equal(zoneAt(110, 60, RECT, NAV_ZONES.VERTICAL), NAV_ZONE_KINDS.PREV_WORK);
	assert.equal(zoneAt(600, 840, RECT, NAV_ZONES.VERTICAL), NAV_ZONE_KINDS.NEXT_WORK);
	assert.equal(zoneAt(110, 450, RECT, NAV_ZONES.VERTICAL), null, '上下だけのときは左端でもページを送らない');
});

test('zoneAt: 左右上下では四隅を左右 (ページ) に渡す', () => {
	assert.equal(zoneAt(110, 60, RECT, NAV_ZONES.BOTH), NAV_ZONE_KINDS.PREV_PAGE);
	assert.equal(zoneAt(1090, 840, RECT, NAV_ZONES.BOTH), NAV_ZONE_KINDS.NEXT_PAGE);
	assert.equal(zoneAt(600, 60, RECT, NAV_ZONES.BOTH), NAV_ZONE_KINDS.PREV_WORK);
	assert.equal(zoneAt(600, 840, RECT, NAV_ZONES.BOTH), NAV_ZONE_KINDS.NEXT_WORK);
	assert.equal(zoneAt(600, 450, RECT, NAV_ZONES.BOTH), null, '中央は領域ではない');
});

test('zoneAt: オフ・壊れた値・ステージの外・大きさの無い矩形では null', () => {
	assert.equal(zoneAt(110, 450, RECT, NAV_ZONES.OFF), null);
	assert.equal(zoneAt(110, 450, RECT, 'diagonal'), null);
	assert.equal(zoneAt(90, 450, RECT, NAV_ZONES.BOTH), null, 'ステージの左の外');
	assert.equal(zoneAt(1110, 450, RECT, NAV_ZONES.BOTH), null, 'ステージの右の外 (サイドバー側)');
	assert.equal(zoneAt(110, 450, { ...RECT, width: 0 }, NAV_ZONES.BOTH), null);
	assert.equal(zoneAt(110, 450, null, NAV_ZONES.BOTH), null);
	assert.equal(zoneAt(Number.NaN, 450, RECT, NAV_ZONES.BOTH), null);
});

/**
 * ステージと依存の代わりを組み立てる。
 * @param {object} [options] 差し替え
 * @param {string} [options.mode] 設定 navZones
 * @param {number[]} [options.pages] 送れるページの向き
 * @param {number[]} [options.works] 送れる作品の向き
 * @param {() => void} [options.onMovePage] ページを送ったときに状態を変える
 * @returns {object} ステージ・状態・記録・ゾーン
 */
function build({ mode = NAV_ZONES.BOTH, pages = [-1, 1], works = [-1, 1], onMovePage = () => {} } = {}) {
	const stage = fakeElement('div');
	stage.getBoundingClientRect = () => RECT;
	const state = { mode, pages, works };
	const moved = [];
	const zones = createNavZones({
		stage,
		getMode: () => state.mode,
		canMovePage: (direction) => state.pages.includes(direction),
		canMoveWork: (direction) => state.works.includes(direction),
		movePage: (direction) => { moved.push(['page', direction]); onMovePage(); },
		moveWork: async (direction) => { moved.push(['work', direction]); },
	});
	return { stage, state, moved, zones };
}

/**
 * ポインタのイベントの代わり。道筋は target からステージまで。
 * @param {object} stage ステージ
 * @param {number} x clientX
 * @param {number} y clientY
 * @param {object} [target] 押された要素。既定はステージ
 * @returns {object} event の代わり
 */
function pointer(stage, x, y, target = stage) {
	const path = target === stage ? [stage] : [target, stage];
	return {
		clientX: x,
		clientY: y,
		target,
		stopped: 0,
		composedPath: () => path,
		stopImmediatePropagation() { this.stopped += 1; },
	};
}

/**
 * 押して離す。pointerdown と click を同じ場所で送る。
 * @param {object} stage ステージ
 * @param {number} x clientX
 * @param {number} y clientY
 * @param {object} [target] 押された要素
 * @returns {Promise<object>} click の event
 */
async function press(stage, x, y, target) {
	await stage.dispatch('pointerdown', pointer(stage, x, y, target));
	const click = pointer(stage, x, y, target);
	await stage.dispatch('click', click);
	await flush();
	return click;
}

test('領域を押すとページ・作品を送り、閉じる処理へは流さない', async () => {
	const { stage, moved } = build();
	const left = await press(stage, 110, 450);
	assert.equal(left.stopped, 1);
	await press(stage, 1090, 450);
	await press(stage, 600, 60);
	await press(stage, 600, 840);
	assert.deepEqual(moved, [['page', -1], ['page', 1], ['work', -1], ['work', 1]]);
});

test('画像の上でも領域なら送る。原寸表示へは流さない', async () => {
	const { stage, moved } = build();
	const click = await press(stage, 110, 450, fakeElement('img'));
	assert.deepEqual(moved, [['page', -1]]);
	assert.equal(click.stopped, 1);
});

test('ボタンとリンクの上では領域より部品を優先する', async () => {
	const { stage, moved } = build();
	for (const tag of ['button', 'a']) {
		const click = await press(stage, 110, 60, fakeElement(tag));
		assert.equal(click.stopped, 0, tag);
	}
	assert.deepEqual(moved, []);
});

test('中央は今までどおり (止めない・送らない)', async () => {
	const { stage, moved } = build();
	const click = await press(stage, 600, 450);
	assert.equal(click.stopped, 0);
	assert.deepEqual(moved, []);
});

test('押し始めと離した領域が違えば送らない。閉じる処理へも流さない', async () => {
	const { stage, moved } = build();
	await stage.dispatch('pointerdown', pointer(stage, 110, 450));
	const click = pointer(stage, 600, 450);
	await stage.dispatch('click', click);
	assert.deepEqual(moved, []);
	assert.equal(click.stopped, 1);
});

test('端に着いた向きは送らず止めるだけ。どちらにも送れない領域は領域として扱わない', async () => {
	const { stage, state, moved } = build({ pages: [-1] });
	const atEnd = await press(stage, 1090, 450);
	assert.equal(atEnd.stopped, 1, '最後のページの右で押しても閉じない');
	state.pages = [];
	const single = await press(stage, 1090, 450);
	assert.equal(single.stopped, 0, '1 枚の作品では今までどおり');
	assert.deepEqual(moved, []);
});

test('ポインタの下の領域を data-nav-zone に書き、部品の上と外では外す', async () => {
	const { stage, state, zones } = build({ pages: [1] });
	await stage.dispatch('pointermove', pointer(stage, 1090, 450));
	assert.equal(stage.dataset.navZone, NAV_ZONE_KINDS.NEXT_PAGE);
	await stage.dispatch('pointermove', pointer(stage, 110, 450));
	assert.equal(stage.dataset.navZone, NAV_ZONE_IDLE, '前へは送れないので既定のカーソル');
	await stage.dispatch('pointermove', pointer(stage, 600, 60));
	assert.equal(stage.dataset.navZone, NAV_ZONE_KINDS.PREV_WORK);
	await stage.dispatch('pointermove', pointer(stage, 600, 60, fakeElement('button')));
	assert.equal(stage.dataset.navZone, undefined);
	await stage.dispatch('pointermove', pointer(stage, 600, 60));
	state.mode = NAV_ZONES.OFF;
	zones.refresh();
	assert.equal(stage.dataset.navZone, undefined, '設定をオフにしたら外す');
	state.mode = NAV_ZONES.BOTH;
	zones.refresh();
	assert.equal(stage.dataset.navZone, NAV_ZONE_KINDS.PREV_WORK);
	await stage.dispatch('pointerleave', {});
	assert.equal(stage.dataset.navZone, undefined);
});

test('ページを送った後は同じ位置でカーソルを描き直す', async () => {
	// 2 枚の作品の 1 枚目。送ると最後のページに着く
	const { stage, state, moved } = build({ pages: [1], onMovePage: () => { state.pages = [-1]; } });
	await stage.dispatch('pointermove', pointer(stage, 1090, 450));
	assert.equal(stage.dataset.navZone, NAV_ZONE_KINDS.NEXT_PAGE);
	await press(stage, 1090, 450);
	assert.deepEqual(moved, [['page', 1]]);
	assert.equal(stage.dataset.navZone, NAV_ZONE_IDLE);
});

test('オフでは何もしない (測りもしない)', async () => {
	const { stage, moved } = build({ mode: NAV_ZONES.OFF });
	stage.getBoundingClientRect = () => { throw new Error('測ってはいけない'); };
	const click = await press(stage, 110, 450);
	await stage.dispatch('pointermove', pointer(stage, 110, 450));
	assert.equal(click.stopped, 0);
	assert.deepEqual(moved, []);
	assert.equal(stage.dataset.navZone, undefined);
});
