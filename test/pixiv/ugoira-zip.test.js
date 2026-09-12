import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredZip } from '../../src/pixiv/ugoira-zip.js';

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
	// 8 = deflate。pixiv では実測上あり得ないが、仕様が変わったときに黙って壊れないようにする
	const zip = buildZip([{ name: 'a.jpg', data: [1, 2, 3], method: 8 }]);
	assert.throws(() => parseStoredZip(zip), /未対応の圧縮方式/);
});
