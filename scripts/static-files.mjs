/**
 * ビルドがそのままコピーする静的ファイルの表。
 * build.mjs は import した時点でビルドが走るため、表だけをここへ出してテストから読めるようにした。
 * (副作用なし。build.mjs と test/common/licenses.test.js / test/popup/popup-css.test.js が読む)
 *
 * 出力先はブラウザごとに分かれる。(scripts/browsers.mjs) コピーする中身は同じで、置き場所だけが違う。
 */
import { ICON_OUTPUTS, iconFileName } from './icon-svg.mjs';

/** Chrome 系の出力先。Chrome に「パッケージ化されていない拡張機能」として読ませる場所。 */
export const OUT_DIR = 'dist';

/** Firefox の出力先。Chrome 系の dist とは混ぜない。 */
export const FIREFOX_OUT_DIR = 'dist-firefox';

/**
 * そのままコピーする静的ファイルの表を作る。[コピー元, コピー先] の順。
 * アイコンは build-icons.mjs が作った生成物で、サイズの出どころは ICON_OUTPUTS 1 か所。
 * manifest は version を差し込むのでここには入れない。(build.mjs の writeManifest)
 * @param {string} outDir 出力先
 * @returns {ReadonlyArray<readonly [string, string]>} [コピー元, コピー先] の表
 */
export function staticFilesFor(outDir) {
	return Object.freeze([
		['src/popup/popup.html', `${outDir}/popup/popup.html`],
		['src/popup/popup.css', `${outDir}/popup/popup.css`],
		// 配色トークン。popup.html が ../common/tokens.css で読むので、src と同じ相対配置で置く。
		// viewer.js は同じファイルを text loader で束ねるため、こちらは popup のためだけのコピー
		['src/common/tokens.css', `${outDir}/common/tokens.css`],
		...ICON_OUTPUTS.map(({ size }) => [
			`src/icons/${iconFileName(size)}`,
			`${outDir}/icons/${iconFileName(size)}`,
		]),
		// manifest の name / description の訳。__MSG_*__ の解決に使うので <出力先>/_locales に置く。
		// ここだけは pixiv の表示言語ではなくブラウザの UI 言語に従う (chrome.i18n の仕様)
		['src/_locales/ja/messages.json', `${outDir}/_locales/ja/messages.json`],
		['src/_locales/en/messages.json', `${outDir}/_locales/en/messages.json`],
		// ライセンス文。配布する zip は出力先をそのまま固めるので、ここに無いと受け取った人に届かない。
		// Apache-2.0 §4(a) は本文の写しを渡すことを求める (Material Symbols の図形を同梱しているため)
		['LICENSE', `${outDir}/LICENSE`],
		['NOTICE', `${outDir}/NOTICE`],
		['LICENSES/Apache-2.0.txt', `${outDir}/LICENSES/Apache-2.0.txt`],
	].map((pair) => Object.freeze(pair)));
}

/** Chrome 系 (dist) へコピーする静的ファイル。 */
export const STATIC_FILES = staticFilesFor(OUT_DIR);
