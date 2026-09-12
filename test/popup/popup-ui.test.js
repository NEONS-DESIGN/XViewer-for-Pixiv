import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPopup, resolveTheme } from '../../src/popup/popup-ui.js';
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';
import { SETTINGS_DEFAULTS, POPUP_THEMES } from '../../src/common/constants.js';
import { PROJECT_LICENSE, THIRD_PARTY } from '../../src/common/licenses.js';

/**
 * リスナと dataset を覚える要素の代わり。
 * jsdom を入れずに済ませるため、popup が使う口だけを備える。
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function fakeElement(tag) {
	let text = '';
	const element = {
		tag,
		children: [],
		parent: null,
		attributes: {},
		dataset: {},
		innerHTML: '',
		className: '',
		type: '',
		value: '',
		checked: false,
		title: '',
		hidden: false,
		focused: false,
		listeners: {},
		appendChild(child) { child.parent = element; element.children.push(child); return child; },
		append(...nodes) { for (const node of nodes) element.appendChild(node); },
		replaceChildren(...nodes) {
			element.children = [];
			text = '';
			element.append(...nodes);
		},
		setAttribute(name, value) { element.attributes[name] = String(value); },
		getAttribute(name) { return element.attributes[name] ?? null; },
		removeAttribute(name) { delete element.attributes[name]; },
		addEventListener(type, handler) { (element.listeners[type] ??= []).push(handler); },
		focus() { element.focused = true; },
		dispatch(type, event = {}) {
			for (const handler of [...(element.listeners[type] ?? [])]) handler(event);
		},
	};
	Object.defineProperty(element, 'textContent', {
		get() {
			if (element.children.length === 0) return text;
			return element.children.map((child) => child.textContent).join('');
		},
		set(value) { text = value; element.children = []; },
	});
	return element;
}

/**
 * document の代わり。
 * @param {{rich?: boolean, prefersLight?: boolean}} [options] 環境の指定
 * @returns {object} doc の代わり
 */
function fakeDoc(options = {}) {
	const doc = fakeElement('#document');
	doc.createElement = (tag) => fakeElement(tag);
	doc.createElementNS = (_ns, tag) => fakeElement(tag);
	doc.createTextNode = (value) => {
		const node = fakeElement('#text');
		node.textContent = value;
		return node;
	};
	doc.createDocumentFragment = () => fakeElement('#fragment');
	doc.documentElement = fakeElement('html');
	doc.defaultView = {
		CSS: { supports: () => options.rich === true },
		matchMedia: (query) => ({ matches: options.prefersLight === true && query.includes('light') }),
	};
	return doc;
}

/**
 * data-role で要素を探す。
 * @param {object} node 探し始める要素
 * @param {string} role 探す data-role
 * @returns {object|null} 見つかった要素
 */
function find(node, role) {
	if (node.dataset?.role === role) return node;
	for (const child of node.children ?? []) {
		const found = find(child, role);
		if (found) return found;
	}
	return null;
}

/**
 * タグ名で要素を集める。
 * @param {object} node 探し始める要素
 * @param {string} tag タグ名
 * @returns {object[]} 見つかった要素
 */
function collect(node, tag) {
	const found = node.tag === tag ? [node] : [];
	for (const child of node.children ?? []) found.push(...collect(child, tag));
	return found;
}

/**
 * createIcon が描いた svg から図形の名前を割り出す。
 * @param {object} icon svg の代わり
 * @returns {string|undefined} ICON_SHAPES のキー
 */
function iconName(icon) {
	return Object.keys(ICON_SHAPES).find((name) => ICON_SHAPES[name].markup === icon.innerHTML);
}

/**
 * popup を組み立てる。
 * @param {object} [overrides] settings / 環境 / コールバックの差し替え
 * @returns {object} doc / root / changes / resets をまとめたもの
 */
function build(overrides = {}) {
	const { settings = {}, rich = false, prefersLight = false, ...rest } = overrides;
	const doc = fakeDoc({ rich, prefersLight });
	const root = fakeElement('main');
	const changes = [];
	let resets = 0;
	renderPopup({
		doc,
		root,
		settings: { ...SETTINGS_DEFAULTS, ...settings },
		onChange: (patch) => changes.push(patch),
		onReset: () => { resets += 1; },
		...rest,
	});
	return { doc, root, changes, resets: () => resets };
}

test('設定タブの見出しは ビュワー / 画像 / 操作 の順に並ぶ', () => {
	const { root } = build();
	const headings = collect(find(root, 'panel-settings'), 'h2');
	assert.deepEqual(headings.map((heading) => heading.textContent), ['ビュワー', '画像', '操作']);
});

test('ビュワーの見出しにはタイトルとテーマの切り替えボタンが並ぶ', () => {
	const { root } = build();
	assert.equal(collect(root, 'h1')[0].textContent, 'GridViewer for Pixiv');
	assert.ok(find(root, 'theme-toggle'));
});

test('チェックボックスは設定値で初期化される', () => {
	const { root } = build({ settings: { enabled: false, showSidebar: true, closeOnBackdrop: false } });
	assert.equal(find(root, 'enabled').checked, false);
	assert.equal(find(root, 'showSidebar').checked, true);
	assert.equal(find(root, 'closeOnBackdrop').checked, false);
});

test('チェックボックスを変えると そのキーで onChange に届く', () => {
	const { root, changes } = build({ settings: { enabled: true } });
	const input = find(root, 'enabled');
	input.checked = false;
	input.dispatch('change');
	assert.deepEqual(changes, [{ enabled: false }]);
});

test('チェックボックスはスイッチとして読み上げられる', () => {
	const { root } = build({ settings: { enabled: true } });
	// 見た目を pixiv 本体のスイッチに合わせてあるので、役割も switch で伝える
	assert.equal(find(root, 'enabled').getAttribute('role'), 'switch');
});

test('セレクトは設定値で初期化される', () => {
	const { root } = build({ settings: { imageQuality: 'original', gridTabSkip: 'none', prefetch: 1 } });
	assert.equal(find(root, 'imageQuality').value, 'original');
	assert.equal(find(root, 'gridTabSkip').value, 'none');
	assert.equal(find(root, 'prefetch').value, '1');
});

test('先読みの変更は数値で onChange に届く', () => {
	// select の値は文字列。保存は数値で持つので、ここで戻さないと次回の読み込みで既定へ落ちる
	const { root, changes } = build();
	const select = find(root, 'prefetch');
	select.value = '0';
	select.dispatch('change');
	assert.deepEqual(changes, [{ prefetch: 0 }]);
});

test('選択肢に無い値が来たら既定へ倒して描く', () => {
	const { root } = build({ settings: { imageQuality: 'こわれた', prefetch: 99 } });
	assert.equal(find(root, 'imageQuality').value, SETTINGS_DEFAULTS.imageQuality);
	assert.equal(find(root, 'prefetch').value, String(SETTINGS_DEFAULTS.prefetch));
});

test('保存値が light なら data-theme は light になる', () => {
	const { doc } = build({ settings: { popupTheme: POPUP_THEMES.LIGHT } });
	assert.equal(doc.documentElement.dataset.theme, 'light');
});

test('保存値が system のときは OS の設定に従う', () => {
	const light = build({ settings: { popupTheme: POPUP_THEMES.SYSTEM }, prefersLight: true });
	assert.equal(light.doc.documentElement.dataset.theme, 'light');
	const dark = build({ settings: { popupTheme: POPUP_THEMES.SYSTEM }, prefersLight: false });
	assert.equal(dark.doc.documentElement.dataset.theme, 'dark');
});

test('保存値が壊れていてもダークで描ける', () => {
	const { doc } = build({ settings: { popupTheme: 'むらさき' } });
	assert.equal(doc.documentElement.dataset.theme, 'dark');
});

test('テーマのボタンは押すと何になるかを示す', () => {
	// ダーク表示中は「ライトにする」= 太陽。今の状態は画面の配色そのものが伝えている
	const { root } = build({ settings: { popupTheme: POPUP_THEMES.DARK } });
	const button = find(root, 'theme-toggle');
	assert.equal(iconName(button.children[0]), 'lightMode');
	assert.equal(button.getAttribute('aria-label'), 'ライトモードに切り替える');
});

test('テーマのボタンを押すと配色とアイコンが入れ替わる', () => {
	const { doc, root } = build({ settings: { popupTheme: POPUP_THEMES.DARK } });
	const button = find(root, 'theme-toggle');
	button.dispatch('click');
	assert.equal(doc.documentElement.dataset.theme, 'light');
	assert.equal(iconName(button.children[0]), 'darkMode');
	assert.equal(button.getAttribute('aria-label'), 'ダークモードに切り替える');
	button.dispatch('click');
	assert.equal(doc.documentElement.dataset.theme, 'dark');
	assert.equal(iconName(button.children[0]), 'lightMode');
});

test('テーマのボタンを押すと popupTheme が onChange に届く', () => {
	const { root, changes } = build({ settings: { popupTheme: POPUP_THEMES.DARK } });
	find(root, 'theme-toggle').dispatch('click');
	assert.deepEqual(changes, [{ popupTheme: POPUP_THEMES.LIGHT }]);
});

test('system から切り替えると、今見えている配色の逆が保存される', () => {
	// OS がライトなら画面はライト。押したときに保存すべきはダーク
	const { root, changes } = build({ settings: { popupTheme: POPUP_THEMES.SYSTEM }, prefersLight: true });
	find(root, 'theme-toggle').dispatch('click');
	assert.deepEqual(changes, [{ popupTheme: POPUP_THEMES.DARK }]);
});

test('初期化のボタンを押すと確認の行に置き換わる', () => {
	const { root } = build();
	find(root, 'reset').dispatch('click');
	assert.ok(find(root, 'reset-confirmation'));
	assert.equal(find(root, 'reset'), null);
	assert.equal(find(root, 'reset-cancel').textContent, 'やめる');
	assert.equal(find(root, 'reset-confirm').textContent, '初期化する');
});

test('確認の行ではフォーカスが やめる に当たる', () => {
	// 連打で 2 回目の入力が「初期化する」に落ちないようにする
	const { root } = build();
	find(root, 'reset').dispatch('click');
	assert.equal(find(root, 'reset-cancel').focused, true);
});

test('やめるを押すと元のボタンへ戻る', () => {
	const { root, resets } = build();
	find(root, 'reset').dispatch('click');
	find(root, 'reset-cancel').dispatch('click');
	assert.ok(find(root, 'reset'));
	assert.equal(find(root, 'reset-confirmation'), null);
	assert.equal(resets(), 0);
});

test('Escape で確認の行を取り消す', () => {
	const { root } = build();
	find(root, 'reset').dispatch('click');
	let prevented = false;
	find(root, 'reset-confirmation').dispatch('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
	assert.equal(prevented, true);
	assert.ok(find(root, 'reset'));
});

test('初期化するを押すと onReset が呼ばれる', () => {
	const { root, resets } = build();
	find(root, 'reset').dispatch('click');
	find(root, 'reset-confirm').dispatch('click');
	assert.equal(resets(), 1);
});

test('選択肢を装飾できる環境では説明を選択肢の中へ入れる', () => {
	const { root } = build({ rich: true, settings: { imageQuality: 'regular' } });
	const select = find(root, 'imageQuality');
	const options = select.children.filter((child) => child.tag === 'option');
	assert.equal(options.length, 2);
	assert.equal(find(options[0], 'option-label').textContent, '標準 (長辺 1200px)');
	assert.ok(find(options[0], 'option-hint').textContent.length > 0);
	// 閉じた状態を自前で描くための入れ物
	assert.ok(select.children.some((child) => child.tag === 'button'));
});

test('装飾に対応しない環境では素の選択肢にして、説明をセレクトの下に出す', () => {
	const { root } = build({ rich: false, settings: { imageQuality: 'regular' } });
	const select = find(root, 'imageQuality');
	const options = select.children.filter((child) => child.tag === 'option');
	assert.equal(options.length, 2);
	assert.equal(options[0].textContent, '標準 (長辺 1200px)');
	assert.equal(find(options[0], 'option-label'), null);
	assert.ok(find(root, 'imageQuality-hint').textContent.length > 0);
});

test('装飾に対応しない環境では、下の説明が選び直しに追従する', () => {
	// 説明を固定にすると、選び直したときに手元の説明と実際の挙動が食い違う
	const { root } = build({ rich: false, settings: { imageQuality: 'regular' } });
	const select = find(root, 'imageQuality');
	const before = find(root, 'imageQuality-hint').textContent;
	select.value = 'original';
	select.dispatch('change');
	assert.notEqual(find(root, 'imageQuality-hint').textContent, before);
});

test('フィールド全体の説明は装飾の可否によらず出す', () => {
	for (const rich of [true, false]) {
		const { root } = build({ rich });
		assert.ok(find(root, 'imageQuality-description').textContent.length > 0, `rich=${rich}`);
	}
});

test('notice を渡すと読み上げに届く一行が出る', () => {
	const { root } = build({ notice: '保存できませんでした' });
	const notice = find(root, 'notice');
	assert.equal(notice.textContent, '保存できませんでした');
	assert.equal(notice.getAttribute('role'), 'alert');
});

test('notice が無ければ一行は出さない', () => {
	const { root } = build();
	assert.equal(find(root, 'notice'), null);
});

test('非公式である旨の断りを必ず出す', () => {
	const { root } = build();
	const disclaimer = find(root, 'disclaimer');
	// pixiv の商標ガイドラインが求める 2 つの表記が両方揃っていること
	assert.match(disclaimer.textContent, /非公式/);
	assert.match(disclaimer.textContent, /作成・配布するものではありません/);
});

/* --- タブ ------------------------------------------------------------- */

test('タブは 設定 / ライセンス の 2 つ', () => {
	const { root } = build();
	const tabs = collect(root, 'button').filter((button) => button.getAttribute('role') === 'tab');
	assert.deepEqual(tabs.map((tab) => tab.textContent), ['設定', 'ライセンス']);
});

test('開いた直後は設定タブが選ばれている', () => {
	const { root } = build();
	assert.equal(find(root, 'tab-settings').getAttribute('aria-selected'), 'true');
	assert.equal(find(root, 'tab-license').getAttribute('aria-selected'), 'false');
	assert.equal(find(root, 'panel-settings').hidden, false);
	assert.equal(find(root, 'panel-license').hidden, true);
});

test('タブを押すと選択とパネルの表示が入れ替わる', () => {
	const { root } = build();
	find(root, 'tab-license').dispatch('click');
	assert.equal(find(root, 'tab-settings').getAttribute('aria-selected'), 'false');
	assert.equal(find(root, 'tab-license').getAttribute('aria-selected'), 'true');
	assert.equal(find(root, 'panel-settings').hidden, true);
	assert.equal(find(root, 'panel-license').hidden, false);
});

test('タブは aria-controls で自分のパネルを指す', () => {
	const { root } = build();
	for (const id of ['settings', 'license']) {
		const panelId = find(root, `panel-${id}`).attributes.id;
		assert.ok(panelId, `panel-${id} に id が無い`);
		assert.equal(find(root, `tab-${id}`).getAttribute('aria-controls'), panelId);
	}
});

test('Tab キーで止まるのは選択中のタブだけ', () => {
	// roving tabindex。3 つ並んだタブを順に踏まずにパネル本体へ入れるようにする
	const { root } = build();
	assert.equal(find(root, 'tab-settings').getAttribute('tabindex'), '0');
	assert.equal(find(root, 'tab-license').getAttribute('tabindex'), '-1');
});

test('右キーで次のタブへ移り、フォーカスも付いてくる', () => {
	const { root } = build();
	find(root, 'tabs').dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
	assert.equal(find(root, 'tab-license').getAttribute('aria-selected'), 'true');
	assert.equal(find(root, 'tab-license').focused, true);
});

test('左キーは端で止まらず反対の端へ回る', () => {
	const { root } = build();
	find(root, 'tabs').dispatch('keydown', { key: 'ArrowLeft', preventDefault() {} });
	assert.equal(find(root, 'tab-license').getAttribute('aria-selected'), 'true');
});

test('Home と End で端のタブへ飛ぶ', () => {
	const { root } = build();
	find(root, 'tabs').dispatch('keydown', { key: 'End', preventDefault() {} });
	assert.equal(find(root, 'tab-license').getAttribute('aria-selected'), 'true');
	find(root, 'tabs').dispatch('keydown', { key: 'Home', preventDefault() {} });
	assert.equal(find(root, 'tab-settings').getAttribute('aria-selected'), 'true');
});

test('タブに関係ないキーは握りつぶさない', () => {
	const { root } = build();
	let prevented = false;
	find(root, 'tabs').dispatch('keydown', { key: 'a', preventDefault() { prevented = true; } });
	assert.equal(prevented, false);
	assert.equal(find(root, 'tab-settings').getAttribute('aria-selected'), 'true');
});

test('タブを往復しても設定タブの状態は失われない', () => {
	// 切り替えで描き直していたら、確認の行もチェックの状態も消える
	const { root } = build({ settings: { enabled: false } });
	find(root, 'reset').dispatch('click');
	find(root, 'tab-license').dispatch('click');
	find(root, 'tab-settings').dispatch('click');
	assert.ok(find(root, 'reset-confirmation'), '確認の行が消えている');
	assert.equal(find(root, 'enabled').checked, false);
});

/* --- ライセンスタブ ---------------------------------------------------- */

test('ライセンスタブに第三者の成果物が並ぶ', () => {
	const { root } = build();
	const text = find(root, 'panel-license').textContent;
	for (const item of THIRD_PARTY) {
		assert.ok(text.includes(item.name), `${item.name} が無い`);
		assert.ok(text.includes(item.license), `${item.name} のライセンス名が無い`);
		assert.ok(text.includes(item.copyright), `${item.name} の権利者が無い`);
	}
});

test('ライセンスタブにこの拡張自身のライセンスも出す', () => {
	const { root } = build();
	const text = find(root, 'panel-license').textContent;
	assert.ok(text.includes(PROJECT_LICENSE.name));
	assert.ok(text.includes(PROJECT_LICENSE.copyright));
});

test('免責の本文はライセンスタブにある', () => {
	const { root } = build();
	assert.ok(find(find(root, 'panel-license'), 'disclaimer'), '免責がライセンスタブの外にある');
});

test('設定タブの末尾には非公式である旨の 1 行が残る', () => {
	// タブを切り替えない利用者にも、非公式であることだけは届かせる
	const { root } = build();
	const brief = find(find(root, 'panel-settings'), 'disclaimer-brief');
	assert.ok(brief, '設定タブに 1 行が無い');
	assert.match(brief.textContent, /非公式/);
});

test('外部リンクは新しいタブで開き、参照元を渡さない', () => {
	const { root } = build();
	const links = collect(find(root, 'panel-license'), 'a');
	assert.ok(links.length > 0, 'リンクが 1 つも無い');
	for (const link of links) {
		assert.equal(link.getAttribute('target'), '_blank');
		assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
	}
});

test('描き直しても前の中身は残らない', () => {
	const { doc, root } = build();
	const before = collect(root, 'h2').length;
	renderPopup({ doc, root, settings: { ...SETTINGS_DEFAULTS }, onChange() {}, onReset() {} });
	assert.equal(collect(root, 'h2').length, before);
});

test('resolveTheme は明示の選択を OS の設定より優先する', () => {
	const win = { matchMedia: () => ({ matches: true }) };
	assert.equal(resolveTheme(POPUP_THEMES.DARK, win), POPUP_THEMES.DARK);
	assert.equal(resolveTheme(POPUP_THEMES.LIGHT, { matchMedia: () => ({ matches: false }) }), POPUP_THEMES.LIGHT);
	assert.equal(resolveTheme(POPUP_THEMES.SYSTEM, win), POPUP_THEMES.LIGHT);
});

test('resolveTheme は matchMedia が無くてもダークを返す', () => {
	assert.equal(resolveTheme(POPUP_THEMES.SYSTEM, undefined), POPUP_THEMES.DARK);
	assert.equal(resolveTheme(POPUP_THEMES.SYSTEM, {}), POPUP_THEMES.DARK);
});
