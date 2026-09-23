/**
 * 最後に見た pixiv の表示言語の置き場。
 *
 * popup は pixiv のページを持たないので、自分では言語を判定できない。
 * content script が起動のたびに書いた値を読む。
 *
 * **設定 (`storage.js`) とは保存領域を分ける。** 表示言語は利用者が決めた設定ではなく
 * pixiv 側の状態を反映するものなので、`chrome.storage.local` に置く。
 */
import { normalizeLanguage } from './language.js';
import { withArea as withStorageArea } from './storage-area.js';

const KEY = 'pageLanguage';

/**
 * 既定の保存領域。テストでは deps.area で差し替える。
 * @returns {object|null} chrome.storage.local。拡張の外では null
 */
function defaultArea() {
	return globalThis.chrome?.storage?.local ?? null;
}

/**
 * 表示言語の保存領域 (local) を触る処理を包む。領域が無ければ・失敗したら fallback を返す。
 * @template T
 * @param {{area?: object|null}} deps 保存領域の差し替え。null は「領域なし」
 * @param {(area: object) => Promise<T>} run 領域に対する処理
 * @param {T} fallback 領域が無い・失敗したときの値
 * @returns {Promise<T>} 結果
 */
function withArea(deps, run, fallback) {
	return withStorageArea(deps, defaultArea, run, fallback);
}

/**
 * 今見ている pixiv の表示言語を覚える。
 * @param {string} language 正規化済みの言語サブタグ
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<boolean>} 書けたら true
 */
export async function savePageLanguage(language, deps = {}) {
	return withArea(deps, async (area) => {
		await area.set({ [KEY]: language });
		return true;
	}, false);
}

/**
 * 最後に見た pixiv の表示言語を読む。
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<string|null>} 言語サブタグ。無い・壊れていれば null
 */
export async function loadPageLanguage(deps = {}) {
	return withArea(deps, async (area) => {
		const stored = await area.get([KEY]);
		return normalizeLanguage(stored?.[KEY]);
	}, null);
}
