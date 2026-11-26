/**
 * ビュワーの部品が DOM を組むときの小物。
 *
 * 要素を作ってクラスと文字を入れる、という同じ並びを各ファイルで書かないために置く。
 * 偽の DOM (テスト) でも動くよう、使うのは createElement / className / textContent /
 * setAttribute / addEventListener / replaceWith だけにする。
 */
import { setImageSrcAttribute } from '../../common/image-source.js';

/** 新しいタブで開くリンクの target。 */
const NEW_TAB_TARGET = '_blank';

/** 新しいタブで開くリンクの rel。開いた先に opener と Referer を渡さない。 */
const NEW_TAB_REL = 'noopener noreferrer';

/**
 * 要素を作る。クラスと文字は渡したときだけ入れる。
 * @param {Document} doc 対象のドキュメント
 * @param {string} tag タグ名
 * @param {string} [className] クラス
 * @param {string} [text] 中の文字
 * @returns {HTMLElement} 要素
 */
export function el(doc, tag, className, text) {
	const node = doc.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/**
 * type="button" のボタンを作る。(form の中で押しても送信しない)
 * @param {Document} doc 対象のドキュメント
 * @param {string} [className] クラス
 * @param {string} [text] 中の文字
 * @returns {HTMLButtonElement} ボタン
 */
export function btn(doc, className, text) {
	const node = el(doc, 'button', className, text);
	node.type = 'button';
	return node;
}

/**
 * 失敗を伝える段落 (role="alert") を作る。差し込むのは呼び出し側。
 * @param {Document} doc 対象のドキュメント
 * @param {string} className クラス
 * @param {string} text 文言
 * @returns {HTMLParagraphElement} 段落
 */
export function createAlert(doc, className, text) {
	const node = el(doc, 'p', className, text);
	node.setAttribute('role', 'alert');
	return node;
}

/**
 * 新しいタブで開くリンクを作る。rel を必ず付ける。
 * @param {Document} doc 対象のドキュメント
 * @param {string} href 飛び先。空文字なら href を付けない (後から入れる)
 * @param {string} [className] クラス
 * @returns {HTMLAnchorElement} リンク
 */
export function externalLink(doc, href, className) {
	const link = el(doc, 'a', className);
	if (href) link.href = href;
	link.setAttribute('target', NEW_TAB_TARGET);
	link.setAttribute('rel', NEW_TAB_REL);
	return link;
}

/**
 * 画像を作る。読み込めなければ文字に差し替える。
 * @param {Document} doc 対象のドキュメント
 * @param {object} options 設定
 * @param {string} options.url 画像の URL
 * @param {string} options.alt 代わりの文字 (読み上げ用)。装飾なら空文字
 * @param {string} options.fallback 読み込めなかったときに置く文字
 * @param {string} [options.className] クラス
 * @param {boolean} [options.lazy] 画面に入るまで読み込みを遅らせるか
 * @returns {HTMLImageElement} img
 */
export function fallbackImage(doc, { url, alt, fallback, className, lazy = false }) {
	const image = el(doc, 'img', className);
	if (lazy) {
		image.setAttribute('loading', 'lazy');
		image.setAttribute('decoding', 'async');
	}
	setImageSrcAttribute(image, url);
	image.setAttribute('alt', alt);
	image.addEventListener('error', () => { image.replaceWith(doc.createTextNode(fallback)); });
	return image;
}
