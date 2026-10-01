/**
 * 日本語の文言カタログ。
 *
 * **ここは文言だけを持つ。** 構造・キー・URL・アイコン名は言語に依らないので元の場所に残す。
 * (SECTIONS の並び、THEME_TOGGLE の next/icon、THIRD_PARTY の name/url など)
 * 両方をここへ写すと、en.js にも同じ構造が写経され、片方だけ直す事故が起きる。
 *
 * en.js と形を必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 * 引数を取る文言は関数にする。英語は語順も複数形も違うので、外からテンプレートを埋める形では破綻する。
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
		LOADING: '読み込み中...',
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
		PREV_PAGE: '前のページ',
		NEXT_PAGE: '次のページ',
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
		FAILED: 'コメントを投稿できませんでした',
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
	theme: {
		TO_LIGHT: 'ライトモードに切り替える',
		TO_DARK: 'ダークモードに切り替える',
	},
	licenses: {
		disclaimer: {
			brief: 'pixiv 非公式の拡張機能です。詳しくは「ライセンス」タブへ。',
			body: [
				'pixiv プラットフォームを利用して開発した非公式の拡張機能です。ピクシブ株式会社が作成・配布するものではありません。同社とは一切関係がなく、提携・支援・推奨を受けたものでもありません。',
				'利用によって生じた一切の結果については、利用者自身が責任を負うものとします。',
				'pixiv および関連サービスは予告なく機能や掲載内容の改訂・変更・提供停止を行う場合があり、そのときこの拡張が動かなくなることがあります。',
			],
		},
		notes: {
			'Material Symbols': '画面のアイコンの図形データ',
			'Font Awesome Free': 'シェアメニューのブランドロゴ。SVG から図形だけを抜き出して使っています。(形は変えていません) 各ロゴはそれぞれの権利者の商標です',
		},
	},
	popup: {
		TABS_LABEL: '表示するものの切り替え',
		/**
		 * 既定の選択肢の見出しに印を付ける。
		 * @param {string} label 選択肢の見出し
		 * @returns {string} 印を付けた見出し
		 */
		withDefault: (label) => `${label} (既定)`,
		SAVE_FAILED: '保存できませんでした。ブラウザの設定同期を確認してください。',
		RESET_FAILED: '初期化できませんでした。ブラウザの設定同期を確認してください。',
		tabs: {
			settings: '設定',
			advanced: '詳細設定',
			license: 'ライセンス',
		},
		licenseHeadings: {
			disclaimer: '免責事項',
			project: 'この拡張機能のライセンス',
			thirdParty: '同梱している第三者の成果物',
		},
		reset: {
			label: '設定を初期化',
			description: '配色を含むすべての設定を既定に戻します。',
			cancel: 'やめる',
			confirm: '初期化する',
		},
		headings: {
			viewer: 'ビュワー',
			image: '画像',
			userPage: 'ユーザーページ',
			controls: '操作',
			comments: 'コメント',
		},
		fields: {
			enabled: {
				label: 'ビュワーを使う',
				description: 'オフにすると pixiv 標準の動作に戻ります。',
			},
			showSidebar: {
				label: 'サイドバーを表示する',
				description: '投稿文・タグ・いいね数・コメントを画像の横に出します。オフにすると、作品ページへのリンクを閉じるボタンの横に出します。',
			},
			sidebarScroll: {
				label: 'サイドバーのスクロール',
				description: 'サイドバーを縦に送るときの動き方です。',
				comments: {
					label: 'コメントだけを送る',
					description: '投稿文とタグは固定したまま、コメント一覧だけを送ります。',
				},
				whole: {
					label: 'サイドバーごと送る',
					description: '投稿文からコメントまでを 1 つにつなげて送ります。主文が長い作品でも、そのまま読み進めてコメントまで辿り着けます。',
				},
			},
			imageQuality: {
				label: '画像の解像度',
				description: 'ビュワーで読み込む画像の大きさです。',
				regular: {
					label: '標準 (長辺 1200px)',
					description: '読み込みが軽く、普段の閲覧に向きます。',
				},
				original: {
					label: '原寸',
					description: '鮮明ですが、読み込みが重くなります。',
				},
			},
			prefetch: {
				label: '先読み',
				description: '次に見る画像を先に読み込んでおくと、切り替えが速くなります。',
				/**
				 * 先読みの「カスタム」の選択肢。枚数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の枚数
				 * @param {number} max 選べる最大の枚数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: 'カスタム', description: `前後に読む枚数を ${min}〜${max} 枚から選びます。` }),
				none: {
					label: 'しない',
					description: '切り替えるたびに読み込みます。通信量を抑えられます。',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '前後 1 枚', description: '隣の 1 枚だけ先に読み込みます。' }
					: {
						label: `前後 ${count} 枚`,
						description: `${count} 枚先まで読み込みます。続けて見るときに滑らかです。`,
					}),
			},
			prefetchCustom: {
				label: '先読みする枚数',
			},
			sidebarWidth: {
				label: 'サイドバーの幅',
				description: '画面が広いときに右に出るサイドバーの幅です。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}px`,
			},
			sidebarDrawerMax: {
				label: '引き出したサイドバーの幅',
				description: '画面が狭いとき (幅 900px 以下) に引き出したサイドバーの、画面の幅に対する上限です。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			backdropOpacity: {
				label: '背景の濃さ',
				description: '画像の後ろに敷く黒い幕の濃さです。下げると後ろのページが透けて見えます。',
				theme: {
					label: 'テーマに合わせる',
					description: 'ダークでは 92%、ライトでは 88% にします。',
				},
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			navZoneSize: {
				label: '画面端のクリック領域の大きさ',
				description: '画面端のクリックで送るときの、端の幅 (左右) と高さ (上下) です。画像を出す部分に対する割合です。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			zoomZoneSize: {
				label: '原寸表示のクリック領域の幅',
				description: '原寸表示の画面で、左右の端を押してページを送る範囲の幅です。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			commentPageSize: {
				label: '一度に読むコメントの数',
				description: '開いたときと「もっと見る」を押したときに読み込む件数です。次に開いた作品から変わります。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value} 件`,
			},
			prefetchNeighbor: {
				label: '前後の作品も先読み',
				description: '↑ ↓ で作品を送る先を、表示し終えてから 1 件だけ読み込んでおきます。送るのが速くなりますが、送らずに閉じた分の通信が増えます。',
			},
			clickZoom: {
				label: 'クリックで原寸表示',
				description: '画像を押すと、原寸のまま画面いっぱいに開きます。(pixiv の作品ページと同じ) 左右の端を押すか ← → でページを送り、もう一度押すか Esc で戻ります。上の解像度の指定にかかわらず原寸の画像を読み込みます。',
			},
			hidePickup: {
				label: 'ピックアップ欄を隠す',
				description: 'プロフィールのホームに出る「ピックアップ」を隠します。作品一覧がすぐ目に入ります。',
			},
			infiniteScroll: {
				label: '無限スクロール',
				description: 'イラスト・マンガ一覧のページ送りを、下に続けて読み込む形にします。',
				off: {
					label: '使わない',
					description: 'pixiv 標準のページャ (1 2 3 …) のままにします。',
				},
				onReach: {
					label: '下まで来たら読み込む',
					description: '一番下に着いてから次のページを読みます。通信は少なめですが、そのぶん少し待ちます。',
				},
				ahead: {
					label: '常に 1 ページ先を読んでおく',
					description: '下に着く 1 画面ぶん手前で次のページを並べます。待たずに読み進められます。',
				},
			},
			closeOnBackdrop: {
				label: '背景クリックで閉じる',
				description: '画像の外側を押すと閉じます。誤って閉じるならオフに。',
			},
			navZones: {
				label: '画面端のクリックで送る',
				description: '画面の端を押してページや作品を送ります。端ではカーソルが矢印に変わります。',
				off: {
					label: '使わない',
					description: '矢印ボタンとキー操作だけで送ります。',
				},
				horizontal: {
					label: '左右でページ送り',
					description: '左右の端を押すと前後のページへ送ります。画像の上でも効きます。',
				},
				vertical: {
					label: '上下で作品送り',
					description: '上下の端を押すと前後の作品へ移ります。ページは矢印ボタンで送ります。',
				},
				both: {
					label: '左右でページ・上下で作品',
					description: '左右でページ、上下で作品を送ります。四隅は左右が優先です。',
				},
			},
			gridTabSkip: {
				label: 'グリッドの Tab 移動',
				description: 'Tab で次の作品へ移るときの飛ばし方です。',
				both: {
					label: 'ブックマークとタイトルを飛ばす',
					description: 'カードは「サムネ → ブックマーク → タイトル」の 3 つを順に辿ります。飛ばすと Tab 1 回で次の作品へ移れ、飛ばした操作はビュワーの中で行えます。',
				},
				title: {
					label: 'タイトルだけ飛ばす',
					description: 'ブックマークはグリッドのまま押せます。',
				},
				none: {
					label: '飛ばさない',
					description: 'pixiv 標準の順序のままにします。',
				},
			},
		},
	},
};
