/**
 * pixiv API の応答を、この拡張が扱いやすい形へ揃える。
 * pixiv 側の歪み (広告枠の混入・ID の欠落・null の URL・欠けたカウンタ) をここで吸収し、
 * 上位の層が異常系を意識しなくて済むようにする。
 */

import { DEFAULT_X_RESTRICT } from '../common/constants.js';
import { safeCdnUrl } from './endpoints.js';

/** 作品の種別。SITE_SPEC の実測値。 */
export const ILLUST_TYPES = Object.freeze({
	ILLUST: 0,
	MANGA: 1,
	UGOIRA: 2,
});

/**
 * urls の各値を CDN のものだけに絞る。
 * 応答の値はそのまま img の src になる (= 外部オリジンへのリクエストになる) ので、
 * 表示に使う前にここで一度だけ関門を通す。弾いた項目は落とし、
 * 呼び出し側は「URL が無い作品」と同じ扱いにできる。
 * @param {object|null|undefined} urls raw.urls
 * @returns {object} CDN を指す値だけを残した urls
 */
function sanitizeUrls(urls) {
	const safe = {};
	for (const [key, value] of Object.entries(urls ?? {})) {
		const url = safeCdnUrl(value);
		if (url) safe[key] = url;
	}
	return safe;
}

/**
 * 数値カウンタとして読む。欠けている・数値でない値は 0 に倒す。
 * undefined のまま通すと、いいね押下の likeCount += 1 で画面に NaN が出る。
 * @param {unknown} value 応答の値
 * @returns {number} 数値。読めなければ 0
 */
function asCount(value) {
	return Number(value) || 0;
}

/**
 * tags.tags[] からタグ名だけを取り出す。null 要素や名前の無い要素は落とす。
 * @param {Array<{tag?: unknown}|null>|undefined} tags raw.tags.tags
 * @returns {string[]} タグ名
 */
function tagNames(tags) {
	return (tags ?? [])
		.map((tag) => tag?.tag)
		.filter((name) => typeof name === 'string');
}

/**
 * @typedef {object} WorkDetail 作品詳細
 * @property {string} id
 * @property {string} title
 * @property {number} illustType ILLUST_TYPES のいずれか
 * @property {number} pageCount
 * @property {number} xRestrict 0=全年齢 1=R-18 2=R-18G
 * @property {number} aiType 1=非AI 2=AI生成。未使用。SPEC §16 のとおり AI 生成の表示は未実装で、出せるように残してある
 * @property {string|null} thumbUrl
 * @property {string} userId
 * @property {string} userName
 * @property {string} createDate
 * @property {string} comment 投稿文 (HTML)
 * @property {string[]} tags
 * @property {number} likeCount
 * @property {number} bookmarkCount
 * @property {number} viewCount
 * @property {number} commentCount
 * @property {boolean} commentOff コメントが無効か
 * @property {boolean} likedByMe
 * @property {string|null} bookmarkId ブックマーク済みならその ID
 * @property {{mini?: string, thumb?: string, small?: string, regular?: string, original?: string}} urls
 */

/**
 * 作品を今のユーザーが見られるか。
 * 表示できるかどうかは error フラグでも urls でも判定できない。
 * 作品の xRestrict とユーザー設定の xRestrict を比べるのが唯一の正攻法 (SITE_SPEC §6)。
 * @param {{xRestrict: number}} work 対象の作品
 * @param {{xRestrict: number}|null} self ログイン中のユーザー設定。未ログインなら null
 * @returns {boolean} 見られるなら true
 */
export function canView(work, self) {
	const limit = self ? self.xRestrict : DEFAULT_X_RESTRICT;
	return work.xRestrict <= limit;
}

/**
 * 作品詳細を WorkDetail へ揃える。
 * 詳細 API は id と illustId のように同じ値を 2 つの名前で返すので、片方だけを使う。
 * 数値カウンタは欠けていれば 0、タグは null 要素を落として返す。
 * @param {object} raw /ajax/illust/{id} の body
 * @returns {WorkDetail} 正規化した詳細
 */
export function normalizeDetail(raw) {
	const urls = sanitizeUrls(raw.urls);
	return {
		id: raw.illustId,
		title: raw.illustTitle,
		illustType: raw.illustType,
		pageCount: raw.pageCount,
		xRestrict: raw.xRestrict,
		aiType: raw.aiType,
		thumbUrl: urls.thumb ?? null,
		userId: raw.userId,
		userName: raw.userName,
		createDate: raw.createDate,
		comment: raw.illustComment ?? '',
		tags: tagNames(raw.tags?.tags),
		likeCount: asCount(raw.likeCount),
		bookmarkCount: asCount(raw.bookmarkCount),
		viewCount: asCount(raw.viewCount),
		commentCount: asCount(raw.commentCount),
		commentOff: raw.commentOff === 1,
		likedByMe: raw.likeData === true,
		bookmarkId: raw.bookmarkData?.id ?? null,
		urls,
	};
}
