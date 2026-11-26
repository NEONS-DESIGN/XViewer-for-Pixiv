/**
 * ユーザーページの作品グリッドの無限スクロールを、今の URL と設定に合わせ続ける。
 *
 * 判断 (張り直すのか / そのままか / 基準ページはいくつか) は infinite-sync.js の decideInfiniteSync() に任せ、
 * ここは DOM・URL (`?p=`)・グリッドについての記憶の更新だけを持つ。
 * ビュワーの入切とは独立に効く。(ビュワーを使わない人も無限スクロールだけ使える)
 */
import { isInfiniteScrollTarget, parseUserPage, parsePageParam } from './page.js';
import { replaceUrlKeepingState } from './router.js';
import { findGridList } from './grid.js';
import { attachInfiniteScroll } from './infinite.js';
import { decideInfiniteSync, SYNC_ACTIONS } from './infinite-sync.js';
import { readSession } from './session.js';
import { createPageSource } from '../pixiv/pages.js';
import { warn } from '../common/log.js';
import { INFINITE_SCROLL, PAGE_KEY_SEPARATOR } from '../common/constants.js';

/**
 * 設定から無限スクロールのモードを読む。設定がまだ無ければ off。
 * @param {{infiniteScroll?: string}|null|undefined} settings 設定 (normalizeSettings 済み)
 * @returns {string} INFINITE_SCROLL のいずれか
 */
export function infiniteModeOf(settings) {
	return settings?.infiniteScroll ?? INFINITE_SCROLL.OFF;
}

/**
 * 無限スクロールの対象として読めるページか。作品グリッドの 3 タブ以外は対象外。
 * @param {string} path location.pathname
 * @returns {import('./page.js').UserPage|null} 対象でなければ null
 */
function infiniteTargetPage(path) {
	return isInfiniteScrollTarget(path) ? parseUserPage(path) : null;
}

/**
 * どのグリッドを見ているかを表すキーを作る。タブが変われば並ぶ作品も変わるので種別もキーに入れる。
 * @param {import('./page.js').UserPage|null} page infiniteTargetPage() の結果
 * @returns {string|null} グリッドのキー。対象外のページなら null
 */
function gridKeyOf(page) {
	return page ? [page.userId, page.category ?? ''].join(PAGE_KEY_SEPARATOR) : null;
}

/**
 * ul にある画像の数。張れなかった ul が描き進んだかを見る手掛かり。
 * @param {Element} ul グリッドの ul
 * @returns {number} img の数。数えられなければ -1
 */
function countGridImages(ul) {
	try {
		return ul.querySelectorAll('img').length;
	} catch {
		return -1;
	}
}

/**
 * @typedef {object} InfiniteController
 * @property {() => void} sync 今の設定と URL に合わせる。自分の `?p=` の書き込みで呼び戻されても 2 本張らない
 * @property {() => void} restoreParam `?p=` を今画面に出ているページへ書き直す。動いていなければ何もしない
 * @property {() => boolean} isIdle 使っておらず何も張っていないか。(URL が変わらない限り sync() しても判断は同じ)
 * @property {() => boolean} needsCheck 張れていないか、張った ul が DOM から外れたか。(DOM の変化で sync() し直す価値がある)
 * @property {() => void} dispose 継ぎ足しを撤去し、`?p=` を基準ページへ戻す。グリッドについての記憶は残す
 * @property {(isWatching: () => boolean) => void} disposeAfterClose 自分のモーダルの最中なら閉じる popstate を待ってから撤去する。
 *   待つ間に監視が張り直された (isWatching() が true) なら撤去しない。モーダルでなければすぐ撤去する
 */

/**
 * 無限スクロールの追従を作る。
 * @param {{doc: Document, win: Window,
 *   getSettings: () => object|null, getStrings: () => object,
 *   isViewingOwnWork: () => boolean, isViewerOpen: () => boolean,
 *   attach?: typeof attachInfiniteScroll, createSource?: typeof createPageSource,
 *   isLoggedIn?: () => boolean, replaceUrl?: (url: string) => void}} deps
 *   依存。getStrings は文言のカタログ、isViewerOpen はビュワーのモーダルが開いているか。
 *   attach / createSource / isLoggedIn / replaceUrl はテスト用の差し替え
 * @returns {InfiniteController} 操作
 */
export function createInfiniteController(deps) {
	const { doc, win, getSettings, getStrings, isViewingOwnWork, isViewerOpen } = deps;
	const attach = deps.attach ?? attachInfiniteScroll;
	const createSource = deps.createSource ?? createPageSource;
	const isLoggedIn = deps.isLoggedIn ?? (() => readSession(doc).isLoggedIn);
	const replaceUrl = deps.replaceUrl ?? ((url) => replaceUrlKeepingState(url, win));

	/**
	 * @type {import('./infinite.js').InfiniteHandle|null}
	 * 張った継ぎ足し。雛形が採れずに張れなかったときも (何もしない handle を) 持つ。isActive() で見分ける
	 */
	let infinite = null;
	/**
	 * 張ろうとしたグリッドのキー (作者 + タブ)。張っていなければ null。
	 * 張れなかったときも覚え、同じ ul に対して組み直しを繰り返さない
	 */
	let infiniteKey = null;
	/** @type {Element|null} このグリッドで最後に見た ul。描き直されて外れたことに気付く手掛かり。撤去では捨てない */
	let infiniteList = null;
	/** 張れなかったとき、infiniteList にあった画像の数。変わらない限り試し直さない */
	let infiniteListImages = -1;
	/** 下の infiniteBasePage がどのグリッドについての記憶か。対象外のページなら null。設定を切っても変わらない */
	let infiniteGridKey = null;
	/** pixiv 自身がグリッドに並べているページ番号。(継ぎ足したぶんは数えない) 継ぎ足しはこの次のページから読む */
	let infiniteBasePage = 1;
	/** 自分が `?p=` に書いた値。書いていなければ null。基準ページより大きいとは限らない */
	let infiniteOwnPage = null;
	/** sync() を走らせている最中か。自分の ?p= の書き込みで再入するのを防ぐ */
	let syncing = false;
	/** モーダルを閉じる popstate を待ってから撤去する購読を張っているか。待ちは 1 本だけ */
	let awaitingCloseForDispose = false;

	/**
	 * 最後に見た ul が DOM から外れたか。外れていれば張り直しが要る。(基準ページは変えない)
	 * @returns {boolean} 外れていれば true
	 */
	function isGridDetached() {
		return Boolean(infiniteList) && !infiniteList.isConnected;
	}

	/**
	 * 張れていないグリッドを試し直す価値があるか。別の ul が現れたか、同じ ul でも画像が増えていれば試す。
	 * @returns {boolean} 試し直すなら true
	 */
	function hasGridChanged() {
		const ul = findGridList(doc);
		if (!ul) return false;
		return ul !== infiniteList || countGridImages(ul) !== infiniteListImages;
	}

	/**
	 * 継ぎ足しを張ったグリッドを、今も見ているか。
	 * 別のページへ遷移した直後 (遅らせた追従が届くまで) は false で、その間は `?p=` を触らない。
	 * @returns {boolean} 張ったグリッドの URL のままなら true。張っていなければ false
	 */
	function isOnAttachedGrid() {
		return infiniteKey !== null && infiniteKey === gridKeyOf(infiniteTargetPage(win.location.pathname));
	}

	/**
	 * 見えているページに合わせて ?p= を書き換える。上へ戻れば小さい値も書く。履歴は積まない。
	 * モーダルが開いている間 (URL は router.js の持ち物) と、張ったグリッドの URL でなくなっているときは書かない。
	 * @param {number} page ページ番号
	 * @returns {void}
	 */
	function writePageParam(page) {
		if (isViewerOpen() || !isOnAttachedGrid()) return;
		const previousOwn = infiniteOwnPage;
		try {
			const url = new URL(win.location.href);
			// 1 ページ目は pixiv 自身も ?p= を付けない。付けずに揃える
			if (page > 1) url.searchParams.set('p', String(page));
			else url.searchParams.delete('p');
			// 書く前に覚える。書き込みの途中で遷移の通知が来ても、自分の値だと分かるようにする
			infiniteOwnPage = page;
			// 既に同じ URL なら書かない。(replaceState を呼び過ぎるとブラウザに絞られる)
			// history.replaceState をここで呼ばない。state を保ったまま URL だけ差し替えるのは注入側 (page world) に任せる
			if (url.href !== win.location.href) replaceUrl(url.href);
		} catch (error) {
			// 書けていないので、URL に残っているのは前に自分が書いた値のまま。記憶も戻す
			infiniteOwnPage = previousOwn;
			// URL がずれるだけ。継ぎ足しは続ける
			warn('page param update failed', error);
		}
	}

	/**
	 * 継ぎ足しを撤去する。グリッドについての記憶 (infiniteGridKey / infiniteBasePage / infiniteList) は捨てない。
	 * @returns {void}
	 */
	function dispose() {
		// ?p= も基準ページへ戻す。判定が infiniteKey を見るので、消す前に書く
		if (isOnAttachedGrid()) writePageParam(infiniteBasePage);
		infinite?.dispose();
		infinite = null;
		infiniteKey = null;
		infiniteListImages = -1;
	}

	/**
	 * URL の ?p= を、今画面に出ているページへ合わせ直す。継ぎ足しが動いていなければ何もしない。
	 * @returns {void}
	 */
	function restoreParam() {
		const page = infinite?.currentPage();
		if (page) writePageParam(page);
	}

	/**
	 * 今の設定と URL に合わせる本体。再入は sync() が防ぐ。
	 * @returns {void}
	 */
	function syncOnce() {
		// 自分のモーダルの間 URL は /artworks/{id} で対象外に見える。ここで判断すると継ぎ足しごと撤去してしまう
		if (isViewingOwnWork()) return;
		const wanted = infiniteModeOf(getSettings());
		// どのグリッドを見ているかは設定と切り離し、ページだけで決める
		const page = infiniteTargetPage(win.location.pathname);
		const key = gridKeyOf(page);
		const active = infinite?.isActive() === true;
		const decision = decideInfiniteSync({
			wanted,
			key,
			gridKey: infiniteGridKey,
			attachedKey: infiniteKey,
			active,
			detached: isGridDetached(),
			// 同じグリッドで張れていないときだけ DOM を見る
			listChanged: infiniteKey !== null && infiniteKey === key && !active && hasGridChanged(),
			param: parsePageParam(win.location.search),
			ownPage: infiniteOwnPage,
			basePage: infiniteBasePage,
		});
		if (decision.changedGrid) {
			// 別のグリッドを見始めた。(対象外のページへ出た場合も含む) 前のグリッドの記憶を捨てる
			infiniteList = null;
			infiniteListImages = -1;
		}
		// 記憶は撤去 (dispose が ?p= を基準ページへ書き戻す) より先に更新する
		infiniteGridKey = decision.gridKey;
		infiniteBasePage = decision.basePage;
		infiniteOwnPage = decision.ownPage;
		if (decision.action === SYNC_ACTIONS.KEEP || decision.action === SYNC_ACTIONS.RESTORE_PARAM) {
			// 同じグリッドに張ったまま。設定の変更はモードの差し替えだけで追従する (作り直すと読み進めた場所を失う)
			infinite?.setMode(wanted);
			if (decision.action === SYNC_ACTIONS.RESTORE_PARAM) restoreParam();
			return;
		}
		dispose();
		if (decision.action === SYNC_ACTIONS.DETACH) return;
		const ul = findGridList(doc);
		// グリッドがまだ描かれていない。現れたときにもう一度呼ばれるのを待つ
		if (!ul) return;
		infiniteKey = key;
		infiniteList = ul;
		try {
			const strings = getStrings();
			infinite = attach(doc, {
				ul,
				strings,
				source: createSource(page.userId, page.category, strings.lang),
				mode: wanted,
				loggedIn: isLoggedIn(),
				// グリッドに並んでいるのは基準ページのぶんだけ。続きはその次から読む
				startPage: infiniteBasePage,
				onPageChange: writePageParam,
			});
			// 張れなかった。描き途中の ul だったかもしれないので、ul と画像の数を覚えて変わったときだけ試し直す
			if (!infinite.isActive()) infiniteListImages = countGridImages(ul);
		} catch (error) {
			// 継ぎ足せなくても pixiv 標準のページャは残る。キーと ul は残し、同じ ul では作り直しを繰り返さない
			warn('infinite scroll setup failed', error);
			infinite = null;
			infiniteListImages = countGridImages(ul);
		}
	}

	return {
		sync() {
			if (syncing) return;
			syncing = true;
			try {
				syncOnce();
			} finally {
				syncing = false;
			}
		},
		restoreParam,
		isIdle() {
			if (infinite || infiniteKey !== null) return false;
			return infiniteModeOf(getSettings()) === INFINITE_SCROLL.OFF || !isInfiniteScrollTarget(win.location.pathname);
		},
		needsCheck() {
			return !infinite?.isActive() || isGridDetached();
		},
		dispose,
		disposeAfterClose(isWatching) {
			if (!isViewingOwnWork()) {
				dispose();
				return;
			}
			// 閉じるための history.back() がまだ届いていない。作品ページの URL のままでは ?p= を書き戻せない
			if (awaitingCloseForDispose) return;
			awaitingCloseForDispose = true;
			win.addEventListener('popstate', () => {
				awaitingCloseForDispose = false;
				if (!isWatching()) dispose();
			}, { once: true });
		},
	};
}
