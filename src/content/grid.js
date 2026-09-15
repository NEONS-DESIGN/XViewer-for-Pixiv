/**
 * グリッドのクリックを拾う。
 *
 * リスナーは document に 1 個だけ張る。カードごとに付けると SPA の再描画のたびに
 * 付け直しが必要になるが、document で拾えば再描画の影響を受けない。
 * pixiv の CSS クラス名はビルドごとに変わるため、掴んでよいのは href だけ。
 */
import { ARTWORK_LINK_SELECTOR, CARD_SELECTOR } from '../common/constants.js';
import { warn } from '../common/log.js';
import { PIXIV_ORIGIN } from '../pixiv/endpoints.js';
import { parseArtworkPath } from './page.js';

/**
 * 作品グリッドではない入れ物。
 * プロフィールのホームではピックアップ欄 (section) が ul > li で組まれ、グリッドより先に並ぶ (SITE_SPEC §3)。
 * 先頭のカードを起点にするとピックアップの ul を掴んでしまうので、この中のカードは飛ばす。
 * ページ全体で section はこの 1 個だけ (作品グリッドは div) なので、これで十分に見分けられる。
 */
const NON_GRID_CONTAINER_SELECTOR = 'section';

/** Node.DOCUMENT_NODE。collectWorkIds が document を渡されたかを見る */
const DOCUMENT_NODE_TYPE = 9;

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
 * 作品グリッドの ul を探す。
 * 「カード (li) の中にある作品リンク」を起点に、その li の親を返す。
 * ピックアップ欄の中のカードは飛ばす (NON_GRID_CONTAINER_SELECTOR)。
 * @param {Document|ParentNode} doc 対象のドキュメント
 * @returns {Element|null} グリッドの ul。まだ描かれていなければ null
 */
export function findGridList(doc) {
	try {
		for (const link of doc.querySelectorAll(ARTWORK_LINK_SELECTOR)) {
			if (link.closest?.(NON_GRID_CONTAINER_SELECTOR)) continue;
			const list = link.closest?.(CARD_SELECTOR)?.parentElement ?? null;
			if (list) return list;
		}
	} catch (error) {
		// 掴めないだけ。呼び出し側は「まだ描かれていない」として次の機会に回す
		warn('grid list lookup failed', error);
	}
	return null;
}

/**
 * 要素の下にある作品リンクを DOM 順に集める。
 * 1 作品につきリンクが 2 本 (画像用とタイトル用) あるので ID で重複を除く。
 * document を渡されたら作品グリッドの ul (findGridList) だけを見る。ピックアップ欄やヘッダの
 * 作品リンクを並びに混ぜないため。グリッドが無ければ document 全体へ倒す。
 * @param {ParentNode} root 探す範囲
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {string[]} 作品 ID の配列
 */
export function collectWorkIds(root, origin) {
	const scope = root.nodeType === DOCUMENT_NODE_TYPE ? findGridList(root) ?? root : root;
	const ids = [];
	const seen = new Set();
	for (const link of scope.querySelectorAll(ARTWORK_LINK_SELECTOR)) {
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
 * 拾うのはカード (li) の中の作品リンクだけ。ヘッダの通知などに出る作品リンクは本体に任せる。
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
		if (!link || !link.closest?.(CARD_SELECTOR)) return;
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
