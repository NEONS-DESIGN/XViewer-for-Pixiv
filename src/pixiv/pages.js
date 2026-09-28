/**
 * ユーザーページの作品 ID と、それを 1 ページ (48 件) ずつ切り出す供給口。
 *
 * profile/all の ID を数値降順にして 48 件ずつ区切る。pixiv 本体のページャと同じ区切りになる。
 * 「全作品 ID の並び」はビュワーの作品間移動 (content/sequence.js) も使う。
 * 取得とキャッシュはここ 1 か所に置く。キャッシュには応答から組んだ種別ごとの降順 ID の索引
 * (イラスト / 漫画 / 両方を繋いだもの) を覚え、種別の絞り込みは索引から該当の配列を引くだけにする。
 */
import { getJson } from './client.js';
import { userProfileAllUrl, userProfileIllustsUrl } from './endpoints.js';
import { createPromiseCache } from './promise-cache.js';
import { WORK_CATEGORY, WORKS_PER_PAGE } from '../common/constants.js';

/** 覚えておく作者の数。他人のページを渡り歩いても際限なく増やさない。 */
const PROFILE_CACHE_LIMIT = 20;

/**
 * profile/all の応答から組んだ、種別ごとの数値降順 ID の索引 (凍結済み) を覚える。キーはユーザー ID。
 * Promise のまま覚え、失敗は覚えず、上限を超えたら最古から捨てる。
 * 1 つの索引が全種別 (と両方を繋いだ並び) を持つので、種別ではキーを分けない。
 */
const profileCache = createPromiseCache(PROFILE_CACHE_LIMIT);

/**
 * 覚えている索引を捨てる。テスト用。(本体は上限 PROFILE_CACHE_LIMIT の押し出しに任せる)
 * @returns {void}
 */
export function clearPageSourceCache() {
	profileCache.clear();
}

/**
 * 作品 ID を数値の降順に並べる。
 * pixiv の作品 ID は単調増加なので、降順が新しい順になる。
 * 文字列のまま比べると桁数の違う ID の順序が壊れるため数値で比べる。
 * 比較のたびに Number() を呼ぶと要素数の対数倍の回数だけ変換が走るので、
 * 先に 1 回ずつ数値へ変換してから並べ替える (渡された配列は書き換えない)。
 * @param {string[]} ids 作品 ID
 * @returns {string[]} 降順に並べた ID
 */
export function sortIdsDesc(ids) {
	return ids.map((id) => [Number(id), id]).sort((a, b) => b[0] - a[0]).map(([, id]) => id);
}

/** 種別で絞らないとき (loadAllWorkIds(userId, null, ...)) に引くキー。両方を繋いだ降順の並び。 */
const ALL_CATEGORIES_KEY = 'all';

/**
 * profile/all の応答から、種別ごとの数値降順 ID 配列を組む。
 * 呼び出しのたびに並べ替えないよう、配列は凍結してそのまま使い回す。
 * @param {object} body profile/all の応答 body
 * @returns {Readonly<Record<string, ReadonlyArray<string>>>} 種別ごとの ID 配列。両方を繋いだものは 'all'
 */
function sortedIndex(body) {
	const index = Object.fromEntries(
		Object.values(WORK_CATEGORY).map((name) => [name, Object.freeze(sortIdsDesc(Object.keys(body?.[name] ?? {})))]),
	);
	index[ALL_CATEGORIES_KEY] = Object.freeze(
		sortIdsDesc(Object.values(WORK_CATEGORY).flatMap((name) => index[name])),
	);
	return Object.freeze(index);
}

/**
 * profile/all の応答から、種別ごとに並べ替えた ID の索引を取る。失敗は覚えない。
 * @param {string} userId ユーザー ID
 * @param {string} lang 言語コード (strings.lang)
 * @param {Function} get getJson の差し替え
 * @returns {Promise<Readonly<Record<string, ReadonlyArray<string>>>>} 種別ごとの ID 配列
 */
function loadProfileAll(userId, lang, get) {
	return profileCache.get(userId) ?? profileCache.remember(userId, async () => {
		const body = await get(userProfileAllUrl(userId, lang));
		return sortedIndex(body);
	});
}

/**
 * 作者の全作品 ID を数値降順で取る。
 * 返す配列は凍結済みで、呼び出し側は書き換えない。同じ userId・lang なら同じ配列を返す。
 * @param {string} userId ユーザー ID
 * @param {string|null} category 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {string} lang 言語コード (strings.lang)
 * @param {{getJsonImpl?: Function}} [deps] テスト用の依存
 * @returns {Promise<ReadonlyArray<string>>} ID の並び
 */
export async function loadAllWorkIds(userId, category, lang, deps = {}) {
	const get = deps.getJsonImpl ?? getJson;
	const index = await loadProfileAll(userId, lang, get);
	return index[category ?? ALL_CATEGORIES_KEY];
}

/**
 * 1 ページぶんの作品を供給する口を作る。
 * @param {string} userId ユーザー ID
 * @param {string|null} category 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {string} lang 言語コード (strings.lang)
 * @param {{getJsonImpl?: Function}} [deps] テスト用の依存
 * @returns {{pageCount: () => Promise<number>, loadPage: (page: number, options?: {signal?: AbortSignal}) => Promise<object[]>}} ページ供給
 */
export function createPageSource(userId, category, lang, deps = {}) {
	const get = deps.getJsonImpl ?? getJson;
	return {
		async pageCount() {
			const ids = await loadAllWorkIds(userId, category, lang, deps);
			return Math.ceil(ids.length / WORKS_PER_PAGE);
		},
		/**
		 * 1 ページぶんの作品サマリを取る。
		 * profile/all (作品 ID の索引) はビュワーの作品間移動とも共有するので signal を渡さない。
		 * @param {number} page ページ番号 (1 始まり)
		 * @param {{signal?: AbortSignal}} [options] 中断の合図。profile/illusts の取得だけに使う
		 * @returns {Promise<object[]>} 作品サマリ
		 */
		async loadPage(page, options = {}) {
			if (page < 1) return [];
			const ids = await loadAllWorkIds(userId, category, lang, deps);
			const slice = ids.slice((page - 1) * WORKS_PER_PAGE, page * WORKS_PER_PAGE);
			if (slice.length === 0) return [];
			const body = await get(userProfileIllustsUrl(userId, slice, page === 1, category, lang), { signal: options.signal });
			const works = body?.works ?? {};
			// 応答は ID をキーにした Map で順序を持たない。渡した順に並べ直す。
			// 応答に無い ID (非公開になった作品など) は落とす
			return slice.map((id) => works[id]).filter(Boolean);
		},
	};
}
