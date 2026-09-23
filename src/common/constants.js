/**
 * 拡張全体で使う定数。
 * 値を直接書き散らさず、必ずここか各モジュール先頭の定数を経由する。
 */

/**
 * 表示言語ごとに URL の先頭へ挟まる接頭辞。(先頭の `/` は含めない)
 *
 * pixiv は表示言語が英語のとき、全てのパスの先頭へ `/en` を挟む。(`/en/users/11`)
 * 日本語は接頭辞を持たない。**この 2 つ以外は存在しない**。`/ko` `/zh` `/zh-tw` `/th` は
 * いずれも 404 で、他の言語は接頭辞なしのパスのまま表示される。(SITE_SPEC §3 実測)
 *
 * 接頭辞を増やすときはここへ足すだけでよい。パスの判定 (`LOCALE_PATH_PATTERN`) も
 * 作品リンクのセレクタ (`ARTWORK_LINK_SELECTOR`) もこの配列から組み立てている。
 * @type {readonly string[]}
 */
export const LOCALE_PREFIXES = Object.freeze(['en']);

/**
 * パスの先頭に付いている表示言語の接頭辞。
 * 次が区切りか終端であることを求め、`/entry` のような別のパスに当たらないようにする。
 * 読み書きは `common/locale.js` に閉じ込めてあるので、直接使わない。
 */
export const LOCALE_PATH_PATTERN = new RegExp(`^/(?:${LOCALE_PREFIXES.join('|')})(?=/|$)`);

/**
 * 作品リンクを拾うためのセレクタ。pixiv の CSS クラス名は当てにならないのでこれだけを使う。
 * 表示言語が英語のとき href は `/en/artworks/{id}` になるので、接頭辞ごとに 1 本ずつ並べる。
 * (前方一致だけを掴む方針は変えない。`[href*=]` へ緩めると別のパスまで拾ってしまう)
 */
export const ARTWORK_LINK_SELECTOR = ['', ...LOCALE_PREFIXES.map((locale) => `/${locale}`)]
	.map((prefix) => `a[href^="${prefix}/artworks/"]`)
	.join(',');

/** カードのサムネリンク。pixiv の計測用属性で、クラス名より寿命が長い。(SITE_SPEC §3 実測) */
export const THUMB_LINK_SELECTOR = 'a[data-ga4-label="thumbnail_link"]';

/** カードのブックマークボタンの入れ物。 */
export const BOOKMARK_BUTTON_SELECTOR = '[data-ga4-label="bookmark_button"]';

/** ブックマーク済みのハートの色。(SITE_SPEC §3 実測) 未ブックマーク側はテーマで変わるので雛形から採る。 */
export const BOOKMARKED_FILL = '#ff4060';

/** 自分が継ぎ足したカードの目印。撤去と重複判定とクリック判定に使う。 */
export const XV_CARD_ATTR = 'data-xv-card';

/** 継ぎ足したカードが持つブックマーク ID。取り消しに使う。無ければ未ブックマーク。 */
export const XV_BOOKMARK_ID_ATTR = 'data-xv-bookmark-id';

/**
 * グリッドのカード 1 枚を指す要素と、その中のブックマークボタン。
 * pixiv のグリッドは ul > li で、ボタンは li の中の button 1 つだけ。(SITE_SPEC §3 実測)
 * 構造の前提なので、散らさずここで持つ。
 */
export const CARD_SELECTOR = 'li';
export const CARD_BUTTON_SELECTOR = 'button';

/**
 * tab-skip がフォーカス順から外した要素と、読み上げ名を補ったサムネリンクの目印。
 * dispose で元へ戻すときと、継ぎ足したカードから雛形由来の印を落とすときに使う。
 */
export const TAB_SKIP_MARK_ATTR = 'data-xv-tabskip';
export const TAB_SKIP_LABEL_ATTR = 'data-xv-label';

/**
 * プロフィールのホームに出る「ピックアップ」欄を指すセレクタ。
 * 実測ではホームの `section` はこの 1 個だけで、作品グリッドは `div` なので掛からない。
 * (SITE_SPEC §3) 見出しの文言は表示言語で変わるため当てにしない。
 * 作品リンクを持つことまで求めるのは、pixiv が作品と無関係な section を足したときに
 * 巻き込まないため。
 */
export const PICKUP_SECTION_SELECTOR = `section:has(${ARTWORK_LINK_SELECTOR})`;

/**
 * 作品ページのパス。
 * /users/{id}/artworks/{タグ} を除くため、末尾が数字だけであることを要求する。
 *
 * 以降のパスの正規表現は全て**表示言語の接頭辞を落としたあと**のパスに当てる。
 * (`content/page.js` が `stripLocale()` を通してから使う) 接頭辞をここへ書き足さないこと。
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
 * 「この作者の全作品」へ並びを広げてはいけない。(SITE_SPEC §3)
 */
export const USER_WORKS_PATH_PATTERN = /^\/users\/\d+(?:\/(?:artworks|illustrations|manga)(?:\/.*)?)?\/?$/;

/**
 * 作品グリッドのうち、イラストか漫画のどちらかだけを出すタブのパス。
 * 1 番目の捕捉がタブ名。/users/{id} と /users/{id}/artworks は両方を出すので合わない。
 */
export const USER_WORKS_CATEGORY_PATTERN = /^\/users\/\d+\/(illustrations|manga)(?:\/|$)/;

/**
 * ユーザーページのうち、プロフィールのホームタブ。
 * 「ピックアップ」欄が出るのはここだけで、/users/{id}/artworks などには出ない。(SITE_SPEC §3)
 */
export const PROFILE_HOME_PATH_PATTERN = /^\/users\/\d+\/?$/;

/**
 * 作品グリッドのタブ (イラスト・マンガ・すべて) のパス。
 * pixiv のページャ (?p=) が出るのはこの 3 つだけ。
 * プロフィールホーム (/users/{id}) はダイジェストでページャが無いので含めない。
 * タグ絞り込み (/artworks/{タグ}) は末尾を許さないことで外れる。
 */
export const USER_WORKS_TAB_PATH_PATTERN = /^\/users\/\d+\/(?:artworks|illustrations|manga)\/?$/;

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

/**
 * 作品の種別から profile/illusts の work_category クエリの値を引く。(SITE_SPEC §3)
 * profile/all の応答キー (illusts) とは綴りが違うので、そのまま送らずここで変換する。
 */
export const WORK_CATEGORY_QUERY = Object.freeze({
	[WORK_CATEGORY.ILLUST]: 'illust',
	[WORK_CATEGORY.MANGA]: 'manga',
});

/** 種別で絞らないとき (/users/{id}/artworks タブ) の work_category。 */
export const WORK_CATEGORY_QUERY_BOTH = 'illustManga';

/** モーダルを載せるホスト要素の id。 */
export const HOST_ELEMENT_ID = 'xviewer-root';

/**
 * page world の注入スクリプトと content script の間でやり取りするイベント名。
 * world をまたげるのは DOM だけなので、遷移の通知も解除の指示も DOM イベントで送る。
 */
export const NAV_EVENTS = Object.freeze({
	/** 注入側 -> content script。history が呼ばれた */
	NAVIGATE: 'xviewer:navigate',
	/** content script -> 注入側。history のフックを外して pixiv 標準に戻す */
	UNHOOK: 'xviewer:unhook',
	/** content script -> 注入側。外したフックを張り直す */
	REHOOK: 'xviewer:rehook',
});

/** history をフック済みであることを示す window のプロパティ名。二重注入の防止に使う。 */
export const NAV_HOOK_FLAG = '__xviewerNavHooked';

/**
 * MutationObserver から location を確かめるまでの待ち時間 (ミリ秒)。
 * pixiv のグリッドは頻繁に再描画されるため、一連の変更を 1 回の確認にまとめる。
 */
export const LOCATION_CHECK_DELAY_MS = 200;

/**
 * ログイン情報が読めないときの閲覧設定。(R-18 を出さない)
 * SITE_SPEC §6 の xRestrict の値と同じ尺度で、0 は全年齢のみ。
 */
export const DEFAULT_X_RESTRICT = 0;

/** 画像の解像度。urls のキー名と合わせてある。 */
export const IMAGE_QUALITY = Object.freeze({
	REGULAR: 'regular',
	ORIGINAL: 'original',
});

/** 先読みする枚数の選択肢。昇順に並べる。(設定画面はこの並びで選択肢を出す) */
export const PREFETCH_CHOICES = Object.freeze([0, 1, 3]);

/**
 * 先読みの既定値。前後 1 枚。
 * 切り替えの速さより、端末と回線への負担の少なさを既定に置く。
 * (高解像度の作品を 3 枚先まで取ると、送るだけで通信量が膨らむ)
 * 値は PREFETCH_CHOICES から引く。(選択肢に無い既定を書けないようにするため)
 */
export const DEFAULT_PREFETCH = PREFETCH_CHOICES[PREFETCH_CHOICES.indexOf(1)];

/** コメントを 1 回に読む件数。 */
export const COMMENT_PAGE_SIZE = 30;

/** グリッドのフォーカス順を当て直す間隔 (ミリ秒)。再描画のたびに走らせないための間引き。 */
export const TAB_SKIP_REFRESH_MS = 200;

/**
 * グリッドで Tab を送ったときに、何をフォーカス順から外すか。
 * pixiv のカードは「サムネ → ブックマーク → タイトル」の 3 ステップで 1 作品なので、
 * 外さないと次の作品まで 3 回押すことになる。(SITE_SPEC 参照)
 */
export const GRID_TAB_SKIP = Object.freeze({
	/** ブックマークボタンとタイトルリンクの両方 */
	BOTH: 'both',
	/** タイトルリンクだけ */
	TITLE: 'title',
	/** 何も外さない (既定。pixiv 標準のまま) */
	NONE: 'none',
});

/** 1 ページに並ぶ作品の数。pixiv 本体のページャと同じ数。(SITE_SPEC §3 実測) */
export const WORKS_PER_PAGE = 48;

/**
 * ユーザーページの作品グリッドを無限スクロールにするか。
 * 既定はオフ。pixiv 本体のページャをそのまま使う人の見え方を変えないため。
 */
export const INFINITE_SCROLL = Object.freeze({
	/** 使わない (pixiv 標準のページャのまま) */
	OFF: 'off',
	/** 一番下まで来たら次のページを読む */
	ON_REACH: 'onReach',
	/** 常に 1 ページ先を読み込んでおき、下に着く前に並べ終える */
	PREFETCH: 'prefetch',
});

/** sentinel の目印。ul の直後に置き、見えたら次のページを読む。 */
export const SENTINEL_ATTR = 'data-xv-sentinel';

/**
 * モードごとの sentinel の見張り範囲 (IntersectionObserver の rootMargin)。
 *
 * 2 つのモードの差はここだけで決まるので、値は 1 か所にまとめて取り違えを防ぐ。
 * (0.22.1 までは割り当てが逆で、「下まで来たら」のほうが早く読み始めていた)
 *
 * - onReach は 0。「一番下に着いてから読む」と案内している以上、手前から読み始めない。
 *   下端でスピナーが出て少し待つのがこのモードの正しい見え方 (通信は最小で済む)
 * - prefetch は 1 画面ぶん (100%)。作品は既に手元にあるので、下端が見えるより前に
 *   並べ終えられる。% は root (ビューポート) の高さに対する割合なので、
 *   ウィンドウの高さが変わっても「1 画面ぶん手前」を保てる
 *
 * 値は rootMargin にそのまま渡せる文字列。
 * @type {Readonly<Record<string, string>>}
 */
export const SENTINEL_MARGIN = Object.freeze({
	[INFINITE_SCROLL.ON_REACH]: '0px',
	[INFINITE_SCROLL.PREFETCH]: '100%',
});

/**
 * pixiv 本体のページャ (1 2 3 ... 次へ)。ページ番号のリンクを含む nav で掴む。
 * ページ内の nav はタブ行とページャの 2 つだけで、?p= を持つのはページャだけ。
 * (SITE_SPEC §3「ページャ」実測) クラス名 (sc-xxxx) は版ごとに変わるので掴まない。
 * 作品が 1 ページに収まるページャは描かれないが、その場合は当たる nav が無いだけで害は無い。
 *
 * 探すのは "p=" ではなく "?p=" (クエリの先頭)。実機のページャのリンクは
 * /users/{id}/illustrations?p=2 の形なので同じものに当たるが、"p=" だけで探すと
 * p を含むパス (/users/{id}/bookmarks/artworks 等) やクエリ付きのタブ行にも当たり、
 * 将来 pixiv がタブ行のリンクにクエリを足した版でタブ行ごと消してしまう。
 */
export const PAGER_SELECTOR = 'nav:has(a[href*="?p="])';

/**
 * サイドバーを縦に送るときの動き方。
 * 主文がとても長い作品では、コメントまで一気に読めたほうが楽なこともある。
 */
export const SIDEBAR_SCROLL = Object.freeze({
	/** 投稿文とタグは固定したまま、コメント一覧だけを送る (X.com の見え方) */
	COMMENTS: 'comments',
	/** 投稿文からコメントまでを 1 つにつなげて送る (既定) */
	WHOLE: 'whole',
});

/**
 * popup の配色。
 * SYSTEM は OS の設定 (prefers-color-scheme) に従う。
 * 明示の選択 (DARK / LIGHT) は常に OS より優先する。(UI_DESIGN_KIT §10)
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
 * 解決済みの DARK / LIGHT だけを引く。(popup-ui.js の resolveTheme を通す)
 * labelKey は文言そのものではなく、strings.theme を引くための鍵。(文言の出どころは src/i18n)
 */
export const THEME_TOGGLE = Object.freeze({
	[POPUP_THEMES.DARK]: Object.freeze({
		next: POPUP_THEMES.LIGHT,
		icon: 'lightMode',
		labelKey: 'TO_LIGHT',
	}),
	[POPUP_THEMES.LIGHT]: Object.freeze({
		next: POPUP_THEMES.DARK,
		icon: 'darkMode',
		labelKey: 'TO_DARK',
	}),
});

/** 設定の既定値。保存値が壊れていたらここへ倒す。 */
export const SETTINGS_DEFAULTS = Object.freeze({
	enabled: true,
	imageQuality: IMAGE_QUALITY.REGULAR,
	prefetch: DEFAULT_PREFETCH,
	showSidebar: true,
	sidebarScroll: SIDEBAR_SCROLL.WHOLE,
	closeOnBackdrop: true,
	clickZoom: false,
	gridTabSkip: GRID_TAB_SKIP.NONE,
	hidePickup: false,
	infiniteScroll: INFINITE_SCROLL.OFF,
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
 * role="dialog" を名乗る以上、フォーカスは中に閉じ込める。(UI_DESIGN_KIT §6)
 */
export const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 状態表示 (role="status" / "alert") の種別。文言の横に出す見た目の区別に使う。
 * viewer の showStatus と actions-bar の announce が同じ語彙で書く。
 */
export const STATUS_KINDS = Object.freeze({
	INFO: 'info',
	ERROR: 'error',
});

/** 隠れている要素。フォーカスの巡回から外すために使う。 */
export const HIDDEN_SELECTOR = '[hidden]';

/** モーダルの背後を Tab と読み上げから外すための属性。 */
export const INERT_ATTRIBUTE = 'inert';

/**
 * inert が付いている要素。フォーカスの巡回から外すために使う。
 * inert の中の要素は focus() が無言で失敗するので、巡回の対象に残すと
 * そこで Tab が止まったように見える。(原寸表示中のステージとサイドバーがこれに当たる)
 */
export const INERT_SELECTOR = `[${INERT_ATTRIBUTE}]`;

/**
 * 日時の表示に使うタイムゾーン。
 * 閲覧地に依らず pixiv 本体と同じ表示にするため固定する。
 * 言語にも画面にも依らないのでここに置く。(言語ごとのカタログが参照する)
 */
export const DISPLAY_TIME_ZONE = 'Asia/Tokyo';
