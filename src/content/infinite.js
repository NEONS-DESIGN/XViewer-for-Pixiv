/**
 * ユーザーページの作品グリッドを無限スクロールにする。
 *
 * 本体の ul の直後に sentinel を置き、見えたら次のページを継ぎ足す。
 * 継ぎ足し先は本体の ul そのもの。別のコンテナへ足すと、1 ページ目の最終行が
 * 途中で終わっているときに空白ができて地続きにならない。
 * React は外から append した li を消さない前提で組む。(SITE_SPEC §3 の tabindex の扱いと同じ)
 */
import { captureTemplates, buildCard, paintHeart, heartPaths } from './card-clone.js';
import { readSession, clearSessionCache } from './session.js';
import { parseArtworkPath } from './page.js';
import { pickVisiblePage } from './infinite-page.js';
import { addBookmark, deleteBookmark } from '../pixiv/actions.js';
import { PIXIV_ERROR_KINDS } from '../pixiv/errors.js';
import { warn } from '../common/log.js';
import { createStyleHandle } from '../common/style-injector.js';
import {
	INFINITE_SCROLL,
	XV_CARD_ATTR,
	XV_BOOKMARK_ID_ATTR,
	SENTINEL_ATTR,
	SENTINEL_MARGIN,
	BOOKMARK_BUTTON_SELECTOR,
	ARTWORK_LINK_SELECTOR,
	PAGER_SELECTOR,
} from '../common/constants.js';

/**
 * sentinel が示す状態。
 * idle は何も出さない。それ以外は sentinel の中に表示を出す。(SPEC §6.8.3)
 * error は通信の失敗、buildFailed は「作品は返ったのに 1 枚も組めなかった」。
 * どちらも再試行ボタンを出すが、文言を分けるのは原因が違うため。(後者は再試行しても
 * 同じ結果になりやすい)
 */
const SENTINEL_STATE = Object.freeze({
	IDLE: 'idle',
	LOADING: 'loading',
	ERROR: 'error',
	BUILD_FAILED: 'buildFailed',
	DONE: 'done',
});

/** 失敗した状態ごとの文言のキー (strings.infinite)。再試行ボタンを出す状態はここから導く */
const FAILURE_TEXT_KEY = Object.freeze({
	[SENTINEL_STATE.ERROR]: 'ERROR',
	[SENTINEL_STATE.BUILD_FAILED]: 'BUILD_FAILED',
});

/** 再試行ボタンを出す状態。失敗の文言を持つ状態と同じ集合 */
const RETRYABLE_STATES = new Set(Object.keys(FAILURE_TEXT_KEY));

/**
 * sentinel が引く strings.infinite のキーの一覧。
 * カタログ側と過不足が無いことは test/i18n/coverage.test.js がこれを基準に確かめる
 */
export const SENTINEL_TEXT_KEYS = Object.freeze([
	'LOADING',
	'RETRY',
	'DONE',
	...Object.values(FAILURE_TEXT_KEY),
]);

/** sentinel の中の部品のクラス名。pixiv 側と衝突しないよう xv- を付ける。(UI_DESIGN_KIT §10) */
const SENTINEL_CLASS = Object.freeze({
	TEXT: 'xv-sentinel-text',
	ERROR: 'xv-sentinel-error',
	RETRY: 'xv-sentinel-retry',
	SPINNER: 'xv-sentinel-spinner',
});

/** sentinel 用のスタイルを 1 枚だけ入れるための目印。 */
export const SENTINEL_STYLE_ID = 'xviewer-sentinel-style';

/** 本体のページャを隠す style の id。二重注入を防ぐ目印も兼ねる。 */
export const PAGER_STYLE_ID = 'xviewer-hide-pager';

/**
 * 本体のページャを隠す CSS。
 * 継ぎ足しが動いている間はページ送りのリンクが要らないので消す。
 * pickup.js と同じく、要素を消したり属性を足したりはせず style を 1 枚差し込むだけにする。
 * (pixiv は React で何度も描き直すので、JS で当てる方式だと描き直しのたびに一瞬見えてしまう)
 * pixiv 側の指定に競り負けないよう !important を付け、規則はこの 1 本だけに留める。
 */
const PAGER_HIDE_CSS = `
${PAGER_SELECTOR} {
	display: none !important;
}
`;

/** 継ぎ足したカードの表示を取り戻す style の id。二重注入を防ぐ目印も兼ねる。 */
export const CARD_STYLE_ID = 'xviewer-show-cards';

/**
 * 継ぎ足したカードの display を取り戻す CSS。
 *
 * pixiv のグリッドは li 自身に「ページ 1 枚ぶんより先は出さない」規則を持っている。
 * (`li:nth-child(n+61) { display: none }`。閾値は幅で変わる。SITE_SPEC §3)
 * ここは同じ ul へ 48 枚ずつ足すので、この規則に当たったカードは DOM にだけ積み上がり、
 * 画面には 1 枚も出ない。グリッドの高さも増えないので sentinel が画面内に居座り、
 * 少しスクロールし直すたびに ?p= だけが進む。
 * 打ち消す対象は自分が足したカードだけなので、目印 (XV_CARD_ATTR) で選ぶ。
 * pixiv 側は :nth-child() 付きで詳細度が高いため !important で競り勝つ。
 * 戻す値は li の既定 (list-item)。本体の可視カードの computed 値と同じ。
 */
const CARD_SHOW_CSS = `
[${XV_CARD_ATTR}] {
	display: list-item !important;
}
`;

/**
 * sentinel の中の表示の CSS。
 *
 * pixiv のページへ直接入る UI なので (UI_DESIGN_KIT §10):
 * - 色は pixiv の charcoal トークンから引き、取れなければ currentColor へ倒す。
 *   こうすると本体のテーマ切り替えに自動で追従し、地の色から浮かない (§2 の「守ること」)
 * - 外部リソース (フォント・画像) は読まない
 * - セレクタは全て [data-xv-sentinel] の中に閉じ、クラス名には xv- を付ける
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
	animation: xv-sentinel-spin 0.8s linear infinite;
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
@keyframes xv-sentinel-spin {
	to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
	[${SENTINEL_ATTR}] .${SENTINEL_CLASS.SPINNER} { animation-duration: 2.4s; }
}
`;

/**
 * @typedef {object} InfiniteHandle
 * @property {() => boolean} isActive 継ぎ足しが動いているか (雛形が採れて sentinel を置けて、まだ dispose() されていない)
 * @property {(mode: string) => void} setMode モードを切り替える。継ぎ足したカードには触らない
 * @property {() => number|null} currentPage 今画面に出ているページ番号。動いていなければ null
 * @property {() => void} dispose 継ぎ足しをやめ、置いたものを全て撤去してページを元へ戻す
 */

/**
 * 何もしない操作。雛形が採れないページや組み立てに失敗したときに返す。
 * 呼び出し側はこの戻りでもそのまま dispose() できる。
 * @returns {InfiniteHandle} 操作
 */
function inactiveHandle() {
	return {
		/**
		 * 継ぎ足しが動いているか。この操作では常に false。
		 * @returns {boolean} 常に false
		 */
		isActive: () => false,
		/**
		 * モードを切り替える。動いていないので何もしない。
		 * @returns {void}
		 */
		setMode() {},
		/**
		 * 今出ているページ。何も継ぎ足していないので分からない。
		 * @returns {null} 常に null
		 */
		currentPage: () => null,
		/**
		 * 撤去する。何も置いていないので何もしない。
		 * @returns {void}
		 */
		dispose() {},
	};
}

/**
 * 無限スクロールを始める。
 * @param {Document} doc 対象のドキュメント
 * @param {{ul: Element, source: {pageCount: () => Promise<number>, loadPage: (page: number) => Promise<object[]>},
 *   mode: string, loggedIn: boolean, startPage?: number, onPageChange?: (page: number) => void,
 *   strings: object, deps?: {createObserver?: Function, computedStyle?: Function, actions?: object}}} options
 *   組み立ての材料。strings は文言のカタログ (src/i18n)
 * @returns {InfiniteHandle} 操作
 */
export function attachInfiniteScroll(doc, options) {
	const { ul, source, loggedIn, strings } = options;
	const deps = options.deps ?? {};
	const createObserver = deps.createObserver
		?? ((callback, init) => new globalThis.IntersectionObserver(callback, init));
	/** 画面。スクロールと大きさの変化はここで受ける。取れなければ ?p= の追従だけを諦める */
	const view = doc.defaultView ?? null;
	// 要素の上端 (ビューポート基準) を読む。測れない要素は 0 (= 上端の上) として扱う。
	// DOM から外れた要素は getBoundingClientRect() が 0 を返すので、そのままだと
	// 「上端を越えた」に倒れる。印のカードを pixiv に消されても、その上にいながら
	// そのページを名乗らないよう、外れた要素は NaN にして pickVisiblePage に飛ばさせる
	const rectTop = deps.rectTop ?? ((node) => (
		node.isConnected === false ? Number.NaN : (node.getBoundingClientRect?.().top ?? 0)
	));
	// 見直しを次のフレームまで遅らせる。rAF が無い環境ではマクロタスクへ回す
	const schedule = deps.schedule ?? ((fn) => {
		if (typeof view?.requestAnimationFrame === 'function') view.requestAnimationFrame(fn);
		else setTimeout(fn, 0);
	});
	// 更新系は差し替えられるようにしておく (テストから本物の pixiv を叩かないため)
	const actions = { addBookmark, deleteBookmark, ...deps.actions };

	const templates = captureTemplates(ul, { computedStyle: deps.computedStyle });
	// 雛形が採れないページでは何もしない。呼び出し側はページャを隠さない
	if (!templates) return inactiveHandle();

	let mode = options.mode;
	// ?p= の途中から開かれていることがある。次に読むのは「今出ているページ」の次
	const start = Number(options.startPage);
	let lastPage = Number.isFinite(start) && start >= 1 ? Math.floor(start) : 1;
	/**
	 * @type {import('./infinite-page.js').PageMark[]} 各ページの先頭に並んだカードの印。page の昇順。
	 * `?p=` はこの印と画面の位置から決める (読み込んだ最後のページではない。SPEC §6.8.5)
	 */
	const pageMarks = [];
	/** 最後に知らせたページ。同じ値を何度も知らせない (replaceState を呼び過ぎるとブラウザに絞られる) */
	let notifiedPage = lastPage;
	/** 次のフレームでの見直しを予約したか。scroll は連続で鳴るので 1 フレーム 1 回に束ねる */
	let checkQueued = false;
	/** view にスクロールの購読を張ったか。dispose() で外すときの目印 */
	let scrollBound = false;
	let loading = false;
	let done = false;
	let disposed = false;
	let observing = false;
	/** @type {string} sentinel に出している状態。SENTINEL_STATE のいずれか */
	let state = SENTINEL_STATE.IDLE;
	/** @type {object[]|null} 先読みして持っている作品。prefetch でだけ入る */
	let prefetched = null;
	/**
	 * @type {Promise<object[]|null>|null} 走っている先読み。無ければ null。
	 * 先読みは「読み込み中」に含めない。含めると、先読みが終わる前に下端へ着いた人の
	 * advance() が弾かれ、以後 sentinel が画面内に留まって二度と鳴らなくなる
	 */
	let prefetchTask = null;
	/** @type {object|null} ul の直後に置いた目印 */
	let sentinel = null;
	/** @type {object|null} sentinel を見張る IntersectionObserver */
	let observer = null;
	/** doc にハートの購読を張ったか。dispose() で外すときの目印 */
	let heartBound = false;
	/**
	 * sentinel の見た目。入れられなくても継ぎ足し自体は動く。(文言は素の見た目で出る)
	 * dispose() で外す。「オフにしたら元へ戻す」をページャ隠しと揃える
	 */
	const sentinelStyle = createStyleHandle(doc, SENTINEL_STYLE_ID, SENTINEL_CSS, 'infinite scroll');
	/**
	 * 本体のページャを隠す CSS。
	 * 出すのは「雛形が採れて、sentinel も置けて、継ぎ足しを始められる」と決まってから。
	 * 先に隠すと、継ぎ足せないページでページ送りの手段まで消えてしまう
	 */
	const pagerStyle = createStyleHandle(doc, PAGER_STYLE_ID, PAGER_HIDE_CSS, 'pager hide');
	/**
	 * 継ぎ足したカードを本体の display:none から取り戻す CSS。
	 * pagerStyle と同じ扱い (継ぎ足しを始められると決まってから入れ、dispose() で外す)
	 */
	const cardStyle = createStyleHandle(doc, CARD_STYLE_ID, CARD_SHOW_CSS, 'card show');
	/** @type {WeakSet<object>} 送信中のカード。二度押しで 2 回送らないための印 */
	const sending = new WeakSet();

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
			warn('infinite scroll observer disconnect failed', error);
		}
	}

	/**
	 * sentinel を見張り始める。既に見張っていれば切ってから作り直す。
	 *
	 * 見張る範囲 (rootMargin) はモードごとに SENTINEL_MARGIN が持つ。
	 * onReach は 0 で下端に着いてから読み、prefetch は 1 画面ぶん手前で並べ終える。
	 * rootMargin は IntersectionObserver を作るときにしか決められないので、
	 * モードを変えたら作り直すしかない。
	 * observe() は初回に必ず今の交差状態を通知するので、sentinel が見えている状態で
	 * 作り直すとその場で 1 ページ読む。(下端に留まって止まっていた人にはむしろ都合がよい)
	 * @returns {void}
	 */
	function startObserving() {
		stopObserving();
		observer = createObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return undefined;
			// 本物の IntersectionObserver は戻り値を捨てる。テストから完了を待てるように Promise を返す
			return advance();
		}, {
			// 表に無いモードで observe を止めないよう、読めなければ下端で読む側へ倒す
			rootMargin: SENTINEL_MARGIN[mode] ?? SENTINEL_MARGIN[INFINITE_SCROLL.ON_REACH],
		});
		// observe() が投げても dispose() で切れるように、先に印を付ける
		observing = true;
		observer.observe(sentinel);
	}

	/**
	 * sentinel の中に文言を 1 行出す。
	 *
	 * 読み上げは永続する sentinel の live region が丸ごと受け持つので、
	 * 中の段落には role を付けない。失敗の段落へ role="alert" を持たせると
	 * role="status" の内側で live region が入れ子になり、実装によっては
	 * 外側の polite 領域も鳴って二重に読み上げられる余地が残る。
	 * 失敗を強く伝えるのは sentinel 側の aria-live の切り替えで行う。(showState)
	 * @param {string} text 文言
	 * @param {boolean} [isError] 失敗の文言か (色を変えるためだけに使う)
	 * @returns {void}
	 */
	function appendMessage(text, isError = false) {
		const line = doc.createElement('p');
		line.setAttribute('class', isError ? `${SENTINEL_CLASS.TEXT} ${SENTINEL_CLASS.ERROR}` : SENTINEL_CLASS.TEXT);
		line.textContent = text;
		sentinel.appendChild(line);
	}

	/**
	 * sentinel の中身を今の状態に合わせて作り直す。(SPEC §6.8.3)
	 * 失敗したときだけ再試行ボタンを出す。自動では読み直さない。
	 * sentinel 自身は入れ替えない。読み上げの領域は作り直すと鳴らなくなる。
	 * @param {string} next SENTINEL_STATE のいずれか
	 * @returns {void}
	 */
	function showState(next) {
		// 同じ状態を作り直さない。失敗の読み上げが繰り返し鳴るのを避ける
		if (!sentinel || state === next) return;
		try {
			// live region の強さは中身を変える前に決める。後から変えると
			// 変更前の値で読み上げられることがある。失敗だけは気づいてほしいので
			// assertive、それ以外は polite。(UI_DESIGN_KIT §6)
			// 中に role="alert" の段落を入れる手は採らない (appendMessage の注記)
			sentinel.setAttribute('aria-live', RETRYABLE_STATES.has(next) ? 'assertive' : 'polite');
			// innerHTML は使わない。textContent = '' で子をまとめて落とす
			sentinel.textContent = '';
			if (next === SENTINEL_STATE.LOADING) {
				const spinner = doc.createElement('span');
				spinner.setAttribute('class', SENTINEL_CLASS.SPINNER);
				// 回っている絵は読み上げに意味が無い。文言だけを伝える
				spinner.setAttribute('aria-hidden', 'true');
				sentinel.appendChild(spinner);
				appendMessage(strings.infinite.LOADING);
			} else if (RETRYABLE_STATES.has(next)) {
				appendMessage(strings.infinite[FAILURE_TEXT_KEY[next]], true);
				const button = doc.createElement('button');
				button.setAttribute('type', 'button');
				button.setAttribute('class', SENTINEL_CLASS.RETRY);
				button.textContent = strings.infinite.RETRY;
				button.addEventListener('click', retry);
				sentinel.appendChild(button);
			} else if (next === SENTINEL_STATE.DONE) {
				appendMessage(strings.infinite.DONE);
			}
			// idle は何も出さない
			// 組み立てに成功したときだけ状態を進める。先に進めると、投げたときに
			// 中身と食い違ったまま「同じ状態」と見なされ、二度と組み直せなくなる
			state = next;
		} catch (error) {
			// 表示が作れなくても継ぎ足し自体は動かす。
			// 半端な中身は残さず空へ戻し、次の状態を必ず組み直せるようにする
			warn('infinite scroll status render failed', error);
			try {
				sentinel.textContent = '';
				// 中身が空なら強さも idle と揃えておく。assertive のまま残さない
				sentinel.setAttribute('aria-live', 'polite');
			} catch { /* 空にもできないなら中身には触らない */ }
			state = SENTINEL_STATE.IDLE;
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
		dropPrefetch();
		stopObserving();
		showState(SENTINEL_STATE.DONE);
	}

	/**
	 * 先読みの持ち分と、走っている先読みを捨てる。
	 * 走っているものは止められないので、終わったときに持ち分へ入れないよう目印 (prefetchTask) を外す。
	 * @returns {void}
	 */
	function dropPrefetch() {
		prefetched = null;
		prefetchTask = null;
	}

	/**
	 * ul に既に並んでいる作品の ID を集める。
	 * 継ぎ足しの重複判定に使う。基準ページの記憶がずれたとき (pixiv がグリッドを描き直した等) に
	 * 同じ作品が二重に並ぶのを止めるための保険。
	 * @returns {Set<string>} 作品 ID
	 */
	function existingWorkIds() {
		const ids = new Set();
		for (const link of ul.querySelectorAll(ARTWORK_LINK_SELECTOR)) {
			// 作品リンクの href はパスだけ (/artworks/{id})。origin を挟まずそのまま読める
			const id = parseArtworkPath(link.getAttribute('href') ?? '');
			if (id) ids.add(id);
		}
		return ids;
	}

	/**
	 * 作品を並べる。既に並んでいる作品は飛ばし、組めなかった作品も飛ばす。
	 * そのページで最初に並べたカードは `?p=` を決める印として覚える。
	 * 1 枚も並ばなかったページは印を持たない。(画面に出ていないので `?p=` にも現れない)
	 * @param {object[]} works 作品サマリ
	 * @param {number} page ページ番号 (1 始まり)
	 * @returns {{added: number, skipped: number}} 並べた数と、既にあったので飛ばした数。
	 *   added が 0 で skipped が works の数に満たなければ、組めなかった作品がある
	 */
	function render(works, page) {
		const existing = existingWorkIds();
		let added = 0;
		let skipped = 0;
		for (const work of works) {
			const id = String(work?.id ?? '');
			if (id && existing.has(id)) {
				skipped += 1;
				continue;
			}
			const card = buildCard(templates, work, { loggedIn });
			if (!card) continue;
			ul.appendChild(card);
			if (added === 0) pageMarks.push({ page, el: card });
			if (id) existing.add(id);
			added += 1;
		}
		return { added, skipped };
	}

	/**
	 * 先読み用に 1 ページ読む。失敗しても黙って諦める。
	 * 空のページは空配列のまま持ち分にする。null にすると advance() が同じページを
	 * 読み直してから終わるので、末尾で 1 リクエスト余分に走る
	 * @param {number} page ページ番号 (1 始まり)
	 * @returns {Promise<object[]|null>} 作品 (空のページは空配列)。取れなければ null
	 */
	async function loadQuietly(page) {
		try {
			const works = await source.loadPage(page);
			return Array.isArray(works) ? works : null;
		} catch (error) {
			// 先読みは失敗しても実害が無い。下まで来たときに読み直す
			warn('infinite scroll prefetch failed', error);
			return null;
		}
	}

	/**
	 * 次のページを黙って読み始める。読み込み中の表示は出さず、loading にも含めない。
	 * 終わったときにまだ同じ先読みが期待されていれば持ち分にする。
	 * (待っている間に setMode / dispose / finish が入っていたら捨てる)
	 * @param {number} page ページ番号 (1 始まり)
	 * @returns {void}
	 */
	function startPrefetch(page) {
		const task = loadQuietly(page).then((works) => {
			// 目印が差し替わっていたら、この先読みはもう要らない
			if (prefetchTask !== task) return null;
			prefetchTask = null;
			if (disposed) return null;
			prefetched = works;
			return works;
		});
		prefetchTask = task;
	}

	/**
	 * 今どのページを見ているかを呼び出し側へ知らせる。
	 *
	 * 知らせるのは「読み込んだ最後のページ」ではなく「画面に出ているページ」。
	 * 上へ戻れば戻ったぶんだけ小さくなる。値が前回と同じなら黙る。
	 * (知らせるたびに replaceState が走るため)
	 * URL (?p=) は router.js の持ち物なので、ここでは history を触らない。
	 * ビュワーのモーダルが開いている間は書かない、といった判断も呼び出し側が持つ。
	 * @returns {void}
	 */
	function notifyPage() {
		try {
			const page = pickVisiblePage(pageMarks, rectTop);
			if (page === null || page === notifiedPage) return;
			notifiedPage = page;
			options.onPageChange?.(page);
		} catch (error) {
			// 知らせに失敗しても継ぎ足しは続ける。URL が追いつかないだけ
			warn('page change notification failed', error);
		}
	}

	/**
	 * 見えているページを見直す。scroll は連続して鳴るので 1 フレームに 1 回へ束ねる。
	 * @returns {void}
	 */
	function requestPageCheck() {
		if (disposed || checkQueued) return;
		checkQueued = true;
		try {
			schedule(() => {
				checkQueued = false;
				if (disposed) return;
				notifyPage();
			});
		} catch (error) {
			// 予約できなければ次の scroll で取り直す。継ぎ足し自体は動く
			checkQueued = false;
			warn('infinite scroll page check scheduling failed', error);
		}
	}

	/**
	 * スクロールと画面の大きさの変化を見張り始める。
	 * 見張れなくても継ぎ足しは動く。(`?p=` が画面に追いつかなくなるだけ)
	 * @returns {void}
	 */
	function bindScroll() {
		if (scrollBound || typeof view?.addEventListener !== 'function') return;
		try {
			// 読むだけで既定の動作は止めないので passive で張る (スクロールを重くしない)
			view.addEventListener('scroll', requestPageCheck, { passive: true });
			view.addEventListener('resize', requestPageCheck, { passive: true });
			scrollBound = true;
		} catch (error) {
			warn('infinite scroll scroll watch failed', error);
		}
	}

	/**
	 * スクロールの見張りをやめる。二度呼んでも 1 回しか外さない。
	 * @returns {void}
	 */
	function unbindScroll() {
		if (!scrollBound) return;
		scrollBound = false;
		try {
			view.removeEventListener('scroll', requestPageCheck);
			view.removeEventListener('resize', requestPageCheck);
		} catch (error) {
			warn('infinite scroll scroll unwatch failed', error);
		}
	}

	/**
	 * 次のページを読んで並べる。読み切ったら監視をやめる。
	 * 失敗しても自動では繰り返さない。もう一度下まで来たら読み直す。
	 * 作品が返っても 1 枚も組めなかったときは失敗として扱い、ページは進めない。
	 * 全件が既に並んでいたページは「進んだ」扱いにして、続けて次のページを読む。
	 * (カードが増えないと sentinel が動かず、IntersectionObserver が二度と鳴らないため)
	 * @returns {Promise<void>}
	 */
	async function advance() {
		if (loading || done || disposed) return;
		loading = true;
		try {
			// 先読みの持ち分があれば通信を待たないので、読み込み中も出さない。(黙って読む)
			// 先読みがまだ走っていれば、読み直さずにその終わりを待つ
			let held = prefetched;
			prefetched = null;
			if (!held) {
				showState(SENTINEL_STATE.LOADING);
				if (prefetchTask) {
					held = await prefetchTask;
					prefetched = null;
					if (disposed) return;
				}
			}
			// 総ページ数は先に見る。同じ一覧の応答を共有するので費用は無く、
			// 最終ページを越えていれば読まずに終われる
			const total = await source.pageCount();
			if (disposed) return;
			const lastKnown = Number.isFinite(total) ? total : Infinity;
			for (;;) {
				const next = lastPage + 1;
				if (next > lastKnown) {
					finish();
					return;
				}
				const works = held ?? await source.loadPage(next);
				held = null;
				if (disposed) return;
				// 空の応答は総ページ数が実際より多かったときの保険
				if (!Array.isArray(works) || works.length === 0) {
					finish();
					return;
				}
				const { added, skipped } = render(works, next);
				// 作品は返ってきたのに 1 枚も組めなかった。(画像 URL が全て safeCdnUrl を
				// 通らない等) カードが増えないと sentinel も動かず、IntersectionObserver は
				// 交差が変わったときにしか鳴らないので、放っておくと idle のまま黙って止まる。
				// 失敗として見せて再試行ボタンを残し、lastPage も ?p= も進めない
				// (1 枚も出ていないのにページだけ進むと、記憶と画面がずれる)
				if (added === 0 && skipped < works.length) {
					showState(SENTINEL_STATE.BUILD_FAILED);
					return;
				}
				lastPage = next;
				notifyPage();
				if (lastPage >= lastKnown) {
					finish();
					return;
				}
				if (added > 0) break;
				// 全件が既に並んでいた。ページは進んだが画面は変わらないので、続けて次を読む
				showState(SENTINEL_STATE.LOADING);
			}
			showState(SENTINEL_STATE.IDLE);
			// 先読みは描き終えてから始め、待たない (待つと次の advance() が弾かれる)
			if (mode === INFINITE_SCROLL.PREFETCH) startPrefetch(lastPage + 1);
		} catch (error) {
			// 自動で繰り返さない。同じ失敗を繰り返すほうが害になる。
			// IntersectionObserver は交差が変わったときにしか鳴らず、カードが増えないと
			// sentinel も動かないので、下端に留まったままの人のために再試行ボタンを出す
			warn('infinite scroll failed', error);
			showState(SENTINEL_STATE.ERROR);
		} finally {
			loading = false;
		}
	}

	/**
	 * 継ぎ足したカードのハートを押したときの処理。
	 *
	 * clone した button は React のハンドラを持たないので、ここで自前に受ける。
	 * 本体のカードのハートには触らない。(React が持っているので、preventDefault すると本来の動作を壊す)
	 * 削除の反映は数秒遅れるため、押した見た目を先に変えて再取得では確かめない。
	 * @param {MouseEvent} event クリック
	 * @returns {Promise<void>|undefined} 送信の待ち。対象外なら undefined
	 */
	function onHeartClick(event) {
		let card = null;
		try {
			if (disposed) return undefined;
			// path や svg を押されることもあるので button まで遡ってから絞る
			const button = event.target?.closest?.('button');
			if (!button?.closest(BOOKMARK_BUTTON_SELECTOR)) return undefined;
			// 継ぎ足したカードだけが対象。本体のカードはここで抜ける
			card = button.closest(`[${XV_CARD_ATTR}]`);
			if (!card) return undefined;
		} catch (error) {
			// 押された場所が読めないなら本体の動作に任せる
			warn('bookmark target lookup failed', error);
			return undefined;
		}
		event.preventDefault();
		event.stopPropagation();
		// 返事を待っている間の二度押しは捨てる。待たずに 2 回送ると余分なブックマークが残る
		if (sending.has(card)) return undefined;
		sending.add(card);
		return sendBookmark(card, event.shiftKey === true);
	}

	/**
	 * 押す前の見た目と状態へ戻す。
	 * ここで投げると失敗の後始末が止まるので、DOM の操作はまとめて包む。
	 * @param {object} card カード (li)
	 * @param {string|null} bookmarkId 押す前のブックマーク ID。未ブックマークなら null
	 * @returns {void}
	 */
	function restoreHeart(card, bookmarkId) {
		try {
			paintHeart(card, Boolean(bookmarkId));
			if (bookmarkId) card.setAttribute(XV_BOOKMARK_ID_ATTR, bookmarkId);
			else card.removeAttribute(XV_BOOKMARK_ID_ATTR);
		} catch (error) {
			warn('bookmark rollback failed', error);
		}
	}

	/**
	 * ハートの状態を切り替えて pixiv へ送る。
	 * @param {object} card カード (li)
	 * @param {boolean} isPrivate 非公開で入れるか (Shift + クリック)
	 * @returns {Promise<void>}
	 */
	async function sendBookmark(card, isPrivate) {
		/** @type {string|null} 押す前のブックマーク ID。失敗したときの戻し先 */
		let bookmarkId = null;
		try {
			// 属性の読み取りも塗りも try の中に入れる。外に出すと、投げたときに
			// finally を通らず sending にカードが残り、そのカードが二度と押せなくなる
			const workId = card.getAttribute(XV_CARD_ATTR);
			bookmarkId = card.getAttribute(XV_BOOKMARK_ID_ATTR);
			// 押した結果を先に見せる。通信を待たせない
			paintHeart(card, !bookmarkId);
			// トークンは押された時点で読む。組み立て時の値を閉じ込めない
			const token = readSession(doc).csrfToken ?? '';
			if (bookmarkId) {
				await actions.deleteBookmark(bookmarkId, token);
				if (disposed) return;
				card.removeAttribute(XV_BOOKMARK_ID_ATTR);
			} else {
				const id = await actions.addBookmark(workId, isPrivate, token);
				if (disposed) return;
				card.setAttribute(XV_BOOKMARK_ID_ATTR, String(id));
			}
		} catch (error) {
			if (disposed) return;
			restoreHeart(card, bookmarkId);
			// 401 はログインが切れている。(別タブでログアウトした等) 覚えたセッションを捨てる
			if (error?.kind === PIXIV_ERROR_KINDS.UNAUTHORIZED) clearSessionCache();
			warn('bookmark failed', error);
		} finally {
			sending.delete(card);
		}
	}

	/**
	 * ハートの購読を外す。二度呼んでも 1 回しか外さない。
	 * @returns {void}
	 */
	function unbindHeart() {
		if (!heartBound) return;
		heartBound = false;
		try {
			doc.removeEventListener('click', onHeartClick, true);
		} catch (error) {
			// 外せなくても dispose 済みなら handler は何もしない
			warn('bookmark listener removal failed', error);
		}
	}

	try {
		sentinelStyle.show();
		// 継ぎ足したカードのハートを受ける。カードごとに張ると 48 枚ぶん増えるので doc で 1 本。
		// React より先に受けたいので capture で張る。
		// 押せるハートが無いなら購読も張らない。(全クリックで空振りするだけ)
		// 未ログインでは buildCard がボタンごと外し、自分のユーザーページでは
		// そもそも雛形にハートが無い (pixiv が自分の作品に描かない。SITE_SPEC §4)
		if (loggedIn && heartPaths(templates.single).length > 0) {
			heartBound = true;
			doc.addEventListener('click', onHeartClick, true);
		}
		sentinel = doc.createElement('div');
		sentinel.setAttribute(SENTINEL_ATTR, '');
		// 読み上げの領域は「空のものが先にあって、後から中身が変わる」形でないと鳴らない。
		// (中身入りで差し込むと status は読まれない) 永続する sentinel 自身に持たせ、
		// 中の要素だけを差し替える。(UI_DESIGN_KIT §6)
		// 領域はここ 1 つだけ。中に role="alert" を入れて入れ子にはしない。
		// 強さ (polite / assertive) は状態に応じて showState が切り替える
		sentinel.setAttribute('role', 'status');
		sentinel.setAttribute('aria-live', 'polite');
		// ul の中に入れると flex アイテムとしてカード 1 枚分の隙間になる。
		// 親の末尾ではなく ul の直後に入れる。親が ul の後ろにページャ等を持つと、
		// 末尾では sentinel がその下に落ち、そのぶん発火が遅れる
		const host = ul.parentElement;
		if (!host) throw new Error('grid has no parent');
		host.insertBefore(sentinel, ul.nextSibling ?? null);
		startObserving();
	} catch (error) {
		// sentinel を置けないページでは継ぎ足しを諦める。ページャはそのまま残る
		warn('infinite scroll setup failed', error);
		stopObserving();
		unbindHeart();
		sentinelStyle.hide();
		try {
			sentinel?.remove();
		} catch { /* 置けていないので消せなくてよい */ }
		return inactiveHandle();
	}

	// ここまで来て初めて「継ぎ足しを始められる」と決まる。本体のページャはもう要らない。
	// これより前に隠すと、継ぎ足せないページでページ送りの手段まで消えてしまう。
	// 継ぎ足したカードを出す CSS も同じ時点で入れる (1 枚目を足すより前であればよい)
	pagerStyle.show();
	cardStyle.show();
	// 本体が並べたぶんの先頭カードも印にする。これが基準ページ (?p= の下限) になる
	const firstCard = ul.querySelector('li');
	if (firstCard) pageMarks.push({ page: lastPage, el: firstCard });
	bindScroll();

	return {
		/**
		 * 継ぎ足しが動いているか。雛形が採れたうえで、まだ dispose() されていなければ true。
		 * @returns {boolean} 動いていれば true
		 */
		isActive: () => !disposed,
		/**
		 * モードを切り替える。継ぎ足したカードには触らない。
		 * (設定を切り替えただけで読み進めた場所を失わせないため)
		 * @param {string} next INFINITE_SCROLL のいずれか
		 * @returns {void}
		 */
		setMode(next) {
			// dispose() 済み / 同じモードなら何もしない
			if (disposed || next === mode) return;
			mode = next;
			// 先読みの持ち分は捨てる。モードが変われば先読みの前提も変わる
			dropPrefetch();
			// 読み切った後にモードを変えても監視は再開しない
			if (done) return;
			try {
				startObserving();
			} catch (error) {
				// 監視し直せなければ継ぎ足しは止まる。ページャは残っているので閲覧は続けられる
				warn('infinite scroll re-observe failed', error);
			}
		},
		/**
		 * 今画面に出ているページ番号。
		 * 呼び出し側が URL の ?p= を合わせ直すときに読む。(pixiv が ?p= を戻したあと等)
		 * 測れなければ最後に知らせた値を返す。dispose() 後は動いていないので null。
		 * @returns {number|null} ページ番号 (1 以上)。動いていなければ null
		 */
		currentPage() {
			if (disposed) return null;
			try {
				return pickVisiblePage(pageMarks, rectTop) ?? notifiedPage;
			} catch (error) {
				warn('infinite scroll current page read failed', error);
				return notifiedPage;
			}
		},
		/**
		 * 継ぎ足しをやめ、置いたものを全て撤去してページを元へ戻す。
		 * 二度呼んでも 1 回しか効かない。
		 * @returns {void}
		 */
		dispose() {
			if (disposed) return;
			disposed = true;
			dropPrefetch();
			stopObserving();
			unbindScroll();
			unbindHeart();
			// 撤去したカードの印は残さない。外れたノードの rect は当てにならない
			pageMarks.length = 0;
			// 隠したページャを戻す。継ぎ足しをやめた以上、ページ送りの手段が要る。
			// sentinel の見た目も外して、置いたものを全て元へ戻す
			pagerStyle.hide();
			cardStyle.hide();
			sentinelStyle.hide();
			// 撤去は別々に包む。片方が投げても、もう片方はページに残さない。
			// 継ぎ足したカードが残るのは「拡張をオフにしたのに元へ戻らない」状態なので先に消す
			try {
				for (const card of [...ul.querySelectorAll(`[${XV_CARD_ATTR}]`)]) card.remove();
			} catch (error) {
				warn('infinite scroll card removal failed', error);
			}
			try {
				sentinel?.remove();
			} catch (error) {
				warn('infinite scroll sentinel removal failed', error);
			}
		},
	};
}
