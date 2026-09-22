/**
 * プロフィールのホームに出る「ピックアップ」欄を隠す。
 *
 * 隠すのは style を 1 枚差し込むだけで行い、要素を消したり属性を足したりはしない。
 * pixiv は React で何度も描き直すので、JS で個々の要素へ当てる方式だと
 * 描き直しのたびに一瞬見えてしまう。CSS なら描き直しに追従し、ちらつきも出ない。
 *
 * 欄が出るのはホームタブだけだが、content script は www.pixiv.net 全体で走るため、
 * どのパスで効かせるかは呼び出し側 (main.js) が isProfileHome で決める。
 */
import { PICKUP_SECTION_SELECTOR } from '../common/constants.js';
import { createStyleHandle } from '../common/style-injector.js';

/** 差し込む style 要素の id。二重注入を防ぐ目印も兼ねる。 */
export const PICKUP_STYLE_ID = 'xviewer-hide-pickup';

/**
 * light DOM へ差し込む CSS。
 * pixiv 側の指定に競り負けないよう !important を付ける。
 * 他所の見た目は変えないので、規則はこの 1 本だけに留める。
 */
export const PICKUP_HIDE_CSS = `
${PICKUP_SECTION_SELECTOR} {
	display: none !important;
}
`;

/**
 * ピックアップ欄を隠す CSS の出し入れを受け持つ。
 * 作った時点では何もせず、setActive(true) で初めて差し込む。
 * 失敗しても欄が隠れないだけでページは読めるので、投げずに戻る。(style-injector が受ける)
 * @param {Document} doc 対象のドキュメント
 * @returns {{setActive: (active: boolean) => void, isActive: () => boolean, dispose: () => void}} 出し入れ
 */
export function attachPickupHider(doc) {
	const style = createStyleHandle(doc, PICKUP_STYLE_ID, PICKUP_HIDE_CSS, 'pickup hide');
	return {
		/**
		 * 隠すかどうかを切り替える。
		 * @param {boolean} active true で差し込み、false で外す
		 * @returns {void}
		 */
		setActive(active) {
			if (active) style.show();
			else style.hide();
		},
		isActive: style.isActive,
		dispose: style.dispose,
	};
}
