/**
 * 紹介サイト (site/) の画像を元素材の PNG から WebP で書き出す。
 * 生成物 (site/assets/img/*.webp, og-*.jpg) はコミットする。通常のビルドでは走らせない。
 *
 * 元素材は store/sources/ にある。(Git 管理外のため、手元に無いと止まる)
 * JPEG を経由すると圧縮が二重に掛かるので、必ず可逆の PNG から直接書き出すこと。
 *
 * 1 枚ごとに可逆 WebP と非可逆 WebP の両方を作り、小さいほうを採る。(LOSSLESS_TOLERANCE までは可逆を優先する)
 * 元素材が 1 枚でも欠けていれば、何も書き出す前に止まる。
 * パスはリポジトリのルートから解く。(どのフォルダから実行しても同じ場所を読み書きする)
 */
import sharp from 'sharp';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { ROOT_DIR } from './paths.mjs';

// 元素材と出力先はルートからの相対パスなので、カレントをルートへ移してから使う
process.chdir(ROOT_DIR);

/** 元素材の置き場所。(リポジトリのルートからの相対パス) */
const SOURCE_DIR = 'store/sources';

/** 出力先のディレクトリ。(リポジトリのルートからの相対パス) */
const OUT_DIR = 'site/assets/img';

/**
 * 非可逆 WebP の設定。
 * - quality 90: 画面写真の文字の輪郭を崩さない画質
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
	{ source: 'popup-bottom-light.png', out: 'shot-popup-bottom.webp' },
	{ source: 'popup-bottom-light-en.png', out: 'shot-popup-bottom-en.webp' },
	{ source: 'infinite-scroll-poster.png', out: 'infinite-scroll.webp' },
];

/**
 * 元素材のパスを返す。
 * @param {string} source SOURCE_DIR 内のファイル名
 * @returns {string} 元素材のパス
 */
function sourcePath(source) {
	return `${SOURCE_DIR}/${source}`;
}

/**
 * すべての元素材があるか確かめる。欠けているものはまとめて 1 つのエラーにする。
 * @param {ReadonlyArray<{ source: string }>} images 書き出す画像
 * @returns {Promise<void>}
 * @throws {Error} 1 枚でも見つからないとき
 */
async function assertSources(images) {
	const results = await Promise.all(images.map(async ({ source }) => {
		const path = sourcePath(source);
		try {
			const info = await stat(path);
			return info.isFile() ? null : path;
		} catch {
			return path;
		}
	}));
	const missing = results.filter(Boolean);
	if (missing.length > 0) {
		throw new Error(`元素材が見つかりません: ${missing.join(', ')} (store/sources/ に撮影素材を置いてから実行してください)`);
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
	const path = sourcePath(source);
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
	// 書き出しの途中で欠けに気づくと、前の画像だけ新しくなった状態で止まるので先に全部確かめる
	await assertSources(IMAGES);
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
