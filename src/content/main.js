/**
 * content script のエントリ。
 * pixiv は SPA なので、URL が変わるたびに対象ページかどうかを判定し直す。
 */
import {
	isViewerTarget,
	isProfileHome,
	isInfiniteScrollTarget,
	parseArtworkPath,
	parseUserPage,
	pageKey,
	parsePageParam,
} from './page.js';
import { createRouter, isOwnHistoryEntry } from './router.js';
import { attachGridListener, collectWorkIds, findGridList } from './grid.js';
import { attachTabSkip } from './tab-skip.js';
import { ensureFocusStyle } from './grid-focus.js';
import { attachPickupHider } from './pickup.js';
import { attachInfiniteScroll } from './infinite.js';
import { decideInfiniteSync, SYNC_ACTIONS } from './infinite-sync.js';
import { readSession } from './session.js';
import { createViewer } from './viewer/viewer.js';
import { createDomSequence, extendWithAllWorks } from './sequence.js';
import { createPageSource } from '../pixiv/pages.js';
import { loadSettings, watchSettings } from '../common/storage.js';
import { warn, info } from '../common/log.js';
import {
	NAV_EVENTS,
	LOCATION_CHECK_DELAY_MS,
	INFINITE_SCROLL,
	PAGE_KEY_SEPARATOR,
} from '../common/constants.js';
import { readPageLanguage, uiLanguage } from '../common/language.js';
import { savePageLanguage } from '../common/language-store.js';
import { createStrings } from '../i18n/index.js';

/** 今の購読。ページから離れるときに解除する。 */
let gridListener = null;
/** @type {{setMode: (mode: string) => void, dispose: () => void}|null} グリッドのフォーカス順の組み替え */
let tabSkip = null;
/** @type {{dispose: () => void}|null} グリッドのフォーカス枠の CSS */
let focusStyle = null;
/**
 * @type {{setActive: (active: boolean) => void, dispose: () => void}|null}
 * ピックアップ欄を隠す CSS。ビュワーの入切とは独立に効くので stop() では触らない
 */
let pickupHider = null;
/**
 * @type {import('./infinite.js').InfiniteHandle|null}
 * グリッドの無限スクロール。ビュワーの入切とは独立に効くので stop() では触らない。
 * 雛形が採れずに張れなかったときも (何もしない handle を) 持つ。isActive() で見分ける
 */
let infinite = null;
/**
 * 今 infinite を張ろうとしたグリッドのキー (作者 + タブ)。張っていなければ null。
 * 同じグリッドを見続けている間は作り直さず、別のグリッドへ移ったら必ず捨てるための目印。
 * 雛形が採れずに張れなかったときも覚え、同じ ul に対して組み直しを繰り返さない
 * (試し直すのは別の ul が現れたか、ul の画像が増えたときだけ。infiniteListImages を参照)
 */
let infiniteKey = null;
/**
 * @type {Element|null} このグリッドで最後に見た ul。まだ見ていなければ null。
 * React がグリッドを描き直すと、置いた sentinel ごと DOM から外れて継ぎ足しが黙って止まる。
 * 外れたことに気付くための手掛かりとして持つ。
 * 撤去 (dispose) では捨てない。監視を止めている間に描き直されたことにも気付きたいため
 */
let infiniteList = null;
/**
 * 張れなかったとき、`infiniteList` にあった画像の数。
 * 直接開いたページでは img がまだ figure のままで雛形が採れないことがあり、
 * 画像が読み込まれて (同じ ul のまま) img に置き換わったら試し直したい。
 * 一方、全カードがブックマーク済みの作者ページ等では何度試しても同じなので、
 * 画像の数が変わらない限り captureTemplates (getComputedStyle x 48) を回さない
 */
let infiniteListImages = -1;
/**
 * 下の `infiniteBasePage` がどのグリッドについての記憶か。対象外のページなら null。
 * ページ (作者 + タブ) だけで決める。**設定を切っても変わらない**のが要点で、
 * オフの間も「このグリッドは何ページ目を並べているか」を覚えておくために `infiniteKey` と分けてある
 */
let infiniteGridKey = null;
/**
 * pixiv 自身がグリッドに並べているページ番号。(継ぎ足したぶんは数えない)
 * 継ぎ足しはこの次のページから読む。値が動くのは pixiv が `?p=` を動かしたとき
 * (別のグリッドを見始めた / ページャ / 戻る) だけ。pixiv はその値のページを並べている。
 * 同じグリッドを描き直されても変えない。Next.js の router state は自分の `replaceState` では
 * 動かないので、描き直しは pixiv が最後に遷移したクエリ (= この値) で起きる。(infinite-sync.js)
 *
 * `?p=` をそのまま使えないのは、継ぎ足しに合わせて自分で書き換えているため。
 * 撤去して張り直す (オフ→オンなど) と、グリッドには pixiv が並べたぶんしか残らない
 */
let infiniteBasePage = 1;
/**
 * 自分が `?p=` に書いた値。書いていなければ null。
 * `?p=` を動かしたのが pixiv (直接アクセス / リロード / ページャ) なのか自分なのかを見分ける。
 * pixiv が動かした値はグリッドの中身と一致するので基準ページにできるが、
 * 自分が書いた値は画面に出ている場所でしかなく、撤去すると中身と合わなくなる。
 * スクロールで上下するので、基準ページより大きいとは限らない
 */
let infiniteOwnPage = null;
/** syncInfinite() を走らせている最中か。自分の ?p= の書き込みで再入するのを防ぐ目印 */
let syncingInfinite = false;
let router = null;
let settings = null;
/**
 * @type {object|null} 文言のカタログ。boot() で 1 回だけ決める。
 * 表示言語の変更はフルリロードを伴うので、SPA 遷移の途中で変わることはない
 */
let strings = null;
let viewer = null;
/**
 * @type {import('./page.js').UserPage|null} 作品を開いたときに見ていたユーザーページ。
 * モーダルを開くと URL は /artworks/{id} になり、そこからはページの種別が読めない。
 * 端で並びを広げる判断はここを見る
 */
let currentPage = null;
/** 今購読しているページのキー。未起動なら null */
let activeKey = null;
/** @type {{dispose: () => void}|null} 遷移監視の購読。設定でオフにしたら外す */
let navigationWatch = null;
/** MutationObserver 経路で前回見たパス。変わっていなければ何もしない */
let observedPath = null;
/** パス確認の遅延タイマ ID。0 なら動いていない */
let checkTimer = 0;
/** 遷移通知から無限スクロールの追従までの遅延タイマ ID。0 なら動いていない */
let infiniteSyncTimer = 0;

/**
 * 作品が開かれたときの処理。
 * @param {string} workId 作品 ID
 * @returns {void}
 */
function handleOpen(workId) {
	// タブ (イラスト / 漫画) の切り替えはページの組み直しを伴わないので、開くたびに読み直す
	rememberPage(location.pathname);
	const ids = collectWorkIds(document, location.origin);
	router.open(workId);
	void viewer.open(workId, createDomSequence(ids));
}

/**
 * 戻る/進むで URL が変わったときの処理。
 * 作品を指していなければモーダルを閉じる。
 * @param {string|null} workId 今の URL が指す作品 ID
 * @returns {void}
 */
function handlePopState(workId) {
	if (!workId) {
		viewer.close();
		// 閉じると Next.js が自分の履歴 state の URL (= pixiv が最後に遷移した ?p=) へ
		// replaceState し直すことがある。グリッドは継ぎ足したままなので、URL を今の位置へ合わせ直す
		syncPageParam();
		return;
	}
	// 既に開いている作品なら描き直さない (作品移動で replaceState した直後など)
	if (!viewer.isOpen()) {
		void viewer.open(workId, createDomSequence(collectWorkIds(document, location.origin)));
	}
}

/**
 * ユーザーページとして読めるパスなら覚える。読めなければ前の値を残す。
 * @param {string} path location.pathname
 * @returns {void}
 */
function rememberPage(path) {
	const page = parseUserPage(path);
	if (page) currentPage = page;
}

/**
 * 自分のルーターが開いた作品を見ている最中か。
 * URL が /artworks/{id} でも pixiv 本体の作品ページ (本体の SPA 遷移や直接アクセス) なら false。
 * 履歴の state に付けた目印で見分ける
 * @returns {boolean} 自分のモーダル用の履歴エントリなら true
 */
function isViewingOwnWork() {
	return parseArtworkPath(location.pathname) !== null && isOwnHistoryEntry(window);
}

/**
 * 今の URL に合わせて購読を組み直す。
 *
 * 起動と停止とページ切り替えを 1 か所で扱う。ページが変わったら必ず作り直すのが要点で、
 * 同じ購読を使い回すと page (userId やタグ絞り込みの有無) が初回の値で固定され、
 * グリッドの端で別人の作品一覧へ飛んでしまう。
 * 設定は boot() が読み終えてから呼ばれ、以後は watchSettings が更新し続けるので、ここでは読まない。
 * (同期関数なので、遷移の通知の中で呼んでも await をまたいだ再入は起きない)
 * @returns {void}
 */
function apply() {
	const path = location.pathname;
	if (!settings?.enabled) {
		stop();
		return;
	}
	// 自分のモーダルの URL は対象外ページに見えるが、開いている最中なので止めてはいけない。
	// 設定変更の通知でもここを通る (設定そのものは watchSettings が viewer へ渡し済み)
	if (isViewingOwnWork()) return;
	if (!isViewerTarget(path)) {
		stop();
		return;
	}
	// 同じ作者・同じ絞り込みのままなら作り直す必要はない
	const key = pageKey(path);
	if (activeKey === key) return;

	// 別のページへ移った。古い購読を捨ててから組み立て直す
	stop();
	activeKey = key;
	rememberPage(path);

	router = createRouter(handlePopState);
	viewer = createViewer({
		doc: document,
		settings,
		strings,
		// 閉じたい合図は履歴を戻すことに集約する。実際に閉じるのは popstate 側
		onRequestClose: () => router.close(),
		// 作品を切り替えたら URL だけ差し替える。履歴は積まない
		onNavigate: (workId) => router.replace(workId),
		// その人自身の作品グリッドでだけ広げる。
		// ブックマークやフォロー中に並んでいるのは他人の作品なので、
		// 「この作者の全作品」へ広げると画面と無関係な作品へ飛んでしまう。
		// タグ絞り込み中も profile/all と並びが一致しないので広げない
		canExtendSequence: () => Boolean(currentPage) && currentPage.isWorksGrid && !currentPage.isTagFiltered,
		extendSequence: (current) => extendWithAllWorks(current, currentPage.userId, currentPage.category),
	});
	gridListener = attachGridListener(document, handleOpen);
	// カード 1 枚につき 3 回 Tab を押さずに済むよう、作品を開く導線以外をフォーカス順から外す
	tabSkip = attachTabSkip(document, settings.gridTabSkip);
	// どこにフォーカスがあるか分かるようにする。gridTabSkip の設定とは独立して常に出す
	focusStyle = ensureFocusStyle(document);
	info('ready on', path);
}

/**
 * 止める。
 * @returns {void}
 */
function stop() {
	activeKey = null;
	gridListener?.dispose();
	gridListener = null;
	// 外したフォーカス順は必ず戻す。戻さないと pixiv 標準の Tab が壊れたままになる
	tabSkip?.dispose();
	tabSkip = null;
	focusStyle?.dispose();
	focusStyle = null;
	router?.dispose();
	router = null;
	viewer?.dispose();
	viewer = null;
}

/**
 * ピックアップ欄を隠す CSS を、今の設定と URL に合わせる。
 * 欄が出るのはプロフィールのホームだけなので、他のパスでは外して pixiv 標準へ戻す。
 * @returns {void}
 */
function syncPickup() {
	pickupHider?.setActive(Boolean(settings?.hidePickup) && isProfileHome(location.pathname));
}

/**
 * 無限スクロールの対象として読めるページか。
 * 作品グリッドの 3 タブ以外は対象外。(ホーム・タグ絞り込み・ブックマークには
 * pixiv 本体のページャが無く、profile/all と並びも一致しない)
 * @param {string} path location.pathname
 * @returns {import('./page.js').UserPage|null} 対象でなければ null
 */
function infiniteTargetPage(path) {
	return isInfiniteScrollTarget(path) ? parseUserPage(path) : null;
}

/**
 * どのグリッドを見ているかを表すキーを作る。
 * タブが変われば並ぶ作品も変わるので、作者だけでなく種別もキーに入れる。
 * @param {import('./page.js').UserPage|null} page infiniteTargetPage() の結果
 * @returns {string|null} グリッドのキー。対象外のページなら null
 */
function gridKeyOf(page) {
	return page ? [page.userId, page.category ?? ''].join(PAGE_KEY_SEPARATOR) : null;
}

/**
 * 最後に見た ul が DOM から外れたか。
 * pixiv がグリッドを描き直すと、継ぎ足したカードも sentinel もろとも外れ、
 * 見張っている sentinel が二度と画面に入らないまま継ぎ足しが黙って止まる。
 * この場合は張り直しが要る。(基準ページは変えない。infiniteBasePage の説明を参照)
 * @returns {boolean} 外れていれば true
 */
function isGridDetached() {
	return Boolean(infiniteList) && !infiniteList.isConnected;
}

/**
 * ul にある画像の数。張れなかった ul が描き進んだかを見る手掛かり。(infiniteListImages)
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
 * 張れていないグリッドを試し直す価値があるか。
 * 前回試した ul と別の ul が現れたか、同じ ul でも画像が増えていれば試す。
 * 張れている (または何も試していない) ときは見ない。
 * @returns {boolean} 試し直すなら true
 */
function hasGridChanged() {
	const ul = findGridList(document);
	if (!ul) return false;
	return ul !== infiniteList || countGridImages(ul) !== infiniteListImages;
}

/**
 * 継ぎ足しを撤去する。
 * グリッドについての記憶 (`infiniteGridKey` / `infiniteBasePage` / `infiniteList`) は捨てない。
 * 設定を切っただけでも呼ばれるので、ここで捨てると再び入れたときに
 * 「グリッドが何ページ目を並べているか」を見失う。
 * @returns {void}
 */
function disposeInfinite() {
	const attachedKey = infiniteKey;
	infinite?.dispose();
	infinite = null;
	infiniteKey = null;
	infiniteListImages = -1;
	// 撤去するとグリッドには pixiv が並べたぶんしか残らない。URL の ?p= もそこへ戻し、
	// 「自分が書いた値」の記憶も揃える。URL・グリッド・記憶の 3 つを常に一致させるのが狙いで、
	// ずれたままだと「戻ったつもりでページャを踏んだ番号」を自分の書き込みと取り違える。
	// 張っていたグリッドをまだ見ているときだけ書く。既に別のページへ移っていたら、
	// 今の URL は別のグリッドのものなので触らない
	if (attachedKey !== null && attachedKey === gridKeyOf(infiniteTargetPage(location.pathname))) {
		writePageParam(infiniteBasePage);
	}
}

/**
 * URL の ?p= を、今画面に出ているページへ合わせ直す。
 * pixiv (Next.js) が ?p= を自分の値へ戻したあとに呼ぶ。継ぎ足しが動いていなければ何もしない。
 * @returns {void}
 */
function syncPageParam() {
	const page = infinite?.currentPage();
	if (page) writePageParam(page);
}

/**
 * 無限スクロールを今の設定と URL に合わせる。
 *
 * ビュワーの入切とは独立に効かせる。ビュワーを使わない人も無限スクロールだけ使える。
 * (ピックアップ非表示と同じ扱い)
 * @returns {void}
 */
function syncInfinite() {
	// 自分で書いた ?p= も inject.js のフックを通って handleLocationChange() を呼び戻す
	// (通知の経路は遅延させてあるが、同期で届く経路が増えても 2 本張らないよう、ここで閉じる)
	if (syncingInfinite) return;
	syncingInfinite = true;
	try {
		syncInfiniteOnce();
	} finally {
		syncingInfinite = false;
	}
}

/**
 * 遷移の通知を受けてから、少し待って無限スクロールを合わせる。
 * inject.js の通知は pixiv の pushState の中で同期に届くので、その場で合わせると
 * React がまだ前のグリッドを描いている時点で雛形の採取 (強制スタイル計算) と sentinel の
 * 挿入が走る。pixiv のルーター呼び出しの中で重い DOM 走査をしないよう、間隔を置く。
 * 待っている間に届いた通知は 1 回にまとめる。
 * @returns {void}
 */
function scheduleInfiniteSync() {
	if (infiniteSyncTimer) return;
	infiniteSyncTimer = setTimeout(() => {
		infiniteSyncTimer = 0;
		syncInfinite();
	}, LOCATION_CHECK_DELAY_MS);
}

/**
 * 無限スクロールを今の設定と URL に合わせる本体。再入は syncInfinite() が防ぐ。
 * 判断は decideInfiniteSync() (純粋関数) に任せ、ここは DOM と記憶の更新だけを持つ。
 * @returns {void}
 */
function syncInfiniteOnce() {
	// 自分のモーダルを開いている間 URL は /artworks/{id} で、対象外のページに見える。
	// ここで判断すると継ぎ足したカードごと撤去してしまうので触らない
	// (設定を変えても、閉じたときの handleLocationChange() が必ず追従する)
	if (isViewingOwnWork()) return;
	const wanted = settings?.infiniteScroll ?? INFINITE_SCROLL.OFF;
	// 設定とは切り離し、「どのグリッドを見ているか」はページだけで決める。
	// オフにしただけでは別のグリッドへ移ったことにはならないので、
	// このグリッドについて覚えた基準ページを失わずに済む
	const page = infiniteTargetPage(location.pathname);
	const key = gridKeyOf(page);
	const active = infinite?.isActive() === true;
	const decision = decideInfiniteSync({
		wanted,
		key,
		gridKey: infiniteGridKey,
		attachedKey: infiniteKey,
		active,
		detached: isGridDetached(),
		// 張れていないときだけ DOM を見る。張れているうちは querySelector も走らせない
		listChanged: infiniteKey !== null && !active && hasGridChanged(),
		param: parsePageParam(location.search),
		ownPage: infiniteOwnPage,
		basePage: infiniteBasePage,
	});
	if (decision.changedGrid) {
		// 別のグリッドを見始めた。(対象外のページへ出た場合も含む) 前のグリッドの記憶を捨てる
		infiniteList = null;
		infiniteListImages = -1;
	}
	// 記憶は撤去 (disposeInfinite が ?p= を基準ページへ書き戻す) より先に更新する
	infiniteGridKey = decision.gridKey;
	infiniteBasePage = decision.basePage;
	infiniteOwnPage = decision.ownPage;
	if (decision.action === SYNC_ACTIONS.KEEP || decision.action === SYNC_ACTIONS.RESTORE_PARAM) {
		// 同じグリッドに張ったまま見続けている。設定の変更はモードの差し替えだけで追従する。
		// ここで作り直すと、継ぎ足したカードが消えて読み進めた場所を失う
		infinite?.setMode(wanted);
		// pixiv が ?p= を基準ページへ戻しただけ。(モーダルを閉じた直後等) 今の位置へ書き直す
		if (decision.action === SYNC_ACTIONS.RESTORE_PARAM) syncPageParam();
		return;
	}
	// 対象外のページへ出た / 別のグリッドへ移った / 描き直された / 基準が動いた / オフにされた。
	// 前の ul に張ったものは必ず撤去する
	disposeInfinite();
	if (decision.action === SYNC_ACTIONS.DETACH) return;
	const ul = findGridList(document);
	// グリッドがまだ描かれていない。ここでは組み立てず、現れたときにもう一度呼ばれるのを待つ
	if (!ul) return;
	infiniteKey = key;
	infiniteList = ul;
	try {
		infinite = attachInfiniteScroll(document, {
			ul,
			strings,
			source: createPageSource(page.userId, page.category),
			mode: wanted,
			loggedIn: readSession(document).isLoggedIn,
			// グリッドに並んでいるのは基準ページのぶんだけ。続きはその次から読む
			startPage: infiniteBasePage,
			onPageChange: writePageParam,
		});
		// 雛形が採れない / sentinel を置けないと inactiveHandle が返る。
		// 掴んだのが描き途中の ul だっただけかもしれないので、ul と画像の数を覚えておき、
		// 別の ul が現れるか画像が増えたときだけ試し直す。(hasGridChanged)
		// 基準ページは触らない。まだ 1 件も継ぎ足していないので、グリッドの中身は変わっていない
		if (!infinite.isActive()) infiniteListImages = countGridImages(ul);
	} catch (error) {
		// 継ぎ足せなくても pixiv 標準のページャは残る。閲覧そのものは壊さない。
		// キーと ul は残すので、同じ ul にいる限り作り直しは繰り返さない
		warn('infinite scroll setup failed', error);
		infinite = null;
		infiniteListImages = countGridImages(ul);
	}
}

/**
 * 見えているページに合わせて ?p= を書き換える。
 * 上へ戻れば小さい値も書く。(画面と URL を常に一致させる)
 * 再読み込みや共有で同じ場所へ戻れるようにするための追従なので、履歴は積まない。
 * モーダルが開いている間は書かない。その間 URL は /artworks/{id} で router.js の持ち物。
 * @param {number} page ページ番号
 * @returns {void}
 */
function writePageParam(page) {
	if (viewer?.isOpen()) return;
	const previousOwn = infiniteOwnPage;
	try {
		const url = new URL(location.href);
		// 1 ページ目は pixiv 自身も ?p= を付けない。付けずに揃える
		if (page > 1) url.searchParams.set('p', String(page));
		else url.searchParams.delete('p');
		// 書く前に覚える。replaceState は inject.js のフックを通って同期的に
		// handleLocationChange() を呼び戻すので、後に回すと呼び戻された先で
		// 自分の書き込みを pixiv の書き込みと取り違える
		infiniteOwnPage = page;
		// 既に同じ URL なら書かない。replaceState を呼び過ぎるとブラウザに絞られる
		if (url.href !== location.href) history.replaceState(history.state, '', url);
	} catch (error) {
		// 書けていないので、URL に残っているのは前に自分が書いた値のまま。記憶も戻す
		infiniteOwnPage = previousOwn;
		// URL がずれるだけ。継ぎ足しは続ける
		warn('page param update failed', error);
	}
}

/**
 * SPA の遷移を追う必要があるか。
 * ビュワーが要らなくても、ピックアップ非表示と無限スクロールは
 * ページが変わるたびに当て直しが要る。
 * @returns {boolean} どれかが有効なら true
 */
function needsNavigationWatch() {
	const infiniteOn = (settings?.infiniteScroll ?? INFINITE_SCROLL.OFF) !== INFINITE_SCROLL.OFF;
	return Boolean(settings?.enabled || settings?.hidePickup || infiniteOn);
}

/**
 * URL が変わったかもしれないときの入口。
 * 注入側のイベント・popstate・MutationObserver の 3 経路をここに集約する。
 * @param {{deferInfinite?: boolean}} [options] 無限スクロールの追従を遅らせるか
 *   (注入側のイベントは pixiv の pushState の中で同期に届くので、その経路だけ遅らせる)
 * @returns {void}
 */
function handleLocationChange(options = {}) {
	// 自分のルーターが作品ページへ書き換えた直後もここへ来る。
	// 自分のモーダルの最中なら止めてはいけない。
	// pixiv 本体が作品ページへ遷移したときは apply() へ進み、対象外として止める
	if (isViewingOwnWork()) return;
	syncPickup();
	if (options.deferInfinite) scheduleInfiniteSync();
	else syncInfinite();
	apply();
}

/**
 * SPA の遷移を監視し始める。
 *
 * pixiv は History API でページを切り替える。history のフックは page world の
 * inject.js が持っており (isolated world で包んでもサイト本体の呼び出しは捕まらない)、
 * ここはその通知を受ける側。取りこぼしの保険として MutationObserver も見張る。
 * @returns {void}
 */
function startNavigationWatch() {
	if (navigationWatch) return;
	// 一度 unhook したあと張り直すため。初回は注入側の二重注入ガードで無害に終わる
	window.dispatchEvent(new CustomEvent(NAV_EVENTS.REHOOK));

	observedPath = location.pathname;
	const onNavigate = () => {
		observedPath = location.pathname;
		// pixiv の pushState / replaceState の中で同期に届く。無限スクロールの追従
		// (雛形の採取と sentinel の挿入) だけは React の描画が済むのを待ってから行う
		handleLocationChange({ deferInfinite: true });
	};
	const onPopState = () => {
		observedPath = location.pathname;
		handleLocationChange();
	};
	window.addEventListener(NAV_EVENTS.NAVIGATE, onNavigate);
	window.addEventListener('popstate', onPopState);

	// 保険の経路。無限スクロールで数千回走るので、ここは pathname の比較だけに留める。
	// (グリッドの出現の検出には使わない)
	// タイマが動いている間は何もしないので、再描画が続いても確認は間隔ごとに 1 回で済む
	const observer = new MutationObserver(() => {
		if (checkTimer) return;
		checkTimer = setTimeout(() => {
			checkTimer = 0;
			if (location.pathname !== observedPath) {
				observedPath = location.pathname;
				handleLocationChange();
				return;
			}
			// URL は変わっていないが、ページを直接開いたときは content script のほうが
			// React の描画より早く、継ぎ足す先の ul がここで初めて現れる。
			// この経路が無いと、直接開いたページで無限スクロールが始まらない。
			// (URL が変わらないので handleLocationChange() が来ない)
			// グリッドを描き直されて張り先が外れたときも、ここで張り直す。
			// 張れているうちは何もしないので、費用は間隔ごとに判定 1 回で済む
			if (!infinite?.isActive() || isGridDetached()) syncInfinite();
		}, LOCATION_CHECK_DELAY_MS);
	});
	observer.observe(document.body, { childList: true, subtree: true });

	// この購読は stop() では外さない。外すと対象外のページへ出たあと戻ってこられない。
	// 解除するのは設定が enabled: false になったときだけ
	navigationWatch = {
		dispose() {
			window.removeEventListener(NAV_EVENTS.NAVIGATE, onNavigate);
			window.removeEventListener('popstate', onPopState);
			observer.disconnect();
			clearTimeout(checkTimer);
			checkTimer = 0;
			clearTimeout(infiniteSyncTimer);
			infiniteSyncTimer = 0;
		},
	};
}

/**
 * SPA の遷移の監視をやめる。注入側のフックも外して pixiv 標準の動作へ戻す。
 * @returns {void}
 */
function stopNavigationWatch() {
	// 監視を外すと、この先どうなっても追従できなくなる。先に後始末を済ませる。
	// モーダルを開いたまま全部オフにされた場合、syncInfinite() はモーダル中のガードで
	// 素通りするので、ここで解体しないと継ぎ足したカードがページに残ってしまう。
	// グリッドについての記憶は残す。監視していない間に描き直されても、
	// 最後に見た ul が外れていることで次に張るときに気付ける
	disposeInfinite();
	if (!navigationWatch) return;
	navigationWatch.dispose();
	navigationWatch = null;
	window.dispatchEvent(new CustomEvent(NAV_EVENTS.UNHOOK));
}

/**
 * 設定を読んでから監視を始める。
 *
 * startNavigationWatch() を apply() より先に呼ぶ順序には意味がある。
 * popstate は登録順に配られるので、こちらの購読が router.js の購読より先になる。
 * そのおかげで、対象外のページへ戻ったときに stop() が router を捨ててから
 * handlePopState が走ることはない。逆順にすると、捨てたはずの viewer を触りにいく。
 * @returns {Promise<void>}
 */
async function boot() {
	const pageLanguage = readPageLanguage(document);
	strings = createStrings(uiLanguage(pageLanguage));
	// popup は pixiv のページを持たないので、見た言語をここで残す。失敗しても先へ進む
	void savePageLanguage(strings.lang);
	settings = await loadSettings();
	// ビュワーの入切とは独立して効かせる。ピックアップ非表示や無限スクロールだけを使う人もいる
	pickupHider = attachPickupHider(document);
	syncPickup();
	// この時点ではグリッドがまだ無いのが普通。張れなければ遷移監視の経路で張り直す
	syncInfinite();
	if (!needsNavigationWatch()) return;
	startNavigationWatch();
	if (settings.enabled) apply();
}

watchSettings((next) => {
	settings = next;
	viewer?.setSettings(next);
	tabSkip?.setMode(next.gridTabSkip);
	syncPickup();
	// ビュワーを切っても無限スクロールは切らない。設定そのものが変わったときだけ追従する
	syncInfinite();
	if (!next.enabled) {
		// 作品を開いたまま切ると URL が /artworks/{id} に残る。先に履歴を戻して pixiv 本体に任せる
		if (viewer?.isOpen()) router?.close();
		stop();
	}
	// 遷移の監視はビュワー・ピックアップ非表示・無限スクロールの全部が要らなくなったときだけ外す。
	// apply() より先に張るのは popstate の配布順のため (boot の説明を参照)
	if (needsNavigationWatch()) startNavigationWatch();
	else stopNavigationWatch();
	if (next.enabled) apply();
});
void boot();
