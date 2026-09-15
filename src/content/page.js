/**
 * URL からページの種別を判定する。
 * DOM を触らない純粋関数だけを置く。判定を 1 か所に閉じ込めるのが目的。
 */
import {
	USER_PATH_PATTERN,
	PROFILE_HOME_PATH_PATTERN,
	USER_TAG_PATH_PATTERN,
	USER_WORKS_PATH_PATTERN,
	USER_WORKS_CATEGORY_PATTERN,
	USER_WORKS_TAB_PATH_PATTERN,
	WORK_CATEGORY_BY_TAB,
	ARTWORK_PATH_PATTERN,
	PAGE_KEY_SEPARATOR,
} from '../common/constants.js';

/**
 * @typedef {object} UserPage
 * @property {string} userId
 * @property {boolean} isWorksGrid その人自身の作品グリッドか (ブックマークやフォロー中は false)
 * @property {boolean} isTagFiltered タグで絞り込んでいるか
 * @property {string|null} category グリッドに出ている作品の種別 (WORK_CATEGORY)。イラストと漫画の両方なら null
 */

/**
 * ユーザーページかどうかを判定し、ユーザー ID を取り出す。
 * @param {string} pathname location.pathname
 * @returns {UserPage|null} ユーザーページでなければ null
 */
export function parseUserPage(pathname) {
	const matched = USER_PATH_PATTERN.exec(pathname);
	if (!matched) return null;
	const tab = USER_WORKS_CATEGORY_PATTERN.exec(pathname)?.[1];
	return {
		userId: matched[1],
		isWorksGrid: USER_WORKS_PATH_PATTERN.test(pathname),
		isTagFiltered: USER_TAG_PATH_PATTERN.test(pathname),
		category: tab ? WORK_CATEGORY_BY_TAB[tab] : null,
	};
}

/**
 * 作品ページのパスから作品 ID を取り出す。
 * /users/{id}/artworks/{タグ} は作品リンクではないので弾く。
 * @param {string} pathname パス
 * @returns {string|null} 作品 ID。作品パスでなければ null
 */
export function parseArtworkPath(pathname) {
	return ARTWORK_PATH_PATTERN.exec(pathname)?.[1] ?? null;
}

/**
 * 購読を組み直す必要があるかを判断するキーを作る。
 * /users/1 と /users/1/artworks は同じ作者・同じ絞り込みなので同じキーになる。
 * 生のパスで比べると、pixiv 本体のタブ操作で行き来するたびに
 * viewer と router と gridListener の解体と再構築が走ってしまう。
 *
 * ブックマークやフォロー中は作品グリッドと別のキーにする。並んでいるのが他人の作品なので、
 * 掴んだままにすると「この作者の全作品」へ広げる判断が居座ってしまう。
 *
 * タグ名を含めないのは、絞り込み中は並びを広げないから (canExtendSequence が false)。
 * タグ違い同士では組み直しても同じものを作り直すだけになる。
 * 絞り込み中も並びを広げるようにしたら、タグ名がページの一部になるのでここも変えること。
 * @param {string} pathname location.pathname
 * @returns {string} 作者・グリッドの種類・絞り込みの有無を表すキー
 */
export function pageKey(pathname) {
	const page = parseUserPage(pathname);
	// ユーザーページとして読めないパスは、フォールバックとしてパスそのものを使う
	if (!page) return pathname;
	return [page.userId, page.isWorksGrid, page.isTagFiltered].join(PAGE_KEY_SEPARATOR);
}

/**
 * ビュワーを動かす対象のページか。
 * @param {string} pathname location.pathname
 * @returns {boolean} 対象なら true
 */
export function isViewerTarget(pathname) {
	return parseUserPage(pathname) !== null;
}

/**
 * プロフィールのホームタブか。
 * 「ピックアップ」欄が出るのはこのパスだけなので、欄を隠す CSS もここでだけ効かせる。
 * /users/{id}/artworks のような下位のタブには欄自体が無い (SITE_SPEC §3)。
 * @param {string} pathname location.pathname
 * @returns {boolean} ホームタブなら true
 */
export function isProfileHome(pathname) {
	return PROFILE_HOME_PATH_PATTERN.test(pathname);
}

/**
 * 無限スクロールを効かせるページか。
 * 作品グリッドの 3 タブだけが対象。ホーム・タグ絞り込み・ブックマーク・リクエストは外す。
 * @param {string} pathname location.pathname
 * @returns {boolean} 対象なら true
 */
export function isInfiniteScrollTarget(pathname) {
	return USER_WORKS_TAB_PATH_PATTERN.test(pathname);
}

/** ページ番号として受ける形。10 進の数字だけ。 */
const PAGE_PARAM_PATTERN = /^\d+$/;

/**
 * URL のクエリから ?p= のページ番号を読む。
 * 数として読めない値 (数でない / 0 以下 / 小数) は、ページ指定なしと同じ 1 として扱う。
 * pixiv のページャは 1 始まりなので、下限は 1 になる (SITE_SPEC §3)。
 * 受けるのは 10 進の数字だけ。Number() は '1e2' や '0x10' も整数に読むが、
 * pixiv 側が同じ解釈をする保証は無く、URL と基準ページが食い違う入口になる。
 * @param {string} search location.search ('?p=3' の形。先頭の ? は有っても無くてもよい)
 * @returns {number} ページ番号 (1 以上の整数)
 */
export function parsePageParam(search) {
	const raw = new URLSearchParams(search ?? '').get('p') ?? '';
	if (!PAGE_PARAM_PATTERN.test(raw)) return 1;
	const page = Number(raw);
	return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
