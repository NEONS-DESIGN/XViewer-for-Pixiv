import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureFocusStyle, FOCUS_STYLE_ID, GRID_FOCUS_CSS } from '../../src/content/grid-focus.js';
import { LOCALE_PREFIXES } from '../../src/common/constants.js';

/**
 * document の代わり。head への出し入れだけを持つ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const head = {
		children: [],
		appendChild(el) { this.children.push(el); return el; },
	};
	return {
		head,
		createElement(tagName) {
			const el = {
				tagName: tagName.toUpperCase(),
				id: '',
				textContent: '',
				remove() {
					const index = head.children.indexOf(el);
					if (index >= 0) head.children.splice(index, 1);
				},
			};
			return el;
		},
		getElementById(id) { return head.children.find((el) => el.id === id) ?? null; },
	};
}

test('ensureFocusStyle は head に style を 1 枚入れる', () => {
	const doc = fakeDoc();
	ensureFocusStyle(doc);
	assert.equal(doc.head.children.length, 1);
	assert.equal(doc.head.children[0].tagName, 'STYLE');
	assert.equal(doc.head.children[0].id, FOCUS_STYLE_ID);
	assert.equal(doc.head.children[0].textContent, GRID_FOCUS_CSS);
});

test('既に同じ id の style があれば足さず、dispose でそれを外す', () => {
	// 別の経路で残った style を掴み直す (二重注入の防止と後片付けの両方)
	const doc = fakeDoc();
	const first = ensureFocusStyle(doc);
	const second = ensureFocusStyle(doc);
	assert.equal(doc.head.children.length, 1);
	second.dispose();
	assert.equal(doc.head.children.length, 0);
	assert.doesNotThrow(() => first.dispose());
});

test('appendChild が投げても投げずに戻り、dispose も投げない', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	const doc = fakeDoc();
	doc.head.appendChild = () => { throw new Error('head is sealed'); };
	let handle;
	assert.doesNotThrow(() => { handle = ensureFocusStyle(doc); });
	assert.doesNotThrow(() => handle.dispose());
	assert.equal(warn.mock.callCount(), 1);
});

test('ensureFocusStyle を 2 回呼んでも style は増えない', () => {
	// SPA 遷移で apply() が何度も走るため
	const doc = fakeDoc();
	ensureFocusStyle(doc);
	ensureFocusStyle(doc);
	assert.equal(doc.head.children.length, 1);
});

test('dispose で style が消える', () => {
	const doc = fakeDoc();
	const handle = ensureFocusStyle(doc);
	handle.dispose();
	assert.equal(doc.head.children.length, 0);
});

test('dispose を 2 回呼んでも投げない', () => {
	const doc = fakeDoc();
	const handle = ensureFocusStyle(doc);
	handle.dispose();
	assert.doesNotThrow(() => handle.dispose());
});

test('head が無くても投げない', () => {
	const doc = fakeDoc();
	doc.head = null;
	let handle;
	assert.doesNotThrow(() => { handle = ensureFocusStyle(doc); });
	assert.doesNotThrow(() => handle.dispose());
});

test('枠を出すのはキーボード操作のサムネイルだけ', () => {
	// :focus-visible が無いとクリックでも枠が出る。:has(img) が無いとタイトルにも出る
	assert.match(GRID_FOCUS_CSS, /:focus-visible/);
	assert.match(GRID_FOCUS_CSS, /:has\(img\)/);
});

test('pixiv 標準のフォーカスリングを消さない', () => {
	// UI_DESIGN_KIT の原則。代わりの表示が出なくなったとき、何も見えなくなるのを防ぐ
	assert.doesNotMatch(GRID_FOCUS_CSS, /outline\s*:\s*none/);
});

/**
 * CSS を `,` 区切りのルールへ分解する。
 * GRID_FOCUS_CSS は `セレクタ, セレクタ { ... }` を複数持つので、宣言ブロックの中身の `,` を
 * 拾わないよう、`{` の手前までを 1 ブロックとして扱う。
 * @param {string} css 対象の CSS
 * @returns {string[]} ブロックごとの「カンマ区切りセレクタ」の配列
 */
function selectorGroups(css) {
	const blocks = css.match(/[^{}]+(?=\{)/g) ?? [];
	return blocks.map((block) => block.trim());
}

test('カンマ区切りの並びに擬似クラスを継ぎ足すと先頭が裸で残る -> 各セレクタへ個別に付いていること', () => {
	// ARTWORK_LINK_SELECTOR は `a[href^="/artworks/"],a[href^="/en/artworks/"]` のような
	// カンマ区切りの並び。CSS のカンマは優先度が最も低いので、この並びの後ろへ
	// `:focus-visible:has(img)` のような擬似クラスを継ぎ足すと、末尾の 1 本にしか掛からず
	// 先頭のセレクタが裸のまま残ってしまう (0.30.5 以来の不具合、日本語ページで実害)。
	// この事故を再発させないため、カンマで区切った各セレクタの「すべて」が
	// :focus-visible を含むことを確かめる。
	for (const group of selectorGroups(GRID_FOCUS_CSS)) {
		const selectors = group.split(',').map((s) => s.trim());
		assert.ok(selectors.length > 0, `セレクタが取れていない: ${group}`);
		for (const selector of selectors) {
			assert.match(
				selector,
				/:focus-visible/,
				`裸のセレクタが残っている (継ぎ足しが先頭に掛かっていない): "${selector}"`,
			);
		}
	}
});

test('LOCALE_PREFIXES の全接頭辞について :focus-visible:has(img) と ::after 付きの両方が存在する', () => {
	// 接頭辞を足しても自動で追随することを確かめるため、LOCALE_PREFIXES から期待値を組み立てる。
	// ベタ書きの '/en' に頼ると、接頭辞が増減したときにテストだけが取り残されて気づけない。
	// 各セレクタはカンマ区切りの並びの中の 1 本なので、直後に続くのは次のセレクタへの
	// 区切り (`,`) か、その並びの最後なら宣言ブロックの開き (` {`) のどちらか。
	const prefixes = ['', ...LOCALE_PREFIXES.map((locale) => `/${locale}`)];
	for (const prefix of prefixes) {
		const base = `a[href^="${prefix}/artworks/"]`;
		assert.match(
			GRID_FOCUS_CSS,
			new RegExp(`${escapeForRegExp(`${base}:focus-visible:has(img)`)}(,|\\s*\\{)`),
			`${base} に :focus-visible:has(img) が付いていない`,
		);
		assert.match(
			GRID_FOCUS_CSS,
			new RegExp(`${escapeForRegExp(`${base}:focus-visible:has(img)::after`)}(,|\\s*\\{)`),
			`${base} に :focus-visible:has(img)::after が付いていない`,
		);
	}
});

/**
 * 正規表現の特殊文字をエスケープする。
 * @param {string} value 元の文字列
 * @returns {string} 正規表現内でそのまま一致させられる文字列
 */
function escapeForRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
