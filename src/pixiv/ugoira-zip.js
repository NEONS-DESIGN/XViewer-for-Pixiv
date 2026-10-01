/**
 * うごイラの zip を解析する。
 * pixiv のうごイラ zip は全エントリが STORE (無圧縮) なので、展開はせず
 * ローカルファイルヘッダを辿って中身を切り出すだけにする。
 */

/** ローカルファイルヘッダの署名。 */
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

/** ローカルファイルヘッダの固定長部分の大きさ。 */
const LOCAL_FILE_HEADER_SIZE = 30;

/** 署名の大きさ (バイト)。 */
const SIGNATURE_SIZE = 4;

/** 汎用フラグの bit 3。中身の長さがヘッダに無く、中身の後ろの data descriptor にある。 */
const FLAG_DATA_DESCRIPTOR = 0x08;

/** ヘッダ内の各項目の位置。 */
const OFFSET_FLAGS = 6;
const OFFSET_METHOD = 8;
const OFFSET_COMPRESSED_SIZE = 18;
const OFFSET_NAME_LENGTH = 26;
const OFFSET_EXTRA_LENGTH = 28;

/** 無圧縮を表す圧縮方式の番号。 */
const ZIP_METHOD_STORE = 0;

/**
 * @typedef {object} ZipEntry
 * @property {string} name ファイル名 (例: 000000.jpg)
 * @property {Uint8Array} bytes 中身。STORE なのでそのまま JPEG
 */

/**
 * STORE 方式の zip を解析してエントリの配列を返す。
 * 壊れている・途中で切れている場合は読めたところまでを返す。(例外にしない)
 * @param {ArrayBuffer} buffer zip 全体
 * @returns {ZipEntry[]} エントリの配列
 * @throws {Error} STORE 以外の圧縮方式が含まれるとき
 */
export function parseStoredZip(buffer) {
	const view = new DataView(buffer);
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

		// subarray() は使わない。Firefox の content script では Permission denied になるので、
		// 同じ buffer を指す view をコンストラクタで直接作る。
		// 範囲は直前の判定 (dataStart + size <= byteLength) の内側に収まるので RangeError にはならない
		entries.push({
			name: decoder.decode(new Uint8Array(buffer, nameStart, nameLength)),
			bytes: new Uint8Array(buffer, dataStart, size),
		});
		offset = dataStart + size;
	}

	return entries;
}

/**
 * @typedef {object} StreamedZipEntry
 * @property {string} name ファイル名 (例: 000000.jpg)
 * @property {Uint8Array[]} parts 中身。受け取ったチャンクを指す view の並び (つなぐと中身になる)
 */

/**
 * @typedef {object} StoredZipReader
 * @property {(chunk: Uint8Array) => StreamedZipEntry[]} push チャンクを渡し、中身が揃ったエントリを受け取る
 * @property {() => boolean} needsFallback 受信しながらは読めない形 (data descriptor か STORE 以外) を見つけたか。true になった後の push は空配列を返す。
 *   呼ぶ側は取り直さず失敗にする。(parseStoredZip() もこの 2 つの形は読めない)
 * @property {() => boolean} ended ローカルファイルヘッダの並びが終わったか (中央ディレクトリか知らない署名に来た)。true になった後の push は空配列を返す
 */

/**
 * STORE 方式の zip を受信しながら読む。
 * チャンクを受け取るたびに、中身が揃ったエントリを返す。
 * チャンクは複製せず、エントリの中身は元のチャンクを指す view の並びで返す。
 * チャンクは byteOffset が 0 でない view でもよい。subarray() は使わない。(Firefox の content script で投げる)
 * @returns {StoredZipReader} 読み手
 */
export function createStoredZipReader() {
	const decoder = new TextDecoder();
	/** @type {Uint8Array[]} まだ使い切っていないチャンク */
	let queue = [];
	/** queue の先頭のチャンクのうち使い終えたバイト数 */
	let head = 0;
	/** queue に残っているバイト数 */
	let buffered = 0;
	/** @type {{name: string, remaining: number, parts: Uint8Array[]}|null} 中身を集めている途中のエントリ */
	let current = null;
	let fallback = false;
	let finished = false;

	/**
	 * 先頭から n バイトを 1 つの配列へ写して読む。(ヘッダのように小さいものだけに使う)
	 * 呼ぶ側で buffered >= n を確かめておく。
	 * @param {number} n バイト数
	 * @returns {Uint8Array} 写し。自前の buffer を持つ
	 */
	function peekBytes(n) {
		const out = new Uint8Array(n);
		let filled = 0;
		let offset = head;
		for (const chunk of queue) {
			if (filled >= n) break;
			const length = Math.min(chunk.byteLength - offset, n - filled);
			out.set(new Uint8Array(chunk.buffer, chunk.byteOffset + offset, length), filled);
			filled += length;
			offset = 0;
		}
		return out;
	}

	/**
	 * 先頭から最大 n バイトを使い終えたことにする。
	 * @param {number} n バイト数
	 * @param {Uint8Array[]|null} collect 渡されたら、使った範囲を指す view を積む (写さない)
	 * @returns {void}
	 */
	function consume(n, collect) {
		let rest = n;
		while (rest > 0 && queue.length > 0) {
			const chunk = queue[0];
			const length = Math.min(chunk.byteLength - head, rest);
			if (collect) collect.push(new Uint8Array(chunk.buffer, chunk.byteOffset + head, length));
			rest -= length;
			head += length;
			buffered -= length;
			if (head === chunk.byteLength) {
				queue.shift();
				head = 0;
			}
		}
	}

	/**
	 * 以後を読まないことにして、持っているチャンクを手放す。
	 * @returns {void}
	 */
	function release() {
		queue = [];
		head = 0;
		buffered = 0;
		current = null;
	}

	return {
		push(chunk) {
			if (fallback || finished || chunk.byteLength === 0) return [];
			queue.push(chunk);
			buffered += chunk.byteLength;
			const done = [];
			for (;;) {
				if (current) {
					const views = [];
					consume(Math.min(current.remaining, buffered), views);
					for (const view of views) {
						current.parts.push(view);
						current.remaining -= view.byteLength;
					}
					if (current.remaining > 0) break;
					done.push({ name: current.name, parts: current.parts });
					current = null;
					continue;
				}
				if (buffered < SIGNATURE_SIZE) break;
				const signature = new DataView(peekBytes(SIGNATURE_SIZE).buffer).getUint32(0, true);
				// 中央ディレクトリ (0x02014b50) や知らない署名に来たら、エントリの並びは終わり
				if (signature !== LOCAL_FILE_HEADER_SIGNATURE) {
					finished = true;
					release();
					break;
				}
				if (buffered < LOCAL_FILE_HEADER_SIZE) break;
				const header = new DataView(peekBytes(LOCAL_FILE_HEADER_SIZE).buffer);
				const flags = header.getUint16(OFFSET_FLAGS, true);
				const method = header.getUint16(OFFSET_METHOD, true);
				if ((flags & FLAG_DATA_DESCRIPTOR) !== 0 || method !== ZIP_METHOD_STORE) {
					fallback = true;
					release();
					break;
				}
				const nameLength = header.getUint16(OFFSET_NAME_LENGTH, true);
				const extraLength = header.getUint16(OFFSET_EXTRA_LENGTH, true);
				const headerTotal = LOCAL_FILE_HEADER_SIZE + nameLength + extraLength;
				if (buffered < headerTotal) break;
				const nameBytes = new Uint8Array(peekBytes(LOCAL_FILE_HEADER_SIZE + nameLength).buffer, LOCAL_FILE_HEADER_SIZE, nameLength);
				consume(headerTotal, null);
				current = {
					name: decoder.decode(nameBytes),
					remaining: header.getUint32(OFFSET_COMPRESSED_SIZE, true),
					parts: [],
				};
			}
			return done;
		},
		needsFallback: () => fallback,
		ended: () => finished,
	};
}
