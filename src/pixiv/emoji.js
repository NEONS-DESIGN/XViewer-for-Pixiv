/**
 * pixiv のコメントに混ざる絵文字。
 * 本文には `(heaven)` のような文字列として入ってくるので、こちらで画像へ置き換える。
 * 表も切り出し方も pixiv 本体のフロント JS を実測して写したもの (SITE_SPEC 参照)。
 */

/**
 * 絵文字の名前と ID の対応。ID がそのまま画像のファイル名になる。
 * @type {Readonly<Record<string, number>>}
 */
export const PIXIV_EMOJI = Object.freeze({
	normal: 101, surprise: 102, serious: 103, heaven: 104,
	happy: 105, excited: 106, sing: 107, cry: 108,
	normal2: 201, shame2: 202, love2: 203, interesting2: 204, blush2: 205,
	fire2: 206, angry2: 207, shine2: 208, panic2: 209,
	normal3: 301, satisfaction3: 302, surprise3: 303, smile3: 304, shock3: 305,
	gaze3: 306, wink3: 307, happy3: 308, excited3: 309, love3: 310,
	normal4: 401, surprise4: 402, serious4: 403, love4: 404,
	shine4: 405, sweat4: 406, shame4: 407, sleep4: 408,
	heart: 501, teardrop: 502, star: 503,
});

/**
 * 本文を「括弧で囲まれた塊」と「それ以外」に切り分ける。
 * 入れ子や閉じ忘れがあっても取りこぼさないよう、単独の括弧も拾う。
 */
const TOKEN_PATTERN = /\([^()]*\)|[^()]+|\(|\)/g;

/** 絵文字の名前として通る形。数字と小文字だけ。 */
const NAME_PATTERN = /^\(([\da-z]+)\)$/;

/**
 * @typedef {object} CommentFragment
 * @property {'text'|'emoji'} kind 断片の種類
 * @property {string} text 元の文字列。絵文字でも `(heaven)` の形で残す
 * @property {number} [id] 絵文字の ID (kind が 'emoji' のときだけ)
 */

/**
 * コメント本文を描画用の断片に分ける。
 * 表に無い名前は画像にせず文字のまま残す (pixiv 本体と同じ扱い)。
 * @param {string|null|undefined} text コメント本文
 * @returns {CommentFragment[]} 断片の並び。本文が空なら空配列
 */
export function parseCommentText(text) {
	if (!text) return [];
	const tokens = text.match(TOKEN_PATTERN);
	if (!tokens) return [];
	return tokens.map((token) => {
		const matched = NAME_PATTERN.exec(token);
		// Object.prototype 由来の名前 (constructor 等) を拾わないよう自前のキーだけ見る
		if (matched && Object.hasOwn(PIXIV_EMOJI, matched[1])) {
			return { kind: 'emoji', text: token, id: PIXIV_EMOJI[matched[1]] };
		}
		return { kind: 'text', text: token };
	});
}
