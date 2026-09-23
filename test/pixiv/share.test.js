import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artworkUrl, shareText, buildShareTargets } from '../../src/pixiv/share.js';
import { createStrings } from '../../src/i18n/index.js';

/** シェア対象の作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149431011',
	title: 'モンブラン',
	userName: 'チャイ',
});

/** 文言のカタログ (日本語)。 */
const STRINGS = createStrings('ja');

test('artworkUrl は作品ページの絶対 URL を返す', () => {
	assert.equal(artworkUrl('149431011'), 'https://www.pixiv.net/artworks/149431011');
});

test('shareText は pixiv 本体と同じ「タイトル | 作者 #pixiv」にする', () => {
	// SITE_SPEC §4 実測。区切りは半角スペース + 縦棒 + 半角スペース
	assert.equal(shareText(DETAIL), 'モンブラン | チャイ #pixiv');
});

test('X は text と url を別のパラメータに分けて渡す', () => {
	const target = buildShareTargets(DETAIL, STRINGS).find((item) => item.key === 'x');
	assert.equal(target.label, 'X');
	assert.equal(
		target.href,
		'https://twitter.com/intent/tweet'
			+ '?text=%E3%83%A2%E3%83%B3%E3%83%96%E3%83%A9%E3%83%B3%20%7C%20%E3%83%81%E3%83%A3%E3%82%A4%20%23pixiv'
			+ '&url=https%3A%2F%2Fwww.pixiv.net%2Fartworks%2F149431011',
	);
});

test('Facebook は作品 URL だけを u で渡す', () => {
	const target = buildShareTargets(DETAIL, STRINGS).find((item) => item.key === 'facebook');
	assert.equal(
		target.href,
		'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.pixiv.net%2Fartworks%2F149431011',
	);
});

test('Pawoo は本文と URL を 1 つの text にまとめる', () => {
	const target = buildShareTargets(DETAIL, STRINGS).find((item) => item.key === 'pawoo');
	assert.equal(
		target.href,
		'https://pawoo.net/share'
			+ '?text=%E3%83%A2%E3%83%B3%E3%83%96%E3%83%A9%E3%83%B3%20%7C%20%E3%83%81%E3%83%A3%E3%82%A4%20%23pixiv'
			+ '%20https%3A%2F%2Fwww.pixiv.net%2Fartworks%2F149431011',
	);
});

test('空白は + ではなく %20 になる', () => {
	// URLSearchParams で組むと + になり、pixiv 本体と違う文字列になる (実測で確認済み)
	for (const target of buildShareTargets(DETAIL, STRINGS)) {
		if (target.href) assert.equal(target.href.includes('+'), false);
	}
});

test('リンクをコピーは href を持たず、コピーする文字列を持つ', () => {
	const target = buildShareTargets(DETAIL, STRINGS).find((item) => item.key === 'copy');
	assert.equal(target.label, 'リンクをコピー');
	assert.equal(target.href, undefined);
	assert.equal(target.copyText, 'https://www.pixiv.net/artworks/149431011');
});

test('並びは X / Facebook / Pawoo / リンクをコピー', () => {
	assert.deepEqual(
		buildShareTargets(DETAIL, STRINGS).map((item) => item.key),
		['x', 'facebook', 'pawoo', 'copy'],
	);
});

test('各項目はアイコン名を持つ', () => {
	assert.deepEqual(
		buildShareTargets(DETAIL, STRINGS).map((item) => item.icon),
		['brandX', 'brandFacebook', 'brandMastodon', 'link'],
	);
});

test('コピーの項目だけが翻訳される', () => {
	const targets = buildShareTargets(DETAIL, createStrings('en'));
	const byKey = Object.fromEntries(targets.map((item) => [item.key, item.label]));
	assert.equal(byKey.copy, 'Copy link');
	// ブランド名は言語に依らない
	assert.equal(byKey.x, 'X');
	assert.equal(byKey.facebook, 'Facebook');
	assert.equal(byKey.pawoo, 'Pawoo');
});
