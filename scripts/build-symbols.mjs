/**
 * Material Symbols と Font Awesome (ブランドロゴ) から必要な図形だけを抜き出し、
 * 自前で描いた図形と混ぜて icon-shapes.js を生成する。
 * 生成物はコミットする。src/ を素の import で読めるようにするため (UI_DESIGN_KIT §5)。
 */
import { readFile, writeFile } from 'node:fs/promises';

/** 抜き出す図形。左がコード側の名前、右が Material Symbols のファイル名。 */
const ICON_SOURCES = {
	close: 'close-fill',
	chevronLeft: 'chevron_left-fill',
	chevronRight: 'chevron_right-fill',
	favorite: 'favorite-fill',
	personAdd: 'person_add-fill',
	personCheck: 'how_to_reg-fill',
	visibility: 'visibility-fill',
	comment: 'comment-fill',
	play: 'play_arrow-fill',
	pause: 'pause-fill',
	openInNew: 'open_in_new-fill',
	error: 'error-fill',
	refresh: 'refresh-fill',
	share: 'share-fill',
	link: 'link-fill',
	expandMore: 'keyboard_arrow_down-fill',
	expandLess: 'keyboard_arrow_up-fill',
	lightMode: 'light_mode-fill',
	darkMode: 'dark_mode-fill',
};

/**
 * Font Awesome Free の brands から抜き出す図形。SNS のロゴは Material Symbols に無い。
 * Pawoo は Mastodon インスタンスなので mastodon のロゴを使う。
 */
const BRAND_SOURCES = {
	brandX: 'x-twitter',
	brandFacebook: 'facebook',
	brandMastodon: 'mastodon',
};

/**
 * Material Symbols に無い図形。自前で描いてここに置く。
 *
 * like: pixiv の「いいね」は顔 (目 2 つ + 笑った口) で、ハートはブックマークを指す
 *       (SITE_SPEC §8)。Material Symbols の mood は顔を丸い枠で囲っていて別物に見えるため、
 *       pixiv と同じ「枠の無い顔」を比率だけ合わせて描き起こす。
 *       塗りは svg 側の fill=currentColor に任せ、口だけ線で描く。
 */
const CUSTOM_SHAPES = {
	like: {
		viewBox: '0 0 24 24',
		markup: [
			'<circle cx="4" cy="8" r="4"/>',
			'<circle cx="20" cy="8" r="4"/>',
			'<path d="M7.05 14.95c2.73 2.73 7.17 2.73 9.9 0" fill="none" stroke="currentColor"',
			' stroke-width="4" stroke-linecap="round"/>',
		].join(''),
	},
};

/** 原本の置き場。 */
const SOURCE_DIR = 'node_modules/@material-symbols/svg-400/rounded';

/** ブランドロゴの原本の置き場。 */
const BRAND_SOURCE_DIR = 'node_modules/@fortawesome/fontawesome-free/svgs/brands';

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
for (const [name, file] of Object.entries(BRAND_SOURCES)) {
	shapes[name] = extract(await readFile(`${BRAND_SOURCE_DIR}/${file}.svg`, 'utf8'));
}
// 自前の図形は最後に混ぜる。同じ名前があれば自前を優先する
Object.assign(shapes, CUSTOM_SHAPES);

const header = `/**
 * 生成物。手で編集しない。scripts/build-symbols.mjs で作り直す。
 * 図形の出典:
 * - Material Symbols (Rounded, weight 400, FILL 1) / Apache-2.0
 *   https://github.com/google/material-design-icons
 * - Font Awesome Free 7 の brands (brandX / brandFacebook / brandMastodon) / CC BY 4.0
 *   https://fontawesome.com/license/free
 * ただし CUSTOM_SHAPES にある図形 (like) だけは自前で描いたもの。
 */
`;

await writeFile(
	OUTPUT_PATH,
	`${header}export const ICON_SHAPES = Object.freeze(${JSON.stringify(shapes, null, '\t')});\n`,
	'utf8',
);
console.log(`generated ${OUTPUT_PATH} (${Object.keys(shapes).length} icons)`);
