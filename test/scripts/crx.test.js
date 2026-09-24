import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { parseCrx3, verifyCrx3, crxIdFromPublicKey } from '../../scripts/crx.mjs';

/**
 * protobuf の varint を書く。
 * @param {number} value 値
 * @returns {Buffer}
 */
function varint(value) {
	const bytes = [];
	let rest = value;
	while (rest >= 0x80) {
		bytes.push((rest % 0x80) | 0x80);
		rest = Math.floor(rest / 0x80);
	}
	bytes.push(rest);
	return Buffer.from(bytes);
}

/**
 * 長さ区切りのフィールドを書く。
 * @param {number} field フィールド番号
 * @param {Buffer} data 中身
 * @returns {Buffer}
 */
function bytesField(field, data) {
	return Buffer.concat([varint(field * 8 + 2), varint(data.length), data]);
}

/**
 * 鍵ペアを作る。
 * @returns {{privateKey: import('node:crypto').KeyObject, spki: Buffer}}
 */
function makeKey() {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	return { privateKey, spki: publicKey.export({ format: 'der', type: 'spki' }) };
}

/**
 * Chrome と同じ形の CRX3 を組み立てる。
 * @param {object} options
 * @param {import('node:crypto').KeyObject} options.privateKey 署名する鍵
 * @param {Buffer} options.spki ヘッダに書く公開鍵
 * @param {Buffer} options.archive zip 本体の代わり
 * @param {Buffer} [options.crxId] 既定は spki から求める
 * @returns {Buffer}
 */
function buildCrx({ privateKey, spki, archive, crxId = crxIdFromPublicKey(spki) }) {
	const signedHeaderData = bytesField(1, crxId);
	const size = Buffer.alloc(4);
	size.writeUInt32LE(signedHeaderData.length);
	const signature = sign('sha256', Buffer.concat([
		Buffer.from('CRX3 SignedData\x00', 'latin1'), size, signedHeaderData, archive,
	]), privateKey);
	const header = Buffer.concat([
		bytesField(2, Buffer.concat([bytesField(1, spki), bytesField(2, signature)])),
		bytesField(10000, signedHeaderData),
	]);
	const preamble = Buffer.alloc(12);
	preamble.write('Cr24', 0, 'latin1');
	preamble.writeUInt32LE(3, 4);
	preamble.writeUInt32LE(header.length, 8);
	return Buffer.concat([preamble, header, archive]);
}

const KEY = makeKey();
const ARCHIVE = Buffer.from('PK\x03\x04 dummy archive', 'latin1');

test('正しく署名された CRX3 は検証を通る', () => {
	const crx = buildCrx({ ...KEY, archive: ARCHIVE });
	const result = verifyCrx3(crx, KEY.spki);
	assert.deepEqual(result.crxId, crxIdFromPublicKey(KEY.spki));
	assert.equal(result.archiveSize, ARCHIVE.length);
});

test('分解すると公開鍵と zip 本体が取り出せる', () => {
	const crx = buildCrx({ ...KEY, archive: ARCHIVE });
	const parsed = parseCrx3(crx);
	assert.equal(parsed.rsaProofs.length, 1);
	assert.deepEqual(parsed.rsaProofs[0].publicKey, KEY.spki);
	assert.deepEqual(parsed.archive, ARCHIVE);
});

test('crx_id は公開鍵の SHA-256 の先頭 16 バイト', () => {
	assert.equal(crxIdFromPublicKey(KEY.spki).length, 16);
});

test('別の鍵で署名された CRX は弾く', () => {
	const other = makeKey();
	const crx = buildCrx({ ...other, archive: ARCHIVE });
	assert.throws(() => verifyCrx3(crx, KEY.spki), /指定の鍵の署名がありません/);
});

test('zip 本体を書き換えると弾く', () => {
	const crx = buildCrx({ ...KEY, archive: ARCHIVE });
	crx[crx.length - 1] ^= 0xff;
	assert.throws(() => verifyCrx3(crx, KEY.spki), /署名が中身と一致しません/);
});

test('crx_id が鍵と合わなければ弾く', () => {
	const crx = buildCrx({ ...KEY, archive: ARCHIVE, crxId: Buffer.alloc(16) });
	assert.throws(() => verifyCrx3(crx, KEY.spki), /crx_id が鍵と一致しません/);
});

test('先頭が Cr24 でなければ弾く', () => {
	assert.throws(() => parseCrx3(Buffer.from('PK\x03\x04 not a crx file', 'latin1')), /Cr24/);
	assert.throws(() => parseCrx3(Buffer.alloc(3)), /Cr24/);
});

test('CRX2 は弾く', () => {
	const crx = buildCrx({ ...KEY, archive: ARCHIVE });
	crx.writeUInt32LE(2, 4);
	assert.throws(() => parseCrx3(crx), /CRX2 には対応していません/);
});

test('ヘッダが途中で切れていれば弾く', () => {
	const crx = buildCrx({ ...KEY, archive: ARCHIVE });
	const headerSize = crx.readUInt32LE(8);
	assert.throws(() => parseCrx3(crx.subarray(0, 12 + headerSize - 10)), /途中で切れています/);
});
