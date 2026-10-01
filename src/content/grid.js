/**
 * グリッドのクリックを拾う。
 *
 * リスナーは document に 1 個だけ張る。カードごとに付けると SPA の再描画のたびに
 * 付け直しが必要になるが、document で拾えば再描画の影響を受けない。
 * pixiv の CSS クラス名はビルドごとに変わるため、掴んでよいのは href だけ。
 */
import { ARTWORK_LINK_SELECTOR, CARD_SELECTOR, CARD_LINK_SELECTOR } from '../common/constants.js';
import { warn } from '../common/log.js';
import { PIXIV_ORIGIN } from '../pixiv/endpoints.js';
import { parseArtworkPath } from './page.js';

/**
 * 作品グリッドではない入れ物。
 * プロフィールのホームではピックアップ欄 (section) が ul > li で組まれ、グリッドより先に並ぶ。
 * 先頭のカードを起点にするとピックアップの ul を掴んでしまうので、この中のカードは飛ばす。
 * ページ全体で section はこの 1 個だけ (作品グリッドは div) なので、これで十分に見分けられる。
 */
const NON_GRID_CONTAINER_SELECTOR = 'section';

/** Node.DOCUMENT_NODE。collectWorkIds が document を渡されたかを見る */
const DOCUMENT_NODE_TYPE = 9;

/** 作品リンクの末尾のページ番号 (#2 など)。ホームのフィードは画像ごとに 1 始まりの番号を付ける */
const PAGE_HASH_PATTERN = /^#(\d+)$/;

/** パスの終わり (クエリかハッシュの始まり)。 */
const PATH_END_PATTERN = /[?#]/;

/**
 * 押し始めの合図を拾わない入力の種類。
 * 指のスクロールはカードの上から始まることが多く、そのたびに詳細を取りに行かないため。
 */
const PRESS_IGNORED_POINTER_TYPE = 'touch';

/**
 * リンクの href から作品 ID を取り出す。
 * /users/{id}/artworks/{タグ} のようなタグ絞り込みリンクは弾く。
 * @param {string|null} href リンクの href
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {string|null} 作品 ID。作品リンクでなければ null
 */
export function workIdFromLink(href, origin) {
	if (!href) return null;
	// pixiv の作品リンクはパスだけ。並びを集めるときに数千本を読むので、URL を組まずに読む
	if (href.startsWith('/') && !href.startsWith('//')) {
		return parseArtworkPath(href.split(PATH_END_PATTERN, 1)[0]);
	}
	try {
		return parseArtworkPath(new URL(href, origin).pathname);
	} catch {
		return null;
	}
}

/**
 * リンクの href の末尾のページ番号 (#n、1 始まり) を 0 始まりのページ番号にする。
 * 番号が無い・読めないときは 0 (1 枚目)。
 * @param {string|null} href リンクの href
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {number} 0 始まりのページ番号
 */
export function startPageFromLink(href, origin) {
	if (!href) return 0;
	try {
		const matched = PAGE_HASH_PATTERN.exec(new URL(href, origin).hash);
		const page = matched ? Number(matched[1]) : 1;
		return Number.isSafeInteger(page) && page > 1 ? page - 1 : 0;
	} catch {
		return 0;
	}
}

/**
 * 押したカードが属する欄の作品 ID を DOM 順に集める。
 * リンクから祖先を上り、作品カードのリンク (CARD_LINK_SELECTOR) が 2 作品以上入る最初の箱を欄とみなす。
 * ホームの横送り・グリッド・フィード、検索の結果はそれぞれ別の箱なので、欄をまたがない。
 * 1 作品しか見つからなければ、押した作品だけの並びを返す。
 * @param {Element} link 押された作品リンク
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {string[]} 作品 ID の配列
 */
export function collectGroupIds(link, origin) {
	const own = workIdFromLink(link?.getAttribute?.('href') ?? null, origin);
	for (let node = link?.parentElement ?? null; node; node = node.parentElement) {
		const ids = [];
		const seen = new Set();
		for (const card of node.querySelectorAll(CARD_LINK_SELECTOR)) {
			const id = workIdFromLink(card.getAttribute('href'), origin);
			if (id && !seen.has(id)) {
				seen.add(id);
				ids.push(id);
			}
		}
		if (ids.length >= 2) return ids;
	}
	return own ? [own] : [];
}

/**
 * 作品グリッドの ul を探す。
 * 「カード (li) の中にある作品リンク」を起点に、その li の親を返す。
 * ピックアップ欄の中のカードは飛ばす。(NON_GRID_CONTAINER_SELECTOR)
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
 * 作品を開く操作として拾ってよい押し方か。拾えるなら作品 ID と押されたリンクを返す。
 * 修飾キー付きの操作と中クリックは拾わない。(新しいタブで開きたい操作を邪魔しないため)
 * 拾うのは作品カードのリンクだけ。カード (li) の中か、カードの計測用ラベル (CARD_LINK_SELECTOR) を持つもの。
 * 検索のカードは li ではないのでラベルで見分ける。タグの見出し画像のようなラベルの無いリンクは本体に任せる。
 * @param {MouseEvent|PointerEvent} event 押された合図
 * @param {string} origin 相対 URL を解決するための基準
 * @returns {{workId: string, link: Element}|null} 拾わないなら null
 */
function openableLink(event, origin) {
	if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
	const link = event.target?.closest?.(ARTWORK_LINK_SELECTOR);
	if (!link) return null;
	const isCard = Boolean(link.closest?.(CARD_SELECTOR)) || link.matches?.(CARD_LINK_SELECTOR) === true;
	if (!isCard) return null;
	const workId = workIdFromLink(link.getAttribute('href'), origin);
	return workId ? { workId, link } : null;
}

/**
 * グリッドのクリックを購読する。
 * `deps.onPress` を渡すと、押し始めた時点 (pointerdown) でも同じ条件で `onPress` を呼ぶ。(マウスとペンだけ。タッチは呼ばない)
 * 先読みの開始に使うためのもので、click とは別に働く (preventDefault はしない)。
 * 押し始めたあと選択やドラッグで取り消されたときは `pointercancel` / `dragstart` で
 * `deps.onPressCancel` を呼ぶ。
 * @param {Document} doc 対象のドキュメント
 * @param {(workId: string, opened: {link: Element, startPage: number}) => void} onOpen 作品リンクが押されたときに呼ばれる。
 *   押されたリンクと、リンクが指すページ (#n。0 始まり) も渡す
 * @param {{origin?: string, onPress?: (workId: string) => void, onPressCancel?: () => void}} [deps] テスト用の依存と押し始めの合図
 * @returns {{dispose: () => void}} 購読の解除
 */
export function attachGridListener(doc, onOpen, deps = {}) {
	const origin = deps.origin ?? doc.location?.origin ?? PIXIV_ORIGIN;

	/**
	 * クリックを処理する。
	 * @param {MouseEvent} event クリック
	 * @returns {void}
	 */
	const clickListener = (event) => {
		const opened = openableLink(event, origin);
		if (!opened) return;
		event.preventDefault();
		event.stopPropagation();
		onOpen(opened.workId, { link: opened.link, startPage: startPageFromLink(opened.link.getAttribute('href'), origin) });
	};

	// capture 段階で拾い、pixiv 本体のハンドラより先に止める
	doc.addEventListener('click', clickListener, true);

	/** @type {((event: PointerEvent) => void)|null} */
	let pressListener = null;
	/** @type {(() => void)|null} */
	let cancelListener = null;
	// passive にして、選択やドラッグ開始の邪魔をしない (preventDefault は呼ばない)
	const pressOptions = { capture: true, passive: true };

	if (deps.onPress) {
		/**
		 * マウスとペンの押し始めで、開ける作品なら onPress を呼ぶ。タッチは拾わない。
		 * @param {PointerEvent} event 押し始め
		 * @returns {void}
		 */
		pressListener = (event) => {
			if (event.pointerType === PRESS_IGNORED_POINTER_TYPE) return;
			const opened = openableLink(event, origin);
			if (opened) deps.onPress(opened.workId);
		};
		/**
		 * 押し始めが選択やドラッグで取り消されたことを onPressCancel へ伝える。
		 * @returns {void}
		 */
		cancelListener = () => deps.onPressCancel?.();
		doc.addEventListener('pointerdown', pressListener, pressOptions);
		doc.addEventListener('pointercancel', cancelListener, true);
		doc.addEventListener('dragstart', cancelListener, true);
	}

	return {
		dispose() {
			doc.removeEventListener('click', clickListener, true);
			if (pressListener) {
				doc.removeEventListener('pointerdown', pressListener, pressOptions);
				doc.removeEventListener('pointercancel', cancelListener, true);
				doc.removeEventListener('dragstart', cancelListener, true);
			}
		},
	};
}
