/**
 * Material Symbols から必要な図形だけを抜き出して icon-shapes.js を生成する。
 * 生成物はコミットする。src/ を素の import で読めるようにするため (UI_DESIGN_KIT §5)。
 */
import { readFile, writeFile } from 'node:fs/promises';

/** 抜き出す図形。左がコード側の名前、右が Material Symbols のファイル名。 */
const ICON_SOURCES = {
	close: 'close-fill',
	chevronLeft: 'chevron_left-fill',
	chevronRight: 'chevron_right-fill',
	favorite: 'favorite-fill',
	bookmark: 'bookmark-fill',
	personAdd: 'person_add-fill',
	personCheck: 'how_to_reg-fill',
	visibility: 'visibility-fill',
	comment: 'comment-fill',
	play: 'play_arrow-fill',
	pause: 'pause-fill',
	openInNew: 'open_in_new-fill',
	error: 'error-fill',
	refresh: 'refresh-fill',
};

/** 原本の置き場。 */
const SOURCE_DIR = 'node_modules/@material-symbols/svg-400/rounded';

/** 生成先。 */
const OUTPUT_PATH = 'src/common/icon-shapes.js';

/**
 * SVG から viewBox と中身を取り出す。
 * @param {string} svg SVG の中身
 * @returns {{viewBox: string, markup: string}} 図形
 */
function extract(svg) {
	const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
	const markup = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
	return { viewBox, markup };
}

const shapes = {};
for (const [name, file] of Object.entries(ICON_SOURCES)) {
	shapes[name] = extract(await readFile(`${SOURCE_DIR}/${file}.svg`, 'utf8'));
}

const header = `/**
 * 生成物。手で編集しない。scripts/build-symbols.mjs で作り直す。
 * 図形の出典: Material Symbols (Rounded, weight 400, FILL 1) / Apache-2.0
 * https://github.com/google/material-design-icons
 */
`;

await writeFile(
	OUTPUT_PATH,
	`${header}export const ICON_SHAPES = Object.freeze(${JSON.stringify(shapes, null, '\t')});\n`,
	'utf8',
);
console.log(`generated ${OUTPUT_PATH} (${Object.keys(shapes).length} icons)`);
