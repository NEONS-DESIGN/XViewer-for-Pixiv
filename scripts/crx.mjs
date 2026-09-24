/**
 * CRX3 ファイルを読み、署名を検証する。(副作用なしのモジュール。テストからも読む)
 *
 * CRX3 の形 (Chromium の components/crx_file/crx3.proto):
 *   "Cr24" | version (uint32 LE, = 3) | header_size (uint32 LE) | CrxFileHeader | zip 本体
 *
 *   CrxFileHeader       { repeated AsymmetricKeyProof sha256_with_rsa = 2;
 *                         repeated AsymmetricKeyProof sha256_with_ecdsa = 3;
 *                         bytes signed_header_data = 10000; }
 *   AsymmetricKeyProof  { bytes public_key = 1; bytes signature = 2; }
 *   SignedData          { bytes crx_id = 1; }
 *
 * 署名の対象は "CRX3 SignedData\x00" | len(signed_header_data) (uint32 LE) | signed_header_data | zip 本体。
 * crx_id は公開鍵 (SPKI DER) の SHA-256 の先頭 16 バイト。
 */
import { createHash, verify } from 'node:crypto';

/** ファイル先頭の識別子。 */
export const CRX_MAGIC = 'Cr24';

/** 扱う CRX の形式の版。 */
export const CRX_FORMAT_VERSION = 3;

/** 署名対象の前に付く固定の接頭辞。(末尾の NUL を含む) */
const SIGNATURE_CONTEXT = Buffer.from('CRX3 SignedData\x00', 'latin1');

/** "Cr24" + version + header_size の長さ。 */
const PREAMBLE_SIZE = 12;

/** crx_id の長さ。(SHA-256 の先頭 16 バイト) */
const CRX_ID_SIZE = 16;

/** CrxFileHeader / AsymmetricKeyProof / SignedData のフィールド番号。 */
const FIELD = Object.freeze({
	SHA256_WITH_RSA: 2,
	SIGNED_HEADER_DATA: 10000,
	PUBLIC_KEY: 1,
	SIGNATURE: 2,
	CRX_ID: 1,
});

/** protobuf の wire type。 */
const WIRE = Object.freeze({ VARINT: 0, FIXED64: 1, LENGTH_DELIMITED: 2, FIXED32: 5 });

/**
 * protobuf の varint を読む。
 * @param {Buffer} buf 読む対象
 * @param {number} offset 読み始める位置
 * @returns {{value: number, next: number}} 値と次の位置
 * @throws {Error} 途中で切れている・長すぎるとき
 */
function readVarint(buf, offset) {
	let value = 0;
	let shift = 0;
	let pos = offset;
	while (true) {
		if (pos >= buf.length) throw new Error('CRX のヘッダが途中で切れています (varint)');
		const byte = buf[pos++];
		// 2^53 を超える値はこの用途では出ない。超えたら壊れていると見なす
		value += (byte & 0x7f) * 2 ** shift;
		if (!Number.isSafeInteger(value)) throw new Error('CRX のヘッダの varint が大きすぎます');
		if ((byte & 0x80) === 0) return { value, next: pos };
		shift += 7;
	}
}

/**
 * protobuf のメッセージをフィールドの列に分ける。長さ区切り (bytes / 入れ子) だけを返し、ほかは読み飛ばす。
 * @param {Buffer} buf メッセージ
 * @returns {{field: number, data: Buffer}[]} 長さ区切りのフィールド (出現順)
 * @throws {Error} 形が壊れているとき
 */
function readLengthDelimitedFields(buf) {
	const fields = [];
	let pos = 0;
	while (pos < buf.length) {
		const tag = readVarint(buf, pos);
		pos = tag.next;
		const field = Math.floor(tag.value / 8);
		const wire = tag.value % 8;
		if (wire === WIRE.LENGTH_DELIMITED) {
			const size = readVarint(buf, pos);
			pos = size.next;
			if (pos + size.value > buf.length) throw new Error('CRX のヘッダが途中で切れています (bytes)');
			fields.push({ field, data: buf.subarray(pos, pos + size.value) });
			pos += size.value;
		} else if (wire === WIRE.VARINT) {
			pos = readVarint(buf, pos).next;
		} else if (wire === WIRE.FIXED64) {
			pos += 8;
		} else if (wire === WIRE.FIXED32) {
			pos += 4;
		} else {
			throw new Error(`CRX のヘッダに解釈できない wire type があります: ${wire}`);
		}
	}
	if (pos !== buf.length) throw new Error('CRX のヘッダが途中で切れています');
	return fields;
}

/**
 * 公開鍵 (SPKI DER) から crx_id を求める。
 * @param {Buffer} spkiDer 公開鍵
 * @returns {Buffer} 16 バイトの crx_id
 */
export function crxIdFromPublicKey(spkiDer) {
	return createHash('sha256').update(spkiDer).digest().subarray(0, CRX_ID_SIZE);
}

/**
 * CRX3 を分解する。署名の検証はしない。(verifyCrx3)
 * @param {Buffer} buf CRX ファイルの中身
 * @returns {{rsaProofs: {publicKey: Buffer, signature: Buffer}[], signedHeaderData: Buffer, crxId: Buffer, archive: Buffer}}
 *   RSA の署名の列・署名対象のヘッダ・crx_id・zip 本体
 * @throws {Error} CRX3 として読めないとき
 */
export function parseCrx3(buf) {
	if (buf.length < PREAMBLE_SIZE || buf.toString('latin1', 0, 4) !== CRX_MAGIC) {
		throw new Error('CRX ファイルではありません (先頭が Cr24 ではない)');
	}
	const version = buf.readUInt32LE(4);
	if (version !== CRX_FORMAT_VERSION) throw new Error(`CRX${version} には対応していません (CRX3 のみ)`);
	const headerSize = buf.readUInt32LE(8);
	const headerEnd = PREAMBLE_SIZE + headerSize;
	if (headerEnd > buf.length) throw new Error('CRX のヘッダが途中で切れています');

	const rsaProofs = [];
	let signedHeaderData = null;
	for (const { field, data } of readLengthDelimitedFields(buf.subarray(PREAMBLE_SIZE, headerEnd))) {
		if (field === FIELD.SHA256_WITH_RSA) {
			const proof = { publicKey: null, signature: null };
			for (const inner of readLengthDelimitedFields(data)) {
				if (inner.field === FIELD.PUBLIC_KEY) proof.publicKey = inner.data;
				else if (inner.field === FIELD.SIGNATURE) proof.signature = inner.data;
			}
			if (!proof.publicKey || !proof.signature) throw new Error('CRX の RSA 署名に公開鍵か署名が欠けています');
			rsaProofs.push(proof);
		} else if (field === FIELD.SIGNED_HEADER_DATA) {
			signedHeaderData = data;
		}
	}
	if (!signedHeaderData) throw new Error('CRX に signed_header_data がありません');
	const crxId = readLengthDelimitedFields(signedHeaderData).find((f) => f.field === FIELD.CRX_ID)?.data;
	if (!crxId || crxId.length !== CRX_ID_SIZE) throw new Error('CRX の crx_id が読めません');

	return { rsaProofs, signedHeaderData, crxId, archive: buf.subarray(headerEnd) };
}

/**
 * CRX3 が指定の公開鍵で正しく署名されているかを確かめる。
 * - 指定の公開鍵の RSA 署名が入っている
 * - その署名がヘッダと zip 本体に対して正しい
 * - crx_id がその公開鍵から求めた値と一致する
 * @param {Buffer} buf CRX ファイルの中身
 * @param {Buffer} expectedPublicKey 期待する公開鍵 (SPKI DER)
 * @returns {{crxId: Buffer, archiveSize: number}} 検証した crx_id と zip 本体の大きさ
 * @throws {Error} どれかを満たさないとき
 */
export function verifyCrx3(buf, expectedPublicKey) {
	const { rsaProofs, signedHeaderData, crxId, archive } = parseCrx3(buf);
	const proof = rsaProofs.find((p) => p.publicKey.equals(expectedPublicKey));
	if (!proof) throw new Error('CRX に指定の鍵の署名がありません (別の鍵で署名されている)');

	const sizeField = Buffer.alloc(4);
	sizeField.writeUInt32LE(signedHeaderData.length);
	const signedData = Buffer.concat([SIGNATURE_CONTEXT, sizeField, signedHeaderData, archive]);
	const publicKey = { key: expectedPublicKey, format: 'der', type: 'spki' };
	if (!verify('sha256', signedData, publicKey, proof.signature)) {
		throw new Error('CRX の署名が中身と一致しません (改変されているか、壊れている)');
	}
	if (!crxId.equals(crxIdFromPublicKey(expectedPublicKey))) {
		throw new Error('CRX の crx_id が鍵と一致しません');
	}
	return { crxId, archiveSize: archive.length };
}
