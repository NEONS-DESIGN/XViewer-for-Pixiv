/**
 * 拡張全体で使う定数。
 * 値を直接書き散らさず、必ずここか各モジュール先頭の定数を経由する。
 */

/** 作品リンクを拾うためのセレクタ。pixiv の CSS クラス名は当てにならないのでこれだけを使う。 */
export const ARTWORK_LINK_SELECTOR = 'a[href^="/artworks/"]';

/**
 * プロフィールのホームに出る「ピックアップ」欄を指すセレクタ。
 * 実測ではホームの `section` はこの 1 個だけで、作品グリッドは `div` なので掛からない
 * (SITE_SPEC §3)。見出しの文言は表示言語で変わるため当てにしない。
 * 作品リンクを持つことまで求めるのは、pixiv が作品と無関係な section を足したときに
 * 巻き込まないため。
 */
export const PICKUP_SECTION_SELECTOR = `section:has(${ARTWORK_LINK_SELECTOR})`;

/**
 * 作品ページのパス。
 * /users/{id}/artworks/{タグ} を除くため、末尾が数字だけであることを要求する。
 */
export const ARTWORK_PATH_PATTERN = /^\/artworks\/(\d+)$/;

/** ユーザーページのパス。 */
export const USER_PATH_PATTERN = /^\/users\/(\d+)(?:\/|$)/;

/** ページのキーを組み立てるときの区切り。ID にもフラグにも現れない文字を使う。 */
export const PAGE_KEY_SEPARATOR = '|';

/** ユーザーページのうち、タグで絞り込んでいる状態のパス。 */
export const USER_TAG_PATH_PATTERN = /^\/users\/\d+\/(?:artworks|illustrations|manga)\/.+/;

/**
 * ユーザーページのうち、その人自身の作品グリッドを出すパス。
 * ブックマーク (/users/{id}/bookmarks/artworks) やフォロー中 (/users/{id}/following) にも
 * 作品リンクは並ぶが、そこに出ているのは他人の作品なので、
 * 「この作者の全作品」へ並びを広げてはいけない (SITE_SPEC §3)。
 */
export const USER_WORKS_PATH_PATTERN = /^\/users\/\d+(?:\/(?:artworks|illustrations|manga)(?:\/.*)?)?\/?$/;

/**
 * 作品グリッドのうち、イラストか漫画のどちらかだけを出すタブのパス。
 * 1 番目の捕捉がタブ名。/users/{id} と /users/{id}/artworks は両方を出すので合わない。
 */
export const USER_WORKS_CATEGORY_PATTERN = /^\/users\/\d+\/(illustrations|manga)(?:\/|$)/;

/**
 * ユーザーページのうち、プロフィールのホームタブ。
 * 「ピックアップ」欄が出るのはここだけで、/users/{id}/artworks などには出ない (SITE_SPEC §3)。
 */
export const PROFILE_HOME_PATH_PATTERN = /^\/users\/\d+\/?$/;

/**
 * 作品の種別。値は profile/all の応答キー (SITE_SPEC §3) と合わせてある。
 * タブのパス名 (illustrations / manga) とは綴りが違うので WORK_CATEGORY_BY_TAB で引く。
 */
export const WORK_CATEGORY = Object.freeze({
	ILLUST: 'illusts',
	MANGA: 'manga',
});

/** タブのパス名から作品の種別を引く。 */
export const WORK_CATEGORY_BY_TAB = Object.freeze({
	illustrations: WORK_CATEGORY.ILLUST,
	manga: WORK_CATEGORY.MANGA,
});

/** モーダルを載せるホスト要素の id。 */
export const HOST_ELEMENT_ID = 'gridviewer-root';

/**
 * page world の注入スクリプトと content script の間でやり取りするイベント名。
 * world をまたげるのは DOM だけなので、遷移の通知も解除の指示も DOM イベントで送る。
 */
export const NAV_EVENTS = Object.freeze({
	/** 注入側 -> content script。history が呼ばれた */
	NAVIGATE: 'gridviewer:navigate',
	/** content script -> 注入側。history のフックを外して pixiv 標準に戻す */
	UNHOOK: 'gridviewer:unhook',
	/** content script -> 注入側。外したフックを張り直す */
	REHOOK: 'gridviewer:rehook',
});

/** history をフック済みであることを示す window のプロパティ名。二重注入の防止に使う。 */
export const NAV_HOOK_FLAG = '__gridviewerNavHooked';

/**
 * MutationObserver から location を確かめるまでの待ち時間 (ミリ秒)。
 * pixiv のグリッドは頻繁に再描画されるため、一連の変更を 1 回の確認にまとめる。
 */
export const LOCATION_CHECK_DELAY_MS = 200;

/** 画像の解像度。urls のキー名と合わせてある。 */
export const IMAGE_QUALITY = Object.freeze({
	REGULAR: 'regular',
	ORIGINAL: 'original',
});

/** 先読みする枚数の選択肢。 */
export const PREFETCH_CHOICES = Object.freeze([0, 1, 3]);

/** コメントを 1 回に読む件数。 */
export const COMMENT_PAGE_SIZE = 30;

/** グリッドのフォーカス順を当て直す間隔 (ミリ秒)。再描画のたびに走らせないための間引き。 */
export const TAB_SKIP_REFRESH_MS = 200;

/**
 * グリッドで Tab を送ったときに、何をフォーカス順から外すか。
 * pixiv のカードは「サムネ → ブックマーク → タイトル」の 3 ステップで 1 作品なので、
 * 外さないと次の作品まで 3 回押すことになる (SITE_SPEC 参照)。
 */
export const GRID_TAB_SKIP = Object.freeze({
	/** ブックマークボタンとタイトルリンクの両方 */
	BOTH: 'both',
	/** タイトルリンクだけ */
	TITLE: 'title',
	/** 何も外さない (pixiv 標準のまま) */
	NONE: 'none',
});

/**
 * サイドバーを縦に送るときの動き方。
 * 主文がとても長い作品では、コメントまで一気に読めたほうが楽なこともある。
 */
export const SIDEBAR_SCROLL = Object.freeze({
	/** 投稿文とタグは固定したまま、コメント一覧だけを送る (既定。X.com の見え方) */
	COMMENTS: 'comments',
	/** 投稿文からコメントまでを 1 つにつなげて送る */
	WHOLE: 'whole',
});

/**
 * popup の配色。
 * SYSTEM は OS の設定 (prefers-color-scheme) に従う。
 * 明示の選択 (DARK / LIGHT) は常に OS より優先する (UI_DESIGN_KIT §10)。
 */
export const POPUP_THEMES = Object.freeze({
	SYSTEM: 'system',
	DARK: 'dark',
	LIGHT: 'light',
});

/**
 * 配色の切り替えボタンの定義。キーは今見えている配色、値は「押すと何になるか」。
 * アイコンと文言を「次の状態」で揃えるのは、ボタンは押した結果を示すものであり、
 * 今の状態は画面の配色そのものが伝えているため。
 * SYSTEM は「今見えている配色」ではないのでキーに現れない。
 * 解決済みの DARK / LIGHT だけを引く (popup-ui.js の resolveTheme を通す)。
 */
export const THEME_TOGGLE = Object.freeze({
	[POPUP_THEMES.DARK]: Object.freeze({
		next: POPUP_THEMES.LIGHT,
		icon: 'lightMode',
		label: 'ライトモードに切り替える',
	}),
	[POPUP_THEMES.LIGHT]: Object.freeze({
		next: POPUP_THEMES.DARK,
		icon: 'darkMode',
		label: 'ダークモードに切り替える',
	}),
});

/** 設定の既定値。保存値が壊れていたらここへ倒す。 */
export const SETTINGS_DEFAULTS = Object.freeze({
	enabled: true,
	imageQuality: IMAGE_QUALITY.REGULAR,
	prefetch: 3,
	showSidebar: true,
	sidebarScroll: SIDEBAR_SCROLL.COMMENTS,
	closeOnBackdrop: true,
	gridTabSkip: GRID_TAB_SKIP.BOTH,
	hidePickup: false,
	popupTheme: POPUP_THEMES.SYSTEM,
});

/** キー操作の割り当て。 */
export const KEYS = Object.freeze({
	PREV_PAGE: 'ArrowLeft',
	NEXT_PAGE: 'ArrowRight',
	PREV_WORK: 'ArrowUp',
	NEXT_WORK: 'ArrowDown',
	CLOSE: 'Escape',
	FOCUS_NEXT: 'Tab',
});

/**
 * モーダルの中で Tab を巡回させる対象。
 * role="dialog" を名乗る以上、フォーカスは中に閉じ込める (UI_DESIGN_KIT §6)。
 */
export const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

/** 隠れている要素。フォーカスの巡回から外すために使う。 */
export const HIDDEN_SELECTOR = '[hidden]';

/** モーダルの背後を Tab と読み上げから外すための属性。 */
export const INERT_ATTRIBUTE = 'inert';
