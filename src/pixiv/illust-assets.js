/**
 * 作品の中身のうち、利用者の操作で変わらないもの (全ページの URL と実寸 / うごイラのフレーム情報) の取得をまとめる。
 *
 * どちらも作品が差し替えられない限り同じ応答が返るので、作品 ID をキーに Promise ごと覚え、
 * 作品を行き来したり設定で描き直したりしても取り直さない。
 * 覚えた Promise は複数の呼び出し側で共有するので、中断の合図 (signal) は受け取らない。
 * 呼び出し側は中断の代わりに、破棄した後に届いた結果を捨てる。
 */
import { getJson } from './client.js';
import { illustPagesUrl, ugoiraMetaUrl } from './endpoints.js';
import { PixivError, PIXIV_ERROR_KINDS } from './errors.js';
import { createPromiseCache } from './promise-cache.js';

/**
 * 覚えておく作品の数 (種類ごと)。前後の作品を行き来する範囲を収めつつ、流し見で際限なく増やさない。
 */
const ILLUST_ASSET_CACHE_LIMIT = 30;

/**
 * @typedef {object} IllustAssetDeps
 * @property {(url: string, deps?: object, init?: RequestInit) => Promise<unknown>} [getJsonImpl] 取得の差し替え。client.js の getJson と同じ形
 */

/**
 * 作品 ID → /ajax/illust/{id}/pages の body の Promise。
 * キーは作品 ID だけで lang を含まない。(URL と実寸は言語に依らない)
 */
const pagesCache = createPromiseCache(ILLUST_ASSET_CACHE_LIMIT);

/** 作品 ID → /ajax/illust/{id}/ugoira_meta の body の Promise。キーの決まりは pagesCache と同じ。 */
const ugoiraMetaCache = createPromiseCache(ILLUST_ASSET_CACHE_LIMIT);

/**
 * 作品の全ページの URL と実寸を取る。同じ作品は覚えて使い回す。失敗は覚えない。
 * 見られない作品 (R-18 を表示できない等) は NOT_FOUND で拒否する。
 * @param {string} illustId 作品 ID
 * @param {string} lang 言語コード (strings.lang)
 * @param {IllustAssetDeps} [deps] テスト用の依存
 * @returns {Promise<Array<{urls: object, width: number, height: number}>>} /pages の body (ページ順)
 * @throws {PixivError} body が配列でないとき (PARSE)。覚えずに次の呼び出しで取り直す
 */
export function fetchIllustPages(illustId, lang, deps = {}) {
	const key = String(illustId);
	const get = deps.getJsonImpl ?? getJson;
	return pagesCache.get(key) ?? pagesCache.remember(key, async () => {
		const body = await get(illustPagesUrl(illustId, lang));
		if (!Array.isArray(body)) {
			throw new PixivError(PIXIV_ERROR_KINDS.PARSE, `/pages の body が配列ではありません: ${illustId}`);
		}
		return body;
	});
}

/**
 * うごイラのフレーム情報と zip の場所を取る。同じ作品は覚えて使い回す。失敗は覚えない。
 * @param {string} illustId 作品 ID (illustType === 2 の作品)
 * @param {string} lang 言語コード (strings.lang)
 * @param {IllustAssetDeps} [deps] テスト用の依存
 * @returns {Promise<{src?: string, originalSrc?: string, mime_type?: string, frames?: Array<{file: string, delay: number}>}>} ugoira_meta の body
 * @throws {PixivError} body がオブジェクトでないとき (PARSE)。覚えずに次の呼び出しで取り直す
 */
export function fetchUgoiraMeta(illustId, lang, deps = {}) {
	const key = String(illustId);
	const get = deps.getJsonImpl ?? getJson;
	return ugoiraMetaCache.get(key) ?? ugoiraMetaCache.remember(key, async () => {
		const body = await get(ugoiraMetaUrl(illustId, lang));
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			throw new PixivError(PIXIV_ERROR_KINDS.PARSE, `ugoira_meta の body がオブジェクトではありません: ${illustId}`);
		}
		return body;
	});
}

/**
 * 覚えた内容を全部捨てる。テスト用。(本体は上限の押し出しに任せる)
 * @returns {void}
 */
export function clearIllustAssetCache() {
	pagesCache.clear();
	ugoiraMetaCache.clear();
}
