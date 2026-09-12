/**
 * 作品のシェア先を組み立てる。
 * 文言もパラメータの並びも pixiv 本体のシェアメニューの実測値に合わせている (SITE_SPEC §4)。
 * 通信はしない純粋関数だけを置く。
 */
import { PIXIV_ORIGIN, artworkPath } from './endpoints.js';

/** シェア文の区切り。pixiv 本体は「タイトル | 作者 #pixiv」で組む。 */
const TEXT_SEPARATOR = ' | ';

/** シェア文の末尾に付くタグ。 */
const SHARE_TAG = '#pixiv';

/**
 * @typedef {object} ShareTarget シェア先 1 件
 * @property {string} key 識別子
 * @property {string} label 表示名
 * @property {string} icon アイコン名 (ICON_SHAPES のキー)
 * @property {string} [href] 新しいタブで開く URL。コピーのときは持たない
 * @property {string} [copyText] クリップボードへ書く文字列。リンクのときは持たない
 */

/**
 * 作品ページの絶対 URL。
 * シェア先は外部サイトなので相対 URL では渡せない。
 * @param {string} illustId 作品 ID
 * @returns {string} URL
 */
export function artworkUrl(illustId) {
	return `${PIXIV_ORIGIN}${artworkPath(illustId)}`;
}

/**
 * シェア文。
 * @param {{title: string, userName: string}} detail 作品詳細
 * @returns {string} 「タイトル | 作者 #pixiv」
 */
export function shareText(detail) {
	return `${detail.title}${TEXT_SEPARATOR}${detail.userName} ${SHARE_TAG}`;
}

/**
 * シェア先を並べる。
 *
 * パラメータは URLSearchParams ではなく encodeURIComponent で組む。
 * URLSearchParams は空白を + にするので、pixiv 本体が作る URL と文字列が変わる (実測確認済み)。
 * @param {{id: string, title: string, userName: string}} detail 正規化した作品詳細
 * @returns {ShareTarget[]} シェア先。pixiv 本体と同じ並び
 */
export function buildShareTargets(detail) {
	const url = artworkUrl(detail.id);
	const text = shareText(detail);
	const encodedUrl = encodeURIComponent(url);
	const encodedText = encodeURIComponent(text);
	return [
		{
			key: 'x',
			label: 'X',
			icon: 'brandX',
			href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
		},
		{
			key: 'facebook',
			label: 'Facebook',
			icon: 'brandFacebook',
			href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
		},
		{
			// Pawoo は Mastodon インスタンス。本文と URL を 1 つの text にまとめて渡す
			key: 'pawoo',
			label: 'Pawoo',
			icon: 'brandMastodon',
			href: `https://pawoo.net/share?text=${encodeURIComponent(`${text} ${url}`)}`,
		},
		{
			// pixiv 本体には無い項目。「コレクションを作成」は拡張の中では再現できないので、
			// 代わりに URL をコピーできるようにする (docs/DECISIONS.md)
			key: 'copy',
			label: 'リンクをコピー',
			icon: 'link',
			copyText: url,
		},
	];
}
