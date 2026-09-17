/**
 * 画像の表示とページ切替。
 *
 * ページ一覧は /pages から取る。ここが 404 のときは表示できない作品なので、
 * 呼び出し側が可視判定で先に弾いている前提 (SITE_SPEC §6)。
 */
import { getJson } from '../../pixiv/client.js';
import { illustPagesUrl, safeCdnUrl } from '../../pixiv/endpoints.js';
import { createIcon } from '../../common/icons.js';
import { IMAGE_QUALITY } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/** 画面に出す文言。 */
const MESSAGES = Object.freeze({
	PREV_PAGE: '前のページ',
	NEXT_PAGE: '次のページ',
	IMAGE_FAILED: '画像を読み込めませんでした',
	PAGES_FAILED: '2 枚目以降を読み込めませんでした',
});

/** 矢印ボタンの向きごとの定義。ツールチップにキー操作を添える。 */
const ARROWS = Object.freeze({
	prev: Object.freeze({ label: MESSAGES.PREV_PAGE, key: '←', icon: 'chevronLeft' }),
	next: Object.freeze({ label: MESSAGES.NEXT_PAGE, key: '→', icon: 'chevronRight' }),
});

/**
 * ページ配列から表示に使う URL を並べる。
 * 指定した解像度が無い作品もあるので regular へ落とす。
 * 応答の値はそのまま img の src になるので、CDN を指すものだけを通す。
 * @param {Array<{urls: object}>|null} pages /pages の body
 * @param {string} quality IMAGE_QUALITY のいずれか
 * @returns {string[]} ページ順の URL
 */
export function pickPageUrls(pages, quality) {
	if (!Array.isArray(pages)) return [];
	return pages.map((page) => safeCdnUrl(page.urls?.[quality] ?? page.urls?.[IMAGE_QUALITY.REGULAR]) ?? '');
}

/**
 * 先読みするページ番号を決める。
 * 今見ているページの前後を対象にし、端と自分自身は含めない。
 * @param {number} index 今のページ番号 (0 始まり)
 * @param {number} total 総ページ数
 * @param {number} count 前後それぞれ何枚先読みするか
 * @returns {number[]} 先読み対象のページ番号
 */
export function prefetchTargets(index, total, count) {
	const targets = [];
	for (let offset = 1; offset <= count; offset += 1) {
		const before = index - offset;
		const after = index + offset;
		if (before >= 0) targets.push(before);
		if (after < total) targets.push(after);
	}
	return targets;
}

/**
 * @typedef {object} ImagePaneDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先 (.stage)
 * @property {object} settings 設定
 * @property {typeof fetch} [fetchImpl] 通信の差し替え。テストから pixiv を叩かないために使う
 * @property {() => HTMLImageElement} [createImage] 先読み用 Image の差し替え。Node には Image が無い
 */

/**
 * 画像ペインを作る。
 * @param {ImagePaneDeps} deps 依存
 * @returns {{render: (detail: object) => Promise<void>, next: () => void, prev: () => void, dispose: () => void}}
 */
export function createImagePane(deps) {
	const { doc, container } = deps;
	const fetchImpl = deps.fetchImpl;
	const createImage = deps.createImage ?? (() => new Image());

	/** @type {string[]} 表示するページの URL */
	let urls = [];
	/** 今見ているページ番号 */
	let index = 0;
	/**
	 * @type {Map<string, HTMLImageElement>} 先読み用の Image。URL ごとに 1 つだけ作る。
	 * 参照を持っておかないと解放されて意味がなくなり、作り直すとページ送りのたびに無駄が出る
	 */
	const prefetched = new Map();
	/** @type {HTMLImageElement|null} */
	let image = null;
	/** 今 img に入れている URL。同じ値を書き直して再デコードさせないために覚える */
	let shownUrl = null;
	/** @type {HTMLElement|null} */
	let counter = null;
	/** @type {HTMLButtonElement|null} */
	let prevButton = null;
	/** @type {HTMLButtonElement|null} */
	let nextButton = null;
	/** @type {HTMLElement|null} 自分が作った枠。エラー行の置き場 */
	let frame = null;
	/** 画像の読み込み失敗ハンドラ。dispose で外すため参照を持つ */
	let onImageError = null;
	/** 破棄済みか。応答を待っている間に捨てられたときに DOM を触らないようにする */
	let disposed = false;

	/**
	 * 矢印ボタンを作る。
	 * @param {'prev'|'next'} direction 向き
	 * @param {() => void} onClick 押されたとき
	 * @returns {HTMLButtonElement} ボタン
	 */
	function createArrow(direction, onClick) {
		const arrow = ARROWS[direction];
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = `arrow arrow-${direction}`;
		button.setAttribute('aria-label', arrow.label);
		button.title = `${arrow.label} (${arrow.key})`;
		button.appendChild(createIcon(doc, arrow.icon));
		button.addEventListener('click', onClick);
		return button;
	}

	/**
	 * ペインの中にエラー行を出す。
	 * 共有の状態表示を使うと既に見えている画像まで消えてしまうため、自分の枠の中に出す。
	 * @param {string} message 文言
	 * @returns {void}
	 */
	function showPaneError(message) {
		if (disposed || !frame) return;
		frame.querySelector('.pane-error')?.remove();
		const line = doc.createElement('p');
		line.className = 'pane-error';
		line.setAttribute('role', 'alert');
		line.textContent = message;
		frame.appendChild(line);
	}

	/**
	 * 今のページを描く。
	 * @returns {void}
	 */
	function paint() {
		if (disposed || !image) return;
		const next = urls[index] ?? '';
		// 同じ URL を書き直すと img が読み込みをやり直す。/pages が届いたときの 1 枚目がこれに当たる。
		// エラー行も、ページが変わったときだけ消す (1 枚目の失敗の理由を /pages の到着で消さない)
		if (next !== shownUrl) {
			shownUrl = next;
			frame?.querySelector('.pane-error')?.remove();
			image.src = next;
		}
		if (counter) counter.textContent = `${index + 1}/${urls.length}`;
		const single = urls.length <= 1;
		if (prevButton) {
			prevButton.hidden = single;
			prevButton.disabled = index === 0;
		}
		if (nextButton) {
			nextButton.hidden = single;
			nextButton.disabled = index === urls.length - 1;
		}
		prefetch();
	}

	/**
	 * 前後のページを先読みする。
	 * 既に作った URL は作り直さない。CDN 以外を弾かれた空文字は読みに行かない
	 * @returns {void}
	 */
	function prefetch() {
		for (const target of prefetchTargets(index, urls.length, deps.settings.prefetch)) {
			const url = urls[target];
			if (!url || prefetched.has(url)) continue;
			const img = createImage();
			img.src = url;
			prefetched.set(url, img);
		}
	}

	/**
	 * ページ番号を動かす。
	 * @param {number} offset 相対位置
	 * @returns {void}
	 */
	function move(offset) {
		const next = index + offset;
		if (next < 0 || next >= urls.length) return;
		index = next;
		paint();
	}

	return {
		/**
		 * 作品を描画する。
		 * ビュワーの状態表示 (.status) は呼び出し側が消してから呼ぶ。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async render(detail) {
			frame = doc.createElement('div');
			frame.className = 'frame';

			image = doc.createElement('img');
			image.alt = detail.title;
			onImageError = () => showPaneError(MESSAGES.IMAGE_FAILED);
			image.addEventListener('error', onImageError);

			counter = doc.createElement('p');
			counter.className = 'counter';

			prevButton = createArrow('prev', () => move(-1));
			nextButton = createArrow('next', () => move(1));

			frame.append(prevButton, image, nextButton, counter);
			container.appendChild(frame);

			// 1 枚目は詳細に入っている URL で即座に出し、待たせない
			urls = [detail.urls[deps.settings.imageQuality] ?? detail.urls[IMAGE_QUALITY.REGULAR] ?? ''];
			index = 0;
			paint();

			if (detail.pageCount <= 1) return;

			try {
				const pages = await getJson(illustPagesUrl(detail.id), { fetchImpl });
				if (disposed) return;
				urls = pickPageUrls(pages, deps.settings.imageQuality);
				paint();
			} catch (error) {
				if (disposed) return;
				// 1 枚目は出ているので、複数枚が開けないことだけを伝える
				showPaneError(MESSAGES.PAGES_FAILED);
				warn('failed to load pages', detail.id, error);
			}
		},

		next() { move(1); },
		prev() { move(-1); },

		dispose() {
			disposed = true;
			// 破棄したあとに古い画像の error が発火して、
			// 新しく描いた画面にエラーを出すのを防ぐ
			if (image && onImageError) image.removeEventListener('error', onImageError);
			if (image) image.src = '';
			// 自分が作った DOM は自分で片付ける。
			// これを外すと、読み込み中に前の作品の矢印とカウンタが残る
			frame?.remove();
			prefetched.clear();
			image = null;
			shownUrl = null;
			onImageError = null;
			counter = null;
			prevButton = null;
			nextButton = null;
			frame = null;
		},
	};
}
