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

/** 今の購読。ページから離れるときに解除する。 */
let gridListener = null;
let router = null;
let settings = null;
let viewer = null;

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
 * SPA の遷移を監視する。
 * pixiv は History API でページを切り替えるため、pushState と replaceState を包んで
 * 自前のイベントに変換する。これをしないと最初の 1 ページでしか動かない。
 * @returns {void}
 */
function watchNavigation() {
	const EVENT_NAME = 'pixivmaster:navigate';
	for (const method of ['pushState', 'replaceState']) {
		const original = history[method];
		history[method] = function patched(...args) {
			const result = original.apply(this, args);
			window.dispatchEvent(new Event(EVENT_NAME));
			return result;
		};
	}
	const onNavigate = () => {
		// 自分のルーターが作品ページへ書き換えた直後もここへ来る。
		// 作品パスは「ビュワーで作品を開いている最中」なので、止めてはいけない
		if (parseArtworkPath(location.pathname)) return;
		if (isViewerTarget(location.pathname)) {
			void start();
		} else {
			stop();
		}
	};
	window.addEventListener(EVENT_NAME, onNavigate);
	window.addEventListener('popstate', onNavigate);
}

watchNavigation();
watchSettings((next) => {
	settings = next;
	viewer?.setSettings(next);
	if (!next.enabled) stop();
	else void start();
});
void start();
