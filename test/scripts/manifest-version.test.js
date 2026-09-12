import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toManifestVersion, applyVersion } from '../../scripts/manifest-version.mjs';

test('通常の version はそのまま通す', () => {
	assert.equal(toManifestVersion('0.1.0'), '0.1.0');
	assert.equal(toManifestVersion('1'), '1');
	assert.equal(toManifestVersion('2.10.2'), '2.10.2');
	assert.equal(toManifestVersion('3.1.2.4567'), '3.1.2.4567');
});

test('前後の空白を落とす', () => {
	assert.equal(toManifestVersion('  1.2.3\n'), '1.2.3');
});

test('semver の prerelease と build metadata を落とす', () => {
	assert.equal(toManifestVersion('0.2.0-beta.1'), '0.2.0');
	assert.equal(toManifestVersion('1.0.0+20260910'), '1.0.0');
	assert.equal(toManifestVersion('1.0.0-rc.1+build.7'), '1.0.0');
});

test('version が無い・空なら例外', () => {
	assert.throws(() => toManifestVersion(undefined), /version がありません/);
	assert.throws(() => toManifestVersion(''), /version がありません/);
	assert.throws(() => toManifestVersion('   '), /version がありません/);
});

test('成分が 5 個以上なら例外', () => {
	assert.throws(() => toManifestVersion('1.2.3.4.5'), /1-4 個の整数/);
});

test('整数でない成分は例外', () => {
	assert.throws(() => toManifestVersion('1.2.x'), /整数でないか/);
	assert.throws(() => toManifestVersion('1..2'), /整数でないか/);
	assert.throws(() => toManifestVersion('1.2.'), /整数でないか/);
});

test('0 で始まる非ゼロの成分は例外', () => {
	// Chrome の規則。032 は不正で、0 単体は正しい
	assert.throws(() => toManifestVersion('1.032.0'), /0 で始まっています/);
	assert.equal(toManifestVersion('1.0.0'), '1.0.0');
});

test('65535 を超える成分は例外', () => {
	assert.equal(toManifestVersion('1.65535.0'), '1.65535.0');
	assert.throws(() => toManifestVersion('1.65536.0'), /65535 以下/);
});

test('全ての成分が 0 なら例外', () => {
	assert.throws(() => toManifestVersion('0'), /全て 0 にはできません/);
	assert.throws(() => toManifestVersion('0.0.0.0'), /全て 0 にはできません/);
	assert.equal(toManifestVersion('0.1.0.0'), '0.1.0.0');
});

test('applyVersion は manifest に version を差し込む', () => {
	const manifest = { name: 'GridViewer for Pixiv', permissions: ['storage'] };
	const applied = applyVersion(manifest, '0.3.1');
	assert.equal(applied.version, '0.3.1');
	assert.equal(applied.name, 'GridViewer for Pixiv');
	assert.deepEqual(applied.permissions, ['storage']);
});

test('applyVersion は渡された manifest を書き換えない', () => {
	const manifest = { name: 'GridViewer for Pixiv' };
	applyVersion(manifest, '0.3.1');
	assert.equal('version' in manifest, false);
});

test('applyVersion は落とした prerelease を version_name に残す', () => {
	const applied = applyVersion({}, '0.3.0-beta.2');
	assert.equal(applied.version, '0.3.0');
	assert.equal(applied.version_name, '0.3.0-beta.2');
});

test('applyVersion は落とすものが無ければ version_name を付けない', () => {
	// version と同じ文字列を二重に並べても意味が無い
	const applied = applyVersion({}, '0.3.0');
	assert.equal('version_name' in applied, false);
});

test('applyVersion は雛形に version が残っていても上書きする', () => {
	const applied = applyVersion({ version: '9.9.9' }, '0.3.0');
	assert.equal(applied.version, '0.3.0');
});
