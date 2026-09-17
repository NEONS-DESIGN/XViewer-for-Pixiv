/**
 * pixiv API を叩く薄いラッパ。
 * 応答の {error, message, body} を展開し、失敗を PixivError に揃える。
 * fetch を差し替えられるようにしてあるのは、通信なしで単体テストするため。
 */
import { PixivError, PIXIV_ERROR_KINDS, kindFromStatus } from './errors.js';

/** 更新系で共通のヘッダ名。SITE_SPEC の実測値。 */
const HEADER_CSRF = 'x-csrf-token';
const HEADER_ACCEPT = 'accept';
const HEADER_CONTENT_TYPE = 'content-type';

/** 実測した content-type。 */
const CONTENT_TYPE_JSON = 'application/json; charset=utf-8';
const CONTENT_TYPE_FORM = 'application/x-www-form-urlencoded; charset=utf-8';
const ACCEPT_JSON = 'application/json';

/** fetch が中断されたときに投げる例外の name (DOMException)。 */
const ABORT_ERROR_NAME = 'AbortError';

/**
 * @typedef {object} ClientDeps
 * @property {typeof fetch} [fetchImpl] テスト用に差し替える fetch
 * @property {AbortSignal} [signal] 中断の合図。dispose 後に届く応答を捨てるために fetch へ渡す
 */

/**
 * 文字列を JSON として読む。読めなければ null。
 * 判定は後段でまとめて行うので、ここでは投げない。
 * @param {string} text 応答本文
 * @returns {unknown} 読めた値。読めなければ null
 */
function parseJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * 応答を読み、{error, body} を展開する。
 * 順序: 本文を読む → ステータス → JSON の形 → error フラグ → body。
 * ステータスを JSON 解析より先に見るのは、ログイン失効時のログインページ (HTML) や
 * ranking.php の 403 (HTML) を PARSE に化けさせないため (SITE_SPEC §6)。
 * @param {Response} response fetch の応答
 * @param {string} url 例外メッセージ用
 * @returns {Promise<unknown>} body。null は API が返した値としてそのまま通す
 */
async function unwrap(response, url) {
	let text;
	try {
		text = await response.text();
	} catch (error) {
		throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, `応答を読めません: ${url}`, response.status, { cause: error });
	}
	const json = parseJson(text);
	const message = json !== null && typeof json === 'object' ? json.message : undefined;
	if (!response.ok) {
		throw new PixivError(kindFromStatus(response.status), message || `HTTP ${response.status}`, response.status);
	}
	if (json === null || typeof json !== 'object') {
		throw new PixivError(PIXIV_ERROR_KINDS.PARSE, `JSON として読めません: ${url}`, response.status);
	}
	// 200 でも error:true のことがある
	if (json.error === true) {
		throw new PixivError(PIXIV_ERROR_KINDS.API, message || 'API がエラーを返しました', response.status);
	}
	// undefined を返すと上位が TypeError で落ち、種別で分岐できなくなる
	if (json.body === undefined) {
		throw new PixivError(PIXIV_ERROR_KINDS.PARSE, `body がありません: ${url}`, response.status);
	}
	return json.body;
}

/**
 * 通信を実行する。ネットワーク層の失敗を PixivError へ揃える。
 * @param {string} url URL
 * @param {object} init fetch の init (credentials と signal はここで付ける)
 * @param {ClientDeps} deps 依存
 * @returns {Promise<unknown>} body
 */
async function request(url, init, deps) {
	const fetchImpl = deps.fetchImpl ?? fetch;
	let response;
	try {
		response = await fetchImpl(url, { ...init, credentials: 'include', signal: deps.signal });
	} catch (error) {
		if (error?.name === ABORT_ERROR_NAME) {
			throw new PixivError(PIXIV_ERROR_KINDS.ABORTED, `中断されました: ${url}`, undefined, { cause: error });
		}
		throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, `通信に失敗しました: ${url}`, undefined, { cause: error });
	}
	return unwrap(response, url);
}

/**
 * GET して body を返す。
 * @param {string} url URL
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<unknown>} body
 */
export function getJson(url, deps = {}) {
	return request(url, {}, deps);
}

/**
 * POST の共通部分。CSRF トークンを付けて送る。
 * トークンが空なら送っても 401 が返るだけなので、往復せずに UNAUTHORIZED へ倒す。
 * @param {string} url URL
 * @param {Record<string, string>} headers x-csrf-token 以外のヘッダ
 * @param {BodyInit} body 送る本体
 * @param {string|null|undefined} token CSRF トークン
 * @param {ClientDeps} deps 依存
 * @returns {Promise<unknown>} body
 */
async function post(url, headers, body, token, deps) {
	if (!token) {
		throw new PixivError(PIXIV_ERROR_KINDS.UNAUTHORIZED, `CSRF トークンがありません: ${url}`);
	}
	return request(url, {
		method: 'POST',
		headers: { ...headers, [HEADER_CSRF]: token },
		body,
	}, deps);
}

/**
 * JSON を POST する。いいね・ブックマーク追加で使う。
 * @param {string} url URL
 * @param {object} payload 送る本体
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<unknown>} body
 */
export function postJson(url, payload, token, deps = {}) {
	return post(url, {
		[HEADER_ACCEPT]: ACCEPT_JSON,
		[HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
	}, JSON.stringify(payload), token, deps);
}

/**
 * urlencoded を POST する。フォロー・フォロー解除で使う。
 * @param {string} url URL
 * @param {Record<string, string>} params 送るパラメータ
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<unknown>} body
 */
export function postForm(url, params, token, deps = {}) {
	return post(url, {
		[HEADER_ACCEPT]: ACCEPT_JSON,
		[HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM,
	}, new URLSearchParams(params).toString(), token, deps);
}

/**
 * FormData を POST する。ブックマーク削除で使う。
 * content-type はブラウザが境界文字列付きで設定するため指定しない。
 * @param {string} url URL
 * @param {Record<string, string>} params 送るパラメータ
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<unknown>} body
 */
export function postFormData(url, params, token, deps = {}) {
	const form = new FormData();
	for (const [key, value] of Object.entries(params)) {
		form.append(key, value);
	}
	return post(url, {}, form, token, deps);
}
