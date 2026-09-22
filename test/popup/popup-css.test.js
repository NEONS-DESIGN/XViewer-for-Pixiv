import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getArtwork } from '../../scripts/icon-svg.mjs';

/**
 * CSS はテストで実行できないので、文字列として読んで約束事だけを見張る。
 * 見た目の検証ではなく、「2 か所に書かざるを得ない値がずれていないか」
 * 「1 か所 (common/tokens.css) に寄せたはずの定義が戻っていないか」の検査。
 */

/**
 * CSS を読んで改行を LF に揃え、コメントを落とす。
 *
 * **改行を揃えるのは必須。** このリポジトリは `.gitattributes` を持たず、Windows の
 * `core.autocrlf=true` では作業ツリーの CSS が CRLF になる。`block()` は選択子を
 * 改行込みの文字列 (`:root,` の次の行が `:host {`) で探すので、CRLF のままだと
 * 1 つも見つからず、チェックアウト直後だけテストが落ちる。(実際に踏んだ)
 * 見張りたいのは宣言の中身であって改行の種類ではないので、読み込みの時点で潰す。
 * @param {string} relative このファイルから見た CSS の場所
 * @returns {Promise<string>} LF に揃えてコメントを落とした CSS
 */
async function readStripped(relative) {
	const css = await readFile(new URL(relative, import.meta.url), 'utf8');
	return css.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 配色トークン。ビュワーと設定画面の両方が読む。 */
const tokens = await readStripped('../../src/common/tokens.css');
/** 設定画面の部品の規則。 */
const popup = await readStripped('../../src/popup/popup.css');
/** ビュワーの Shadow DOM の規則。 */
const viewer = await readStripped('../../src/content/viewer/viewer.css');

test('読み込んだ CSS の改行は LF に揃っている', () => {
	// CRLF のまま比べると、改行込みの選択子 (`:root,` の次の行が `:host`) が見つからず
	// チェックアウト直後だけ落ちる。readStripped が潰していることを固定する
	for (const [label, css] of [['tokens.css', tokens], ['popup.css', popup], ['viewer.css', viewer]]) {
		assert.ok(!css.includes('\r'), `${label} に CR が残っている`);
	}
});

/**
 * 選択子の直後の宣言ブロックの中身を取り出す。
 * @param {string} css コメントを落とした CSS
 * @param {string} selector 選択子 (行頭から `{` の直前まで。選択子の並びは改行を含めてそのまま)
 * @returns {string} ブロックの中身
 */
function block(css, selector) {
	const start = css.indexOf(`${selector} {`);
	assert.notEqual(start, -1, `${selector} のブロックが無い`);
	const open = css.indexOf('{', start);
	const close = css.indexOf('}', open);
	return css.slice(open + 1, close);
}

/**
 * ブロックの中身を「プロパティ: 値」の並びに整える。
 * @param {string} body ブロックの中身
 * @returns {string[]} 宣言の並び (書かれた順)
 */
function declarations(body) {
	return body.split(';').map((one) => one.trim()).filter(Boolean);
}

/**
 * ブロックの中の変数の値を読む。
 * @param {string} body ブロックの中身
 * @param {string} name 変数名 (`--accent`)
 * @returns {string|undefined} 値
 */
function variable(body, name) {
	return declarations(body).find((one) => one.startsWith(`${name}:`))?.slice(name.length + 1).trim();
}

/** tokens.css のダークのブロック (文書と Shadow DOM の両方に当たる選択子の並び)。 */
const DARK_SELECTOR = ':root,\n:host';
/** tokens.css のライトのブロック。 */
const LIGHT_SELECTOR = ":root[data-theme='light'],\n:host([data-theme='light'])";
/** data-theme が付く前だけ OS に従う規則。文書側 (popup) 専用なので :host を並べない。 */
const FALLBACK_SELECTOR = ':root:not([data-theme])';

/**
 * tokens.css に置いた、両画面で共通のトークン。
 * これが popup.css / viewer.css に再び定義されたら、値が 2 か所に割れる。
 */
const SHARED_TOKENS = [
	'--bg',
	'--surface',
	'--fg',
	'--muted',
	'--border',
	'--divider',
	'--control-bg',
	'--control-border',
	'--control-hover',
	'--hover',
	'--accent',
	'--on-accent',
	'--danger',
	'--scrollbar-size',
	'--scrollbar-track',
	'--scrollbar-thumb',
	'--scrollbar-thumb-hover',
	'--focus-ring',
];

test('拡張機能のアイコンの背景はダークの --accent と同じ値', () => {
	// scripts/icon-svg.mjs に直書きした色。CSS を変えたときに置き去りにならないよう突き合わせる
	const accent = variable(block(tokens, DARK_SELECTOR), '--accent');
	assert.ok(accent, 'tokens.css のダークに --accent が無い');
	for (const variant of ['full', 'compact']) {
		assert.equal(getArtwork(variant).background, accent, `${variant} の背景が --accent とずれている`);
	}
});

test('トークンは :root と :host の両方に当たる選択子で書く', () => {
	// 文書側 (popup) では :host が当たらず、Shadow DOM (viewer) では :root が当たらない。
	// 片方だけだとどちらかの画面で変数が未定義になる
	const dark = declarations(block(tokens, DARK_SELECTOR));
	const light = declarations(block(tokens, LIGHT_SELECTOR));
	for (const name of SHARED_TOKENS) {
		assert.ok(dark.some((one) => one.startsWith(`${name}:`)), `ダークに ${name} が無い`);
	}
	assert.ok(dark.includes('color-scheme: dark'), 'color-scheme を両テーマに書く (UI_DESIGN_KIT §2)');
	assert.ok(light.includes('color-scheme: light'), 'color-scheme を両テーマに書く (UI_DESIGN_KIT §2)');
	assert.ok(dark.some((one) => one.startsWith('font-family:')), '書体は tokens.css の 1 か所で決める');
});

test('ライトの変数は明示の選択と OS 追従 (data-theme が付く前) で同じ内容', () => {
	// 2 つの条件を 1 つの選択子にまとめられないので 2 か所に書いてある。片方だけ直すとずれる
	for (const [label, css, explicitSelector] of [
		['tokens.css', tokens, LIGHT_SELECTOR],
		['popup.css', popup, ":root[data-theme='light']"],
	]) {
		const explicit = declarations(block(css, explicitSelector));
		const media = css.indexOf('@media (prefers-color-scheme: light)');
		const fallback = css.indexOf(`${FALLBACK_SELECTOR} {`);
		assert.ok(media !== -1 && fallback > media, `${label}: OS 追従の規則がメディアクエリの中に無い`);
		assert.deepEqual(declarations(block(css, FALLBACK_SELECTOR)), explicit, `${label}: 2 つのライトの中身がずれている`);
	}
});

test('OS 追従の規則は文書側だけに当てる (ビュワーは pixiv 本体のテーマに追従する)', () => {
	// :host を並べると、OS がライトで pixiv がダークのときにビュワーがライトで描かれる (SPEC.md §10.2)
	const media = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: light)'));
	const body = media.slice(0, media.indexOf(`${FALLBACK_SELECTOR} {`));
	assert.ok(!body.includes(':host'), 'OS 追従の規則に :host を並べない');
});

test('共通のトークンは popup.css / viewer.css に再定義しない', () => {
	// 値の出どころを tokens.css の 1 か所に保つ。--follow-bg のような別名の一部に当たらないよう、
	// 直前が変数名の一部 (英数字とハイフン) でないことを見る
	for (const [label, css] of [['popup.css', popup], ['viewer.css', viewer]]) {
		for (const name of SHARED_TOKENS) {
			const pattern = new RegExp(`(^|[^-\\w])${name}:`);
			assert.ok(!pattern.test(css), `${label} に ${name} の定義が残っている`);
		}
		// 宣言 (行頭のプロパティ) だけを見る。@media (prefers-color-scheme: light) の条件は宣言ではない
		assert.ok(!/(^|[;{])\s*color-scheme:/m.test(css), `${label} に color-scheme が残っている`);
		assert.ok(!/(^|[;{])\s*font-family:/m.test(css), `${label} に font-family が残っている`);
	}
});

test('スクロールバーの見た目は tokens.css の 1 か所で決める', () => {
	// 選択子を付けない ::-webkit-scrollbar で文書 / Shadow DOM 全体に当てる。
	// 各 CSS に部品ごとの色や太さの規則が戻ると、画面ごとに見た目が割れる
	for (const suffix of ['', '-track', '-thumb', '-thumb:hover']) {
		assert.ok(tokens.includes(`\n::-webkit-scrollbar${suffix} {`), `tokens.css に ::-webkit-scrollbar${suffix} が無い`);
	}
	for (const [label, css] of [['popup.css', popup], ['viewer.css', viewer]]) {
		const rules = css.match(/[^\s{},]+::-webkit-scrollbar[^\s{,]*/g) ?? [];
		for (const rule of rules) {
			// 例外はサイドバーの軌道の余白 (margin) だけ。色と太さはここに書かない
			assert.equal(rule, '.sidebar::-webkit-scrollbar-track', `${label} の ${rule} は tokens.css へ寄せる`);
		}
		assert.ok(!/scrollbar-(width|color)\s*:/.test(css), `${label} に標準の scrollbar-width / scrollbar-color を書かない`);
	}
	assert.ok(!/scrollbar-(width|color)\s*:/.test(tokens), 'tokens.css に標準の scrollbar-width / scrollbar-color を書かない');
});

test('フォーカスの輪郭は --focus-ring の 1 本だけ', () => {
	assert.ok(variable(block(tokens, DARK_SELECTOR), '--focus-ring'), '--focus-ring が無い');
	const outlines = popup.match(/outline:[^;]+;/g) ?? [];
	assert.ok(outlines.length > 0, 'outline の規則が無い');
	for (const outline of outlines) assert.equal(outline, 'outline: var(--focus-ring);');
});

test('ビュワーのフォーカスの輪郭は 1 本にまとめる', () => {
	// 部品ごとに :focus-visible を書くと、新しく足したリンクやボタンだけ輪郭が抜け、
	// ブラウザ既定の白っぽい 1px が出る。(作者リンク・タグ・作品ページへのリンクで実際に起きた)
	// 共通の 1 本にしておけば、部品が増えても自動で揃う
	const selectors = [...viewer.matchAll(/([^{}]*:focus-visible[^{}]*)\{/g)]
		.map((match) => match[1].replace(/\s+/g, ' ').trim());
	assert.deepEqual(selectors.sort(), [
		// 輪郭を出さない例外 (Tab の巡回先ではないダイアログ本体。モーダルと原寸表示の 2 つ)
		'.overlay:focus, .overlay:focus-visible, .zoom:focus, .zoom:focus-visible',
		// 内側に出す例外 (項目の縁が隣と接しているメニュー)
		'.share-item:focus-visible',
		// 共通
		':focus-visible',
	]);
	// 値は --focus-ring から引く。none はダイアログ本体だけ
	const outlines = [...new Set(viewer.match(/outline:[^;]+;/g) ?? [])].sort();
	assert.deepEqual(outlines, ['outline: none;', 'outline: var(--focus-ring);']);
});

test('保存の失敗の通知に --danger を使わない', () => {
	// --danger は取り消せない操作専用。(UI_DESIGN_KIT §2) 保存の失敗はやり直せる
	assert.ok(!block(popup, '.notice').includes('--danger'));
});

test('タブの選択は aria-selected で描き、固定値のパネル高さは持たない', () => {
	assert.ok(popup.includes(".tab[aria-selected='true']"));
	assert.ok(!popup.includes('.is-on'));
	assert.ok(!popup.includes('--panel-max'));
	assert.ok(declarations(block(popup, '.popup')).includes('max-height: 600px'), 'popup の上限は Chrome の 600px');
	assert.ok(declarations(block(popup, '.panel')).includes('min-height: 0'), 'flex の子は min-height: 0 が無いと縮まない');
});

test('セクションの区切り線はセクション同士の間だけに出す', () => {
	// 先頭のセクションの上にはタブ行の border-bottom が既にあり、線が 2 本並んで見える
	assert.ok(!declarations(block(popup, '.section')).some((one) => one.startsWith('border-top')), '先頭のセクションにも線が出る');
	assert.ok(declarations(block(popup, '.section + .section')).includes('border-top: 1px solid var(--divider)'), 'セクション同士の区切りが無い');
});

test('popup.html は tokens.css を popup.css より先に読む', async () => {
	// popup.css は tokens.css の変数を参照する。順が逆でも CSS 変数は解決されるが、
	// 読み込みの順が入れ替わると tokens.css の ::-webkit-scrollbar 等の普通の規則を popup.css が上書きできなくなる
	const html = await readFile(new URL('../../src/popup/popup.html', import.meta.url), 'utf8');
	const tokensAt = html.indexOf('href="../common/tokens.css"');
	const popupAt = html.indexOf('href="popup.css"');
	assert.ok(tokensAt !== -1, 'popup.html が ../common/tokens.css を読んでいない');
	assert.ok(popupAt !== -1, 'popup.html が popup.css を読んでいない');
	assert.ok(tokensAt < popupAt, 'tokens.css は popup.css より先に読む');
});

test('原寸表示は画像を縮めない', () => {
	// .stage img の max-width: 100% をそのまま浴びると「原寸」にならない。
	// 打ち消しを消してしまわないよう、ここで固定する
	const body = block(viewer, '.zoom-image');
	assert.ok(body.includes('max-width: none'), '横の縮小を打ち消していない');
	assert.ok(body.includes('max-height: none'), '縦の縮小を打ち消していない');
	assert.ok(body.includes('cursor: zoom-out'), '押すと戻ることをカーソルで示す');
});

test('原寸表示のクリック領域は左右で同じ幅', () => {
	// 前と次で幅が違うと、同じ端を押しているつもりで押し損ねる。
	// 幅は 1 つの変数から引き、左右の規則は位置とカーソルだけを持つ
	assert.ok(block(viewer, '.zoom').includes('--zoom-zone-width:'), '幅の変数が無い');
	assert.ok(block(viewer, '.zoom-zone').includes('width: var(--zoom-zone-width)'), '幅を変数から引いていない');
	for (const selector of ['.zoom-zone-prev', '.zoom-zone-next']) {
		assert.ok(!block(viewer, selector).includes('width:'), `${selector} が自前の幅を持っている`);
	}
});

test('原寸表示の幕は透けない', () => {
	// --backdrop (92%) をそのまま使うと、背後のサイドバーの文字が読めてしまう。
	// (0.24.0 の実機確認で判明) 原寸表示は画像だけを見るための画面なので不透明にする
	assert.ok(block(viewer, '.zoom').includes('background: var(--zoom-backdrop)'), '専用の幕を使っていない');
	const value = variable(block(viewer, ':host'), '--zoom-backdrop');
	assert.ok(value, '--zoom-backdrop が無い');
	assert.ok(!/rgba|hsla|transparent/.test(value), `--zoom-backdrop が透ける値 (${value})`);
});
