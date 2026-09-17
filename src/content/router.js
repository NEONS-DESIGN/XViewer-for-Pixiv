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
import { artworkPath } from '../pixiv/endpoints.js';

/** 自分が積んだ履歴だと分かるようにする目印。 */
const HISTORY_STATE_KEY = 'xviewer';

/**
 * 今の履歴エントリが自分の積んだものか。
 * pixiv 本体が作品ページへ遷移したときも URL は /artworks/{id} になるので、
 * URL の形だけでは「自分のモーダルが開いている」と区別できない。state の目印で見分ける。
 * @param {{history: {state: unknown}}} [win] テスト用の window
 * @returns {boolean} 自分が積んだエントリなら true
 */
export function isOwnHistoryEntry(win = window) {
	const state = win.history.state;
	return typeof state === 'object' && state !== null && state[HISTORY_STATE_KEY] === true;
}

/**
 * @typedef {object} Router
 * @property {(workId: string) => void} open 履歴を積んで作品を開く
 * @property {(workId: string) => void} replace 履歴を積まずに作品を差し替える
 * @property {() => void} close 履歴を 1 つ戻す
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
	/**
	 * history.back() を出してから popstate が届くまでの間か。
	 * back() は非同期なので、その間に閉じる操作が重なると履歴を 2 つ戻って
	 * ユーザーページより前へ出てしまう。1 回目だけ通す
	 */
	let closing = false;
	const listener = () => {
		closing = false;
		onPopState(parseArtworkPath(win.location.pathname));
	};
	win.addEventListener('popstate', listener);

	return {
		open(workId) {
			closing = false;
			win.history.pushState({ [HISTORY_STATE_KEY]: true }, '', artworkPath(workId));
		},
		replace(workId) {
			win.history.replaceState({ [HISTORY_STATE_KEY]: true }, '', artworkPath(workId));
		},
		close() {
			if (closing) return;
			closing = true;
			win.history.back();
		},
		dispose() {
			win.removeEventListener('popstate', listener);
		},
	};
}
