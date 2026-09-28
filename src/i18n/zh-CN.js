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
		LOADING: '加载中...',
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
		PREV_PAGE: '上一页',
		NEXT_PAGE: '下一页',
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
		countLabel: (label, formattedCount) => `${label}：${formattedCount}`,
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
		FAILED: '无法发表评论',
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
	theme: {
		TO_LIGHT: '切换到日间模式',
		TO_DARK: '切换到夜间模式',
	},
	licenses: {
		disclaimer: {
			brief: '这是一款非官方的 pixiv 扩展程序。详情请查看“许可证”标签页。',
			body: [
				'这是利用 pixiv 平台开发的非官方扩展程序，并非由 pixiv Inc. 制作或发布。本扩展程序与该公司没有任何关系，也未获得其合作、支持或推荐。',
				'因使用本扩展程序而产生的一切后果，均由用户自行承担。',
				'pixiv 及相关服务可能会在不事先通知的情况下修订、更改或停止提供功能及内容，届时本扩展程序可能无法正常运行。',
			],
		},
		notes: {
			'Material Symbols': '界面图标的图形数据',
			'Font Awesome Free': '分享菜单中的品牌标志。仅从 SVG 中提取图形使用（未改变形状）。各标志均为其各自权利人的商标',
		},
	},
	popup: {
		TABS_LABEL: '切换显示内容',
		SAVE_FAILED: '无法保存。请检查浏览器的设置同步。',
		RESET_FAILED: '无法重置。请检查浏览器的设置同步。',
		tabs: {
			settings: '设置',
			license: '许可证',
		},
		licenseHeadings: {
			disclaimer: '免责声明',
			project: '本扩展程序的许可证',
			thirdParty: '随附的第三方资源',
		},
		reset: {
			label: '重置设置',
			description: '将包括配色在内的所有设置恢复为默认值。',
			cancel: '取消',
			confirm: '重置',
		},
		headings: {
			viewer: '查看器',
			image: '图片',
			userPage: '用户页面',
			controls: '操作',
		},
		fields: {
			enabled: {
				label: '使用查看器',
				description: '关闭后将恢复 pixiv 的默认行为。',
			},
			showSidebar: {
				label: '显示侧边栏',
				description: '在图片旁显示作品说明、标签、点赞数和评论。',
			},
			sidebarScroll: {
				label: '侧边栏的滚动方式',
				description: '上下滚动侧边栏时的行为。',
				comments: {
					label: '仅滚动评论',
					description: '作品说明和标签保持固定，只滚动评论列表。',
				},
				whole: {
					label: '整个侧边栏一起滚动',
					description: '将作品说明到评论连成一体滚动。即使作品说明很长，也能一路读到评论。',
				},
			},
			imageQuality: {
				label: '图片分辨率',
				description: '查看器中加载的图片尺寸。',
				regular: {
					label: '标准（长边 1200px）',
					description: '加载更快，适合日常浏览。',
				},
				original: {
					label: '原图',
					description: '更清晰，但加载较慢。',
				},
			},
			prefetch: {
				label: '预加载',
				description: '提前加载接下来要看的图片，切换时会更快。',
				none: {
					label: '不预加载',
					description: '每次切换时才加载。可以节省流量。',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '前后各 1 张', description: '只提前加载相邻的 1 张。' }
					: {
						label: `前后各 ${count} 张`,
						description: `提前加载前后各 ${count} 张。连续浏览时更流畅。`,
					}),
			},
			clickZoom: {
				label: '点击查看原图',
				description: '点击图片后，以原始尺寸铺满整个屏幕打开（与 pixiv 的作品页面相同）。点击左右边缘或按 ← → 翻页，再次点击或按 Esc 返回。无论上方的分辨率设置如何，都会加载原图。',
			},
			hidePickup: {
				label: '隐藏精选栏',
				description: '隐藏个人资料主页中显示的“精选”，让作品列表一眼可见。',
			},
			infiniteScroll: {
				label: '无限滚动',
				description: '将插画和漫画列表的翻页改为向下连续加载。',
				off: {
					label: '不使用',
					description: '保留 pixiv 默认的分页（1 2 3 …）。',
				},
				onReach: {
					label: '滚动到底部时加载',
					description: '到达最底部后才加载下一页。流量较少，但需要稍等片刻。',
				},
				ahead: {
					label: '始终提前加载下一页',
					description: '在距离底部还有一屏时就加载好下一页，无需等待即可继续浏览。',
				},
			},
			closeOnBackdrop: {
				label: '点击背景关闭',
				description: '点击图片外侧即可关闭。如果容易误关，请关闭此项。',
			},
			gridTabSkip: {
				label: '网格中的 Tab 键导航',
				description: '按 Tab 移到下一个作品时的跳过方式。',
				both: {
					label: '跳过收藏和标题',
					description: '每张卡片会依次经过“缩略图 → 收藏 → 标题”这 3 个位置。跳过后按一次 Tab 即可移到下一个作品，被跳过的操作可以在查看器中完成。',
				},
				title: {
					label: '仅跳过标题',
					description: '收藏按钮仍可在网格中直接点击。',
				},
				none: {
					label: '不跳过',
					description: '保留 pixiv 默认的顺序。',
				},
			},
		},
	},
};
