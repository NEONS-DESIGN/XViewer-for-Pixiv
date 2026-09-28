/**
 * テスト用の zip を組み立てる道具。
 * うごイラの zip と同じく、ローカルファイルヘッダ + 中身の並びの後ろに中央ディレクトリと終端レコードを付ける。
 */

/** ローカルファイルヘッダの署名。 */
const LOCAL_SIGNATURE = 0x04034b50;

/** 中央ディレクトリのエントリの署名。 */
const CENTRAL_SIGNATURE = 0x02014b50;

/** 中央ディレクトリの終端レコードの署名。 */
const END_SIGNATURE = 0x06054b50;

/** ローカルファイルヘッダの固定長部分の大きさ。 */
const LOCAL_HEADER_SIZE = 30;

/** 中央ディレクトリのエントリの固定長部分の大きさ。 */
const CENTRAL_HEADER_SIZE = 46;

/** 終端レコードの大きさ。 */
const END_RECORD_SIZE = 22;

/** zip の版 (2.0)。 */
const ZIP_VERSION = 20;

/**
 * 決まった中身のバイト列を作る。
 * @param {number} length 長さ
 * @param {number} [seed] 先頭の値。エントリごとに変えると中身を見分けられる
 * @returns {Uint8Array} バイト列
 */
export function bytes(length, seed = 1) {
	return Uint8Array.from({ length }, (_, at) => (seed + at) & 0xff);
}

/**
 * view の並びを 1 本につなぐ。
 * @param {Uint8Array[]} parts 並び
 * @returns {Uint8Array} つないだもの
 */
export function concat(parts) {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

/**
 * ローカルファイルヘッダ + 名前 + 中身の部分が占めるバイト数。(先頭から count 個分)
 * チャンクをエントリの境目で切るときに使う。
 * @param {Array<{name: string, bytes: Uint8Array}>} entries エントリ
 * @param {number} count 先頭から何個分か
 * @returns {number} バイト数
 */
export function localSpan(entries, count) {
	return entries.slice(0, count).reduce(
		(sum, entry) => sum + LOCAL_HEADER_SIZE + new TextEncoder().encode(entry.name).length + entry.bytes.length,
		0,
	);
}

/**
 * STORE 方式の zip を組み立てる。
 * @param {Array<{name: string, bytes: Uint8Array, method?: number, flags?: number}>} entries エントリ。method は圧縮方式 (既定 0 = STORE)、flags は汎用フラグ
 * @returns {Uint8Array} zip 全体。buffer はこの zip だけを持つ
 */
export function buildStoredZip(entries) {
	const encoder = new TextEncoder();
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const local = new Uint8Array(LOCAL_HEADER_SIZE + name.length + entry.bytes.length);
		const view = new DataView(local.buffer);
		view.setUint32(0, LOCAL_SIGNATURE, true);
		view.setUint16(4, ZIP_VERSION, true);
		view.setUint16(6, entry.flags ?? 0, true);
		view.setUint16(8, entry.method ?? 0, true);
		view.setUint32(18, entry.bytes.length, true);
		view.setUint32(22, entry.bytes.length, true);
		view.setUint16(26, name.length, true);
		view.setUint16(28, 0, true);
		local.set(name, LOCAL_HEADER_SIZE);
		local.set(entry.bytes, LOCAL_HEADER_SIZE + name.length);
		locals.push(local);

		const central = new Uint8Array(CENTRAL_HEADER_SIZE + name.length);
		const centralView = new DataView(central.buffer);
		centralView.setUint32(0, CENTRAL_SIGNATURE, true);
		centralView.setUint16(4, ZIP_VERSION, true);
		centralView.setUint16(6, ZIP_VERSION, true);
		centralView.setUint16(8, entry.flags ?? 0, true);
		centralView.setUint16(10, entry.method ?? 0, true);
		centralView.setUint32(20, entry.bytes.length, true);
		centralView.setUint32(24, entry.bytes.length, true);
		centralView.setUint16(28, name.length, true);
		centralView.setUint32(42, offset, true);
		central.set(name, CENTRAL_HEADER_SIZE);
		centrals.push(central);
		offset += local.length;
	}
	const centralSize = centrals.reduce((sum, central) => sum + central.length, 0);
	const end = new Uint8Array(END_RECORD_SIZE);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, END_SIGNATURE, true);
	endView.setUint16(8, entries.length, true);
	endView.setUint16(10, entries.length, true);
	endView.setUint32(12, centralSize, true);
	endView.setUint32(16, offset, true);
	return concat([...locals, ...centrals, end]);
}
