import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BROWSER_TARGETS, DEFAULT_TARGET_NAMES, FIREFOX_ADDON_ID, resolveTargets } from '../../scripts/browsers.mjs';
import { OUT_DIR, FIREFOX_OUT_DIR, STATIC_FILES, staticFilesFor } from '../../scripts/static-files.mjs';
import { ESBUILD_TARGET, ESBUILD_TARGET_FIREFOX, MINIMUM_CHROME_VERSION, FIREFOX_STRICT_MIN_VERSION } from '../../scripts/targets.mjs';

const template = JSON.parse(await readFile(new URL('../../src/manifest.json', import.meta.url), 'utf8'));

test('--target を省けば Chrome 系と Firefox の両方を Chrome 系から作る', () => {
	assert.deepEqual(resolveTargets([]).map((target) => target.name), ['chrome', 'firefox']);
	assert.deepEqual([...DEFAULT_TARGET_NAMES], ['chrome', 'firefox']);
	// --watch のような他の引数は無視する
	assert.deepEqual(resolveTargets(['--watch']).map((target) => target.name), ['chrome', 'firefox']);
});

test('--target で片方だけを選べる', () => {
	assert.deepEqual(resolveTargets(['--target=chrome']).map((target) => target.name), ['chrome']);
	assert.deepEqual(resolveTargets(['--target', 'firefox']).map((target) => target.name), ['firefox']);
	// 並びと重複は表の順に揃える
	assert.deepEqual(resolveTargets(['--target=firefox,chrome,firefox']).map((target) => target.name), ['chrome', 'firefox']);
});

test('--target の値が無い・知らない名前なら止める', () => {
	assert.throws(() => resolveTargets(['--target=']), /値がありません/);
	assert.throws(() => resolveTargets(['--target']), /値がありません/);
	assert.throws(() => resolveTargets(['--target=safari']), /知らない --target/);
	// Object.prototype のキーを名前として通さない
	assert.throws(() => resolveTargets(['--target=toString']), /知らない --target/);
});

test('出力先はブラウザごとに分かれ、Chrome 系は今までどおり dist', () => {
	assert.equal(BROWSER_TARGETS.chrome.outDir, 'dist');
	assert.equal(BROWSER_TARGETS.chrome.outDir, OUT_DIR);
	assert.equal(BROWSER_TARGETS.firefox.outDir, FIREFOX_OUT_DIR);
	assert.notEqual(OUT_DIR, FIREFOX_OUT_DIR);
	assert.equal(BROWSER_TARGETS.chrome.esbuildTarget, ESBUILD_TARGET);
	assert.equal(BROWSER_TARGETS.firefox.esbuildTarget, ESBUILD_TARGET_FIREFOX);
});

test('Chrome 系の manifest は雛形に version と minimum_chrome_version を足しただけ (Firefox のキーを持たない)', () => {
	const built = BROWSER_TARGETS.chrome.buildManifest(template, '1.2.3');
	assert.deepEqual(built, { ...template, version: '1.2.3', minimum_chrome_version: MINIMUM_CHROME_VERSION });
	assert.equal('browser_specific_settings' in built, false);
});

test('Firefox の manifest は gecko の設定を持ち、minimum_chrome_version を持たない', () => {
	const built = BROWSER_TARGETS.firefox.buildManifest(template, '1.2.3-beta.1');
	assert.equal(built.version, '1.2.3');
	assert.equal(built.version_name, '1.2.3-beta.1');
	assert.equal('minimum_chrome_version' in built, false);
	assert.deepEqual(built.browser_specific_settings.gecko, {
		id: FIREFOX_ADDON_ID,
		strict_min_version: FIREFOX_STRICT_MIN_VERSION,
		data_collection_permissions: { required: ['none'] },
	});
	// 雛形のほかのキーはそのまま
	assert.deepEqual(built.content_scripts, template.content_scripts);
	assert.deepEqual(built.permissions, template.permissions);
});

test('Firefox へコピーする静的ファイルは Chrome 系と同じ中身で、置き場所だけが違う', () => {
	const firefox = staticFilesFor(FIREFOX_OUT_DIR);
	assert.equal(firefox.length, STATIC_FILES.length);
	STATIC_FILES.forEach(([from, to], at) => {
		assert.equal(firefox[at][0], from);
		assert.equal(firefox[at][1], `${FIREFOX_OUT_DIR}${to.slice(OUT_DIR.length)}`);
		assert.ok(to.startsWith(`${OUT_DIR}/`));
	});
});

test('--target と --watch 以外の引数は打ち間違いとして止める', () => {
	assert.throws(() => resolveTargets(['--targets=chrome']), /知らない引数/);
	assert.throws(() => resolveTargets(['-t', 'chrome']), /知らない引数/);
	assert.throws(() => resolveTargets(['chrome']), /知らない引数/);
	assert.deepEqual(resolveTargets(['--target', 'chrome', '--watch']).map((target) => target.name), ['chrome']);
	assert.deepEqual(resolveTargets(['--watch', '--target=firefox']).map((target) => target.name), ['firefox']);
	// --target の次が別の引数なら、それを名前として扱って止める
	assert.throws(() => resolveTargets(['--target', '--watch']), /知らない --target/);
});

test('雛形に browser_specific_settings があれば Chrome 系のビルドでも止める (dist と CRX へ漏らさない)', () => {
	const tainted = { ...template, browser_specific_settings: { gecko: { id: 'a@b' } } };
	assert.throws(() => BROWSER_TARGETS.chrome.buildManifest(tainted, '1.0.0'), /browser_specific_settings を書かないでください/);
	assert.throws(() => BROWSER_TARGETS.firefox.buildManifest(tainted, '1.0.0'), /browser_specific_settings を書かないでください/);
});

test('雛形に minimum_chrome_version があれば Firefox のビルドでも止める', () => {
	const tainted = { ...template, minimum_chrome_version: '120' };
	assert.throws(() => BROWSER_TARGETS.firefox.buildManifest(tainted, '1.0.0'), /minimum_chrome_version を書かないでください/);
	assert.throws(() => BROWSER_TARGETS.chrome.buildManifest(tainted, '1.0.0'), /minimum_chrome_version を書かないでください/);
});
