/**
 * モーダルの開閉と履歴を同期させる。
 *
 * 作品を開くときだけ履歴を積み、作品間の移動では積まない。
 * 積むと 30 作品見たあとグリッドへ戻るのに 30 回戻ることになるため。
 * 閉じる操作 (Esc・背景クリック・戻るボタン) はすべて history.back() に集約する。
 *
 * 履歴方式は Task 2 の検証結果に従う。pixiv 本体のルーターと衝突する場合は
 * このモジュールだけをハッシュ方式へ差し替える。
 */
import { parseArtworkPath } from './page.js';

/** 自分が積んだ履歴だと分かるようにする目印。 */
const HISTORY_STATE_KEY = 'pixivmaster';

/**
 * 作品 ID から URL を作る。
 * @param {string} workId 作品 ID
 * @returns {string} パス
 */
function pathFor(workId) {
	return `/artworks/${workId}`;
}

/**
 * @typedef {object} Router
 * @property {(workId: string) => void} open 履歴を積んで作品を開く
 * @property {(workId: string) => void} replace 履歴を積まずに作品を差し替える
 * @property {() => void} close 履歴を 1 つ戻す
 * @property {() => string|null} currentWorkId 今の URL が指す作品 ID
 * @property {() => void} dispose 購読を解除する
 */

/**
 * ルーターを作る。
 * @param {(workId: string|null) => void} onPopState 戻る/進むで URL が変わったときに呼ばれる
 * @param {{window?: object}} [deps] テスト用の依存
 * @returns {Router} ルーター
 */
export function createRouter(onPopState, deps = {}) {
	const win = deps.window ?? window;
	const listener = () => { onPopState(parseArtworkPath(win.location.pathname)); };
	win.addEventListener('popstate', listener);

	return {
		open(workId) {
			win.history.pushState({ [HISTORY_STATE_KEY]: true }, '', pathFor(workId));
		},
		replace(workId) {
			win.history.replaceState({ [HISTORY_STATE_KEY]: true }, '', pathFor(workId));
		},
		close() {
			win.history.back();
		},
		currentWorkId() {
			return parseArtworkPath(win.location.pathname);
		},
		dispose() {
			win.removeEventListener('popstate', listener);
		},
	};
}
