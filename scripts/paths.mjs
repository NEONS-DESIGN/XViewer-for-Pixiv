/**
 * リポジトリのルートの場所。ビルドの道具はここを基準にパスを組む。(実行時のカレントに依らない)
 * テストからも読むので副作用を持たせない。
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** リポジトリのルート。このファイルは scripts/ にあるので 1 つ上。(絶対パス) */
export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * リポジトリのルートからの相対パスを絶対パスにする。
 * @param {...string} segments ルートからの相対パスの断片
 * @returns {string} 絶対パス
 */
export function fromRoot(...segments) {
	return join(ROOT_DIR, ...segments);
}
