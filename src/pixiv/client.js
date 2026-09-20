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
 * 応答を JSON として読む。見るのはステータスと「JSON のオブジェクトか」だけで、
 * pixiv の {error, message, body} 形までは求めない。
 * 順序: 本文を読む → ステータス → JSON の形。
 * ステータスを JSON 解析より先に見るのは、ログイン失効時のログインページ (HTML) や
 * ranking.php の 403 (HTML) を PARSE に化けさせないため (SITE_SPEC §6)。
 * @param {Response} response fetch の応答
 * @param {string} url 例外メッセージ用
 * @returns {Promise<object>} 読めた JSON (配列を含む)
 */
async function readJson(response, url) {
	let text;
	try {
		text = await response.text();
	} catch (error) {
		throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, `応答を読めません: ${url}`, response.status, { cause: error });
	}
	const json = parseJson(text);
	// 配列には message が無いので、文言を探すのはオブジェクトのときだけ
	const message = json !== null && typeof json === 'object' && !Array.isArray(json) ? json.message : undefined;
	if (!response.ok) {
		throw new PixivError(kindFromStatus(response.status), message || `HTTP ${response.status}`, response.status);
	}
	if (json === null || typeof json !== 'object') {
		throw new PixivError(PIXIV_ERROR_KINDS.PARSE, `JSON として読めません: ${url}`, response.status);
	}
	return json;
}

/**
 * 応答を読み、{error, body} を展開する。/ajax/* はすべてこの形 (SITE_SPEC §4)。
 * この形を返さない旧 PHP エンドポイント (フォロー系) には使わないこと。
 * @param {Response} response fetch の応答
 * @param {string} url 例外メッセージ用
 * @returns {Promise<unknown>} body。null は API が返した値としてそのまま通す
 */
async function unwrap(response, url) {
	const json = await readJson(response, url);
	const message = Array.isArray(json) ? undefined : json.message;
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
 * @param {(response: Response, url: string) => Promise<unknown>} [parse] 応答の読み方。既定は {error, body} の展開
 * @returns {Promise<unknown>} body
 */
async function request(url, init, deps, parse = unwrap) {
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
	return parse(response, url);
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
 * @param {(response: Response, url: string) => Promise<unknown>} [parse] 応答の読み方。既定は {error, body} の展開
 * @returns {Promise<unknown>} body
 */
async function post(url, headers, body, token, deps, parse) {
	if (!token) {
		throw new PixivError(PIXIV_ERROR_KINDS.UNAUTHORIZED, `CSRF トークンがありません: ${url}`);
	}
	return request(url, {
		method: 'POST',
		headers: { ...headers, [HEADER_CSRF]: token },
		body,
	}, deps, parse);
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
 * urlencoded を POST し、応答の JSON を展開せずそのまま返す。
 * フォロー (/bookmark_add.php) とフォロー解除 (/rpc_group_setting.php) で使う。
 *
 * この 2 つは /ajax/* ではない旧 PHP エンドポイントで、{error, message, body} で包まない
 * (フォローは素の配列、フォロー解除は {user_id}。SITE_SPEC §4-5/6)。
 * unwrap() に通すと body が無いため成功しても PARSE になるので、読み方を分けている。
 * 成功か失敗かの判定は応答の形を知っている actions.js が行う。
 * 同じ urlencoded でも {error, body} を展開する版は postForm()。
 * @param {string} url URL
 * @param {Record<string, string>} params 送るパラメータ
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<object>} 応答の JSON そのもの (配列を含む)
 */
export function postFormRaw(url, params, token, deps = {}) {
	return post(url, {
		[HEADER_ACCEPT]: ACCEPT_JSON,
		[HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM,
	}, new URLSearchParams(params).toString(), token, deps, readJson);
}

/**
 * urlencoded を POST し、応答の {error, body} を展開する。
 * コメントの投稿 (/rpc/post_comment.php) と削除 (/rpc_delete_comment.php) で使う。
 *
 * 同じ urlencoded でも postFormRaw() とは読み方が違う。
 * フォロー系の旧 PHP は {error, message, body} で包まないので展開してはいけないが、
 * post_comment.php は旧 RPC でありながら /ajax/* と同じ形で包んで返す (SITE_SPEC §4 実測)。
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
