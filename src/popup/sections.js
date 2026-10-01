/**
 * 設定画面の定義表。
 * 構造 (並び・キー・kind・選択肢の値) はここが持ち、文言はカタログ (strings) から引く。
 * 項目を足すときは createSections (普段使う項目) か createAdvancedSections (細かい調整) へ 1 行足す。
 */
import {
	IMAGE_QUALITY,
	PREFETCH_CHOICES,
	PREFETCH_CUSTOM,
	PREFETCH_CUSTOM_RANGE,
	GRID_TAB_SKIP,
	SIDEBAR_SCROLL,
	INFINITE_SCROLL,
	NAV_ZONES,
	NAV_ZONE_SIZE_CHOICES,
	ZOOM_ZONE_SIZE_CHOICES,
	SIDEBAR_WIDTH_CHOICES,
	SIDEBAR_DRAWER_MAX_CHOICES,
	BACKDROP_OPACITY_CHOICES,
	BACKDROP_OPACITY_THEME,
	COMMENT_PAGE_SIZE_CHOICES,
	SETTINGS_DEFAULTS,
} from '../common/constants.js';

/** 画面の題名。拡張の名前をそのまま出す。言語に依らない。 */
export const TITLE = 'XViewer for Pixiv';

/**
 * タブの定義。順番がそのまま画面の並びと左右キーの順になる。
 * 設定は「普段使う項目」と「滅多に変えない細かい調整」の 2 枚に分け、読む画面 (ライセンス) を最後に置く。
 * @param {object} strings 文言のカタログ
 * @returns {readonly {id: string, label: string}[]} タブ
 */
export function createTabs(strings) {
	return Object.freeze([
		Object.freeze({ id: 'settings', label: strings.popup.tabs.settings }),
		Object.freeze({ id: 'advanced', label: strings.popup.tabs.advanced }),
		Object.freeze({ id: 'license', label: strings.popup.tabs.license }),
	]);
}

/**
 * 「設定を初期化」の定義。確認の行では「やめる」を左、「初期化する」を右に並べる。
 * role は data-role の接頭辞 (reset / reset-confirmation / reset-cancel / reset-confirm)。
 * @param {object} strings 文言のカタログ
 * @returns {object} 定義
 */
export function createResetField(strings) {
	return Object.freeze({ role: 'reset', ...strings.popup.reset });
}

/**
 * 先読みの選択肢を枚数から起こす。
 * 文言を添字で手書きすると PREFETCH_CHOICES の並びや値を変えたときに黙ってずれるので、値から作る。
 * @param {number} count 前後に先読みする枚数
 * @param {object} strings 文言のカタログ
 * @returns {{value: string, label: string, description: string}} 選択肢
 */
function prefetchOption(count, strings) {
	const f = strings.popup.fields.prefetch;
	const text = count === 0 ? f.none : f.some(count);
	return Object.freeze({ value: String(count), ...text });
}

/**
 * 先読みの項目を組み立てる。PREFETCH_CHOICES の枚数に「カスタム」を足し、
 * カスタムを選んだときだけ選択肢の下に枚数のレンジ (prefetchCustom) を出す。
 * @param {object} strings 文言のカタログ
 * @returns {object} 項目の定義
 */
function prefetchField(strings) {
	const f = strings.popup.fields;
	const { min, max, step } = PREFETCH_CUSTOM_RANGE;
	return Object.freeze({
		kind: 'choice',
		key: 'prefetch',
		label: f.prefetch.label,
		description: f.prefetch.description,
		options: Object.freeze([
			...PREFETCH_CHOICES.map((count) => prefetchOption(count, strings)),
			Object.freeze({ value: PREFETCH_CUSTOM, ...f.prefetch.custom(min, max) }),
		]),
		reveal: Object.freeze({
			when: PREFETCH_CUSTOM,
			field: Object.freeze({
				kind: 'range',
				key: 'prefetchCustom',
				label: f.prefetchCustom.label,
				min,
				max,
				step,
				format: (count) => f.prefetch.some(count).label,
			}),
		}),
	});
}

/**
 * 数値の段階から選ぶ項目を組み立てる。既定の値の見出しには印を付ける。
 * 選択肢の説明は持たない。(何の数値かは項目の説明が伝える)
 * @param {string} key 設定キー
 * @param {readonly number[]} values 選べる値
 * @param {object} strings 文言のカタログ
 * @param {Readonly<Record<number, {label: string, description: string}>>} [special] 値ごとに文言を差し替える表
 * @returns {object} 項目の定義
 */
function numberChoiceField(key, values, strings, special = {}) {
	const f = strings.popup.fields[key];
	return Object.freeze({
		kind: 'choice',
		key,
		label: f.label,
		description: f.description,
		options: Object.freeze(values.map((value) => {
			const text = special[value] ?? { label: f.option(value), description: '' };
			const label = value === SETTINGS_DEFAULTS[key] ? strings.popup.withDefault(text.label) : text.label;
			return Object.freeze({ value: String(value), label, description: text.description });
		})),
	});
}

/**
 * 詳細設定タブの定義表を組み立てる。形は createSections と同じ。
 * 滅多に変えない細かい調整 (数値の段階など) を置き、普段使う設定タブを短く保つ。
 * キーは createSections と重ねない。両方を合わせて SETTINGS_DEFAULTS と 1 対 1 にする。
 * @param {object} strings 文言のカタログ
 * @returns {readonly object[]} 見出しごとの項目
 */
export function createAdvancedSections(strings) {
	const h = strings.popup.headings;
	const backdropTheme = strings.popup.fields.backdropOpacity.theme;
	return Object.freeze([
		Object.freeze({
			heading: h.viewer,
			fields: Object.freeze([
				numberChoiceField('sidebarWidth', SIDEBAR_WIDTH_CHOICES, strings),
				numberChoiceField('sidebarDrawerMax', SIDEBAR_DRAWER_MAX_CHOICES, strings),
				numberChoiceField('backdropOpacity', BACKDROP_OPACITY_CHOICES, strings, { [BACKDROP_OPACITY_THEME]: backdropTheme }),
			]),
		}),
		Object.freeze({
			heading: h.controls,
			fields: Object.freeze([
				numberChoiceField('navZoneSize', NAV_ZONE_SIZE_CHOICES, strings),
				numberChoiceField('zoomZoneSize', ZOOM_ZONE_SIZE_CHOICES, strings),
			]),
		}),
		Object.freeze({
			heading: h.comments,
			fields: Object.freeze([
				numberChoiceField('commentPageSize', COMMENT_PAGE_SIZE_CHOICES, strings),
			]),
		}),
	]);
}

/**
 * 設定画面の定義表を組み立てる。
 * **構造 (並び・キー・kind・選択肢の値) はここが持ち、文言はカタログから引く。**
 * 構造をカタログへ移さないこと。言語ごとに同じ構造が複製され、片方だけ直したずれが起きる。
 * キーは SETTINGS_DEFAULTS と 1 対 1 に対応させる。(test/popup/popup-ui.test.js が見張る)
 *
 * kind が 'toggle' ならスイッチ、'choice' なら選択肢。
 * choice は reveal ({when, field}) を持てる。選んだ値が when のときだけ、選択肢の下に field を出す。
 * field の kind は 'range' (min / max / step と、値の読み方 format を持つ)。
 * choice の値は select の都合で文字列にしてある。保存時の型は SETTINGS_DEFAULTS の既定値の型から
 * 描画側が導く (数値の項目なら Number() へ戻す) ので、ここに型の印は持たない。
 * @param {object} strings 文言のカタログ
 * @returns {readonly object[]} 見出しごとの項目
 */
export function createSections(strings) {
	const f = strings.popup.fields;
	return Object.freeze([
		Object.freeze({
			heading: strings.popup.headings.viewer,
			fields: Object.freeze([
				Object.freeze({
					kind: 'toggle',
					key: 'enabled',
					label: f.enabled.label,
					description: f.enabled.description,
				}),
				Object.freeze({
					kind: 'toggle',
					key: 'showSidebar',
					label: f.showSidebar.label,
					description: f.showSidebar.description,
				}),
				Object.freeze({
					kind: 'choice',
					key: 'sidebarScroll',
					label: f.sidebarScroll.label,
					description: f.sidebarScroll.description,
					options: Object.freeze([
						Object.freeze({
							value: SIDEBAR_SCROLL.COMMENTS,
							label: f.sidebarScroll.comments.label,
							description: f.sidebarScroll.comments.description,
						}),
						Object.freeze({
							value: SIDEBAR_SCROLL.WHOLE,
							label: f.sidebarScroll.whole.label,
							description: f.sidebarScroll.whole.description,
						}),
					]),
				}),
			]),
		}),
		Object.freeze({
			heading: strings.popup.headings.image,
			fields: Object.freeze([
				Object.freeze({
					kind: 'choice',
					key: 'imageQuality',
					label: f.imageQuality.label,
					description: f.imageQuality.description,
					options: Object.freeze([
						Object.freeze({
							value: IMAGE_QUALITY.REGULAR,
							label: f.imageQuality.regular.label,
							description: f.imageQuality.regular.description,
						}),
						Object.freeze({
							value: IMAGE_QUALITY.ORIGINAL,
							label: f.imageQuality.original.label,
							description: f.imageQuality.original.description,
						}),
					]),
				}),
				prefetchField(strings),
				Object.freeze({
					kind: 'toggle',
					key: 'prefetchNeighbor',
					label: f.prefetchNeighbor.label,
					description: f.prefetchNeighbor.description,
				}),
				Object.freeze({
					kind: 'toggle',
					key: 'clickZoom',
					label: f.clickZoom.label,
					description: f.clickZoom.description,
				}),
			]),
		}),
		Object.freeze({
			heading: strings.popup.headings.userPage,
			fields: Object.freeze([
				Object.freeze({
					kind: 'toggle',
					key: 'hidePickup',
					label: f.hidePickup.label,
					description: f.hidePickup.description,
				}),
				Object.freeze({
					kind: 'choice',
					key: 'infiniteScroll',
					label: f.infiniteScroll.label,
					description: f.infiniteScroll.description,
					options: Object.freeze([
						Object.freeze({
							value: INFINITE_SCROLL.OFF,
							label: f.infiniteScroll.off.label,
							description: f.infiniteScroll.off.description,
						}),
						Object.freeze({
							value: INFINITE_SCROLL.ON_REACH,
							label: f.infiniteScroll.onReach.label,
							description: f.infiniteScroll.onReach.description,
						}),
						Object.freeze({
							value: INFINITE_SCROLL.PREFETCH,
							label: f.infiniteScroll.ahead.label,
							description: f.infiniteScroll.ahead.description,
						}),
					]),
				}),
			]),
		}),
		Object.freeze({
			heading: strings.popup.headings.controls,
			fields: Object.freeze([
				Object.freeze({
					kind: 'toggle',
					key: 'closeOnBackdrop',
					label: f.closeOnBackdrop.label,
					description: f.closeOnBackdrop.description,
				}),
				Object.freeze({
					kind: 'choice',
					key: 'navZones',
					label: f.navZones.label,
					description: f.navZones.description,
					options: Object.freeze([
						Object.freeze({
							value: NAV_ZONES.OFF,
							label: f.navZones.off.label,
							description: f.navZones.off.description,
						}),
						Object.freeze({
							value: NAV_ZONES.HORIZONTAL,
							label: f.navZones.horizontal.label,
							description: f.navZones.horizontal.description,
						}),
						Object.freeze({
							value: NAV_ZONES.VERTICAL,
							label: f.navZones.vertical.label,
							description: f.navZones.vertical.description,
						}),
						Object.freeze({
							value: NAV_ZONES.BOTH,
							label: f.navZones.both.label,
							description: f.navZones.both.description,
						}),
					]),
				}),
				Object.freeze({
					kind: 'choice',
					key: 'gridTabSkip',
					label: f.gridTabSkip.label,
					description: f.gridTabSkip.description,
					options: Object.freeze([
						Object.freeze({
							value: GRID_TAB_SKIP.BOTH,
							label: f.gridTabSkip.both.label,
							description: f.gridTabSkip.both.description,
						}),
						Object.freeze({
							value: GRID_TAB_SKIP.TITLE,
							label: f.gridTabSkip.title.label,
							description: f.gridTabSkip.title.description,
						}),
						Object.freeze({
							value: GRID_TAB_SKIP.NONE,
							label: f.gridTabSkip.none.label,
							description: f.gridTabSkip.none.description,
						}),
					]),
				}),
			]),
		}),
	]);
}
