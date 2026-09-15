/**
 * 無限スクロールを今の URL と設定に合わせるときの判断。
 *
 * main.js の syncInfinite() は DOM と履歴を触るが、「張り直すのか / そのままか /
 * 基準ページはいくつか」の判断はここに閉じ込めて純粋関数にする (SPEC §6.8.6)。
 * URL の `?p=` / グリッドの実内容 / 拡張の記憶 の 3 つを常に一致させるのが芯。
 */
import { INFINITE_SCROLL } from '../common/constants.js';

/** syncInfinite() が取る行動。 */
export const SYNC_ACTIONS = Object.freeze({
	/** 張ったものを撤去し、張らない (対象外のページ / 設定がオフ) */
	DETACH: 'detach',
	/** 同じグリッドに張ったまま。設定の変更はモードの差し替えだけで追従する */
	KEEP: 'keep',
	/** 張ったままにしたうえで、pixiv が戻した `?p=` を自分の位置へ書き直す */
	RESTORE_PARAM: 'restoreParam',
	/** 撤去してから張り直す (別のグリッド / 描き直し / 基準ページの移動 / まだ張れていない) */
	REATTACH: 'reattach',
});

/**
 * @typedef {object} SyncInput
 * @property {string} wanted 設定 (INFINITE_SCROLL のいずれか)
 * @property {string|null} key 今の URL が指すグリッドのキー。対象外のページなら null
 * @property {string|null} gridKey 記憶しているグリッドのキー (infiniteGridKey)
 * @property {string|null} attachedKey 張ろうとしたグリッドのキー (infiniteKey)。張っていなければ null
 * @property {boolean} active 継ぎ足しが実際に動いているか (雛形が採れて sentinel を置けた)
 * @property {boolean} detached 最後に見た ul が DOM から外れたか
 * @property {boolean} listChanged 張れていないとき、前回試した ul と別の ul (または画像が増えた ul) が現れたか
 * @property {number} param URL の `?p=` (1 以上)
 * @property {number|null} ownPage 自分が `?p=` に書いた値。書いていなければ null
 * @property {number} basePage pixiv 自身が並べているページ番号
 */

/**
 * @typedef {object} SyncDecision
 * @property {string} action SYNC_ACTIONS のいずれか
 * @property {boolean} changedGrid 別のグリッドを見始めたか (見ていた ul の記憶も捨てる)
 * @property {string|null} gridKey 新しい infiniteGridKey
 * @property {number} basePage 新しい infiniteBasePage
 * @property {number|null} ownPage 新しい infiniteOwnPage
 */

/**
 * 無限スクロールをどう合わせるかを決める。
 *
 * - `?p=` が自分の書いた値と違えば、動かしたのは pixiv (直接アクセス / リロード / ページャ / 戻る)。
 *   pixiv はその値のページをグリッドへ並べるので、それを基準ページにして張り直す
 * - 例外は「張ったままのグリッドで、`?p=` が基準ページへ戻っただけ」のとき。
 *   モーダルを閉じると Next.js が自分の履歴 state の URL (= pixiv が最後に遷移した `?p=`) へ
 *   `replaceState` し直すが、グリッドの中身は変わらない。撤去せず `?p=` を書き直す
 * - 描き直された ul の基準ページは変えない。Next.js の router state は `replaceState` では動かず、
 *   描き直しは同じクエリで起きる (pixiv が navigate したなら `?p=` の枝で更新される)
 * - まだ張れていないグリッド (雛形が採れない) は、前回試した ul と違うものが現れたときだけ試し直す
 * @param {SyncInput} input 今の状態
 * @returns {SyncDecision} 取る行動と新しい記憶
 */
export function decideInfiniteSync(input) {
	const {
		wanted, key, gridKey, attachedKey, active, detached, listChanged, param, ownPage, basePage,
	} = input;
	const changedGrid = key !== gridKey;
	const sameGrid = key !== null && attachedKey === key && !changedGrid && !detached;
	let nextBase = basePage;
	let nextOwn = changedGrid ? null : ownPage;
	let baseMoved = false;
	let restored = false;
	if (param !== nextOwn) {
		if (sameGrid && active && param === basePage) {
			// pixiv が自分の値へ戻しただけ。グリッドの中身はそのままなので記憶も動かさない
			restored = true;
		} else {
			// pixiv が動かした。その値のページが並んでいる。
			// 前に自分が書いた値はもう URL に残っていないので忘れる
			baseMoved = !changedGrid && basePage !== param;
			nextBase = param;
			nextOwn = null;
		}
	}
	const decision = { changedGrid, gridKey: key, basePage: nextBase, ownPage: nextOwn };
	if (wanted === INFINITE_SCROLL.OFF || key === null) {
		return { ...decision, action: SYNC_ACTIONS.DETACH };
	}
	if (sameGrid && active && !baseMoved) {
		return { ...decision, action: restored ? SYNC_ACTIONS.RESTORE_PARAM : SYNC_ACTIONS.KEEP };
	}
	if (sameGrid && !active && !listChanged && !baseMoved) {
		// 同じ ul で試し直しても同じ結果になる。別の ul が現れるまで待つ
		return { ...decision, action: SYNC_ACTIONS.KEEP };
	}
	return { ...decision, action: SYNC_ACTIONS.REATTACH };
}
