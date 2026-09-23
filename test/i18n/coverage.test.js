/**
 * コード側の定数とカタログの名前空間が 1 対 1 であることを確かめる。
 *
 * catalog.test.js の「すべての言語のカタログが同じ形を持つ」は ja と en を互いに比べるだけなので、
 * 両方から同じキーが揃って落ちても検出できない。(例えば sections.js が field を 1 つ削り、
 * ja.js と en.js の両方から対応するキーも削れば、あちらのテストは通ってしまう)
 * ここでは逆に、コード側 (createSections の key / THEME_TOGGLE の labelKey / THIRD_PARTY の name /
 * infinite.js の失敗状態) を基準にして、カタログの名前空間がそれと過不足なく一致するかを確かめる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStrings } from '../../src/i18n/index.js';
import { SUPPORTED_LANGUAGES } from '../../src/common/language.js';
import { createSections } from '../../src/popup/sections.js';
import { THEME_TOGGLE } from '../../src/common/constants.js';
import { THIRD_PARTY } from '../../src/common/licenses.js';
import { SENTINEL_TEXT_KEYS } from '../../src/content/infinite.js';

/**
 * 2 つの集合が一致することを確かめる。
 * 「足りない」と「余分」の両方が分かるよう、差分をメッセージに含める。
 * @param {Iterable<string>} actual 実際の集合
 * @param {Iterable<string>} expected 期待する集合
 * @param {string} label 失敗時の手掛かり
 * @returns {void}
 */
function assertSameKeySet(actual, expected, label) {
	const actualSet = new Set(actual);
	const expectedSet = new Set(expected);
	const missing = [...expectedSet].filter((key) => !actualSet.has(key));
	const extra = [...actualSet].filter((key) => !expectedSet.has(key));
	assert.deepEqual(
		{ missing, extra },
		{ missing: [], extra: [] },
		`${label}: missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
	);
}

test('createSections の全 field の key が strings.popup.fields のキーと一致する', () => {
	for (const lang of SUPPORTED_LANGUAGES) {
		const strings = createStrings(lang);
		const fieldKeys = createSections(strings).flatMap((section) => section.fields.map((field) => field.key));
		assertSameKeySet(fieldKeys, Object.keys(strings.popup.fields), `[${lang}] popup.fields`);
	}
});

test('THEME_TOGGLE の labelKey が strings.theme のキーと一致する', () => {
	const labelKeys = Object.values(THEME_TOGGLE).map((entry) => entry.labelKey);
	for (const lang of SUPPORTED_LANGUAGES) {
		const strings = createStrings(lang);
		assertSameKeySet(Object.keys(strings.theme), labelKeys, `[${lang}] theme`);
	}
});

test('THIRD_PARTY の name が strings.licenses.notes のキーと一致する', () => {
	const names = THIRD_PARTY.map((entry) => entry.name);
	for (const lang of SUPPORTED_LANGUAGES) {
		const strings = createStrings(lang);
		assertSameKeySet(Object.keys(strings.licenses.notes), names, `[${lang}] licenses.notes`);
	}
});

test('strings.infinite が infinite.js の sentinel が引くキーと一致する', () => {
	// 他の 3 本と同じく、コード側 (SENTINEL_TEXT_KEYS) を基準にする。
	// 手書きの写しだと infinite.js で使わなくなったキーがカタログに残っても検出できない
	for (const lang of SUPPORTED_LANGUAGES) {
		const strings = createStrings(lang);
		assertSameKeySet(Object.keys(strings.infinite), SENTINEL_TEXT_KEYS, `[${lang}] infinite`);
	}
});
