import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStoredZipReader } from '../../src/pixiv/ugoira-zip.js';
import { buildStoredZip, bytes, concat, localSpan } from '../helpers/zip.js';

/**
 * zip を size バイトずつに切って reader へ流し、出てきたエントリを集める。
 * チャンクは 1 本の buffer を指す view にして、byteOffset が 0 でない場合を必ず通す。
 * @param {object} reader createStoredZipReader の戻り値
 * @param {Uint8Array} zip zip 全体
 * @param {number} size チャンクの大きさ
 * @returns {Array<{name: string, parts: Uint8Array[]}>} 出てきたエントリ
 */
function feed(reader, zip, size) {
	const got = [];
	for (let at = 0; at < zip.length; at += size) {
		got.push(...reader.push(new Uint8Array(zip.buffer, zip.byteOffset + at, Math.min(size, zip.length - at))));
	}
	return got;
}

test('createStoredZipReader はチャンクの境目に関係なくエントリを返す', () => {
	const zip = buildStoredZip([{ name: '000000.jpg', bytes: bytes(10) }, { name: '000001.jpg', bytes: bytes(7, 50) }]);
	for (const size of [1, 3, 29, 30, 31, 64, zip.length]) {
		const reader = createStoredZipReader();
		const got = feed(reader, zip, size);
		assert.deepEqual(got.map((entry) => entry.name), ['000000.jpg', '000001.jpg'], `size ${size}`);
		assert.deepEqual(concat(got[0].parts), bytes(10), `size ${size}`);
		assert.deepEqual(concat(got[1].parts), bytes(7, 50), `size ${size}`);
		assert.equal(reader.unsupported(), false);
	}
});

test('createStoredZipReader は中身を写さず、元のチャンクを指す view で返す', () => {
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(8) }]);
	const reader = createStoredZipReader();
	const [entry] = reader.push(zip);
	assert.equal(entry.parts.length, 1);
	assert.equal(entry.parts[0].buffer, zip.buffer);
	assert.equal(entry.parts[0].byteOffset, 35);
});

test('createStoredZipReader は途中で切れたエントリを返さない', () => {
	const entries = [{ name: 'a.jpg', bytes: bytes(5) }, { name: 'b.jpg', bytes: bytes(5) }];
	const zip = buildStoredZip(entries);
	const reader = createStoredZipReader();
	// 2 つ目の中身の 1 バイト手前まで
	const cut = localSpan(entries, 2) - 1;
	const got = reader.push(new Uint8Array(zip.buffer, 0, cut));
	assert.deepEqual(got.map((entry) => entry.name), ['a.jpg']);
	// 残りが届けば 2 つ目が出る
	const rest = reader.push(new Uint8Array(zip.buffer, cut, zip.length - cut));
	assert.deepEqual(rest.map((entry) => entry.name), ['b.jpg']);
	assert.deepEqual(concat(rest[0].parts), bytes(5));
});

test('data descriptor の zip は unsupported になり、以後は何も返さない', () => {
	// 汎用フラグ bit 3。長さがヘッダに無く末尾にある形なので、受信しながらは切り出せない
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(4) }, { name: 'b.jpg', bytes: bytes(4), flags: 0x08 }]);
	const reader = createStoredZipReader();
	const got = feed(reader, zip, 7);
	assert.deepEqual(got.map((entry) => entry.name), ['a.jpg']);
	assert.equal(reader.unsupported(), true);
	assert.deepEqual(reader.push(new Uint8Array(4)), []);
});

test('STORE 以外は unsupported になる', () => {
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(4), method: 8 }]);
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(zip), []);
	assert.equal(reader.unsupported(), true);
});

test('中央ディレクトリ (0x02014b50) に来たら以後を読まない', () => {
	const entries = [{ name: 'a.jpg', bytes: bytes(3) }];
	const zip = buildStoredZip(entries);
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(zip).map((entry) => entry.name), ['a.jpg']);
	assert.equal(reader.ended(), true);
	assert.equal(reader.unsupported(), false);
	// 中央ディレクトリの後ろにローカルファイルヘッダのようなものが来ても拾わない
	assert.deepEqual(reader.push(buildStoredZip([{ name: 'x.jpg', bytes: bytes(3) }])), []);
});

test('ローカルファイルヘッダでも中央ディレクトリでもない署名でも読むのをやめる', () => {
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), []);
	assert.equal(reader.ended(), true);
	assert.equal(reader.unsupported(), false);
});

test('中身が 0 バイトのエントリも返す', () => {
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(0) }, { name: 'b.jpg', bytes: bytes(2) }]);
	const got = feed(createStoredZipReader(), zip, 5);
	assert.deepEqual(got.map((entry) => entry.name), ['a.jpg', 'b.jpg']);
	assert.equal(concat(got[0].parts).length, 0);
});

test('空のチャンクを渡されても壊れない', () => {
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(3) }]);
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(new Uint8Array(0)), []);
	assert.deepEqual(reader.push(zip).map((entry) => entry.name), ['a.jpg']);
});

test('createStoredZipReader は subarray() に頼らない', () => {
	const original = Uint8Array.prototype.subarray;
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(6) }, { name: 'b.jpg', bytes: bytes(6) }]);
	Uint8Array.prototype.subarray = () => {
		throw new Error('Permission denied to access property "constructor"');
	};
	try {
		const got = feed(createStoredZipReader(), zip, 4);
		assert.deepEqual(got.map((entry) => entry.name), ['a.jpg', 'b.jpg']);
		assert.deepEqual(Array.from(concat(got[1].parts)), Array.from(bytes(6)));
	} finally {
		Uint8Array.prototype.subarray = original;
	}
});

test('名前の途中で切れていれば、残りが届くまでエントリを返さない', () => {
	// ヘッダ (30 バイト) は揃っているが、名前の途中で終わっている
	const zip = buildStoredZip([{ name: 'abcdef.jpg', bytes: bytes(3) }]);
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(new Uint8Array(zip.buffer, 0, 33)), []);
	assert.deepEqual(reader.push(new Uint8Array(zip.buffer, 33, zip.length - 33)).map((entry) => entry.name), ['abcdef.jpg']);
});

test('拡張フィールドを飛ばして中身を切り出す', () => {
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: Uint8Array.from([9, 8, 7]) }]);
	// 名前と中身の間に 4 バイトの拡張フィールドを挟んだ zip を組み直す
	const withExtra = new Uint8Array(zip.length + 4);
	withExtra.set(new Uint8Array(zip.buffer, 0, 35), 0);
	withExtra.set([0xaa, 0xbb, 0xcc, 0xdd], 35);
	withExtra.set(new Uint8Array(zip.buffer, 35, zip.length - 35), 39);
	new DataView(withExtra.buffer).setUint16(28, 4, true);
	for (const size of [1, 7, withExtra.length]) {
		const got = feed(createStoredZipReader(), withExtra, size);
		assert.deepEqual(got.map((entry) => entry.name), ['a.jpg'], `size ${size}`);
		assert.deepEqual(Array.from(concat(got[0].parts)), [9, 8, 7], `size ${size}`);
	}
});
