/**
 * 拡張全体で使う定数。
 * 値を直接書き散らさず、必ずここか各モジュール先頭の定数を経由する。
 */

/** 作品リンクを拾うためのセレクタ。pixiv の CSS クラス名は当てにならないのでこれだけを使う。 */
export const ARTWORK_LINK_SELECTOR = 'a[href^="/artworks/"]';

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

/** モーダルを載せるホスト要素の id。 */
export const HOST_ELEMENT_ID = 'pixivmaster-root';

/**
 * page world の注入スクリプトと content script の間でやり取りするイベント名。
 * world をまたげるのは DOM だけなので、遷移の通知も解除の指示も DOM イベントで送る。
 */
export const NAV_EVENTS = Object.freeze({
	/** 注入側 -> content script。history が呼ばれた */
	NAVIGATE: 'pixivmaster:navigate',
	/** content script -> 注入側。history のフックを外して pixiv 標準に戻す */
	UNHOOK: 'pixivmaster:unhook',
	/** content script -> 注入側。外したフックを張り直す */
	REHOOK: 'pixivmaster:rehook',
});

/** history をフック済みであることを示す window のプロパティ名。二重注入の防止に使う。 */
export const NAV_HOOK_FLAG = '__pixivmasterNavHooked';

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

/** 設定の既定値。保存値が壊れていたらここへ倒す。 */
export const SETTINGS_DEFAULTS = Object.freeze({
	enabled: true,
	imageQuality: IMAGE_QUALITY.REGULAR,
	prefetch: 3,
	showSidebar: true,
	closeOnBackdrop: true,
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
