/**
 * 画像の表示とページ切替。
 *
 * ページ一覧は /pages から取る。ここが 404 のときは表示できない作品なので、
 * 呼び出し側が可視判定で先に弾いている前提。(SITE_SPEC §6)
 */
import { getJson } from '../../pixiv/client.js';
import { illustPagesUrl, safeCdnUrl } from '../../pixiv/endpoints.js';
import { createIcon } from '../../common/icons.js';
import { IMAGE_QUALITY } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/**
 * 矢印ボタンの向きごとの見た目。ラベルは文言カタログ (strings.imagePane) から引くため、
 * キー操作の表示とアイコンだけをここに持つ。
 */
const ARROW_SHAPES = Object.freeze({
	prev: Object.freeze({ messageKey: 'PREV_PAGE', key: '←', icon: 'chevronLeft' }),
	next: Object.freeze({ messageKey: 'NEXT_PAGE', key: '→', icon: 'chevronRight' }),
});

/** 開発者向けの失敗理由。画面には出さず warn に渡す。 */
const REASONS = Object.freeze({
	PAGES_EMPTY: '/pages の body にページがありません',
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
 * @property {{open: (pages: object) => void}} [zoom] 原寸表示のレイヤ (zoom.js)。設定がオンのときだけ使う
 * @property {typeof fetch} [fetchImpl] 通信の差し替え。テストから pixiv を叩かないために使う
 * @property {() => HTMLImageElement} [createImage] 先読み用 Image の差し替え。Node には Image が無い
 * @property {object} strings 文言のカタログ (src/i18n)
 */

/**
 * 画像ペインを作る。
 * @param {ImagePaneDeps} deps 依存
 * @returns {{render: (detail: object) => Promise<void>, next: () => void, prev: () => void, dispose: () => void}}
 */
export function createImagePane(deps) {
	const { doc, container, strings } = deps;
	const fetchImpl = deps.fetchImpl;
	const createImage = deps.createImage ?? (() => new Image());

	/** @type {string[]} 表示するページの URL */
	let urls = [];
	/**
	 * @type {string[]} 原寸表示に渡すページの URL。
	 * 設定の解像度が標準でも原寸を出すので、表示用の urls とは別に持つ。
	 * 出どころは同じ /pages の応答なので、これを持っても通信は増えない
	 */
	let originalUrls = [];
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
	/** 画像を押したときのハンドラ (原寸表示)。設定がオフなら付けない。dispose で外すため参照を持つ */
	let onImageClick = null;
	/** 破棄済みか。応答を待っている間に捨てられたときに DOM を触らないようにする */
	let disposed = false;

	/**
	 * 矢印ボタンを作る。
	 * @param {'prev'|'next'} direction 向き
	 * @param {() => void} onClick 押されたとき
	 * @returns {HTMLButtonElement} ボタン
	 */
	function createArrow(direction, onClick) {
		const shape = ARROW_SHAPES[direction];
		const label = strings.imagePane[shape.messageKey];
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = `arrow arrow-${direction}`;
		button.setAttribute('aria-label', label);
		button.title = `${label} (${shape.key})`;
		button.appendChild(createIcon(doc, shape.icon));
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
	 * 原寸表示を開く。
	 * 開いた先でページを送られたら、こちらの表示も合わせる。
	 * (閉じたときに違うページが出ていると、見ていた場所を見失う)
	 * @param {string} alt 画像の代替文言 (作品名)
	 * @returns {void}
	 */
	function openZoom(alt) {
		deps.zoom?.open({
			urls: originalUrls,
			index,
			alt,
			onIndexChange: (next) => {
				index = next;
				paint();
			},
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
		 * ビュワーの状態表示 (.status) は呼び出し側が消してから呼ぶ。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async render(detail) {
			frame = doc.createElement('div');
			frame.className = 'frame';

			image = doc.createElement('img');
			image.alt = detail.title;
			onImageError = () => showPaneError(strings.imagePane.IMAGE_FAILED);
			image.addEventListener('error', onImageError);
			// クリックで原寸表示。設定がオフのときはリスナも付けず、カーソルも変えない
			// (押せそうに見えて何も起きないのが一番まずい)
			if (deps.settings.clickZoom === true) {
				image.className = 'zoomable';
				onImageClick = () => openZoom(detail.title);
				image.addEventListener('click', onImageClick);
			}

			counter = doc.createElement('p');
			counter.className = 'counter';

			prevButton = createArrow('prev', () => move(-1));
			nextButton = createArrow('next', () => move(1));

			frame.append(prevButton, image, nextButton, counter);
			container.appendChild(frame);

			// 1 枚目は詳細に入っている URL で即座に出し、待たせない
			urls = [detail.urls[deps.settings.imageQuality] ?? detail.urls[IMAGE_QUALITY.REGULAR] ?? ''];
			// 原寸が無い作品 (未ログインでは urls.original が落ちる) は標準へ倒す
			originalUrls = [detail.urls[IMAGE_QUALITY.ORIGINAL] ?? detail.urls[IMAGE_QUALITY.REGULAR] ?? ''];
			index = 0;
			paint();

			if (detail.pageCount <= 1) return;

			try {
				const pages = await getJson(illustPagesUrl(detail.id, strings.lang), { fetchImpl });
				if (disposed) return;
				const next = pickPageUrls(pages, deps.settings.imageQuality);
				// body が配列でない応答をそのまま採ると、出ていた 1 枚目が消えて「1/0」になる。
				// 複数枚が開けなかった扱い (1 枚目は残る) に流す
				if (next.length === 0) throw new Error(REASONS.PAGES_EMPTY);
				urls = next;
				originalUrls = pickPageUrls(pages, IMAGE_QUALITY.ORIGINAL);
				paint();
			} catch (error) {
				if (disposed) return;
				// 1 枚目は出ているので、複数枚が開けないことだけを伝える
				showPaneError(strings.imagePane.PAGES_FAILED);
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
			if (image && onImageClick) image.removeEventListener('click', onImageClick);
			if (image) image.src = '';
			// 自分が作った DOM は自分で片付ける。
			// これを外すと、読み込み中に前の作品の矢印とカウンタが残る
			frame?.remove();
			// 読み込み途中の先読みは参照を捨てても転送が続く。src を空にして取り消し、
			// 見ていない作品の分が今見ている作品の取得と帯域を取り合わないようにする (うごイラの abort と同じ理由)
			for (const img of prefetched.values()) img.src = '';
			prefetched.clear();
			image = null;
			shownUrl = null;
			onImageError = null;
			onImageClick = null;
			originalUrls = [];
			counter = null;
			prevButton = null;
			nextButton = null;
			frame = null;
		},
	};
}
