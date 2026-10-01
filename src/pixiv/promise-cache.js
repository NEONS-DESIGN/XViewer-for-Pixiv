/**
 * key と Promise の対応を覚える小さなキャッシュ。
 *
 * pages.js (profile/all から組んだ索引)・user.js (ユーザー情報)・illust-assets.js (/pages と ugoira_meta) が共有する。
 *
 * - 覚えるのは Promise そのもの。同時に呼ばれても 1 本にまとまる
 * - 失敗は覚えない。次に呼ばれたらもう一度取りに行ける
 * - 上限を超えたら、最も長く使われていないものから捨てる。get で当たったものは末尾 (最新) へ回す。
 *   Map は挿入順を保つので先頭が最も古い
 */

/**
 * @typedef {object} PromiseCache
 * @property {(key: string) => Promise<unknown>|undefined} get 覚えていればその Promise。当たったら最新扱いにする
 * @property {(key: string, task: () => Promise<unknown>|unknown) => Promise<unknown>} remember
 *   task を走らせて覚える。task が同期的に投げても失敗した Promise として返す
 * @property {(key: string, promise: Promise<unknown>) => void} replace 覚えている Promise を差し替える。
 *   覚えていないキーなら何もしない。(数は増えないので上限の押し出しもしない)
 * @property {() => void} clear 全部捨てる
 */

/**
 * Promise のキャッシュを作る。
 * @param {number} limit 覚える上限。超えたら最も長く使われていないものから捨てる
 * @returns {PromiseCache} キャッシュ
 */
export function createPromiseCache(limit) {
	/** @type {Map<string, Promise<unknown>>} */
	const map = new Map();

	/**
	 * Promise を覚え、失敗したら消す。
	 * 消すのは自分が入れた Promise がまだ居るときだけ。clear() や replace() を挟んで
	 * 別の Promise に置き換わっていたら、その新しいものを巻き添えにしない。
	 * @param {string} key キー
	 * @param {Promise<unknown>} promise 覚える Promise
	 * @returns {void}
	 */
	function keep(key, promise) {
		map.set(key, promise);
		promise.catch(() => {
			if (map.get(key) === promise) map.delete(key);
		});
	}

	return {
		get(key) {
			const promise = map.get(key);
			if (promise === undefined) return undefined;
			// 末尾へ回して、よく使うものを押し出されにくくする
			map.delete(key);
			map.set(key, promise);
			return promise;
		},
		remember(key, task) {
			// task が同期的に投げても catch を付けられるよう、必ず Promise に包む
			const promise = Promise.resolve().then(task);
			if (map.size >= limit) map.delete(map.keys().next().value);
			keep(key, promise);
			return promise;
		},
		replace(key, promise) {
			if (!map.has(key)) return;
			keep(key, promise);
		},
		clear: () => map.clear(),
	};
}
