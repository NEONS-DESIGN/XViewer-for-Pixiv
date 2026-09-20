/**
 * Chrome ウェブストア用のスクリーンショット (1280x800) を組む。
 *
 * ブラウザのキャプチャは 1512x806 で固定されており、1280x800 へは比率が合わない。
 * 引き伸ばすと文字が潰れるので、キャプチャは素材として置き、見出しは SVG のベクタで描く。
 *
 * 入力は store/sources/、出力は store/screenshots/。
 * ストアの要求は「1280x800 の JPEG または 24 ビット PNG (アルファなし)」なので、
 * resvg が返す RGBA からアルファを落として PNG (カラータイプ 2) で書き出す。
 *
 * 実行: node store/build-screenshots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

/** 出力の大きさ。ストアの指定。 */
const WIDTH = 1280;
const HEIGHT = 800;

/** 配色。拡張本体の UI_DESIGN_KIT.md §2 に合わせる。 */
const COLOR = Object.freeze({
	bg: '#14161c',
	surface: '#1d212b',
	fg: '#eff0f4',
	muted: '#9aa0b4',
	border: '#2b3140',
	accent: '#4ea3d6',
});

/** 見出しと本文の書体。Windows に載っているものを順に指定する。 */
const FONT = "'Yu Gothic UI','Yu Gothic','Meiryo','Segoe UI',sans-serif";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = path.join(HERE, 'sources');
const OUT = path.join(HERE, 'screenshots');

/** 1〜3 枚目で共通の、図を置く箱。 */
const STAGE = Object.freeze({ x: 56, y: 216, width: 1168, height: 560 });

/**
 * 素材を data URI にする。
 * @param {string} name store/sources の中のファイル名
 * @returns {string} data URI
 */
function dataUri(name) {
	const file = path.join(SOURCES, name);
	const type = path.extname(name).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
	return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
}

/**
 * XML の特殊文字を逃がす。
 * @param {string} text 文字列
 * @returns {string} 逃がした文字列
 */
function escapeXml(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 素材の実寸を読む。PNG と JPEG だけ。
 * @param {string} name store/sources の中のファイル名
 * @returns {{width: number, height: number}} 実寸
 */
function readSize(name) {
	const bytes = fs.readFileSync(path.join(SOURCES, name));
	if (bytes.subarray(1, 4).toString('ascii') === 'PNG') {
		return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
	}
	// JPEG は SOF マーカーまで辿る
	let at = 2;
	while (at < bytes.length) {
		if (bytes[at] !== 0xff) {
			at += 1;
			continue;
		}
		const marker = bytes[at + 1];
		const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (isSof) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
		at += 2 + bytes.readUInt16BE(at + 2);
	}
	throw new Error(`実寸が読めません: ${name}`);
}

/**
 * 箱の中に、比率を保ったまま中央で収める。
 * 枠と素材の比率が違うと端が切れる (実際にアドレスバーを切り落とした) ので毎回ここで出す。
 * @param {string} name 素材のファイル名
 * @param {{x: number, y: number, width: number, height: number}} box 収める箱
 * @returns {{x: number, y: number, width: number, height: number}} 枠
 */
function fit(name, box) {
	const size = readSize(name);
	const ratio = Math.min(box.width / size.width, box.height / size.height);
	const width = Math.round(size.width * ratio);
	const height = Math.round(size.height * ratio);
	return {
		x: Math.round(box.x + (box.width - width) / 2),
		y: Math.round(box.y + (box.height - height) / 2),
		width,
		height,
	};
}

/**
 * 背景 (地の色と上部のうすい光)。
 * @returns {string} SVG 断片
 */
function background() {
	return `
	<defs>
		<radialGradient id="glow" cx="50%" cy="0%" r="70%">
			<stop offset="0%" stop-color="${COLOR.accent}" stop-opacity="0.20"/>
			<stop offset="100%" stop-color="${COLOR.accent}" stop-opacity="0"/>
		</radialGradient>
	</defs>
	<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOR.bg}"/>
	<rect width="${WIDTH}" height="460" fill="url(#glow)"/>`;
}

/**
 * 左上のブランド行 (アイコンと名前)。
 * @returns {string} SVG 断片
 */
function brand() {
	return `
	<image x="56" y="44" width="30" height="30" href="${dataUri('icon-128.png')}"/>
	<text x="96" y="65" font-family="${FONT}" font-size="19" font-weight="700" fill="${COLOR.muted}">XViewer for Pixiv</text>`;
}

/**
 * 見出しと説明文。
 * @param {string} title 見出し
 * @param {string} subtitle 説明文 (1 行)
 * @returns {string} SVG 断片
 */
function heading(title, subtitle) {
	return `
	<text x="56" y="146" font-family="${FONT}" font-size="44" font-weight="700" fill="${COLOR.fg}">${escapeXml(title)}</text>
	<text x="56" y="190" font-family="${FONT}" font-size="21" fill="${COLOR.muted}">${escapeXml(subtitle)}</text>`;
}

/**
 * 角を丸めた枠に素材を収める。
 * @param {object} spec 位置と大きさと素材
 * @param {string} spec.id clipPath の id (図の中で一意)
 * @param {string} spec.name 素材のファイル名
 * @param {number} spec.x 左
 * @param {number} spec.y 上
 * @param {number} spec.width 幅
 * @param {number} spec.height 高さ
 * @returns {string} SVG 断片
 */
function framed(spec) {
	const radius = 12;
	return `
	<defs>
		<clipPath id="${spec.id}">
			<rect x="${spec.x}" y="${spec.y}" width="${spec.width}" height="${spec.height}" rx="${radius}" ry="${radius}"/>
		</clipPath>
	</defs>
	<image clip-path="url(#${spec.id})" x="${spec.x}" y="${spec.y}" width="${spec.width}" height="${spec.height}"
		preserveAspectRatio="none" href="${dataUri(spec.name)}"/>
	<rect x="${spec.x}" y="${spec.y}" width="${spec.width}" height="${spec.height}" rx="${radius}" ry="${radius}"
		fill="none" stroke="${COLOR.border}" stroke-width="1"/>`;
}

/**
 * キーの絵 (角丸の箱と文字)。
 * @param {number} x 左
 * @param {number} y 上
 * @param {string} label キーの文字
 * @param {number} [width] 幅。既定は正方形
 * @returns {string} SVG 断片
 */
function keyCap(x, y, label, width) {
	const size = 54;
	const boxWidth = width ?? size;
	return `
	<rect x="${x}" y="${y}" width="${boxWidth}" height="${size}" rx="10" ry="10"
		fill="${COLOR.surface}" stroke="${COLOR.border}" stroke-width="1"/>
	<text x="${x + boxWidth / 2}" y="${y + size / 2 + 9}" text-anchor="middle" font-family="${FONT}"
		font-size="${label.length > 2 ? 20 : 26}" font-weight="700" fill="${COLOR.fg}">${escapeXml(label)}</text>`;
}

/**
 * 箇条書き (点と文字)。
 * @param {number} x 左
 * @param {number} y 1 行目の基準線
 * @param {string[]} lines 行
 * @returns {string} SVG 断片
 */
function bullets(x, y, lines) {
	return lines.map((line, index) => {
		const top = y + index * 52;
		return `
	<circle cx="${x + 5}" cy="${top - 6}" r="5" fill="${COLOR.accent}"/>
	<text x="${x + 24}" y="${top}" font-family="${FONT}" font-size="21" fill="${COLOR.fg}">${escapeXml(line)}</text>`;
	}).join('');
}

/**
 * 見出し + 大きな 1 枚の図、という共通の形。
 * @param {string} id clipPath の id
 * @param {string} title 見出し
 * @param {string} subtitle 説明文
 * @param {string} name 素材のファイル名
 * @returns {string} SVG 断片
 */
function sheetWithShot(id, title, subtitle, name) {
	return `${background()}${brand()}
		${heading(title, subtitle)}
		${framed({ id, name, ...fit(name, STAGE) })}`;
}

/** キー操作の一覧 (5 枚目)。 */
const KEY_ROWS = [
	{ keys: ['←', '→'], label: '同じ作品のページ送り' },
	{ keys: ['↑', '↓'], label: '前後の作品へ移動' },
	{ keys: ['Esc'], label: 'モーダルを閉じる' },
	{ keys: ['Tab'], label: 'モーダルの中をフォーカス移動 (外へ出ません)' },
];

/**
 * キー操作の一覧を描く。
 * @returns {string} SVG 断片
 */
function keySheet() {
	const panel = `
	<rect x="176" y="248" width="928" height="452" rx="16" ry="16"
		fill="${COLOR.surface}" stroke="${COLOR.border}" stroke-width="1"/>`;
	const rows = KEY_ROWS.map((row, index) => {
		const top = 296 + index * 104;
		const caps = row.keys.map((key, at) => keyCap(232 + at * 68, top, key, key.length > 2 ? 84 : undefined)).join('');
		const wide = row.keys.length > 1 ? 2 * 68 : (row.keys[0].length > 2 ? 100 : 68);
		const divider = index === KEY_ROWS.length - 1 ? '' : `
	<rect x="232" y="${top + 78}" width="816" height="1" fill="${COLOR.border}"/>`;
		return `${caps}
	<text x="${232 + wide + 20}" y="${top + 36}" font-family="${FONT}" font-size="23" fill="${COLOR.fg}">${escapeXml(row.label)}</text>${divider}`;
	}).join('');
	return `${background()}${brand()}
		${heading('キーボードだけで、次の作品へ', '手をマウスに戻さずに、作品からその次の作品まで見ていけます。')}${panel}${rows}`;
}

/** 5 枚の構成。 */
const SHEETS = [
	{
		name: 'store-1-viewer',
		build: () => sheetWithShot('c1', 'クリックした作品が、その場で開く',
			'ページ遷移せずにモーダルで表示。閉じれば元のグリッドの、元のスクロール位置に戻ります。',
			'viewer-single.jpg'),
	},
	{
		name: 'store-2-sidebar',
		build: () => sheetWithShot('c2', '投稿文もコメントも、画像の横に',
			'タグ・投稿日・いいね数・コメントをサイドバーに。スタンプと絵文字は画像のまま表示します。',
			'viewer-multi.jpg'),
	},
	{
		name: 'store-3-infinite',
		build: () => sheetWithShot('c3', '一覧を、途切れさせない',
			'ページャーを押さずに読み込み続けます。URL のページ番号も、画面に出ているページへ追従します。',
			'grid.jpg'),
	},
	{
		name: 'store-4-settings',
		build: () => `${background()}${brand()}
			${heading('設定は、その場で反映される', '保存ボタンはありません。変更した瞬間に、開いているページにも効きます。')}
			${bullets(60, 300, [
			'ビュワーの表示とサイドバーの出し方',
			'画像の解像度と先読みの枚数',
			'クリックで原寸表示',
			'ピックアップ欄を隠す',
			'無限スクロールの動作',
			'背景クリックで閉じるか',
		])}
			${framed({ id: 'c4', name: 'shot-popup.png', ...fit('shot-popup.png', { x: 812, y: 216, width: 412, height: 560 }) })}`,
	},
	{ name: 'store-5-keys', build: keySheet },
];

/** PNG のシグネチャ。 */
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** CRC32 の表。PNG のチャンク末尾に付ける。 */
const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return table;
})();

/**
 * CRC32 を求める。
 * @param {Buffer} buffer 対象
 * @returns {number} CRC
 */
function crc32(buffer) {
	let c = -1;
	for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

/**
 * RGBA の画素からアルファを落として 24 ビット PNG にする。
 * ストアがアルファ付きを受け付けないため、カラータイプ 2 (truecolor) で書く。
 * @param {Buffer|Uint8Array} rgba RGBA の画素
 * @param {number} width 幅
 * @param {number} height 高さ
 * @returns {Buffer} PNG
 */
function encodeRgbPng(rgba, width, height) {
	const stride = width * 3;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y += 1) {
		raw[y * (stride + 1)] = 0;
		for (let x = 0; x < width; x += 1) {
			const from = (y * width + x) * 4;
			const to = y * (stride + 1) + 1 + x * 3;
			raw[to] = rgba[from];
			raw[to + 1] = rgba[from + 1];
			raw[to + 2] = rgba[from + 2];
		}
	}
	const chunk = (type, body) => {
		const head = Buffer.alloc(8);
		head.writeUInt32BE(body.length, 0);
		head.write(type, 4, 'ascii');
		const tail = Buffer.alloc(4);
		tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
		return Buffer.concat([head, body, tail]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	return Buffer.concat([
		SIGNATURE,
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const sheet of SHEETS) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"
		viewBox="0 0 ${WIDTH} ${HEIGHT}">${sheet.build()}</svg>`;
	const rendered = new Resvg(svg, {
		font: { loadSystemFonts: true },
		fitTo: { mode: 'width', value: WIDTH },
	}).render();
	const png = encodeRgbPng(rendered.pixels, rendered.width, rendered.height);
	const file = path.join(OUT, `${sheet.name}.png`);
	fs.writeFileSync(file, png);
	console.log(`${sheet.name}.png ${rendered.width}x${rendered.height} 24bit ${Math.round(png.length / 1024)}KB`);
}
