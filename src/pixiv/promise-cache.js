/**
 * key と Promise の対応を覚える小さなキャッシュ。
 *
 * pages.js (profile/all の応答) と user.js (ユーザー情報) が同じ規則で Promise を覚えるので、
 * 規則をここ 1 か所に置く。片方だけ直して挙動が割れるのを防ぐため。
 *
 * - 覚えるのは Promise そのもの。同時に呼ばれても 1 本にまとまる
 * - 失敗は覚えない。次に呼ばれたらもう一度取りに行ける
 * - 上限を超えたら最古から捨てる。Map は挿入順を保つので先頭が最も古い
 */

/**
 * @typedef {object} PromiseCache
 * @property {(key: string) => Promise<unknown>|undefined} get 覚えていればその Promise
 * @property {(key: string, task: () => Promise<unknown>|unknown) => Promise<unknown>} remember
 *   task を走らせて覚える。task が同期的に投げても失敗した Promise として返す
 * @property {(key: string, promise: Promise<unknown>) => void} replace 覚えている Promise を差し替える。
 *   上限の押し出しはしない (差し替えでは数が増えない)
 * @property {() => void} clear 全部捨てる
 */

/**
 * Promise のキャッシュを作る。
 * @param {number} limit 覚える上限。超えたら最古から捨てる
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
		get: (key) => map.get(key),
		remember(key, task) {
			// task が同期的に投げても catch を付けられるよう、必ず Promise に包む
			const promise = Promise.resolve().then(task);
			if (map.size >= limit) map.delete(map.keys().next().value);
			keep(key, promise);
			return promise;
		},
		replace: keep,
		clear: () => map.clear(),
	};
}
