/**
 * content script のエントリ。
 * pixiv は SPA なので、URL が変わるたびに対象ページかどうかを判定し直す。
 */
import { isViewerTarget, parseArtworkPath, parseUserPage } from './page.js';
import { createRouter } from './router.js';
import { attachGridListener, collectWorkIds } from './grid.js';
import { createViewer } from './viewer/viewer.js';
import { createDomSequence, extendWithAllWorks } from './sequence.js';
import { loadSettings, watchSettings } from '../common/storage.js';
import { NAV_EVENTS, LOCATION_CHECK_DELAY_MS } from '../common/constants.js';

/** 今の購読。ページから離れるときに解除する。 */
let gridListener = null;
let router = null;
let settings = null;
let viewer = null;
/** @type {{dispose: () => void}|null} 遷移監視の購読。設定でオフにしたら外す */
let navigationWatch = null;
/** MutationObserver 経路で前回見たパス。変わっていなければ何もしない */
let observedPath = null;
/** パス確認の遅延タイマ ID。0 なら動いていない */
let checkTimer = 0;

/**
 * 作品が開かれたときの処理。
 * @param {string} workId 作品 ID
 * @returns {void}
 */
function handleOpen(workId) {
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
		return;
	}
	// 既に開いている作品なら描き直さない (作品移動で replaceState した直後など)
	if (!viewer.isOpen()) {
		void viewer.open(workId, createDomSequence(collectWorkIds(document, location.origin)));
	}
}

/**
 * 起動する。
 * @returns {Promise<void>}
 */
async function start() {
	settings = await loadSettings();
	if (!settings.enabled) return;
	if (!isViewerTarget(location.pathname)) return;
	if (gridListener) return;

	router = createRouter(handlePopState);
	const page = parseUserPage(location.pathname);
	viewer = createViewer({
		doc: document,
		settings,
		// 閉じたい合図は履歴を戻すことに集約する。実際に閉じるのは popstate 側
		onRequestClose: () => router.close(),
		// 作品を切り替えたら URL だけ差し替える。履歴は積まない
		onNavigate: (workId) => router.replace(workId),
		// タグ絞り込み中は profile/all と並びが一致しないので広げない
		canExtendSequence: () => Boolean(page) && !page.isTagFiltered,
		extendSequence: (current) => extendWithAllWorks(current, page.userId),
	});
	gridListener = attachGridListener(document, handleOpen);
	console.log('[PixivMaster] ready on', location.pathname);
}

/**
 * 止める。
 * @returns {void}
 */
function stop() {
	gridListener?.dispose();
	gridListener = null;
	router?.dispose();
	router = null;
	viewer?.dispose();
	viewer = null;
}

/**
 * URL が変わったかもしれないときの入口。
 * 注入側のイベント・popstate・MutationObserver の 3 経路をここに集約する。
 * @returns {void}
 */
function handleLocationChange() {
	// 自分のルーターが作品ページへ書き換えた直後もここへ来る。
	// 作品パスは「ビュワーで作品を開いている最中」なので、止めてはいけない
	if (parseArtworkPath(location.pathname)) return;
	if (isViewerTarget(location.pathname)) {
		void start();
	} else {
		stop();
	}
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
		handleLocationChange();
	};
	window.addEventListener(NAV_EVENTS.NAVIGATE, onNavigate);
	window.addEventListener('popstate', onNavigate);

	// 保険の経路。ここは「パスが変わったか」を見るだけの安い処理に留める。
	// タイマが動いている間は何もしないので、再描画が続いても確認は間隔ごとに 1 回で済む
	const observer = new MutationObserver(() => {
		if (checkTimer) return;
		checkTimer = setTimeout(() => {
			checkTimer = 0;
			if (location.pathname === observedPath) return;
			observedPath = location.pathname;
			handleLocationChange();
		}, LOCATION_CHECK_DELAY_MS);
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });

	navigationWatch = {
		dispose() {
			window.removeEventListener(NAV_EVENTS.NAVIGATE, onNavigate);
			window.removeEventListener('popstate', onNavigate);
			observer.disconnect();
			clearTimeout(checkTimer);
			checkTimer = 0;
		},
	};
}

/**
 * SPA の遷移の監視をやめる。注入側のフックも外して pixiv 標準の動作へ戻す。
 * @returns {void}
 */
function stopNavigationWatch() {
	if (!navigationWatch) return;
	navigationWatch.dispose();
	navigationWatch = null;
	window.dispatchEvent(new CustomEvent(NAV_EVENTS.UNHOOK));
}

/**
 * 設定を読んでから監視を始める。
 * @returns {Promise<void>}
 */
async function boot() {
	settings = await loadSettings();
	if (!settings.enabled) return;
	startNavigationWatch();
	await start();
}

watchSettings((next) => {
	settings = next;
	viewer?.setSettings(next);
	if (next.enabled) {
		startNavigationWatch();
		void start();
	} else {
		stop();
		stopNavigationWatch();
	}
});
void boot();
