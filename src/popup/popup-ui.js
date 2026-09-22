/**
 * 設定画面の描画。
 * 画面の中身はすべて sections.js の定義表から組み立てる。項目を足すときは表へ 1 行足すだけで済む。
 *
 * 保存ボタンは作らず、変更のたびに保存する。(UI_DESIGN_KIT §4.4)
 * 見た目の反映は保存の完了を待たない。待つと押した手応えが遅れるため。
 */
import { createIcon } from '../common/icons.js';
import { supportsRichOptions } from '../common/rich-select.js';
import { renderTabs } from '../common/tabs.js';
import { renderConfirmRow } from '../common/confirm-row.js';
import { POPUP_THEMES, THEME_TOGGLE, SETTINGS_DEFAULTS } from '../common/constants.js';
import { createDescription } from './description.js';
import { renderLicensePanel, renderBriefDisclaimer } from './license-panel.js';
import { TITLE, TABS, TABS_LABEL, RESET_FIELD, SECTIONS } from './sections.js';

/** OS の配色を尋ねるメディアクエリ。 */
const LIGHT_QUERY = '(prefers-color-scheme: light)';

/**
 * 保存値と OS の設定から、実際に描く配色を決める。
 * 明示の選択 (dark / light) は常に OS より優先する。保存値が壊れていたらダークへ倒す。
 * @param {string} stored 保存されている popupTheme
 * @param {Window|undefined} win matchMedia の提供元
 * @returns {string} POPUP_THEMES.DARK か POPUP_THEMES.LIGHT
 */
export function resolveTheme(stored, win) {
	if (stored === POPUP_THEMES.DARK || stored === POPUP_THEMES.LIGHT) return stored;
	try {
		return win?.matchMedia?.(LIGHT_QUERY)?.matches ? POPUP_THEMES.LIGHT : POPUP_THEMES.DARK;
	} catch {
		// 判定できない環境でも描けるようにダークへ倒す
		return POPUP_THEMES.DARK;
	}
}

/**
 * 配色を html 要素へ反映する。CSS は html[data-theme] を選択子にして上書きする。
 * @param {Document} doc 対象のドキュメント
 * @param {string} theme 解決済みの配色
 * @returns {void}
 */
function applyTheme(doc, theme) {
	doc.documentElement.dataset.theme = theme;
}

/**
 * 説明文の id。フォーム部品の aria-describedby から参照する。
 * @param {string} key 設定キー
 * @returns {string} id
 */
function descriptionId(key) {
	return `${key}-description`;
}

/**
 * 見出しの行 (題名と配色の切り替えボタン) を組み立てる。
 * @param {Document} doc 対象のドキュメント
 * @param {string} initial 解決済みの配色
 * @param {(patch: object) => void} onChange 変更時の処理
 * @returns {HTMLElement} 見出しの行
 */
function renderHeader(doc, initial, onChange) {
	const header = doc.createElement('header');
	header.className = 'header';

	const title = doc.createElement('h1');
	title.textContent = TITLE;

	const button = doc.createElement('button');
	button.type = 'button';
	button.className = 'theme-toggle';
	button.dataset.role = 'theme-toggle';

	let theme = initial;

	/**
	 * ボタンの見た目 (アイコンと読み上げ名) を今の配色に合わせる。
	 * @returns {void}
	 */
	function updateButton() {
		const { icon, label } = THEME_TOGGLE[theme];
		button.replaceChildren(createIcon(doc, icon));
		button.setAttribute('aria-label', label);
		// アイコンのみのボタンなので、マウスでも意味が分かるよう title も添える
		button.title = label;
	}

	button.addEventListener('click', () => {
		theme = THEME_TOGGLE[theme].next;
		// 保存の完了を待たずに見た目を変える。保存に失敗しても次に開いたとき元へ戻るだけ
		applyTheme(doc, theme);
		updateButton();
		onChange({ popupTheme: theme });
	});

	updateButton();
	header.append(title, button);
	return header;
}

/**
 * スイッチの項目を組み立てる。
 * @param {Document} doc 対象のドキュメント
 * @param {object} field 項目の定義
 * @param {object} settings 現在の設定
 * @param {(patch: object) => void} onChange 変更時の処理
 * @returns {HTMLElement} 項目
 */
function renderToggle(doc, field, settings, onChange) {
	const wrapper = doc.createElement('div');
	wrapper.className = 'field';

	const label = doc.createElement('label');
	label.className = 'row';

	const input = doc.createElement('input');
	input.type = 'checkbox';
	// 見た目は pixiv 本体のスイッチに合わせてある。(popup.css)
	// 形が変わる以上、読み上げの役割も checkbox ではなく switch にする。
	// 入りと切りは type=checkbox の checked がそのまま伝わるので aria-checked は置かない
	input.setAttribute('role', 'switch');
	input.checked = Boolean(settings[field.key]);
	input.dataset.role = field.key;
	input.setAttribute('aria-describedby', descriptionId(field.key));
	input.addEventListener('change', () => onChange({ [field.key]: input.checked }));

	const text = doc.createElement('span');
	text.className = 'label';
	text.textContent = field.label;

	label.append(input, text);
	wrapper.append(label, createDescription(doc, field.description, descriptionId(field.key)));
	return wrapper;
}

/**
 * 選択肢を 1 つ組み立てる。
 * 対応環境では説明を選択肢の中へ入れ、非対応環境ではラベルだけの素の選択肢にする。
 * @param {Document} doc 対象のドキュメント
 * @param {object} option 選択肢の定義
 * @param {boolean} rich 選択肢の中に説明を入れられるか
 * @returns {HTMLOptionElement} 選択肢
 */
function createChoiceOption(doc, option, rich) {
	const element = doc.createElement('option');
	element.value = option.value;

	if (!rich) {
		// 非対応環境で入れ子にすると、閉じた状態にラベルと説明が続けて出てしまう
		element.textContent = option.label;
		return element;
	}

	const label = doc.createElement('span');
	label.dataset.role = 'option-label';
	label.textContent = option.label;

	const hint = doc.createElement('small');
	hint.dataset.role = 'option-hint';
	hint.textContent = option.description;

	element.append(label, hint);
	return element;
}

/**
 * 選択肢の項目を組み立てる。保存値が選択肢に無ければ既定を選んだ状態で描く。
 * @param {Document} doc 対象のドキュメント
 * @param {object} field 項目の定義
 * @param {object} settings 現在の設定
 * @param {(patch: object) => void} onChange 変更時の処理
 * @param {boolean} rich 選択肢の中に説明を入れられるか (appearance: base-select の対応)
 * @returns {HTMLElement} 項目
 */
function renderChoice(doc, field, settings, onChange, rich) {
	const values = field.options.map((option) => option.value);
	const saved = String(settings[field.key]);
	const current = values.includes(saved) ? saved : String(SETTINGS_DEFAULTS[field.key]);
	// select の値は常に文字列。保存の型は既定値から導く。手で印を付ける方式だと
	// 数値の項目を足したときに付け忘れ、次の読み込みで型が合わず既定へ落ちる
	const numeric = typeof SETTINGS_DEFAULTS[field.key] === 'number';

	const wrapper = doc.createElement('div');
	wrapper.className = 'field choice';

	const labelId = `${field.key}-label`;
	const title = doc.createElement('h3');
	title.className = 'label';
	title.setAttribute('id', labelId);
	title.textContent = field.label;

	const lead = createDescription(doc, field.description, descriptionId(field.key));

	const select = doc.createElement('select');
	select.dataset.role = field.key;
	// 見出しは h3 であってラベルではないため、読み上げ環境にはこの結び付けが要る
	select.setAttribute('aria-labelledby', labelId);

	if (rich) {
		// 閉じた状態の見た目を受け持つ要素。中の selectedcontent へ、選んでいる
		// 選択肢の中身が複製される (説明の側は CSS で隠す)
		const button = doc.createElement('button');
		button.append(doc.createElement('selectedcontent'));
		select.append(button);
	}

	for (const option of field.options) select.append(createChoiceOption(doc, option, rich));
	select.value = current;

	// 素の select は選んでいない項目の説明を出せない。説明を固定にすると、選び直した
	// ときに手元の説明と実際の挙動が食い違うため、選択に追従させる。
	// 対応環境では選択肢の中に説明があるので、外にも出すと同じ文が二度出る
	const hintId = `${field.key}-hint`;
	const hint = rich ? null : createDescription(doc, '', hintId);

	/**
	 * 選んでいる項目の説明を出す。
	 * @param {string} value 選ばれている値
	 * @returns {void}
	 */
	function showHint(value) {
		if (!hint) return;
		hint.textContent = field.options.find((option) => option.value === value)?.description ?? '';
	}

	select.addEventListener('change', () => {
		onChange({ [field.key]: numeric ? Number(select.value) : select.value });
		showHint(select.value);
	});

	wrapper.append(title, lead, select);
	if (hint) {
		showHint(current);
		select.setAttribute('aria-describedby', `${descriptionId(field.key)} ${hintId}`);
		wrapper.append(hint);
	} else {
		select.setAttribute('aria-describedby', descriptionId(field.key));
	}
	return wrapper;
}

/**
 * 設定タブの中身を組み立てる。
 * @param {Document} doc 対象のドキュメント
 * @param {object} settings 現在の設定 (正規化済み)
 * @param {(patch: object) => void} onChange 設定を変えたときの処理
 * @param {() => void} onReset 初期化を確定したときの処理
 * @returns {HTMLElement} パネル
 */
function renderSettingsPanel(doc, settings, onChange, onReset) {
	const panel = doc.createElement('div');
	panel.className = 'panel settings';
	// 判定の結果は環境で決まり項目ごとに変わらないので 1 回だけ尋ねる
	const rich = supportsRichOptions(doc.defaultView);

	for (const { heading, fields } of SECTIONS) {
		const section = doc.createElement('section');
		section.className = 'section';

		const title = doc.createElement('h2');
		title.textContent = heading;
		section.append(title);

		for (const field of fields) {
			section.append(field.kind === 'toggle'
				? renderToggle(doc, field, settings, onChange)
				: renderChoice(doc, field, settings, onChange, rich));
		}
		panel.append(section);
	}

	const reset = renderConfirmRow(doc, RESET_FIELD, onReset);
	// 設定項目との区切り。置き場所に依る見た目なので、汎用の確認の行ではなくここで付ける
	reset.classList.add('reset');
	panel.append(reset, renderBriefDisclaimer(doc));
	return panel;
}

/**
 * 設定画面を描く。何度呼んでも前の中身は残らない。
 * @param {object} deps 依存
 * @param {Document} deps.doc 対象のドキュメント
 * @param {HTMLElement} deps.root 描き先
 * @param {object} deps.settings 現在の設定 (正規化済み)
 * @param {(patch: object) => void} deps.onChange 設定を変えたときの処理
 * @param {() => void} deps.onReset 初期化を確定したときの処理
 * @param {string|null} [deps.notice] 画面の先頭に出す一言 (保存の失敗など)
 * @param {string|null} [deps.initialTab] 最初に開くタブの id。描き直しで現在地を保つために渡す
 * @returns {{currentTab: () => string}} 今開いているタブの id を返す関数
 */
export function renderPopup({ doc, root, settings, onChange, onReset, notice = null, initialTab = null }) {
	const theme = resolveTheme(settings.popupTheme, doc.defaultView);
	applyTheme(doc, theme);

	const parts = [renderHeader(doc, theme, onChange)];

	if (notice) {
		// 保存の失敗など。黙って消えると、利用者は変えたつもりのまま画面を閉じてしまう。
		// タブの外に置く。どのタブを見ていても目に入るようにするため
		const message = doc.createElement('p');
		message.className = 'notice';
		message.dataset.role = 'notice';
		message.setAttribute('role', 'alert');
		message.textContent = notice;
		parts.push(message);
	}

	const panels = {
		settings: renderSettingsPanel(doc, settings, onChange, onReset),
		license: renderLicensePanel(doc),
	};
	const entries = TABS.map(({ id, label }) => ({ id, label, panel: panels[id] }));
	const tabs = renderTabs(doc, entries, { label: TABS_LABEL, initialId: initialTab });

	parts.push(tabs.list, ...entries.map(({ panel }) => panel));
	root.replaceChildren(...parts);
	return { currentTab: tabs.currentId };
}
