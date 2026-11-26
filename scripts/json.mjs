/**
 * ビルドの道具が共有する JSON の読み込み。
 * テストからも読むので副作用を持たせない。
 */
import { readFile } from 'node:fs/promises';

/** version の出どころ。リポジトリのルートからの相対パス。 */
export const PACKAGE_JSON = 'package.json';

/**
 * JSON ファイルを読む。
 * @param {string} path ファイルの場所
 * @returns {Promise<object>} 中身
 * @throws {Error} 読めない・JSON として解釈できないとき (メッセージにファイルの場所を含む)
 */
export async function readJson(path) {
	let text;
	try {
		text = await readFile(path, 'utf8');
	} catch (error) {
		throw new Error(`${path} を読めません: ${error.message}`);
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${path} を JSON として読めません: ${error.message}`);
	}
}
