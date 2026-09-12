/**
 * 設定画面の描画。
 * 画面の中身はすべて下の定義表から組み立てる。項目を足すときは表へ 1 行足すだけで済む。
 *
 * 保存ボタンは作らず、変更のたびに保存する (UI_DESIGN_KIT §9)。
 * 見た目の反映は保存の完了を待たない。待つと押した手応えが遅れるため。
 */
import { createIcon } from '../common/icons.js';
import { supportsRichOptions } from '../common/rich-select.js';
import {
	IMAGE_QUALITY,
	PREFETCH_CHOICES,
	GRID_TAB_SKIP,
	POPUP_THEMES,
	THEME_TOGGLE,
	SETTINGS_DEFAULTS,
} from '../common/constants.js';

/** 画面の題名。拡張の名前をそのまま出す。 */
const TITLE = 'PixivMaster';

/** 確認の行を取り消すキー名。 */
const ESCAPE_KEY = 'Escape';

/** OS の配色を尋ねるメディアクエリ。 */
const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** 「設定を初期化」の文言。確認の行では「やめる」を左、「初期化する」を右に並べる。 */
const RESET_FIELD = Object.freeze({
	label: '設定を初期化',
	description: '配色を含むすべての設定を既定に戻します。',
	cancel: 'やめる',
	confirm: '初期化する',
});

/**
 * 画面の中身。見出しごとに関連する項目をまとめる。
 *
 * kind が 'toggle' ならチェックボックス、'choice' なら選択肢。
 * choice の numeric は「保存は数値で持つ」という印。select の値は常に文字列なので、
 * これが無いと次に読み込んだときに型が合わず既定へ落ちる。
 */
const SECTIONS = Object.freeze([
	Object.freeze({
		heading: 'ビュワー',
		fields: Object.freeze([
			Object.freeze({
				kind: 'toggle',
				key: 'enabled',
				label: 'ビュワーを使う',
				description: 'オフにすると pixiv 標準の動作に戻ります。',
			}),
			Object.freeze({
				kind: 'toggle',
				key: 'showSidebar',
				label: 'サイドバーを表示する',
				description: '投稿文・タグ・いいね数・コメントを画像の横に出します。',
			}),
		]),
	}),
	Object.freeze({
		heading: '画像',
		fields: Object.freeze([
			Object.freeze({
				kind: 'choice',
				key: 'imageQuality',
				label: '画像の解像度',
				description: 'ビュワーで読み込む画像の大きさです。',
				options: Object.freeze([
					Object.freeze({
						value: IMAGE_QUALITY.REGULAR,
						label: '標準 (長辺 1200px)',
						description: '読み込みが軽く、普段の閲覧に向きます。',
					}),
					Object.freeze({
						value: IMAGE_QUALITY.ORIGINAL,
						label: '原寸',
						description: '鮮明ですが、読み込みが重くなります。',
					}),
				]),
			}),
			Object.freeze({
				kind: 'choice',
				key: 'prefetch',
				numeric: true,
				label: '先読み',
				description: '次に見る画像を先に読み込んでおくと、切り替えが速くなります。',
				options: Object.freeze([
					Object.freeze({
						value: String(PREFETCH_CHOICES[0]),
						label: 'しない',
						description: '切り替えるたびに読み込みます。通信量を抑えられます。',
					}),
					Object.freeze({
						value: String(PREFETCH_CHOICES[1]),
						label: '前後 1 枚',
						description: '隣の 1 枚だけ先に読み込みます。',
					}),
					Object.freeze({
						value: String(PREFETCH_CHOICES[2]),
						label: '前後 3 枚',
						description: '3 枚先まで読み込みます。続けて見るときに滑らかです。',
					}),
				]),
			}),
		]),
	}),
	Object.freeze({
		heading: '操作',
		fields: Object.freeze([
			Object.freeze({
				kind: 'toggle',
				key: 'closeOnBackdrop',
				label: '背景クリックで閉じる',
				description: '画像の外側を押すと閉じます。誤って閉じるならオフに。',
			}),
			Object.freeze({
				kind: 'choice',
				key: 'gridTabSkip',
				label: 'グリッドの Tab 移動',
				description: 'Tab で次の作品へ移るときの飛ばし方です。',
				options: Object.freeze([
					Object.freeze({
						value: GRID_TAB_SKIP.BOTH,
						label: 'ブックマークとタイトルを飛ばす',
						description: 'カードは「サムネ → ブックマーク → タイトル」の 3 つを順に辿ります。飛ばすと Tab 1 回で次の作品へ移れ、飛ばした操作はビュワーの中で行えます。',
					}),
					Object.freeze({
						value: GRID_TAB_SKIP.TITLE,
						label: 'タイトルだけ飛ばす',
						description: 'ブックマークはグリッドのまま押せます。',
					}),
					Object.freeze({
						value: GRID_TAB_SKIP.NONE,
						label: '飛ばさない',
						description: 'pixiv 標準の順序のままにします。',
					}),
				]),
			}),
		]),
	}),
]);

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
 * チェックボックスの項目を組み立てる。
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
	input.checked = Boolean(settings[field.key]);
	input.dataset.role = field.key;
	input.addEventListener('change', () => onChange({ [field.key]: input.checked }));

	const text = doc.createElement('span');
	text.className = 'label';
	text.textContent = field.label;

	label.append(input, text);

	const description = doc.createElement('p');
	description.className = 'description';
	description.dataset.role = `${field.key}-description`;
	description.textContent = field.description;

	wrapper.append(label, description);
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
 * @returns {HTMLElement} 項目
 */
function renderChoice(doc, field, settings, onChange) {
	const values = field.options.map((option) => option.value);
	const saved = String(settings[field.key]);
	const current = values.includes(saved) ? saved : String(SETTINGS_DEFAULTS[field.key]);
	const rich = supportsRichOptions(doc.defaultView);

	const wrapper = doc.createElement('div');
	wrapper.className = 'field choice';

	const title = doc.createElement('h3');
	title.className = 'label';
	title.textContent = field.label;

	const lead = doc.createElement('p');
	lead.className = 'description';
	lead.dataset.role = `${field.key}-description`;
	lead.textContent = field.description;

	const select = doc.createElement('select');
	select.dataset.role = field.key;
	// 見出しは h3 であってラベルではないため、読み上げ環境にはこの名前が要る
	select.setAttribute('aria-label', field.label);

	if (rich) {
		// 閉じた状態の見た目を受け持つ要素。中の selectedcontent へ、選んでいる
		// 選択肢の中身が複製される (説明の側は CSS で隠す)
		const button = doc.createElement('button');
		button.append(doc.createElement('selectedcontent'));
		select.append(button);
	}

	for (const option of field.options) select.append(createChoiceOption(doc, option, rich));
	select.value = current;

	select.addEventListener('change', () => {
		const value = field.numeric ? Number(select.value) : select.value;
		onChange({ [field.key]: value });
	});

	wrapper.append(title, lead, select);

	if (rich) {
		// 選択肢ごとの説明は選択肢の中にある。外にも出すと同じ文が二度出る
		return wrapper;
	}

	// 素の select は選んでいない項目の説明を出せない。説明を固定にすると、選び直した
	// ときに手元の説明と実際の挙動が食い違うため、選択に追従させる
	const hint = doc.createElement('p');
	hint.className = 'description';
	hint.dataset.role = `${field.key}-hint`;

	/**
	 * 選んでいる項目の説明を出す。
	 * @param {string} value 選ばれている値
	 * @returns {void}
	 */
	function showHint(value) {
		hint.textContent = field.options.find((option) => option.value === value)?.description ?? '';
	}

	showHint(current);
	select.addEventListener('change', () => showHint(select.value));
	wrapper.append(hint);
	return wrapper;
}

/**
 * 「設定を初期化」のボタンと、押した後の確認の行を組み立てる。
 * 確認は popup の中に出す。window.confirm はネイティブのダイアログが popup の上に浮き、
 * 環境によっては popup が閉じて操作が途切れる (UI_DESIGN_KIT §10)。
 * @param {Document} doc 対象のドキュメント
 * @param {() => void} onReset 初期化を確定したときの処理
 * @returns {HTMLElement} 置き場 (ボタンと確認の行を入れ替える)
 */
function renderResetField(doc, onReset) {
	const holder = doc.createElement('div');
	holder.className = 'reset';

	const reset = doc.createElement('button');
	reset.type = 'button';
	reset.textContent = RESET_FIELD.label;
	reset.dataset.role = 'reset';

	/**
	 * 確認の行を片付けて元のボタンへ戻す。
	 * フォーカスも戻すのは、確認の行ごとフォーカスの当たっていた要素が消えると
	 * キーボード操作の現在地が失われるため。
	 * @returns {void}
	 */
	function showButton() {
		holder.replaceChildren(reset);
		reset.focus();
	}

	/**
	 * ボタンを確認の行に置き換える。
	 * 「やめる」を左 (元のボタンと同じ位置) に置き、フォーカスもそこへ移す。
	 * 連打で 2 回目の入力が「初期化する」に落ちないようにするため。
	 * @returns {void}
	 */
	function showConfirmation() {
		const row = doc.createElement('div');
		row.className = 'reset-confirmation';
		row.dataset.role = 'reset-confirmation';
		row.setAttribute('role', 'group');
		row.setAttribute('aria-label', RESET_FIELD.description);

		const text = doc.createElement('p');
		text.className = 'description';
		text.textContent = RESET_FIELD.description;

		const buttons = doc.createElement('div');
		buttons.className = 'reset-buttons';

		const cancel = doc.createElement('button');
		cancel.type = 'button';
		cancel.textContent = RESET_FIELD.cancel;
		cancel.dataset.role = 'reset-cancel';
		cancel.addEventListener('click', showButton);

		const confirm = doc.createElement('button');
		confirm.type = 'button';
		confirm.textContent = RESET_FIELD.confirm;
		confirm.dataset.role = 'reset-confirm';
		confirm.addEventListener('click', () => onReset());

		row.addEventListener('keydown', (event) => {
			if (event.key !== ESCAPE_KEY) return;
			event.preventDefault();
			showButton();
		});

		buttons.append(cancel, confirm);
		row.append(text, buttons);
		holder.replaceChildren(row);
		cancel.focus();
	}

	reset.addEventListener('click', showConfirmation);
	holder.append(reset);
	return holder;
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
 * @returns {void}
 */
export function renderPopup({ doc, root, settings, onChange, onReset, notice = null }) {
	const theme = resolveTheme(settings.popupTheme, doc.defaultView);
	applyTheme(doc, theme);

	const parts = [renderHeader(doc, theme, onChange)];

	if (notice) {
		// 保存の失敗など。黙って消えると、利用者は変えたつもりのまま画面を閉じてしまう
		const message = doc.createElement('p');
		message.className = 'notice';
		message.dataset.role = 'notice';
		message.setAttribute('role', 'alert');
		message.textContent = notice;
		parts.push(message);
	}

	for (const { heading, fields } of SECTIONS) {
		const section = doc.createElement('section');
		section.className = 'section';

		const title = doc.createElement('h2');
		title.textContent = heading;
		section.append(title);

		for (const field of fields) {
			section.append(field.kind === 'toggle'
				? renderToggle(doc, field, settings, onChange)
				: renderChoice(doc, field, settings, onChange));
		}
		parts.push(section);
	}

	parts.push(renderResetField(doc, onReset));
	root.replaceChildren(...parts);
}
