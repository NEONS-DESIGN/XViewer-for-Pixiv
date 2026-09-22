/**
 * pixiv の更新系 API。すべて SITE_SPEC §4 で実機観測して確定した仕様。
 * 追加と削除でエンドポイントも本体の形式も違うので、ここに閉じ込める。
 */
import { postJson, postForm, postFormRaw, postFormData } from './client.js';
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
 * 応答は /ajax/* の {error, message, body} ではなく**素の配列**で、空なら成功。
 * (中身があるときはエラー文言。SITE_SPEC §4-5) pixiv 本体も長さだけで成否を決めている。
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
 * 応答は {user_id} で、送った ID が返れば成功。(SITE_SPEC §4-6)
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

/** 投稿の種類。同じエンドポイントを type で振り分ける。(SITE_SPEC §4) */
const COMMENT_TYPES = Object.freeze({ TEXT: 'comment', STAMP: 'stamp' });

/**
 * @typedef {object} PostedComment
 * @property {string} id 投稿されたコメントの ID
 * @property {string} userId 投稿者 (自分) のユーザー ID
 * @property {string} userName 投稿者 (自分) の表示名
 * @property {string} text 本文。スタンプなら空文字
 * @property {string|null} stampId スタンプ ID。テキストなら null
 */

/**
 * コメントを投稿して、投稿された 1 件を返す。
 *
 * 応答の値は snake_case なので、ここで画面側の語彙へそろえる。
 * アバターの URL は応答に入らない。(pixiv 本体も自分のセッションの値を使う)
 * @param {Record<string, string>} params 送るパラメータ
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<PostedComment>} 投稿された 1 件
 * @throws {PixivError} 応答に comment_id が無いとき
 */
async function submitComment(params, token, deps) {
	const body = await postForm(ACTION_URLS.POST_COMMENT, params, token, deps);
	const id = body?.comment_id;
	if (id === null || id === undefined || id === '') {
		throw new PixivError(PIXIV_ERROR_KINDS.API, 'post comment returned no comment_id');
	}
	const stampId = body.stamp_id;
	return {
		id: String(id),
		userId: body.user_id === null || body.user_id === undefined ? '' : String(body.user_id),
		userName: body.user_name ?? '',
		text: body.comment ?? '',
		stampId: stampId === null || stampId === undefined || stampId === '' ? null : String(stampId),
	};
}

/**
 * 返信のときだけ parent_id を足す。
 * 値が無いのにキーだけ送ると pixiv 側でルートへの投稿と扱いが変わるので、キーごと落とす。
 * @param {string|null|undefined} parentId 返信先のルートコメント ID
 * @returns {Record<string, string>} 足すパラメータ
 */
function parentParam(parentId) {
	return parentId ? { parent_id: String(parentId) } : {};
}

/**
 * 作品にコメントする。parentId を渡すとそのコメントへの返信になる。
 * @param {string} illustId 作品 ID
 * @param {string} authorUserId 作品の作者のユーザー ID (返信先の相手ではない)
 * @param {string} text 本文
 * @param {string|null} parentId 返信先のルートコメント ID。作品へのコメントなら null
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<PostedComment>} 投稿された 1 件
 */
export function postComment(illustId, authorUserId, text, parentId, token, deps) {
	return submitComment({
		type: COMMENT_TYPES.TEXT,
		illust_id: illustId,
		author_user_id: authorUserId,
		comment: text,
		...parentParam(parentId),
	}, token, deps);
}

/**
 * 作品にスタンプを投稿する。parentId を渡すとそのコメントへの返信になる。
 * @param {string} illustId 作品 ID
 * @param {string} authorUserId 作品の作者のユーザー ID
 * @param {string} stampId スタンプ ID
 * @param {string|null} parentId 返信先のルートコメント ID。作品へのコメントなら null
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<PostedComment>} 投稿された 1 件
 */
export function postStamp(illustId, authorUserId, stampId, parentId, token, deps) {
	return submitComment({
		type: COMMENT_TYPES.STAMP,
		illust_id: illustId,
		author_user_id: authorUserId,
		stamp_id: stampId,
		...parentParam(parentId),
	}, token, deps);
}

/**
 * コメントか返信を削除する。
 *
 * pixiv の仕様上、消せるのは一覧の `editable` が true の 1 件だけ。
 * (自分のコメントと、自分の作品に付いたコメント) 呼び出し側で出し分けること。
 * **削除は取り消せない。** UI 側で誤爆を防ぐこと。
 *
 * 応答は {error, message, body} で包まれる。pixiv 本体も投稿と同じ口へ通しており、
 * その口は body が無ければ例外にするので、body は必ず付いてくる。(SITE_SPEC §4)
 * 中身は使わないので読まない。
 * @param {string} illustId 作品 ID
 * @param {string} commentId 消すコメントの ID
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] テスト用の依存
 * @returns {Promise<void>}
 */
export async function deleteComment(illustId, commentId, token, deps) {
	await postForm(ACTION_URLS.DELETE_COMMENT, { i_id: illustId, del_id: commentId }, token, deps);
}
