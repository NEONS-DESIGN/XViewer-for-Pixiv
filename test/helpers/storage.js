/**
 * chrome.storage の保存領域 (sync / local) の偽物。
 * 本物と同じく get(keys) は keys で絞って返す。(keys を無視して全部返すと、
 * 実装が「読むキーを列挙している」ことをテストで確かめられない)
 */

/**
 * 保存領域の偽物を作る。
 * @param {object} [initial] 最初から入っている値
 * @returns {{area: {get: Function, set: Function}, store: object, written: object}}
 *   area: get / set を持つ領域。store: 今の中身 (initial も含む)。written: set で書かれた分だけ
 */
export function fakeArea(initial = {}) {
	const store = { ...initial };
	const written = {};
	const area = {
		/**
		 * 本物の chrome.storage と同じ引数を解する。
		 * @param {string|string[]|object|null|undefined} [keys] 読むキー。null / undefined なら全部。
		 *   object なら「キー: 既定値」の組
		 * @returns {Promise<object>} 見つかった値
		 */
		async get(keys) {
			if (keys === null || keys === undefined) return { ...store };
			if (typeof keys === 'string') return pick([keys], {});
			if (Array.isArray(keys)) return pick(keys, {});
			return pick(Object.keys(keys), keys);
		},
		async set(patch) {
			Object.assign(store, patch);
			Object.assign(written, patch);
		},
	};

	/**
	 * store から指定のキーだけ取り出す。
	 * @param {string[]} keys キー
	 * @param {object} defaults 無いときの既定値
	 * @returns {object} 見つかった値 (無く既定も無いキーは含めない)
	 */
	function pick(keys, defaults) {
		const found = {};
		for (const key of keys) {
			if (key in store) found[key] = store[key];
			else if (key in defaults) found[key] = defaults[key];
		}
		return found;
	}

	return { area, store, written };
}
