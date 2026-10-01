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
	PREFETCH_CUSTOM_WARN_AT,
	PREFETCH_CUSTOM_SCALE_STEP,
	GRID_TAB_SKIP,
	SIDEBAR_SCROLL,
	INFINITE_SCROLL,
	NAV_ZONES,
	SETTING_MODES,
	ZONE_SIZE_RANGE,
	ZONE_SIZE_SCALE_STEP,
	DEFAULT_NAV_ZONE_SIZE,
	DEFAULT_ZOOM_ZONE_SIZE,
	SIDEBAR_WIDTH_CHOICES,
	SIDEBAR_DRAWER_MAX_CHOICES,
	BACKDROP_MODES,
	BACKDROP_OPACITY_RANGE,
	BACKDROP_OPACITY_SCALE_STEP,
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
 * 親の項目の条件を作る。親がオフ (または off の値) のとき、その項目は非活性になり、押すと message が出る。
 * off を渡さなければ「親のスイッチがオン」、渡せば「親の選択肢が off 以外」を求める。
 * @param {string} key 親の設定キー
 * @param {object} strings 文言のカタログ
 * @param {{value: string, label: string}} [off] 親の選択肢のうち「オフ」に当たるものの値と見出し
 * @returns {{key: string, off?: string, message: string}} 条件
 */
function requirement(key, strings, off) {
	const parent = strings.popup.fields[key].label;
	const dependency = strings.popup.dependency;
	return Object.freeze(off
		? { key, off: off.value, message: dependency.chooseOther(parent, off.label) }
		: { key, message: dependency.turnOn(parent) });
}

/**
 * 「ビュワーを使う」(enabled) に関係なく効く項目。ビュワーを開かなくても動くグリッドの機能。
 * これ以外の項目はビュワーを開いたときにしか使われないので、「ビュワーを使う」がオフなら非活性にする。
 */
const VIEWER_INDEPENDENT_KEYS = Object.freeze(['enabled', 'gridTabSkip', 'hidePickup', 'infiniteScroll']);

/**
 * 見出しごとの項目へ「ビュワーを使う」の条件を足す。子の項目にも足す。
 * 条件は外側の親 (ビュワーを使う) を先に並べる。警告は満たしていない最初の条件で出すので、
 * 両方オフのときは元の原因 (ビュワーを使う) を案内する。
 * @param {readonly object[]} sections 見出しごとの項目
 * @param {object} strings 文言のカタログ
 * @returns {readonly object[]} 条件を足した見出しごとの項目
 */
function requireViewer(sections, strings) {
	const needsViewer = requirement('enabled', strings);
	/**
	 * 項目 1 つ (と子) に条件を足す。requires は配列にそろえる。
	 * @param {object} field 項目の定義
	 * @returns {object} 条件を足した項目
	 */
	const withViewer = (field) => {
		const own = field.requires ? [field.requires] : [];
		const requires = VIEWER_INDEPENDENT_KEYS.includes(field.key)
			? own
			: [needsViewer, ...own.filter((one) => one.key !== needsViewer.key)];
		return Object.freeze({
			...field,
			requires: requires.length > 0 ? Object.freeze(requires) : undefined,
			children: field.children ? Object.freeze(field.children.map(withViewer)) : undefined,
		});
	};
	return Object.freeze(sections.map((section) => Object.freeze({ ...section, fields: Object.freeze(section.fields.map(withViewer)) })));
}

/**
 * レンジの下に添える目盛りの値を作る。両端は必ず含め、間は step の倍数を並べる。
 * (1-20 を 5 ごとなら 1 / 5 / 10 / 15 / 20)
 * @param {number} min 最小
 * @param {number} max 最大
 * @param {number} step 目盛りの間隔
 * @returns {readonly number[]} 目盛りの値 (昇順)
 */
export function rangeTicks(min, max, step) {
	const ticks = [min];
	for (let value = (Math.floor(min / step) + 1) * step; value < max; value += step) ticks.push(value);
	if (max > min) ticks.push(max);
	return Object.freeze(ticks);
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
				scale: rangeTicks(min, max, PREFETCH_CUSTOM_SCALE_STEP),
				warnAt: PREFETCH_CUSTOM_WARN_AT,
				warning: f.prefetchCustom.warning,
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
 * @param {object} [requires] 親の項目の条件 (requirement の戻り値)
 * @returns {object} 項目の定義
 */
function numberChoiceField(key, values, strings, special = {}, requires = undefined) {
	const f = strings.popup.fields[key];
	return Object.freeze({
		kind: 'choice',
		key,
		label: f.label,
		description: f.description,
		requires,
		options: Object.freeze(values.map((value) => {
			const text = special[value] ?? { label: f.option(value), description: '' };
			const label = value === SETTINGS_DEFAULTS[key] ? strings.popup.withDefault(text.label) : text.label;
			return Object.freeze({ value: String(value), label, description: text.description });
		})),
	});
}

/**
 * 「既定のまま / カスタム」から選び、カスタムのときだけ下にレンジを出す項目を組み立てる。
 * (背景の濃さ・クリック領域の大きさ) 先読みのカスタムと同じ形。
 * @param {object} spec 項目の中身
 * @param {string} spec.modeKey モードの設定キー
 * @param {string} spec.valueKey レンジの値の設定キー
 * @param {{value: string, label: string, description: string}} spec.defaultOption 既定の側の選択肢 (見出しには既定の印を付ける)
 * @param {string} spec.customValue カスタムを表すモードの値
 * @param {{min: number, max: number, step: number}} spec.range レンジの範囲
 * @param {number} spec.scaleStep 目盛りの間隔
 * @param {object} strings 文言のカタログ
 * @param {object} [requires] 親の項目の条件 (requirement の戻り値)
 * @returns {object} 項目の定義
 */
function modeRangeField({ modeKey, valueKey, defaultOption, customValue, range, scaleStep }, strings, requires) {
	const f = strings.popup.fields;
	const { min, max, step } = range;
	const percent = (value) => f[valueKey].option(value);
	return Object.freeze({
		kind: 'choice',
		key: modeKey,
		label: f[modeKey].label,
		description: f[modeKey].description,
		requires,
		options: Object.freeze([
			Object.freeze({ ...defaultOption, label: strings.popup.withDefault(defaultOption.label) }),
			Object.freeze({ value: customValue, ...f[modeKey].custom(min, max) }),
		]),
		reveal: Object.freeze({
			when: customValue,
			field: Object.freeze({
				kind: 'range',
				key: valueKey,
				label: f[valueKey].label,
				min,
				max,
				step,
				format: percent,
				scale: rangeTicks(min, max, scaleStep),
				scaleFormat: percent,
			}),
		}),
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
	const f = strings.popup.fields;
	// サイドバーの見た目とコメント (サイドバーの中に出る) は、サイドバーを出すときだけ効く
	const needsSidebar = requirement('showSidebar', strings);
	return requireViewer([
		Object.freeze({
			heading: h.viewer,
			fields: Object.freeze([
				numberChoiceField('sidebarWidth', SIDEBAR_WIDTH_CHOICES, strings, {}, needsSidebar),
				numberChoiceField('sidebarDrawerMax', SIDEBAR_DRAWER_MAX_CHOICES, strings, {}, needsSidebar),
				modeRangeField({
					modeKey: 'backdropMode',
					valueKey: 'backdropOpacity',
					defaultOption: { value: BACKDROP_MODES.THEME, ...f.backdropMode.theme },
					customValue: BACKDROP_MODES.CUSTOM,
					range: BACKDROP_OPACITY_RANGE,
					scaleStep: BACKDROP_OPACITY_SCALE_STEP,
				}, strings),
			]),
		}),
		Object.freeze({
			heading: h.controls,
			fields: Object.freeze([
				modeRangeField({
					modeKey: 'navZoneMode',
					valueKey: 'navZoneSize',
					defaultOption: { value: SETTING_MODES.DEFAULT, label: f.navZoneSize.option(DEFAULT_NAV_ZONE_SIZE), description: '' },
					customValue: SETTING_MODES.CUSTOM,
					range: ZONE_SIZE_RANGE,
					scaleStep: ZONE_SIZE_SCALE_STEP,
				}, strings, requirement('navZones', strings, { value: NAV_ZONES.OFF, label: f.navZones.off.label })),
				modeRangeField({
					modeKey: 'zoomZoneMode',
					valueKey: 'zoomZoneSize',
					defaultOption: { value: SETTING_MODES.DEFAULT, label: f.zoomZoneSize.option(DEFAULT_ZOOM_ZONE_SIZE), description: '' },
					customValue: SETTING_MODES.CUSTOM,
					range: ZONE_SIZE_RANGE,
					scaleStep: ZONE_SIZE_SCALE_STEP,
				}, strings, requirement('clickZoom', strings)),
			]),
		}),
		Object.freeze({
			heading: h.comments,
			fields: Object.freeze([
				numberChoiceField('commentPageSize', COMMENT_PAGE_SIZE_CHOICES, strings, {}, needsSidebar),
			]),
		}),
	], strings);
}

/**
 * 設定画面の定義表を組み立てる。
 * **構造 (並び・キー・kind・選択肢の値) はここが持ち、文言はカタログから引く。**
 * 構造をカタログへ移さないこと。言語ごとに同じ構造が複製され、片方だけ直したずれが起きる。
 * キーは SETTINGS_DEFAULTS と 1 対 1 に対応させる。(test/popup/popup-ui.test.js が見張る)
 *
 * kind が 'toggle' ならスイッチ、'choice' なら選択肢。
 * choice は reveal ({when, field}) を持てる。選んだ値が when のときだけ、選択肢の下に field を出す。
 * field の kind は 'range' (min / max / step と、値の読み方 format、目盛り scale (と目盛りの読み方 scaleFormat) を持つ)。
 * どの項目も children (子の項目の配列) を持てる。子は親の下に字下げして常に出す。
 * requires ({key, off?, message} の配列) を持つ項目は、親の条件を 1 つでも満たさない間は非活性になり、押すと満たしていない最初の条件の message を出す。
 * 「ビュワーを使う」の条件は requireViewer が VIEWER_INDEPENDENT_KEYS 以外の全項目へ足す。
 * (子は親を requires に持つ。別のタブの親を持つ項目もある) reveal の field は親の choice の requires に従う。
 * warnAt と warning を持つ range は、値が warnAt 以上のとき値を警告の色にし、下に warning を出す。
 * choice の値は select の都合で文字列にしてある。保存時の型は SETTINGS_DEFAULTS の既定値の型から
 * 描画側が導く (数値の項目なら Number() へ戻す) ので、ここに型の印は持たない。
 * @param {object} strings 文言のカタログ
 * @returns {readonly object[]} 見出しごとの項目
 */
export function createSections(strings) {
	const f = strings.popup.fields;
	return requireViewer([
		Object.freeze({
			heading: strings.popup.headings.viewer,
			fields: Object.freeze([
				Object.freeze({
					kind: 'toggle',
					key: 'enabled',
					label: f.enabled.label,
					description: f.enabled.description,
					// ビュワーを使う画面。「ビュワーを使う」がオフのときはどれも効かないので、子として下に並べる
					children: Object.freeze(['viewerOnUser', 'viewerOnHome', 'viewerOnSearch'].map((key) => Object.freeze({
						kind: 'toggle',
						key,
						label: f[key].label,
						description: f[key].description,
						requires: requirement('enabled', strings),
					}))),
				}),
				Object.freeze({
					kind: 'toggle',
					key: 'showSidebar',
					label: f.showSidebar.label,
					description: f.showSidebar.description,
					children: Object.freeze([
						Object.freeze({
							kind: 'choice',
							key: 'sidebarScroll',
							label: f.sidebarScroll.label,
							description: f.sidebarScroll.description,
							requires: requirement('showSidebar', strings),
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
	], strings);
}
