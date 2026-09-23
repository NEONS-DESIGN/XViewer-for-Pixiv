/**
 * chrome.storage の保存領域を触るときの共通の包み。
 * 設定 (storage.js / sync) と表示言語 (language-store.js / local) は領域が違うだけで、
 * 「領域を解決 → 無ければ既定 → 失敗しても投げない」の形は同じなので、ここに 1 本だけ置く。
 */

/**
 * 保存領域を触る処理を包む。領域が無ければ・失敗したら fallback を返す。
 * `deps.area` が undefined なら defaultArea() を使い、null なら「領域なし」として fallback を返す。
 * (`??` で倒すと null を渡しても既定の領域へ落ちてしまい、テストと本番で意味が変わる)
 * @template T
 * @param {{area?: object|null}} deps 保存領域の差し替え。null は「領域なし」
 * @param {() => object|null} defaultArea 既定の領域を返す関数。拡張の外では null を返す
 * @param {(area: object) => Promise<T>} run 領域に対する処理
 * @param {T} fallback 領域が無い・失敗したときの値
 * @returns {Promise<T>} 結果
 */
export async function withArea(deps, defaultArea, run, fallback) {
	const area = deps.area === undefined ? defaultArea() : deps.area;
	if (!area) return fallback;
	try {
		return await run(area);
	} catch {
		// 保存領域が使えなくても既定で動かす。倒す先は呼び出し側が持っている
		return fallback;
	}
}
