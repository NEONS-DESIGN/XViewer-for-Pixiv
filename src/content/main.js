/**
 * content script のエントリ。
 * pixiv は SPA なので、URL が変わるたびに対象ページかどうかを判定し直す。
 */
import { isViewerTarget, parseArtworkPath, parseUserPage, pageKey } from './page.js';
import { createRouter } from './router.js';
import { attachGridListener, collectWorkIds } from './grid.js';
import { attachTabSkip } from './tab-skip.js';
import { createViewer } from './viewer/viewer.js';
import { createDomSequence, extendWithAllWorks } from './sequence.js';
import { loadSettings, watchSettings } from '../common/storage.js';
import { NAV_EVENTS, LOCATION_CHECK_DELAY_MS } from '../common/constants.js';

/** 今の購読。ページから離れるときに解除する。 */
let gridListener = null;
/** @type {{setMode: (mode: string) => void, dispose: () => void}|null} グリッドのフォーカス順の組み替え */
let tabSkip = null;
let router = null;
let settings = null;
let viewer = null;
/** 今購読しているページのキー。未起動なら null */
let activeKey = null;
/** apply() の世代。await をまたいで古い要求を捨てるために使う */
let startToken = 0;
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
 * 今の URL に合わせて購読を組み直す。
 *
 * 起動と停止とページ切り替えを 1 か所で扱う。ページが変わったら必ず作り直すのが要点で、
 * 同じ購読を使い回すと page (userId やタグ絞り込みの有無) が初回の値で固定され、
 * グリッドの端で別人の作品一覧へ飛んでしまう。
 * 再入は単調増加のトークンで捌く。await の後に自分が最新でなければ何もしない。
 * @returns {Promise<void>}
 */
async function apply() {
	const token = ++startToken;
	const path = location.pathname;

	// 設定は watchSettings が更新し続けるので、まだ読んでいないときだけ読む
	if (!settings) {
		settings = await loadSettings();
		// 待っている間に新しい要求が来ていたらこの回は捨てる
		if (token !== startToken) return;
	}

	if (!settings.enabled || !isViewerTarget(path)) {
		stop();
		return;
	}
	// 同じ作者・同じ絞り込みのままなら作り直す必要はない
	const key = pageKey(path);
	if (activeKey === key) return;

	// 別のページへ移った。古い購読を捨ててから組み立て直す
	stop();
	activeKey = key;

	router = createRouter(handlePopState);
	// page はこのパスから取り直す。下の 2 つのコールバックが掴むのは常に今のページ
	const page = parseUserPage(path);
	viewer = createViewer({
		doc: document,
		settings,
		// 閉じたい合図は履歴を戻すことに集約する。実際に閉じるのは popstate 側
		onRequestClose: () => router.close(),
		// 作品を切り替えたら URL だけ差し替える。履歴は積まない
		onNavigate: (workId) => router.replace(workId),
		// その人自身の作品グリッドでだけ広げる。
		// ブックマークやフォロー中に並んでいるのは他人の作品なので、
		// 「この作者の全作品」へ広げると画面と無関係な作品へ飛んでしまう。
		// タグ絞り込み中も profile/all と並びが一致しないので広げない
		canExtendSequence: () => Boolean(page) && page.isWorksGrid && !page.isTagFiltered,
		extendSequence: (current) => extendWithAllWorks(current, page.userId),
	});
	gridListener = attachGridListener(document, handleOpen);
	// カード 1 枚につき 3 回 Tab を押さずに済むよう、作品を開く導線以外をフォーカス順から外す
	tabSkip = attachTabSkip(document, settings.gridTabSkip);
	console.log('[PixivMaster] ready on', path);
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
	void apply();
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

	// 保険の経路。無限スクロールで数千回走るので、ここは pathname の比較だけに留める
	// (グリッドの出現の検出には使わない)。
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
	observer.observe(document.body, { childList: true, subtree: true });

	// この購読は stop() では外さない。外すと対象外のページへ出たあと戻ってこられない。
	// 解除するのは設定が enabled: false になったときだけ
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
 *
 * startNavigationWatch() を apply() より先に呼ぶ順序には意味がある。
 * popstate は登録順に配られるので、こちらの購読が router.js の購読より先になる。
 * そのおかげで、対象外のページへ戻ったときに stop() が router を捨ててから
 * handlePopState が走ることはない。逆順にすると、捨てたはずの viewer を触りにいく。
 * @returns {Promise<void>}
 */
async function boot() {
	settings = await loadSettings();
	if (!settings.enabled) return;
	startNavigationWatch();
	await apply();
}

watchSettings((next) => {
	settings = next;
	viewer?.setSettings(next);
	tabSkip?.setMode(next.gridTabSkip);
	if (next.enabled) {
		startNavigationWatch();
		void apply();
	} else {
		stop();
		stopNavigationWatch();
	}
});
void boot();
