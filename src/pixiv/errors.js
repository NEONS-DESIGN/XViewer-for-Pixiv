/**
 * pixiv API のエラー種別。
 * 呼び出し側はこの種別で分岐する。message は利用者向けの文言ではない。
 */
export const PIXIV_ERROR_KINDS = Object.freeze({
	/** 通信そのものが失敗した */
	NETWORK: 'network',
	/** 未ログイン。SITE_SPEC の実測では 401 が返る */
	UNAUTHORIZED: 'unauthorized',
	/** 対象が無い。R-18 を表示できないときの /pages もここに来る (異常ではない) */
	NOT_FOUND: 'not-found',
	/** パラメータが不正 */
	BAD_REQUEST: 'bad-request',
	/** API がエラーを返した */
	API: 'api',
	/** 応答を JSON として読めなかった */
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
	 */
	constructor(kind, message, status) {
		super(message);
		this.name = 'PixivError';
		this.kind = kind;
		this.status = status;
	}
}
