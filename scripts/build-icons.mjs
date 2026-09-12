/**
 * 拡張機能アイコンの PNG を生成する。
 * 生成物 (src/icons/*.png) はコミットする。通常のビルドでは走らせない。
 * Chrome の manifest は PNG しか受け付けないため、SVG をここでラスタライズする。
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { ICON_OUTPUTS, buildIconSvg } from './icon-svg.mjs';

/** 出力先のディレクトリ。 */
const OUT_DIR = 'src/icons';

/** 出力するファイル名。サイズを埋めて使う。 */
const FILE_NAME = (size) => `icon-${size}.png`;

/** 角の外側を透明で残す (アイコン自身が角丸の背景を持つため)。 */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/**
 * SVG を指定サイズの PNG にする。
 * @param {string} svg SVG 文字列
 * @param {number} size 一辺の px
 * @returns {Buffer} PNG のバイト列
 * @throws {Error} ラスタライズに失敗したとき
 */
function rasterize(svg, size) {
	try {
		const resvg = new Resvg(svg, {
			fitTo: { mode: 'width', value: size },
			background: TRANSPARENT,
		});
		return resvg.render().asPng();
	} catch (error) {
		throw new Error(`${size}px の描画に失敗しました: ${error.message}`);
	}
}

/**
 * すべてのサイズの PNG を書き出す。
 * @returns {Promise<void>}
 */
async function build() {
	await mkdir(OUT_DIR, { recursive: true });
	for (const { size, variant } of ICON_OUTPUTS) {
		const png = rasterize(buildIconSvg(variant), size);
		const path = `${OUT_DIR}/${FILE_NAME(size)}`;
		await writeFile(path, png);
		console.log(`${path} (${variant}, ${png.length} bytes)`);
	}
}

try {
	await build();
} catch (error) {
	console.error(`[build-icons] ${error.message}`);
	process.exit(1);
}
