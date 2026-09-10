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

/** ユーザーページのうち、タグで絞り込んでいる状態のパス。 */
export const USER_TAG_PATH_PATTERN = /^\/users\/\d+\/(?:artworks|illustrations|manga)\/.+/;

/** モーダルを載せるホスト要素の id。 */
export const HOST_ELEMENT_ID = 'pixivmaster-root';

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
	imageQuality: 'regular',
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
});
