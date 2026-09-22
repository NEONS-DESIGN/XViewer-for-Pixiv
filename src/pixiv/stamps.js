/**
 * コメントに貼れるスタンプの一覧。
 * pixiv 本体は API で引かず、グループ番号から ID を組み立てている。(SITE_SPEC §4 実測)
 * 画像の URL は endpoints.js の stampUrl() が組み立てる。
 */

/**
 * 出すグループの番号と並び。pixiv 本体の並びに合わせてある。
 * 6 と 7 は本体が hidden: true にしていて画面に出さないので持たない。
 * @type {readonly number[]}
 */
export const STAMP_GROUPS = Object.freeze([3, 4, 2, 1]);

/** 1 グループあたりの個数。ID はグループ番号 * 100 + 1..10 になる。 */
export const STAMPS_PER_GROUP = 10;

/** ID を組み立てるときの桁上げ。3 なら 301 から始まる。 */
const GROUP_STRIDE = 100;

/**
 * 出せるスタンプの ID を本体と同じ並びで返す。
 * @returns {string[]} スタンプ ID (文字列)
 */
export function stampIds() {
	return STAMP_GROUPS.flatMap((group) => Array.from(
		{ length: STAMPS_PER_GROUP },
		(_unused, index) => String(group * GROUP_STRIDE + index + 1),
	));
}
