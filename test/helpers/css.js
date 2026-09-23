/**
 * CSS を文字列として読んで約束事を見張るテストの共通部品。
 * CSS はテストで実行できないので、「2 か所に書かざるを得ない値がずれていないか」
 * 「1 か所に寄せたはずの定義が戻っていないか」を文字列の検査で確かめる。
 * (test/popup/popup-css.test.js と test/content/viewer/viewer-css.test.js が使う)
 */
import { readFile } from 'node:fs/promises';

/** リポジトリの根。このファイルは test/helpers/ にある。 */
const REPO_ROOT = new URL('../../', import.meta.url);

/**
 * CSS を読んで改行を LF に揃え、コメントを落とす。
 *
 * **改行を揃えるのは必須。** このリポジトリは `.gitattributes` を持たず、Windows の
 * `core.autocrlf=true` では作業ツリーの CSS が CRLF になる。`block()` は選択子を
 * 改行込みの文字列 (`:root,` の次の行が `:host {`) で探すので、CRLF のままだと
 * 1 つも見つからず、チェックアウト直後だけテストが落ちる。(実際に踏んだ)
 * 見張りたいのは宣言の中身であって改行の種類ではないので、読み込みの時点で潰す。
 * @param {string} relative リポジトリの根から見た CSS の場所 (`src/common/tokens.css`)
 * @returns {Promise<string>} LF に揃えてコメントを落とした CSS
 */
export async function readStripped(relative) {
	const css = await readFile(new URL(relative, REPO_ROOT), 'utf8');
	return css.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * 正規表現の中でそのまま文字として扱えるようにする。
 * @param {string} text 任意の文字列
 * @returns {string} 特殊文字を退避した文字列
 */
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 選択子の直後の宣言ブロックの中身を取り出す。
 * 選択子は行頭 (字下げは許す。`@media` の中の規則) に固定して探す。`.section` を探して
 * `.section + .section` の末尾に当たるような取り違えを避けるため。閉じ括弧は入れ子 (CSS nesting) を数えて対応する。
 * @param {string} css コメントを落とした CSS
 * @param {string} selector 選択子 (行頭から `{` の直前まで。選択子の並びは改行を含めてそのまま)
 * @returns {string} ブロックの中身
 * @throws {Error} ブロックが見つからない・閉じていないとき
 */
export function block(css, selector) {
	const match = new RegExp(`^[ \\t]*${escapeRegExp(selector)} \\{`, 'm').exec(css);
	if (!match) throw new Error(`${selector} のブロックが無い`);
	const open = match.index + match[0].length - 1;
	let depth = 0;
	for (let at = open; at < css.length; at += 1) {
		if (css[at] === '{') depth += 1;
		else if (css[at] === '}') {
			depth -= 1;
			if (depth === 0) return css.slice(open + 1, at);
		}
	}
	throw new Error(`${selector} のブロックが閉じていない`);
}

/**
 * ブロックの中身を「プロパティ: 値」の並びに整える。
 * @param {string} body ブロックの中身
 * @returns {string[]} 宣言の並び (書かれた順)
 */
export function declarations(body) {
	return body.split(';').map((one) => one.trim()).filter(Boolean);
}

/**
 * ブロックの中の変数の値を読む。
 * @param {string} body ブロックの中身
 * @param {string} name 変数名 (`--accent`)
 * @returns {string|undefined} 値
 */
export function variable(body, name) {
	return declarations(body).find((one) => one.startsWith(`${name}:`))?.slice(name.length + 1).trim();
}
