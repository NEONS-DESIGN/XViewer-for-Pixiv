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
	assert.equal(normalizeLanguage('ko-KR'), 'ko');
	assert.equal(normalizeLanguage('JA'), 'ja');
	assert.equal(normalizeLanguage('  ja  '), 'ja');
});

test('normalizeLanguage は中国語だけ繁体字と簡体字を分ける', () => {
	// pixiv は zh-CN / zh-TW を返す。(SITE_SPEC §0) ブラウザの UI 言語は地域や字体の付き方がまちまち
	for (const tag of ['zh-TW', 'zh-tw', 'zh_TW', 'zh-Hant', 'zh-Hant-TW', 'zh-HK', 'zh-MO', 'zh-Hant-HK']) {
		assert.equal(normalizeLanguage(tag), 'zh-TW', tag);
	}
	for (const tag of ['zh', 'zh-CN', 'zh-cn', 'zh_CN', 'zh-Hans', 'zh-Hans-CN', 'zh-SG', 'zh-Hans-HK']) {
		assert.equal(normalizeLanguage(tag), 'zh-CN', tag);
	}
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
	assert.equal(readPageLanguage({ documentElement: { lang: 'ko' } }), 'ko');
	assert.equal(readPageLanguage({ documentElement: { lang: 'zh-CN' } }), 'zh-CN');
	assert.equal(readPageLanguage({ documentElement: { lang: 'zh-TW' } }), 'zh-TW');
});

test('readPageLanguage は読めなければ null を返す', () => {
	assert.equal(readPageLanguage({ documentElement: { lang: '' } }), null);
	assert.equal(readPageLanguage({ documentElement: {} }), null);
	assert.equal(readPageLanguage({}), null);
	assert.equal(readPageLanguage(null), null);
	assert.equal(readPageLanguage(undefined), null);
});

test('uiLanguage は対応している言語をそのまま返す', () => {
	for (const language of ['ja', 'en', 'ko', 'zh-CN', 'zh-TW']) {
		assert.equal(uiLanguage(language), language);
	}
});

test('uiLanguage は未対応の言語を英語へ倒す', () => {
	// pixiv を日本語以外で読んでいる人に日本語を出しても通じない
	assert.equal(uiLanguage('th'), UNSUPPORTED_FALLBACK);
	assert.equal(uiLanguage('ms'), 'en');
	assert.equal(uiLanguage('fr'), 'en');
});

test('uiLanguage は判定に失敗したときだけ日本語へ倒す', () => {
	// 拡張側の異常。利用者の大半が日本語なので、突然英語を見せない
	assert.equal(uiLanguage(null), DEFAULT_LANGUAGE);
	assert.equal(uiLanguage(undefined), 'ja');
});

test('SUPPORTED_LANGUAGES は 5 言語', () => {
	assert.deepEqual([...SUPPORTED_LANGUAGES], ['ja', 'en', 'ko', 'zh-CN', 'zh-TW']);
	assert.ok(Object.isFrozen(SUPPORTED_LANGUAGES));
});
