/**
 * 設定画面 (popup) 用の文言カタログの入口。
 * 使う 1 言語のカタログだけを読む。content script は index.js の createStrings を使う。
 */
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../common/language.js';
import { buildStrings } from './freeze.js';

/** 言語ごとの読み込み。キーは SUPPORTED_LANGUAGES と 1 対 1。 */
const LOADERS = Object.freeze({
	ja: () => import('./ja.js'),
	en: () => import('./en.js'),
	ko: () => import('./ko.js'),
	'zh-CN': () => import('./zh-CN.js'),
	'zh-TW': () => import('./zh-TW.js'),
});

/**
 * 指定した言語のカタログを読む。
 * @param {string} lang 言語コード
 * @param {{loaders?: Record<string, () => Promise<{default: object}>>}} [deps] テスト用の依存
 * @returns {Promise<object>} 文言のカタログ。未知の言語や、読み込みの表に無い言語なら既定の言語
 */
export async function loadStrings(lang, deps = {}) {
	const loaders = deps.loaders ?? LOADERS;
	const supported = SUPPORTED_LANGUAGES.includes(lang) && Object.hasOwn(loaders, lang);
	const resolved = supported ? lang : DEFAULT_LANGUAGE;
	const module = await loaders[resolved]();
	return buildStrings(resolved, module.default);
}
