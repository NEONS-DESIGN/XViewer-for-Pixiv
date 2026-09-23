import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripLocale, localePrefix, currentLocalePrefix } from '../../src/common/locale.js';
import { LOCALE_PREFIXES, ARTWORK_LINK_SELECTOR } from '../../src/common/constants.js';

test('英語表示の接頭辞を落とす', () => {
	// SITE_SPEC §3 実測。英語にすると全てのパスの先頭へ /en が挟まる
	assert.equal(stripLocale('/en/users/11'), '/users/11');
	assert.equal(stripLocale('/en/users/11/illustrations'), '/users/11/illustrations');
	assert.equal(stripLocale('/en/artworks/149425016'), '/artworks/149425016');
	assert.equal(stripLocale('/en'), '');
	assert.equal(stripLocale('/en/'), '/');
});

test('日本語のパスはそのまま', () => {
	assert.equal(stripLocale('/users/11'), '/users/11');
	assert.equal(stripLocale('/artworks/149425016'), '/artworks/149425016');
	assert.equal(stripLocale('/'), '/');
});

test('接頭辞に見えるだけのパスは落とさない', () => {
	// 区切りか終端が続くことを求めているので、先頭 2 文字が一致するだけでは当たらない
	assert.equal(stripLocale('/entry/1'), '/entry/1');
	assert.equal(stripLocale('/enquete'), '/enquete');
	// 途中に現れる /en は接頭辞ではない
	assert.equal(stripLocale('/users/11/en/artworks'), '/users/11/en/artworks');
});

test('パスとして読めない値は空文字にする', () => {
	assert.equal(stripLocale(null), '');
	assert.equal(stripLocale(undefined), '');
	assert.equal(localePrefix(null), '');
});

test('接頭辞そのものを取り出す', () => {
	assert.equal(localePrefix('/en/users/11'), '/en');
	assert.equal(localePrefix('/en'), '/en');
	assert.equal(localePrefix('/users/11'), '');
	assert.equal(localePrefix('/entry/1'), '');
});

test('今見ているページの接頭辞を読む', () => {
	assert.equal(currentLocalePrefix({ location: { pathname: '/en/users/11' } }), '/en');
	assert.equal(currentLocalePrefix({ location: { pathname: '/users/11' } }), '');
	// location を持たないもの (テストの偽 document など) は日本語と同じ扱いにする
	assert.equal(currentLocalePrefix({}), '');
	assert.equal(currentLocalePrefix(null), '');
});

test('作品リンクのセレクタは接頭辞ごとに 1 本ずつ並ぶ', () => {
	const parts = ARTWORK_LINK_SELECTOR.split(',');
	assert.equal(parts.length, LOCALE_PREFIXES.length + 1, '日本語 + 接頭辞の数だけ要る');
	assert.ok(parts.includes('a[href^="/artworks/"]'));
	for (const locale of LOCALE_PREFIXES) {
		assert.ok(parts.includes(`a[href^="/${locale}/artworks/"]`), `${locale} 用が無い`);
	}
	// クラス名 (sc-xxxx) は掴まない。前方一致だけに留める
	assert.doesNotMatch(ARTWORK_LINK_SELECTOR, /sc-/);
	assert.doesNotMatch(ARTWORK_LINK_SELECTOR, /\[href\*=/);
});
