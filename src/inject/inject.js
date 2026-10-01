/**
 * page world (manifest の world: "MAIN") で動く注入スクリプト。
 *
 * content script は isolated world で動くため、そちらで history.pushState を包んでも
 * pixiv 本体のルーターが呼ぶ pushState は捕まらない。(world ごとにラッパを共有しない)
 * SPA 遷移を確実に捕まえるには、サイト本体と同じ world で history そのものを包む必要がある。
 * 捕まえた結果は DOM イベントで isolated world へ渡す。
 *
 * ここはサイト本体の動作の経路に割り込む。壊さないことを最優先にし、
 * 元の戻り値をそのまま返す・例外を外へ出さない・外せるようにする、の 3 点を守る。
 */
import { NAV_EVENTS, NAV_HOOK_FLAG } from '../common/constants.js';

/** 包む history のメソッド。 */
const PATCHED_METHODS = ['pushState', 'replaceState'];

/**
 * 遷移が起きたことを isolated world へ知らせる。
 * detail にデータは載せない。world 境界を越えると期待どおり読めないことがあるため、
 * これは信号としてだけ使い、URL は受け取った側が location から読む。
 * @returns {void}
 */
function notify() {
	try {
		window.dispatchEvent(new CustomEvent(NAV_EVENTS.NAVIGATE));
	} catch {
		// 通知に失敗してもサイト本体の遷移は続けさせる。ここで投げてはいけない
	}
}

/**
 * @typedef {object} HookFlag window 上のフラグ。退避した元のメソッドと、自分が入れた包み
 * @property {Function} pushState 包む前の pushState
 * @property {Function} replaceState 包む前の replaceState
 * @property {{active: boolean, patched: Record<string, Function>}} hook 包みの状態。
 *   active が偽の包みは通知せず、元のメソッドを呼ぶだけになる
 */

/**
 * history を包む。既に包まれていたら何もしない。(二重注入のガード)
 * 退避した元のメソッドは window 上のフラグに持たせ、
 * 同じスクリプトが 2 回走っても書き戻す先を見失わないようにする。
 * @returns {void}
 */
function hook() {
	if (window[NAV_HOOK_FLAG]) return;
	const state = { active: true, patched: {} };
	/** @type {HookFlag} */
	const flag = { hook: state };
	for (const method of PATCHED_METHODS) {
		const original = history[method];
		flag[method] = original;
		const patched = function patched(...args) {
			// 戻り値も this もそのまま通し、完全に透過にする
			const result = original.apply(this, args);
			if (state.active) notify();
			return result;
		};
		state.patched[method] = patched;
		history[method] = patched;
	}
	window[NAV_HOOK_FLAG] = flag;
}

/**
 * 包みを外して pixiv 標準の動作へ戻す。
 * 設定でオフにしたときに「pixiv 標準の動作に戻ります」を字義どおり成立させるため。
 * 退避した値が History.prototype のものなら own property を消して戻す。
 * 代入で戻すと動作は同じでも own property として残り、完全に元へ戻らない。
 *
 * 自分の後に別のスクリプトが包み直していたら、そのメソッドは触らない。外すとその包みごと消えるため。
 * 残った自分の包みは active を偽にして、通知しない素通しにする。
 * @returns {void}
 */
function unhook() {
	/** @type {HookFlag|undefined} */
	const flag = window[NAV_HOOK_FLAG];
	if (!flag) return;
	const state = flag.hook;
	if (state) state.active = false;
	const proto = Object.getPrototypeOf(history);
	for (const method of PATCHED_METHODS) {
		const original = flag[method];
		if (typeof original !== 'function') continue;
		if (state && history[method] !== state.patched[method]) continue;
		if (proto && proto[method] === original) delete history[method];
		else history[method] = original;
	}
	delete window[NAV_HOOK_FLAG];
}

/**
 * 今の履歴 state を保ったまま URL だけ差し替える。(無限スクロールの ?p= の追従)
 *
 * content script (isolated world) から読んだ history.state は古いことがあり、それを書き戻すと
 * Next.js の state (`__N`) が拡張の目印で上書きされ、そのエントリへ戻っても Next.js が popstate を無視する。
 * 読むのも書くのも page world のここで行う。
 *
 * 包みは通さない。自分の書き込みを pixiv の遷移として isolated world へ知らせないため。
 * (content script は書く前に自分の値を覚えており、通知が要らない)
 * @param {Event} event detail に URL の文字列を持つ CustomEvent
 * @returns {void}
 */
function replaceUrl(event) {
	const url = /** @type {CustomEvent} */ (event).detail;
	if (typeof url !== 'string' || url === '') return;
	try {
		const replace = window[NAV_HOOK_FLAG]?.replaceState ?? history.replaceState;
		replace.call(history, history.state, '', url);
	} catch {
		// 別オリジンの URL などで投げる。URL がずれるだけなので、サイト本体へは漏らさない。
		// 書けたかどうかは content script が location を見て判断する
	}
}

window.addEventListener(NAV_EVENTS.UNHOOK, unhook);
window.addEventListener(NAV_EVENTS.REHOOK, hook);
window.addEventListener(NAV_EVENTS.REPLACE_URL, replaceUrl);
hook();
