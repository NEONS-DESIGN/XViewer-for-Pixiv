/**
 * 画像の表示とページ切替。
 *
 * ページ一覧は /pages から取る。ここが 404 のときは表示できない作品なので、
 * 呼び出し側が可視判定で先に弾いている前提 (SITE_SPEC §6)。
 */
import { getJson } from '../../pixiv/client.js';
import { illustPagesUrl } from '../../pixiv/endpoints.js';
import { createIcon } from '../../common/icons.js';
import { IMAGE_QUALITY } from '../../common/constants.js';

/**
 * ページ配列から表示に使う URL を並べる。
 * 指定した解像度が無い作品もあるので regular へ落とす。
 * @param {Array<{urls: object}>|null} pages /pages の body
 * @param {string} quality IMAGE_QUALITY のいずれか
 * @returns {string[]} ページ順の URL
 */
export function pickPageUrls(pages, quality) {
	if (!Array.isArray(pages)) return [];
	return pages.map((page) => page.urls?.[quality] ?? page.urls?.[IMAGE_QUALITY.REGULAR] ?? '');
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
 * @property {(message: string) => void} onError 失敗を伝える
 */

/**
 * 画像ペインを作る。
 * @param {ImagePaneDeps} deps 依存
 * @returns {{render: (detail: object) => Promise<void>, next: () => void, prev: () => void, dispose: () => void}}
 */
export function createImagePane(deps) {
	const { doc, container } = deps;

	/** @type {string[]} 表示するページの URL */
	let urls = [];
	/** 今見ているページ番号 */
	let index = 0;
	/** 先読み用の Image。参照を持っておかないと解放されて意味がなくなる */
	let prefetched = [];
	/** @type {HTMLImageElement|null} */
	let image = null;
	/** @type {HTMLElement|null} */
	let counter = null;
	/** @type {HTMLButtonElement|null} */
	let prevButton = null;
	/** @type {HTMLButtonElement|null} */
	let nextButton = null;

	/**
	 * 矢印ボタンを作る。
	 * @param {'prev'|'next'} direction 向き
	 * @param {() => void} onClick 押されたとき
	 * @returns {HTMLButtonElement} ボタン
	 */
	function createArrow(direction, onClick) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = `arrow arrow-${direction}`;
		const label = direction === 'prev' ? '前のページ' : '次のページ';
		button.setAttribute('aria-label', label);
		button.title = `${label} (${direction === 'prev' ? '←' : '→'})`;
		button.appendChild(createIcon(doc, direction === 'prev' ? 'chevronLeft' : 'chevronRight'));
		button.addEventListener('click', onClick);
		return button;
	}

	/**
	 * 今のページを描く。
	 * @returns {void}
	 */
	function paint() {
		if (!image) return;
		image.src = urls[index] ?? '';
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
	 * @returns {void}
	 */
	function prefetch() {
		prefetched = prefetchTargets(index, urls.length, deps.settings.prefetch)
			.map((target) => {
				const img = new Image();
				img.src = urls[target];
				return img;
			});
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
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async render(detail) {
			container.querySelectorAll('.status, .frame').forEach((node) => node.remove());

			const frame = doc.createElement('div');
			frame.className = 'frame';

			image = doc.createElement('img');
			image.alt = detail.title;
			image.addEventListener('error', () => deps.onError('画像を読み込めませんでした'));

			counter = doc.createElement('p');
			counter.className = 'counter';

			prevButton = createArrow('prev', () => move(-1));
			nextButton = createArrow('next', () => move(1));

			frame.append(prevButton, image, nextButton, counter);
			container.appendChild(frame);

			// 1 枚目は詳細に入っている URL で即座に出し、待たせない
			urls = [detail.urls[deps.settings.imageQuality] ?? detail.urls.regular ?? ''];
			index = 0;
			paint();

			if (detail.pageCount <= 1) return;

			try {
				const pages = await getJson(illustPagesUrl(detail.id));
				urls = pickPageUrls(pages, deps.settings.imageQuality);
				paint();
			} catch (error) {
				// 1 枚目は出ているので、複数枚が開けないことだけを伝える
				deps.onError('2 枚目以降を読み込めませんでした');
				console.warn('[PixivMaster] failed to load pages', detail.id, error);
			}
		},

		next() { move(1); },
		prev() { move(-1); },

		dispose() {
			prefetched = [];
			image = null;
			counter = null;
			prevButton = null;
			nextButton = null;
		},
	};
}
