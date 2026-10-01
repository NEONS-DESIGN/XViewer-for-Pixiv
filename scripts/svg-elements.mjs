/**
 * SVG の中身 (svg 要素の内側) を、要素名と属性の組の配列に分解する。
 * build-symbols.mjs が使う。(ここは I/O を持たない純粋な計算だけ)
 *
 * 実行時に innerHTML を使わず、createElementNS と setAttribute で組み立てるための下ごしらえ。
 * 受け付けるのは「子を持たない自己終了要素の並び」だけ。それ以外は黙って捨てずに例外にする。
 */

/**
 * 受け付ける要素名。アイコンの図形として描かれるものだけに絞る。
 * g / defs / use などの入れ子や参照を持つ要素は、分解の仕組みごと足すまで通さない。
 */
export const ALLOWED_TAGS = Object.freeze(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);

/**
 * 受け付ける属性名。図形の形と塗りを決めるものだけに絞る。
 * 名前空間付き (xlink:href)・大文字入り・on* (Trusted Types の検査対象)・style などは、
 * setAttribute で入れると innerHTML と結果がずれるか、投げる恐れがあるので通さない。
 */
export const ALLOWED_ATTRIBUTES = Object.freeze([
	'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points',
	'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'opacity', 'transform',
	'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
]);

/**
 * 自己終了要素 1 つ。(sticky で先頭から順に読む) 属性部分は ATTRIBUTE_PATTERN で割る。
 * 区切りは ASCII の空白だけ。(HTML / XML と同じ。JS の \s は NBSP なども含むので使わない)
 * sticky の読み位置 (lastIndex) を持つので、使うたびに new RegExp で複製する。
 */
const ELEMENT_PATTERN = /[ \t\r\n]*<([A-Za-z][\w-]*)((?:[ \t\r\n]+[A-Za-z][\w:-]*[ \t\r\n]*=[ \t\r\n]*"[^"]*")*)[ \t\r\n]*\/>[ \t\r\n]*/y;

/** 属性 1 つ。値は二重引用符で囲まれたものだけを受け付ける。 */
const ATTRIBUTE_PATTERN = /([A-Za-z][\w:-]*)[ \t\r\n]*=[ \t\r\n]*"([^"]*)"/g;

/** 前後の ASCII 空白。 */
const EDGE_SPACE_PATTERN = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/**
 * SVG の中身を要素の配列に分解する。
 * @param {string} markup svg 要素の内側の文字列
 * @param {string} source 読み込み元 (エラー表示用)
 * @returns {Array<{tag: string, attrs: Record<string, string>}>} 要素の並び。属性は出てきた順
 * @throws {Error} 自己終了要素の並びとして読めない / 許していない要素や属性がある /
 *   属性が重なる / 値に実体参照 (&) がある / 要素が 1 つも無いとき
 */
export function parseSvgElements(markup, source) {
	const elements = [];
	// 前後の空白を先に落とす。空白だけの中身を「読めない」ではなく「要素が無い」と伝えるため
	const text = markup.replace(EDGE_SPACE_PATTERN, '');
	const pattern = new RegExp(ELEMENT_PATTERN);
	while (pattern.lastIndex < text.length) {
		const at = pattern.lastIndex;
		const match = pattern.exec(text);
		if (!match) {
			throw new Error(`${source} の中身 (svg の内側) の ${at} 文字目を自己終了要素として読めません: ${text.slice(at, at + 40)}`);
		}
		const [, tag, attributePart] = match;
		if (!ALLOWED_TAGS.includes(tag)) {
			throw new Error(`${source} に扱えない要素 <${tag}> があります (許しているのは ${ALLOWED_TAGS.join(' / ')})`);
		}
		const attrs = parseAttributes(attributePart, `${source} の <${tag}>`);
		// 属性の無い図形の要素は何も描かない。原本の形が変わった兆しなので止める
		if (Object.keys(attrs).length === 0) {
			throw new Error(`${source} の <${tag}> に属性がありません`);
		}
		elements.push({ tag, attrs });
	}
	if (elements.length === 0) {
		throw new Error(`${source} に図形の要素がありません`);
	}
	return elements;
}

/**
 * 属性部分を名前と値の辞書にする。
 * @param {string} text 要素名の後ろから閉じの手前まで
 * @param {string} source 読み込み元 (エラー表示用)
 * @returns {Record<string, string>} 属性。出てきた順
 * @throws {Error} 許していない属性がある / 同じ属性が 2 度出る / 値に実体参照 (&) があるとき
 */
function parseAttributes(text, source) {
	const attrs = {};
	for (const [, name, value] of text.matchAll(ATTRIBUTE_PATTERN)) {
		if (!ALLOWED_ATTRIBUTES.includes(name)) {
			throw new Error(`${source} に扱えない属性 ${name} があります`);
		}
		if (Object.hasOwn(attrs, name)) {
			throw new Error(`${source} に属性 ${name} が 2 度あります`);
		}
		// innerHTML なら戻っていた実体参照を、setAttribute はそのまま文字として入れる。
		// 今の原本には無いので、戻す処理を持たずに気づける形で止める
		if (value.includes('&')) {
			throw new Error(`${source} の属性 ${name} に実体参照があります: ${value}`);
		}
		attrs[name] = value;
	}
	return attrs;
}
