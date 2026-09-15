/**
 * pixiv の更新系 API。すべて SITE_SPEC §4 で実機観測して確定した仕様。
 * 追加と削除でエンドポイントも本体の形式も違うので、ここに閉じ込める。
 */
import { postJson, postForm, postFormData } from './client.js';
import { ACTION_URLS } from './endpoints.js';
import { PixivError, PIXIV_ERROR_KINDS } from './errors.js';

/** @typedef {import('./client.js').ClientDeps} ClientDeps */

/** ブックマークの公開設定。 */
const RESTRICT_PUBLIC = 0;
const RESTRICT_PRIVATE = 1;

/**
 * 作品にいいねする。
 * pixiv の仕様上いいねは取り消せない。UI 側で誤爆を防ぐこと。
 * 冪等なので二重送信しても状態は変わらない。
 * @param {string} illustId 作品 ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<boolean>} 送信前に既にいいね済みだったか
 */
export async function likeIllust(illustId, token, deps) {
	const body = await postJson(ACTION_URLS.LIKE, { illust_id: illustId }, token, deps);
	return body?.is_liked === true;
}

/**
 * 作品をブックマークする。
 * @param {string} illustId 作品 ID
 * @param {boolean} isPrivate 非公開にするか
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<string>} 追加されたブックマークの ID。削除に必要
 * @throws {PixivError} 応答に ID が無いとき。ID 無しで成功扱いにすると、次に押したときに削除へ進めない
 */
export async function addBookmark(illustId, isPrivate, token, deps) {
	const body = await postJson(ACTION_URLS.BOOKMARK_ADD, {
		illust_id: illustId,
		restrict: isPrivate ? RESTRICT_PRIVATE : RESTRICT_PUBLIC,
		comment: '',
		tags: [],
	}, token, deps);
	const bookmarkId = body?.last_bookmark_id;
	if (bookmarkId === null || bookmarkId === undefined || bookmarkId === '') {
		throw new PixivError(PIXIV_ERROR_KINDS.API, 'bookmark add returned no last_bookmark_id');
	}
	return String(bookmarkId);
}

/**
 * ブックマークを外す。
 * 本体は JSON ではなく FormData。また削除の反映は数秒遅れるため、
 * 呼び出し側は再取得で確認せず楽観的に画面を更新すること。
 * @param {string} bookmarkId ブックマーク ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function deleteBookmark(bookmarkId, token, deps) {
	await postFormData(ACTION_URLS.BOOKMARK_DELETE, { bookmark_id: bookmarkId }, token, deps);
}

/**
 * ユーザーをフォローする。
 * 応答本体の形は SITE_SPEC §4 に未記録 (リクエスト形のみ実測)。
 * {error, message, body} でなければ client.js が PARSE として投げる。
 * @param {string} userId ユーザー ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function followUser(userId, token, deps) {
	await postForm(ACTION_URLS.FOLLOW, {
		mode: 'add',
		type: 'user',
		user_id: userId,
		tag: '',
		restrict: String(RESTRICT_PUBLIC),
		format: 'json',
	}, token, deps);
}

/**
 * フォローを外す。追加とはエンドポイントもパラメータ名も違う。
 * 応答本体の形は followUser と同じく SITE_SPEC §4 に未記録。
 * @param {string} userId ユーザー ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function unfollowUser(userId, token, deps) {
	await postForm(ACTION_URLS.UNFOLLOW, {
		mode: 'del',
		type: 'bookuser',
		id: userId,
	}, token, deps);
}
