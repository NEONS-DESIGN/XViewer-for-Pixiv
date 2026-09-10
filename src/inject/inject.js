/**
 * page world (manifest の world: "MAIN") で動く注入スクリプト。
 *
 * content script は isolated world で動くため、そちらで history.pushState を包んでも
 * pixiv 本体のルーターが呼ぶ pushState は捕まらない (world ごとにラッパを共有しない)。
 * SPA 遷移を確実に捕まえるには、サイト本体と同じ world で history そのものを包む必要がある。
 * 捕まえた結果は DOM イベントで isolated world へ渡す (SITE_SPEC §0)。
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
 * history を包む。既に包まれていたら何もしない (二重注入のガード)。
 * 退避した元のメソッドは window 上のフラグに持たせ、
 * 同じスクリプトが 2 回走っても書き戻す先を見失わないようにする。
 * @returns {void}
 */
function hook() {
	if (window[NAV_HOOK_FLAG]) return;
	const originals = {};
	for (const method of PATCHED_METHODS) {
		const original = history[method];
		originals[method] = original;
		history[method] = function patched(...args) {
			// 戻り値も this もそのまま通し、完全に透過にする
			const result = original.apply(this, args);
			notify();
			return result;
		};
	}
	window[NAV_HOOK_FLAG] = originals;
}

/**
 * 包みを外して pixiv 標準の動作へ戻す。
 * 設定でオフにしたときに「pixiv 標準の動作に戻ります」を字義どおり成立させるため。
 * @returns {void}
 */
function unhook() {
	const originals = window[NAV_HOOK_FLAG];
	if (!originals) return;
	for (const method of PATCHED_METHODS) {
		if (typeof originals[method] === 'function') history[method] = originals[method];
	}
	delete window[NAV_HOOK_FLAG];
}

window.addEventListener(NAV_EVENTS.UNHOOK, unhook);
window.addEventListener(NAV_EVENTS.REHOOK, hook);
hook();
