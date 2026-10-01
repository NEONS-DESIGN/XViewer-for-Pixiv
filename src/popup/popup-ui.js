/**
 * 設定画面の描画。
 * 画面の中身はすべて sections.js の定義表から組み立てる。項目を足すときは表へ 1 行足すだけで済む。
 *
 * 保存ボタンは作らず、変更のたびに保存する。
 * 見た目の反映は保存の完了を待たない。
 */
import { createIcon } from '../common/icons.js';
import { supportsRichOptions } from '../common/rich-select.js';
import { renderTabs } from '../common/tabs.js';
import { renderConfirmRow } from '../common/confirm-row.js';
import { POPUP_THEMES, THEME_TOGGLE, SETTINGS_DEFAULTS } from '../common/constants.js';
import { createDescription } from './description.js';
import { renderLicensePanel, renderBriefDisclaimer } from './license-panel.js';
import { TITLE, createTabs, createResetField, createSections, createAdvancedSections } from './sections.js';

/** OS の配色を尋ねるメディアクエリ。 */
const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** 数値として保存してよい select の値。(「カスタム」のような文字列の選択肢は文字列のまま残す) */
const NUMERIC_VALUE_PATTERN = /^-?\d+(?:\.\d+)?$/;

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
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} 見出しの行
 */
function renderHeader(doc, initial, onChange, strings) {
	const header = doc.createElement('header');
	header.className = 'header';

	const title = doc.createElement('h1');
	title.textContent = TITLE;

	const button = doc.createElement('button');
	button.type = 'button';
	button.className = 'theme-toggle';
	// data-role は他の項目と同じく設定キー。app.js が保存の失敗後にこの値でフォーカスを戻す
	button.dataset.role = 'popupTheme';

	let theme = initial;

	/**
	 * ボタンの見た目 (アイコンと読み上げ名) を今の配色に合わせる。
	 * @returns {void}
	 */
	function updateButton() {
		const { icon, labelKey } = THEME_TOGGLE[theme];
		const label = strings.theme[labelKey];
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
	element.append(label);

	// 説明を持たない選択肢 (数値の段階など) は見出しだけにする。空の行を残さない
	if (option.description) {
		const hint = doc.createElement('small');
		hint.dataset.role = 'option-hint';
		hint.textContent = option.description;
		element.append(hint);
	}
	return element;
}

/** レンジの警告の行に添えるアイコン。色だけに頼らず形でも示す */
const RANGE_WARNING_ICON = 'error';

/**
 * レンジ (スライダー) の項目を組み立てる。今の値は見出しの右に format で読んで出す。
 * 動かしている間は表示だけを追従させ、保存は離したとき (change) に 1 回だけ行う。
 * (input のたびに書くと sync 領域の書き込み回数の上限に当たる)
 * warnAt 以上の値では、今の値を警告の色にし、レンジの下に warning を出す。(動かしている間も追従する)
 * @param {Document} doc 対象のドキュメント
 * @param {object} field 項目の定義 (kind: 'range')
 * @param {object} settings 現在の設定
 * @param {(patch: object) => void} onChange 変更時の処理
 * @returns {HTMLElement} 項目
 */
function renderRange(doc, field, settings, onChange) {
	const wrapper = doc.createElement('div');
	wrapper.className = 'field range';
	// 出し入れする単位。親の選択肢から hidden を付け外しする
	wrapper.dataset.role = `${field.key}-field`;

	const head = doc.createElement('div');
	head.className = 'range-head';

	const labelId = `${field.key}-label`;
	const label = doc.createElement('span');
	label.className = 'label';
	label.setAttribute('id', labelId);
	label.textContent = field.label;

	const output = doc.createElement('output');
	output.className = 'range-value';
	output.dataset.role = `${field.key}-value`;

	const input = doc.createElement('input');
	input.type = 'range';
	input.min = String(field.min);
	input.max = String(field.max);
	input.step = String(field.step);
	input.dataset.role = field.key;
	const inputId = `${field.key}-input`;
	input.setAttribute('id', inputId);
	input.setAttribute('aria-labelledby', labelId);
	const saved = settings[field.key];
	input.value = String(Number.isFinite(saved) ? saved : SETTINGS_DEFAULTS[field.key]);
	// 今の値がどの入力の結果かを結び付ける
	output.setAttribute('for', inputId);

	// 警告の行。文言は警告するときだけ入れる。role="status" なので、出たときに読み上げへも届く
	const warningId = `${field.key}-warning`;
	const warning = field.warning ? doc.createElement('p') : null;
	const warningText = warning ? doc.createElement('span') : null;
	if (warning) {
		warning.className = 'range-warning';
		warning.setAttribute('id', warningId);
		warning.dataset.role = warningId;
		warning.setAttribute('role', 'status');
		warning.hidden = true;
		warning.append(createIcon(doc, RANGE_WARNING_ICON), warningText);
	}

	/**
	 * 今の値の読みを見出しの右と読み上げへ写し、警告の出し入れをする。
	 * @returns {void}
	 */
	function showValue() {
		const value = Number(input.value);
		const text = field.format(value);
		output.textContent = text;
		// 読み上げは数字だけでなく単位まで読ませる
		input.setAttribute('aria-valuetext', text);
		if (!warning) return;
		const warn = Number.isFinite(field.warnAt) && value >= field.warnAt;
		output.classList.toggle('is-warning', warn);
		warning.hidden = !warn;
		warningText.textContent = warn ? field.warning : '';
		if (warn) input.setAttribute('aria-describedby', warningId);
		else input.removeAttribute('aria-describedby');
	}

	input.addEventListener('input', showValue);
	input.addEventListener('change', () => onChange({ [field.key]: Number(input.value) }));
	showValue();

	// 端の値を両脇に添え、選べる範囲を見せる
	const scale = doc.createElement('div');
	scale.className = 'range-scale';
	scale.setAttribute('aria-hidden', 'true');
	const low = doc.createElement('span');
	low.textContent = String(field.min);
	const high = doc.createElement('span');
	high.textContent = String(field.max);
	scale.append(low, high);

	head.append(label, output);
	wrapper.append(head, input, scale);
	if (warning) wrapper.append(warning);
	return wrapper;
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
	// select の値は常に文字列。保存の型は既定値の型から導く。
	// 数値の項目でも、数字でない選択肢 (カスタム) は文字列のまま保存する
	const numeric = typeof SETTINGS_DEFAULTS[field.key] === 'number';
	const toSaved = (value) => (numeric && NUMERIC_VALUE_PATTERN.test(value) ? Number(value) : value);

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

	// 非対応環境では、選んでいる選択肢の説明を select の下に出し、選び直しに追従させる。
	// 対応環境では選択肢の中に説明があるので、外には出さない。(出すと同じ文が二度出る)
	// 説明を持つ選択肢が 1 つも無い項目 (数値の段階) では出さない
	const hintId = `${field.key}-hint`;
	const hasHints = field.options.some((option) => option.description);
	const hint = rich || !hasHints ? null : createDescription(doc, '', hintId);

	// 特定の値を選んだときだけ下に出す項目 (先読みのカスタムの枚数など)
	const reveal = field.reveal ? renderRange(doc, field.reveal.field, settings, onChange) : null;

	/**
	 * 選んでいる値に合わせて、下に出す項目を出し入れする。
	 * @param {string} value 選ばれている値
	 * @returns {void}
	 */
	function showReveal(value) {
		if (reveal) reveal.hidden = value !== field.reveal.when;
	}

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
		onChange({ [field.key]: toSaved(select.value) });
		showHint(select.value);
		showReveal(select.value);
	});

	wrapper.append(title, lead, select);
	if (hint) {
		showHint(current);
		select.setAttribute('aria-describedby', `${descriptionId(field.key)} ${hintId}`);
		wrapper.append(hint);
	} else {
		select.setAttribute('aria-describedby', descriptionId(field.key));
	}
	if (reveal) {
		showReveal(current);
		wrapper.append(reveal);
	}
	return wrapper;
}

/**
 * 定義表の見出しごとに項目を並べ、パネルへ足す。
 * @param {Document} doc 対象のドキュメント
 * @param {HTMLElement} panel 足し先
 * @param {readonly object[]} sections 見出しごとの項目 (createSections / createAdvancedSections の戻り値)
 * @param {object} settings 現在の設定 (正規化済み)
 * @param {(patch: object) => void} onChange 設定を変えたときの処理
 * @returns {void}
 */
function appendSections(doc, panel, sections, settings, onChange) {
	// 判定の結果は環境で決まり項目ごとに変わらないので 1 回だけ尋ねる
	const rich = supportsRichOptions(doc.defaultView);

	for (const { heading, fields } of sections) {
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
}

/**
 * 設定タブの中身を組み立てる。
 * @param {Document} doc 対象のドキュメント
 * @param {object} settings 現在の設定 (正規化済み)
 * @param {(patch: object) => void} onChange 設定を変えたときの処理
 * @param {() => void} onReset 初期化を確定したときの処理
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} パネル
 */
function renderSettingsPanel(doc, settings, onChange, onReset, strings) {
	const panel = doc.createElement('div');
	panel.className = 'panel settings';
	appendSections(doc, panel, createSections(strings), settings, onChange);

	const reset = renderConfirmRow(doc, createResetField(strings), onReset);
	// 設定項目との区切り。置き場所に依る見た目なので、汎用の確認の行ではなくここで付ける
	reset.classList.add('reset');
	panel.append(reset, renderBriefDisclaimer(doc, strings));
	return panel;
}

/**
 * 詳細設定タブの中身を組み立てる。
 * @param {Document} doc 対象のドキュメント
 * @param {object} settings 現在の設定 (正規化済み)
 * @param {(patch: object) => void} onChange 設定を変えたときの処理
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} パネル
 */
function renderAdvancedPanel(doc, settings, onChange, strings) {
	const panel = doc.createElement('div');
	panel.className = 'panel advanced';
	appendSections(doc, panel, createAdvancedSections(strings), settings, onChange);
	return panel;
}

/**
 * 設定画面を描く。何度呼んでも前の中身は残らない。
 * @param {object} deps 依存
 * @param {Document} deps.doc 対象のドキュメント
 * @param {HTMLElement} deps.root 描き先
 * @param {object} deps.settings 現在の設定 (正規化済み)
 * @param {object} deps.strings 文言のカタログ
 * @param {(patch: object) => void} deps.onChange 設定を変えたときの処理
 * @param {() => void} deps.onReset 初期化を確定したときの処理
 * @param {string|null} [deps.notice] 画面の先頭に出す一言 (保存の失敗など)
 * @param {string|null} [deps.initialTab] 最初に開くタブの id。描き直しで現在地を保つために渡す
 * @returns {{currentTab: () => string}} 今開いているタブの id を返す関数
 */
export function renderPopup({ doc, root, settings, strings, onChange, onReset, notice = null, initialTab = null }) {
	const theme = resolveTheme(settings.popupTheme, doc.defaultView);
	applyTheme(doc, theme);

	const parts = [renderHeader(doc, theme, onChange, strings)];

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
		settings: renderSettingsPanel(doc, settings, onChange, onReset, strings),
		advanced: renderAdvancedPanel(doc, settings, onChange, strings),
		license: renderLicensePanel(doc, strings),
	};
	const entries = createTabs(strings).map(({ id, label }) => ({ id, label, panel: panels[id] }));
	const tabs = renderTabs(doc, entries, { label: strings.popup.TABS_LABEL, initialId: initialTab });

	parts.push(tabs.list, ...entries.map(({ panel }) => panel));
	root.replaceChildren(...parts);
	return { currentTab: tabs.currentId };
}
