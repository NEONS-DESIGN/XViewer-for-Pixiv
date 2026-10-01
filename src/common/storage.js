/**
 * 設定の読み書き。
 * 保存ボタンは作らず変更のたびに書くので、書き込みは 1 項目ずつ。
 * 保存値が壊れていても既定へ倒して必ず描けるようにする。
 */
import {
	SETTINGS_DEFAULTS,
	IMAGE_QUALITY,
	PREFETCH_CHOICES,
	PREFETCH_CUSTOM,
	PREFETCH_CUSTOM_RANGE,
	GRID_TAB_SKIP,
	POPUP_THEMES,
	SIDEBAR_SCROLL,
	INFINITE_SCROLL,
	NAV_ZONES,
	NAV_ZONE_SIZE_CHOICES,
	ZOOM_ZONE_SIZE_CHOICES,
	SIDEBAR_WIDTH_CHOICES,
	SIDEBAR_DRAWER_MAX_CHOICES,
	BACKDROP_OPACITY_CHOICES,
	COMMENT_PAGE_SIZE_CHOICES,
} from './constants.js';
import { warn } from './log.js';
import { withArea as withStorageArea } from './storage-area.js';

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
 * 設定の保存領域 (sync) を触る処理を包む。領域が無ければ・失敗したら fallback を返す。
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
 * 範囲内の整数として読む。整数でない・範囲の外なら既定へ倒す。
 * 端へ寄せずに既定へ倒すのは、壊れた値を「最大」として扱わないため。
 * @param {unknown} value 保存値
 * @param {{min: number, max: number}} range 許す範囲 (両端を含む)
 * @param {number} fallback 既定
 * @returns {number} 丸めた値
 */
function intInRange(value, { min, max }, fallback) {
	return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
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
		viewerOnUser: asBoolean(source.viewerOnUser, d.viewerOnUser),
		viewerOnHome: asBoolean(source.viewerOnHome, d.viewerOnHome),
		viewerOnSearch: asBoolean(source.viewerOnSearch, d.viewerOnSearch),
		imageQuality: oneOf(source.imageQuality, Object.values(IMAGE_QUALITY), d.imageQuality),
		prefetch: oneOf(source.prefetch, [...PREFETCH_CHOICES, PREFETCH_CUSTOM], d.prefetch),
		prefetchCustom: intInRange(source.prefetchCustom, PREFETCH_CUSTOM_RANGE, d.prefetchCustom),
		prefetchNeighbor: asBoolean(source.prefetchNeighbor, d.prefetchNeighbor),
		showSidebar: asBoolean(source.showSidebar, d.showSidebar),
		sidebarScroll: oneOf(source.sidebarScroll, Object.values(SIDEBAR_SCROLL), d.sidebarScroll),
		sidebarWidth: oneOf(source.sidebarWidth, SIDEBAR_WIDTH_CHOICES, d.sidebarWidth),
		sidebarDrawerMax: oneOf(source.sidebarDrawerMax, SIDEBAR_DRAWER_MAX_CHOICES, d.sidebarDrawerMax),
		backdropOpacity: oneOf(source.backdropOpacity, BACKDROP_OPACITY_CHOICES, d.backdropOpacity),
		commentPageSize: oneOf(source.commentPageSize, COMMENT_PAGE_SIZE_CHOICES, d.commentPageSize),
		closeOnBackdrop: asBoolean(source.closeOnBackdrop, d.closeOnBackdrop),
		navZones: oneOf(source.navZones, Object.values(NAV_ZONES), d.navZones),
		navZoneSize: oneOf(source.navZoneSize, NAV_ZONE_SIZE_CHOICES, d.navZoneSize),
		clickZoom: asBoolean(source.clickZoom, d.clickZoom),
		zoomZoneSize: oneOf(source.zoomZoneSize, ZOOM_ZONE_SIZE_CHOICES, d.zoomZoneSize),
		gridTabSkip: oneOf(source.gridTabSkip, Object.values(GRID_TAB_SKIP), d.gridTabSkip),
		hidePickup: asBoolean(source.hidePickup, d.hidePickup),
		infiniteScroll: oneOf(source.infiniteScroll, Object.values(INFINITE_SCROLL), d.infiniteScroll),
		popupTheme: oneOf(source.popupTheme, Object.values(POPUP_THEMES), d.popupTheme),
	};
}

/**
 * 実際に先読みする前後の枚数を返す。「カスタム」なら prefetchCustom の枚数を使う。
 * @param {{prefetch: number|string, prefetchCustom: number}} settings 正規化済みの設定
 * @returns {number} 前後に先読みする枚数 (0 以上)
 */
export function prefetchCount(settings) {
	return settings.prefetch === PREFETCH_CUSTOM ? settings.prefetchCustom : settings.prefetch;
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
 * 設定を 1 項目書く。失敗しても投げない。(見た目の反映は保存を待たない)
 * 呼び出し側が結果を伝えられるよう、成否は戻り値で返す。
 * SETTINGS_DEFAULTS に無いキーは書かない。読み出しが捨てる値で sync 領域の容量を食わないため。
 * @param {string} key 設定キー
 * @param {unknown} value 値
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<boolean>} 保存できたら true。知らないキーなら false
 */
export function saveSetting(key, value, deps = {}) {
	if (!Object.hasOwn(SETTINGS_DEFAULTS, key)) {
		warn('知らない設定キーです', key);
		return Promise.resolve(false);
	}
	return withArea(deps, async (area) => { await area.set({ [key]: value }); return true; }, false);
}

/**
 * 設定の変更を購読する。popup で変えた値を開いているページへ即座に届けるために使う。
 * コールバックが投げても unhandled rejection にせず warn に残す。
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
		loadSettings({ area: storage.sync ?? undefined })
			.then(callback)
			.catch((error) => warn('設定の変更を反映できませんでした', error));
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
