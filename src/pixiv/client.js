/**
 * pixiv API を叩く薄いラッパ。
 * 応答の {error, message, body} を展開し、失敗を PixivError に揃える。
 * fetch を差し替えられるようにしてあるのは、通信なしで単体テストするため。
 */
import { PixivError, PIXIV_ERROR_KINDS, kindFromStatus } from './errors.js';

/** 送るヘッダの名前。x-csrf-token は更新系で必須。 */
const HEADER_CSRF = 'x-csrf-token';
const HEADER_ACCEPT = 'accept';
const HEADER_CONTENT_TYPE = 'content-type';

/** 送る content-type と accept の値。pixiv 本体が送るものと同じ。 */
const CONTENT_TYPE_JSON = 'application/json; charset=utf-8';
const CONTENT_TYPE_FORM = 'application/x-www-form-urlencoded; charset=utf-8';
const ACCEPT_JSON = 'application/json';

/** urlencoded の POST に共通のヘッダ。postForm() と postFormRaw() は同じものを送り、応答の読み方だけが違う。 */
const FORM_HEADERS = Object.freeze({
	[HEADER_ACCEPT]: ACCEPT_JSON,
	[HEADER_CONTENT_TYPE]: CONTENT_TYPE_FORM,
});

/**
 * HTTP キャッシュを使わず、サーバーへ確かめ直して取るときの fetch の init。
 * pixiv の API は private, max-age=10 で返すので、フォローやいいねの状態を読む取得に付ける。
 * 付けないと、ページ側で操作した直後でも 10 秒前の応答が返ることがある。
 */
export const FRESH_FETCH_INIT = Object.freeze({ cache: 'no-cache' });

/** fetch が中断されたときに投げる例外の name (DOMException)。 */
const ABORT_ERROR_NAME = 'AbortError';

/** 時間切れで中断するときの理由の name (DOMException)。AbortSignal.timeout() と同じ。 */
const TIMEOUT_ERROR_NAME = 'TimeoutError';

/**
 * GET (getJson) が応答を待つ上限 (ミリ秒)。本文を読み終えるまでを含む。
 * 超えたら中断して NETWORK にする。応答が返らないまま読み込み中の表示で止まらせないため。
 * POST には掛けない。時間切れでもサーバー側では反映済みのことがあり、送り直すとコメントが二重に付く。
 */
const GET_TIMEOUT_MS = 30000;

/**
 * @typedef {object} ClientDeps
 * @property {typeof fetch} [fetchImpl] テスト用に差し替える fetch
 * @property {AbortSignal} [signal] 中断の合図。dispose 後に届く応答を捨てるために fetch へ渡す
 * @property {number} [timeoutMs] GET の待ち時間の上限の差し替え。テスト用 (既定は GET_TIMEOUT_MS)
 */

/**
 * @typedef {object} Deadline
 * @property {AbortSignal|undefined} signal fetch へ渡す合図。呼び出し側の中断と時間切れのどちらでも中断される
 * @property {() => boolean} timedOut 時間切れで中断したか
 * @property {() => void} dispose タイマと購読を外す。通信が終わったら必ず呼ぶ
 */

/**
 * 呼び出し側の中断の合図に、時間切れを重ねる。
 * AbortSignal.any / AbortSignal.timeout があればそれを使い、無ければ AbortController とタイマで組む。
 * @param {AbortSignal|undefined} signal 呼び出し側の中断の合図
 * @param {number|null} timeoutMs 待ち時間の上限。null なら時間切れを付けない
 * @returns {Deadline} 重ねた合図
 */
function createDeadline(signal, timeoutMs) {
	if (timeoutMs === null) return { signal, timedOut: () => false, dispose() {} };
	if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
		const timeout = AbortSignal.timeout(timeoutMs);
		return {
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
			timedOut: () => timeout.aborted,
			dispose() {},
		};
	}
	const controller = new AbortController();
	let expired = false;
	const timer = setTimeout(() => {
		expired = true;
		controller.abort(new DOMException(`${timeoutMs}ms 以内に応答がありません`, TIMEOUT_ERROR_NAME));
	}, timeoutMs);
	const forward = () => controller.abort(signal.reason);
	if (signal?.aborted) forward();
	else signal?.addEventListener('abort', forward, { once: true });
	return {
		signal: controller.signal,
		timedOut: () => expired,
		dispose() {
			clearTimeout(timer);
			signal?.removeEventListener('abort', forward);
		},
	};
}

/**
 * 通信中の失敗を PixivError へ揃える。
 * 応答を読めた後の失敗 (ステータス・JSON の形・API のエラー) はそのまま返す。
 * 本文の受信中の失敗も含め、呼び出し側の中断は ABORTED、時間切れは NETWORK にする。
 * @param {unknown} error 投げられたもの
 * @param {string} url 例外メッセージ用
 * @param {AbortSignal|undefined} signal 呼び出し側の中断の合図
 * @param {Deadline} deadline 時間切れの合図
 * @returns {PixivError} 揃えた例外
 */
function toPixivError(error, url, signal, deadline) {
	if (error instanceof PixivError && error.kind !== PIXIV_ERROR_KINDS.NETWORK) return error;
	const cause = error instanceof PixivError ? error.cause : error;
	if (signal?.aborted || (cause?.name === ABORT_ERROR_NAME && !deadline.timedOut())) {
		return new PixivError(PIXIV_ERROR_KINDS.ABORTED, `中断されました: ${url}`, undefined, { cause });
	}
	if (deadline.timedOut()) {
		return new PixivError(PIXIV_ERROR_KINDS.NETWORK, `時間内に応答がありません: ${url}`, undefined, { cause });
	}
	if (error instanceof PixivError) return error;
	return new PixivError(PIXIV_ERROR_KINDS.NETWORK, `通信に失敗しました: ${url}`, undefined, { cause: error });
}

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
 * ステータスを先に見るので、HTML のエラーページは PARSE ではなくステータスの種別になる。
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
 * 応答を読み、{error, body} を展開する。/ajax/* はすべてこの形。
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
 * 中断の合図は本文を読み終えるまで効く。
 * @param {string} url URL
 * @param {object} init fetch の init。credentials はここで付け直す。signal は deps.signal が無いときだけ使う
 * @param {ClientDeps} deps 依存
 * @param {(response: Response, url: string) => Promise<unknown>} parse 応答の読み方
 * @param {number|null} timeoutMs 待ち時間の上限。null なら時間切れを付けない
 * @returns {Promise<unknown>} body
 */
async function request(url, init, deps, parse, timeoutMs) {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const signal = deps.signal ?? init.signal ?? undefined;
	const deadline = createDeadline(signal, timeoutMs);
	try {
		const response = await fetchImpl(url, { ...init, credentials: 'include', signal: deadline.signal });
		return await parse(response, url);
	} catch (error) {
		throw toPixivError(error, url, signal, deadline);
	} finally {
		deadline.dispose();
	}
}

/**
 * GET して body を返す。GET_TIMEOUT_MS を過ぎても応答が揃わなければ NETWORK を投げる。
 * @param {string} url URL
 * @param {ClientDeps} [deps] 依存
 * @param {RequestInit} [init] fetch の init に足すもの。(FRESH_FETCH_INIT など) 中断の合図は deps.signal で渡す
 * @returns {Promise<unknown>} body
 */
export function getJson(url, deps = {}, init = {}) {
	return request(url, init, deps, unwrap, deps.timeoutMs ?? GET_TIMEOUT_MS);
}

/**
 * POST の共通部分。CSRF トークンを付けて送る。
 * トークンが空なら送っても 401 が返るだけなので、往復せずに UNAUTHORIZED へ倒す。
 * 時間切れは付けない。反映されたか分からないまま送り直させないため。
 * @param {string} url URL
 * @param {Record<string, string>} headers x-csrf-token 以外のヘッダ
 * @param {BodyInit} body 送る本体
 * @param {string|null|undefined} token CSRF トークン
 * @param {ClientDeps} deps 依存
 * @param {(response: Response, url: string) => Promise<unknown>} [parse] 応答の読み方。既定は {error, body} の展開
 * @returns {Promise<unknown>} body
 */
async function post(url, headers, body, token, deps, parse = unwrap) {
	if (!token) {
		throw new PixivError(PIXIV_ERROR_KINDS.UNAUTHORIZED, `CSRF トークンがありません: ${url}`);
	}
	return request(url, {
		method: 'POST',
		headers: { ...headers, [HEADER_CSRF]: token },
		body,
	}, deps, parse, null);
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
 * この 2 つは {error, message, body} で包まない旧 PHP エンドポイントで、
 * unwrap() に通すと成功しても PARSE になる。(フォローは素の配列、フォロー解除は {user_id})
 * 成功か失敗かの判定は呼び出し側 (actions.js) が行う。
 * 同じ urlencoded でも {error, body} を展開する版は postForm()。
 * @param {string} url URL
 * @param {Record<string, string>} params 送るパラメータ
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<object>} 応答の JSON そのもの (配列を含む)
 */
export function postFormRaw(url, params, token, deps = {}) {
	return post(url, FORM_HEADERS, new URLSearchParams(params).toString(), token, deps, readJson);
}

/**
 * urlencoded を POST し、応答の {error, body} を展開する。
 * コメントの投稿 (/rpc/post_comment.php) と削除 (/rpc_delete_comment.php) で使う。
 *
 * コメント系は旧 RPC だが /ajax/* と同じ {error, message, body} で包んで返す。
 * 包まないフォロー系には postFormRaw() を使う。
 * @param {string} url URL
 * @param {Record<string, string>} params 送るパラメータ
 * @param {string} token CSRF トークン
 * @param {ClientDeps} [deps] 依存
 * @returns {Promise<unknown>} body
 */
export function postForm(url, params, token, deps = {}) {
	return post(url, FORM_HEADERS, new URLSearchParams(params).toString(), token, deps);
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
