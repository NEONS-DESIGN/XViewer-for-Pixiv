/**
 * グリッドのサムネイルにフォーカス枠を出す。
 *
 * pixiv 標準のフォーカスリングは白に近い 1px で、しかもサムネイルの親に
 * overflow: hidden が実寸ぴったりで掛かっているため、外側へ出る枠は切り取られて見えない
 * (SITE_SPEC 実測)。そこでリンクの内側に重ねて描く。
 * 外側に暗い縁、内側にアクセント色の二重にして、明るい絵でも暗い絵でも輪郭が出るようにする。
 */
import { ARTWORK_LINK_SELECTOR } from '../common/constants.js';
import { createStyleHandle } from '../common/style-injector.js';

/** 差し込む style 要素の id。二重注入を防ぐ目印も兼ねる。 */
export const FOCUS_STYLE_ID = 'gridviewer-grid-focus';

/** 枠の色。UI_DESIGN_KIT の --accent (ダーク側)。絵の上に乗るのでテーマでは変えない。 */
const FOCUS_COLOR = '#4ea3d6';

/** 枠の外側に敷く縁の色。明るい絵でも輪郭が沈まないようにする。 */
const FOCUS_EDGE_COLOR = 'rgba(0, 0, 0, 0.75)';

/** 外側の縁の太さ (px)。 */
const FOCUS_EDGE_WIDTH_PX = 2;

/** 縁を含めた枠全体の太さ (px)。差分がアクセント色の幅になる。 */
const FOCUS_RING_WIDTH_PX = 5;

/** 角の丸み (px)。pixiv のサムネイル画像に合わせた実測値。 */
const FOCUS_RADIUS_PX = 4;

/**
 * light DOM へ差し込む CSS。
 * :focus-visible なのでキーボードで移ったときだけ出る (クリックでは出ない)。
 * :has(img) でサムネイルのリンクだけに絞る (同じ href のタイトルリンクに枠を出さないため)。
 * pixiv 標準のリングは消さない (UI_DESIGN_KIT §10)。
 */
export const GRID_FOCUS_CSS = `
${ARTWORK_LINK_SELECTOR}:focus-visible:has(img) {
	position: relative;
}

${ARTWORK_LINK_SELECTOR}:focus-visible:has(img)::after {
	content: '';
	position: absolute;
	inset: 0;
	pointer-events: none;
	border-radius: ${FOCUS_RADIUS_PX}px;
	box-shadow:
		inset 0 0 0 ${FOCUS_EDGE_WIDTH_PX}px ${FOCUS_EDGE_COLOR},
		inset 0 0 0 ${FOCUS_RING_WIDTH_PX}px ${FOCUS_COLOR};
}
`;

/**
 * フォーカス枠の CSS を差し込む。既にあれば足さない。
 * 失敗しても枠が出ないだけで操作はできるので、投げずに戻る (style-injector が受ける)。
 * @param {Document} doc 対象のドキュメント
 * @returns {{dispose: () => void}} 差し込んだ style の取り外し
 */
export function ensureFocusStyle(doc) {
	const style = createStyleHandle(doc, FOCUS_STYLE_ID, GRID_FOCUS_CSS, 'focus');
	style.show();
	return { dispose: style.dispose };
}
