import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readSession, clearSessionCache, markSessionExpired } from '../../src/content/session.js';
import { buildNextData as buildNextDataWith } from '../helpers/pixiv.js';

// 解析結果はモジュールが 1 つだけ覚える。テストごとに捨てて、前のテストの結果を見ないようにする
afterEach(() => { clearSessionCache(); });

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
	const { doc } = fakeDoc(buildNextData('abc'));
	const session = readSession(doc);
	assert.equal(session.isLoggedIn, true);
	assert.equal(session.csrfToken, 'abc');
	assert.equal(session.self.xRestrict, 1);
});

test('2 回目は解析し直さない', () => {
	const first = fakeDoc(buildNextData('abc'));
	const session = readSession(first.doc);
	assert.equal(first.calls(), 1);

	// __NEXT_DATA__ は SPA 遷移で更新されないので、読み直す必要がない
	const second = fakeDoc(buildNextData('別のトークン'));
	assert.equal(readSession(second.doc), session);
	assert.equal(second.calls(), 0);
});

test('clearSessionCache を呼べば読み直す', () => {
	readSession(fakeDoc(buildNextData('abc')).doc);
	clearSessionCache();
	const next = fakeDoc(buildNextData('xyz'));
	assert.equal(readSession(next.doc).csrfToken, 'xyz');
	assert.equal(next.calls(), 1);
});

test('script が無くても未ログイン相当を返す', () => {
	const session = readSession(fakeDoc(null).doc);
	assert.deepEqual({ ...session }, { isLoggedIn: false, self: null, csrfToken: null });
});

test('返る値は書き換えられない', () => {
	const session = readSession(fakeDoc(buildNextData('abc')).doc);
	// 使い回す値なので、呼び出し側の書き換えが他へ漏れないこと
	assert.throws(() => { 'use strict'; session.csrfToken = 'すり替え'; }, TypeError);
	assert.equal(readSession(fakeDoc(null).doc).csrfToken, 'abc');
});

test('markSessionExpired の後はトークンだけを抜いた値を返し、解析し直さない', () => {
	// __NEXT_DATA__ は読み直しても同じ古いトークンなので、捨てて数百 KB を解析し直す意味が無い
	const first = fakeDoc(buildNextData('abc'));
	const before = readSession(first.doc);
	markSessionExpired();
	const second = fakeDoc(buildNextData('abc'));
	const after = readSession(second.doc);
	assert.equal(second.calls(), 0, '解析し直している');
	assert.equal(after.csrfToken, null, '古いトークンを渡し続けている');
	// ログイン状態と表示設定は残す。(R-18 の判定や自分の作品の判定を変えない)
	assert.equal(after.isLoggedIn, true);
	assert.equal(after.self, before.self);
	assert.ok(Object.isFrozen(after));
	assert.equal(before.csrfToken, 'abc', '前に渡した値まで書き換えている');
});

test('まだ読んでいないうちに markSessionExpired されても、読んだ値からトークンを抜く', () => {
	markSessionExpired();
	const session = readSession(fakeDoc(buildNextData('abc')).doc);
	assert.equal(session.csrfToken, null);
	assert.equal(session.isLoggedIn, true);
});

test('clearSessionCache はログインが切れた印も捨てる', () => {
	readSession(fakeDoc(buildNextData('abc')).doc);
	markSessionExpired();
	clearSessionCache();
	assert.equal(readSession(fakeDoc(buildNextData('xyz')).doc).csrfToken, 'xyz');
});
