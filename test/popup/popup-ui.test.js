import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPopup, resolveTheme } from '../../src/popup/popup-ui.js';
import { createSections } from '../../src/popup/sections.js';
import { SETTINGS_DEFAULTS, POPUP_THEMES, PREFETCH_CHOICES } from '../../src/common/constants.js';
import { PROJECT_LICENSE, THIRD_PARTY } from '../../src/common/licenses.js';
import { createStrings } from '../../src/i18n/index.js';
import { fakeElement, findRole, iconName } from '../helpers/dom.js';
import { fakePopupDoc } from '../helpers/popup.js';

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
 * popup を組み立てる。
 * @param {object} [overrides] settings / 環境 / コールバックの差し替え
 * @returns {object} doc / root / changes / resets をまとめたもの
 */
function build(overrides = {}) {
	const { settings = {}, rich = false, prefersLight = false, strings = createStrings('ja'), ...rest } = overrides;
	const doc = fakePopupDoc({ rich, prefersLight });
	const root = fakeElement('main');
	const changes = [];
	let resets = 0;
	const screen = renderPopup({
		doc,
		root,
		settings: { ...SETTINGS_DEFAULTS, ...settings },
		strings,
		onChange: (patch) => changes.push(patch),
		onReset: () => { resets += 1; },
		...rest,
	});
	return { doc, root, changes, resets: () => resets, screen };
}

test('定義表のキーは popupTheme を除く全設定と 1 対 1 に対応する', () => {
	// タイポしたキーで saveSetting が成功し、読み込み側は既定へ倒すので誰も気づけない
	for (const lang of ['ja', 'en']) {
		const keys = createSections(createStrings(lang)).flatMap((section) => section.fields.map((field) => field.key));
		assert.equal(new Set(keys).size, keys.length, 'キーが重複している');
		assert.deepEqual(new Set([...keys, 'popupTheme']), new Set(Object.keys(SETTINGS_DEFAULTS)));
	}
});

test('先読みの選択肢は PREFETCH_CHOICES の値と並びから起こす', () => {
	const field = createSections(createStrings('ja')).flatMap((section) => section.fields).find((one) => one.key === 'prefetch');
	assert.deepEqual(field.options.map((option) => option.value), PREFETCH_CHOICES.map(String));
	for (const option of field.options) {
		assert.ok(option.label.length > 0 && option.description.length > 0, `${option.value} の文言が無い`);
	}
});

test('設定タブの見出しは ビュワー / 画像 / ユーザーページ / 操作 の順に並ぶ', () => {
	const { root } = build();
	const headings = collect(findRole(root, 'panel-settings'), 'h2');
	assert.deepEqual(headings.map((heading) => heading.textContent), ['ビュワー', '画像', 'ユーザーページ', '操作']);
});

test('設定画面の見出し行にはタイトルとテーマの切り替えボタンが並ぶ', () => {
	// ボタンの data-role は設定キー (popupTheme)。app.js が保存の失敗後にこの値でフォーカスを戻す
	const { root } = build();
	assert.equal(collect(root, 'h1')[0].textContent, 'XViewer for Pixiv');
	assert.equal(findRole(root, 'popupTheme').tag, 'button');
});

test('チェックボックスは設定値で初期化される', () => {
	const { root } = build({ settings: { enabled: false, showSidebar: true, closeOnBackdrop: false } });
	assert.equal(findRole(root, 'enabled').checked, false);
	assert.equal(findRole(root, 'showSidebar').checked, true);
	assert.equal(findRole(root, 'closeOnBackdrop').checked, false);
});

test('ピックアップ非表示は既定でオフ、切り替えると onChange に届く', () => {
	// 既定がオンだと、入れた覚えのない人の画面から欄が消える
	const { root, changes } = build();
	const input = findRole(root, 'hidePickup');
	assert.equal(input.checked, false);
	input.checked = true;
	input.dispatch('change');
	assert.deepEqual(changes, [{ hidePickup: true }]);
});

test('チェックボックスを変えると そのキーで onChange に届く', () => {
	const { root, changes } = build({ settings: { enabled: true } });
	const input = findRole(root, 'enabled');
	input.checked = false;
	input.dispatch('change');
	assert.deepEqual(changes, [{ enabled: false }]);
});

test('チェックボックスはスイッチとして読み上げられる', () => {
	const { root } = build({ settings: { enabled: true } });
	// 見た目を pixiv 本体のスイッチに合わせてあるので、役割も switch で伝える
	assert.equal(findRole(root, 'enabled').getAttribute('role'), 'switch');
});

test('セレクトは設定値で初期化される', () => {
	const { root } = build({ settings: { imageQuality: 'original', gridTabSkip: 'none', prefetch: 1 } });
	assert.equal(findRole(root, 'imageQuality').value, 'original');
	assert.equal(findRole(root, 'gridTabSkip').value, 'none');
	assert.equal(findRole(root, 'prefetch').value, '1');
});

test('サイドバーのスクロールは選んだ値が onChange に届く', () => {
	const { root, changes } = build({ settings: { sidebarScroll: 'comments' } });
	const select = findRole(root, 'sidebarScroll');
	assert.equal(select.value, 'comments');
	select.value = 'whole';
	select.dispatch('change');
	assert.deepEqual(changes, [{ sidebarScroll: 'whole' }]);
});

test('先読みの変更は数値で onChange に届く', () => {
	// select の値は文字列。保存は数値で持つので、ここで戻さないと次回の読み込みで既定へ落ちる
	const { root, changes } = build();
	const select = findRole(root, 'prefetch');
	select.value = '0';
	select.dispatch('change');
	assert.deepEqual(changes, [{ prefetch: 0 }]);
});

test('選択肢に無い値が来たら既定へ倒して描く', () => {
	const { root } = build({ settings: { imageQuality: 'こわれた', prefetch: 99 } });
	assert.equal(findRole(root, 'imageQuality').value, SETTINGS_DEFAULTS.imageQuality);
	assert.equal(findRole(root, 'prefetch').value, String(SETTINGS_DEFAULTS.prefetch));
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
	const button = findRole(root, 'popupTheme');
	assert.equal(iconName(button.children[0]), 'lightMode');
	assert.equal(button.getAttribute('aria-label'), 'ライトモードに切り替える');
});

test('テーマのボタンを押すと配色とアイコンが入れ替わる', () => {
	const { doc, root } = build({ settings: { popupTheme: POPUP_THEMES.DARK } });
	const button = findRole(root, 'popupTheme');
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
	findRole(root, 'popupTheme').dispatch('click');
	assert.deepEqual(changes, [{ popupTheme: POPUP_THEMES.LIGHT }]);
});

test('system から切り替えると、今見えている配色の逆が保存される', () => {
	// OS がライトなら画面はライト。押したときに保存すべきはダーク
	const { root, changes } = build({ settings: { popupTheme: POPUP_THEMES.SYSTEM }, prefersLight: true });
	findRole(root, 'popupTheme').dispatch('click');
	assert.deepEqual(changes, [{ popupTheme: POPUP_THEMES.DARK }]);
});

test('初期化のボタンを押すと確認の行に置き換わる', () => {
	const { root } = build();
	findRole(root, 'reset').dispatch('click');
	assert.ok(findRole(root, 'reset-confirmation'));
	assert.equal(findRole(root, 'reset'), null);
	assert.equal(findRole(root, 'reset-cancel').textContent, 'やめる');
	assert.equal(findRole(root, 'reset-confirm').textContent, '初期化する');
});

test('確認の行ではフォーカスが やめる に当たる', () => {
	// 連打で 2 回目の入力が「初期化する」に落ちないようにする
	const { root } = build();
	findRole(root, 'reset').dispatch('click');
	assert.equal(findRole(root, 'reset-cancel').focused, true);
});

test('やめるを押すと元のボタンへ戻る', () => {
	const { root, resets } = build();
	findRole(root, 'reset').dispatch('click');
	findRole(root, 'reset-cancel').dispatch('click');
	assert.ok(findRole(root, 'reset'));
	assert.equal(findRole(root, 'reset-confirmation'), null);
	assert.equal(resets(), 0);
});

test('Escape で確認の行を取り消す', () => {
	const { root } = build();
	findRole(root, 'reset').dispatch('click');
	let prevented = false;
	findRole(root, 'reset-confirmation').dispatch('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
	assert.equal(prevented, true);
	assert.ok(findRole(root, 'reset'));
});

test('初期化するを押すと onReset が呼ばれる', () => {
	const { root, resets } = build();
	findRole(root, 'reset').dispatch('click');
	findRole(root, 'reset-confirm').dispatch('click');
	assert.equal(resets(), 1);
});

test('選択肢を装飾できる環境では説明を選択肢の中へ入れる', () => {
	const { root } = build({ rich: true, settings: { imageQuality: 'regular' } });
	const select = findRole(root, 'imageQuality');
	const options = select.children.filter((child) => child.tag === 'option');
	assert.equal(options.length, 2);
	assert.equal(findRole(options[0], 'option-label').textContent, '標準 (長辺 1200px)');
	assert.ok(findRole(options[0], 'option-hint').textContent.length > 0);
	// 閉じた状態を自前で描くための入れ物
	assert.ok(select.children.some((child) => child.tag === 'button'));
});

test('装飾に対応しない環境では素の選択肢にして、説明をセレクトの下に出す', () => {
	const { root } = build({ rich: false, settings: { imageQuality: 'regular' } });
	const select = findRole(root, 'imageQuality');
	const options = select.children.filter((child) => child.tag === 'option');
	assert.equal(options.length, 2);
	assert.equal(options[0].textContent, '標準 (長辺 1200px)');
	assert.equal(findRole(options[0], 'option-label'), null);
	assert.ok(findRole(root, 'imageQuality-hint').textContent.length > 0);
});

test('装飾に対応しない環境では、下の説明が選び直しに追従する', () => {
	// 説明を固定にすると、選び直したときに手元の説明と実際の挙動が食い違う
	const { root } = build({ rich: false, settings: { imageQuality: 'regular' } });
	const select = findRole(root, 'imageQuality');
	const before = findRole(root, 'imageQuality-hint').textContent;
	select.value = 'original';
	select.dispatch('change');
	assert.notEqual(findRole(root, 'imageQuality-hint').textContent, before);
});

test('フィールド全体の説明は装飾の可否によらず出す', () => {
	for (const rich of [true, false]) {
		const { root } = build({ rich });
		assert.ok(findRole(root, 'imageQuality-description').textContent.length > 0, `rich=${rich}`);
	}
});

test('スイッチとセレクトは aria-describedby で説明文と結び付く', () => {
	// 読み上げ環境ではラベルしか聞こえず、説明文が届かない
	const { root } = build({ rich: true });
	const toggle = findRole(root, 'enabled');
	assert.equal(toggle.getAttribute('aria-describedby'), findRole(root, 'enabled-description').attributes.id);
	const select = findRole(root, 'imageQuality');
	assert.equal(select.getAttribute('aria-describedby'), findRole(root, 'imageQuality-description').attributes.id);
});

test('装飾に対応しない環境では、下の説明もセレクトの aria-describedby に入る', () => {
	const { root } = build({ rich: false });
	const select = findRole(root, 'imageQuality');
	const ids = select.getAttribute('aria-describedby').split(' ');
	assert.deepEqual(ids, [findRole(root, 'imageQuality-description').attributes.id, findRole(root, 'imageQuality-hint').attributes.id]);
});

test('セレクトの名前は見出し (h3) から aria-labelledby で引く', () => {
	// 見出しは label ではないので、結び付けないと読み上げに名前が無い。文言を二重に持たない
	const { root } = build();
	const select = findRole(root, 'imageQuality');
	const heading = collect(root, 'h3').find((one) => one.textContent === '画像の解像度');
	assert.equal(select.getAttribute('aria-labelledby'), heading.attributes.id);
	assert.equal(select.getAttribute('aria-label'), null);
});

test('notice を渡すと読み上げに届く一行が出る', () => {
	const { root } = build({ notice: '保存できませんでした' });
	const notice = findRole(root, 'notice');
	assert.equal(notice.textContent, '保存できませんでした');
	assert.equal(notice.getAttribute('role'), 'alert');
});

test('notice が無ければ一行は出さない', () => {
	const { root } = build();
	assert.equal(findRole(root, 'notice'), null);
});

test('非公式である旨の断りを必ず出す', () => {
	const { root } = build();
	const disclaimer = findRole(root, 'disclaimer');
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
	assert.equal(findRole(root, 'tab-settings').getAttribute('aria-selected'), 'true');
	assert.equal(findRole(root, 'tab-license').getAttribute('aria-selected'), 'false');
	assert.equal(findRole(root, 'panel-settings').hidden, false);
	assert.equal(findRole(root, 'panel-license').hidden, true);
});

test('タブを押すと選択とパネルの表示が入れ替わる', () => {
	const { root } = build();
	findRole(root, 'tab-license').dispatch('click');
	assert.equal(findRole(root, 'tab-settings').getAttribute('aria-selected'), 'false');
	assert.equal(findRole(root, 'tab-license').getAttribute('aria-selected'), 'true');
	assert.equal(findRole(root, 'panel-settings').hidden, true);
	assert.equal(findRole(root, 'panel-license').hidden, false);
});

test('タブは aria-controls で自分のパネルを指す', () => {
	const { root } = build();
	for (const id of ['settings', 'license']) {
		const panelId = findRole(root, `panel-${id}`).attributes.id;
		assert.ok(panelId, `panel-${id} に id が無い`);
		assert.equal(findRole(root, `tab-${id}`).getAttribute('aria-controls'), panelId);
	}
});

test('Tab キーで止まるのは選択中のタブだけ', () => {
	// roving tabindex。並んだタブを順に踏まずにパネル本体へ入れるようにする
	const { root } = build();
	assert.equal(findRole(root, 'tab-settings').getAttribute('tabindex'), '0');
	assert.equal(findRole(root, 'tab-license').getAttribute('tabindex'), '-1');
});

test('右キーで次のタブへ移り、フォーカスも付いてくる', () => {
	const { root } = build();
	findRole(root, 'tabs').dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
	assert.equal(findRole(root, 'tab-license').getAttribute('aria-selected'), 'true');
	assert.equal(findRole(root, 'tab-license').focused, true);
});

test('左キーは端で止まらず反対の端へ回る', () => {
	const { root } = build();
	findRole(root, 'tabs').dispatch('keydown', { key: 'ArrowLeft', preventDefault() {} });
	assert.equal(findRole(root, 'tab-license').getAttribute('aria-selected'), 'true');
});

test('Home と End で端のタブへ飛ぶ', () => {
	const { root } = build();
	findRole(root, 'tabs').dispatch('keydown', { key: 'End', preventDefault() {} });
	assert.equal(findRole(root, 'tab-license').getAttribute('aria-selected'), 'true');
	findRole(root, 'tabs').dispatch('keydown', { key: 'Home', preventDefault() {} });
	assert.equal(findRole(root, 'tab-settings').getAttribute('aria-selected'), 'true');
});

test('タブに関係ないキーは握りつぶさない', () => {
	const { root } = build();
	let prevented = false;
	findRole(root, 'tabs').dispatch('keydown', { key: 'a', preventDefault() { prevented = true; } });
	assert.equal(prevented, false);
	assert.equal(findRole(root, 'tab-settings').getAttribute('aria-selected'), 'true');
});

test('initialTab を渡すとそのタブが開いた状態で描く', () => {
	// 描き直しのたびに先頭へ戻ると、ライセンスを読んでいる途中で操作が続けられない
	const { root, screen } = build({ initialTab: 'license' });
	assert.equal(findRole(root, 'tab-license').getAttribute('aria-selected'), 'true');
	assert.equal(findRole(root, 'panel-settings').hidden, true);
	assert.equal(screen.currentTab(), 'license');
});

test('initialTab が無い・知らない id なら先頭のタブを開く', () => {
	assert.equal(build().screen.currentTab(), 'settings');
	assert.equal(build({ initialTab: 'unknown' }).screen.currentTab(), 'settings');
});

test('currentTab は切り替えに追従する', () => {
	const { root, screen } = build();
	findRole(root, 'tab-license').dispatch('click');
	assert.equal(screen.currentTab(), 'license');
});

test('パネル自身の tabindex は操作部品を持たないライセンスタブだけ', () => {
	// 設定タブに付けると Tab の停止が 1 つ増え、最初のスイッチへ行くのに 1 回多く押す
	const { root } = build();
	assert.equal(findRole(root, 'panel-license').getAttribute('tabindex'), '0');
	assert.equal(findRole(root, 'panel-settings').getAttribute('tabindex'), null);
});

test('タブの選択状態はクラスではなく aria-selected だけで持つ', () => {
	const { root } = build();
	findRole(root, 'tab-license').dispatch('click');
	for (const id of ['settings', 'license']) {
		assert.equal(findRole(root, `tab-${id}`).className, 'tab');
	}
});

test('タブを往復しても設定タブの状態は失われない', () => {
	// 切り替えで描き直していたら、確認の行もチェックの状態も消える
	const { root } = build({ settings: { enabled: false } });
	findRole(root, 'reset').dispatch('click');
	findRole(root, 'tab-license').dispatch('click');
	findRole(root, 'tab-settings').dispatch('click');
	assert.ok(findRole(root, 'reset-confirmation'), '確認の行が消えている');
	assert.equal(findRole(root, 'enabled').checked, false);
});

/* --- ライセンスタブ ---------------------------------------------------- */

test('ライセンスタブに第三者の成果物が並ぶ', () => {
	const { root } = build();
	const text = findRole(root, 'panel-license').textContent;
	for (const item of THIRD_PARTY) {
		assert.ok(text.includes(item.name), `${item.name} が無い`);
		assert.ok(text.includes(item.license), `${item.name} のライセンス名が無い`);
		assert.ok(text.includes(item.copyright), `${item.name} の権利者が無い`);
	}
});

test('第三者の成果物のライセンス名は本文へのリンクになっている', () => {
	// CC BY 4.0 §3(a)(1)(C) はライセンスの URI (かハイパーリンク) の表示を求める
	const { root } = build();
	const links = collect(findRole(root, 'panel-license'), 'a');
	for (const item of THIRD_PARTY) {
		const link = links.find((candidate) => candidate.href === item.licenseUrl);
		assert.ok(link, `${item.name} のライセンス本文へのリンクが無い`);
		assert.equal(link.textContent, item.license);
	}
});

test('ライセンスタブにこの拡張自身のライセンスも出す', () => {
	const { root } = build();
	const text = findRole(root, 'panel-license').textContent;
	assert.ok(text.includes(PROJECT_LICENSE.name));
	assert.ok(text.includes(PROJECT_LICENSE.copyright));
});

test('免責の本文はライセンスタブにある', () => {
	const { root } = build();
	assert.ok(findRole(findRole(root, 'panel-license'), 'disclaimer'), '免責がライセンスタブの外にある');
});

test('設定タブの末尾には非公式である旨の 1 行が残る', () => {
	// タブを切り替えない利用者にも、非公式であることだけは届かせる
	const { root } = build();
	const brief = findRole(findRole(root, 'panel-settings'), 'disclaimer-brief');
	assert.ok(brief, '設定タブに 1 行が無い');
	assert.match(brief.textContent, /非公式/);
});

test('外部リンクは新しいタブで開き、参照元を渡さない', () => {
	const { root } = build();
	const links = collect(findRole(root, 'panel-license'), 'a');
	assert.ok(links.length > 0, 'リンクが 1 つも無い');
	for (const link of links) {
		assert.equal(link.getAttribute('target'), '_blank');
		assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
	}
});

test('描き直しても前の中身は残らない', () => {
	const { doc, root } = build();
	const before = collect(root, 'h2').length;
	renderPopup({ doc, root, settings: { ...SETTINGS_DEFAULTS }, strings: createStrings('ja'), onChange() {}, onReset() {} });
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

/* --- 英語のカタログ ----------------------------------------------------- */

test('英語のカタログで設定画面が英語になる', () => {
	const { root } = build({ strings: createStrings('en') });
	assert.match(root.textContent, /Use the viewer/);
	assert.match(root.textContent, /Reset settings/);
	assert.match(root.textContent, /Licenses/);
	assert.match(root.textContent, /Settings/);
	assert.match(root.textContent, /Disclaimer/);
});
