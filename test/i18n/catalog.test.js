import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrings } from '../../src/i18n/index.js';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../../src/common/language.js';

/**
 * 値の種類を 1 語で表す。形の比較に使う。
 * @param {unknown} value 調べる値
 * @returns {string} 'function' / 'string' / 'array' / 'object'
 */
function kindOf(value) {
	if (typeof value === 'function') return 'function';
	if (Array.isArray(value)) return 'array';
	return typeof value;
}

/**
 * 2 つのカタログの形が同じであることを再帰的に確かめる。
 * @param {object} a 基準のカタログ
 * @param {object} b 比べるカタログ
 * @param {string} path 今見ている場所 (失敗時の手掛かり)
 * @returns {void}
 */
function assertSameShape(a, b, path) {
	assert.deepEqual(
		Object.keys(a).sort(),
		Object.keys(b).sort(),
		`${path} のキーが食い違っています`,
	);
	for (const key of Object.keys(a)) {
		const here = `${path}.${key}`;
		const [x, y] = [a[key], b[key]];
		assert.equal(kindOf(x), kindOf(y), `${here} の種類が食い違っています`);
		if (kindOf(x) === 'function') {
			// 既定値を書くと length が減る。カタログの関数に既定値を書かないこと
			assert.equal(x.length, y.length, `${here} の引数の数が食い違っています`);
		} else if (kindOf(x) === 'string') {
			assert.notEqual(x.trim(), '', `${here} が空です`);
			assert.notEqual(y.trim(), '', `${here} が空です`);
		} else if (kindOf(x) === 'array') {
			assert.equal(x.length, y.length, `${here} の要素数が食い違っています`);
			x.forEach((_, i) => assertSameShape({ [i]: x[i] }, { [i]: y[i] }, here));
		} else if (kindOf(x) === 'object') {
			assertSameShape(x, y, here);
		}
	}
}

test('すべての言語のカタログが同じ形を持つ', () => {
	const base = createStrings(DEFAULT_LANGUAGE);
	for (const lang of SUPPORTED_LANGUAGES) {
		if (lang === DEFAULT_LANGUAGE) continue;
		// lang の値だけは言語ごとに違ってよいので、形の比較からは外す
		const { lang: _baseLang, ...baseRest } = base;
		const { lang: _otherLang, ...otherRest } = createStrings(lang);
		assertSameShape(baseRest, otherRest, lang);
	}
});

test('カタログは自分の言語を持つ', () => {
	for (const lang of SUPPORTED_LANGUAGES) {
		assert.equal(createStrings(lang).lang, lang);
	}
});

test('未知の言語は既定の言語のカタログになる', () => {
	assert.equal(createStrings('ko').lang, DEFAULT_LANGUAGE);
	assert.equal(createStrings('').lang, DEFAULT_LANGUAGE);
	assert.equal(createStrings(undefined).lang, DEFAULT_LANGUAGE);
});

test('カタログは凍結されている', () => {
	assert.ok(Object.isFrozen(createStrings('ja')));
});

test('日時の書式が言語ごとに違う', () => {
	const iso = '2026-09-23T13:05:00+09:00';
	const ja = createStrings('ja').sidebar.formatDateTime(new Date(iso));
	const en = createStrings('en').sidebar.formatDateTime(new Date(iso));
	assert.equal(ja, '2026年9月23日 13:05');
	assert.notEqual(en, ja);
	assert.match(en, /2026/);
});
