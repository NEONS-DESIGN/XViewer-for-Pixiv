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
	mood: 'mood-fill',
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

/** viewBox が読めなかったときの既定値。Material Symbols と Font Awesome の brands はどちらも 24 単位。 */
const DEFAULT_VIEW_BOX = '0 0 24 24';

/**
 * SVG の中のコメント。Font Awesome は各ファイルの先頭に帰属のコメントを持つ。
 * 帰属は HEADER と NOTICE に書いてあるので、図形データには残さない
 * (残すと createIcon のたびに innerHTML でコメントノードが注入され、生成物も膨らむ)。
 */
const SVG_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * SVG から viewBox と中身を取り出す。
 * @param {string} svg SVG の中身
 * @param {string} source 読み込み元 (エラー表示用)
 * @returns {{viewBox: string, markup: string}} 図形
 * @throws {Error} svg 要素が見つからないとき (パッケージの更新で形式が変わった等)
 */
function extract(svg, source) {
	if (!/<svg[\s>]/.test(svg)) {
		throw new Error(`${source} に <svg> がありません`);
	}
	const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? DEFAULT_VIEW_BOX;
	const markup = svg
		.replace(SVG_COMMENT_PATTERN, '')
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.trim();
	return { viewBox, markup };
}

/**
 * 原本の SVG を読み、名前ごとの図形にする。
 * @param {Record<string, string>} sources 左がコード側の名前、右がファイル名 (拡張子なし)
 * @param {string} dir 原本の置き場
 * @returns {Promise<Record<string, {viewBox: string, markup: string}>>} 図形
 * @throws {Error} 原本が読めない・形式が違うとき
 */
async function loadShapes(sources, dir) {
	const entries = await Promise.all(Object.entries(sources).map(async ([name, file]) => {
		const path = `${dir}/${file}.svg`;
		let svg;
		try {
			svg = await readFile(path, 'utf8');
		} catch (error) {
			throw new Error(`${path} を読めません (npm install 済みか、パッケージの更新で名前が変わっていないか): ${error.message}`);
		}
		return [name, extract(svg, path)];
	}));
	return Object.fromEntries(entries);
}

/** 生成物の先頭に付ける注意書きと出典。 */
const HEADER = `/**
 * 生成物。手で編集しない。scripts/build-symbols.mjs で作り直す。
 * 図形の出典:
 * - Material Symbols (Rounded, weight 400, FILL 1) / Apache-2.0
 *   https://github.com/google/material-design-icons
 * - Font Awesome Free 7 の brands (brandX / brandFacebook / brandMastodon) / CC BY 4.0
 *   https://fontawesome.com/license/free
 * ただし CUSTOM_SHAPES にある図形 (like) だけは自前で描いたもの。
 */
`;

/**
 * icon-shapes.js を生成する。
 * @returns {Promise<number>} 生成した図形の数
 */
async function build() {
	const shapes = {
		...(await loadShapes(ICON_SOURCES, SOURCE_DIR)),
		...(await loadShapes(BRAND_SOURCES, BRAND_SOURCE_DIR)),
		// 自前の図形は最後に混ぜる。同じ名前があれば自前を優先する
		...CUSTOM_SHAPES,
	};
	await writeFile(
		OUTPUT_PATH,
		`${HEADER}export const ICON_SHAPES = Object.freeze(${JSON.stringify(shapes, null, '\t')});\n`,
		'utf8',
	);
	return Object.keys(shapes).length;
}

try {
	const count = await build();
	console.log(`generated ${OUTPUT_PATH} (${count} icons)`);
} catch (error) {
	// 素の例外のまま落とすとスタックトレースだけが出て、どの原本が無いのか読み取りにくい
	console.error(`[build-symbols] ${error?.message ?? error}`);
	process.exit(1);
}
