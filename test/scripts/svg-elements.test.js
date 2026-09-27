import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_ATTRIBUTES, ALLOWED_TAGS, parseSvgElements } from '../../scripts/svg-elements.mjs';

/** エラー表示に使う読み込み元の名前。 */
const SOURCE = 'test.svg';

test('parseSvgElements は自己終了要素 1 つを要素名と属性に分ける', () => {
	assert.deepEqual(parseSvgElements('<path d="M0 0L10 10Z"/>', SOURCE), [
		{ tag: 'path', attrs: { d: 'M0 0L10 10Z' } },
	]);
});

test('parseSvgElements は複数の要素を順に読み、属性も出てきた順に並べる', () => {
	const markup = '<circle cx="4" cy="8" r="4"/><path d="M1 1" fill="none" stroke="currentColor"'
		+ ' stroke-width="4" stroke-linecap="round"/>';
	const elements = parseSvgElements(markup, SOURCE);
	assert.deepEqual(elements, [
		{ tag: 'circle', attrs: { cx: '4', cy: '8', r: '4' } },
		{
			tag: 'path',
			attrs: { d: 'M1 1', fill: 'none', stroke: 'currentColor', 'stroke-width': '4', 'stroke-linecap': 'round' },
		},
	]);
	// setAttribute を呼ぶ順が変わらないよう、キーの並びまで保つ
	assert.deepEqual(Object.keys(elements[1].attrs), ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap']);
});

test('parseSvgElements は要素の間と前後の空白・改行を読み飛ばす', () => {
	const markup = '\n\t<circle cx="1" cy="1" r="1" />\n  <circle cx="2" cy="2" r="2"/>\n';
	assert.equal(parseSvgElements(markup, SOURCE).length, 2);
});

test('parseSvgElements は値の中の空白やカンマをそのまま残す', () => {
	const d = 'M480-438 270-228q-9 9-21 9t-21-9, 1.5 .5Z';
	assert.equal(parseSvgElements(`<path d="${d}"/>`, SOURCE)[0].attrs.d, d);
});

test('parseSvgElements は許していない要素を拒む', () => {
	assert.throws(() => parseSvgElements('<script src="x"/>', SOURCE), /<script>/);
	assert.throws(() => parseSvgElements('<use href="#a"/>', SOURCE), /<use>/);
});

test('parseSvgElements は子を持つ要素 (入れ子) を拒む', () => {
	// 入れ子を黙って平らにすると、g の transform などが落ちて図形が崩れる
	assert.throws(() => parseSvgElements('<g><path d="M0 0"/></g>', SOURCE), /test\.svg/);
	assert.throws(() => parseSvgElements('<path d="M0 0"></path>', SOURCE), /test\.svg/);
});

test('parseSvgElements は要素の外の文字やコメントを拒む', () => {
	assert.throws(() => parseSvgElements('text<path d="M0 0"/>', SOURCE), /0 文字目/);
	assert.throws(() => parseSvgElements('<path d="M0 0"/><!-- note -->', SOURCE), /test\.svg/);
});

test('parseSvgElements は引用符の無い属性や単引用符の属性を拒む', () => {
	assert.throws(() => parseSvgElements('<path d=M0/>', SOURCE), /0 文字目を自己終了要素として読めません/);
	assert.throws(() => parseSvgElements("<path d='M0 0'/>", SOURCE), /0 文字目を自己終了要素として読めません/);
});

test('parseSvgElements は許していない属性を拒む', () => {
	// setAttribute で入れると innerHTML と結果がずれる (名前空間 / 大文字) か、Trusted Types で投げうる (on*)
	assert.throws(() => parseSvgElements('<path d="M0 0" onload="x"/>', SOURCE), /扱えない属性 onload/);
	assert.throws(() => parseSvgElements('<path xlink:href="#a" d="M0 0"/>', SOURCE), /扱えない属性 xlink:href/);
	assert.throws(() => parseSvgElements('<path STROKE-WIDTH="4" d="M0 0"/>', SOURCE), /扱えない属性 STROKE-WIDTH/);
	assert.throws(() => parseSvgElements('<path d="M0 0" style="fill:red"/>', SOURCE), /扱えない属性 style/);
	assert.throws(() => parseSvgElements('<path d="M0 0" class="a"/>', SOURCE), /扱えない属性 class/);
});

test('parseSvgElements は属性の無い要素を拒む', () => {
	// 何も描かない要素が通ると、アイコンが空のまま生成が成功する
	assert.throws(() => parseSvgElements('<path/>', SOURCE), /属性がありません/);
});

test('parseSvgElements は ASCII 以外の空白を区切りとして扱わない', () => {
	// HTML / XML の区切りは ASCII の空白だけ。NBSP を区切りにすると innerHTML と違う読み方になる
	assert.throws(() => parseSvgElements('<path d="M0 0" fill="none"/>', SOURCE), /自己終了要素として読めません/);
	assert.throws(() => parseSvgElements('<path d="M0 0"/>', SOURCE), /自己終了要素として読めません/);
});

test('ALLOWED_ATTRIBUTES は小文字の図形の属性だけで、変更できない', () => {
	assert.ok(Object.isFrozen(ALLOWED_ATTRIBUTES));
	for (const name of ALLOWED_ATTRIBUTES) assert.match(name, /^[a-z][a-z0-9-]*$/);
	for (const name of ['style', 'class', 'id', 'href', 'xlink:href', 'onload', 'onclick', 'xmlns']) {
		assert.ok(!ALLOWED_ATTRIBUTES.includes(name), name);
	}
});

test('parseSvgElements は同じ属性が 2 度あると拒む', () => {
	assert.throws(() => parseSvgElements('<path d="M0 0" d="M1 1"/>', SOURCE), /2 度/);
});

test('parseSvgElements は値に実体参照があると拒む', () => {
	// innerHTML なら戻っていた &amp; を、setAttribute はそのまま文字として入れてしまう
	assert.throws(() => parseSvgElements('<path d="M0 0" fill="&quot;red&quot;"/>', SOURCE), /実体参照/);
});

test('parseSvgElements は要素が 1 つも無いと拒む', () => {
	assert.throws(() => parseSvgElements('', SOURCE), /要素がありません/);
	assert.throws(() => parseSvgElements('   \n', SOURCE), /要素がありません/);
});

test('parseSvgElements は続けて呼んでも前回の読み位置を引きずらない', () => {
	// sticky の正規表現は読めた直後に投げると読み位置が残る。(読めずに失敗したときは仕様で 0 に戻るので確かめにならない)
	// 要素を 1 つ読めた後で止まる入力を先に通し、次の呼び出しが先頭から読むことを確かめる
	assert.throws(() => parseSvgElements('<circle cx="1" cy="1" r="1"/><use href="#a"/>', SOURCE), /<use>/);
	assert.deepEqual(parseSvgElements('<path d="M0 0"/>', SOURCE), [{ tag: 'path', attrs: { d: 'M0 0' } }]);
	assert.throws(() => parseSvgElements('<circle cx="1" cy="1" r="1"/><path d="a" d="b"/>', SOURCE), /2 度/);
	assert.throws(() => parseSvgElements('<circle cx="1" cy="1" r="1"/><path d="a" d="b"/>', SOURCE), /2 度/);
	assert.equal(parseSvgElements('<path d="M0 0"/>', SOURCE).length, 1);
});

test('ALLOWED_TAGS は描画される図形の要素だけで、変更できない', () => {
	assert.ok(Object.isFrozen(ALLOWED_TAGS));
	assert.ok(ALLOWED_TAGS.includes('path'));
	assert.ok(ALLOWED_TAGS.includes('circle'));
	for (const tag of ['g', 'use', 'script', 'foreignObject', 'style', 'image', 'a']) {
		assert.ok(!ALLOWED_TAGS.includes(tag), tag);
	}
});
