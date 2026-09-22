/**
 * 拡張機能アイコンの図形データと SVG の組み立て。
 * PNG への変換は build-icons.mjs が行う。(ここは I/O を持たない純粋な計算だけ)
 *
 * 図形は「重なった画像カード」。大きいサイズは 3 枚 + 山と太陽、
 * 小さいサイズは同じ 3 枚でも中の絵を山だけに減らし、16px でも形が残るようにする。
 */

/** 背景のアクセント色。UI_DESIGN_KIT §2 の --accent (ダーク) と同じ値。 */
const ACCENT = '#4ea3d6';

/** カードの色。背景のアクセント色に白を重ねる。 */
const CARD_COLOR = '#ffffff';

/** 後ろのカードの不透明度。前面との前後関係をこれだけで表す。 */
const BACK_CARD_OPACITY = 0.45;

/** 隣り合うカードに最低限空ける隙間 (canvas の一辺に対する割合)。 */
export const MIN_CARD_GAP_RATIO = 0.03;

/**
 * 図形データ。canvas は viewBox の一辺。cards は奥から手前の順で、最後が前面。
 * 座標はすべて canvas と同じ単位。
 * @type {Record<string, {
 *   canvas: number,
 *   corner: number,
 *   background: string,
 *   cardColor: string,
 *   backCardOpacity: number,
 *   cards: Array<{x: number, y: number, w: number, h: number, r: number}>,
 *   sun: {cx: number, cy: number, r: number} | null,
 *   mountain: Array<[number, number]>,
 * }>}
 */
const ARTWORKS = {
	// 48px / 128px 用。中の絵まで見えるサイズ
	full: {
		canvas: 128,
		corner: 28,
		background: ACCENT,
		cardColor: CARD_COLOR,
		backCardOpacity: BACK_CARD_OPACITY,
		cards: [
			{ x: 18, y: 43, w: 16, h: 42, r: 7 },
			{ x: 94, y: 43, w: 16, h: 42, r: 7 },
			{ x: 38, y: 33, w: 52, h: 62, r: 10 },
		],
		sun: { cx: 56, cy: 52, r: 6 },
		// 二つの峰。前面カードの下辺から 10 空ける
		mountain: [
			[44, 85],
			[60, 61],
			[70, 73],
			[78, 63],
			[84, 85],
		],
	},
	// 16px / 32px 用。太陽を落とし、山を単峰の太い三角にする
	compact: {
		canvas: 32,
		corner: 7,
		background: ACCENT,
		cardColor: CARD_COLOR,
		backCardOpacity: BACK_CARD_OPACITY,
		cards: [
			{ x: 4, y: 11, w: 4, h: 10, r: 1.5 },
			{ x: 24, y: 11, w: 4, h: 10, r: 1.5 },
			{ x: 9, y: 8, w: 14, h: 16, r: 3 },
		],
		sun: null,
		mountain: [
			[11, 21],
			[16, 12],
			[21, 21],
		],
	},
};

/** 出力する PNG のサイズと、そこで使う図形。Chrome が使う 4 サイズ。 */
export const ICON_OUTPUTS = [
	{ size: 16, variant: 'compact' },
	{ size: 32, variant: 'compact' },
	{ size: 48, variant: 'full' },
	{ size: 128, variant: 'full' },
];

/**
 * PNG のファイル名。生成 (build-icons) / 配置 (build) / manifest の検査で同じ名前を使う。
 * @param {number} size 一辺の px
 * @returns {string} ファイル名 (ディレクトリは含まない)
 */
export function iconFileName(size) {
	return `icon-${size}.png`;
}

/**
 * 図形データを取り出す。
 * @param {string} variant 'full' | 'compact'
 * @returns {typeof ARTWORKS[keyof typeof ARTWORKS]} 図形データ
 * @throws {Error} 定義されていない variant のとき
 */
export function getArtwork(variant) {
	const artwork = ARTWORKS[variant];
	if (!artwork) {
		throw new Error(`未知の variant です: ${variant}`);
	}
	return artwork;
}

/**
 * 座標を SVG の属性値にする。小数の末尾 0 を落とす。
 * @param {number} value 数値
 * @returns {string} 属性値
 */
function num(value) {
	return String(Number(value.toFixed(3)));
}

/**
 * アイコンの SVG を組み立てる。サイズは指定せず viewBox だけ持たせ、
 * 何 px で描くかはラスタライズ側に任せる。
 * @param {string} variant 'full' | 'compact'
 * @returns {string} SVG 文字列
 * @throws {Error} 定義されていない variant のとき
 */
export function buildIconSvg(variant) {
	const art = getArtwork(variant);
	const parts = [
		`<rect x="0" y="0" width="${art.canvas}" height="${art.canvas}" rx="${art.corner}" fill="${art.background}"/>`,
	];

	art.cards.forEach((card, index) => {
		const isFront = index === art.cards.length - 1;
		const opacity = isFront ? '' : ` opacity="${art.backCardOpacity}"`;
		parts.push(
			`<rect x="${num(card.x)}" y="${num(card.y)}" width="${num(card.w)}" height="${num(card.h)}" rx="${num(card.r)}" fill="${art.cardColor}"${opacity}/>`,
		);
	});

	if (art.sun) {
		parts.push(
			`<circle cx="${num(art.sun.cx)}" cy="${num(art.sun.cy)}" r="${num(art.sun.r)}" fill="${art.background}"/>`,
		);
	}

	const points = art.mountain.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
	parts.push(`<polygon points="${points}" fill="${art.background}"/>`);

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.canvas} ${art.canvas}">`,
		...parts.map((part) => `\t${part}`),
		'</svg>',
		'',
	].join('\n');
}
