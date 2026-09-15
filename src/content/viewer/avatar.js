/**
 * 作者・コメント投稿者のアバター (img)。
 *
 * サイドバーの作者行とコメント一覧の投稿者アイコンは同じ形なので、ここに 1 つだけ置く。
 * 取れるまでは枠だけ (is-pending)、読み込みに失敗しても枠だけ残して黙って続ける。
 * 名前が隣にあるので読み上げでは装飾扱い (alt は空)。
 */
import { safeCdnUrl } from '../../pixiv/endpoints.js';

/** 画像がまだ無い (取得前・失敗) ことを表すクラス。viewer.css が枠だけを残す。 */
export const AVATAR_PENDING_CLASS = 'is-pending';

/**
 * アバターの img を作る。作った時点では枠だけ。
 * @param {Document} doc 対象のドキュメント
 * @param {string} className 見た目のクラス (author-avatar / comment-avatar)
 * @returns {HTMLImageElement} img
 */
export function createAvatar(doc, className) {
	const avatar = doc.createElement('img');
	avatar.className = className;
	avatar.setAttribute('alt', '');
	avatar.classList.add(AVATAR_PENDING_CLASS);
	avatar.addEventListener('error', () => { avatar.classList.add(AVATAR_PENDING_CLASS); });
	return avatar;
}

/**
 * アバターに画像を入れる。CDN の関門を通らない URL は入れず、枠だけのままにする。
 * @param {HTMLImageElement} avatar createAvatar() が作った img
 * @param {string|null|undefined} url 応答に入っていた画像 URL
 * @returns {boolean} 入れたなら true
 */
export function showAvatar(avatar, url) {
	// 応答の値をそのまま外部オリジンへのリクエストにしない
	const safe = safeCdnUrl(url);
	if (!safe) return false;
	avatar.src = safe;
	avatar.classList.remove(AVATAR_PENDING_CLASS);
	return true;
}
