/**
 * 手が空いたときに 1 回だけ走らせる。
 * requestIdleCallback が無い環境ではすぐ後のタスクへ回す。
 */
import { IDLE_FALLBACK_DELAY_MS } from './constants.js';

/**
 * @param {() => void} fn 走らせる処理
 * @param {{timeoutMs: number, view?: object}} options 待つ上限と、requestIdleCallback を持つ相手
 * @returns {void}
 */
export function runWhenIdle(fn, { timeoutMs, view = globalThis }) {
	if (typeof view?.requestIdleCallback === 'function') view.requestIdleCallback(() => fn(), { timeout: timeoutMs });
	else setTimeout(fn, IDLE_FALLBACK_DELAY_MS);
}
