/**
 * 表示言語の判定。
 *
 * **URL の接頭辞 (`/en`) を言語判定に使ってはいけない。** 接頭辞が付くのは `/en` だけで、
 * 他の言語は接頭辞なしのパスのまま表示される。つまり「接頭辞が無い = 日本語」は偽である。
 * 接頭辞は URL を組み立てるためのもので、その担当は `locale.js`。責務を混ぜない。
 *
 * 出どころは `document.documentElement.lang` 1 つ。content script は document_idle で
 * 走るので、読む時点で確定している。表示言語の変更はフルリロードを伴うため、
 * エントリで 1 回決めれば SPA 遷移の途中で変わることはない。
 */

/**
 * UI のカタログを持っている言語。並びは `src/i18n/` のファイルと対応する。
 * 中国語だけは字体で 2 つに分かれるので、pixiv が documentElement.lang に出す形 (zh-CN / zh-TW) で持つ。
 */
export const SUPPORTED_LANGUAGES = Object.freeze(['ja', 'en', 'ko', 'zh-CN', 'zh-TW']);

/**
 * 判定そのものに失敗したときの言語。
 * この拡張の利用者はほとんどが日本語なので、異常系で突然英語を出さない。
 */
export const DEFAULT_LANGUAGE = 'ja';

/**
 * pixiv が未対応の言語 (th / ms 等) を返したときの言語。
 * その人は pixiv を日本語以外で読んでいるので、日本語より英語のほうが通じる。
 */
export const UNSUPPORTED_FALLBACK = 'en';

/** BCP 47 の言語サブタグ。先頭の区切りまでを見る。 */
const SUBTAG_PATTERN = /^[a-z]{2,3}/;

/** 中国語の言語サブタグ。これだけは字体まで読んで 2 つに分ける。 */
const CHINESE_SUBTAG = 'zh';

/** 簡体字と繁体字を表す言語コード。SUPPORTED_LANGUAGES と同じ綴り。 */
const SIMPLIFIED_CHINESE = 'zh-CN';
const TRADITIONAL_CHINESE = 'zh-TW';

/** 簡体字を明示する字体のサブタグ。地域より優先する。(zh-Hans-HK は簡体字) */
const SIMPLIFIED_SCRIPT_PATTERN = /[-_]hans(?:[-_]|$)/;

/** 繁体字を表す字体または地域のサブタグ。台湾・香港・マカオは繁体字を使う。 */
const TRADITIONAL_SUBTAG_PATTERN = /[-_](?:hant|tw|hk|mo)(?:[-_]|$)/;

/**
 * 中国語のタグを簡体字か繁体字に振り分ける。字体も地域も無ければ簡体字として扱う。
 * @param {string} lowerTag 小文字にした BCP 47 のタグ ('zh-hant-tw' など)
 * @returns {string} 'zh-CN' または 'zh-TW'
 */
function chineseVariant(lowerTag) {
	if (SIMPLIFIED_SCRIPT_PATTERN.test(lowerTag)) return SIMPLIFIED_CHINESE;
	return TRADITIONAL_SUBTAG_PATTERN.test(lowerTag) ? TRADITIONAL_CHINESE : SIMPLIFIED_CHINESE;
}

/**
 * BCP 47 のタグを言語コードへ正規化する。
 * 基本は言語サブタグだけに切り詰めるが、中国語だけは 'zh-CN' / 'zh-TW' のどちらかにする。
 * @param {unknown} tag 'en-US' / 'ja' / 'zh-Hant-TW' など
 * @returns {string|null} 'en' / 'ko' / 'zh-TW' など。読めなければ null
 */
export function normalizeLanguage(tag) {
	if (typeof tag !== 'string') return null;
	const lowerTag = tag.trim().toLowerCase();
	const subtag = SUBTAG_PATTERN.exec(lowerTag)?.[0] ?? null;
	return subtag === CHINESE_SUBTAG ? chineseVariant(lowerTag) : subtag;
}

/**
 * ページの表示言語をそのまま読む。
 * UI の言語を決めるのにも、pixiv API へ渡す値を決めるのにも使う。
 * @param {Document|{documentElement?: {lang?: string}}|null|undefined} doc 判定するドキュメント
 * @returns {string|null} 'en' / 'ko' / 'zh-TW' など。読めなければ null
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
