/**
 * 画像の表示とページ切替。
 *
 * ページ一覧は /pages から取る。ここが 404 のときは表示できない作品なので、
 * 呼び出し側が可視判定で先に弾いている前提。
 */
import { getJson } from '../../pixiv/client.js';
import { PIXIV_ERROR_KINDS } from '../../pixiv/errors.js';
import { illustPagesUrl, safeCdnUrl } from '../../pixiv/endpoints.js';
import { createIcon } from '../../common/icons.js';
import { assignImageSrc } from '../../common/image-source.js';
import { IMAGE_QUALITY, PREFETCH_RELEASE_MARGIN } from '../../common/constants.js';
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

/** 表示中の画像の fetchPriority。今見ている画像なので優先度を上げる。 */
const SHOWN_IMAGE_PRIORITY = 'high';

/** 先読みの Image の fetchPriority。表示中の画像より後に回す。 */
const PREFETCH_IMAGE_PRIORITY = 'low';

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
 * ページ配列から実寸を並べる。
 * 原寸表示の仮表示を、原寸と同じ大きさへ引き伸ばすために使う。
 * @param {Array<{width?: unknown, height?: unknown}>|null} pages /pages の body
 * @returns {Array<{width: number, height: number}|null>} ページ順の実寸。数値でなければ null
 */
export function pickPageSizes(pages) {
	if (!Array.isArray(pages)) return [];
	return pages.map((page) => {
		const width = page?.width;
		const height = page?.height;
		return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
	});
}

/**
 * 先読みするページ番号を決める。
 * 今見ているページの前後を対象にし、端と自分自身は含めない。
 * 最後に動いた向きの側を先に並べる。(進んでいる方向を優先して取りに行く)
 * @param {number} index 今のページ番号 (0 始まり)
 * @param {number} total 総ページ数
 * @param {number} count 前後それぞれ何枚先読みするか
 * @param {1|-1} [direction] 最後に動いた向き。1 なら次へ、-1 なら前へ
 * @returns {number[]} 先読み対象のページ番号 (進んだ向きの側が先)
 */
export function prefetchTargets(index, total, count, direction = 1) {
	const targets = [];
	for (let offset = 1; offset <= count; offset += 1) {
		const before = index - offset;
		const after = index + offset;
		const ordered = direction > 0 ? [after, before] : [before, after];
		for (const candidate of ordered) {
			if (candidate >= 0 && candidate < total) targets.push(candidate);
		}
	}
	return targets;
}

/**
 * 先読みを手放すページ番号を決める。
 * 現在位置から prefetch + margin より離れたものだけを対象にする純粋関数。
 * 甘めに構えることで、数ページ戻る程度では取り直しの通信が出ないようにする。
 * @param {Array<[number, unknown]>} entries 先読み中の Map の entries (ページ番号, Image)
 * @param {number} index 今のページ番号
 * @param {number} count 前後それぞれ何枚先読みするか
 * @param {number} margin 解放までの余白 (PREFETCH_RELEASE_MARGIN)
 * @returns {number[]} 手放すページ番号
 */
export function releaseTargets(entries, index, count, margin) {
	const threshold = count + margin;
	return entries.filter(([page]) => Math.abs(page - index) > threshold).map(([page]) => page);
}

/**
 * 値を範囲へ収める。
 * @param {number} value 値
 * @param {number} min 下限
 * @param {number} max 上限
 * @returns {number} 収めた値
 */
function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
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
 * @returns {{render: (detail: object) => Promise<void>, next: () => void, prev: () => void,
 *   loadedUrlAt: (index: number) => string | null, dispose: () => void}}
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
	 * @type {number|null} /pages 待ちの間に矢印が押された行き先。
	 * 届いたら index へ反映する。待っていなければ null
	 */
	let pendingIndex = null;
	/**
	 * @type {Array<{width: number, height: number}|null>} 原寸表示の仮表示に渡すページごとの実寸。
	 * /pages が届く前は detail.width / detail.height (1 枚だけ) を使う
	 */
	let pageSizes = [];
	/**
	 * 分母と矢印に使う総ページ数。/pages が届く前は detail.pageCount を使い、
	 * 届いたら実際の urls.length に置き換える。(枚数を先に出すため)
	 */
	let total = 1;
	/** 最後に動いた向き。1 なら次へ、-1 なら前へ。先読みの順に使う */
	let lastDirection = 1;
	/**
	 * @type {Map<number, HTMLImageElement>} 先読み用の Image。ページ番号ごとに 1 つだけ作る。
	 * 参照を持っておかないと解放されて意味がなくなり、作り直すとページ送りのたびに無駄が出る
	 */
	const prefetched = new Map();
	/** /pages の取得を中断するためのもの。dispose() で abort する */
	const aborter = new AbortController();
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
	/**
	 * 表示中の画像の load / error を待って先読みを始めるハンドラ。
	 * 次の schedulePrefetch() と dispose() で外すため参照を持つ
	 */
	let prefetchReadyHandler = null;
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
	 * 表示中の画像の load / error 待ちのリスナーを外す。
	 * @returns {void}
	 */
	function clearPrefetchReadyHandler() {
		if (image && prefetchReadyHandler) {
			image.removeEventListener('load', prefetchReadyHandler);
			image.removeEventListener('error', prefetchReadyHandler);
		}
		prefetchReadyHandler = null;
	}

	/**
	 * 先読みを始めるきっかけを整える。
	 * 表示中の画像が既に読み込みを終えていれば (成功でも失敗でも) すぐに始め、
	 * 読み込み中なら load / error を待つ。1 枚目が /pages より先に失敗した場合、
	 * その後 /pages が届いて同じ URL のまま再描画されても error は再発火しないため、
	 * 「読み終えたか」は naturalWidth を見ず complete だけで判定する。
	 * (偽の DOM で complete を持たない画像は「読み込み中」扱い)
	 * @returns {void}
	 */
	function schedulePrefetch() {
		clearPrefetchReadyHandler();
		if (!image) return;
		if (image.complete) {
			prefetch();
			return;
		}
		prefetchReadyHandler = () => {
			clearPrefetchReadyHandler();
			prefetch();
		};
		image.addEventListener('load', prefetchReadyHandler);
		image.addEventListener('error', prefetchReadyHandler);
	}

	/**
	 * 前後のページを先読みし、離れすぎた分を手放す。
	 * 既に作ったページは作り直さない。CDN 以外を弾かれた空文字は読みに行かない
	 * @returns {void}
	 */
	function prefetch() {
		const count = deps.settings.prefetch;
		for (const target of prefetchTargets(index, total, count, lastDirection)) {
			if (prefetched.has(target)) continue;
			const url = urls[target];
			if (!url) continue;
			const img = createImage();
			img.fetchPriority = PREFETCH_IMAGE_PRIORITY;
			assignImageSrc(img, url);
			prefetched.set(target, img);
		}
		for (const page of releaseTargets([...prefetched.entries()], index, count, PREFETCH_RELEASE_MARGIN)) {
			const img = prefetched.get(page);
			if (img) assignImageSrc(img, '');
			prefetched.delete(page);
		}
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
			assignImageSrc(image, next);
		}
		if (counter) counter.textContent = `${index + 1}/${total}`;
		const single = total <= 1;
		if (prevButton) {
			prevButton.hidden = single;
			prevButton.disabled = index === 0;
		}
		if (nextButton) {
			nextButton.hidden = single;
			nextButton.disabled = index === total - 1;
		}
		schedulePrefetch();
	}

	/**
	 * 指定したページの、読み込みを起こさずに手元にある URL を返す。
	 * 表示中のページは img が読み終えていれば、そうでなければ先読みの Image が
	 * 読み終えていればその URL。無ければ null。(原寸表示の仮表示に使う)
	 * @param {number} i ページ番号
	 * @returns {string|null} 読み終えている URL。無ければ null
	 */
	function loadedUrlAt(i) {
		if (i === index) {
			return image && image.complete && image.naturalWidth > 0 ? shownUrl : null;
		}
		const img = prefetched.get(i);
		return img && img.complete && img.naturalWidth > 0 ? img.src : null;
	}

	/**
	 * 原寸表示を開く。
	 * 開いた先でページを送られたら、こちらの表示も合わせる。
	 * (閉じたときに違うページが出ていると、見ていた場所を見失う)
	 * 解像度の設定が原寸でなければ、手元にある標準画質を仮表示用として渡す。
	 * 通信は増やさない (読み込み済みのものしか渡さない) ので、設定に関わらず渡してよい
	 * @param {string} alt 画像の代替文言 (作品名)
	 * @returns {void}
	 */
	function openZoom(alt) {
		// /pages 待ちの行き先は、原寸表示を開いた時点の index を基準にする。
		// 残したまま /pages が届くと、原寸表示で見ている場所と違うページへ飛ぶ
		pendingIndex = null;
		const showPlaceholder = deps.settings.imageQuality !== IMAGE_QUALITY.ORIGINAL;
		deps.zoom?.open({
			urls: originalUrls,
			index,
			alt,
			placeholderAt: showPlaceholder ? loadedUrlAt : undefined,
			sizes: showPlaceholder ? pageSizes : undefined,
			onIndexChange: (next) => {
				// 先読みの向きを、原寸表示の中で送った向きにも合わせる
				lastDirection = next >= index ? 1 : -1;
				index = next;
				paint();
			},
		});
	}

	/**
	 * ページ番号を動かす。
	 * /pages 待ちの間 (urls.length が total に満たない間) は行き先だけ覚え、
	 * 届いたときに反映する。(枚数を先に出しているので、実際のページはまだ無い)
	 * @param {number} offset 相対位置
	 * @returns {void}
	 */
	function move(offset) {
		const next = index + offset;
		if (next < 0 || next >= total) return;
		lastDirection = offset > 0 ? 1 : -1;
		if (urls.length < total) {
			pendingIndex = next;
			return;
		}
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
			image.fetchPriority = SHOWN_IMAGE_PRIORITY;
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
			// /pages が届く前 (単ページ作品ではずっと) は詳細に入っている実寸を使う
			pageSizes = [Number.isFinite(detail.width) && Number.isFinite(detail.height)
				? { width: detail.width, height: detail.height } : null];
			index = 0;
			pendingIndex = null;
			lastDirection = 1;
			// 分母と矢印は /pages を待たず detail.pageCount で先に出す
			total = Math.max(detail.pageCount, 1);
			paint();

			if (detail.pageCount <= 1) return;

			try {
				const pages = await getJson(illustPagesUrl(detail.id, strings.lang), { fetchImpl, signal: aborter.signal });
				if (disposed) return;
				const next = pickPageUrls(pages, deps.settings.imageQuality);
				// body が配列でない応答をそのまま採ると、出ていた 1 枚目が消えて「1/0」になる。
				// 複数枚が開けなかった扱い (1 枚目は残る) に流す
				if (next.length === 0) throw new Error(REASONS.PAGES_EMPTY);
				urls = next;
				originalUrls = pickPageUrls(pages, IMAGE_QUALITY.ORIGINAL);
				pageSizes = pickPageSizes(pages);
				total = urls.length;
				// /pages を待つ間に押された矢印はここで反映する
				index = clamp(pendingIndex ?? index, 0, urls.length - 1);
				pendingIndex = null;
				paint();
			} catch (error) {
				// disposed の判定だけで中断による失敗も黙る。念のため種別でも確かめる
				if (disposed || error?.kind === PIXIV_ERROR_KINDS.ABORTED) return;
				// 実際に採れたのは 1 枚だけなので、先出ししていた分母を戻す (矢印が消える)
				total = urls.length;
				pendingIndex = null;
				// 1 枚目は出ているので、複数枚が開けないことだけを伝える
				showPaneError(strings.imagePane.PAGES_FAILED);
				warn('failed to load pages', detail.id, error);
				paint();
			}
		},

		next() { move(1); },
		prev() { move(-1); },

		loadedUrlAt,

		dispose() {
			aborter.abort();
			disposed = true;
			// 破棄したあとに古い画像の error が発火して、
			// 新しく描いた画面にエラーを出すのを防ぐ
			clearPrefetchReadyHandler();
			if (image && onImageError) image.removeEventListener('error', onImageError);
			if (image && onImageClick) image.removeEventListener('click', onImageClick);
			if (image) assignImageSrc(image, '');
			// 自分が作った DOM は自分で片付ける。
			// これを外すと、読み込み中に前の作品の矢印とカウンタが残る
			frame?.remove();
			// 読み込み途中の先読みは参照を捨てても転送が続く。src を空にして取り消し、
			// 見ていない作品の分が今見ている作品の取得と帯域を取り合わないようにする
			for (const img of prefetched.values()) assignImageSrc(img, '');
			prefetched.clear();
			image = null;
			shownUrl = null;
			onImageError = null;
			onImageClick = null;
			originalUrls = [];
			pageSizes = [];
			counter = null;
			prevButton = null;
			nextButton = null;
			frame = null;
		},
	};
}
