/**
 * 設定の読み書き。
 * 保存ボタンは作らず変更のたびに書くので、書き込みは 1 項目ずつ。
 * 保存値が壊れていても既定へ倒して必ず描けるようにする (UI_DESIGN_KIT §9)。
 */
import { SETTINGS_DEFAULTS, IMAGE_QUALITY, PREFETCH_CHOICES, GRID_TAB_SKIP } from './constants.js';

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
 * 保存値を既定へ丸める。
 * @param {object|null} raw 保存されていた値
 * @returns {typeof SETTINGS_DEFAULTS} 丸めた設定
 */
export function normalizeSettings(raw) {
	const source = raw ?? {};
	const qualities = Object.values(IMAGE_QUALITY);
	return {
		enabled: asBoolean(source.enabled, SETTINGS_DEFAULTS.enabled),
		imageQuality: qualities.includes(source.imageQuality)
			? source.imageQuality
			: SETTINGS_DEFAULTS.imageQuality,
		prefetch: PREFETCH_CHOICES.includes(source.prefetch)
			? source.prefetch
			: SETTINGS_DEFAULTS.prefetch,
		showSidebar: asBoolean(source.showSidebar, SETTINGS_DEFAULTS.showSidebar),
		closeOnBackdrop: asBoolean(source.closeOnBackdrop, SETTINGS_DEFAULTS.closeOnBackdrop),
		gridTabSkip: Object.values(GRID_TAB_SKIP).includes(source.gridTabSkip)
			? source.gridTabSkip
			: SETTINGS_DEFAULTS.gridTabSkip,
	};
}

/**
 * 設定を読む。読めなければ既定を返す。
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<typeof SETTINGS_DEFAULTS>} 設定
 */
export async function loadSettings(deps = {}) {
	const area = deps.area ?? defaultArea();
	if (!area) return { ...SETTINGS_DEFAULTS };
	try {
		return normalizeSettings(await area.get(Object.keys(SETTINGS_DEFAULTS)));
	} catch {
		// 保存領域が使えなくても既定で動かす
		return { ...SETTINGS_DEFAULTS };
	}
}

/**
 * 設定を 1 項目書く。失敗しても投げない (見た目の反映は保存を待たない)。
 * 呼び出し側が結果を伝えられるよう、成否は戻り値で返す。
 * @param {string} key 設定キー
 * @param {unknown} value 値
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<boolean>} 保存できたら true
 */
export async function saveSetting(key, value, deps = {}) {
	const area = deps.area ?? defaultArea();
	if (!area) return false;
	try {
		await area.set({ [key]: value });
		return true;
	} catch {
		// 呼び出し側が画面に出す。ここでは投げない
		return false;
	}
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
		if (areaName !== 'sync') return;
		void loadSettings().then(callback);
	};
	storage.onChanged.addListener(listener);
	return {
		dispose() {
			storage.onChanged.removeListener(listener);
		},
	};
}
