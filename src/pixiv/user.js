/**
 * ユーザー情報 (/ajax/user/{id}?full=1) の取得をまとめる。
 *
 * この応答はサイドバー (作者アイコン) と actions-bar (フォロー状態) の両方が要る。
 * ユーザーページでは作者が変わらないので、作品を送るたびに取り直さない。
 * フォロー状態の出どころもここ 1 つにする。切替後は patchUserProfile で書き換え、
 * 呼び出し側が別のキャッシュを持たなくて済むようにする。
 */
import { getJson } from './client.js';
import { userUrl } from './endpoints.js';
import { createPromiseCache } from './promise-cache.js';

/**
 * 覚えておく作者の上限。
 * ブックマーク一覧のように他人の作品が並ぶページを長く流し見すると作者の数だけ増えるので、
 * 古いものから捨てて定常に保つ。
 * pages.js の PROFILE_CACHE_LIMIT (profile/all の ID 一覧) とは別物。
 */
const USER_PROFILE_CACHE_LIMIT = 100;

/**
 * @typedef {object} UserDeps
 * @property {(url: string) => Promise<object>} [getJsonImpl] 取得の差し替え。client.js の getJson と同じ形
 */

/**
 * ユーザー ID → 取得中または取得済みの Promise。
 * 覚え方 (Promise のまま覚える・失敗は覚えない・上限で最古を捨てる) は promise-cache.js。
 * キーは userId だけで lang を含まない。表示言語の切り替えは pixiv 側のページ全体の
 * リロードを伴うため、このモジュールの状態 (このキャッシュを含む) ごと消える前提に乗っている。
 * 同一セッション中に lang だけが変わることは無い、という前提が崩れたらキーの見直しが要る。
 */
const cache = createPromiseCache(USER_PROFILE_CACHE_LIMIT);

/**
 * ユーザー情報を取る。同じ ID は覚えて使い回す。
 * @param {string} userId ユーザー ID
 * @param {string} lang 言語サブタグ (strings.lang)
 * @param {UserDeps} [deps] テスト用の依存
 * @returns {Promise<object>} /ajax/user/{id}?full=1 の body
 */
export function fetchUserProfile(userId, lang, deps = {}) {
	const getJsonImpl = deps.getJsonImpl ?? getJson;
	return cache.get(userId) ?? cache.remember(userId, () => getJsonImpl(userUrl(userId, lang)));
}

/**
 * 覚えたユーザー情報に差分を重ねる。フォロー切替後に isFollowed を書き換えるために使う。
 * 取得中なら完了後の内容に重ねる。覚えていなければ何もしない。(次の取得で最新が入る)
 * @param {string} userId ユーザー ID
 * @param {object} patch 上書きするフィールド
 * @returns {boolean} 書き換えたら true。覚えていなければ false
 */
export function patchUserProfile(userId, patch) {
	const cached = cache.get(userId);
	if (!cached) return false;
	cache.replace(userId, cached.then((profile) => ({ ...profile, ...patch })));
	return true;
}

/**
 * 覚えた内容を捨てる。テスト用。
 * @returns {void}
 */
export function clearUserCache() {
	cache.clear();
}
