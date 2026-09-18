/**
 * pixiv の更新系 API。すべて SITE_SPEC §4 で実機観測して確定した仕様。
 * 追加と削除でエンドポイントも本体の形式も違うので、ここに閉じ込める。
 */
import { postJson, postFormRaw, postFormData } from './client.js';
import { ACTION_URLS } from './endpoints.js';
import { PixivError, PIXIV_ERROR_KINDS } from './errors.js';

/** @typedef {import('./client.js').ClientDeps} ClientDeps */

/** ブックマークの公開設定。 */
const RESTRICT_PUBLIC = 0;
const RESTRICT_PRIVATE = 1;

/** フォロー系の応答が予期しない形だったときの文言。console にしか出ないので日本語にしない。 */
const FOLLOW_REJECTED = 'follow was rejected';
const FOLLOW_UNEXPECTED = 'follow returned an unexpected body';
const UNFOLLOW_REJECTED = 'unfollow was not applied';

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
 *
 * 応答は /ajax/* の {error, message, body} ではなく**素の配列**で、空なら成功
 * (中身があるときはエラー文言。SITE_SPEC §4-5)。pixiv 本体も長さだけで成否を決めている。
 * @param {string} userId ユーザー ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<void>}
 * @throws {PixivError} フォローできなかったとき、または応答が配列でないとき
 */
export async function followUser(userId, token, deps) {
	const body = await postFormRaw(ACTION_URLS.FOLLOW, {
		mode: 'add',
		type: 'user',
		user_id: userId,
		tag: '',
		restrict: String(RESTRICT_PUBLIC),
		format: 'json',
	}, token, deps);
	// 形が変わったときに成功と誤認しない。できていないのに「フォロー中」と出すと嘘になる
	if (!Array.isArray(body)) {
		throw new PixivError(PIXIV_ERROR_KINDS.PARSE, FOLLOW_UNEXPECTED);
	}
	if (body.length > 0) {
		const first = body[0];
		throw new PixivError(PIXIV_ERROR_KINDS.API, typeof first === 'string' && first ? first : FOLLOW_REJECTED);
	}
}

/**
 * フォローを外す。追加とはエンドポイントもパラメータ名も違う。
 *
 * 応答は {user_id} で、送った ID が返れば成功 (SITE_SPEC §4-6)。
 * こちらも {error, message, body} では包まれない。
 * @param {string} userId ユーザー ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<void>}
 * @throws {PixivError} 送った ID が返ってこなかったとき
 */
export async function unfollowUser(userId, token, deps) {
	const body = await postFormRaw(ACTION_URLS.UNFOLLOW, {
		mode: 'del',
		type: 'bookuser',
		id: userId,
	}, token, deps);
	// 数値で返ることもあるので文字列にそろえて比べる
	const returned = Array.isArray(body) ? undefined : body?.user_id;
	if (returned === null || returned === undefined || String(returned) !== String(userId)) {
		throw new PixivError(PIXIV_ERROR_KINDS.API, UNFOLLOW_REJECTED);
	}
}
