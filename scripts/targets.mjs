/**
 * 対応する Chrome の下限。esbuild の target と manifest の minimum_chrome_version の出どころはここ 1 か所。
 *
 * 下限を決めている機能:
 *   - content_scripts の "world": "MAIN" (111+)。これより古いと world が無視され、
 *     inject.js が isolated world で走って history のフックが効かないまま黙って壊れる
 *   - color-mix() (111+)、CSS nesting (120+)
 * 上限側の機能 (appearance: base-select 等) は進行的強化で、無くても動く。
 */

/** Chrome のメジャーバージョンの下限。 */
export const MINIMUM_CHROME_MAJOR = 120;

/** esbuild の target。構文の変換をこの版に合わせる。 */
export const ESBUILD_TARGET = `chrome${MINIMUM_CHROME_MAJOR}`;

/** manifest の minimum_chrome_version。ビルド時に差し込む。(src/manifest.json には書かない) */
export const MINIMUM_CHROME_VERSION = String(MINIMUM_CHROME_MAJOR);
