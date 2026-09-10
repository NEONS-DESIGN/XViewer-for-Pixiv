/**
 * content script のエントリ。
 * pixiv は SPA なので、URL が変わるたびに対象ページかどうかを判定し直す。
 */
import { isViewerTarget } from './page.js';
import { createRouter } from './router.js';
import { attachGridListener, collectWorkIds } from './grid.js';
import { loadSettings, watchSettings } from '../common/storage.js';

/** 今の購読。ページから離れるときに解除する。 */
let gridListener = null;
let router = null;
let settings = null;

/**
 * 作品が開かれたときの処理。Task 15 でモーダルに差し替える。
 * @param {string} workId 作品 ID
 * @returns {void}
 */
function handleOpen(workId) {
	const ids = collectWorkIds(document, location.origin);
	console.log('[PixivMaster] open', workId, 'ids in grid:', ids.length);
	router.open(workId);
}

/**
 * 戻る/進むで URL が変わったときの処理。
 * @param {string|null} workId 今の URL が指す作品 ID
 * @returns {void}
 */
function handlePopState(workId) {
	console.log('[PixivMaster] popstate ->', workId);
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
	if (!next.enabled) stop();
	else void start();
});
void start();
