/**
 * 設定画面の定義表。
 * 構造 (並び・キー・kind・選択肢の値) はここが持ち、文言はカタログ (strings) から引く。
 * 画面に出る文字列を構造ごとカタログへ写すと、言語ごとに同じ構造が写経され、
 * 片方の言語だけ直す事故が起きる。
 * 項目を足すときは createSections へ 1 行足す。キーは SETTINGS_DEFAULTS と 1 対 1 に対応させる。
 * (対応は test/popup/popup-ui.test.js が見張る)
 */
import {
	IMAGE_QUALITY,
	PREFETCH_CHOICES,
	GRID_TAB_SKIP,
	SIDEBAR_SCROLL,
	INFINITE_SCROLL,
} from '../common/constants.js';

/** 画面の題名。拡張の名前をそのまま出す。言語に依らない。 */
export const TITLE = 'XViewer for Pixiv';

/**
 * タブの定義。順番がそのまま画面の並びと左右キーの順になる。
 * 設定は 1 枚のまま。分けるのは「操作する画面」と「読む画面」であって、設定項目同士ではない。
 * @param {object} strings 文言のカタログ
 * @returns {readonly {id: string, label: string}[]} タブ
 */
export function createTabs(strings) {
	return Object.freeze([
		Object.freeze({ id: 'settings', label: strings.popup.tabs.settings }),
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
 * 設定画面の定義表を組み立てる。
 * **構造 (並び・キー・kind・選択肢の値) はここが持ち、文言はカタログから引く。**
 * 両方をカタログへ写すと、言語ごとに同じ構造が写経され片方だけ直す事故が起きる。
 * キーは SETTINGS_DEFAULTS と 1 対 1 に対応させる。(test/popup/popup-ui.test.js が見張る)
 *
 * kind が 'toggle' ならスイッチ、'choice' なら選択肢。
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
				Object.freeze({
					kind: 'choice',
					key: 'prefetch',
					label: f.prefetch.label,
					description: f.prefetch.description,
					options: Object.freeze(PREFETCH_CHOICES.map((count) => prefetchOption(count, strings))),
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
