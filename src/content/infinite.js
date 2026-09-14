/**
 * ユーザーページの作品グリッドを無限スクロールにする。
 *
 * 本体の ul の直後に sentinel を置き、見えたら次のページを継ぎ足す。
 * 継ぎ足し先は本体の ul そのもの。別のコンテナへ足すと、1 ページ目の最終行が
 * 途中で終わっているときに空白ができて地続きにならない。
 * React は外から append した li を消さない (SITE_SPEC §3 実測)。
 */
import { captureTemplates, buildCard, parentOf } from './card-clone.js';
import {
	INFINITE_SCROLL,
	GV_CARD_ATTR,
	SENTINEL_ATTR,
	SENTINEL_MARGIN_PX,
} from '../common/constants.js';

/**
 * 何もしない操作。雛形が採れないページや組み立てに失敗したときに返す。
 * 呼び出し側はこの戻りでもそのまま dispose() できる。
 * @returns {{isActive: () => boolean, setMode: (mode: string) => void, dispose: () => void}} 操作
 */
function inactiveHandle() {
	return { isActive: () => false, setMode() {}, dispose() {} };
}

/**
 * 無限スクロールを始める。
 * @param {Document} doc 対象のドキュメント
 * @param {{ul: Element, source: {pageCount: () => Promise<number>, loadPage: (page: number) => Promise<object[]>},
 *   mode: string, loggedIn: boolean, startPage?: number,
 *   deps?: {createObserver?: Function, computedStyle?: Function}}} options 組み立ての材料
 * @returns {{isActive: () => boolean, setMode: (mode: string) => void, dispose: () => void}} 操作
 */
export function attachInfiniteScroll(doc, options) {
	const { ul, source, loggedIn } = options;
	const deps = options.deps ?? {};
	const createObserver = deps.createObserver
		?? ((callback, init) => new globalThis.IntersectionObserver(callback, init));

	const templates = captureTemplates(ul, { computedStyle: deps.computedStyle });
	// 雛形が採れないページでは何もしない。呼び出し側はページャを隠さない
	if (!templates) return inactiveHandle();

	let mode = options.mode;
	// ?p= の途中から開かれていることがある。次に読むのは「今出ているページ」の次
	const start = Number(options.startPage);
	let lastPage = Number.isFinite(start) && start >= 1 ? Math.floor(start) : 1;
	let loading = false;
	let done = false;
	let disposed = false;
	let observing = false;
	/** @type {object[]|null} 先読みして持っている作品。prefetch でだけ入る */
	let prefetched = null;
	/** @type {object|null} ul の直後に置いた目印 */
	let sentinel = null;
	/** @type {object|null} sentinel を見張る IntersectionObserver */
	let observer = null;

	/**
	 * 監視をやめる。二度呼んでも 1 回しか切らない。
	 * @returns {void}
	 */
	function stopObserving() {
		if (!observing) return;
		observing = false;
		try {
			observer?.disconnect();
		} catch (error) {
			// 監視の後始末に失敗しても、継ぎ足しの停止自体は済んでいる
			console.warn('[GridViewer] infinite scroll observer disconnect failed', error);
		}
	}

	/**
	 * sentinel を見張り始める。既に見張っていれば切ってから作り直す。
	 *
	 * rootMargin は IntersectionObserver を作るときにしか決められないので、
	 * モードを変えたら作り直すしかない (onReach は手前から読み始め、prefetch は手元にあるので 0)。
	 * @returns {void}
	 */
	function startObserving() {
		stopObserving();
		observer = createObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return undefined;
			// 本物の IntersectionObserver は戻り値を捨てる。テストから完了を待てるように Promise を返す
			return advance();
		}, { rootMargin: `${mode === INFINITE_SCROLL.PREFETCH ? 0 : SENTINEL_MARGIN_PX}px` });
		observer.observe(sentinel);
		observing = true;
	}

	/**
	 * 読み切った。もう監視しない。
	 * @returns {void}
	 */
	function finish() {
		done = true;
		prefetched = null;
		stopObserving();
	}

	/**
	 * 作品を並べる。
	 * @param {object[]} works 作品サマリ
	 * @returns {number} 並べた数
	 */
	function render(works) {
		let count = 0;
		for (const work of works) {
			const card = buildCard(templates, work, { loggedIn });
			if (!card) continue;
			ul.appendChild(card);
			count += 1;
		}
		return count;
	}

	/**
	 * 先読み用に 1 ページ読む。失敗しても黙って諦める。
	 * @param {number} page ページ番号 (1 始まり)
	 * @returns {Promise<object[]|null>} 作品。取れなければ null
	 */
	async function loadQuietly(page) {
		try {
			const works = await source.loadPage(page);
			return Array.isArray(works) && works.length > 0 ? works : null;
		} catch (error) {
			// 先読みは失敗しても実害が無い。下まで来たときに読み直す
			console.warn('[GridViewer] infinite scroll prefetch failed', error);
			return null;
		}
	}

	/**
	 * 次のページを読んで並べる。読み切ったら監視をやめる。
	 * 失敗しても自動では繰り返さない。もう一度下まで来たら読み直す。
	 * @returns {Promise<void>}
	 */
	async function advance() {
		if (loading || done || disposed) return;
		loading = true;
		try {
			const next = lastPage + 1;
			const held = prefetched;
			prefetched = null;
			const works = held ?? await source.loadPage(next);
			if (disposed) return;
			if (!Array.isArray(works) || works.length === 0) {
				finish();
				return;
			}
			render(works);
			lastPage = next;
			const total = await source.pageCount();
			if (disposed) return;
			if (Number.isFinite(total) && lastPage >= total) {
				finish();
				return;
			}
			// 先読みは描き終えてから。読み込みの待ちを次の操作より前に済ませる
			if (mode === INFINITE_SCROLL.PREFETCH) {
				const ahead = await loadQuietly(lastPage + 1);
				// 待っている間に setMode / dispose が入ったら持ち分にしない
				if (disposed || done || mode !== INFINITE_SCROLL.PREFETCH) return;
				prefetched = ahead;
			}
		} catch (error) {
			// 自動で繰り返さない。同じ失敗を繰り返すほうが害になる
			console.warn('[GridViewer] infinite scroll failed', error);
		} finally {
			loading = false;
		}
	}

	try {
		sentinel = doc.createElement('div');
		sentinel.setAttribute(SENTINEL_ATTR, '');
		// ul の中に入れると flex アイテムとしてカード 1 枚分の隙間になる
		const host = parentOf(ul);
		if (!host) throw new Error('grid has no parent');
		host.appendChild(sentinel);
		startObserving();
	} catch (error) {
		// sentinel を置けないページでは継ぎ足しを諦める。ページャはそのまま残る
		console.warn('[GridViewer] infinite scroll setup failed', error);
		stopObserving();
		try {
			sentinel?.remove();
		} catch { /* 置けていないので消せなくてよい */ }
		return inactiveHandle();
	}

	return {
		isActive: () => !disposed,
		setMode(next) {
			// 継ぎ足したカードは残す。設定を切り替えただけで読み進めた場所を失わせない
			if (disposed || next === mode) return;
			mode = next;
			// 先読みの持ち分は捨てる。モードが変われば先読みの前提も変わる
			prefetched = null;
			// 読み切った後にモードを変えても監視は再開しない
			if (done) return;
			try {
				startObserving();
			} catch (error) {
				// 監視し直せなければ継ぎ足しは止まる。ページャは残っているので閲覧は続けられる
				console.warn('[GridViewer] infinite scroll re-observe failed', error);
			}
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			prefetched = null;
			stopObserving();
			try {
				sentinel?.remove();
				for (const card of [...ul.querySelectorAll(`[${GV_CARD_ATTR}]`)]) card.remove();
			} catch (error) {
				// 撤去しきれなくても content script 全体は巻き込まない
				console.warn('[GridViewer] infinite scroll dispose failed', error);
			}
		},
	};
}
