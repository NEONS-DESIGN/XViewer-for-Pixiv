import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	ENTRY_POINTS,
	POPUP_CHUNK_DIR,
	buildOptionsFor,
	popupOptionsFor,
	planFailureCleanup,
} from '../../scripts/build-options.mjs';
import { BROWSER_TARGETS } from '../../scripts/browsers.mjs';
import { PACKAGE_JSON, readJson } from '../../scripts/json.mjs';
import { ROOT_DIR, fromRoot } from '../../scripts/paths.mjs';
import { removeStaleChunks, staleChunksPlugin } from '../../scripts/stale-chunks-plugin.mjs';

const CHROME = BROWSER_TARGETS.chrome;
const FIREFOX = BROWSER_TARGETS.firefox;

/**
 * 一時フォルダを作り、テストの終わりに消す。
 * @param {import('node:test').TestContext} t テストの文脈
 * @returns {Promise<string>} 一時フォルダ
 */
async function tempDir(t) {
	const dir = await mkdtemp(path.join(tmpdir(), 'xviewer-build-options-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

test('ROOT_DIR はこのリポジトリのルートを指す', () => {
	const expected = fileURLToPath(new URL('../../', import.meta.url));
	assert.equal(path.resolve(ROOT_DIR), path.resolve(expected));
	assert.ok(existsSync(fromRoot(PACKAGE_JSON)));
	assert.ok(path.isAbsolute(fromRoot('src', 'manifest.json')));
});

test('readJson は中身を返し、失敗にはファイルの場所を付ける', async (t) => {
	const dir = await tempDir(t);
	const good = path.join(dir, 'good.json');
	const broken = path.join(dir, 'broken.json');
	await writeFile(good, '{"version":"1.2.3"}');
	await writeFile(broken, '{');
	assert.deepEqual(await readJson(good), { version: '1.2.3' });
	await assert.rejects(readJson(broken), (error) => error.message.includes(broken) && /JSON として読めません/.test(error.message));
	const missing = path.join(dir, 'missing.json');
	await assert.rejects(readJson(missing), (error) => error.message.includes(missing) && /読めません/.test(error.message));
});

test('esbuild の設定はリポジトリのルートを作業フォルダにする', () => {
	// カレントがどこでも、入口と出力先をルートから解かせる
	for (const options of [buildOptionsFor(CHROME), popupOptionsFor(CHROME), buildOptionsFor(FIREFOX, { watch: true })]) {
		assert.equal(options.absWorkingDir, ROOT_DIR);
	}
	for (const entry of Object.values(ENTRY_POINTS)) {
		assert.ok(existsSync(fromRoot(entry)), `${entry} がありません`);
	}
	assert.equal(buildOptionsFor(CHROME).outdir, CHROME.outDir);
	assert.equal(buildOptionsFor(FIREFOX).outdir, FIREFOX.outDir);
});

test('監視モードでだけ縮めず、popup に古い断片を消すプラグインを足す', () => {
	assert.equal(buildOptionsFor(CHROME).minify, true);
	assert.equal(buildOptionsFor(CHROME, { watch: true }).minify, false);
	const names = (options) => options.plugins.map((plugin) => plugin.name);
	assert.deepEqual(names(popupOptionsFor(CHROME)), ['css-text']);
	assert.deepEqual(names(popupOptionsFor(CHROME, { watch: true })), ['css-text', 'stale-chunks']);
	// content / inject は分割しないので断片が出ない
	assert.deepEqual(names(buildOptionsFor(CHROME, { watch: true })), ['css-text']);
	assert.equal(popupOptionsFor(CHROME).chunkNames, `${POPUP_CHUNK_DIR}/[name]-[hash]`);
	assert.equal(popupOptionsFor(CHROME).format, 'esm');
	assert.equal(popupOptionsFor(CHROME).splitting, true);
});

test('失敗したときは手を付けて作り終えていない出力先だけを消す', () => {
	const targets = [CHROME, FIREFOX];
	const actions = (started, completed) =>
		planFailureCleanup(targets, new Set(started), new Set(completed)).map(({ target, action }) => [target.name, action]);
	// package.json の version の誤りなど、出力先に手を付ける前に落ちたら何も消さない
	assert.deepEqual(actions([], []), [['chrome', 'untouched'], ['firefox', 'untouched']]);
	// Chrome 系の途中で落ちたら dist だけを消す。dist-firefox は前回のまま
	assert.deepEqual(actions(['chrome'], []), [['chrome', 'remove'], ['firefox', 'untouched']]);
	// Firefox 側で落ちたら dist は残す
	assert.deepEqual(actions(['chrome', 'firefox'], ['chrome']), [['chrome', 'completed'], ['firefox', 'remove']]);
});

test('removeStaleChunks は残す一覧に無いファイルだけを消す', async (t) => {
	const dir = await tempDir(t);
	const keep = path.join(dir, 'ja-NEW.js');
	const stale = path.join(dir, 'ja-OLD.js');
	await writeFile(keep, '');
	await writeFile(stale, '');
	await mkdir(path.join(dir, 'sub'));
	assert.deepEqual(await removeStaleChunks(dir, new Set([keep])), [stale]);
	assert.deepEqual((await readdir(dir)).sort(), ['ja-NEW.js', 'sub']);
	// フォルダが無ければ何もしない
	assert.deepEqual(await removeStaleChunks(path.join(dir, 'missing'), new Set()), []);
});

test('staleChunksPlugin は metafile を有効にし、成功したビルドの出力に無い断片を消す', async (t) => {
	const dir = await tempDir(t);
	const chunkDir = path.join(dir, 'dist', 'popup', 'chunks');
	await mkdir(chunkDir, { recursive: true });
	await writeFile(path.join(chunkDir, 'ja-NEW.js'), '');
	await writeFile(path.join(chunkDir, 'ja-OLD.js'), '');

	let onEnd;
	const build = { initialOptions: { absWorkingDir: dir }, onEnd: (callback) => { onEnd = callback; } };
	staleChunksPlugin('dist/popup/chunks').setup(build);
	assert.equal(build.initialOptions.metafile, true);

	// 失敗したビルドには metafile が無い。何も消さない
	await onEnd({ errors: [{}] });
	assert.deepEqual((await readdir(chunkDir)).sort(), ['ja-NEW.js', 'ja-OLD.js']);

	// metafile の出力は作業フォルダからの相対パス (/ 区切り) で来る
	await onEnd({ errors: [], metafile: { outputs: { 'dist/popup/popup.js': {}, 'dist/popup/chunks/ja-NEW.js': {} } } });
	assert.deepEqual(await readdir(chunkDir), ['ja-NEW.js']);
});
