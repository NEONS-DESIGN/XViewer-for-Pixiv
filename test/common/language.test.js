import test from 'node:test';
import assert from 'node:assert/strict';
import {
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
	UNSUPPORTED_FALLBACK,
	normalizeLanguage,
	readPageLanguage,
	uiLanguage,
} from '../../src/common/language.js';

test('normalizeLanguage は BCP 47 を言語サブタグへ切り詰める', () => {
	assert.equal(normalizeLanguage('en'), 'en');
	assert.equal(normalizeLanguage('en-US'), 'en');
	assert.equal(normalizeLanguage('zh-Hant-TW'), 'zh');
	assert.equal(normalizeLanguage('JA'), 'ja');
	assert.equal(normalizeLanguage('  ja  '), 'ja');
});

test('normalizeLanguage は読めない値に null を返す', () => {
	assert.equal(normalizeLanguage(''), null);
	assert.equal(normalizeLanguage('   '), null);
	assert.equal(normalizeLanguage(undefined), null);
	assert.equal(normalizeLanguage(null), null);
	assert.equal(normalizeLanguage(123), null);
	assert.equal(normalizeLanguage('-'), null);
});

test('readPageLanguage は documentElement.lang を読む', () => {
	assert.equal(readPageLanguage({ documentElement: { lang: 'en' } }), 'en');
	assert.equal(readPageLanguage({ documentElement: { lang: 'ja' } }), 'ja');
	assert.equal(readPageLanguage({ documentElement: { lang: 'zh-TW' } }), 'zh');
});

test('readPageLanguage は読めなければ null を返す', () => {
	assert.equal(readPageLanguage({ documentElement: { lang: '' } }), null);
	assert.equal(readPageLanguage({ documentElement: {} }), null);
	assert.equal(readPageLanguage({}), null);
	assert.equal(readPageLanguage(null), null);
	assert.equal(readPageLanguage(undefined), null);
});

test('uiLanguage は対応している言語をそのまま返す', () => {
	assert.equal(uiLanguage('ja'), 'ja');
	assert.equal(uiLanguage('en'), 'en');
});

test('uiLanguage は未対応の言語を英語へ倒す', () => {
	// pixiv を日本語以外で読んでいる人に日本語を出しても通じない
	assert.equal(uiLanguage('ko'), UNSUPPORTED_FALLBACK);
	assert.equal(uiLanguage('zh'), 'en');
	assert.equal(uiLanguage('th'), 'en');
});

test('uiLanguage は判定に失敗したときだけ日本語へ倒す', () => {
	// 拡張側の異常。利用者の大半が日本語なので、突然英語を見せない
	assert.equal(uiLanguage(null), DEFAULT_LANGUAGE);
	assert.equal(uiLanguage(undefined), 'ja');
});

test('SUPPORTED_LANGUAGES は ja と en の 2 つ', () => {
	assert.deepEqual([...SUPPORTED_LANGUAGES], ['ja', 'en']);
	assert.ok(Object.isFrozen(SUPPORTED_LANGUAGES));
});
