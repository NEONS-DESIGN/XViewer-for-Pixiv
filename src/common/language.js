/**
 * 表示言語の判定。
 *
 * **URL の接頭辞 (`/en`) を言語判定に使ってはいけない。** 接頭辞が付くのは `/en` だけで、
 * 他の言語 (`/ko` `/zh` `/th` ...) は 404 になり、接頭辞なしのパスのまま表示される。
 * (SITE_SPEC §0 実測) つまり「接頭辞が無い = 日本語」は偽である。
 * 接頭辞は URL を組み立てるためのもので、その担当は `locale.js`。責務を混ぜない。
 *
 * 出どころは `document.documentElement.lang` 1 つ。content script は document_idle で
 * 走るので、読む時点で確定している。表示言語の変更はフルリロードを伴うため、
 * エントリで 1 回決めれば SPA 遷移の途中で変わることはない。
 */

/** UI のカタログを持っている言語。並びは `src/i18n/` のファイルと対応する。 */
export const SUPPORTED_LANGUAGES = Object.freeze(['ja', 'en']);

/**
 * 判定そのものに失敗したときの言語。
 * この拡張の利用者はほとんどが日本語なので、異常系で突然英語を出さない。
 */
export const DEFAULT_LANGUAGE = 'ja';

/**
 * pixiv が未対応の言語 (ko / zh / th 等) を返したときの言語。
 * その人は pixiv を日本語以外で読んでいるので、日本語より英語のほうが通じる。
 */
export const UNSUPPORTED_FALLBACK = 'en';

/** BCP 47 の言語サブタグ。先頭の区切りまでを見る。 */
const SUBTAG_PATTERN = /^[a-z]{2,3}/;

/**
 * BCP 47 のタグを言語サブタグだけに切り詰める。
 * @param {unknown} tag 'en-US' / 'ja' / 'zh-Hant-TW' など
 * @returns {string|null} 小文字の言語サブタグ。読めなければ null
 */
export function normalizeLanguage(tag) {
	if (typeof tag !== 'string') return null;
	return SUBTAG_PATTERN.exec(tag.trim().toLowerCase())?.[0] ?? null;
}

/**
 * ページの表示言語をそのまま読む。
 * UI の言語を決めるのにも、pixiv API へ渡す値を決めるのにも使う。
 * @param {Document|{documentElement?: {lang?: string}}|null|undefined} doc 判定するドキュメント
 * @returns {string|null} 'en' / 'ko' など。読めなければ null
 */
export function readPageLanguage(doc) {
	return normalizeLanguage(doc?.documentElement?.lang);
}

/**
 * UI に使う言語を決める。
 * 「未対応の言語」と「判定できなかった」を分けるのがこの関数の要点。
 * @param {string|null|undefined} pageLanguage readPageLanguage の結果
 * @returns {string} SUPPORTED_LANGUAGES のどれか
 */
export function uiLanguage(pageLanguage) {
	if (!pageLanguage) return DEFAULT_LANGUAGE;
	return SUPPORTED_LANGUAGES.includes(pageLanguage) ? pageLanguage : UNSUPPORTED_FALLBACK;
}
