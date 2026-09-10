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

/**
 * @typedef {object} ClientDeps
 * @property {typeof fetch} [fetchImpl] テスト用に差し替える fetch
 */

/**
 * 応答を JSON として読み、{error, body} を展開する。
 * @param {Response} response fetch の応答
 * @param {string} url 例外メッセージ用
 * @returns {Promise<unknown>} body
 */
async function unwrap(response, url) {
	let json;
	try {
		json = await response.json();
	} catch {
		// SITE_SPEC 実測: ranking.php の 403 は HTML を返す
		throw new PixivError(PIXIV_ERROR_KINDS.PARSE, `JSON として読めません: ${url}`, response.status);
	}
	if (!response.ok) {
		throw new PixivError(kindFromStatus(response.status), json?.message || `HTTP ${response.status}`, response.status);
	}
	// 200 でも error:true のことがある
	if (json?.error === true) {
		throw new PixivError(PIXIV_ERROR_KINDS.API, json.message || 'API がエラーを返しました', response.status);
	}
	return json?.body;
}

/**
 * 通信を実行する。ネットワーク層の失敗を PixivError へ揃える。
 * @param {string} url URL
 * @param {object} init fetch の init
 * @param {ClientDeps} deps 依存
 * @returns {Promise<unknown>} body
 */
async function request(url, init, deps) {
	const fetchImpl = deps.fetchImpl ?? fetch;
	let response;
	try {
		response = await fetchImpl(url, init);
	} catch (error) {
		throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, String(error));
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
	return request(url, { credentials: 'include' }, deps);
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
	return request(url, {
		method: 'POST',
		credentials: 'include',
		headers: {
			[HEADER_ACCEPT]: ACCEPT_JSON,
			[HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
			[HEADER_CSRF]: token,
		},
		body: JSON.stringify(payload),
	}, deps);
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
	return request(url, {
		method: 'POST',
		credentials: 'include',
		headers: {
			[HEADER_ACCEPT]: ACCEPT_JSON,
			[HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM,
			[HEADER_CSRF]: token,
		},
		body: new URLSearchParams(params).toString(),
	}, deps);
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
	return request(url, {
		method: 'POST',
		credentials: 'include',
		headers: { [HEADER_CSRF]: token },
		body: form,
	}, deps);
}
