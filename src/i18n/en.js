/**
 * 英語の文言カタログ。
 * 形は ja.js と必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 */
import { DISPLAY_TIME_ZONE } from '../common/constants.js';

/** 日時の書式。月名は短縮形、時刻は 24 時間の 2 桁。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/**
 * 日時を画面の表記にする。投稿日とコメントの日時で共用する。
 * @param {Date} date 表示する日時
 * @returns {string} 'Sep 23, 2026 13:05' の形
 */
function formatDateTime(date) {
	const parts = Object.fromEntries(
		DATE_TIME_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]),
	);
	return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute}`;
}

export default {
	viewer: {
		DIALOG_LABEL: 'Artwork viewer',
		CLOSE: 'Close',
		CLOSE_TITLE: 'Close (Esc)',
		WORK_PAGE: 'Artwork page',
		WORK_PAGE_TITLE: 'Open the artwork page in a new tab',
		SIDEBAR_OPEN: 'Open the sidebar',
		SIDEBAR_CLOSE: 'Close the sidebar',
		LOADING: 'Loading…',
		LOAD_FAILED: 'Could not load this artwork',
		NOT_FOUND: 'This artwork could not be found. It may have been deleted or made private',
		NETWORK_FAILED: 'Could not connect. Check your connection and open it again',
	},
	imagePane: {
		PREV_PAGE: 'Previous page',
		NEXT_PAGE: 'Next page',
		IMAGE_FAILED: 'Could not load this image',
		PAGES_FAILED: 'Could not load the remaining images',
	},
	zoom: {
		LABEL: 'Actual size',
		PREVIEW_NOTICE: 'Showing the standard-size image while the original loads…',
	},
	sidebar: {
		OPEN_ORIGINAL: 'Open artwork page',
		LIKE: 'Likes',
		BOOKMARK: 'Bookmarks',
		VIEWS: 'Views',
		COMMENTS: 'Comments',
		formatDateTime,
	},
	actionsBar: {
		messages: {
			LOGIN_TO_ACT: 'Log in to like and bookmark',
			SESSION_EXPIRED: 'Your session has expired. Log in to pixiv again and reload this page',
			LIKED: 'Liked',
			ALREADY_LIKED: 'Already liked',
			LIKE_FAILED: 'Could not like this artwork',
			BOOKMARKED: 'Bookmarked',
			BOOKMARKED_PRIVATE: 'Bookmarked privately',
			UNBOOKMARKED: 'Bookmark removed',
			BOOKMARK_FAILED: 'Could not change the bookmark',
			FOLLOWED: 'Followed',
			UNFOLLOWED: 'Unfollowed',
			FOLLOW_FAILED: 'Could not change the follow state',
		},
		BOOKMARK_PRIVATE_HINT: '(Shift + click for private)',
		/**
		 * ブックマークのボタンの読み上げ名。
		 * @param {boolean} bookmarked 入っていれば true
		 * @returns {string} 押すと何が起きるか
		 */
		bookmarkLabel: (bookmarked) => (bookmarked ? 'Remove bookmark' : 'Add bookmark'),
		/**
		 * いいねのボタンの読み上げ名。
		 * @param {boolean} liked 済みなら true
		 * @returns {string} 状態か、押すと何が起きるか
		 */
		likeLabel: (liked) => (liked ? 'Liked' : 'Like (cannot be undone)'),
		/**
		 * フォローのボタンの読み上げ名。
		 * @param {boolean} following フォロー中なら true
		 * @returns {string} 状態
		 */
		followLabel: (following) => (following ? 'Following' : 'Follow'),
		/**
		 * カウンタの読み上げ名。英語には「件」にあたる助数詞が無いので、数字だけを添える。
		 * @param {string} label 何の数か
		 * @param {string} formattedCount 桁区切り済みの件数
		 * @returns {string} 読み上げ名
		 */
		countLabel: (label, formattedCount) => `${label} ${formattedCount}`,
	},
	comments: {
		HEADING: 'Comments',
		MORE: 'Show more',
		RETRY: 'Retry',
		DELETED_USER: 'Deleted user',
		/** コメントの日時。英語は投稿日と同じ書式にする */
		formatDateTime,
		STAMP_PLACEHOLDER: '[Stamp]',
		STAMP_ALT: 'Stamp',
		REPLIES_SHOW: 'Show replies',
		REPLIES_HIDE: 'Hide replies',
		REPLY_MORE: 'Show more replies',
		REPLY_FAILED: 'Could not load replies',
		LOAD_FAILED: 'Could not load comments',
		COMMENT_OFF: 'Comments are turned off for this artwork',
		EMPTY: 'No comments yet',
		TO_TOP: 'Back to top',
		COMMENT_PLACEHOLDER: 'Add a comment',
		REPLY_PLACEHOLDER: 'Write a reply',
		REPLY: 'Reply',
		SIGN_IN: 'Log in to comment',
		POST_FAILED: 'Could not post your comment',
		SESSION_EXPIRED: 'Your session has expired. Log in to pixiv again and reload this page',
		DELETE: 'Delete',
		DELETE_CONFIRM: 'Really delete?',
		DELETE_FAILED: 'Could not delete the comment',
		roles: {
			SELF: 'You',
			AUTHOR: 'Artist',
		},
	},
	commentForm: {
		SUBMIT: 'Post',
		PICK: 'Emoji and stamps',
		STAMP_ALT: 'Stamp',
		STAMP_CLEAR: 'Remove the selected stamp',
	},
	commentPicker: {
		EMOJI: 'Emoji',
		STAMP: 'Stamps',
		PANEL: 'Emoji and stamps',
	},
	shareMenu: {
		SHARE: 'Share this artwork',
		COPY_FAILED: 'Could not copy',
		COPY_DONE: 'Link copied',
	},
	share: {
		COPY_LINK: 'Copy link',
	},
	ugoira: {
		PAUSE: 'Pause',
		PLAY: 'Play',
		PLAY_FAILED: 'Could not play this ugoira',
		CONTROLS: 'Playback controls',
		SEEK: 'Playback position',
		RATE: 'Playback speed',
		NORMAL: 'Normal',
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
		frame: (current, total) => `Frame ${current} of ${total}`,
	},
	slideshow: {
		CONTROLS: 'Auto-advance',
		PLAY: 'Start auto-advance',
		PAUSE: 'Stop auto-advance',
		PREV: 'Previous',
		NEXT: 'Next',
		LOOP: 'Loop',
		INTERVAL: 'Interval',
		CUSTOM: 'Custom',
		CUSTOM_RANGE: 'Interval (seconds)',
		/**
		 * 秒数の見出し。小数はそのまま出す。(2.5 秒)
		 * @param {number} value 秒数
		 * @returns {string} 見出し
		 */
		seconds: (value) => `${value} s`,
	},
	blocked: {
		LOGIN_REQUIRED: 'Log in to pixiv to view this artwork',
		HIDDEN_BY_SETTING: 'Hidden by your pixiv viewing settings',
		RELOAD_AFTER_CHANGE: 'Reload the page after changing them',
		CHANGE_SETTING: 'Change viewing settings',
	},
	infinite: {
		LOADING: 'Loading artworks',
		ERROR: 'Could not load artworks',
		BUILD_FAILED: 'Could not display artworks',
		RETRY: 'Retry',
		DONE: 'You have reached the end',
	},
};
