/**
 * うごイラの zip を解析する。
 * pixiv のうごイラ zip は全エントリが STORE (無圧縮) であることを実測済み (SITE_SPEC §4)。
 * そのため展開処理は不要で、ローカルファイルヘッダを辿って中身を切り出すだけでよい。
 */

/** ローカルファイルヘッダの署名。 */
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

/** ローカルファイルヘッダの固定長部分の大きさ。 */
const LOCAL_FILE_HEADER_SIZE = 30;

/** ヘッダ内の各項目の位置。 */
const OFFSET_METHOD = 8;
const OFFSET_COMPRESSED_SIZE = 18;
const OFFSET_NAME_LENGTH = 26;
const OFFSET_EXTRA_LENGTH = 28;

/** 無圧縮を表す圧縮方式の番号。 */
export const ZIP_METHOD_STORE = 0;

/**
 * @typedef {object} ZipEntry
 * @property {string} name ファイル名 (例: 000000.jpg)
 * @property {Uint8Array} bytes 中身。STORE なのでそのまま JPEG
 */

/**
 * STORE 方式の zip を解析してエントリの配列を返す。
 * 壊れている・途中で切れている場合は読めたところまでを返す (例外にしない)。
 * @param {ArrayBuffer} buffer zip 全体
 * @returns {ZipEntry[]} エントリの配列
 * @throws {Error} STORE 以外の圧縮方式が含まれるとき
 */
export function parseStoredZip(buffer) {
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	const decoder = new TextDecoder();
	const entries = [];
	let offset = 0;

	while (offset + LOCAL_FILE_HEADER_SIZE <= buffer.byteLength
		&& view.getUint32(offset, true) === LOCAL_FILE_HEADER_SIGNATURE) {
		const method = view.getUint16(offset + OFFSET_METHOD, true);
		if (method !== ZIP_METHOD_STORE) {
			throw new Error(`未対応の圧縮方式です: ${method}`);
		}
		const size = view.getUint32(offset + OFFSET_COMPRESSED_SIZE, true);
		const nameLength = view.getUint16(offset + OFFSET_NAME_LENGTH, true);
		const extraLength = view.getUint16(offset + OFFSET_EXTRA_LENGTH, true);
		const nameStart = offset + LOCAL_FILE_HEADER_SIZE;
		const dataStart = nameStart + nameLength + extraLength;

		// 途中で切れているなら、そこで打ち切って読めた分を返す
		if (dataStart + size > buffer.byteLength) break;

		entries.push({
			name: decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)),
			bytes: bytes.subarray(dataStart, dataStart + size),
		});
		offset = dataStart + size;
	}

	return entries;
}
