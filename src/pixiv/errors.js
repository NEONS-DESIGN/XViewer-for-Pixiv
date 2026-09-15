/**
 * pixiv API のエラー種別。
 * 呼び出し側はこの種別で分岐する。message は利用者向けの文言ではない。
 */
export const PIXIV_ERROR_KINDS = Object.freeze({
	/** 通信そのものが失敗した */
	NETWORK: 'network',
	/** 呼び出し側が AbortSignal で中断した。dispose 後の応答を黙って捨てるための種別で、異常ではない */
	ABORTED: 'aborted',
	/** 未ログイン。SITE_SPEC の実測では 401 が返る。CSRF トークンが無いときも往復せずにここへ倒す */
	UNAUTHORIZED: 'unauthorized',
	/** 対象が無い。R-18 を表示できないときの /pages もここに来る (異常ではない) */
	NOT_FOUND: 'not-found',
	/** パラメータが不正 */
	BAD_REQUEST: 'bad-request',
	/** API がエラーを返した */
	API: 'api',
	/** 応答を JSON として読めなかった。または {error, message, body} の形をしていなかった */
	PARSE: 'parse',
});

/** HTTP ステータスと種別の対応。ここに無いものは API 扱い。 */
const STATUS_TO_KIND = Object.freeze({
	400: PIXIV_ERROR_KINDS.BAD_REQUEST,
	401: PIXIV_ERROR_KINDS.UNAUTHORIZED,
	404: PIXIV_ERROR_KINDS.NOT_FOUND,
});

/**
 * HTTP ステータスからエラー種別を決める。
 * @param {number} status HTTP ステータス
 * @returns {string} PIXIV_ERROR_KINDS のいずれか
 */
export function kindFromStatus(status) {
	return STATUS_TO_KIND[status] ?? PIXIV_ERROR_KINDS.API;
}

/** pixiv API 由来のエラー。種別で分岐できるようにしたもの。 */
export class PixivError extends Error {
	/**
	 * @param {string} kind PIXIV_ERROR_KINDS のいずれか
	 * @param {string} message 開発者向けの説明
	 * @param {number} [status] HTTP ステータス (あれば)
	 * @param {{cause?: unknown}} [options] 元の例外。通信失敗や中断で fetch が投げたものを残す
	 */
	constructor(kind, message, status, options = {}) {
		// cause を渡されていないときは own property も作らない (Error の仕様に合わせる)
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = 'PixivError';
		this.kind = kind;
		this.status = status;
	}
}
