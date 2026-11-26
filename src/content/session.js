/**
 * ページに埋め込まれた #__NEXT_DATA__ からセッション情報を読む。
 *
 * DOM を触るのはここだけにし、解析そのものは pixiv/session.js の純粋関数に任せる。
 * (pixiv/ は DOM を知らない、という境界を守るため)
 *
 * __NEXT_DATA__ は Pages Router が初期 HTML に埋めるもので、SPA 遷移では更新されない。
 * 数百 KB の JSON を作品ごと・ボタン押下ごとに解析し直す意味は無いので、
 * 解析結果を覚えて使い回す。
 */
import { parseNextData } from '../pixiv/session.js';

/** __NEXT_DATA__ を持つ script 要素の id。 */
const NEXT_DATA_ID = '__NEXT_DATA__';

/** @type {import('../pixiv/session.js').Session|null} 覚えている解析結果 */
let cached = null;

/** 更新系が 401 を返したか。立っている間は CSRF トークンを渡さない。(ページを読み込み直すまで戻らない) */
let expired = false;

/**
 * セッションからトークンだけを抜いた凍結済みの写しを作る。
 * @param {import('../pixiv/session.js').Session} session 元のセッション (凍結済み)
 * @returns {import('../pixiv/session.js').Session} csrfToken が null の写し
 */
function withoutToken(session) {
	return session.csrfToken === null ? session : Object.freeze({ ...session, csrfToken: null });
}

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
	if (expired) cached = withoutToken(cached);
	return cached;
}

/**
 * ログインが切れた印を付ける。更新系が 401 を返したときに呼ぶ。
 * 以後の readSession() は csrfToken を null で返すので、更新系は往復せずに UNAUTHORIZED になる。
 * (__NEXT_DATA__ を読み直しても同じ古いトークンしか得られないので、覚えた解析結果は捨てない)
 * ログイン状態と表示設定 (isLoggedIn / self) はそのまま残す。
 * @returns {void}
 */
export function markSessionExpired() {
	expired = true;
	if (cached) cached = withoutToken(cached);
}

/**
 * 覚えた値とログインが切れた印を捨てる。読み直させたいときに明示的に呼ぶ。
 * @returns {void}
 */
export function clearSessionCache() {
	cached = null;
	expired = false;
}
