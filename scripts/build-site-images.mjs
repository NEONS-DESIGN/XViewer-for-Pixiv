/**
 * 紹介サイト (site/) の画像を元素材の PNG から WebP で書き出す。
 * 生成物 (site/assets/img/*.webp, og-*.jpg) はコミットする。通常のビルドでは走らせない。
 *
 * 元素材は store/sources/ にある。(Git 管理外のため、手元に無いと止まる)
 * JPEG を経由すると圧縮が二重に掛かるので、必ず可逆の PNG から直接書き出すこと。
 *
 * 1 枚ごとに可逆 WebP と非可逆 WebP の両方を作り、小さいほうを採る。
 * UI の寄り (ポップアップ・入力欄) は可逆のほうが小さくなり、
 * 作品画像が大きく写るビューポート全体は非可逆のほうが小さくなる。
 */
import sharp from 'sharp';
import { mkdir, stat, writeFile } from 'node:fs/promises';

/** 元素材の置き場所。 */
const SOURCE_DIR = 'store/sources';

/** 出力先のディレクトリ。 */
const OUT_DIR = 'site/assets/img';

/**
 * 非可逆 WebP の設定。
 * - quality 90: 文字の輪郭に崩れが出ない下限。旧 JPEG (-q:v 5-6) より SSIM が高い
 * - smartSubsample: 色差を間引くときの滲みを抑える。(青いリンク文字の縁が濁るのを防ぐ)
 * - effort 6: 最も時間を掛けて小さくする
 */
const LOSSY = { quality: 90, effort: 6, smartSubsample: true };

/** 可逆 WebP の設定。quality は可逆では圧縮の手間を意味する。 */
const LOSSLESS = { lossless: true, quality: 100, effort: 6 };

/**
 * 可逆のほうがこの倍率までなら大きくても可逆を採る。
 * 劣化が 0 になる分、多少の増量は受け入れる。
 */
const LOSSLESS_TOLERANCE = 1.1;

/**
 * OGP 用 JPEG の設定。SNS の共有カードは WebP を読めないものが残っているため、
 * og:image だけは JPEG にする。ページ本体からは参照しない。
 * カードは縮小表示され、各 SNS 側でも再圧縮されるので、色差は間引いてサイズを優先する。
 */
const OG_JPEG = { quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' };

/**
 * 書き出す画像の一覧。
 * @type {{ source: string, out: string, og?: string }[]}
 * source: SOURCE_DIR 内の元素材 / out: OUT_DIR 内の WebP / og: OUT_DIR 内の OGP 用 JPEG
 */
const IMAGES = [
	{ source: 'site-viewer-light.png', out: 'shot-viewer.webp', og: 'og-viewer.jpg' },
	{ source: 'site-viewer-light-en.png', out: 'shot-viewer-en.webp', og: 'og-viewer-en.jpg' },
	{ source: 'site-comments-light.png', out: 'shot-comments.webp' },
	{ source: 'site-comments-light-en.png', out: 'shot-comments-en.webp' },
	{ source: 'comment-form-light.png', out: 'shot-comment-form.webp' },
	{ source: 'comment-form-light-en.png', out: 'shot-comment-form-en.webp' },
	{ source: 'popup-top-light.png', out: 'shot-popup.webp' },
	{ source: 'popup-top-light-en.png', out: 'shot-popup-en.webp' },
	{ source: 'infinite-scroll-poster.png', out: 'infinite-scroll.webp' },
];

/**
 * 元素材があるか確かめる。
 * @param {string} path 元素材のパス
 * @returns {Promise<void>}
 * @throws {Error} 見つからないとき
 */
async function assertSource(path) {
	try {
		await stat(path);
	} catch {
		throw new Error(`元素材が見つかりません: ${path} (WEB_SPEC.md §7 の手順で撮り直してください)`);
	}
}

/**
 * 可逆と非可逆の両方で書き出し、採るほうを返す。
 * @param {string} path 元素材のパス
 * @returns {Promise<{ buffer: Buffer, mode: 'lossless' | 'lossy' }>}
 */
async function encodeWebp(path) {
	const [lossless, lossy] = await Promise.all([
		sharp(path).webp(LOSSLESS).toBuffer(),
		sharp(path).webp(LOSSY).toBuffer(),
	]);
	return lossless.length <= lossy.length * LOSSLESS_TOLERANCE
		? { buffer: lossless, mode: 'lossless' }
		: { buffer: lossy, mode: 'lossy' };
}

/**
 * 1 件分を書き出す。
 * @param {{ source: string, out: string, og?: string }} image 書き出す画像
 * @returns {Promise<void>}
 */
async function buildOne({ source, out, og }) {
	const path = `${SOURCE_DIR}/${source}`;
	await assertSource(path);
	const { width, height } = await sharp(path).metadata();

	const { buffer, mode } = await encodeWebp(path);
	await writeFile(`${OUT_DIR}/${out}`, buffer);
	console.log(`${OUT_DIR}/${out} (${width}x${height}, ${mode}, ${(buffer.length / 1024).toFixed(1)} KB)`);

	if (og) {
		const jpeg = await sharp(path).flatten({ background: '#ffffff' }).jpeg(OG_JPEG).toBuffer();
		await writeFile(`${OUT_DIR}/${og}`, jpeg);
		console.log(`${OUT_DIR}/${og} (${width}x${height}, og:image, ${(jpeg.length / 1024).toFixed(1)} KB)`);
	}
}

/**
 * すべての画像を書き出す。
 * @returns {Promise<void>}
 */
async function build() {
	await mkdir(OUT_DIR, { recursive: true });
	for (const image of IMAGES) {
		await buildOne(image);
	}
}

try {
	await build();
} catch (error) {
	console.error(`[build-site-images] ${error?.message ?? error}`);
	process.exit(1);
}
