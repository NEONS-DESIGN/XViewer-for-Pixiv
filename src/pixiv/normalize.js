/**
 * pixiv API の応答を、この拡張が扱いやすい形へ揃える。
 * pixiv 側の歪み (広告枠の混入・ID の欠落・null の URL) をここで吸収し、
 * 上位の層が異常系を意識しなくて済むようにする。
 */

/** 作品の種別。SITE_SPEC の実測値。 */
export const ILLUST_TYPES = Object.freeze({
	ILLUST: 0,
	MANGA: 1,
	UGOIRA: 2,
});

/** 未ログインのときに使う表示上限。全年齢のみ。 */
const DEFAULT_X_RESTRICT = 0;

/**
 * @typedef {object} WorkDetail 作品詳細
 * @property {string} id
 * @property {string} title
 * @property {number} illustType ILLUST_TYPES のいずれか
 * @property {number} pageCount
 * @property {number} xRestrict 0=全年齢 1=R-18 2=R-18G
 * @property {number} aiType 1=非AI 2=AI生成
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
 * @param {object} raw /ajax/illust/{id} の body
 * @returns {WorkDetail} 正規化した詳細
 */
export function normalizeDetail(raw) {
	return {
		id: raw.illustId,
		title: raw.illustTitle,
		illustType: raw.illustType,
		pageCount: raw.pageCount,
		xRestrict: raw.xRestrict,
		aiType: raw.aiType,
		thumbUrl: raw.urls?.thumb ?? null,
		userId: raw.userId,
		userName: raw.userName,
		createDate: raw.createDate,
		comment: raw.illustComment ?? '',
		tags: (raw.tags?.tags ?? []).map((tag) => tag.tag),
		likeCount: raw.likeCount,
		bookmarkCount: raw.bookmarkCount,
		viewCount: raw.viewCount,
		commentCount: raw.commentCount,
		commentOff: raw.commentOff === 1,
		likedByMe: raw.likeData === true,
		bookmarkId: raw.bookmarkData?.id ?? null,
		urls: raw.urls ?? {},
	};
}
