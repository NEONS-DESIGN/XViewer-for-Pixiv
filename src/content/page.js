/**
 * URL からページの種別を判定する。
 * DOM を触らない純粋関数だけを置く。判定を 1 か所に閉じ込めるのが目的。
 */
import {
	USER_PATH_PATTERN,
	USER_TAG_PATH_PATTERN,
	USER_WORKS_PATH_PATTERN,
	ARTWORK_PATH_PATTERN,
	PAGE_KEY_SEPARATOR,
} from '../common/constants.js';

/**
 * @typedef {object} UserPage
 * @property {string} userId
 * @property {boolean} isWorksGrid その人自身の作品グリッドか (ブックマークやフォロー中は false)
 * @property {boolean} isTagFiltered タグで絞り込んでいるか
 */

/**
 * ユーザーページかどうかを判定し、ユーザー ID を取り出す。
 * @param {string} pathname location.pathname
 * @returns {UserPage|null} ユーザーページでなければ null
 */
export function parseUserPage(pathname) {
	const matched = USER_PATH_PATTERN.exec(pathname);
	if (!matched) return null;
	return {
		userId: matched[1],
		isWorksGrid: USER_WORKS_PATH_PATTERN.test(pathname),
		isTagFiltered: USER_TAG_PATH_PATTERN.test(pathname),
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
