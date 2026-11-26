/**
 * 監視モードの再ビルドで出力されなくなった分割の断片を消す esbuild のプラグイン。
 * esbuild は再ビルドのときに出力先の古いファイルを消さないので、名前にハッシュを含む断片が溜まっていく。
 */
import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * フォルダの中から、残す一覧に無いファイルを消す。フォルダが無ければ何もしない。
 * @param {string} dir 断片を置くフォルダ (絶対パス)
 * @param {ReadonlySet<string>} keep 残すファイルの絶対パス
 * @returns {Promise<string[]>} 消したファイルの絶対パス
 * @throws {Error} フォルダを読めない (無い以外)・消せないとき
 */
export async function removeStaleChunks(dir, keep) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error?.code === 'ENOENT') return [];
		throw error;
	}
	const stale = entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(dir, entry.name))
		.filter((file) => !keep.has(file));
	await Promise.all(stale.map((file) => rm(file, { force: true })));
	return stale;
}

/**
 * プラグインを作る。metafile を有効にし、ビルドが成功するたびに今回の出力に無い断片を消す。
 * @param {string} chunkDir 断片を置くフォルダ。(esbuild の作業フォルダからの相対パスか絶対パス)
 * @returns {import('esbuild').Plugin} プラグイン
 */
export function staleChunksPlugin(chunkDir) {
	return {
		name: 'stale-chunks',
		setup(build) {
			build.initialOptions.metafile = true;
			const workingDir = build.initialOptions.absWorkingDir ?? process.cwd();
			const dir = resolve(workingDir, chunkDir);
			build.onEnd(async (result) => {
				// 失敗したビルドには metafile が無い。何が出力されたか分からないので消さない
				if (!result.metafile) return;
				const keep = new Set(Object.keys(result.metafile.outputs).map((file) => resolve(workingDir, file)));
				try {
					await removeStaleChunks(dir, keep);
				} catch (error) {
					// 片付けの失敗で監視を止めない
					console.error(`[stale-chunks] ${dir} の古い断片を消せませんでした: ${error?.message ?? error}`);
				}
			});
		},
	};
}
