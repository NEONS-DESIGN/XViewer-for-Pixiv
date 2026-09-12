import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSession, clearSessionCache } from '../../src/content/session.js';
import { buildNextData as buildNextDataWith } from '../helpers/pixiv.js';

/**
 * getElementById だけを持つ最小の Document の代わり。
 * 何回引かれたかを数え、解析結果の使い回しを確かめる。
 * @param {string|null} text __NEXT_DATA__ の中身
 * @returns {{doc: object, calls: () => number}} doc の代わりと呼ばれた回数
 */
function fakeDoc(text) {
	let count = 0;
	return {
		doc: {
			getElementById() {
				count += 1;
				return text === null ? null : { textContent: text };
			},
		},
		calls: () => count,
	};
}

/**
 * ログイン済み (R-18 可) の __NEXT_DATA__ を組み立てる。
 * @param {string} token CSRF トークン
 * @returns {string} script の中身
 */
function buildNextData(token) {
	return buildNextDataWith({ token, self: { xRestrict: 1, hideAiWorks: false } });
}

test('ドキュメントからセッションを読む', () => {
	clearSessionCache();
	const { doc } = fakeDoc(buildNextData('abc'));
	const session = readSession(doc);
	assert.equal(session.isLoggedIn, true);
	assert.equal(session.csrfToken, 'abc');
	assert.equal(session.self.xRestrict, 1);
});

test('2 回目は解析し直さない', () => {
	clearSessionCache();
	const first = fakeDoc(buildNextData('abc'));
	const session = readSession(first.doc);
	assert.equal(first.calls(), 1);

	// __NEXT_DATA__ は SPA 遷移で更新されないので、読み直す必要がない
	const second = fakeDoc(buildNextData('別のトークン'));
	assert.equal(readSession(second.doc), session);
	assert.equal(second.calls(), 0);
});

test('clearSessionCache を呼べば読み直す', () => {
	clearSessionCache();
	readSession(fakeDoc(buildNextData('abc')).doc);
	clearSessionCache();
	const next = fakeDoc(buildNextData('xyz'));
	assert.equal(readSession(next.doc).csrfToken, 'xyz');
	assert.equal(next.calls(), 1);
});

test('script が無くても未ログイン相当を返す', () => {
	clearSessionCache();
	const session = readSession(fakeDoc(null).doc);
	assert.deepEqual({ ...session }, { isLoggedIn: false, self: null, csrfToken: null });
});

test('返る値は書き換えられない', () => {
	clearSessionCache();
	const session = readSession(fakeDoc(buildNextData('abc')).doc);
	// 使い回す値なので、呼び出し側の書き換えが他へ漏れないこと
	assert.throws(() => { 'use strict'; session.csrfToken = 'すり替え'; }, TypeError);
	assert.equal(readSession(fakeDoc(null).doc).csrfToken, 'abc');
});
