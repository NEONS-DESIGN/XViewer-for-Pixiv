/**
 * 作品 ID の並びを供給する。
 * ビュワーは「今の ID の前後」しか知りたくないので、その 1 点だけを提供する。
 *
 * 並びの出どころは 2 つある:
 *   - グリッドの DOM 順 (確実に画面と一致する)
 *   - profile/all の全 ID を数値降順に並べたもの (端を越えて移動するため)
 */
import { userProfileAllUrl } from '../pixiv/endpoints.js';
import { getJson } from '../pixiv/client.js';

/**
 * @typedef {object} Sequence
 * @property {string[]} ids 並び
 * @property {(id: string) => string|null} next 次の ID。端なら null
 * @property {(id: string) => string|null} prev 前の ID。端なら null
 */

/**
 * ID の配列から並びを作る。
 * @param {string[]} ids 並べたい順の ID
 * @returns {Sequence} 並び
 */
export function createDomSequence(ids) {
	const list = [...ids];
	/**
	 * 指定した ID から相対位置の ID を返す。
	 * @param {string} id 基準の ID
	 * @param {number} step 相対位置
	 * @returns {string|null} 見つからなければ null
	 */
	const step = (id, offset) => {
		const index = list.indexOf(id);
		if (index < 0) return null;
		return list[index + offset] ?? null;
	};
	return {
		ids: list,
		next: (id) => step(id, 1),
		prev: (id) => step(id, -1),
	};
}

/**
 * 作品 ID を数値の降順に並べる。
 * pixiv の作品 ID は単調増加なので、降順が新しい順になる。
 * 文字列のまま比べると桁数の違う ID の順序が壊れるため数値で比べる。
 * @param {string[]} ids 作品 ID
 * @returns {string[]} 降順に並べた ID
 */
export function sortIdsDesc(ids) {
	return [...ids].sort((a, b) => Number(b) - Number(a));
}

/**
 * profile/all の全作品 ID で並びを作り直す。
 * グリッドの端を越えて作品間を移動するために使う。
 * タグ絞り込み中は並びが一致しないので呼び出し側で使わないこと。
 * @param {Sequence} fallback 取得に失敗したときに返す並び
 * @param {string} userId ユーザー ID
 * @param {{getJsonImpl?: Function}} [deps] テスト用の依存
 * @returns {Promise<Sequence>} 全作品の並び。失敗したら fallback
 */
export async function extendWithAllWorks(fallback, userId, deps = {}) {
	const get = deps.getJsonImpl ?? getJson;
	try {
		const body = await get(userProfileAllUrl(userId));
		const ids = [
			...Object.keys(body?.illusts ?? {}),
			...Object.keys(body?.manga ?? {}),
		];
		if (ids.length === 0) return fallback;
		return createDomSequence(sortIdsDesc(ids));
	} catch {
		// 端で止まるだけで、閲覧そのものは続けられる
		return fallback;
	}
}
