/**
 * 文言カタログの入口。
 *
 * 言語ごとのカタログを 1 つ選んで凍結して返すだけ。グローバルな可変状態は持たない。
 * カタログは自分の言語を `lang` として持つので、書式の関数へ言語を渡すためだけに
 * 引数を引き回す必要がない。受け取る側は常に `strings` 1 つで済む。
 *
 * 言語を足すときは、カタログを 1 ファイル作って CATALOGS へ 1 行足し、
 * language.js の SUPPORTED_LANGUAGES へ 1 つ足す。他は触らなくてよい。
 */
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../common/language.js';
import { buildStrings } from './freeze.js';
import ja from './ja.js';
import en from './en.js';
import ko from './ko.js';
import zhCN from './zh-CN.js';
import zhTW from './zh-TW.js';

/** 言語ごとのカタログ。キーは SUPPORTED_LANGUAGES と 1 対 1。 */
const CATALOGS = Object.freeze({ ja, en, ko, 'zh-CN': zhCN, 'zh-TW': zhTW });

/** 作ったカタログの使い回し。同じ言語なら毎回同じものを返す。 */
const cache = new Map();

/**
 * 指定した言語のカタログを返す。
 * @param {string} lang 言語コード (SUPPORTED_LANGUAGES のどれか)
 * @returns {object} 文言のカタログ。自分の言語を lang として持つ。未知の言語なら既定の言語
 */
export function createStrings(lang) {
	const resolved = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
	const cached = cache.get(resolved);
	if (cached) return cached;
	const strings = buildStrings(resolved, CATALOGS[resolved]);
	cache.set(resolved, strings);
	return strings;
}
