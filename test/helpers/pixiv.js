/**
 * pixiv 側との境界 (fetch / __NEXT_DATA__) の偽物。
 */

/**
 * __NEXT_DATA__ の中身を組み立てる。
 * @param {{isLoggedIn?: boolean, self?: object|null, token?: string}} [options] セッションの中身
 * @returns {string} script の中身
 */
export function buildNextData({ isLoggedIn = true, self = null, token = 'TOKEN' } = {}) {
	const preloaded = { api: { token }, userData: self ? { self } : {} };
	return JSON.stringify({
		props: {
			pageProps: {
				isLoggedIn,
				serverSerializedPreloadedState: JSON.stringify(preloaded),
			},
		},
	});
}

/** JSON を指定しなかったときの応答本体。ログインページのような HTML を模す。 */
const NON_JSON_BODY = '<!DOCTYPE html>';

/**
 * fetch の偽物を作る。呼ばれた内容を記録する。
 * 応答は json() と text() の両方を持つ (client.js は text() で読んでから JSON.parse する)。
 * @param {{status?: number, json?: unknown, text?: string, throws?: boolean|Error}} [options] 応答の指定。
 *   json を省くと JSON として読めない応答 (HTML 等) になる。text で本文を直接指定してもよい。
 *   throws に Error を渡すとそれを投げる (cause の検証用)。true なら TypeError を投げる
 * @returns {{impl: Function, calls: Array<{url: string, init: object}>}} 偽の fetch と呼び出しの記録
 */
export function fakeFetch(options = {}) {
	const calls = [];
	const impl = async (url, init) => {
		calls.push({ url, init });
		if (options.throws) throw options.throws instanceof Error ? options.throws : new TypeError('Failed to fetch');
		const text = options.text ?? (options.json === undefined ? NON_JSON_BODY : JSON.stringify(options.json));
		return {
			ok: (options.status ?? 200) < 400,
			status: options.status ?? 200,
			json: async () => {
				if (options.json === undefined) throw new SyntaxError('Unexpected token');
				return options.json;
			},
			text: async () => text,
		};
	};
	return { impl, calls };
}

/**
 * pixiv の ajax API が成功したときの形 ({error: false, body}) で応える fetch の偽物を作る。
 * @param {unknown} body 応答の body
 * @returns {{impl: Function, calls: Array<{url: string, init: object}>}} 偽の fetch と呼び出しの記録
 */
export function fakeApiFetch(body) {
	return fakeFetch({ json: { error: false, message: '', body } });
}
