/**
 * 1 件だけ持つ、寿命付きの先読みの枠。
 * 押し始めの取得と前後の作品の先読みが使う。持つのはメモリ上の Promise だけで、保存はしない。
 */

/** @typedef {{id: string, promise: Promise<unknown>, controller: AbortController, at: number}} SlotEntry */

/**
 * 枠を作る。
 * @param {{ttlMs: number, now?: () => number}} options 寿命 (ミリ秒) と時計
 * @returns {{
 *   put: (id: string, start: (signal: AbortSignal) => Promise<unknown>) => void,
 *   takeEntry: (id: string) => {promise: Promise<unknown>, controller: AbortController}|null,
 *   peekId: () => string|null,
 *   peekPromise: () => Promise<unknown>|null,
 *   drop: () => void,
 * }}
 */
export function createPrefetchSlot({ ttlMs, now = () => performance.now() }) {
	/** @type {SlotEntry|null} */
	let entry = null;

	/**
	 * 中身を止めて空にする。
	 * @returns {void}
	 */
	function drop() {
		entry?.controller.abort();
		entry = null;
	}

	return {
		put(id, start) {
			if (entry?.id === id && now() - entry.at < ttlMs) return;
			drop();
			const controller = new AbortController();
			const promise = start(controller.signal);
			// 使われずに捨てられたときに未処理の拒否を出さない
			promise.catch(() => {});
			entry = { id, promise, controller, at: now() };
		},
		/**
		 * 一致して期限内なら中身を渡して空にする。外れたら走っている取得を止めて空にする。
		 * 受け取った側は controller で取得を止められる。
		 * @param {string} id 開こうとしている ID
		 * @returns {{promise: Promise<unknown>, controller: AbortController}|null} 当たれば中身
		 */
		takeEntry(id) {
			const hit = entry?.id === id && now() - entry.at < ttlMs;
			if (!hit) {
				drop();
				return null;
			}
			const { promise, controller } = entry;
			entry = null;
			return { promise, controller };
		},
		peekId: () => entry?.id ?? null,
		peekPromise: () => entry?.promise ?? null,
		drop,
	};
}
