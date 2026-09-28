/**
 * Material Symbols と Font Awesome (ブランドロゴ) から必要な図形だけを抜き出し、
 * 自前で描いた図形と混ぜて icon-shapes.js を生成する。
 * 生成物はコミットする。src/ を素の import で読めるようにするため。
 * 図形は文字列ではなく要素名と属性の組で持つ。実行時に innerHTML を使わず組み立てるため。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseSvgElements } from './svg-elements.mjs';

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
	info: 'info-fill',
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
 * like: pixiv の「いいね」は枠の無い顔 (目 2 つ + 笑った口) で、ハートはブックマークを指す。
 *       pixiv と同じ形を比率だけ合わせて描き起こしたもの。
 *       塗りは svg 側の fill=currentColor に任せ、口だけ線で描く。
 * 原本の SVG と同じく文字列で書き、同じ分解 (parseSvgElements) の検査を通してから混ぜる。
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
 * SVG の中のコメント。Font Awesome は各ファイルの先頭に帰属のコメントを持つ。
 * 帰属は HEADER と NOTICE に書いてあるので、図形データには残さない。
 * (残すと parseSvgElements が要素の並びとして読めずに止まる)
 */
const SVG_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * SVG から viewBox と中身を取り出す。
 * @param {string} svg SVG の中身
 * @param {string} source 読み込み元 (エラー表示用)
 * @returns {{viewBox: string, elements: Array<{tag: string, attrs: Record<string, string>}>}} 図形
 * @throws {Error} svg 要素か viewBox が見つからないとき、中身を要素の並びに分解できないとき
 *   (パッケージの更新で形式が変わった等)
 */
function extract(svg, source) {
	if (!/<svg[\s>]/.test(svg)) {
		throw new Error(`${source} に <svg> がありません`);
	}
	// viewBox は原本ごとに違う (Material Symbols は 0 -960 960 960、Font Awesome は 0 0 448 512 等)。
	// 既定値で埋めると単位の合わない枠に置かれ、アイコンが空に見えるまま生成が成功してしまう
	const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
	if (!viewBox) {
		throw new Error(`${source} に viewBox がありません (パッケージの更新で形式が変わっていないか)`);
	}
	const markup = svg
		.replace(SVG_COMMENT_PATTERN, '')
		.replace(/^[\s\S]*?<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.trim();
	return { viewBox, elements: parseSvgElements(markup, source) };
}

/**
 * 原本の SVG を読み、名前ごとの図形にする。
 * @param {Record<string, string>} sources 左がコード側の名前、右がファイル名 (拡張子なし)
 * @param {string} dir 原本の置き場
 * @returns {Promise<Record<string, {viewBox: string, elements: Array<{tag: string, attrs: Record<string, string>}>}>>} 図形
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

/**
 * 自前の図形を要素の組に分ける。原本から読む図形と同じ検査を通す。
 * @returns {Record<string, {viewBox: string, elements: Array<{tag: string, attrs: Record<string, string>}>}>} 図形
 * @throws {Error} 中身を要素の並びに分解できないとき
 */
function loadCustomShapes() {
	return Object.fromEntries(Object.entries(CUSTOM_SHAPES).map(([name, { viewBox, markup }]) => (
		[name, { viewBox, elements: parseSvgElements(markup, `CUSTOM_SHAPES.${name}`) }]
	)));
}

/**
 * 生成物に書き出す、入れ子まで凍らせる関数。
 * Object.freeze は一段目しか凍らせないので、elements や attrs を誤って書き換えると以後のすべてのアイコンが変わる。
 */
const DEEP_FREEZE_SOURCE = `/**
 * 入れ子まで凍らせる。図形データを誤って書き換えると、以後のすべてのアイコンが変わるため。
 * @template T
 * @param {T} value 凍らせる値
 * @returns {T} 同じ値
 */
function deepFreeze(value) {
	if (value !== null && typeof value === 'object') {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
`;

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
		...loadCustomShapes(),
	};
	await writeFile(
		OUTPUT_PATH,
		`${HEADER}\n${DEEP_FREEZE_SOURCE}\nexport const ICON_SHAPES = deepFreeze(${JSON.stringify(shapes, null, '\t')});\n`,
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
