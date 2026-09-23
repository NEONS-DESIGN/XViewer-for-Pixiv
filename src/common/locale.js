/**
 * 表示言語による URL の違いを吸収する。
 *
 * pixiv は表示言語が英語のとき、全てのパスの先頭へ `/en` を挟む。(SITE_SPEC §3 実測)
 * 接頭辞を知らないまま判定すると、ユーザーページも作品リンクも 1 つも掴めず、
 * 拡張が起動しないまま終わる。
 *
 * 方針は 2 つだけ:
 *
 * - **読むときは落とす。** パスの判定は `stripLocale()` を通してから行う (`content/page.js`)
 * - **組むときは付け直す。** URL を作るときは今見ている接頭辞を付ける (`pixiv/endpoints.js`)
 *
 * 落とすだけにすると、モーダルを開いた直後の URL やサイドバーのリンクが日本語ページを指し、
 * リロードやリンク遷移でユーザーの表示言語が勝手に日本語へ戻ってしまう。
 *
 * DOM は触らない。`currentLocalePrefix()` だけが `location` を読む。
 */
import { LOCALE_PATH_PATTERN } from './constants.js';

/**
 * パスから表示言語の接頭辞を落とす。
 * @param {string} pathname location.pathname (`/en/users/11` の形)
 * @returns {string} 接頭辞を除いたパス (`/users/11`)。接頭辞が無ければそのまま
 */
export function stripLocale(pathname) {
	if (typeof pathname !== 'string') return '';
	return pathname.replace(LOCALE_PATH_PATTERN, '');
}

/**
 * パスの先頭に付いている表示言語の接頭辞。
 * @param {string} pathname location.pathname
 * @returns {string} `/en` のような接頭辞。日本語 (接頭辞なし) なら空文字
 */
export function localePrefix(pathname) {
	if (typeof pathname !== 'string') return '';
	return LOCALE_PATH_PATTERN.exec(pathname)?.[0] ?? '';
}

/**
 * 今見ているページの表示言語の接頭辞。
 * 表示言語の切り替えはページの読み込み直しを伴うので、SPA 遷移の途中で変わることはない。
 * @param {{location?: {pathname?: string}}} [target] `location` を持つもの (window / document)。
 *   既定は `globalThis`。テストや Shadow DOM 側からは持っているものを渡す
 * @returns {string} 接頭辞。読めなければ空文字 (= 日本語と同じ扱い)
 */
export function currentLocalePrefix(target = globalThis) {
	return localePrefix(target?.location?.pathname ?? '');
}
