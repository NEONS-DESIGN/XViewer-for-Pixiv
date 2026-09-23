/**
 * 作品 ID の並びを供給する。
 * ビュワーは「今の ID の前後」しか知りたくないので、その 1 点だけを提供する。
 *
 * 並びの出どころは 2 つある:
 *   - グリッドの DOM 順 (確実に画面と一致する)
 *   - profile/all の全 ID を数値降順に並べたもの。(端を越えて移動するため)
 *     取得とキャッシュは pixiv/pages.js が持つ
 */
import { loadAllWorkIds } from '../pixiv/pages.js';

/**
 * @typedef {object} Sequence
 * @property {string[]} ids 並び
 * @property {(id: string) => string|null} next 次の ID。端なら null
 * @property {(id: string) => string|null} prev 前の ID。端なら null
 * @property {(id: string) => boolean} has 並びに含まれるか
 */

/**
 * ID の配列から並びを作る。出どころ (DOM 順 / profile/all) は問わない。
 * 同じ ID が 2 回入っていたら最初の位置だけを残す。(後ろで上書きすると next() が 2 回目の位置から進む)
 * @param {string[]} ids 並べたい順の ID
 * @returns {Sequence} 並び
 */
export function createSequence(ids) {
	/** @type {string[]} 重複を除いた並び */
	const list = [];
	/** @type {Map<string, number>} ID から添字。広げた並びは数千件になるので毎回 indexOf しない */
	const indexOf = new Map();
	for (const id of ids) {
		if (indexOf.has(id)) continue;
		indexOf.set(id, list.length);
		list.push(id);
	}
	/**
	 * 指定した ID から相対位置の ID を返す。
	 * @param {string} id 基準の ID
	 * @param {number} offset 相対位置
	 * @returns {string|null} 見つからなければ null
	 */
	const step = (id, offset) => {
		const index = indexOf.get(id);
		if (index === undefined) return null;
		return list[index + offset] ?? null;
	};
	return {
		ids: list,
		next: (id) => step(id, 1),
		prev: (id) => step(id, -1),
		has: (id) => indexOf.has(id),
	};
}

/**
 * profile/all の全作品 ID で並びを作り直す。
 * グリッドの端を越えて作品間を移動するために使う。
 * タグ絞り込み中は並びが一致しないので呼び出し側で使わないこと。
 *
 * イラストタブ・漫画タブではその種別だけに絞る。両方を混ぜると、
 * 画面のグリッドに無い種別の作品へ飛んでしまう。
 * @param {Sequence} fallback 取得に失敗したときに返す並び
 * @param {string} userId ユーザー ID
 * @param {string|null} category 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {string} lang 言語サブタグ (strings.lang)
 * @param {{getJsonImpl?: Function}} [deps] テスト用の依存
 * @returns {Promise<Sequence>} 全作品の並び。失敗したら fallback
 */
export async function extendWithAllWorks(fallback, userId, category, lang, deps = {}) {
	try {
		const ids = await loadAllWorkIds(userId, category, lang, deps);
		if (ids.length === 0) return fallback;
		return createSequence(ids);
	} catch {
		// 端で止まるだけで、閲覧そのものは続けられる
		return fallback;
	}
}
