/**
 * pixiv の /ajax/* エンドポイントの URL を組み立てる。
 * すべて同一オリジンの相対 URL を返す純粋関数。
 */

import { WORK_CATEGORY_QUERY, WORK_CATEGORY_QUERY_BOTH } from '../common/constants.js';

/** API の共通接頭辞。 */
const AJAX = '/ajax';

/**
 * pixiv API の lang= へ渡す言語。
 * キーは UI の言語 (strings.lang)、値は pixiv が受け付ける綴り。
 * 未知の綴りはエラーにならず黙って英語になるので、翻訳が返ると分かっている値だけを置く。
 * 中国語は簡体字が `zh`、繁体字が `zh_tw` (アンダースコア) でないと翻訳が返らない。
 */
const API_LANGUAGES = Object.freeze({ ja: 'ja', en: 'en', ko: 'ko', 'zh-CN': 'zh', 'zh-TW': 'zh_tw' });

/** API_LANGUAGES に無い言語のときに送る値。 */
const DEFAULT_API_LANGUAGE = 'ja';

/**
 * API へ渡す言語のクエリを組む。
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} 'lang=ja' の形
 */
export function langParam(lang) {
	const value = Object.hasOwn(API_LANGUAGES, lang) ? API_LANGUAGES[lang] : DEFAULT_API_LANGUAGE;
	return `lang=${value}`;
}

/** pixiv 本体のオリジン。投稿文の相対リンクを解決する基準に使う。 */
export const PIXIV_ORIGIN = 'https://www.pixiv.net';

/** pixiv の表示設定ページ。R-18 を表示できないときの案内先。 */
export const VIEWING_SETTINGS_URL = `${PIXIV_ORIGIN}/settings/viewing`;

/*
 * ページのパス (artworkPath / userPath / tagWorksPath) に付ける表示言語の接頭辞 localePrefix。
 * 英語表示の pixiv はパスの先頭へ `/en` を挟むので、付け忘れると表示言語が日本語へ戻る。
 * 値は呼び出し側が `currentLocalePrefix()` (common/locale.js) で取って渡す。
 * ここは `location` を読まない。既定は空文字 = 日本語。
 */

/**
 * 作品ページのパス。ルーターの URL 書き換えとサイドバーのリンクで使う。
 * 形は ARTWORK_PATH_PATTERN (constants.js) と対になっている。
 * @param {string} illustId 作品 ID
 * @param {string} [localePrefix] 表示言語の接頭辞 (`/en` か空文字)
 * @returns {string} パス
 */
export function artworkPath(illustId, localePrefix = '') {
	return `${localePrefix}/artworks/${illustId}`;
}

/**
 * ユーザーページのパス。
 * @param {string} userId ユーザー ID
 * @param {string} [localePrefix] 表示言語の接頭辞 (`/en` か空文字)
 * @returns {string} パス
 */
export function userPath(userId, localePrefix = '') {
	return `${localePrefix}/users/${userId}`;
}

/**
 * タグで絞り込んだ作品一覧のパス。
 * @param {string} tag タグ名 (エンコード前)
 * @param {string} [localePrefix] 表示言語の接頭辞 (`/en` か空文字)
 * @returns {string} パス
 */
export function tagWorksPath(tag, localePrefix = '') {
	return `${localePrefix}/tags/${encodeURIComponent(tag)}/artworks`;
}

/**
 * 更新系 API の URL。フォロー系とコメント系は /ajax ではなく旧来の PHP。
 * 使うのは pixiv/actions.js だけだが、URL の出どころをここに揃える。
 */
export const ACTION_URLS = Object.freeze({
	LIKE: `${AJAX}/illusts/like`,
	BOOKMARK_ADD: `${AJAX}/illusts/bookmarks/add`,
	BOOKMARK_DELETE: `${AJAX}/illusts/bookmarks/delete`,
	FOLLOW: '/bookmark_add.php',
	UNFOLLOW: '/rpc_group_setting.php',
	/** コメントと返信の投稿。/ajax ではない旧 RPC だが応答は {error, body} で包まれる */
	POST_COMMENT: '/rpc/post_comment.php',
	/** コメントと返信の削除。投稿とは別のパスで、/rpc/ 配下ではない */
	DELETE_COMMENT: '/rpc_delete_comment.php',
});

/**
 * 画像と zip を読み込んでよいホスト。
 * pixiv の CDN は画像・うごイラ zip の i.pximg.net と静的ファイルの s.pximg.net。
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
 * どちらも s.pximg.net の静的ファイルで、年齢制限も認証も掛かっていない。
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
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function illustUrl(illustId, lang) {
	return `${AJAX}/illust/${illustId}?${langParam(lang)}`;
}

/**
 * 作品の全ページ。R-18 を表示できないときは 404 が返る。(異常ではない)
 * @param {string} illustId 作品 ID
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function illustPagesUrl(illustId, lang) {
	return `${AJAX}/illust/${illustId}/pages?${langParam(lang)}`;
}

/**
 * うごイラのフレーム情報と zip の場所。illustType === 2 のみ有効。
 * @param {string} illustId 作品 ID
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function ugoiraMetaUrl(illustId, lang) {
	return `${AJAX}/illust/${illustId}/ugoira_meta?${langParam(lang)}`;
}

/**
 * ルートコメント。
 * @param {string} illustId 作品 ID
 * @param {number} offset 取得開始位置
 * @param {number} limit 取得件数
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function commentRootsUrl(illustId, offset, limit, lang) {
	return `${AJAX}/illusts/comments/roots?illust_id=${illustId}&offset=${offset}&limit=${limit}&${langParam(lang)}`;
}

/**
 * ルートコメントへの返信。
 * offset/limit ではなく 1 始まりの page で送る。
 * @param {string} commentId ルートコメントの ID
 * @param {number} page ページ番号。1 始まり
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function commentRepliesUrl(commentId, page, lang) {
	return `${AJAX}/illusts/comments/replies?comment_id=${commentId}&page=${page}&${langParam(lang)}`;
}

/**
 * ユーザー情報。
 * @param {string} userId ユーザー ID
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function userUrl(userId, lang) {
	return `${AJAX}/user/${userId}?full=1&${langParam(lang)}`;
}

/**
 * ユーザーの全作品 ID。値は null で、キーだけが意味を持つ。
 * @param {string} userId ユーザー ID
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function userProfileAllUrl(userId, lang) {
	return `${AJAX}/user/${userId}/profile/all?${langParam(lang)}`;
}

/**
 * ID を並べて作品サマリを一括取得する。
 * sensitiveFilterMode は userSetting 以外を受け付けず、省略しても結果が同じなので付けない。
 * work_category は pixiv 本体と同じ値を送る。イラスト / 漫画タブなら illust / manga、
 * 両方を並べる artworks タブなら illustManga。
 * @param {string} userId ユーザー ID
 * @param {string[]} ids 作品 ID の配列
 * @param {boolean} isFirstPage 一覧の 1 ページ目か
 * @param {string|null} category 絞り込む種別 (WORK_CATEGORY)。null なら両方
 * @param {string} lang 言語コード (strings.lang)
 * @returns {string} URL
 */
export function userProfileIllustsUrl(userId, ids, isFirstPage, category, lang) {
	const query = ids.map((id) => `ids%5B%5D=${id}`).join('&');
	const firstPage = isFirstPage ? 1 : 0;
	// 知らない値 (null / undefined を含む) は両方扱いへ倒す。値は WORK_CATEGORY_BY_TAB 経由でしか来ない
	const workCategory = WORK_CATEGORY_QUERY[category] ?? WORK_CATEGORY_QUERY_BOTH;
	return `${AJAX}/user/${userId}/profile/illusts?${query}`
		+ `&work_category=${workCategory}&is_first_page=${firstPage}&${langParam(lang)}`;
}
