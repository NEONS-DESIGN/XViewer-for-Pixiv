import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
	ESBUILD_TARGET,
	MINIMUM_CHROME_MAJOR,
	MINIMUM_CHROME_VERSION,
	ESBUILD_TARGET_FIREFOX,
	MINIMUM_FIREFOX_MAJOR,
	FIREFOX_STRICT_MIN_VERSION,
} from '../../scripts/targets.mjs';

const manifest = JSON.parse(await readFile(new URL('../../src/manifest.json', import.meta.url), 'utf8'));

test('esbuild の target と minimum_chrome_version は同じメジャーバージョンから作る', () => {
	assert.equal(ESBUILD_TARGET, `chrome${MINIMUM_CHROME_MAJOR}`);
	assert.equal(MINIMUM_CHROME_VERSION, String(MINIMUM_CHROME_MAJOR));
	assert.match(MINIMUM_CHROME_VERSION, /^[1-9]\d*$/);
});

test('"world": "MAIN" が効く版 (111) より古い Chrome を許さない', () => {
	// これより古いと inject.js が isolated world で走り、history のフックが効かないまま黙って壊れる
	assert.ok(MINIMUM_CHROME_MAJOR >= 111);
});

test('雛形の manifest はビルドが差し込むキーを持たない', () => {
	// 出どころが 2 つに割れるのを防ぐ。差し込みは build.mjs (version / minimum_chrome_version)
	for (const key of ['version', 'version_name', 'minimum_chrome_version']) {
		assert.equal(key in manifest, false, `src/manifest.json に ${key} がある`);
	}
});

test('Firefox の esbuild の target と strict_min_version は同じメジャーバージョンから作る', () => {
	assert.equal(ESBUILD_TARGET_FIREFOX, `firefox${MINIMUM_FIREFOX_MAJOR}`);
	assert.equal(FIREFOX_STRICT_MIN_VERSION, `${MINIMUM_FIREFOX_MAJOR}.0`);
});

test('Firefox の下限は "world": "MAIN" (128) と data_collection_permissions (140) を満たす', () => {
	assert.ok(MINIMUM_FIREFOX_MAJOR >= 140);
});

test('雛形の manifest は Firefox 用のキーを持たない (Chrome 系の出力へ漏らさない)', () => {
	assert.equal('browser_specific_settings' in manifest, false);
});
