/**
 * pixiv の /ajax/* エンドポイントの URL を組み立てる。
 * すべて同一オリジンの相対 URL を返す純粋関数。
 * 仕様の根拠は SITE_SPEC.md。
 */

/** API の共通接頭辞。 */
const AJAX = '/ajax';

/** 応答の言語。日本語固定。 */
const LANG = 'lang=ja';

/** pixiv 本体のオリジン。投稿文の相対リンクを解決する基準に使う。 */
export const PIXIV_ORIGIN = 'https://www.pixiv.net';

/** pixiv の表示設定ページ。R-18 を表示できないときの案内先。 */
export const VIEWING_SETTINGS_URL = `${PIXIV_ORIGIN}/settings/viewing`;

/**
 * 作品ページのパス。ルーターの URL 書き換えとサイドバーのリンクで使う。
 * 形は ARTWORK_PATH_PATTERN (constants.js) と対になっている。
 * @param {string} illustId 作品 ID
 * @returns {string} パス
 */
export function artworkPath(illustId) {
	return `/artworks/${illustId}`;
}

/**
 * ユーザーページのパス。
 * @param {string} userId ユーザー ID
 * @returns {string} パス
 */
export function userPath(userId) {
	return `/users/${userId}`;
}

/**
 * タグで絞り込んだ作品一覧のパス。
 * @param {string} tag タグ名 (エンコード前)
 * @returns {string} パス
 */
export function tagWorksPath(tag) {
	return `/tags/${encodeURIComponent(tag)}/artworks`;
}

/**
 * 更新系 API の URL。フォローだけ /ajax ではなく旧来の PHP (SITE_SPEC §4)。
 * 使うのは pixiv/actions.js だけだが、URL の出どころをここに揃える。
 */
export const ACTION_URLS = Object.freeze({
	LIKE: `${AJAX}/illusts/like`,
	BOOKMARK_ADD: `${AJAX}/illusts/bookmarks/add`,
	BOOKMARK_DELETE: `${AJAX}/illusts/bookmarks/delete`,
	FOLLOW: '/bookmark_add.php',
	UNFOLLOW: '/rpc_group_setting.php',
});

/**
 * 画像と zip を読み込んでよいホスト。
 * pixiv の CDN は画像・うごイラ zip の i.pximg.net と静的ファイルの s.pximg.net (SITE_SPEC §2)。
 */
const CDN_HOSTS = Object.freeze(['i.pximg.net', 's.pximg.net']);

/** CDN で使うスキーム。 */
const CDN_PROTOCOL = 'https:';

/**
 * API が返した URL が pixiv の CDN を指しているかを確かめる。
 * 応答の値をそのまま外部オリジンへのリクエストにしないための関門。
 * 相対 URL は CDN を指しえないので受け付けない。
 * @param {string|null|undefined} url 検査する URL
 * @returns {string|null} 使ってよい URL。そうでなければ null
 */
export function safeCdnUrl(url) {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== CDN_PROTOCOL) return null;
		if (!CDN_HOSTS.includes(parsed.hostname)) return null;
		return parsed.href;
	} catch {
		return null;
	}
}

/**
 * pixiv が絵文字・スタンプの画像を置いている場所。
 * どちらも s.pximg.net の静的ファイルで、年齢制限も認証も掛かっていない (SITE_SPEC 実測)。
 */
const COMMON_IMAGES = 'https://s.pximg.net/common/images/';

/** スタンプ ID として通る形。API の値をそのままパスに埋めないための関門 */
const STAMP_ID_PATTERN = /^\d+$/;

/**
 * 絵文字の画像 URL。ID は PIXIV_EMOJI の値なので検証しない。
 * @param {number} id 絵文字 ID
 * @returns {string} URL
 */
export function emojiUrl(id) {
	return `${COMMON_IMAGES}emoji/${id}.png`;
}

/**
 * スタンプの画像 URL。160x160 の jpg が返る。
 * @param {string|number|null|undefined} stampId API が返した stampId
 * @returns {string|null} URL。数字でなければ null
 */
export function stampUrl(stampId) {
	if (stampId === null || stampId === undefined) return null;
	const id = String(stampId);
	if (!STAMP_ID_PATTERN.test(id)) return null;
	return `${COMMON_IMAGES}stamp/generated-stamps/${id}_s.jpg`;
}

/**
 * 作品詳細。
 * @param {string} illustId 作品 ID
 * @returns {string} URL
 */
export function illustUrl(illustId) {
	return `${AJAX}/illust/${illustId}?${LANG}`;
}

/**
 * 作品の全ページ。R-18 を表示できないときは 404 が返る (異常ではない)。
 * @param {string} illustId 作品 ID
 * @returns {string} URL
 */
export function illustPagesUrl(illustId) {
	return `${AJAX}/illust/${illustId}/pages?${LANG}`;
}

/**
 * うごイラのフレーム情報と zip の場所。illustType === 2 のみ有効。
 * @param {string} illustId 作品 ID
 * @returns {string} URL
 */
export function ugoiraMetaUrl(illustId) {
	return `${AJAX}/illust/${illustId}/ugoira_meta?${LANG}`;
}

/**
 * ルートコメント。
 * @param {string} illustId 作品 ID
 * @param {number} offset 取得開始位置
 * @param {number} limit 取得件数
 * @returns {string} URL
 */
export function commentRootsUrl(illustId, offset, limit) {
	return `${AJAX}/illusts/comments/roots?illust_id=${illustId}&offset=${offset}&limit=${limit}&${LANG}`;
}

/**
 * ルートコメントへの返信。
 * offset/limit ではなく 1 始まりの page で送る (SITE_SPEC §4 実測)。
 * @param {string} commentId ルートコメントの ID
 * @param {number} page ページ番号。1 始まり
 * @returns {string} URL
 */
export function commentRepliesUrl(commentId, page) {
	return `${AJAX}/illusts/comments/replies?comment_id=${commentId}&page=${page}&${LANG}`;
}

/**
 * ユーザー情報。
 * @param {string} userId ユーザー ID
 * @returns {string} URL
 */
export function userUrl(userId) {
	return `${AJAX}/user/${userId}?full=1&${LANG}`;
}

/**
 * ユーザーの全作品 ID。値は null で、キーだけが意味を持つ。
 * @param {string} userId ユーザー ID
 * @returns {string} URL
 */
export function userProfileAllUrl(userId) {
	return `${AJAX}/user/${userId}/profile/all?${LANG}`;
}

/**
 * ID を並べて作品サマリを一括取得する。
 * sensitiveFilterMode は userSetting 以外を受け付けず、省略しても結果が同じなので付けない。
 * @param {string} userId ユーザー ID
 * @param {string[]} ids 作品 ID の配列
 * @param {boolean} isFirstPage 一覧の 1 ページ目か
 * @returns {string} URL
 */
export function userProfileIllustsUrl(userId, ids, isFirstPage) {
	const query = ids.map((id) => `ids%5B%5D=${id}`).join('&');
	const firstPage = isFirstPage ? 1 : 0;
	return `${AJAX}/user/${userId}/profile/illusts?${query}`
		+ `&work_category=illustManga&is_first_page=${firstPage}&${LANG}`;
}
