/**
 * 設定の読み書き。
 * 保存ボタンは作らず変更のたびに書くので、書き込みは 1 項目ずつ。
 * 保存値が壊れていても既定へ倒して必ず描けるようにする (UI_DESIGN_KIT §9)。
 */
import { SETTINGS_DEFAULTS, IMAGE_QUALITY, PREFETCH_CHOICES, GRID_TAB_SKIP, POPUP_THEMES, SIDEBAR_SCROLL } from './constants.js';

/** 設定を置く保存領域の名前。onChanged の areaName と比べる。 */
const SYNC_AREA_NAME = 'sync';

/**
 * 既定の保存領域。テストでは deps.area で差し替える。
 * @returns {object|null} chrome.storage.sync。拡張の外では null
 */
function defaultArea() {
	return globalThis.chrome?.storage?.sync ?? null;
}

/**
 * 真偽値として読む。違う型なら既定へ倒す。
 * @param {unknown} value 保存値
 * @param {boolean} fallback 既定
 * @returns {boolean} 丸めた値
 */
function asBoolean(value, fallback) {
	return typeof value === 'boolean' ? value : fallback;
}

/**
 * 選択肢のどれかとして読む。含まれていなければ既定へ倒す。
 * @template T
 * @param {unknown} value 保存値
 * @param {readonly T[]} choices 許す値
 * @param {T} fallback 既定
 * @returns {T} 丸めた値
 */
function oneOf(value, choices, fallback) {
	return choices.includes(value) ? value : fallback;
}

/**
 * 保存領域を触る処理を包む。領域が無ければ・失敗したら fallback を返す。
 * 読み書きのどれも「領域を解決 → 無ければ既定 → 失敗しても投げない」の同じ形になる。
 * @template T
 * @param {{area?: object}} deps 保存領域の差し替え
 * @param {(area: object) => Promise<T>} run 領域に対する処理
 * @param {T} fallback 領域が無い・失敗したときの値
 * @returns {Promise<T>} 結果
 */
async function withArea(deps, run, fallback) {
	const area = deps.area ?? defaultArea();
	if (!area) return fallback;
	try {
		return await run(area);
	} catch {
		// 保存領域が使えなくても既定で動かす。呼び出し側が画面に出す
		return fallback;
	}
}

/**
 * 保存値を既定へ丸める。
 * @param {object|null} raw 保存されていた値
 * @returns {typeof SETTINGS_DEFAULTS} 丸めた設定
 */
export function normalizeSettings(raw) {
	const source = raw ?? {};
	const d = SETTINGS_DEFAULTS;
	return {
		enabled: asBoolean(source.enabled, d.enabled),
		imageQuality: oneOf(source.imageQuality, Object.values(IMAGE_QUALITY), d.imageQuality),
		prefetch: oneOf(source.prefetch, PREFETCH_CHOICES, d.prefetch),
		showSidebar: asBoolean(source.showSidebar, d.showSidebar),
		sidebarScroll: oneOf(source.sidebarScroll, Object.values(SIDEBAR_SCROLL), d.sidebarScroll),
		closeOnBackdrop: asBoolean(source.closeOnBackdrop, d.closeOnBackdrop),
		gridTabSkip: oneOf(source.gridTabSkip, Object.values(GRID_TAB_SKIP), d.gridTabSkip),
		popupTheme: oneOf(source.popupTheme, Object.values(POPUP_THEMES), d.popupTheme),
	};
}

/**
 * 設定を読む。読めなければ既定を返す。
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<typeof SETTINGS_DEFAULTS>} 設定
 */
export function loadSettings(deps = {}) {
	return withArea(
		deps,
		async (area) => normalizeSettings(await area.get(Object.keys(SETTINGS_DEFAULTS))),
		{ ...SETTINGS_DEFAULTS },
	);
}

/**
 * 設定を 1 項目書く。失敗しても投げない (見た目の反映は保存を待たない)。
 * 呼び出し側が結果を伝えられるよう、成否は戻り値で返す。
 * @param {string} key 設定キー
 * @param {unknown} value 値
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<boolean>} 保存できたら true
 */
export function saveSetting(key, value, deps = {}) {
	return withArea(deps, async (area) => { await area.set({ [key]: value }); return true; }, false);
}

/**
 * 設定の変更を購読する。popup で変えた値を開いているページへ即座に届けるために使う。
 * @param {(settings: typeof SETTINGS_DEFAULTS) => void} callback 変更後の設定を受け取る
 * @param {{storage?: object}} [deps] chrome.storage の差し替え
 * @returns {{dispose: () => void}} 購読の解除
 */
export function watchSettings(callback, deps = {}) {
	const storage = deps.storage ?? globalThis.chrome?.storage ?? null;
	if (!storage?.onChanged) return { dispose() {} };

	const listener = (_changes, areaName) => {
		if (areaName !== SYNC_AREA_NAME) return;
		// 差し替えた storage があればその sync 領域から読む。既定の chrome.storage.sync へ戻さない
		void loadSettings({ area: storage.sync ?? undefined }).then(callback);
	};
	storage.onChanged.addListener(listener);
	return {
		dispose() {
			storage.onChanged.removeListener(listener);
		},
	};
}

/**
 * 設定を丸ごと既定へ戻す。失敗しても投げない。
 * 項目を消すのではなく既定を書き戻すのは、storage の中身と画面の表示を一致させるため。
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<boolean>} 戻せたら true
 */
export function resetSettings(deps = {}) {
	return withArea(deps, async (area) => { await area.set({ ...SETTINGS_DEFAULTS }); return true; }, false);
}
