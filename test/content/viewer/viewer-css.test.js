import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStripped, block, variable } from '../../helpers/css.js';

/**
 * viewer.css だけの約束事。CSS はテストで実行できないので、文字列として読んで見張る。
 * tokens.css との関係 (共通トークンの再定義・スクロールバー) は test/popup/popup-css.test.js にある
 */

/** ビュワーの Shadow DOM の規則。 */
const viewer = await readStripped('src/content/viewer/viewer.css');

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
