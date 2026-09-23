/**
 * ビルドがそのままコピーする静的ファイルの表。
 * build.mjs は import した時点でビルドが走るため、表だけをここへ出してテストから読めるようにした。
 * (副作用なし。build.mjs と test/common/licenses.test.js / test/popup/popup-css.test.js が読む)
 */
import { ICON_OUTPUTS, iconFileName } from './icon-svg.mjs';

/** 出力先。 */
export const OUT_DIR = 'dist';

/**
 * そのままコピーする静的ファイル。[コピー元, コピー先] の順。
 * アイコンは build-icons.mjs が作った生成物で、サイズの出どころは ICON_OUTPUTS 1 か所。
 * manifest は version を差し込むのでここには入れない。(build.mjs の writeManifest)
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const STATIC_FILES = Object.freeze([
	['src/popup/popup.html', `${OUT_DIR}/popup/popup.html`],
	['src/popup/popup.css', `${OUT_DIR}/popup/popup.css`],
	// 配色トークン。popup.html が ../common/tokens.css で読むので、src と同じ相対配置で置く。
	// viewer.js は同じファイルを text loader で束ねるため、こちらは popup のためだけのコピー
	['src/common/tokens.css', `${OUT_DIR}/common/tokens.css`],
	...ICON_OUTPUTS.map(({ size }) => [
		`src/icons/${iconFileName(size)}`,
		`${OUT_DIR}/icons/${iconFileName(size)}`,
	]),
	// manifest の name / description の訳。__MSG_*__ の解決に使うので dist/_locales に置く。
	// ここだけは pixiv の表示言語ではなくブラウザの UI 言語に従う (chrome.i18n の仕様)
	['src/_locales/ja/messages.json', `${OUT_DIR}/_locales/ja/messages.json`],
	['src/_locales/en/messages.json', `${OUT_DIR}/_locales/en/messages.json`],
	// ライセンス文。配布する zip は dist をそのまま固めるので、ここに無いと受け取った人に届かない。
	// Apache-2.0 §4(a) は本文の写しを渡すことを求める (Material Symbols の図形を同梱しているため)
	['LICENSE', `${OUT_DIR}/LICENSE`],
	['NOTICE', `${OUT_DIR}/NOTICE`],
	['LICENSES/Apache-2.0.txt', `${OUT_DIR}/LICENSES/Apache-2.0.txt`],
].map((pair) => Object.freeze(pair)));
