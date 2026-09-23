/**
 * コメント区画の採寸。区画の下限 (min-height) と、見出しの「貼り付き」の判定を持つ。
 *
 * コメントの取得・描画・投稿 (comments.js) とは関心が別なので、SPEC §10.11 の指示どおりここへ分けた。
 * 純関数 (`isHeadingStuck` / `commentsFloorHeight`) と、実際の要素を測る
 * `createCommentsLayout()` の 2 層。測る相手 (一覧・スクロール領域・見出し) は
 * comments.js が描き直すたびに変わるので、参照ではなく `parts()` で毎回引く。
 * テスト用の DOM には測る口 (`getBoundingClientRect` / `ResizeObserver`) が無いので、
 * 見た目の調整に過ぎないこの層は黙って何もしない。
 */

/** 見出しと入力欄の入れ物が上端に貼り付いている間だけ付ける印。下に線を引くのに使う。 */
export const STUCK_CLASS = 'is-stuck';

/**
 * 貼り付いたと見なす許容差 (px)。
 * 端数の丸めで 1px 足らずずれることがあり、ちょうど 0 で比べると線が点滅する。
 */
const STUCK_EPSILON = 1;

/**
 * コメント区画を潰してよい下限の件数。
 * 主文がとても長い作品ではサイドバーの高さが足りず、コメント区画が圧縮される。
 * 0 まで潰れると一覧が箱の外へ出てスクロールでも届かなくなるので、この件数は必ず残す。
 */
export const MIN_VISIBLE_COMMENTS = 3;

/**
 * 見出しがスクロール領域の上端に貼り付いているかを判定する。
 * @param {number} headingTop 見出しの上端 (画面座標)。実際に測るのは見出しと入力欄をまとめた入れ物
 * @param {number} scrollportTop スクロール領域の上端 (画面座標)
 * @returns {boolean} 貼り付いていれば true
 */
export function isHeadingStuck(headingTop, scrollportTop) {
	return headingTop - scrollportTop <= STUCK_EPSILON;
}

/**
 * コメント区画を潰してよい下限の高さを求める。
 *
 * 中身が下限より低いときは中身の高さをそのまま返す。
 * 「3 件分」を固定値にすると、中身が 1 件しか無い作品では下に空きができ、
 * 逆に短くしすぎると中身が切れる。どちらも起きないよう実測値から決める。
 * @param {object} sizes 実測値
 * @param {number} sizes.outside 一覧以外の子 (見出し・状態の文言) が使う高さの合計。margin 込み
 * @param {number} sizes.contentHeight 一覧の中身の高さ。一覧が無ければ 0
 * @param {number|null} sizes.nthBottom 残したい件数の最後のコメントの下端。件数が足りなければ null
 * @returns {number} 下限の高さ (px)
 */
export function commentsFloorHeight({ outside, contentHeight, nthBottom }) {
	// 件数が足りないときは中身を全部残す。中身の高さそのものなので空きは出ない
	const listFloor = nthBottom === null ? contentHeight : Math.min(contentHeight, nthBottom);
	return outside + listFloor;
}

/**
 * @typedef {object} CommentsLayoutParts
 * @property {HTMLElement|null} scroll 一覧のスクロール領域 (.comment-scroll)。無ければ null
 * @property {HTMLElement|null} list 一覧 (.comment-list)。無ければ null
 * @property {HTMLElement|null} header 見出しと入力欄をまとめた入れ物 (.comments-header)。無ければ null
 * @property {HTMLButtonElement|null} toTopButton 見出しの右端の「上部へ」。無ければ null
 */

/**
 * @typedef {object} CommentsLayoutDeps
 * @property {Document} doc
 * @property {HTMLElement} container 区画の入れ物 (.comments)。min-height を入れる先
 * @property {HTMLElement|null} scrollTarget 貼り付きの基準になるスクロール領域 (.sidebar)。無ければ貼り付きは見ない
 * @property {() => CommentsLayoutParts} parts 今測る相手。描き直すたびに変わるので毎回引く
 */

/**
 * コメント区画の採寸を作る。
 * @param {CommentsLayoutDeps} deps 依存
 * @returns {{applyFloor: () => void, watchSize: (el: HTMLElement) => void, syncScrollState: () => void, scrollToTop: () => void, watchScroll: () => void, reset: () => void, dispose: () => void}} 採寸の口
 */
export function createCommentsLayout(deps) {
	const { doc, container, scrollTarget, parts } = deps;
	/** @type {ResizeObserver|null} 中身の高さが変わったら下限を測り直す */
	let sizeWatcher = null;
	/** @type {(() => void)|null} scrollTarget の購読を解く */
	let unwatchScroll = null;

	/**
	 * 要素の外側の高さ。(margin 込み)
	 * flex の中では上下の margin が相殺されないので、そのまま足せる。
	 * @param {HTMLElement} el 測る要素
	 * @returns {number} 高さ (px)
	 */
	function outerHeight(el) {
		const height = el.getBoundingClientRect().height;
		const view = doc.defaultView;
		if (!view?.getComputedStyle) return height;
		const style = view.getComputedStyle(el);
		return height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
	}

	/**
	 * MIN_VISIBLE_COMMENTS 件目のコメントの下端が、一覧の上から何 px かを測る。
	 * @param {HTMLElement|null} list 一覧
	 * @param {HTMLElement|null} scroll 一覧のスクロール領域
	 * @returns {number|null} 高さ (px)。件数が足りなければ null
	 */
	function nthCommentBottom(list, scroll) {
		const nth = list?.children?.[MIN_VISIBLE_COMMENTS - 1];
		if (!nth || !scroll) return null;
		// すでに読み進めていても同じ値になるよう scrollTop を足す
		return nth.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top + scroll.scrollTop;
	}

	/**
	 * コメント区画を潰してよい下限を実測して入れる。
	 * 返信の開閉・「もっと見る」・幅の変化で中身の高さが変わるたびに呼ぶ。
	 * @returns {void}
	 */
	function applyFloor() {
		// テスト用の DOM には測る口が無い。見た目の調整なので黙って何もしない
		if (typeof container.getBoundingClientRect !== 'function') return;
		const { scroll, list } = parts();
		let outside = 0;
		for (const child of container.children) {
			if (child !== scroll) outside += outerHeight(child);
		}
		const height = commentsFloorHeight({
			outside,
			contentHeight: scroll ? scroll.scrollHeight : 0,
			nthBottom: nthCommentBottom(list, scroll),
		});
		const next = `${Math.ceil(height)}px`;
		// 同じ値を書くと ResizeObserver が無駄に回る
		if (container.style.minHeight !== next) container.style.minHeight = next;
	}

	/**
	 * 高さが変わりうる要素を見張る。変わったら下限を測り直す。
	 * @param {HTMLElement} el 見張る要素
	 * @returns {void}
	 */
	function watchSize(el) {
		const Observer = doc.defaultView?.ResizeObserver;
		// テスト用の DOM には無い。見張れなくても初回の実測だけは効く
		if (!Observer) return;
		sizeWatcher ??= new Observer(() => { applyFloor(); });
		sizeWatcher.observe(el);
	}

	/**
	 * サイドバーを送るたびに見直す。
	 *
	 * **下の線と「上部へ」は同じ合図で出す。** どちらも「見出しと入力欄が上端に貼り付いた」ことに
	 * 結び付いている: 線はコメントとの境目を示すため、ボタンは投稿文が画面から出た
	 * ことを意味するため。貼り付いていなければ投稿文はまだ見えているので、戻す導線は要らない。
	 * @returns {void}
	 */
	function syncScrollState() {
		const { header, toTopButton } = parts();
		if (!header || !scrollTarget) return;
		// テスト用の DOM には測る口が無い。見た目の調整なので黙って何もしない
		if (typeof header.getBoundingClientRect !== 'function') return;
		if (typeof scrollTarget.getBoundingClientRect !== 'function') return;
		// 文書に入る前は位置が全て 0 で、上端に並んでいると誤判定する
		if (header.isConnected === false) return;
		const stuck = isHeadingStuck(
			header.getBoundingClientRect().top,
			scrollTarget.getBoundingClientRect().top,
		);
		header.classList.toggle(STUCK_CLASS, stuck);
		// 押しても何も起きないボタンは見せない (UI_DESIGN_KIT §6)
		if (toTopButton) toTopButton.hidden = !stuck;
	}

	/**
	 * サイドバーの先頭へ戻す。動きを抑える設定なら一気に戻す。
	 * @returns {void}
	 */
	function scrollToTop() {
		if (!scrollTarget) return;
		const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
		if (typeof scrollTarget.scrollTo === 'function') {
			scrollTarget.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
			return;
		}
		// scrollTo を持たない相手 (古い実装・テスト用の DOM) でも戻せるようにする
		scrollTarget.scrollTop = 0;
	}

	/**
	 * scrollTarget の送りを購読し、貼り付きを見直す。
	 * 購読は reset() / dispose() で必ず解く。前の作品の見出しを見続けないため
	 * @returns {void}
	 */
	function watchScroll() {
		if (!scrollTarget || typeof scrollTarget.addEventListener !== 'function') return;
		unwatchScroll?.();
		const onScroll = () => { syncScrollState(); };
		scrollTarget.addEventListener('scroll', onScroll, { passive: true });
		unwatchScroll = () => { scrollTarget.removeEventListener('scroll', onScroll); };
	}

	/**
	 * 描き直しの前に、前の作品で測った下限と購読を捨てる。
	 * ResizeObserver 自体は次の watchSize() で使い回す。
	 * @returns {void}
	 */
	function reset() {
		sizeWatcher?.disconnect();
		unwatchScroll?.();
		unwatchScroll = null;
		container.style.minHeight = '';
	}

	/**
	 * 片付ける。見張ったままだと、閉じたあとの高さの変化で測りに行って落ちる。
	 * @returns {void}
	 */
	function dispose() {
		sizeWatcher?.disconnect();
		sizeWatcher = null;
		unwatchScroll?.();
		unwatchScroll = null;
	}

	return { applyFloor, watchSize, syncScrollState, scrollToTop, watchScroll, reset, dispose };
}
