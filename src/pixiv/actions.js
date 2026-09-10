/**
 * pixiv の更新系 API。すべて SITE_SPEC §4 で実機観測して確定した仕様。
 * 追加と削除でエンドポイントも本体の形式も違うので、ここに閉じ込める。
 */
import { postJson, postForm, postFormData } from './client.js';

/** エンドポイント。フォローだけ /ajax ではなく旧来の PHP。 */
const URL_LIKE = '/ajax/illusts/like';
const URL_BOOKMARK_ADD = '/ajax/illusts/bookmarks/add';
const URL_BOOKMARK_DELETE = '/ajax/illusts/bookmarks/delete';
const URL_FOLLOW = '/bookmark_add.php';
const URL_UNFOLLOW = '/rpc_group_setting.php';

/** ブックマークの公開設定。 */
const RESTRICT_PUBLIC = 0;
const RESTRICT_PRIVATE = 1;

/**
 * 作品にいいねする。
 * pixiv の仕様上いいねは取り消せない。UI 側で誤爆を防ぐこと。
 * 冪等なので二重送信しても状態は変わらない。
 * @param {string} illustId 作品 ID
 * @param {string} token CSRF トークン
 * @param {object} [deps] テスト用の依存
 * @returns {Promise<boolean>} 送信前に既にいいね済みだったか
 */
export async function likeIllust(illustId, token, deps) {
	const body = await postJson(URL_LIKE, { illust_id: illustId }, token, deps);
	return body?.is_liked === true;
}

/**
 * 作品をブックマークする。
 * @param {string} illustId 作品 ID
 * @param {boolean} isPrivate 非公開にするか
 * @param {string} token CSRF トークン
 * @param {object} [deps] テスト用の依存
 * @returns {Promise<string>} 追加されたブックマークの ID。削除に必要
 */
export async function addBookmark(illustId, isPrivate, token, deps) {
	const body = await postJson(URL_BOOKMARK_ADD, {
		illust_id: illustId,
		restrict: isPrivate ? RESTRICT_PRIVATE : RESTRICT_PUBLIC,
		comment: '',
		tags: [],
	}, token, deps);
	return body?.last_bookmark_id;
}

/**
 * ブックマークを外す。
 * 本体は JSON ではなく FormData。また削除の反映は数秒遅れるため、
 * 呼び出し側は再取得で確認せず楽観的に画面を更新すること。
 * @param {string} bookmarkId ブックマーク ID
 * @param {string} token CSRF トークン
 * @param {object} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function deleteBookmark(bookmarkId, token, deps) {
	await postFormData(URL_BOOKMARK_DELETE, { bookmark_id: bookmarkId }, token, deps);
}

/**
 * ユーザーをフォローする。
 * @param {string} userId ユーザー ID
 * @param {string} token CSRF トークン
 * @param {object} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function followUser(userId, token, deps) {
	await postForm(URL_FOLLOW, {
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
 * @param {string} userId ユーザー ID
 * @param {string} token CSRF トークン
 * @param {object} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function unfollowUser(userId, token, deps) {
	await postForm(URL_UNFOLLOW, {
		mode: 'del',
		type: 'bookuser',
		id: userId,
	}, token, deps);
}
