/**
 * 日本語の文言カタログ。他の言語のカタログはこれと同じ形を持つ。
 *
 * **ここは文言だけを持つ。** 構造・キー・URL・アイコン名は言語に依らないので元の場所に残す。
 * (SECTIONS の並び、THEME_TOGGLE の next/icon、THIRD_PARTY の name/url など)
 * 引数を取る文言は関数にする。
 * 設定画面 (popup) だけが使う節は ja-popup.js に置く。
 */
import { DISPLAY_TIME_ZONE } from '../common/constants.js';

/** 日時の書式。年月日は数値、時刻は 24 時間の 2 桁。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/** コメントの日時の書式。一覧は詰めて見せたいので、年月日も 2 桁の数値にする。 */
const COMMENT_DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
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
		DIALOG_LABEL: '作品ビュワー',
		CLOSE: '閉じる',
		CLOSE_TITLE: '閉じる (Esc)',
		WORK_PAGE: '作品ページへ',
		WORK_PAGE_TITLE: '作品ページを新しいタブで開く',
		SIDEBAR_OPEN: 'サイドバーを開く',
		SIDEBAR_CLOSE: 'サイドバーを閉じる',
		LOADING: '読み込み中…',
		LOAD_FAILED: '作品を読み込めませんでした',
		NOT_FOUND: '作品が見つかりませんでした。削除されたか、非公開になった可能性があります',
		NETWORK_FAILED: '通信に失敗しました。接続を確かめてから開き直してください',
	},
	imagePane: {
		PREV_PAGE: '前のページ',
		NEXT_PAGE: '次のページ',
		IMAGE_FAILED: '画像を読み込めませんでした',
		PAGES_FAILED: '2 枚目以降を読み込めませんでした',
	},
	zoom: {
		LABEL: '原寸表示',
		PREVIEW_NOTICE: '標準画質で仮表示しています。原寸を読み込み中…',
	},
	sidebar: {
		OPEN_ORIGINAL: '作品ページを開く',
		LIKE: 'いいね',
		BOOKMARK: 'ブックマーク',
		VIEWS: '閲覧数',
		COMMENTS: 'コメント',
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
			LOGIN_TO_ACT: 'ログインするといいねやブックマークができます',
			SESSION_EXPIRED: 'ログインが切れています。pixiv にログインし直し、このページを再読み込みしてください',
			LIKED: 'いいねしました',
			ALREADY_LIKED: '既にいいね済みでした',
			LIKE_FAILED: 'いいねできませんでした',
			BOOKMARKED: 'ブックマークしました',
			BOOKMARKED_PRIVATE: '非公開でブックマークしました',
			UNBOOKMARKED: 'ブックマークを外しました',
			BOOKMARK_FAILED: 'ブックマークを変更できませんでした',
			FOLLOWED: 'フォローしました',
			UNFOLLOWED: 'フォローを解除しました',
			FOLLOW_FAILED: 'フォローを変更できませんでした',
		},
		BOOKMARK_PRIVATE_HINT: '(Shift + クリックで非公開)',
		/**
		 * ブックマークのボタンの読み上げ名。
		 * @param {boolean} bookmarked 入っていれば true
		 * @returns {string} 押すと何が起きるか
		 */
		bookmarkLabel: (bookmarked) => (bookmarked ? 'ブックマークから削除' : 'ブックマークに追加'),
		/**
		 * いいねのボタンの読み上げ名。
		 * @param {boolean} liked 済みなら true
		 * @returns {string} 状態か、押すと何が起きるか
		 */
		likeLabel: (liked) => (liked ? 'いいね済み' : 'いいね (取り消せません)'),
		/**
		 * フォローのボタンの読み上げ名。
		 * @param {boolean} following フォロー中なら true
		 * @returns {string} 状態
		 */
		followLabel: (following) => (following ? 'フォロー中' : 'フォロー'),
		/**
		 * カウンタの読み上げ名。
		 * @param {string} label 何の数か
		 * @param {string} formattedCount 桁区切り済みの件数
		 * @returns {string} 読み上げ名
		 */
		countLabel: (label, formattedCount) => `${label} ${formattedCount} 件`,
	},
	comments: {
		HEADING: 'コメント',
		MORE: 'もっと見る',
		RETRY: '再試行',
		DELETED_USER: '退会したユーザー',
		/**
		 * コメントの日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} '2026-09-23 13:05' の形
		 */
		formatDateTime(date) {
			const parts = toParts(COMMENT_DATE_TIME_FORMAT, date);
			return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
		},
		STAMP_PLACEHOLDER: '[スタンプ]',
		STAMP_ALT: 'スタンプ',
		REPLIES_SHOW: '返信を表示',
		REPLIES_HIDE: '返信を隠す',
		REPLY_MORE: '返信をもっと見る',
		REPLY_FAILED: '返信を読み込めませんでした',
		LOAD_FAILED: 'コメントを読み込めませんでした',
		COMMENT_OFF: 'この作品はコメントを受け付けていません',
		EMPTY: 'まだコメントはありません',
		TO_TOP: '上部へ',
		COMMENT_PLACEHOLDER: 'コメントする',
		REPLY_PLACEHOLDER: '返信する',
		REPLY: '返信',
		SIGN_IN: 'ログインするとコメントできます',
		POST_FAILED: 'コメントを投稿できませんでした',
		SESSION_EXPIRED: 'ログインが切れています。pixiv にログインし直し、このページを再読み込みしてください',
		DELETE: '削除',
		DELETE_CONFIRM: '本当に削除？',
		DELETE_FAILED: 'コメントを削除できませんでした',
		roles: {
			SELF: 'あなた',
			AUTHOR: '作者',
		},
	},
	commentForm: {
		SUBMIT: '送信',
		PICK: '絵文字とスタンプ',
		STAMP_ALT: 'スタンプ',
		STAMP_CLEAR: '選んだスタンプを取り消す',
	},
	commentPicker: {
		EMOJI: '絵文字',
		STAMP: 'スタンプ',
		PANEL: '絵文字とスタンプ',
	},
	shareMenu: {
		SHARE: 'この作品をシェア',
		COPY_FAILED: 'コピーできませんでした',
		COPY_DONE: 'リンクをコピーしました',
	},
	share: {
		COPY_LINK: 'リンクをコピー',
	},
	ugoira: {
		PAUSE: '一時停止',
		PLAY: '再生',
		PLAY_FAILED: 'うごイラを再生できませんでした',
		CONTROLS: '再生の操作',
		SEEK: '再生位置',
		RATE: '再生速度',
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
		frame: (current, total) => `${total} コマ中 ${current} コマ目`,
	},
	slideshow: {
		CONTROLS: '自動送り',
		PLAY: '自動送りを再生',
		PAUSE: '自動送りを停止',
		PREV: '前へ',
		NEXT: '次へ',
		LOOP: 'ループ',
		INTERVAL: '送る間隔',
		CUSTOM: 'カスタム',
		CUSTOM_RANGE: '間隔 (秒)',
		/**
		 * 秒数の見出し。小数はそのまま出す。(2.5 秒)
		 * @param {number} value 秒数
		 * @returns {string} 見出し
		 */
		seconds: (value) => `${value} 秒`,
	},
	blocked: {
		LOGIN_REQUIRED: 'この作品を見るには pixiv にログインしてください',
		HIDDEN_BY_SETTING: 'pixiv の表示設定により非表示になっています',
		RELOAD_AFTER_CHANGE: '変更後はページを再読み込みしてください',
		CHANGE_SETTING: '表示設定を変更する',
	},
	infinite: {
		LOADING: '作品を読み込んでいます',
		ERROR: '作品を読み込めませんでした',
		BUILD_FAILED: '作品を表示できませんでした',
		RETRY: '再試行',
		DONE: 'すべての作品を表示しました',
	},
};
