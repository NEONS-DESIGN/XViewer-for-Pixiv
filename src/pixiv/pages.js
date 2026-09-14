/**
 * ユーザーページの作品を 1 ページ (48 件) ずつ供給する。
 *
 * pixiv 本体のページャは profile/all の ID を数値降順にしたものを 48 件ずつ区切ったものと
 * 完全に一致する (SITE_SPEC §3 で実測)。ここでも同じ規則で切り出す。
 */
import { getJson } from './client.js';
import { userProfileAllUrl, userProfileIllustsUrl } from './endpoints.js';
import { sortIdsDesc } from '../content/sequence.js';
import { WORK_CATEGORY, WORKS_PER_PAGE } from '../common/constants.js';

/**
 * profile/all の応答を覚える。キーは「ユーザー ID + 種別」。
 * 覚えるのは Promise そのもの。同時に呼ばれても 1 本にまとまる。
 * @type {Map<string, Promise<string[]>>}
 */
const idCache = new Map();

/** 覚えておく作者の数。他人のページを渡り歩いても際限なく増やさない。 */
const CACHE_LIMIT = 20;

/**
 * 覚えている ID を捨てる。テストと、ページを離れたときに使う。
 * @returns {void}
 */
export function clearPageSourceCache() {
	idCache.clear();
}

/**
 * 作者の全作品 ID を数値降順で取る。失敗は覚えない。
 * @param {string} userId ユーザー ID
 * @param {string|null} category 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {Function} get getJson の差し替え
 * @returns {Promise<string[]>} ID の並び
 */
function loadIds(userId, category, get) {
	const key = `${userId}:${category ?? 'all'}`;
	const hit = idCache.get(key);
	if (hit) return hit;
	const task = (async () => {
		const body = await get(userProfileAllUrl(userId));
		const categories = category ? [category] : Object.values(WORK_CATEGORY);
		return sortIdsDesc(categories.flatMap((name) => Object.keys(body?.[name] ?? {})));
	})().catch((error) => {
		// 失敗は覚えない。次に呼ばれたらもう一度取りに行く
		// 自分が入れた Promise がまだキャッシュに居るときだけ消す。
		// clearPageSourceCache() を挟んで既に新しい Promise に置き換わっていたら消さない
		if (idCache.get(key) === task) idCache.delete(key);
		throw error;
	});
	idCache.set(key, task);
	if (idCache.size > CACHE_LIMIT) idCache.delete(idCache.keys().next().value);
	return task;
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
			const ids = await loadIds(userId, category, get);
			return Math.ceil(ids.length / WORKS_PER_PAGE);
		},
		async loadPage(page) {
			if (page < 1) return [];
			const ids = await loadIds(userId, category, get);
			const slice = ids.slice((page - 1) * WORKS_PER_PAGE, page * WORKS_PER_PAGE);
			if (slice.length === 0) return [];
			const body = await get(userProfileIllustsUrl(userId, slice, page === 1));
			const works = body?.works ?? {};
			// 応答は ID をキーにした Map で順序を持たない。渡した順に並べ直す。
			// 応答に無い ID (非公開になった作品など) は落とす
			return slice.map((id) => works[id]).filter(Boolean);
		},
	};
}
