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
	SETTING_MODES,
	ZONE_SIZE_RANGE,
	DEFAULT_NAV_ZONE_SIZE,
	SIDEBAR_WIDTH_CHOICES,
	SIDEBAR_DRAWER_MAX_CHOICES,
	BACKDROP_MODES,
	BACKDROP_OPACITY_RANGE,
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
 * 範囲の中の段階 (step の倍数) へ寄せて読む。数値でなければ既定へ倒す。
 * 範囲の外は端へ、段階の間は近い段階へ寄せる。(今は選べない値が保存されていても、選べる値のうち近いものとして読む)
 * @param {unknown} value 保存値
 * @param {{min: number, max: number, step: number}} range 範囲と段階
 * @param {number} fallback 既定
 * @returns {number} 寄せた値
 */
function snapToRange(value, { min, max, step }, fallback) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const clamped = Math.min(max, Math.max(min, value));
	return min + Math.round((clamped - min) / step) * step;
}

/**
 * 「既定のまま / カスタム」の持ち方を読む。保存値が無いときは、数値の側が既定と違えばカスタムとみなす。
 * (モードを持たず数値だけが保存されている値は、その数値を選んでいたものとして読む)
 * @param {unknown} mode 保存されていたモード
 * @param {readonly string[]} modes 許すモード
 * @param {string} custom カスタムを表すモード
 * @param {boolean} hasCustomValue 数値の側に既定と違う値が保存されているか
 * @param {string} fallback 既定のモード
 * @returns {string} モード
 */
function readMode(mode, modes, custom, hasCustomValue, fallback) {
	if (modes.includes(mode)) return mode;
	return hasCustomValue ? custom : fallback;
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
		// backdropMode が無いとき、backdropOpacity の 0 は「テーマに合わせる」と読む。0 より大きい数値だけをカスタムとして読む
		backdropMode: readMode(source.backdropMode, Object.values(BACKDROP_MODES), BACKDROP_MODES.CUSTOM,
			typeof source.backdropOpacity === 'number' && source.backdropOpacity > 0, d.backdropMode),
		backdropOpacity: source.backdropMode === undefined && source.backdropOpacity === 0
			? d.backdropOpacity
			: snapToRange(source.backdropOpacity, BACKDROP_OPACITY_RANGE, d.backdropOpacity),
		commentPageSize: oneOf(source.commentPageSize, COMMENT_PAGE_SIZE_CHOICES, d.commentPageSize),
		closeOnBackdrop: asBoolean(source.closeOnBackdrop, d.closeOnBackdrop),
		navZones: oneOf(source.navZones, Object.values(NAV_ZONES), d.navZones),
		navZoneMode: readMode(source.navZoneMode, Object.values(SETTING_MODES), SETTING_MODES.CUSTOM,
			[source.navZoneSize, source.navZoneSizeVertical].some((size) => typeof size === 'number' && size !== DEFAULT_NAV_ZONE_SIZE),
			d.navZoneMode),
		navZoneSize: snapToRange(source.navZoneSize, ZONE_SIZE_RANGE, d.navZoneSize),
		// 上下の幅が保存されていなければ、左右の幅 (navZoneSize) と同じ幅として読む
		navZoneSizeVertical: snapToRange(source.navZoneSizeVertical ?? source.navZoneSize, ZONE_SIZE_RANGE, d.navZoneSizeVertical),
		clickZoom: asBoolean(source.clickZoom, d.clickZoom),
		zoomZoneMode: readMode(source.zoomZoneMode, Object.values(SETTING_MODES), SETTING_MODES.CUSTOM,
			typeof source.zoomZoneSize === 'number' && source.zoomZoneSize !== d.zoomZoneSize, d.zoomZoneMode),
		zoomZoneSize: snapToRange(source.zoomZoneSize, ZONE_SIZE_RANGE, d.zoomZoneSize),
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
 * 実際に使う画面端のクリック領域の幅 (%) を返す。カスタムのときだけ設定の値を使い、それ以外は既定の幅。
 * @param {{navZoneMode?: string, navZoneSize?: number, navZoneSizeVertical?: number}} settings 正規化済みの設定
 * @returns {{horizontal: number, vertical: number}} 左右の端の幅と上下の端の幅 (%)
 */
export function navZoneSizesOf(settings) {
	const custom = settings.navZoneMode === SETTING_MODES.CUSTOM;
	const pick = (value) => (custom && Number.isFinite(value) ? value : DEFAULT_NAV_ZONE_SIZE);
	return { horizontal: pick(settings.navZoneSize), vertical: pick(settings.navZoneSizeVertical) };
}

/**
 * 保存されている生の値を、設定のキーだけ読む。
 * @param {{area?: object|null}} deps 保存領域の差し替え
 * @returns {Promise<object|null>} 保存値。領域が無い・読めなければ null
 */
function readRaw(deps) {
	return withArea(deps, (area) => area.get(Object.keys(SETTINGS_DEFAULTS)), null);
}

/**
 * 設定を読む。読めなければ既定を返す。読むだけで、保存領域へは書かない。
 * @param {{area?: object}} [deps] 保存領域の差し替え
 * @returns {Promise<typeof SETTINGS_DEFAULTS>} 設定
 */
export async function loadSettings(deps = {}) {
	return normalizeSettings(await readRaw(deps));
}

/**
 * 1 項目を書くときに、同じ set へ入れる組を作る。
 * 保存値に無いキーや古い形の値は、他のキーから読み替えて決まる。(上下の幅は左右の幅から、など)
 * 1 項目だけを書くと読み替えの元が変わり、他の項目の読み出し結果まで変わってしまうので、
 * 書く前と書いた後で読み出し結果が変わる項目は、書く前の値で一緒に書いて固定する。
 * 一緒に書いた項目は以後保存値にあるので、同じ固定は二度起きない。
 * 保存値が読めなければ 1 項目だけを返す。(固定はできないが、保存そのものは止めない)
 * @param {object} area 保存領域
 * @param {string} key 設定キー
 * @param {unknown} value 値
 * @returns {Promise<object>} set に渡す組
 */
async function pinnedPatch(area, key, value) {
	let raw;
	try {
		raw = await area.get(Object.keys(SETTINGS_DEFAULTS));
	} catch {
		return { [key]: value };
	}
	const before = normalizeSettings(raw);
	const after = normalizeSettings({ ...raw, [key]: value });
	const patch = { [key]: value };
	for (const name of Object.keys(SETTINGS_DEFAULTS)) {
		if (name !== key && before[name] !== after[name]) patch[name] = before[name];
	}
	return patch;
}

/**
 * 設定を 1 項目書く。失敗しても投げない。(見た目の反映は保存を待たない)
 * 呼び出し側が結果を伝えられるよう、成否は戻り値で返す。
 * SETTINGS_DEFAULTS に無いキーは書かない。読み出しが捨てる値で sync 領域の容量を食わないため。
 * 書いても他の項目の読み出し結果は変わらない。(読み替えで決まっていた項目は同じ set で固定する。set は 1 回)
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
	return withArea(deps, async (area) => {
		await area.set(await pinnedPatch(area, key, value));
		return true;
	}, false);
}

/**
 * onChanged の changes を生の保存値へ重ねる。設定のキーだけを見る。
 * newValue を持たない変更は、そのキーが消されたものとして扱う。
 * @param {object} raw 重ねる前の保存値
 * @param {Record<string, {newValue?: unknown}>|null|undefined} changes onChanged の changes
 * @returns {object} 重ねた保存値 (raw は変えない)
 */
function applyChanges(raw, changes) {
	const next = { ...raw };
	for (const [key, change] of Object.entries(changes ?? {})) {
		if (!Object.hasOwn(SETTINGS_DEFAULTS, key)) continue;
		if (change !== null && typeof change === 'object' && Object.hasOwn(change, 'newValue')) next[key] = change.newValue;
		else delete next[key];
	}
	return next;
}

/**
 * 設定の変更を購読する。popup で変えた値を開いているページへ即座に届けるために使う。
 * 保存領域を読むのは最初の通知の 1 回だけで、以後は通知の changes を手元の保存値へ重ねる。(読めなかったら次の通知で読み直す)
 * 通知は届いた順に処理する。コールバックが投げても unhandled rejection にせず warn に残す。
 * @param {(settings: typeof SETTINGS_DEFAULTS) => void} callback 変更後の設定を受け取る
 * @param {{storage?: object}} [deps] chrome.storage の差し替え
 * @returns {{dispose: () => void}} 購読の解除
 */
export function watchSettings(callback, deps = {}) {
	const storage = deps.storage ?? globalThis.chrome?.storage ?? null;
	if (!storage?.onChanged) return { dispose() {} };
	// 差し替えた storage の sync 領域から読む。sync が無ければ「領域なし」で、既定の chrome.storage.sync へ戻さない
	const area = storage.sync ?? null;
	/** 手元の保存値。まだ読んでいない・読めなかったときは null */
	let raw = null;
	/** 通知を届いた順に処理するための鎖 */
	let queue = Promise.resolve();

	const listener = (changes, areaName) => {
		if (areaName !== SYNC_AREA_NAME) return;
		queue = queue
			.then(async () => {
				// 最初に読んだ値は、この通知の変更を既に含んでいる
				raw = raw === null ? await readRaw({ area }) : applyChanges(raw, changes);
				return normalizeSettings(raw);
			})
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
