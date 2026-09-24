/**
 * モーダルの開閉と履歴を同期させる。
 *
 * 作品を開くときだけ履歴を積み、作品間の移動では積まない。
 * 積むと 30 作品見たあとグリッドへ戻るのに 30 回戻ることになるため。
 * 閉じる操作 (Esc・背景クリック・戻るボタン) はすべて history.back() に集約する。
 *
 * 履歴方式 (pushState + state の目印) を採る。pixiv 本体のルーターと衝突する場合は
 * このモジュールだけをハッシュ方式へ差し替える。
 *
 * **isolated world では history.state を読まない。** Chrome は history.state の値を world ごとに
 * 覚えていて、別の world (pixiv 本体) が先に読むと古い値を返す。(SITE_SPEC §8)
 * 自分の目印が付いたエントリかどうかは、読む代わりに自分で覚えておく。(createEntryTracker)
 */
import { parseArtworkPath } from './page.js';
import { currentLocalePrefix } from '../common/locale.js';
import { NAV_EVENTS } from '../common/constants.js';
import { artworkPath } from '../pixiv/endpoints.js';

/** 自分が積んだ履歴だと分かるようにする目印。 */
const HISTORY_STATE_KEY = 'xviewer';

/**
 * 履歴の state が自分の目印付きか。
 * @param {unknown} state popstate の event.state など
 * @returns {boolean} 自分が積んだ state なら true
 */
function isOwnState(state) {
	return typeof state === 'object' && state !== null && state[HISTORY_STATE_KEY] === true;
}

/**
 * @typedef {object} EntryTracker
 * @property {() => boolean} isOwn 今の履歴エントリが自分の積んだものか
 * @property {() => void} markOwn 自分が積んだ / 差し替えたことを覚える (router.js が呼ぶ)
 * @property {() => void} dispose 購読を解除する
 */

/**
 * 今の履歴エントリが自分の積んだものかを覚えておく。
 * pixiv 本体が作品ページへ遷移したときも URL は /artworks/{id} になるので、
 * URL の形だけでは「自分のモーダルが開いている」と区別できない。
 *
 * history.state を読めば分かるが、isolated world では古い値が返ることがあるので読まない。
 * 代わりに次の 3 つで追う。
 * - 自分が pushState / replaceState したら「自分のもの」(markOwn)
 * - 戻る / 進むでは popstate の event.state で判定し直す (event.state は正しい値が届く)
 * - pixiv 本体が pushState / replaceState したら (注入側の通知) 「自分のものではない」
 *
 * popstate の購読は main.js の購読より先に張る必要がある。(同じ popstate の中で判定を使うため)
 * @param {object} [win] テスト用の window
 * @returns {EntryTracker} 判定
 */
export function createEntryTracker(win = window) {
	let own = false;
	const onPopState = (event) => {
		own = isOwnState(event?.state);
	};
	const onForeignNavigate = () => {
		own = false;
	};
	win.addEventListener('popstate', onPopState);
	win.addEventListener(NAV_EVENTS.NAVIGATE, onForeignNavigate);
	return {
		isOwn: () => own,
		markOwn() {
			own = true;
		},
		dispose() {
			win.removeEventListener('popstate', onPopState);
			win.removeEventListener(NAV_EVENTS.NAVIGATE, onForeignNavigate);
		},
	};
}

/**
 * 今の履歴 state を保ったまま URL だけ差し替える。書き換えは注入側 (page world) に任せる。
 * isolated world で history.state を読んで書き戻すと、古い値で Next.js の state を
 * 上書きしてしまうため。(SITE_SPEC §8) イベントは同期に配られるので、戻った時点で書き終わっている。
 * @param {string} url 差し替え先の URL (絶対 URL)
 * @param {object} [win] テスト用の window
 * @returns {void}
 * @throws {Error} 書き換わらなかったとき (注入スクリプトが居ない / 別オリジン等)
 */
export function replaceUrlKeepingState(url, win = window) {
	win.dispatchEvent(new CustomEvent(NAV_EVENTS.REPLACE_URL, { detail: url }));
	if (win.location.href !== url) {
		throw new Error(`URL を書き換えられませんでした: ${url}`);
	}
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
 * @param {{window?: object, entry?: EntryTracker}} [deps] 依存。entry は積んだことを覚えさせる先
 * @returns {Router} ルーター
 */
export function createRouter(onPopState, deps = {}) {
	const win = deps.window ?? window;
	const entry = deps.entry ?? null;
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

	/**
	 * 積む URL に付ける表示言語の接頭辞。
	 * 積むたびに読み直すのは、モーダルを開いている間も接頭辞が保たれるため。
	 * (開いている間の URL は `/en/artworks/{id}` なので、次に積む値も `/en` のままになる)
	 * @returns {string} 接頭辞 (`/en` か空文字)
	 */
	const prefix = () => currentLocalePrefix(win);

	return {
		open(workId) {
			closing = false;
			win.history.pushState({ [HISTORY_STATE_KEY]: true }, '', artworkPath(workId, prefix()));
			entry?.markOwn();
		},
		replace(workId) {
			win.history.replaceState({ [HISTORY_STATE_KEY]: true }, '', artworkPath(workId, prefix()));
			entry?.markOwn();
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
