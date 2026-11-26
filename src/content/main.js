/**
 * content script のエントリ。
 * pixiv は SPA なので、URL が変わるたびに対象ページかどうかを判定し直す。
 */
import {
	isViewerTarget,
	pageKind,
	isProfileHome,
	parseArtworkPath,
	parseUserPage,
	pageKey,
} from './page.js';
import { createRouter, createEntryTracker } from './router.js';
import { attachGridListener, collectWorkIds, collectGroupIds } from './grid.js';
import { attachTabSkip } from './tab-skip.js';
import { ensureFocusStyle } from './grid-focus.js';
import { attachPickupHider } from './pickup.js';
import { createInfiniteController, infiniteModeOf } from './infinite-controller.js';
import { readSession } from './session.js';
import { createViewer } from './viewer/viewer.js';
import { createSequence, extendWithAllWorks } from './sequence.js';
import { loadSettings, watchSettings } from '../common/storage.js';
import { info } from '../common/log.js';
import { runWhenIdle } from '../common/idle.js';
import {
	NAV_EVENTS,
	LOCATION_CHECK_DELAY_MS,
	INFINITE_SCROLL,
	SESSION_WARMUP_TIMEOUT_MS,
	PAGE_KINDS,
	GRID_TAB_SKIP,
} from '../common/constants.js';
import { readPageLanguage, uiLanguage } from '../common/language.js';
import { rememberPageLanguage } from '../common/language-store.js';
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
let router = null;
/**
 * 今の履歴エントリが自分のモーダル用に積んだものか。history.state を読まずに追う。
 * ルーターは作り直すが、これはページの寿命と同じだけ生かす。
 * popstate の購読を boot() の遷移監視より先に張るため、読み込んだ時点で作る
 */
const historyEntry = createEntryTracker(window);
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
/** 今組み立てているページの種類 (PAGE_KINDS)。組み立てていなければ null */
let activeKind = null;
/**
 * 最後に作品を開いたときの並び。進むで自分のモーダルへ戻ったときに使い直す。
 * ホームと検索では押したカードの欄から並びを作るので、URL からは作り直せない
 * @type {string[]|null}
 */
let lastOpenedIds = null;
/** @type {{dispose: () => void}|null} 遷移監視の購読。設定でオフにしたら外す */
let navigationWatch = null;
/** MutationObserver 経路で前回見たパス。変わっていなければ何もしない */
let observedPath = null;
/** パス確認の遅延タイマ ID。0 なら動いていない */
let checkTimer = 0;
/** 遷移通知から、グリッドへの追従 (Tab 移動と無限スクロール) までの遅延タイマ ID。0 なら動いていない */
let deferredSyncTimer = 0;
/**
 * グリッドの無限スクロールの追従。ビュワーの入切とは独立に効くので stop() では触らない。
 * 設定・文言・ビュワーは呼ばれた時点の値を読む
 */
const infinite = createInfiniteController({
	doc: document,
	win: window,
	getSettings: () => settings,
	getStrings: () => strings,
	isViewingOwnWork,
	isViewerOpen: () => viewer?.isOpen() === true,
});

/**
 * 作品が開かれたときの処理。
 * @param {string} workId 作品 ID
 * @param {{link?: Element, startPage?: number}} [opened] 押されたリンクと、リンクが指すページ (0 始まり)
 * @returns {void}
 */
function handleOpen(workId, opened = {}) {
	// タブ (イラスト / 漫画) の切り替えはページの組み直しを伴わないので、開くたびに読み直す
	rememberPage(location.pathname);
	// ユーザーページは作品グリッドの並び (端で全作品へ広げる)。ホームと検索は押したカードの欄の中だけ
	const ids = activeKind === PAGE_KINDS.USER || !opened.link
		? collectWorkIds(document, location.origin)
		: collectGroupIds(opened.link, location.origin);
	lastOpenedIds = ids;
	router.open(workId);
	void viewer.open(workId, createSequence(ids), { startPage: opened.startPage ?? 0 });
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
		infinite.restoreParam();
		return;
	}
	// 既に開いている作品なら描き直さない (作品移動で replaceState した直後など)
	if (!viewer.isOpen()) {
		void viewer.open(workId, createSequence(lastOpenedIds ?? collectWorkIds(document, location.origin)));
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
 * 履歴の state に付けた目印で見分ける。(state そのものは読まず、router.js が追った結果を使う)
 * @returns {boolean} 自分のモーダル用の履歴エントリなら true
 */
function isViewingOwnWork() {
	return parseArtworkPath(location.pathname) !== null && historyEntry.isOwn();
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
	if (!isViewerTarget(path, settings)) {
		stop();
		return;
	}
	// 同じ作者・同じ絞り込みのままなら作り直す必要はない
	const key = pageKey(path);
	if (activeKey === key) return;

	// 別のページへ移った。古い購読を捨ててから組み立て直す
	stop();
	activeKey = key;
	activeKind = pageKind(path);
	// ユーザーページ以外では前に見ていた作者を持ち越さない。(端で別人の全作品へ広げてしまう)
	currentPage = parseUserPage(path);
	lastOpenedIds = null;

	router = createRouter(handlePopState, { entry: historyEntry });
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
		extendSequence: (current) => extendWithAllWorks(current, currentPage.userId, currentPage.category, strings.lang),
	});
	gridListener = attachGridListener(document, handleOpen, {
		// 押し始めの時点で作品詳細の取得を進める。離した先が同じ作品なら通信を待たずに描ける
		onPress: (id) => viewer?.prefetchOnPress(id),
		onPressCancel: () => viewer?.cancelPressPrefetch(),
	});
	syncFocusStyle();
	info('ready on', path);
}

/**
 * 止める。
 * @returns {void}
 */
function stop() {
	activeKey = null;
	activeKind = null;
	gridListener?.dispose();
	gridListener = null;
	router?.dispose();
	router = null;
	viewer?.dispose();
	viewer = null;
	syncFocusStyle();
}

/**
 * グリッドの Tab 移動 (フォーカス順の組み替え) を、今の設定と URL に合わせる。
 * ビュワーの入切とは独立して効かせる。(作品を開かずに Tab で作品を渡り歩く使い方もある)
 * 外すもの (gridTabSkip) を選んでいて、作品グリッドのあるページ (ユーザー / ホーム / 検索) にいるときだけ張る。
 * 外したフォーカス順は dispose() が必ず戻す。(戻さないと pixiv 標準の Tab が壊れたままになる)
 * @returns {void}
 */
function syncTabSkip() {
	// 自分のモーダルの最中は URL が作品ページなので、ページの判定で外してはいけない。外す種類だけを合わせる
	if (isViewingOwnWork()) {
		tabSkip?.setMode(settings.gridTabSkip);
		return;
	}
	const active = Boolean(settings) && settings.gridTabSkip !== GRID_TAB_SKIP.NONE && pageKind(location.pathname) !== null;
	if (!active) {
		tabSkip?.dispose();
		tabSkip = null;
	} else if (tabSkip) {
		tabSkip.setMode(settings.gridTabSkip);
	} else {
		tabSkip = attachTabSkip(document, settings.gridTabSkip);
	}
	syncFocusStyle();
}

/**
 * グリッドのフォーカス枠の CSS を出し入れする。どこにフォーカスがあるか分かるようにするもので、
 * ビュワーを組み立てているときと、グリッドの Tab 移動を張っているときに出す。
 * @returns {void}
 */
function syncFocusStyle() {
	const wanted = activeKey !== null || tabSkip !== null;
	if (wanted && !focusStyle) focusStyle = ensureFocusStyle(document);
	if (!wanted && focusStyle) {
		focusStyle.dispose();
		focusStyle = null;
	}
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
 * 遷移の通知を受けてから、少し待ってグリッドへの追従 (Tab 移動と無限スクロール) を合わせる。
 * 通知の時点では React がまだ前のページを描いているので、描き替わるのを待つ。
 * (前のページの DOM を全部たどって当てても、新しいページには効かない)
 * 待っている間に届いた通知は 1 回にまとめる。(最初の通知から LOCATION_CHECK_DELAY_MS 後に走る)
 * @returns {void}
 */
function scheduleGridSync() {
	if (deferredSyncTimer) return;
	deferredSyncTimer = setTimeout(() => {
		deferredSyncTimer = 0;
		syncTabSkip();
		infinite.sync();
	}, LOCATION_CHECK_DELAY_MS);
}

/**
 * SPA の遷移を追う必要があるか。
 * ビュワーが要らなくても、ピックアップ非表示と無限スクロールは
 * ページが変わるたびに当て直しが要る。
 * @returns {boolean} どれかが有効なら true
 */
function needsNavigationWatch() {
	const infiniteOn = infiniteModeOf(settings) !== INFINITE_SCROLL.OFF;
	const tabSkipOn = (settings?.gridTabSkip ?? GRID_TAB_SKIP.NONE) !== GRID_TAB_SKIP.NONE;
	return Boolean(settings?.enabled || settings?.hidePickup || infiniteOn || tabSkipOn);
}

/**
 * URL が変わったかもしれないときの入口。
 * 注入側のイベント・popstate・MutationObserver の 3 経路をここに集約する。
 * @param {{deferGrid?: boolean}} [options] グリッドへの追従 (Tab 移動と無限スクロール) を遅らせるか
 *   (注入側のイベントと popstate は React の描画より先に届くので、その 2 経路は遅らせる)
 * @returns {void}
 */
function handleLocationChange(options = {}) {
	// 自分のルーターが作品ページへ書き換えた直後もここへ来る。
	// 自分のモーダルの最中なら止めてはいけない。
	// pixiv 本体が作品ページへ遷移したときは apply() へ進み、対象外として止める
	if (isViewingOwnWork()) return;
	syncPickup();
	if (options.deferGrid) {
		scheduleGridSync();
	} else {
		syncTabSkip();
		infinite.sync();
	}
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
		// pixiv の pushState / replaceState の中で同期に届く。グリッドへの追従
		// (Tab 移動の全走査、雛形の採取と sentinel の挿入) は React の描画が済むのを待ってから行う
		handleLocationChange({ deferGrid: true });
	};
	const onPopState = () => {
		observedPath = location.pathname;
		// この時点の DOM は戻る前のページのまま。グリッドへの追従は描き替わるのを待つ
		handleLocationChange({ deferGrid: true });
	};
	window.addEventListener(NAV_EVENTS.NAVIGATE, onNavigate);
	window.addEventListener('popstate', onPopState);

	// 保険の経路。無限スクロールで数千回走るので、pathname の比較と
	// 無限スクロールの張り先の確認だけに留める。
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
			// 遷移の通知から遅らせた追従が控えている間は合わせない。(前のページの ul に張ってしまう)
			// 無限スクロールを使っていなければ、URL が変わらない限り合わせ直すものは無い
			if (deferredSyncTimer || infinite.isIdle()) return;
			// 直接開いたページで ul が現れたときと、描き直されて張り先が外れたときに張る。
			// 張れているうちは何もしないので、費用は間隔ごとに判定 1 回で済む
			if (infinite.needsCheck()) infinite.sync();
		}, LOCATION_CHECK_DELAY_MS);
	});
	observer.observe(document.body, { childList: true, subtree: true });

	// この購読は stop() では外さない。外すと対象外のページへ出たあと戻ってこられない。
	// 解除するのは needsNavigationWatch() が false になったときだけ
	navigationWatch = {
		dispose() {
			window.removeEventListener(NAV_EVENTS.NAVIGATE, onNavigate);
			window.removeEventListener('popstate', onPopState);
			observer.disconnect();
			clearTimeout(checkTimer);
			checkTimer = 0;
			clearTimeout(deferredSyncTimer);
			deferredSyncTimer = 0;
		},
	};
}

/**
 * SPA の遷移の監視をやめる。注入側のフックも外して pixiv 標準の動作へ戻す。
 * @returns {void}
 */
function stopNavigationWatch() {
	// 監視を外すと、この先どうなっても追従できなくなる。先に後始末を済ませる。
	// モーダルを開いたまま全部オフにされた場合は、一覧へ戻ってから撤去する。(作品ページの URL では ?p= を書き戻せない)
	// 待つ間に監視を張り直されたら、継ぎ足しはそちらが引き継ぐ
	infinite.disposeAfterClose(() => navigationWatch !== null);
	if (!navigationWatch) return;
	navigationWatch.dispose();
	navigationWatch = null;
	window.dispatchEvent(new CustomEvent(NAV_EVENTS.UNHOOK));
}

/**
 * 設定を読んでから監視を始める。
 * startNavigationWatch() は apply() より先に呼ぶ。(popstate の購読を router.js より先に張る。逆順にすると捨てた viewer を触る)
 * @returns {Promise<void>}
 */
async function boot() {
	const pageLanguage = readPageLanguage(document);
	strings = createStrings(uiLanguage(pageLanguage));
	// popup は pixiv のページを持たないので、見た言語をここで残す。失敗しても先へ進む。
	// 残すのは uiLanguage() で解決した後の UI 言語 (strings.lang) で、生の表示言語 (pageLanguage) ではない
	void rememberPageLanguage(strings.lang);
	settings = await loadSettings();
	// ビュワーの入切とは独立して効かせる。ピックアップ非表示や無限スクロールだけを使う人もいる
	pickupHider = attachPickupHider(document);
	syncPickup();
	syncTabSkip();
	// この時点ではグリッドがまだ無いのが普通。張れなければ遷移監視の経路で張り直す
	infinite.sync();
	if (needsNavigationWatch()) {
		startNavigationWatch();
		if (settings.enabled) apply();
	}
	// 最初に作品を開いたときの解析を先に済ませておく。失敗しても開くときに読み直す
	if (settings.enabled) runWhenIdle(() => { try { readSession(document); } catch { /* 開くときに読み直す */ } }, { timeoutMs: SESSION_WARMUP_TIMEOUT_MS });
	// 設定の購読は起動が済んでから。先に購読すると、loadSettings() を待つ間に届いた変更が
	// pickupHider の無い状態で syncPickup() を走らせ、遷移監視を boot より先に張る
	watchSettings(handleSettingsChange);
}

/**
 * popup で設定が変わったときの処理。
 * @param {object} next 新しい設定 (normalizeSettings 済み)
 * @returns {void}
 */
function handleSettingsChange(next) {
	settings = next;
	viewer?.setSettings(next);
	syncTabSkip();
	syncPickup();
	// ビュワーを切っても無限スクロールは切らない。設定そのものが変わったときだけ追従する
	infinite.sync();
	if (!next.enabled) {
		// 作品を開いたまま切ると URL が /artworks/{id} に残る。先に履歴を戻して pixiv 本体に任せる
		if (viewer?.isOpen()) router?.close();
		stop();
	}
	// 遷移の監視はビュワー・ピックアップ非表示・無限スクロールの全部が要らなくなったときだけ外す。
	// apply() より先に張る。(popstate は登録順に配られ、router.js の購読より先に動く必要がある)
	if (needsNavigationWatch()) startNavigationWatch();
	else stopNavigationWatch();
	if (next.enabled) apply();
}

void boot();
