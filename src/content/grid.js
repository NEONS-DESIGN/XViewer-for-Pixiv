/**
 * グリッドのクリックを拾う。
 *
 * リスナーは document に 1 個だけ張る。カードごとに付けると SPA の再描画のたびに
 * 付け直しが必要になるが、document で拾えば再描画の影響を受けない。
 * pixiv の CSS クラス名はビルドごとに変わるため、掴んでよいのは href だけ。
 */
import { ARTWORK_LINK_SELECTOR } from '../common/constants.js';
import { PIXIV_ORIGIN } from '../pixiv/endpoints.js';
import { parseArtworkPath } from './page.js';

/**
 * リンクの href から作品 ID を取り出す。
 * /users/{id}/artworks/{タグ} のようなタグ絞り込みリンクは弾く。
 * @param {string|null} href リンクの href
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {string|null} 作品 ID。作品リンクでなければ null
 */
export function workIdFromLink(href, origin) {
	if (!href) return null;
	try {
		return parseArtworkPath(new URL(href, origin).pathname);
	} catch {
		return null;
	}
}

/**
 * 要素の下にある作品リンクを DOM 順に集める。
 * 1 作品につきリンクが 2 本 (画像用とタイトル用) あるので ID で重複を除く。
 * @param {ParentNode} root 探す範囲
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {string[]} 作品 ID の配列
 */
export function collectWorkIds(root, origin) {
	const ids = [];
	const seen = new Set();
	for (const link of root.querySelectorAll(ARTWORK_LINK_SELECTOR)) {
		const id = workIdFromLink(link.getAttribute('href'), origin);
		if (id && !seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	}
	return ids;
}

/**
 * グリッドのクリックを購読する。
 * 修飾キー付きのクリックと中クリックは拾わない (新しいタブで開きたい操作を邪魔しないため)。
 * @param {Document} doc 対象のドキュメント
 * @param {(workId: string) => void} onOpen 作品リンクが押されたときに呼ばれる
 * @param {{origin?: string}} [deps] テスト用の依存
 * @returns {{dispose: () => void}} 購読の解除
 */
export function attachGridListener(doc, onOpen, deps = {}) {
	const origin = deps.origin ?? doc.location?.origin ?? PIXIV_ORIGIN;

	/**
	 * クリックを処理する。
	 * @param {MouseEvent} event クリック
	 * @returns {void}
	 */
	const listener = (event) => {
		// 新しいタブで開く操作は本来の動作に任せる
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
		const link = event.target?.closest?.(ARTWORK_LINK_SELECTOR);
		if (!link) return;
		const workId = workIdFromLink(link.getAttribute('href'), origin);
		if (!workId) return;
		event.preventDefault();
		event.stopPropagation();
		onOpen(workId);
	};

	// capture 段階で拾い、pixiv 本体のハンドラより先に止める
	doc.addEventListener('click', listener, true);
	return {
		dispose() {
			doc.removeEventListener('click', listener, true);
		},
	};
}
