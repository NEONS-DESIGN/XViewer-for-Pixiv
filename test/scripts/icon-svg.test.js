import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	ICON_OUTPUTS,
	MIN_CARD_GAP_RATIO,
	getArtwork,
	buildIconSvg,
} from '../../scripts/icon-svg.mjs';

/** 図形データを持つ variant の一覧。 */
const VARIANTS = ['full', 'compact'];

/**
 * 矩形が canvas の内側に収まっているか。
 * @param {{x: number, y: number, w: number, h: number}} rect 矩形
 * @param {number} canvas 一辺の長さ
 * @returns {boolean} 収まっていれば true
 */
function inside(rect, canvas) {
	return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= canvas && rect.y + rect.h <= canvas;
}

test('Chrome が使う 4 サイズをすべて出力する', () => {
	const sizes = ICON_OUTPUTS.map((output) => output.size).sort((a, b) => a - b);
	assert.deepEqual(sizes, [16, 32, 48, 128]);
});

test('出力が指すのは定義済みの variant だけ', () => {
	for (const output of ICON_OUTPUTS) {
		assert.ok(VARIANTS.includes(output.variant), `未知の variant: ${output.variant}`);
	}
});

test('小さいサイズには compact、大きいサイズには full を割り当てる', () => {
	const variantOf = (size) => ICON_OUTPUTS.find((output) => output.size === size).variant;
	assert.equal(variantOf(16), 'compact');
	assert.equal(variantOf(32), 'compact');
	assert.equal(variantOf(48), 'full');
	assert.equal(variantOf(128), 'full');
});

test('SVG は canvas と同じ viewBox を持つ', () => {
	for (const variant of VARIANTS) {
		const { canvas } = getArtwork(variant);
		assert.match(buildIconSvg(variant), new RegExp(`viewBox="0 0 ${canvas} ${canvas}"`));
	}
});

test('SVG の背景はアクセント色で塗る', () => {
	for (const variant of VARIANTS) {
		const { background } = getArtwork(variant);
		assert.equal(background, '#4ea3d6');
		assert.ok(buildIconSvg(variant).includes(background));
	}
});

test('未知の variant は例外', () => {
	assert.throws(() => getArtwork('huge'), /variant/);
	assert.throws(() => buildIconSvg(undefined), /variant/);
});

test('カードは canvas からはみ出さない', () => {
	for (const variant of VARIANTS) {
		const { canvas, cards } = getArtwork(variant);
		for (const card of cards) {
			assert.ok(inside(card, canvas), `${variant} のカードが canvas の外に出ている`);
		}
	}
});

test('隣り合うカードは canvas の一定割合だけ離す (小さいサイズで団子にならないため)', () => {
	for (const variant of VARIANTS) {
		const { canvas, cards } = getArtwork(variant);
		const sorted = [...cards].sort((a, b) => a.x - b.x);
		for (let i = 1; i < sorted.length; i += 1) {
			const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
			assert.ok(
				gap >= canvas * MIN_CARD_GAP_RATIO,
				`${variant} のカードの隙間が狭い: ${gap}`,
			);
		}
	}
});

test('前面カードは左右の中心に置く', () => {
	for (const variant of VARIANTS) {
		const { canvas, cards } = getArtwork(variant);
		const front = cards.at(-1);
		assert.equal(front.x + front.w / 2, canvas / 2, `${variant} の前面カードが中心にない`);
	}
});

test('絵 (山・太陽) は前面カードの内側に収まる', () => {
	for (const variant of VARIANTS) {
		const { cards, mountain, sun } = getArtwork(variant);
		const front = cards.at(-1);
		const xs = mountain.map(([x]) => x);
		const ys = mountain.map(([, y]) => y);
		assert.ok(Math.min(...xs) >= front.x, `${variant} の山が左にはみ出している`);
		assert.ok(Math.max(...xs) <= front.x + front.w, `${variant} の山が右にはみ出している`);
		assert.ok(Math.min(...ys) >= front.y, `${variant} の山が上にはみ出している`);
		assert.ok(Math.max(...ys) <= front.y + front.h, `${variant} の山が下にはみ出している`);
		if (sun) {
			const box = { x: sun.cx - sun.r, y: sun.cy - sun.r, w: sun.r * 2, h: sun.r * 2 };
			assert.ok(box.x >= front.x && box.x + box.w <= front.x + front.w, `${variant} の太陽が左右にはみ出している`);
			assert.ok(box.y >= front.y && box.y + box.h <= front.y + front.h, `${variant} の太陽が上下にはみ出している`);
		}
	}
});

test('太陽と山は重ならない', () => {
	for (const variant of VARIANTS) {
		const { mountain, sun } = getArtwork(variant);
		if (!sun) continue;
		const peak = Math.min(...mountain.map(([, y]) => y));
		assert.ok(sun.cy + sun.r <= peak, `${variant} の太陽が山にめり込んでいる`);
	}
});

test('compact は太陽を描かない (16px では潰れるため)', () => {
	assert.equal(getArtwork('compact').sun, null);
	assert.notEqual(getArtwork('full').sun, null);
});
