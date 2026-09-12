/**
 * ユーザー情報 (/ajax/user/{id}?full=1) の取得をまとめる。
 *
 * この応答はサイドバー (作者アイコン) と actions-bar (フォロー状態) の両方が要る。
 * ユーザーページでは作者が変わらないので、作品を送るたびに取り直さない。
 */
import { getJson } from './client.js';
import { userUrl } from './endpoints.js';

/**
 * ユーザー ID → 取得中または取得済みの Promise。
 * 取得中の Promise をそのまま入れておくことで、同時に呼ばれても 1 本にまとまる。
 * @type {Map<string, Promise<object>>}
 */
const cache = new Map();

/**
 * ユーザー情報を取る。同じ ID は覚えて使い回す。
 * @param {string} userId ユーザー ID
 * @param {(userId: string) => Promise<object>} [fetchJson] 取得の差し替え。テストから通信させないために使う
 * @returns {Promise<object>} /ajax/user/{id}?full=1 の body
 */
export function fetchUserProfile(userId, fetchJson = (id) => getJson(userUrl(id))) {
	const cached = cache.get(userId);
	if (cached) return cached;
	const pending = fetchJson(userId);
	cache.set(userId, pending);
	// 失敗は覚えない。次に呼ばれたらもう一度取りに行けるようにする
	pending.catch(() => { if (cache.get(userId) === pending) cache.delete(userId); });
	return pending;
}

/**
 * 覚えた内容を捨てる。テスト用。
 * @returns {void}
 */
export function clearUserCache() {
	cache.clear();
}
