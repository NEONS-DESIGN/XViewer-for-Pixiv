import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { buildOptionsFor, popupOptionsFor } from '../../scripts/build-options.mjs';
import { BROWSER_TARGETS } from '../../scripts/browsers.mjs';
import { fromRoot } from '../../scripts/paths.mjs';

/**
 * 配布する束の大きさの上限 (バイト)。出力先からの相対パスで引く。
 * 束が膨らむ変更 (使わない表や文言を丸ごと抱える等) を止めるための予算で、意図して増やすときはここを上げる。
 */
const BUNDLE_BUDGETS = Object.freeze({
	'content.js': 195_000,
	'inject.js': 6_000,
	'popup/popup.js': 38_000,
});

/**
 * 設定どおりに書き出さずに束ね、出力先からの相対パス (/ 区切り) ごとの大きさを返す。
 * @param {import('../../scripts/browsers.mjs').BrowserTarget} target 作るブラウザ
 * @returns {Promise<Map<string, number>>} 出力のパスと大きさ
 */
async function bundleSizes(target) {
	const outDir = fromRoot(target.outDir);
	const sizes = new Map();
	for (const options of [buildOptionsFor(target), popupOptionsFor(target)]) {
		const result = await build({ ...options, write: false, logLevel: 'silent' });
		for (const file of result.outputFiles) {
			sizes.set(path.relative(outDir, file.path).split(path.sep).join('/'), file.contents.length);
		}
	}
	return sizes;
}

for (const target of Object.values(BROWSER_TARGETS)) {
	test(`${target.name} の束は大きさの予算に収まる`, async () => {
		const sizes = await bundleSizes(target);
		for (const [file, budget] of Object.entries(BUNDLE_BUDGETS)) {
			assert.ok(sizes.has(file), `${file} が出力されていません`);
			assert.ok(sizes.get(file) <= budget, `${file} が ${sizes.get(file)} バイトあり、予算 ${budget} を超えている`);
		}
	});
}
