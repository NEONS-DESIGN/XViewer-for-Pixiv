/**
 * 拡張全体で使う定数。
 * 値を直接書き散らさず、必ずここか各モジュール先頭の定数を経由する。
 */

/**
 * 表示言語ごとに URL の先頭へ挟まる接頭辞。(先頭の `/` は含めない)
 *
 * pixiv は表示言語が英語のとき、全てのパスの先頭へ `/en` を挟む。(`/en/users/11`)
 * 日本語は接頭辞を持たない。**この 2 つ以外は存在しない**。他の言語は接頭辞なしのパスのまま表示される。
 *
 * 接頭辞を増やすときはここへ足すだけでよい。パスの判定 (`LOCALE_PATH_PATTERN`) も
 * 作品リンクのセレクタ (`ARTWORK_LINK_SELECTOR`) もこの配列から組み立てている。
 * `src/` で参照するのはこのファイルだけ。export はテスト (locale / grid-focus) が
 * 「接頭辞の数だけ生成物が揃うこと」を確かめるためのもので、消さない。
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
 * 作品リンクのセレクタを接頭辞ごとに 1 本ずつ持つ配列。
 * CSS で擬似クラスを付けるときは、**必ずこの配列の各要素へ個別に付けてから結合する。**
 * カンマで結合した ARTWORK_LINK_SELECTOR の後ろへ継ぎ足すと、CSS のカンマは優先度が
 * 最も低いため末尾の 1 本にしか掛からず、先頭のセレクタが裸で残る。
 * @type {readonly string[]}
 */
export const ARTWORK_LINK_SELECTORS = Object.freeze(
	['', ...LOCALE_PREFIXES.map((locale) => `/${locale}`)].map((prefix) => `a[href^="${prefix}/artworks/"]`),
);

/**
 * 作品リンクを拾うためのセレクタ。pixiv の CSS クラス名は当てにならないのでこれだけを使う。
 * 表示言語が英語のとき href は `/en/artworks/{id}` になるので、接頭辞ごとに 1 本ずつ並べる。
 * (前方一致だけを掴む方針は変えない。`[href*=]` へ緩めると別のパスまで拾ってしまう)
 * querySelectorAll / closest / matches に渡す用。ARTWORK_LINK_SELECTORS を結合したもの。
 */
export const ARTWORK_LINK_SELECTOR = ARTWORK_LINK_SELECTORS.join(',');

/** カードのサムネリンク。pixiv の計測用属性で、クラス名より寿命が長い。 */
export const THUMB_LINK_SELECTOR = 'a[data-ga4-label="thumbnail_link"]';

/**
 * 作品カードのリンクに付く計測用ラベル。サムネとタイトルの 2 本。
 * ユーザーページ・ホーム (横送り・グリッド・フィード)・検索のどれでも付いている。
 * 検索のカードは li ではなく div なので、カードかどうかはこのラベルで見分ける。
 */
export const CARD_LINK_LABELS = Object.freeze(['thumbnail_link', 'title_link']);

/**
 * 作品カードのリンクを拾うセレクタ。作品リンクのセレクタ 1 本ずつにラベルを付けてから結合する。
 * (カンマで結合したものの後ろへ継ぎ足すと、末尾の 1 本にしか掛からない)
 */
export const CARD_LINK_SELECTOR = ARTWORK_LINK_SELECTORS
	.flatMap((link) => CARD_LINK_LABELS.map((label) => `${link}[data-ga4-label="${label}"]`))
	.join(',');

/** カードのブックマークボタンの入れ物。 */
export const BOOKMARK_BUTTON_SELECTOR = '[data-ga4-label="bookmark_button"]';

/** ブックマーク済みのハートの色。未ブックマーク側はテーマで変わるので雛形から採る。 */
export const BOOKMARKED_FILL = '#ff4060';

/** 自分が継ぎ足したカードの目印。撤去と重複判定とクリック判定に使う。 */
export const XV_CARD_ATTR = 'data-xv-card';

/** 継ぎ足したカードが持つブックマーク ID。取り消しに使う。無ければ未ブックマーク。 */
export const XV_BOOKMARK_ID_ATTR = 'data-xv-bookmark-id';

/**
 * グリッドのカード 1 枚を指す要素と、その中のブックマークボタン。
 * pixiv のグリッドは ul > li で、ボタンは li の中の button 1 つだけ。
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
 * ホームの `section` はこの 1 個だけで、作品グリッドは `div` なので掛からない。
 * 見出しの文言は表示言語で変わるため当てにしない。
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
 * 「この作者の全作品」へ並びを広げてはいけない。
 */
export const USER_WORKS_PATH_PATTERN = /^\/users\/\d+(?:\/(?:artworks|illustrations|manga)(?:\/.*)?)?\/?$/;

/**
 * 作品グリッドのうち、イラストか漫画のどちらかだけを出すタブのパス。
 * 1 番目の捕捉がタブ名。/users/{id} と /users/{id}/artworks は両方を出すので合わない。
 */
export const USER_WORKS_CATEGORY_PATTERN = /^\/users\/\d+\/(illustrations|manga)(?:\/|$)/;

/**
 * ユーザーページのうち、プロフィールのホームタブ。
 * 「ピックアップ」欄が出るのはここだけで、/users/{id}/artworks などには出ない。
 */
export const PROFILE_HOME_PATH_PATTERN = /^\/users\/\d+\/?$/;

/**
 * pixiv のホームのパス。ホーム / イラスト / マンガの 3 タブ。(小説のタブには作品カードが無いので外す)
 */
export const HOME_PATH_PATTERN = /^\/(?:illustration|manga)?\/?$/;

/**
 * 検索のパス。2 つの形がある。
 * - タグのページ: /tags/{タグ} のトップと、すべて / イラスト / マンガのタブ。(小説のタブ /tags/{タグ}/novels は外す)
 * - 検索の画面: /search (語句と種類はクエリ ?q=…&type=… が持つ)
 * タグは encodeURIComponent された 1 区切り。
 */
export const SEARCH_PATH_PATTERN = /^\/(?:tags\/[^/]+(?:\/(?:artworks|illustrations|manga))?|search)\/?$/;

/** ビュワーを動かすページの種類。 */
export const PAGE_KINDS = Object.freeze({
	USER: 'user',
	HOME: 'home',
	SEARCH: 'search',
});

/** ページの種類ごとに、ビュワーを使うかを持つ設定のキー。 */
export const VIEWER_PAGE_SETTING = Object.freeze({
	[PAGE_KINDS.USER]: 'viewerOnUser',
	[PAGE_KINDS.HOME]: 'viewerOnHome',
	[PAGE_KINDS.SEARCH]: 'viewerOnSearch',
});

/**
 * 作品グリッドのタブ (イラスト・マンガ・すべて) のパス。
 * pixiv のページャ (?p=) が出るのはこの 3 つだけ。
 * プロフィールホーム (/users/{id}) はダイジェストでページャが無いので含めない。
 * タグ絞り込み (/artworks/{タグ}) は末尾を許さないことで外れる。
 */
export const USER_WORKS_TAB_PATH_PATTERN = /^\/users\/\d+\/(?:artworks|illustrations|manga)\/?$/;

/**
 * 作品の種別。値は profile/all の応答キーと合わせてある。
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
 * 作品の種別から profile/illusts の work_category クエリの値を引く。
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
	/**
	 * content script -> 注入側。今の履歴 state を保ったまま URL だけ差し替える。(detail は URL の文字列)
	 * isolated world から読んだ history.state は古いことがあり、それを書き戻すと
	 * Next.js の state を壊すので、読むのも書くのも page world に任せる。
	 */
	REPLACE_URL: 'xviewer:replace-url',
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
 * pixiv の xRestrict と同じ尺度で、0 は全年齢のみ。
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
 * PREFETCH_CHOICES に含まれることは storage.test.js が見張る。
 */
const DEFAULT_PREFETCH = 1;

/**
 * 先読みの選択肢のうち「カスタム」を表す値。枚数は設定 prefetchCustom が持つ。
 * 設定 prefetch は PREFETCH_CHOICES の数値か、この文字列のどちらか。
 */
export const PREFETCH_CUSTOM = 'custom';

/** カスタムの先読みで選べる枚数の範囲。(両端を含む) */
export const PREFETCH_CUSTOM_RANGE = Object.freeze({ min: 1, max: 20, step: 1 });

/** カスタムの先読みでこの枚数以上を選んだら、メモリを圧迫する旨の警告を出す。 */
export const PREFETCH_CUSTOM_WARN_AT = 10;

/** カスタムの先読みのレンジの下に添える目盛りの間隔 (枚)。端の値は必ず出す */
export const PREFETCH_CUSTOM_SCALE_STEP = 5;

/** カスタムの先読みの既定の枚数。既存の選択肢 (1 / 3) の間に置く */
const DEFAULT_PREFETCH_CUSTOM = 2;

/** コメントを 1 回に読む件数の選択肢。昇順。pixiv が受け付ける上限は 50 */
export const COMMENT_PAGE_SIZE_CHOICES = Object.freeze([10, 20, 30, 50]);

/** コメントを 1 回に読む件数の既定値。 */
export const COMMENT_PAGE_SIZE = 30;

/** グリッドのフォーカス順を当て直す間隔 (ミリ秒)。再描画のたびに走らせないための間引き。 */
export const TAB_SKIP_REFRESH_MS = 200;

/**
 * グリッドで Tab を送ったときに、何をフォーカス順から外すか。
 * pixiv のカードは「サムネ → ブックマーク → タイトル」の 3 ステップで 1 作品なので、
 * 外さないと次の作品まで 3 回押すことになる。
 */
export const GRID_TAB_SKIP = Object.freeze({
	/** ブックマークボタンとタイトルリンクの両方 */
	BOTH: 'both',
	/** タイトルリンクだけ */
	TITLE: 'title',
	/** 何も外さない (既定。pixiv 標準のまま) */
	NONE: 'none',
});

/** 1 ページに並ぶ作品の数。pixiv 本体のページャと同じ数。 */
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
 * クラス名 (sc-xxxx) は版ごとに変わるので掴まない。
 * 作品が 1 ページに収まるページャは描かれないが、その場合は当たる nav が無いだけで害は無い。
 *
 * 探すのは "p=" ではなく "?p=" (クエリの先頭)。"p=" だけだと p を含むパスや
 * クエリ付きのタブ行にも当たり、タブ行ごと消してしまう。
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
 * ビュワーの画面端のクリック領域。押すとページ・作品を送る。
 * 既定はオフ。押しただけで閉じるつもりの場所が送りに変わるのを既定にしない。
 */
export const NAV_ZONES = Object.freeze({
	/** 使わない (矢印ボタンとキーだけ) */
	OFF: 'off',
	/** 左右の端でページを送る */
	HORIZONTAL: 'horizontal',
	/** 上下の端で作品を送る */
	VERTICAL: 'vertical',
	/** 左右でページ、上下で作品を送る。四隅は左右を優先する */
	BOTH: 'both',
});

/**
 * 数値の設定を「既定のまま」か「カスタム (レンジで選ぶ)」かで持つ設定の値。
 * 画面端のクリック領域・原寸表示のクリック領域が使う。(背景の濃さは BACKDROP_MODES)
 */
export const SETTING_MODES = Object.freeze({
	DEFAULT: 'default',
	CUSTOM: 'custom',
});

/**
 * クリック領域の幅をカスタムで選べる範囲 (%)。画面端のクリック領域と原寸表示のクリック領域で共有する。
 * 左右 (または上下) の 2 つが重ならないよう 50 未満に留める。
 */
export const ZONE_SIZE_RANGE = Object.freeze({ min: 5, max: 35, step: 5 });

/** クリック領域の幅のレンジの下に添える目盛りの間隔 (%)。 */
export const ZONE_SIZE_SCALE_STEP = 5;

/** 画面端のクリック領域の幅の既定値 (%)。左右と上下で共通 */
export const DEFAULT_NAV_ZONE_SIZE = 25;

/**
 * 画面端のクリック領域の既定の幅の割合。(0-1) カスタムでないときと、設定を渡さないときに使う。
 * horizontal は左右の端の幅 (ステージの幅に対する割合)、vertical は上下の端の幅 (ステージの高さに対する割合)
 */
export const NAV_ZONE_RATIOS = Object.freeze({
	horizontal: DEFAULT_NAV_ZONE_SIZE / 100,
	vertical: DEFAULT_NAV_ZONE_SIZE / 100,
});

/** 原寸表示のクリック領域の幅の既定値 (%)。CSS の --zoom-zone-width の既定と同じ値 */
export const DEFAULT_ZOOM_ZONE_SIZE = 25;

/** サイドバーの幅の選択肢 (px)。昇順 */
export const SIDEBAR_WIDTH_CHOICES = Object.freeze([320, 384, 448, 512]);

/** サイドバーの幅の既定値 (px)。 */
const DEFAULT_SIDEBAR_WIDTH = 384;

/** 狭い画面で引き出したサイドバーの幅の上限の選択肢。画面の幅に対する % で、昇順 */
export const SIDEBAR_DRAWER_MAX_CHOICES = Object.freeze([50, 60, 70, 80]);

/** 引き出したサイドバーの幅の上限の既定値 (%)。 */
const DEFAULT_SIDEBAR_DRAWER_MAX = 60;

/**
 * 背景の幕の濃さの持ち方。
 * THEME はテーマごとの既定 (ダーク 92% / ライト 88%) のまま描く。CUSTOM は設定 backdropOpacity の濃さで描く。
 */
export const BACKDROP_MODES = Object.freeze({
	THEME: 'theme',
	CUSTOM: 'custom',
});

/** 背景の幕の濃さをカスタムで選べる範囲 (%)。 */
export const BACKDROP_OPACITY_RANGE = Object.freeze({ min: 0, max: 100, step: 10 });

/** 背景の幕の濃さのレンジの下に添える目盛りの間隔 (%)。10 刻みで全部出すと文字が重なる */
export const BACKDROP_OPACITY_SCALE_STEP = 20;

/** カスタムにした直後の背景の幕の濃さ (%)。ダークの既定 (92%) に近い値 */
const DEFAULT_BACKDROP_OPACITY = 90;

/**
 * 設定の値をビュワーの CSS 変数へ写す表。キーは設定名。
 * unit は値の後ろに付ける単位。divisor は値を割る数。(% を 0-1 の不透明度にする等。掛け算だと 0.7000000000000001 のような誤差が出る)
 * mode を持つ項目は、設定 mode.key が mode.custom のときだけ上書きし、それ以外は CSS の既定に任せる。
 * @type {Readonly<Record<string, {property: string, unit?: string, divisor?: number, mode?: {key: string, custom: string}}>>}
 */
export const VIEWER_CSS_SETTINGS = Object.freeze({
	sidebarWidth: Object.freeze({ property: '--sidebar-width', unit: 'px' }),
	sidebarDrawerMax: Object.freeze({ property: '--sidebar-drawer-max', unit: '%' }),
	backdropOpacity: Object.freeze({
		property: '--backdrop-alpha',
		divisor: 100,
		mode: Object.freeze({ key: 'backdropMode', custom: BACKDROP_MODES.CUSTOM }),
	}),
	zoomZoneSize: Object.freeze({
		property: '--zoom-zone-width',
		unit: '%',
		mode: Object.freeze({ key: 'zoomZoneMode', custom: SETTING_MODES.CUSTOM }),
	}),
});

/**
 * クリック領域の種類。ステージの data-nav-zone に入れてカーソルを変える。
 * 値は CSS の属性選択子と揃える。
 */
export const NAV_ZONE_KINDS = Object.freeze({
	PREV_PAGE: 'prev-page',
	NEXT_PAGE: 'next-page',
	PREV_WORK: 'prev-work',
	NEXT_WORK: 'next-work',
});

/**
 * popup の配色。
 * SYSTEM は OS の設定 (prefers-color-scheme) に従う。
 * 明示の選択 (DARK / LIGHT) は常に OS より優先する。
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
	viewerOnUser: true,
	viewerOnHome: true,
	viewerOnSearch: true,
	imageQuality: IMAGE_QUALITY.REGULAR,
	prefetch: DEFAULT_PREFETCH,
	prefetchCustom: DEFAULT_PREFETCH_CUSTOM,
	prefetchNeighbor: false,
	showSidebar: true,
	sidebarScroll: SIDEBAR_SCROLL.WHOLE,
	sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
	sidebarDrawerMax: DEFAULT_SIDEBAR_DRAWER_MAX,
	backdropMode: BACKDROP_MODES.THEME,
	backdropOpacity: DEFAULT_BACKDROP_OPACITY,
	commentPageSize: COMMENT_PAGE_SIZE,
	closeOnBackdrop: true,
	navZones: NAV_ZONES.OFF,
	navZoneMode: SETTING_MODES.DEFAULT,
	navZoneSize: DEFAULT_NAV_ZONE_SIZE,
	navZoneSizeVertical: DEFAULT_NAV_ZONE_SIZE,
	clickZoom: false,
	zoomZoneMode: SETTING_MODES.DEFAULT,
	zoomZoneSize: DEFAULT_ZOOM_ZONE_SIZE,
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
 * role="dialog" を名乗る以上、フォーカスは中に閉じ込める。
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

/**
 * DISPLAY_TIME_ZONE の UTC からのずれ。Asia/Tokyo は夏時間が無いので固定値でよい。
 * 時差を持たない日時 (コメントの commentDate 'YYYY-MM-DD HH:mm') を Date に読むときに使う。
 */
export const DISPLAY_TIME_ZONE_OFFSET = '+09:00';

/** 押した直後の先読み結果を使い回してよい期限 (ミリ秒)。 */
export const PRESS_PREFETCH_TTL_MS = 3000;

/** 前後の作品の先読み結果を使い回してよい期限 (ミリ秒)。 */
export const NEIGHBOR_PREFETCH_TTL_MS = 30000;

/** 読み込み中の表示を出すまでの遅延 (ミリ秒)。短時間で終わる読み込みでは出さない。 */
export const LOADING_STATUS_DELAY_MS = 250;

/** 先読み結果を手放す枚数の余白。現在位置からこの枚数を超えて離れたら破棄する。 */
export const PREFETCH_RELEASE_MARGIN = 10;

/** うごイラの再生開始とみなすまでに待つフレーム数。 */
export const UGOIRA_START_FRAMES = 3;

/** うごイラの再生速度の選択肢 (倍率)。遅い順。メニューはこの並びで出す */
export const UGOIRA_PLAYBACK_RATES = Object.freeze([0.25, 0.5, 1, 1.5, 2]);

/** うごイラの再生速度の既定 (等速)。UGOIRA_PLAYBACK_RATES に含まれること */
export const DEFAULT_UGOIRA_RATE = 1;

/** セッション情報の取得を待つ上限 (ミリ秒)。超えたら諦めて既定へ倒す。 */
export const SESSION_WARMUP_TIMEOUT_MS = 2000;

/** ブラウザがアイドル検知に対応しないときの代替の遅延 (ミリ秒)。 */
export const IDLE_FALLBACK_DELAY_MS = 0;
