/**
 * URL からページの種別を判定する。
 * DOM を触らない純粋関数だけを置く。判定を 1 か所に閉じ込めるのが目的。
 */
import { USER_PATH_PATTERN, USER_TAG_PATH_PATTERN, ARTWORK_PATH_PATTERN } from '../common/constants.js';

/**
 * @typedef {object} UserPage
 * @property {string} userId
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
 * ビュワーを動かす対象のページか。
 * @param {string} pathname location.pathname
 * @returns {boolean} 対象なら true
 */
export function isViewerTarget(pathname) {
	return parseUserPage(pathname) !== null;
}
