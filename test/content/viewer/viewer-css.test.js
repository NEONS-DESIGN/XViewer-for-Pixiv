import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStripped, block, variable } from '../../helpers/css.js';
import { VIEWER_CSS_SETTINGS } from '../../../src/common/constants.js';

/**
 * viewer.css だけの約束事。CSS はテストで実行できないので、文字列として読んで見張る。
 * tokens.css との関係 (共通トークンの再定義・スクロールバー) はここでは見ない。
 */

/** ビュワーの Shadow DOM の規則。 */
const viewer = await readStripped('src/content/viewer/viewer.css');

test('ビュワーのフォーカスの輪郭は 1 本にまとめる', () => {
	// 部品ごとに :focus-visible を書くと、新しく足したリンクやボタンだけ輪郭が抜け、
	// ブラウザ既定の白っぽい 1px が出る。
	// 共通の 1 本にしておけば、部品が増えても自動で揃う
	const selectors = [...viewer.matchAll(/([^{}]*:focus-visible[^{}]*)\{/g)]
		.map((match) => match[1].replace(/\s+/g, ' ').trim());
	assert.deepEqual(selectors.sort(), [
		// 輪郭を出さない例外 (Tab の巡回先ではないダイアログ本体。モーダルと原寸表示の 2 つ)
		'.overlay:focus, .overlay:focus-visible, .zoom:focus, .zoom:focus-visible',
		// 内側に出す例外 (項目の縁が隣と接しているメニュー)
		'.share-item:focus-visible',
		'.ugoira-rate-item:focus-visible',
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
	// 既定はホスト (:host) が持つ。設定 zoomZoneSize の上書きがホストの style に入るため
	assert.ok(block(viewer, ':host').includes('--zoom-zone-width:'), '幅の変数が無い');
	assert.ok(!block(viewer, '.zoom').includes('--zoom-zone-width:'), '.zoom が幅を持つとホストの上書きが効かない');
	assert.ok(block(viewer, '.zoom-zone').includes('width: var(--zoom-zone-width)'), '幅を変数から引いていない');
	for (const selector of ['.zoom-zone-prev', '.zoom-zone-next']) {
		assert.ok(!block(viewer, selector).includes('width:'), `${selector} が自前の幅を持っている`);
	}
});

test('設定で上書きする CSS 変数は全てホスト (:host) で既定を持つ', () => {
	// 上書きはホストの style に入る。子の規則で同じ変数を宣言するとそちらが勝ち、設定が効かない
	const host = block(viewer, ':host');
	for (const { property } of Object.values(VIEWER_CSS_SETTINGS)) {
		assert.ok(host.includes(`${property}:`), `${property} の既定が :host に無い`);
	}
});

test('幕の濃さはテーマごとに --backdrop-alpha だけを差し替える', () => {
	// ライトで --backdrop を丸ごと書き直すと、ホストの style で上書きした濃さが効かなくなる
	assert.equal(variable(block(viewer, ':host'), '--backdrop'), 'rgba(0, 0, 0, var(--backdrop-alpha))');
	const light = block(viewer, ":host([data-theme='light'])");
	assert.ok(light.includes('--backdrop-alpha:'), 'ライトの濃さが無い');
	assert.ok(!/--backdrop:/.test(light), 'ライトが --backdrop を書き直している');
});

test('端に着いて送れない領域は、押すと閉じる余白と違うカーソルにする', () => {
	// 既定のカーソルのままだと、押しても何も起きない端と、押すと閉じる余白の見分けが付かない
	assert.equal(variable(block(viewer, ':host'), '--cursor-blocked'), 'not-allowed');
	assert.ok(block(viewer, ".stage[data-nav-zone='idle'],\n.stage[data-nav-zone='idle'] *").includes('cursor: var(--cursor-blocked)'), '画面端の領域');
	assert.ok(block(viewer, '.zoom-zone:disabled').includes('cursor: var(--cursor-blocked)'), '原寸表示の領域');
	assert.ok(!block(viewer, '.stage').includes('cursor:'), '余白は既定のカーソル (指定なし) のまま');
});

test('うごイラの操作の帯は hidden で消える', () => {
	// display: flex をクラスで書いているので、[hidden] を足さないと再生前から帯が見えてしまう
	assert.ok(block(viewer, '.ugoira-controls[hidden]').includes('display: none'));
});

test('シークバーの軌道は再生済み・読み込み済み・未読を変数で塗り分ける', () => {
	for (const selector of ['.ugoira-seek::-webkit-slider-runnable-track', '.ugoira-seek::-moz-range-track']) {
		const body = block(viewer, selector);
		for (const name of ['--seek-played', '--seek-loaded', '--seek-buffer', '--seek-rest']) {
			assert.ok(body.includes(name), `${selector} が ${name} を使っていない`);
		}
	}
	// 軌道の色はテーマで変える (白地で白い軌道は見えない)
	const light = block(viewer, ":host([data-theme='light'])");
	assert.ok(light.includes('--seek-buffer:') && light.includes('--seek-rest:'));
});

test('原寸表示の幕は透けない', () => {
	// --backdrop (92%) をそのまま使うと、背後のサイドバーの文字が読めてしまう。
	// 原寸表示は画像だけを見るための画面なので不透明にする
	assert.ok(block(viewer, '.zoom').includes('background: var(--zoom-backdrop)'), '専用の幕を使っていない');
	const value = variable(block(viewer, ':host'), '--zoom-backdrop');
	assert.ok(value, '--zoom-backdrop が無い');
	assert.ok(!/rgba|hsla|transparent/.test(value), `--zoom-backdrop が透ける値 (${value})`);
});

test('原寸表示の通知はスクロールに流されず、画面に貼り付く', () => {
	// 置き場はスクロールする .zoom の中にあるので、absolute のままだと画像と一緒に流れる
	assert.ok(block(viewer, '.zoom > .notice-area').includes('position: fixed'), '通知の置き場が fixed でない');
	// 先祖に transform / filter / contain があると fixed の基準が画面でなくなる
	for (const selector of ['.overlay', '.zoom']) {
		const body = block(viewer, selector);
		for (const property of ['transform:', 'filter:', 'contain:', 'will-change:', 'perspective:']) {
			assert.ok(!body.includes(property), `${selector} が ${property} を持つと fixed が画面基準にならない`);
		}
	}
});

test('コメントの投稿者アイコンのリンクはアイコンの大きさに留める', () => {
	// .comment-item は flex で、既定の align-items: stretch のままだとリンクが本文の高さまで伸び、
	// アイコンの下の余白を押しても投稿者ページへ飛んでしまう
	assert.ok(block(viewer, '.comment-avatar-link').includes('align-self: flex-start'), 'リンクが行の高さまで伸びる');
});
