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
		LOADING: '載入中...',
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
		PREV_PAGE: '上一頁',
		NEXT_PAGE: '下一頁',
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
		FAILED: '無法發表評論',
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
	theme: {
		TO_LIGHT: '切換為淺色模式',
		TO_DARK: '切換為深色模式',
	},
	licenses: {
		disclaimer: {
			brief: '這是 pixiv 的非官方擴充功能。詳情請見「授權」分頁。',
			body: [
				'本擴充功能是利用 pixiv 平台開發的非官方擴充功能，並非由 pixiv Inc. 製作或發布。與該公司沒有任何關係，也未獲得其合作、支援或推薦。',
				'因使用本擴充功能而產生的一切後果，均由使用者自行承擔。',
				'pixiv 及相關服務可能在未經通知的情況下修訂、變更或停止提供功能及內容，屆時本擴充功能可能無法運作。',
			],
		},
		notes: {
			'Material Symbols': '畫面中圖示的圖形資料',
			'Font Awesome Free': '分享選單中的品牌標誌。僅從 SVG 中擷取圖形使用（未變更形狀）。各標誌均為其權利人的商標',
		},
	},
	popup: {
		TABS_LABEL: '切換顯示內容',
		SAVE_FAILED: '無法儲存。請確認瀏覽器的設定同步。',
		RESET_FAILED: '無法重設。請確認瀏覽器的設定同步。',
		tabs: {
			settings: '設定',
			license: '授權',
		},
		licenseHeadings: {
			disclaimer: '免責聲明',
			project: '本擴充功能的授權',
			thirdParty: '隨附的第三方素材',
		},
		reset: {
			label: '重設設定',
			description: '將包含配色在內的所有設定恢復為預設值。',
			cancel: '取消',
			confirm: '重設',
		},
		headings: {
			viewer: '檢視器',
			image: '圖片',
			userPage: '用戶頁面',
			controls: '操作',
		},
		fields: {
			enabled: {
				label: '使用檢視器',
				description: '關閉後會恢復為 pixiv 的標準行為。',
			},
			showSidebar: {
				label: '顯示側邊欄',
				description: '在圖片旁顯示作品說明、標籤、讚數及評論。',
			},
			sidebarScroll: {
				label: '側邊欄的捲動方式',
				description: '縱向捲動側邊欄時的行為。',
				comments: {
					label: '只捲動評論',
					description: '作品說明與標籤保持固定，只捲動評論列表。',
				},
				whole: {
					label: '整個側邊欄一起捲動',
					description: '從作品說明到評論連成一體捲動。即使作品說明很長，也能直接往下讀到評論。',
				},
			},
			imageQuality: {
				label: '圖片解析度',
				description: '檢視器載入的圖片尺寸。',
				regular: {
					label: '標準（長邊 1200px）',
					description: '載入較輕快，適合平常瀏覽。',
				},
				original: {
					label: '原尺寸',
					description: '畫質清晰，但載入較慢。',
				},
			},
			prefetch: {
				label: '預先載入',
				description: '預先載入接下來要看的圖片，切換時會更快。',
				none: {
					label: '不預先載入',
					description: '每次切換時才載入。可以節省流量。',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '前後 1 張', description: '只預先載入相鄰的 1 張。' }
					: {
						label: `前後 ${count} 張`,
						description: `預先載入到往後第 ${count} 張為止。連續瀏覽時更流暢。`,
					}),
			},
			prefetchNeighbor: {
				label: '預先載入前後作品',
				description: '顯示完成後，會預先載入 1 件透過 ↑ ↓ 可能前往的作品。切換更快，但即使未切換就關閉，也會增加流量消耗。',
			},
			clickZoom: {
				label: '點擊以原尺寸顯示',
				description: '點擊圖片後，會以原尺寸填滿整個畫面開啟（與 pixiv 的作品頁面相同）。點擊左右兩端或按 ← → 翻頁，再點擊一次或按 Esc 返回。無論上方的解析度設定為何，都會載入原尺寸圖片。',
			},
			hidePickup: {
				label: '隱藏精選欄',
				description: '隱藏個人資料首頁上的「精選」。作品列表會立刻映入眼簾。',
			},
			infiniteScroll: {
				label: '無限捲動',
				description: '將插畫、漫畫列表的換頁，改為往下持續載入的形式。',
				off: {
					label: '不使用',
					description: '維持 pixiv 標準的分頁（1 2 3 …）。',
				},
				onReach: {
					label: '捲到底部時載入',
					description: '捲到最底部後才載入下一頁。流量較少，但需要稍等一下。',
				},
				ahead: {
					label: '隨時預先載入下一頁',
					description: '在距離底部還有一個畫面的高度時就排好下一頁。不必等待就能繼續瀏覽。',
				},
			},
			closeOnBackdrop: {
				label: '點擊背景關閉',
				description: '點擊圖片外側即可關閉。容易誤觸而關閉的話，請關掉此選項。',
			},
			gridTabSkip: {
				label: '網格中的 Tab 移動',
				description: '按 Tab 移到下一個作品時的跳過方式。',
				both: {
					label: '跳過收藏與標題',
					description: '每張卡片會依序經過「縮圖 → 收藏 → 標題」3 個位置。跳過後按 1 次 Tab 即可移到下一個作品，跳過的操作可在檢視器中進行。',
				},
				title: {
					label: '只跳過標題',
					description: '收藏按鈕仍可在網格中直接點擊。',
				},
				none: {
					label: '不跳過',
					description: '維持 pixiv 標準的順序。',
				},
			},
		},
	},
};
