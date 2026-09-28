/**
 * 原寸表示のレイヤ。
 *
 * pixiv の作品ページで画像を押したときに出るものと同じ見え方にする。
 * 画像は縮めずに置き、はみ出す分はレイヤ自身をスクロールさせる。
 * ビュワーの overlay 直下に敷くので、サイドバーの上も覆う。
 *
 * ページの番号は持つが、URL を取りに行くのは画像ペイン側の仕事。
 * ここは「渡された URL の並びを原寸で出す」ことだけを担い、通信はしない。
 */
import { KEYS, INERT_ATTRIBUTE } from '../../common/constants.js';
import { createIcon } from '../../common/icons.js';
import { assignImageSrc } from '../../common/image-source.js';
import { createNoticeArea, NOTICE_KINDS } from '../../common/notice.js';

/** 標準画質の仮表示中に出す通知の ID。1 つしか出さないので固定値で足りる。 */
const PREVIEW_NOTICE_ID = 'zoom-preview';

/**
 * 左右のクリック領域の見た目。
 * pixiv 本体は上下 (上 20% が前 / 下 40% が次) に置くが、この拡張では左右に置く。
 * 幅は viewer.css の --zoom-zone-width が持つ。ラベルは文言カタログ (strings.zoom) から引く
 */
const ZONE_SHAPES = Object.freeze({
	prev: Object.freeze({ messageKey: 'PREV_PAGE', key: '←', icon: 'chevronLeft', step: -1 }),
	next: Object.freeze({ messageKey: 'NEXT_PAGE', key: '→', icon: 'chevronRight', step: 1 }),
});

/**
 * 修飾キーが押されているか。
 * Alt+← (ブラウザの「戻る」) を原寸表示が潰さないための判定。navigation.js と同じ扱い。
 * @param {KeyboardEvent} event キー
 * @returns {boolean} Alt / Ctrl / Meta のどれかが押されていれば true
 */
function hasModifier(event) {
	return event.altKey === true || event.ctrlKey === true || event.metaKey === true;
}

/**
 * @typedef {object} ZoomPages 原寸表示に渡すページの指定
 * @property {string[]} urls 原寸の URL (ページ順)
 * @property {number} index 最初に出すページ番号 (0 始まり)
 * @property {string} alt 画像の代替文言 (作品名)
 * @property {(index: number) => void} [onIndexChange] ページが変わったときに呼ばれる
 * @property {(index: number) => string | null} [placeholderAt] 手元にある標準画質の URL。
 *   通信を起こさず読み込み済みのものだけを返す。無ければ仮表示をしない
 * @property {Array<{width: number, height: number} | null>} [sizes] ページごとの実寸。
 *   仮表示を原寸と同じ大きさへ引き伸ばすために使う
 */

/**
 * @typedef {object} ZoomLayerDeps
 * @property {Document} doc 対象のドキュメント
 * @property {HTMLElement} container レイヤを置く先 (ビュワーの overlay)
 * @property {() => void} [restoreFocus] 閉じたときにフォーカスを戻す役
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {() => HTMLImageElement} [createImage] 原寸の読み込み役 (Image) の差し替え。テスト用
 */

/**
 * 原寸表示のレイヤを作る。
 * 生成した時点では何も出さない。open() で初めて組み立てる。
 * @param {ZoomLayerDeps} deps 依存
 * @returns {{open: (pages: ZoomPages) => void, close: () => void, isOpen: () => boolean, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}}
 */
export function createZoomLayer(deps) {
	const { doc, container, strings } = deps;
	const createImage = deps.createImage ?? (() => new Image());
	// container (overlay) 直下に置く。layer (スクロールする .zoom) の中に置くと、
	// ページ送りで一緒に流れて上部に留まらなくなる
	const notices = createNoticeArea(doc, container);

	/** @type {HTMLElement|null} レイヤ本体 (スクロールする器)。閉じているときは null */
	let layer = null;
	/** @type {HTMLElement|null} 画像の入れ物 (.zoom-canvas)。読めないページの文言の置き場 */
	let canvas = null;
	/** @type {HTMLImageElement|null} */
	let image = null;
	/** @type {HTMLElement|null} */
	let counter = null;
	/** @type {Record<string, HTMLButtonElement>} 向きごとのクリック領域 */
	let zones = {};
	/** @type {string[]} 表示するページの URL */
	let urls = [];
	/** 今見ているページ番号 */
	let index = 0;
	/** @type {((index: number) => void)|null} ページが変わったことの通知先 (画像ペイン) */
	let onIndexChange = null;
	/** @type {((index: number) => string | null)|null} 手元にある標準画質の URL。無ければ仮表示をしない */
	let placeholderAt = null;
	/** @type {Array<{width: number, height: number} | null>|null} ページごとの実寸 */
	let sizes = null;
	/** @type {HTMLImageElement|null} 原寸を読み込み中の Image。仮表示をしていない間は null */
	let upgrade = null;
	/** @type {{onLoad: () => void, onError: () => void}|null} upgrade に付けたリスナ。取り消すときに外す */
	let upgradeHandlers = null;
	/** @type {Element[]} 自分が inert を付けた要素。元から付いていた分は触らない */
	let inertTargets = [];

	/**
	 * 背後の部品をフォーカスと読み上げから外す。
	 * 外さないと Tab がサイドバーのボタンへ抜け、押せない部品に輪郭だけが出る。
	 * @returns {void}
	 */
	function lockBehind() {
		inertTargets = [];
		for (const element of Array.from(container.children)) {
			if (element === layer) continue;
			// 通知の入れ物は overlay 直下に置かれる。inert にすると読み上げに届かなくなる
			if (element.classList?.contains('notice-area')) continue;
			if (element.getAttribute(INERT_ATTRIBUTE) !== null) continue;
			element.setAttribute(INERT_ATTRIBUTE, '');
			inertTargets.push(element);
		}
	}

	/**
	 * lockBehind() で付けた inert を外す。
	 * @returns {void}
	 */
	function unlockBehind() {
		for (const element of inertTargets) element.removeAttribute(INERT_ATTRIBUTE);
		inertTargets = [];
	}

	/**
	 * 左右のクリック領域を作る。
	 * 見た目は透明で、専用のカーソルと、ホバー時に薄く出る矢印だけが目印になる。
	 * 読み上げには普通のボタンとして見えるよう aria-label を持たせる。
	 * @param {'prev'|'next'} direction 向き
	 * @returns {HTMLButtonElement} ボタン
	 */
	function createZone(direction) {
		const shape = ZONE_SHAPES[direction];
		const label = strings.zoom[shape.messageKey];
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = `zoom-zone zoom-zone-${direction}`;
		button.setAttribute('aria-label', label);
		button.title = `${label} (${shape.key})`;
		button.appendChild(createIcon(doc, shape.icon));
		button.addEventListener('click', (event) => {
			// レイヤ本体の「押したら閉じる」まで伝わらせない
			event.stopPropagation?.();
			move(shape.step);
		});
		return button;
	}

	/**
	 * 読み込み失敗の文言を画像の入れ物に出す。
	 * URL が空のページ (safeCdnUrl で弾かれた) と、原寸の読み込みに失敗したときの両方で使う。
	 * @returns {void}
	 */
	function showZoomError() {
		if (!layer) return;
		canvas.querySelector('.pane-error')?.remove();
		const line = doc.createElement('p');
		line.className = 'pane-error';
		line.setAttribute('role', 'alert');
		line.textContent = strings.imagePane.IMAGE_FAILED;
		canvas.appendChild(line);
	}

	/**
	 * 仮表示を原寸と同じ大きさへ引き伸ばす。
	 * @param {{width: number, height: number} | null | undefined} size ページの実寸
	 * @returns {void}
	 */
	function applySize(size) {
		if (!size) return;
		image.setAttribute('width', String(size.width));
		image.setAttribute('height', String(size.height));
	}

	/**
	 * applySize() で入れた寸法を外す。原寸を等倍のまま出すため
	 * @returns {void}
	 */
	function clearSize() {
		image.removeAttribute('width');
		image.removeAttribute('height');
	}

	/**
	 * 原寸の読み込みを取り消す。ページを送った・閉じたときに、前のページの分を捨てるために呼ぶ。
	 * 読み込み中でなくても通知だけは消す (呼び出し側で分岐しなくて済むように)
	 * @returns {void}
	 */
	function cancelUpgrade() {
		if (upgrade) {
			assignImageSrc(upgrade, '');
			if (upgradeHandlers) {
				upgrade.removeEventListener('load', upgradeHandlers.onLoad);
				upgrade.removeEventListener('error', upgradeHandlers.onError);
			}
			upgrade = null;
			upgradeHandlers = null;
		}
		notices.dismiss(PREVIEW_NOTICE_ID);
	}

	/**
	 * 原寸の読み込みが終わった (成功でも失敗でも) ときの後片付け。
	 * @returns {void}
	 */
	function finishUpgrade() {
		upgrade = null;
		upgradeHandlers = null;
		notices.dismiss(PREVIEW_NOTICE_ID);
	}

	/**
	 * 今のページを描く。
	 * URL が空のページ (safeCdnUrl で弾かれた) は真っ黒な画面になるだけなので、
	 * 画像ペインの読み込み失敗と同じ文言を画像の入れ物に出す。(1 枚目が空なら open() が開かない)
	 *
	 * 手元に読み込み済みの標準画質があれば (placeholderAt)、先にそれを原寸の大きさで出し、
	 * 裏で原寸を読み込んで届いたら差し替える。通信を増やさないため、手元に無ければ仮表示はしない
	 * @returns {void}
	 */
	function paint() {
		if (!layer) return;
		const url = urls[index] ?? '';
		cancelUpgrade();
		canvas.querySelector('.pane-error')?.remove();
		const placeholder = url ? placeholderAt?.(index) ?? null : null;
		if (placeholder && placeholder !== url) {
			applySize(sizes?.[index] ?? null);
			assignImageSrc(image, placeholder);
			notices.show({ id: PREVIEW_NOTICE_ID, message: strings.zoom.PREVIEW_NOTICE, kind: NOTICE_KINDS.PROGRESS });
			upgrade = createImage();
			const target = index;
			const onLoad = () => {
				if (layer && index === target) {
					assignImageSrc(image, url);
					clearSize();
				}
				finishUpgrade();
			};
			const onError = () => {
				finishUpgrade();
				if (layer && index === target) showZoomError();
			};
			upgradeHandlers = { onLoad, onError };
			upgrade.addEventListener('load', onLoad, { once: true });
			upgrade.addEventListener('error', onError, { once: true });
			assignImageSrc(upgrade, url);
		} else {
			clearSize();
			assignImageSrc(image, url);
		}
		if (!url) showZoomError();
		if (counter) {
			counter.textContent = `${index + 1}/${urls.length}`;
			counter.hidden = urls.length <= 1;
		}
		const single = urls.length <= 1;
		zones.prev.hidden = single;
		zones.prev.disabled = index === 0;
		zones.next.hidden = single;
		zones.next.disabled = index === urls.length - 1;
	}

	/**
	 * ページ番号を動かす。
	 * 送ったら見ている場所を先頭へ戻す。原寸では前のページの読み終わりの位置に
	 * 留まっても、次のページの同じ場所が見たい場所とは限らない。(pixiv 本体も戻す)
	 * @param {number} offset 相対位置
	 * @returns {void}
	 */
	function move(offset) {
		const next = index + offset;
		if (!layer || next < 0 || next >= urls.length) return;
		index = next;
		paint();
		layer.scrollTop = 0;
		layer.scrollLeft = 0;
		onIndexChange?.(index);
	}

	/**
	 * 閉じる。開いていなければ何もしない。
	 * @returns {void}
	 */
	function close() {
		if (!layer) return;
		unlockBehind();
		cancelUpgrade();
		notices.clear();
		// 破棄したあとに読み込みが続かないようにしてから外す
		assignImageSrc(image, '');
		layer.remove();
		layer = null;
		canvas = null;
		image = null;
		counter = null;
		zones = {};
		urls = [];
		index = 0;
		onIndexChange = null;
		placeholderAt = null;
		sizes = null;
		deps.restoreFocus?.();
	}

	return {
		/**
		 * 原寸表示を開く。
		 * 既に開いていれば組み立て直す。(作品やページの指定が変わっているため)
		 * @param {ZoomPages} pages ページの指定
		 * @returns {void}
		 */
		open(pages) {
			close();
			const list = Array.isArray(pages?.urls) ? pages.urls : [];
			const start = Math.min(Math.max(pages?.index ?? 0, 0), Math.max(list.length - 1, 0));
			// 出す物が無いのに開くと、真っ黒な画面から抜けられない人が出る
			if (!list[start]) return;

			urls = list;
			index = start;
			onIndexChange = typeof pages.onIndexChange === 'function' ? pages.onIndexChange : null;
			placeholderAt = typeof pages.placeholderAt === 'function' ? pages.placeholderAt : null;
			sizes = Array.isArray(pages.sizes) ? pages.sizes : null;

			layer = doc.createElement('div');
			layer.className = 'zoom';
			// 中にフォーカスを入れる受け皿。Tab の巡回先にはしない (overlay と同じ扱い)
			layer.setAttribute('tabindex', '-1');
			layer.setAttribute('role', 'dialog');
			layer.setAttribute('aria-modal', 'true');
			layer.setAttribute('aria-label', `${pages.alt ?? ''} - ${strings.zoom.LABEL}`.trim());

			canvas = doc.createElement('div');
			canvas.className = 'zoom-canvas';

			image = doc.createElement('img');
			image.className = 'zoom-image';
			image.setAttribute('alt', pages.alt ?? '');
			canvas.appendChild(image);

			zones = { prev: createZone('prev'), next: createZone('next') };

			counter = doc.createElement('p');
			counter.className = 'zoom-counter';

			layer.append(canvas, zones.prev, zones.next, counter);
			// 画像の上でも余白でも、クリック領域以外を押したら閉じる (pixiv 本体と同じ)
			layer.addEventListener('click', () => close());
			container.appendChild(layer);
			lockBehind();
			paint();
			layer.focus?.();
		},

		close,

		isOpen() {
			return layer !== null;
		},

		/**
		 * キー操作を先に使う。
		 * 使ったら true を返し、ビュワー本体は反応してはいけない。
		 * 上下 (作品の移動) だけは閉じてから本体へ渡す。原寸のまま作品を移ると、
		 * 次の作品の原寸画像を開くたびに読み込むことになる。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 使ったなら true
		 */
		consumeKey(event) {
			if (!layer) return false;
			if (event.isComposing === true) return false;
			if (event.key === KEYS.CLOSE) {
				close();
				return true;
			}
			if (hasModifier(event)) return false;
			if (event.key === KEYS.NEXT_PAGE) {
				move(1);
				return true;
			}
			if (event.key === KEYS.PREV_PAGE) {
				move(-1);
				return true;
			}
			if (event.key === KEYS.NEXT_WORK || event.key === KEYS.PREV_WORK) {
				close();
				return false;
			}
			return false;
		},

		// close と同じ。ビュワーの片付けの作法に合わせた別名
		dispose: close,
	};
}
