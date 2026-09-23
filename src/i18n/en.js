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

export default {
	viewer: {
		DIALOG_LABEL: 'Artwork viewer',
		CLOSE: 'Close',
		CLOSE_TITLE: 'Close (Esc)',
		LOADING: 'Loading...',
		LOAD_FAILED: 'Could not load this artwork',
	},
	imagePane: {
		PREV_PAGE: 'Previous page',
		NEXT_PAGE: 'Next page',
		IMAGE_FAILED: 'Could not load this image',
		PAGES_FAILED: 'Could not load the remaining images',
	},
	zoom: {
		LABEL: 'Actual size',
		PREV_PAGE: 'Previous page',
		NEXT_PAGE: 'Next page',
	},
	sidebar: {
		OPEN_ORIGINAL: 'Open artwork page',
		LIKE: 'Likes',
		BOOKMARK: 'Bookmarks',
		VIEWS: 'Views',
		COMMENTS: 'Comments',
		/**
		 * 日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} 'Sep 23, 2026 13:05' の形
		 */
		formatDateTime(date) {
			const parts = Object.fromEntries(
				DATE_TIME_FORMAT.formatToParts(date).map(({ type, value }) => [type, value]),
			);
			return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute}`;
		},
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
			FOLLOWED: 'Following',
			UNFOLLOWED: 'Unfollowed',
			FOLLOW_FAILED: 'Could not change the follow state',
		},
		BOOKMARK_PRIVATE_HINT: '(Shift + click for private)',
		bookmarkLabel: (bookmarked) => (bookmarked ? 'Remove bookmark' : 'Add bookmark'),
		likeLabel: (liked) => (liked ? 'Liked' : 'Like (cannot be undone)'),
		followLabel: (following) => (following ? 'Following' : 'Follow'),
		// 英語には「件」にあたる助数詞が無いので、数字だけを添える
		countLabel: (label, formattedCount) => `${label} ${formattedCount}`,
	},
	comments: {
		HEADING: 'Comments',
		MORE: 'Show more',
		RETRY: 'Retry',
		DELETED_USER: 'Deleted user',
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
		DELETE_CONFIRM: 'Delete for real?',
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
		FAILED: 'Could not post your comment',
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
	theme: {
		TO_LIGHT: 'Switch to light mode',
		TO_DARK: 'Switch to dark mode',
	},
	licenses: {
		disclaimer: {
			brief: 'An unofficial extension for pixiv. See the Licenses tab for details.',
			body: [
				'This is an unofficial extension developed using the pixiv platform. It is not created or distributed by pixiv Inc. It is not affiliated with, endorsed by, sponsored by, or approved by pixiv Inc.',
				'You use this extension entirely at your own risk.',
				'pixiv and its related services may revise, change, or discontinue features and content without notice, and this extension may stop working when that happens.',
			],
		},
		notes: {
			'Material Symbols': 'Icon shapes used throughout the interface',
			'Font Awesome Free': 'Brand logos in the share menu. Each logo is a trademark of its respective owner',
		},
	},
	popup: {
		TABS_LABEL: 'Switch what is shown',
		SAVE_FAILED: 'Could not save. Check your browser’s settings sync.',
		RESET_FAILED: 'Could not reset. Check your browser’s settings sync.',
		tabs: {
			settings: 'Settings',
			license: 'Licenses',
		},
		licenseHeadings: {
			disclaimer: 'Disclaimer',
			project: 'License of this extension',
			thirdParty: 'Bundled third-party works',
		},
		reset: {
			label: 'Reset settings',
			description: 'Restores every setting, including the color theme, to its default.',
			cancel: 'Cancel',
			confirm: 'Reset',
		},
		headings: {
			viewer: 'Viewer',
			image: 'Images',
			userPage: 'User pages',
			controls: 'Controls',
		},
		fields: {
			enabled: {
				label: 'Use the viewer',
				description: 'Turn this off to return to pixiv’s standard behavior.',
			},
			showSidebar: {
				label: 'Show the sidebar',
				description: 'Shows the caption, tags, like count, and comments beside the image.',
			},
			sidebarScroll: {
				label: 'Sidebar scrolling',
				description: 'How the sidebar scrolls vertically.',
				comments: {
					label: 'Scroll comments only',
					description: 'Keeps the caption and tags in place and scrolls only the comment list.',
				},
				whole: {
					label: 'Scroll the whole sidebar',
					description: 'Scrolls the caption through to the comments as one column. Even with a long caption, you can read straight through to the comments.',
				},
			},
			imageQuality: {
				label: 'Image resolution',
				description: 'The size of the images the viewer loads.',
				regular: {
					label: 'Standard (1200px long edge)',
					description: 'Lighter to load and suits everyday browsing.',
				},
				original: {
					label: 'Original',
					description: 'Sharper, but heavier to load.',
				},
			},
			prefetch: {
				label: 'Prefetch',
				description: 'Loading upcoming images ahead of time makes switching faster.',
				none: {
					label: 'Off',
					description: 'Loads on every switch. Uses less data.',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '1 image each way', description: 'Loads only the adjacent image ahead.' }
					: {
						label: `${count} images each way`,
						description: `Loads ${count} images ahead. Smoother when browsing continuously.`,
					}),
			},
			clickZoom: {
				label: 'Click to view at actual size',
				description: 'Clicking the image opens it at actual size, filling the screen. (The same as a pixiv artwork page) Click the left or right edge or press the arrow keys to turn the page, and click again or press Esc to go back. This loads original-size images regardless of the resolution set above.',
			},
			hidePickup: {
				label: 'Hide the Pickup section',
				description: 'Hides the "Pickup" section on the profile home so the artwork grid is visible right away.',
			},
			infiniteScroll: {
				label: 'Infinite scroll',
				description: 'Replaces paging on the illustration and manga lists with continuous loading.',
				off: {
					label: 'Off',
					description: 'Keeps pixiv’s standard pager (1 2 3 …).',
				},
				onReach: {
					label: 'Load when you reach the bottom',
					description: 'Loads the next page once you reach the bottom. Uses less data, but you wait a moment.',
				},
				ahead: {
					label: 'Always keep one page ahead',
					description: 'Queues the next page one screen before the bottom, so you never wait.',
				},
			},
			closeOnBackdrop: {
				label: 'Click the background to close',
				description: 'Clicking outside the image closes the viewer. Turn this off if you close it by accident.',
			},
			gridTabSkip: {
				label: 'Tab movement in the grid',
				description: 'What Tab skips when moving to the next artwork.',
				both: {
					label: 'Skip bookmark and title',
					description: 'A card steps through thumbnail, bookmark, then title. Skipping them moves to the next artwork with a single Tab, and you can still do the skipped actions inside the viewer.',
				},
				title: {
					label: 'Skip the title only',
					description: 'The bookmark stays clickable in the grid.',
				},
				none: {
					label: 'Do not skip',
					description: 'Keeps pixiv’s standard order.',
				},
			},
		},
	},
};
