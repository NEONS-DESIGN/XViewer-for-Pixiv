/**
 * ページに埋め込まれた #__NEXT_DATA__ からセッション情報を読む。
 *
 * DOM を触るのはここだけにし、解析そのものは pixiv/session.js の純粋関数に任せる。
 * (pixiv/ は DOM を知らない、という境界を守るため)
 *
 * __NEXT_DATA__ は Pages Router が初期 HTML に埋めるもので、SPA 遷移では更新されない。
 * (SITE_SPEC §0) 数百 KB の JSON を作品ごと・ボタン押下ごとに解析し直す意味は無いので、
 * 解析結果を覚えて使い回す。
 */
import { parseNextData } from '../pixiv/session.js';

/** __NEXT_DATA__ を持つ script 要素の id。 */
const NEXT_DATA_ID = '__NEXT_DATA__';

/** @type {import('../pixiv/session.js').Session|null} 覚えている解析結果 */
let cached = null;

/**
 * ドキュメントからセッション情報を読む。2 回目以降は覚えた値を返す。
 * @param {Document} doc 対象のドキュメント
 * @returns {import('../pixiv/session.js').Session} セッション情報
 */
export function readSession(doc) {
	if (cached) return cached;
	const script = doc.getElementById(NEXT_DATA_ID);
	const session = parseNextData(script?.textContent ?? null);
	// 使い回す値なので、呼び出し側の書き換えで壊れないよう凍らせる
	if (session.self) Object.freeze(session.self);
	cached = Object.freeze(session);
	return cached;
}

/**
 * 覚えた値を捨てる。読み直させたいときに明示的に呼ぶ。
 * @returns {void}
 */
export function clearSessionCache() {
	cached = null;
}
