/**
 * 繁体字中国語 (台湾) の文言カタログ。
 *
 * **ここは文言だけを持つ。** 構造・キー・URL・アイコン名は言語に依らないので元の場所に残す。
 * 語は pixiv 本体の繁体字 UI に揃える。(いいね -> 讚、ブックマーク -> 收藏、フォロー -> 追蹤)
 *
 * ja.js と形を必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 * 引数を取る文言は関数にする。語順が言語ごとに違うので、外からテンプレートを埋める形では破綻する。
 */
import { DISPLAY_TIME_ZONE } from '../common/constants.js';

/** 日時の書式。年月日は数値、時刻は 24 時間の 2 桁。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/** コメントの日時の書式。一覧は詰めて見せたいので、年月日も 2 桁の数値にする。 */
const COMMENT_DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
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
		DIALOG_LABEL: '作品檢視器',
		CLOSE: '關閉',
		CLOSE_TITLE: '關閉（Esc）',
		WORK_PAGE: '前往作品頁面',
		WORK_PAGE_TITLE: '在新分頁中開啟作品頁面',
		SIDEBAR_OPEN: '開啟側邊欄',
		SIDEBAR_CLOSE: '關閉側邊欄',
		LOADING: '載入中…',
		LOAD_FAILED: '無法載入作品',
		NOT_FOUND: '找不到此作品。可能已被刪除或設為不公開',
		NETWORK_FAILED: '通訊失敗。請確認網路連線後重新開啟',
	},
	imagePane: {
		PREV_PAGE: '上一頁',
		NEXT_PAGE: '下一頁',
		IMAGE_FAILED: '無法載入圖片',
		PAGES_FAILED: '無法載入第 2 張以後的圖片',
	},
	zoom: {
		LABEL: '原尺寸顯示',
		PREVIEW_NOTICE: '正在以標準畫質暫時顯示，原始尺寸載入中…',
	},
	sidebar: {
		OPEN_ORIGINAL: '開啟作品頁面',
		LIKE: '讚',
		BOOKMARK: '收藏',
		VIEWS: '瀏覽量',
		COMMENTS: '評論',
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
			LOGIN_TO_ACT: '登入後即可按讚及收藏',
			SESSION_EXPIRED: '登入狀態已失效。請重新登入 pixiv，並重新整理此頁面',
			LIKED: '已按讚',
			ALREADY_LIKED: '先前已經按過讚了',
			LIKE_FAILED: '無法按讚',
			BOOKMARKED: '已加入收藏',
			BOOKMARKED_PRIVATE: '已以不公開方式加入收藏',
			UNBOOKMARKED: '已取消收藏',
			BOOKMARK_FAILED: '無法變更收藏',
			FOLLOWED: '已追蹤',
			UNFOLLOWED: '已取消追蹤',
			FOLLOW_FAILED: '無法變更追蹤狀態',
		},
		BOOKMARK_PRIVATE_HINT: '（Shift + 點擊即為不公開）',
		/**
		 * ブックマークのボタンの読み上げ名。
		 * @param {boolean} bookmarked 入っていれば true
		 * @returns {string} 押すと何が起きるか
		 */
		bookmarkLabel: (bookmarked) => (bookmarked ? '從收藏中移除' : '加入收藏'),
		/**
		 * いいねのボタンの読み上げ名。
		 * @param {boolean} liked 済みなら true
		 * @returns {string} 状態か、押すと何が起きるか
		 */
		likeLabel: (liked) => (liked ? '已按讚' : '按讚（無法取消）'),
		/**
		 * フォローのボタンの読み上げ名。
		 * @param {boolean} following フォロー中なら true
		 * @returns {string} 状態
		 */
		followLabel: (following) => (following ? '追蹤中' : '追蹤'),
		/**
		 * カウンタの読み上げ名。
		 * @param {string} label 何の数か
		 * @param {string} formattedCount 桁区切り済みの件数
		 * @returns {string} 読み上げ名
		 */
		countLabel: (label, formattedCount) => `${label} ${formattedCount}`,
	},
	comments: {
		HEADING: '評論',
		MORE: '瀏覽更多',
		RETRY: '重試',
		DELETED_USER: '已刪除帳號的用戶',
		/**
		 * コメントの日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} '2026/09/23 13:05' の形
		 */
		formatDateTime(date) {
			const parts = toParts(COMMENT_DATE_TIME_FORMAT, date);
			return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
		},
		STAMP_PLACEHOLDER: '[貼圖]',
		STAMP_ALT: '貼圖',
		REPLIES_SHOW: '顯示回覆',
		REPLIES_HIDE: '隱藏回覆',
		REPLY_MORE: '查看更多回覆',
		REPLY_FAILED: '無法載入回覆',
		LOAD_FAILED: '無法載入評論',
		COMMENT_OFF: '此作品不開放評論',
		EMPTY: '目前還沒有評論',
		TO_TOP: '回到頂端',
		COMMENT_PLACEHOLDER: '發表評論',
		REPLY_PLACEHOLDER: '回覆',
		REPLY: '回覆',
		SIGN_IN: '登入後即可發表評論',
		POST_FAILED: '無法發表評論',
		SESSION_EXPIRED: '登入狀態已失效。請重新登入 pixiv，並重新整理此頁面',
		DELETE: '刪除',
		DELETE_CONFIRM: '確定要刪除？',
		DELETE_FAILED: '無法刪除評論',
		roles: {
			SELF: '你',
			AUTHOR: '作者',
		},
	},
	commentForm: {
		SUBMIT: '發送',
		PICK: '表情符號與貼圖',
		STAMP_ALT: '貼圖',
		STAMP_CLEAR: '取消選擇的貼圖',
	},
	commentPicker: {
		EMOJI: '表情符號',
		STAMP: '貼圖',
		PANEL: '表情符號與貼圖',
	},
	shareMenu: {
		SHARE: '分享此作品',
		COPY_FAILED: '無法複製',
		COPY_DONE: '已複製連結',
	},
	share: {
		COPY_LINK: '複製連結',
	},
	ugoira: {
		PAUSE: '暫停',
		PLAY: '播放',
		PLAY_FAILED: '無法播放動圖',
		CONTROLS: '播放控制',
		SEEK: '播放位置',
		RATE: '播放速度',
		NORMAL: '標準',
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
		frame: (current, total) => `第 ${current} 幀，共 ${total} 幀`,
	},
	slideshow: {
		CONTROLS: '自動翻頁',
		PLAY: '開始自動翻頁',
		PAUSE: '停止自動翻頁',
		PREV: '上一個',
		NEXT: '下一個',
		LOOP: '循環',
		INTERVAL: '翻頁間隔',
		CUSTOM: '自訂',
		CUSTOM_RANGE: '間隔（秒）',
		/**
		 * 秒数の見出し。小数はそのまま出す。(2.5 秒)
		 * @param {number} value 秒数
		 * @returns {string} 見出し
		 */
		seconds: (value) => `${value} 秒`,
	},
	blocked: {
		LOGIN_REQUIRED: '請登入 pixiv 以觀看此作品',
		HIDDEN_BY_SETTING: '依照 pixiv 的顯示設定，此作品已隱藏',
		RELOAD_AFTER_CHANGE: '變更後請重新整理頁面',
		CHANGE_SETTING: '變更顯示設定',
	},
	infinite: {
		LOADING: '正在載入作品',
		ERROR: '無法載入作品',
		BUILD_FAILED: '無法顯示作品',
		RETRY: '重試',
		DONE: '已顯示所有作品',
	},
};
