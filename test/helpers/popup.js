/**
 * 設定画面 (popup) のテストの共通部品。
 * app.js の main() を偽の storage と描画で起動し、呼び出しを記録する。
 * (test/popup/popup.test.js と popup-language.test.js が使う)
 */
import { main } from '../../src/popup/app.js';
import { SETTINGS_DEFAULTS } from '../../src/common/constants.js';
import { createSections } from '../../src/popup/sections.js';
import { createStrings } from '../../src/i18n/index.js';
import { fakeElement, fakeDoc } from './dom.js';

/** popup.html の描き先の id。(app.js の ROOT_ID と同じ値。export されていないので写す) */
const ROOT_ID = 'app';

/** テーマ切り替えボタンの data-role。設定キーと同じ (popup-ui.js の renderHeader)。 */
const THEME_ROLE = 'popupTheme';

/** 初期化ボタンの data-role。(common/confirm-row.js が付ける) */
const RESET_ROLE = 'reset';

/**
 * 実物の renderPopup が data-role を付ける、フォーカスの戻り先になる部品の一覧。
 * SETTINGS_DEFAULTS のキーから起こすと実物に無い data-role が偽物に生え、
 * 「変えた項目へフォーカスを戻す」検査が実物とずれても通ってしまう。
 * @returns {string[]} data-role の値
 */
export function focusableRoles() {
	const keys = createSections(createStrings('ja')).flatMap((section) => section.fields.map((field) => field.key));
	return [...keys, THEME_ROLE, RESET_ROLE];
}

/**
 * popup 用の document の代わり。共通の偽物に、テーマ判定と選択肢の装飾判定が見る窓 (defaultView) を足す。
 * @param {{rich?: boolean, prefersLight?: boolean}} [options] 環境の指定
 * @returns {object} doc の代わり
 */
export function fakePopupDoc(options = {}) {
	const doc = fakeDoc();
	doc.defaultView = {
		CSS: { supports: () => options.rich === true },
		matchMedia: (query) => ({ matches: options.prefersLight === true && query.includes('light') }),
	};
	return doc;
}

/**
 * 画面を起動する。storage と描画を偽物にし、呼び出しを記録する。
 * @param {object} [options] 差し替え
 * @param {boolean|((key: string, value: unknown) => Promise<boolean>)} [options.save] saveSetting の結果 (関数なら都度呼ぶ)
 * @param {boolean} [options.reset] resetSettings の結果
 * @param {boolean} [options.hasRoot] #app が存在するか
 * @param {Function} [options.renderPopup] 描画の差し替え。省略すると data-role 付きのボタンだけを置く偽物
 * @param {object} [options.deps] main() へそのまま渡す追加の依存 (loadPageLanguage / getUILanguage 等)
 * @returns {Promise<object>} 記録 (doc / root / stored / renders / loads / reports と操作の関数)
 */
export async function bootPopup(options = {}) {
	const { save = true, reset = true, hasRoot = true, deps: extra = {} } = options;
	const doc = fakePopupDoc();
	const root = fakeElement('main');
	root.id = ROOT_ID;
	if (hasRoot) doc.body.appendChild(root);

	const stored = { ...SETTINGS_DEFAULTS };
	const renders = [];
	const loads = [];
	const reports = [];
	let tab = 'settings';

	const deps = {
		doc,
		loadSettings: async () => {
			loads.push({ ...stored });
			return { ...stored };
		},
		saveSetting: async (key, value) => {
			const ok = typeof save === 'function' ? await save(key, value) : save;
			if (ok) stored[key] = value;
			return ok;
		},
		resetSettings: async () => {
			if (reset) Object.assign(stored, SETTINGS_DEFAULTS);
			return reset;
		},
		renderPopup: options.renderPopup ?? ((args) => {
			renders.push(args);
			// 描いたものの代わり。フォーカスの戻り先になる要素だけ、実物と同じ data-role で置く
			const parts = focusableRoles().map((role) => {
				const element = fakeElement('button');
				element.dataset.role = role;
				return element;
			});
			args.root.replaceChildren(...parts);
			return { currentTab: () => tab };
		}),
		report: (...args) => reports.push(args),
		...extra,
	};

	await main(deps);
	return {
		doc,
		root,
		stored,
		renders,
		loads,
		reports,
		setTab: (id) => { tab = id; },
		last: () => renders.at(-1),
		change: (patch) => renders.at(-1).onChange(patch),
		resetNow: () => renders.at(-1).onReset(),
	};
}
