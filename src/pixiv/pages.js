/**
 * ユーザーページの作品 ID と、それを 1 ページ (48 件) ずつ切り出す供給口。
 *
 * pixiv 本体のページャは profile/all の ID を数値降順にしたものを 48 件ずつ区切ったものと
 * 完全に一致する (SITE_SPEC §3 で実測)。ここでも同じ規則で切り出す。
 * 「全作品 ID の並び」はビュワーの作品間移動 (content/sequence.js) も使うので、
 * 取得とキャッシュはここ 1 か所に置き、種別の絞り込みはキャッシュの後段で行う。
 */
import { getJson } from './client.js';
import { userProfileAllUrl, userProfileIllustsUrl } from './endpoints.js';
import { WORK_CATEGORY, WORKS_PER_PAGE } from '../common/constants.js';

/**
 * profile/all の応答本体を覚える。キーはユーザー ID。
 * 覚えるのは Promise そのもの。同時に呼ばれても 1 本にまとまる。
 * 種別 (イラスト / 漫画) で分けないのは、応答が同じものだから。
 * @type {Map<string, Promise<object>>}
 */
const profileCache = new Map();

/** 覚えておく作者の数。他人のページを渡り歩いても際限なく増やさない。 */
const PROFILE_CACHE_LIMIT = 20;

/**
 * 覚えている応答を捨てる。今はテストからだけ呼ぶ (本体に呼び出し元は無い)。
 * 本体では上限 PROFILE_CACHE_LIMIT の押し出しに任せていて、明示的に捨てる場面が無い。
 * @returns {void}
 */
export function clearPageSourceCache() {
	profileCache.clear();
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
 * profile/all の応答本体を取る。失敗は覚えない。
 * @param {string} userId ユーザー ID
 * @param {Function} get getJson の差し替え
 * @returns {Promise<object>} 応答の body
 */
function loadProfileAll(userId, get) {
	const hit = profileCache.get(userId);
	if (hit) return hit;
	const task = Promise.resolve()
		.then(() => get(userProfileAllUrl(userId)))
		.catch((error) => {
			// 失敗は覚えない。次に呼ばれたらもう一度取りに行く。
			// 自分が入れた Promise がまだキャッシュに居るときだけ消す。
			// clearPageSourceCache() を挟んで既に新しい Promise に置き換わっていたら消さない
			if (profileCache.get(userId) === task) profileCache.delete(userId);
			throw error;
		});
	profileCache.set(userId, task);
	if (profileCache.size > PROFILE_CACHE_LIMIT) profileCache.delete(profileCache.keys().next().value);
	return task;
}

/**
 * 作者の全作品 ID を数値降順で取る。
 * @param {string} userId ユーザー ID
 * @param {string|null} [category] 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {{getJsonImpl?: Function}} [deps] テスト用の依存
 * @returns {Promise<string[]>} ID の並び
 */
export async function loadAllWorkIds(userId, category = null, deps = {}) {
	const get = deps.getJsonImpl ?? getJson;
	const body = await loadProfileAll(userId, get);
	const categories = category ? [category] : Object.values(WORK_CATEGORY);
	return sortIdsDesc(categories.flatMap((name) => Object.keys(body?.[name] ?? {})));
}

/**
 * 1 ページぶんの作品を供給する口を作る。
 * @param {string} userId ユーザー ID
 * @param {string|null} category 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {{getJsonImpl?: Function}} [deps] テスト用の依存
 * @returns {{pageCount: () => Promise<number>, loadPage: (page: number) => Promise<object[]>}} ページ供給
 */
export function createPageSource(userId, category, deps = {}) {
	const get = deps.getJsonImpl ?? getJson;
	return {
		async pageCount() {
			const ids = await loadAllWorkIds(userId, category, deps);
			return Math.ceil(ids.length / WORKS_PER_PAGE);
		},
		async loadPage(page) {
			if (page < 1) return [];
			const ids = await loadAllWorkIds(userId, category, deps);
			const slice = ids.slice((page - 1) * WORKS_PER_PAGE, page * WORKS_PER_PAGE);
			if (slice.length === 0) return [];
			const body = await get(userProfileIllustsUrl(userId, slice, page === 1, category));
			const works = body?.works ?? {};
			// 応答は ID をキーにした Map で順序を持たない。渡した順に並べ直す。
			// 応答に無い ID (非公開になった作品など) は落とす
			return slice.map((id) => works[id]).filter(Boolean);
		},
	};
}
