import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredZip, createStoredZipReader } from '../../src/pixiv/ugoira-zip.js';
import { buildStoredZip, bytes, concat, localSpan } from '../helpers/zip.js';

/**
 * テスト用に STORE 方式の zip を組み立てる。
 * 中央ディレクトリは付けない。parseStoredZip はローカルファイルヘッダだけを辿るため。
 * @param {Array<{name: string, data: number[], method?: number}>} files
 * @returns {ArrayBuffer}
 */
function buildZip(files) {
	const chunks = [];
	for (const file of files) {
		const nameBytes = new TextEncoder().encode(file.name);
		const header = new Uint8Array(30);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x04034b50, true);       // signature
		view.setUint16(4, 20, true);               // version
		view.setUint16(8, file.method ?? 0, true); // compression method
		view.setUint32(18, file.data.length, true);// compressed size
		view.setUint32(22, file.data.length, true);// uncompressed size
		view.setUint16(26, nameBytes.length, true);// name length
		view.setUint16(28, 0, true);               // extra length
		chunks.push(header, nameBytes, new Uint8Array(file.data));
	}
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out.buffer;
}

test('STORE の zip からエントリを取り出す', () => {
	const zip = buildZip([
		{ name: '000000.jpg', data: [0xff, 0xd8, 0x01] },
		{ name: '000001.jpg', data: [0xff, 0xd8, 0x02, 0x03] },
	]);
	const entries = parseStoredZip(zip);
	assert.equal(entries.length, 2);
	assert.equal(entries[0].name, '000000.jpg');
	assert.deepEqual([...entries[0].bytes], [0xff, 0xd8, 0x01]);
	assert.equal(entries[1].name, '000001.jpg');
	assert.deepEqual([...entries[1].bytes], [0xff, 0xd8, 0x02, 0x03]);
});

test('空の zip は空配列を返す', () => {
	assert.deepEqual(parseStoredZip(new ArrayBuffer(0)), []);
});

test('署名が違うデータは空配列を返す', () => {
	const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
	assert.deepEqual(parseStoredZip(buffer), []);
});

test('途中で切れている zip は読めたところまで返す', () => {
	// 2 つ目のエントリの途中で切れている。1 つ目は丸ごと読めるので、それだけが返る
	const zip = buildZip([
		{ name: 'a.jpg', data: [1, 2, 3] },
		{ name: 'b.jpg', data: [4, 5, 6] },
	]);
	const truncated = zip.slice(0, zip.byteLength - 2);
	const entries = parseStoredZip(truncated);
	assert.deepEqual(entries.map((entry) => entry.name), ['a.jpg']);
	assert.deepEqual([...entries[0].bytes], [1, 2, 3]);
});

test('最初のエントリから切れていれば空配列を返す', () => {
	const zip = buildZip([{ name: 'a.jpg', data: [1, 2, 3] }]);
	assert.deepEqual(parseStoredZip(zip.slice(0, zip.byteLength - 2)), []);
});

test('STORE 以外の圧縮方式は例外を投げる', () => {
	// 8 = deflate。pixiv のうごイラの zip は STORE だが、仕様が変わったときに黙って壊れないようにする
	const zip = buildZip([{ name: 'a.jpg', data: [1, 2, 3], method: 8 }]);
	assert.throws(() => parseStoredZip(zip), /未対応の圧縮方式/);
});

test('名前の途中で切れていても RangeError にせず読めたところまで返す', () => {
	// ヘッダ (30 バイト) は揃っているが、名前の途中で終わっている
	const zip = buildZip([{ name: 'abcdef.jpg', data: [1, 2, 3] }]);
	assert.deepEqual(parseStoredZip(zip.slice(0, 33)), []);
});

test('拡張フィールドを飛ばして中身を切り出す', () => {
	const zip = new Uint8Array(buildZip([{ name: 'a.jpg', data: [9, 8, 7] }]));
	// 名前と中身の間に 4 バイトの拡張フィールドを挟んだ zip を組み直す
	const withExtra = new Uint8Array(zip.length + 4);
	withExtra.set(zip.subarray(0, 35), 0);
	withExtra.set([0xaa, 0xbb, 0xcc, 0xdd], 35);
	withExtra.set(zip.subarray(35), 39);
	new DataView(withExtra.buffer).setUint16(28, 4, true);
	const entries = parseStoredZip(withExtra.buffer);
	assert.equal(entries[0].name, 'a.jpg');
	assert.deepEqual([...entries[0].bytes], [9, 8, 7]);
});

test('中身は元の buffer を指す view で返す (写しを作らない)', () => {
	const zip = buildZip([
		{ name: 'a.jpg', data: [1, 2] },
		{ name: 'b.jpg', data: [3, 4, 5] },
	]);
	const entries = parseStoredZip(zip);
	assert.equal(entries[0].bytes.buffer, zip);
	assert.equal(entries[1].bytes.buffer, zip);
	// 1 つ目: ヘッダ 30 + 名前 5 の後ろ。2 つ目: 1 つ目の 37 バイトの後ろにヘッダ 30 + 名前 5
	assert.equal(entries[0].bytes.byteOffset, 35);
	assert.equal(entries[1].bytes.byteOffset, 72);
	assert.equal(entries[1].bytes.length, 3);
});

test('subarray() に頼らない (Firefox の content script では constructor を引けないため)', () => {
	// Firefox では fetch が返す ArrayBuffer がページ側にあり、subarray() が
	// Permission denied to access property "constructor" を投げる。それを模す
	const original = Uint8Array.prototype.subarray;
	const zip = buildZip([{ name: 'a.jpg', data: [1, 2, 3] }]);
	Uint8Array.prototype.subarray = () => {
		throw new Error('Permission denied to access property "constructor"');
	};
	try {
		const entries = parseStoredZip(zip);
		assert.equal(entries[0].name, 'a.jpg');
		assert.deepEqual(Array.from(entries[0].bytes), [1, 2, 3]);
	} finally {
		Uint8Array.prototype.subarray = original;
	}
});

test('中身が 0 バイトのエントリが末尾にあっても読める', () => {
	// 最後のエントリの中身がちょうど buffer の終わりで終わる (new Uint8Array(buffer, byteLength, 0) になる)
	const zip = buildZip([
		{ name: 'a.jpg', data: [1] },
		{ name: 'b.jpg', data: [] },
	]);
	const entries = parseStoredZip(zip);
	assert.deepEqual(entries.map((entry) => entry.name), ['a.jpg', 'b.jpg']);
	assert.equal(entries[1].bytes.length, 0);
	assert.equal(entries[1].bytes.byteOffset, zip.byteLength);
});

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
		assert.equal(reader.needsFallback(), false);
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

test('data descriptor の zip は needsFallback になり、以後は何も返さない', () => {
	// 汎用フラグ bit 3。長さがヘッダに無く末尾にある形なので、受信しながらは切り出せない
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(4) }, { name: 'b.jpg', bytes: bytes(4), flags: 0x08 }]);
	const reader = createStoredZipReader();
	const got = feed(reader, zip, 7);
	assert.deepEqual(got.map((entry) => entry.name), ['a.jpg']);
	assert.equal(reader.needsFallback(), true);
	assert.deepEqual(reader.push(new Uint8Array(4)), []);
});

test('STORE 以外は needsFallback になる', () => {
	const zip = buildStoredZip([{ name: 'a.jpg', bytes: bytes(4), method: 8 }]);
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(zip), []);
	assert.equal(reader.needsFallback(), true);
});

test('中央ディレクトリ (0x02014b50) に来たら以後を読まない', () => {
	const entries = [{ name: 'a.jpg', bytes: bytes(3) }];
	const zip = buildStoredZip(entries);
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(zip).map((entry) => entry.name), ['a.jpg']);
	assert.equal(reader.ended(), true);
	assert.equal(reader.needsFallback(), false);
	// 中央ディレクトリの後ろにローカルファイルヘッダのようなものが来ても拾わない
	assert.deepEqual(reader.push(buildStoredZip([{ name: 'x.jpg', bytes: bytes(3) }])), []);
});

test('ローカルファイルヘッダでも中央ディレクトリでもない署名でも読むのをやめる', () => {
	const reader = createStoredZipReader();
	assert.deepEqual(reader.push(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), []);
	assert.equal(reader.ended(), true);
	assert.equal(reader.needsFallback(), false);
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
