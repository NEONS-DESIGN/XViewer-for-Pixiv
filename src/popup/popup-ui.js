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
import { attachFieldLock, isRequirementMet } from './field-lock.js';

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
 * @typedef {object} RenderContext 項目を描くときに引き回すもの
 * @property {Document} doc 対象のドキュメント
 * @property {object} state 今の設定。変更のたびに更新し、子の項目の非活性の判定に使う
 * @property {(patch: object) => void} onChange 設定を変えたときの処理 (state の更新と非活性の判定を含む)
 * @property {boolean} rich 選択肢の中に説明を入れられるか (appearance: base-select の対応)
 * @property {Array<{requires: readonly object[], lock: {setLocked: (locked: boolean, message?: string) => void}}>} locks 親の条件を持つ項目の一覧
 */

/**
 * 親の条件を持つ項目に非活性の振る舞いを付け、一覧へ覚える。条件が無ければ何もしない。
 * @param {RenderContext} ctx 描画の文脈
 * @param {readonly object[]|undefined} requires 親の条件の配列 (sections.js の requirement)。外側の親が先
 * @param {{wrapper: HTMLElement, control: HTMLElement, kind: string, key: string}} target 付ける先
 * @returns {{isLocked: () => boolean}|null} 非活性の状態。条件が無ければ null
 */
function lockIfDependent(ctx, requires, target) {
	if (!requires?.length) return null;
	const lock = attachFieldLock(ctx.doc, target);
	ctx.locks.push({ requires, lock });
	return lock;
}

/**
 * 子の項目を親の下に字下げして並べる。子が無ければ何もしない。
 * @param {RenderContext} ctx 描画の文脈
 * @param {HTMLElement} wrapper 親の項目
 * @param {readonly object[]|undefined} children 子の項目の定義
 * @returns {void}
 */
function appendChildren(ctx, wrapper, children) {
	if (!children?.length) return;
	const box = ctx.doc.createElement('div');
	box.className = 'field-children';
	for (const child of children) box.append(renderField(ctx, child));
	wrapper.append(box);
}

/**
 * スイッチの項目を組み立てる。
 * @param {RenderContext} ctx 描画の文脈
 * @param {object} field 項目の定義
 * @returns {HTMLElement} 項目
 */
function renderToggle(ctx, field) {
	const { doc } = ctx;
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
	input.checked = Boolean(ctx.state[field.key]);
	input.dataset.role = field.key;
	input.setAttribute('aria-describedby', descriptionId(field.key));

	const text = doc.createElement('span');
	text.className = 'label';
	text.textContent = field.label;

	label.append(input, text);
	wrapper.append(label, createDescription(doc, field.description, descriptionId(field.key)));
	const lock = lockIfDependent(ctx, field.requires, { wrapper, control: input, kind: 'toggle', key: field.key });
	input.addEventListener('change', () => {
		if (lock?.isLocked()) return;
		ctx.onChange({ [field.key]: input.checked });
	});
	appendChildren(ctx, wrapper, field.children);
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
 * レンジの目盛りを組み立てる。値ごとに、つまみの中心が来る位置へ置く。
 * 位置は CSS 変数 --tick (0-1) で渡し、つまみの幅の分を CSS が差し引く。
 * @param {Document} doc 対象のドキュメント
 * @param {object} field 項目の定義 (kind: 'range')
 * @returns {HTMLElement} 目盛り
 */
function renderScale(doc, field) {
	const scale = doc.createElement('div');
	scale.className = 'range-scale';
	// 範囲は min / max で読み上げに届くので、目盛りは目で見る用
	scale.setAttribute('aria-hidden', 'true');
	const ticks = field.scale ?? [field.min, field.max];
	const read = field.scaleFormat ?? String;
	const span = field.max - field.min;
	for (const value of ticks) {
		const tick = doc.createElement('span');
		tick.className = 'range-tick';
		tick.textContent = read(value);
		tick.style.setProperty('--tick', String(span > 0 ? (value - field.min) / span : 0));
		scale.append(tick);
	}
	return scale;
}

/**
 * レンジ (スライダー) の項目を組み立てる。今の値は見出しの右に format で読んで出す。
 * 動かしている間は表示だけを追従させ、保存は離したとき (change) に 1 回だけ行う。
 * (input のたびに書くと sync 領域の書き込み回数の上限に当たる)
 * warnAt 以上の値では、今の値を警告の色にし、レンジの下に warning を出す。(動かしている間も追従する)
 * @param {RenderContext} ctx 描画の文脈
 * @param {object} field 項目の定義 (kind: 'range')
 * @param {readonly object[]} [requires] 親の条件の配列。親の選択肢が非活性ならレンジも非活性にする
 * @returns {HTMLElement} 項目
 */
function renderRange(ctx, field, requires) {
	const { doc } = ctx;
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
	const saved = ctx.state[field.key];
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

	head.append(label, output);
	wrapper.append(head, input, renderScale(doc, field));
	if (warning) wrapper.append(warning);
	const lock = lockIfDependent(ctx, requires, { wrapper, control: input, kind: 'range', key: field.key });
	input.addEventListener('input', () => {
		if (lock?.isLocked()) return;
		showValue();
	});
	input.addEventListener('change', () => {
		if (lock?.isLocked()) return;
		ctx.onChange({ [field.key]: Number(input.value) });
	});
	showValue();
	return wrapper;
}

/**
 * 選択肢の項目を組み立てる。保存値が選択肢に無ければ既定を選んだ状態で描く。
 * @param {RenderContext} ctx 描画の文脈
 * @param {object} field 項目の定義
 * @returns {HTMLElement} 項目
 */
function renderChoice(ctx, field) {
	const { doc, rich } = ctx;
	const values = field.options.map((option) => option.value);
	const saved = String(ctx.state[field.key]);
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

	/**
	 * 選んでいる項目の説明を出す。
	 * @param {string} value 選ばれている値
	 * @returns {void}
	 */
	function showHint(value) {
		if (!hint) return;
		hint.textContent = field.options.find((option) => option.value === value)?.description ?? '';
	}

	wrapper.append(title, lead, select);
	if (hint) {
		showHint(current);
		select.setAttribute('aria-describedby', `${descriptionId(field.key)} ${hintId}`);
		wrapper.append(hint);
	} else {
		select.setAttribute('aria-describedby', descriptionId(field.key));
	}
	// 警告の行は選択肢のすぐ下に出す。(下に出すレンジより上)
	const lock = lockIfDependent(ctx, field.requires, { wrapper, control: select, kind: 'choice', key: field.key });

	// 特定の値を選んだときだけ下に出す項目 (先読みのカスタムの枚数など)。親の条件はレンジにも効かせる
	const reveal = field.reveal ? renderRange(ctx, field.reveal.field, field.requires) : null;

	/**
	 * 選んでいる値に合わせて、下に出す項目を出し入れする。
	 * @param {string} value 選ばれている値
	 * @returns {void}
	 */
	function showReveal(value) {
		if (reveal) reveal.hidden = value !== field.reveal.when;
	}

	select.addEventListener('change', () => {
		if (lock?.isLocked()) return;
		ctx.onChange({ [field.key]: toSaved(select.value) });
		showHint(select.value);
		showReveal(select.value);
	});

	if (reveal) {
		showReveal(current);
		wrapper.append(reveal);
	}
	appendChildren(ctx, wrapper, field.children);
	return wrapper;
}

/**
 * 項目を種類に合わせて組み立てる。
 * @param {RenderContext} ctx 描画の文脈
 * @param {object} field 項目の定義
 * @returns {HTMLElement} 項目
 */
function renderField(ctx, field) {
	return field.kind === 'toggle' ? renderToggle(ctx, field) : renderChoice(ctx, field);
}

/**
 * 定義表の見出しごとに項目を並べ、パネルへ足す。
 * @param {RenderContext} ctx 描画の文脈
 * @param {HTMLElement} panel 足し先
 * @param {readonly object[]} sections 見出しごとの項目 (createSections / createAdvancedSections の戻り値)
 * @returns {void}
 */
function appendSections(ctx, panel, sections) {
	for (const { heading, fields } of sections) {
		const section = ctx.doc.createElement('section');
		section.className = 'section';

		const title = ctx.doc.createElement('h2');
		title.textContent = heading;
		section.append(title);

		for (const field of fields) section.append(renderField(ctx, field));
		panel.append(section);
	}
}

/**
 * 設定タブの中身を組み立てる。
 * @param {RenderContext} ctx 描画の文脈
 * @param {() => void} onReset 初期化を確定したときの処理
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} パネル
 */
function renderSettingsPanel(ctx, onReset, strings) {
	const panel = ctx.doc.createElement('div');
	panel.className = 'panel settings';
	appendSections(ctx, panel, createSections(strings));

	const reset = renderConfirmRow(ctx.doc, createResetField(strings), onReset);
	// 設定項目との区切り。置き場所に依る見た目なので、汎用の確認の行ではなくここで付ける
	reset.classList.add('reset');
	panel.append(reset, renderBriefDisclaimer(ctx.doc, strings));
	return panel;
}

/**
 * 詳細設定タブの中身を組み立てる。
 * @param {RenderContext} ctx 描画の文脈
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} パネル
 */
function renderAdvancedPanel(ctx, strings) {
	const panel = ctx.doc.createElement('div');
	panel.className = 'panel advanced';
	appendSections(ctx, panel, createAdvancedSections(strings));
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

	// 子の項目の非活性は、保存の完了を待たずに今の画面の値で決める。(別のタブの親を持つ項目もあるので 1 つの state を共有する)
	const ctx = {
		doc,
		state: { ...settings },
		rich: supportsRichOptions(doc.defaultView),
		locks: [],
		onChange: (patch) => {
			Object.assign(ctx.state, patch);
			refreshLocks();
			onChange(patch);
		},
	};
	/**
	 * 親の条件を持つ項目の非活性を、今の値に合わせる。満たしていない最初の条件 (外側の親) の文言で警告する。
	 * @returns {void}
	 */
	function refreshLocks() {
		for (const { requires, lock } of ctx.locks) {
			const unmet = requires.find((one) => !isRequirementMet(one, ctx.state));
			lock.setLocked(Boolean(unmet), unmet?.message);
		}
	}

	const panels = {
		settings: renderSettingsPanel(ctx, onReset, strings),
		advanced: renderAdvancedPanel(ctx, strings),
		license: renderLicensePanel(doc, strings),
	};
	refreshLocks();
	const entries = createTabs(strings).map(({ id, label }) => ({ id, label, panel: panels[id] }));
	const tabs = renderTabs(doc, entries, { label: strings.popup.TABS_LABEL, initialId: initialTab });

	parts.push(tabs.list, ...entries.map(({ panel }) => panel));
	root.replaceChildren(...parts);
	return { currentTab: tabs.currentId };
}
