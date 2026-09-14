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
 * sentinel が示す状態。
 * idle は何も出さない。loading / error / done は sentinel の中に表示を出す (設計 §5.1)。
 */
export const SENTINEL_STATE = Object.freeze({
	IDLE: 'idle',
	LOADING: 'loading',
	ERROR: 'error',
	DONE: 'done',
});

/** sentinel に出す文言。テストからも引けるように公開する。 */
export const SENTINEL_TEXT = Object.freeze({
	LOADING: '作品を読み込んでいます',
	ERROR: '作品を読み込めませんでした',
	RETRY: '再試行',
	DONE: 'すべての作品を表示しました',
});

/** sentinel の中の部品のクラス名。pixiv 側と衝突しないよう gv- を付ける (UI_DESIGN_KIT §10)。 */
const SENTINEL_CLASS = Object.freeze({
	TEXT: 'gv-sentinel-text',
	ERROR: 'gv-sentinel-error',
	RETRY: 'gv-sentinel-retry',
	SPINNER: 'gv-sentinel-spinner',
});

/** sentinel 用のスタイルを 1 枚だけ入れるための目印。 */
const SENTINEL_STYLE_ID = 'gridviewer-sentinel-style';

/**
 * sentinel の中の表示の CSS。
 *
 * pixiv のページへ直接入る UI なので (UI_DESIGN_KIT §10):
 * - 色は pixiv の charcoal トークンから引き、取れなければ currentColor へ倒す。
 *   こうすると本体のテーマ切り替えに自動で追従し、地の色から浮かない (§2 の「守ること」)
 * - 外部リソース (フォント・画像) は読まない
 * - セレクタは全て [data-gv-sentinel] の中に閉じ、クラス名には gv- を付ける
 */
const SENTINEL_CSS = `
[${SENTINEL_ATTR}] {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 56px;
	padding: 16px 0;
	color: var(--charcoal-text3, #858585);
	font-size: 14px;
	line-height: 1.5;
	text-align: center;
}
/* idle は何も出さないが、高さが 0 だと交差を取り損ねるので少しだけ残す */
[${SENTINEL_ATTR}]:empty {
	min-height: 24px;
	padding: 0;
}
[${SENTINEL_ATTR}] .${SENTINEL_CLASS.TEXT} {
	margin: 0;
}
[${SENTINEL_ATTR}] .${SENTINEL_CLASS.ERROR} {
	color: var(--charcoal-text2, currentColor);
}
[${SENTINEL_ATTR}] .${SENTINEL_CLASS.SPINNER} {
	flex: 0 0 auto;
	width: 16px;
	height: 16px;
	border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
	border-top-color: currentColor;
	border-radius: 50%;
	animation: gv-sentinel-spin 0.8s linear infinite;
}
[${SENTINEL_ATTR}] .${SENTINEL_CLASS.RETRY} {
	height: 30px;
	padding: 0 12px;
	border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
	border-radius: 4px;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 14px;
	cursor: pointer;
}
[${SENTINEL_ATTR}] .${SENTINEL_CLASS.RETRY}:hover {
	background: var(--charcoal-background1-hover, color-mix(in srgb, currentColor 12%, transparent));
}
[${SENTINEL_ATTR}] .${SENTINEL_CLASS.RETRY}:focus-visible {
	outline: 2px solid currentColor;
	outline-offset: -2px;
}
@keyframes gv-sentinel-spin {
	to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
	[${SENTINEL_ATTR}] .${SENTINEL_CLASS.SPINNER} { animation-duration: 2.4s; }
}
`;

/**
 * sentinel 用のスタイルを 1 度だけ入れる。
 * 入れられなくても継ぎ足し自体は動く (文言は素の見た目で出る)。
 * @param {Document} doc 対象のドキュメント
 * @returns {void}
 */
function injectSentinelStyle(doc) {
	try {
		const root = doc.head ?? doc.body;
		if (!root || root.querySelector(`style[id="${SENTINEL_STYLE_ID}"]`)) return;
		const style = doc.createElement('style');
		style.setAttribute('id', SENTINEL_STYLE_ID);
		// innerHTML は使わない。style の中身は textContent で入れる
		style.textContent = SENTINEL_CSS;
		root.appendChild(style);
	} catch (error) {
		// 見た目が素になるだけ。継ぎ足しは続ける
		console.warn('[GridViewer] infinite scroll style injection failed', error);
	}
}

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
	/** @type {string} sentinel に出している状態。SENTINEL_STATE のいずれか */
	let state = SENTINEL_STATE.IDLE;
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
	 * sentinel の中に文言を 1 行出す。
	 * @param {string} text 文言
	 * @param {string} role 読み上げへの伝え方 ('status' か 'alert')
	 * @param {boolean} [isError] 失敗の文言か
	 * @returns {void}
	 */
	function appendMessage(text, role, isError = false) {
		const line = doc.createElement('p');
		line.setAttribute('class', isError ? `${SENTINEL_CLASS.TEXT} ${SENTINEL_CLASS.ERROR}` : SENTINEL_CLASS.TEXT);
		line.setAttribute('role', role);
		line.textContent = text;
		sentinel.appendChild(line);
	}

	/**
	 * sentinel の中身を今の状態に合わせて作り直す (設計 §5.1)。
	 * 失敗したときだけ再試行ボタンを出す。自動では読み直さない。
	 * @param {string} next SENTINEL_STATE のいずれか
	 * @returns {void}
	 */
	function showState(next) {
		// 同じ状態を作り直さない。role="alert" が読み上げで繰り返し鳴るのを避ける
		if (!sentinel || state === next) return;
		state = next;
		try {
			// innerHTML は使わない。textContent = '' で子をまとめて落とす
			sentinel.textContent = '';
			if (next === SENTINEL_STATE.LOADING) {
				const spinner = doc.createElement('span');
				spinner.setAttribute('class', SENTINEL_CLASS.SPINNER);
				// 回っている絵は読み上げに意味が無い。文言だけを伝える
				spinner.setAttribute('aria-hidden', 'true');
				sentinel.appendChild(spinner);
				appendMessage(SENTINEL_TEXT.LOADING, 'status');
				return;
			}
			if (next === SENTINEL_STATE.ERROR) {
				// 失敗の通知は role="alert" の段落 (UI_DESIGN_KIT §6)
				appendMessage(SENTINEL_TEXT.ERROR, 'alert', true);
				const button = doc.createElement('button');
				button.setAttribute('type', 'button');
				button.setAttribute('class', SENTINEL_CLASS.RETRY);
				button.textContent = SENTINEL_TEXT.RETRY;
				button.addEventListener('click', retry);
				sentinel.appendChild(button);
				return;
			}
			if (next === SENTINEL_STATE.DONE) appendMessage(SENTINEL_TEXT.DONE, 'status');
			// idle は何も出さない
		} catch (error) {
			// 表示が作れなくても継ぎ足し自体は動かす
			console.warn('[GridViewer] infinite scroll status render failed', error);
		}
	}

	/**
	 * 再試行ボタンの押下。自動リトライはしないので、読み直しはここだけ。
	 * @returns {Promise<void>|undefined} 読み直しの待ち
	 */
	function retry() {
		if (disposed || done || loading) return undefined;
		return advance();
	}

	/**
	 * 読み切った。もう監視しない。
	 * @returns {void}
	 */
	function finish() {
		done = true;
		prefetched = null;
		stopObserving();
		showState(SENTINEL_STATE.DONE);
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
		showState(SENTINEL_STATE.LOADING);
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
			showState(SENTINEL_STATE.IDLE);
		} catch (error) {
			// 自動で繰り返さない。同じ失敗を繰り返すほうが害になる。
			// IntersectionObserver は交差が変わったときにしか鳴らず、カードが増えないと
			// sentinel も動かないので、下端に留まったままの人のために再試行ボタンを出す
			console.warn('[GridViewer] infinite scroll failed', error);
			showState(SENTINEL_STATE.ERROR);
		} finally {
			loading = false;
		}
	}

	try {
		injectSentinelStyle(doc);
		sentinel = doc.createElement('div');
		sentinel.setAttribute(SENTINEL_ATTR, '');
		// ul の中に入れると flex アイテムとしてカード 1 枚分の隙間になる。
		// 親の末尾ではなく ul の直後に入れる。親が ul の後ろにページャ等を持つと、
		// 末尾では sentinel がその下に落ち、rootMargin が 0 の prefetch で発火が遅れる
		const host = parentOf(ul);
		if (!host) throw new Error('grid has no parent');
		host.insertBefore(sentinel, ul.nextSibling ?? null);
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
