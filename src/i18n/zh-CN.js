/**
 * 簡体字中国語の文言カタログ。
 *
 * **ここは文言だけを持つ。** 構造・キー・URL・アイコン名は言語に依らないので元の場所に残す。
 * (SECTIONS の並び、THEME_TOGGLE の next/icon、THIRD_PARTY の name/url など)
 *
 * ja.js と形を必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 * 引数を取る文言は関数にする。語順も量詞も日本語と違うので、外からテンプレートを埋める形では破綻する。
 * 用語は pixiv 本体の簡体字 UI (赞 / 收藏 / 加关注 / 评论 など) に揃える。
 */
import { DISPLAY_TIME_ZONE } from '../common/constants.js';

/** 日時の書式。年月日は数値、時刻は 24 時間の 2 桁。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/** コメントの日時の書式。一覧は詰めて見せたいので、年月日も 2 桁の数値にする。 */
const COMMENT_DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/**
 * Intl の書式で日時を部品に分ける。
 * @param {Intl.DateTimeFormat} format 書式
 * @param {Date} date 日時
 * @returns {Record<string, string>} year / month / day / hour / minute などの部品
 */
function toParts(format, date) {
	return Object.fromEntries(format.formatToParts(date).map(({ type, value }) => [type, value]));
}

export default {
	viewer: {
		DIALOG_LABEL: '作品查看器',
		CLOSE: '关闭',
		CLOSE_TITLE: '关闭（Esc）',
		WORK_PAGE: '前往作品页面',
		WORK_PAGE_TITLE: '在新标签页中打开作品页面',
		SIDEBAR_OPEN: '打开侧边栏',
		SIDEBAR_CLOSE: '关闭侧边栏',
		LOADING: '加载中…',
		LOAD_FAILED: '无法加载作品',
		NOT_FOUND: '找不到该作品。可能已被删除或设为非公开',
		NETWORK_FAILED: '通信失败。请检查网络连接后重新打开',
	},
	imagePane: {
		PREV_PAGE: '上一页',
		NEXT_PAGE: '下一页',
		IMAGE_FAILED: '无法加载图片',
		PAGES_FAILED: '无法加载第 2 张及之后的图片',
	},
	zoom: {
		LABEL: '查看原图',
		PREVIEW_NOTICE: '正在以标准画质临时显示，原图加载中…',
	},
	sidebar: {
		OPEN_ORIGINAL: '打开作品页面',
		LIKE: '赞',
		BOOKMARK: '收藏',
		VIEWS: '浏览量',
		COMMENTS: '评论',
		/**
		 * 日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} '2026年9月23日 13:05' の形
		 */
		formatDateTime(date) {
			const parts = toParts(DATE_TIME_FORMAT, date);
			return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
		},
	},
	actionsBar: {
		messages: {
			LOGIN_TO_ACT: '登录后即可点赞和收藏',
			SESSION_EXPIRED: '登录已失效。请重新登录 pixiv，然后刷新此页面',
			LIKED: '已点赞',
			ALREADY_LIKED: '已经点过赞了',
			LIKE_FAILED: '无法点赞',
			BOOKMARKED: '已收藏',
			BOOKMARKED_PRIVATE: '已添加为非公开收藏',
			UNBOOKMARKED: '已取消收藏',
			BOOKMARK_FAILED: '无法更改收藏',
			FOLLOWED: '已关注',
			UNFOLLOWED: '已取消关注',
			FOLLOW_FAILED: '无法更改关注',
		},
		BOOKMARK_PRIVATE_HINT: '（Shift + 点击为非公开）',
		/**
		 * ブックマークのボタンの読み上げ名。
		 * @param {boolean} bookmarked 入っていれば true
		 * @returns {string} 押すと何が起きるか
		 */
		bookmarkLabel: (bookmarked) => (bookmarked ? '取消收藏' : '添加收藏'),
		/**
		 * いいねのボタンの読み上げ名。
		 * @param {boolean} liked 済みなら true
		 * @returns {string} 状態か、押すと何が起きるか
		 */
		likeLabel: (liked) => (liked ? '已点赞' : '点赞（无法取消）'),
		/**
		 * フォローのボタンの読み上げ名。
		 * @param {boolean} following フォロー中なら true
		 * @returns {string} 状態
		 */
		followLabel: (following) => (following ? '已关注' : '加关注'),
		/**
		 * カウンタの読み上げ名。
		 * @param {string} label 何の数か
		 * @param {string} formattedCount 桁区切り済みの件数
		 * @returns {string} 読み上げ名
		 */
		countLabel: (label, formattedCount) => `${label} ${formattedCount}`,
	},
	comments: {
		HEADING: '评论',
		MORE: '浏览更多',
		RETRY: '重试',
		DELETED_USER: '已注销的用户',
		/**
		 * コメントの日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} '2026-09-23 13:05' の形
		 */
		formatDateTime(date) {
			const parts = toParts(COMMENT_DATE_TIME_FORMAT, date);
			return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
		},
		STAMP_PLACEHOLDER: '[贴图]',
		STAMP_ALT: '贴图',
		REPLIES_SHOW: '查看回复',
		REPLIES_HIDE: '收起回复',
		REPLY_MORE: '查看更多回复',
		REPLY_FAILED: '无法加载回复',
		LOAD_FAILED: '无法加载评论',
		COMMENT_OFF: '此作品不接受评论',
		EMPTY: '暂无评论',
		TO_TOP: '回到顶部',
		COMMENT_PLACEHOLDER: '发表评论',
		REPLY_PLACEHOLDER: '发表回复',
		REPLY: '回复',
		SIGN_IN: '登录后即可发表评论',
		POST_FAILED: '无法发表评论',
		SESSION_EXPIRED: '登录已失效。请重新登录 pixiv，然后刷新此页面',
		DELETE: '删除',
		DELETE_CONFIRM: '确定要删除吗？',
		DELETE_FAILED: '无法删除评论',
		roles: {
			SELF: '我',
			AUTHOR: '作者',
		},
	},
	commentForm: {
		SUBMIT: '发送',
		PICK: '表情和贴图',
		STAMP_ALT: '贴图',
		STAMP_CLEAR: '取消所选的贴图',
	},
	commentPicker: {
		EMOJI: '表情',
		STAMP: '贴图',
		PANEL: '表情和贴图',
	},
	shareMenu: {
		SHARE: '分享此作品',
		COPY_FAILED: '无法复制',
		COPY_DONE: '已复制链接',
	},
	share: {
		COPY_LINK: '复制链接',
	},
	ugoira: {
		PAUSE: '暂停',
		PLAY: '播放',
		PLAY_FAILED: '无法播放动图',
		CONTROLS: '播放控制',
		SEEK: '播放位置',
		RATE: '播放速度',
		NORMAL: '标准',
		/**
		 * 再生速度の倍率の見出し。
		 * @param {number} value 倍率
		 * @returns {string} 見出し
		 */
		rate: (value) => `${value}×`,
		/**
		 * シークバーの読み上げ。今が何コマ目か。
		 * @param {number} current 今のコマ (1 始まり)
		 * @param {number} total 全体のコマ数
		 * @returns {string} 読み上げの文言
		 */
		frame: (current, total) => `第 ${current} 帧，共 ${total} 帧`,
	},
	slideshow: {
		CONTROLS: '自动翻页',
		PLAY: '开始自动翻页',
		PAUSE: '停止自动翻页',
		PREV: '上一个',
		NEXT: '下一个',
		LOOP: '循环',
		INTERVAL: '翻页间隔',
		CUSTOM: '自定义',
		CUSTOM_RANGE: '间隔（秒）',
		/**
		 * 秒数の見出し。小数はそのまま出す。(2.5 秒)
		 * @param {number} value 秒数
		 * @returns {string} 見出し
		 */
		seconds: (value) => `${value} 秒`,
	},
	blocked: {
		LOGIN_REQUIRED: '请登录 pixiv 后查看此作品',
		HIDDEN_BY_SETTING: '根据 pixiv 的显示设置，此作品已被隐藏',
		RELOAD_AFTER_CHANGE: '更改后请刷新页面',
		CHANGE_SETTING: '更改显示设置',
	},
	infinite: {
		LOADING: '正在加载作品',
		ERROR: '无法加载作品',
		BUILD_FAILED: '无法显示作品',
		RETRY: '重试',
		DONE: '已显示全部作品',
	},
};
