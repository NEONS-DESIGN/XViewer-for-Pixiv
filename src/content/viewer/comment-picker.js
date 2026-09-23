/**
 * コメントに入れる絵文字と貼るスタンプを選ぶパネル。
 *
 * パネルは 1 枚だけ作って使い回す。入力欄 (作品用 + 開いている返信の数) ごとに
 * 作ると、返信を次々に開いたときに同じ内容の DOM が積み上がる。
 * 位置は CSS に任せ、開くときに入力欄の中の差し込み先へ入れる。
 */
import { PIXIV_EMOJI } from '../../pixiv/emoji.js';
import { emojiUrl, stampUrl } from '../../pixiv/endpoints.js';
import { stampIds } from '../../pixiv/stamps.js';
import { activeElementIn, hasFocusWithin } from './focus.js';
import { KEYS } from '../../common/constants.js';

/**
 * タブを移るキー。選ばれていないタブは Tab の巡回から外してあるので、
 * これが無いとキーボードではスタンプのタブへ辿り着けない。(UI_DESIGN_KIT §4.3)
 */
const TAB_KEYS = Object.freeze({ PREV: 'ArrowLeft', NEXT: 'ArrowRight' });

/**
 * 読み上げでタブと中身を結ぶための id。
 * パネルは 1 枚しか作らないので固定値でよい。(Shadow DOM の中なのでページ側とも衝突しない)
 */
const IDS = Object.freeze({
	GRID: 'comment-picker-grid',
	/** タブの id は種別ごと。`comment-picker-tab-emoji` の形になる */
	TAB_PREFIX: 'comment-picker-tab-',
});

/** 下向きに開いたパネルに付ける印。viewer.css が上下を入れ替える。 */
const BELOW_CLASS = 'is-below';

/**
 * 画面の上端との間に残したい余白 (px)。
 * これだけ空けられないなら上には開かない。縁に貼り付くと押しにくく、
 * 端数の丸めで 1px はみ出すこともある。
 */
const EDGE_MARGIN = 4;

/** 中身を切り取る overflow の値。この指定を持つ祖先より外側は見えない。 */
const CLIPPING_OVERFLOW = Object.freeze(['auto', 'scroll', 'hidden', 'clip']);

/**
 * ピッカーを作る。
 * @param {{doc: Document, strings: object}} deps 依存。strings は文言のカタログ (src/i18n)
 * @returns {{open: Function, close: () => void, isOpen: () => boolean, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}} ピッカー
 */
export function createCommentPicker(deps) {
	const { doc, strings } = deps;
	/** タブの種別。 */
	const TABS = Object.freeze([
		{ key: 'emoji', label: strings.commentPicker.EMOJI },
		{ key: 'stamp', label: strings.commentPicker.STAMP },
	]);
	/** @type {HTMLElement|null} パネル本体。最初に開いたときに作って使い回す */
	let panel = null;
	/** @type {HTMLElement|null} 項目を並べる場所 */
	let grid = null;
	/** @type {HTMLElement[]} タブのボタン */
	let tabs = [];
	/** @type {{onEmoji: Function, onStamp: Function}|null} 今開いている入力欄の受け口 */
	let handlers = null;
	/** 今出しているタブ */
	let current = TABS[0].key;
	/** @type {(() => void)|null} 外側のクリックの購読を解く */
	let unwatchOutside = null;
	/** @type {HTMLElement|null} 開いたボタン。閉じるときにフォーカスを返す先 */
	let opener = null;

	/**
	 * 項目を 1 つ作る。
	 * @param {string} className 追加のクラス
	 * @param {string} label 読み上げ用の名前
	 * @param {string|null} url 画像 URL。null なら文字だけ
	 * @param {string} fallback 画像が読めないときに出す文字
	 * @param {() => void} onPick 選ばれたとき
	 * @returns {HTMLButtonElement} 項目
	 */
	function createItem(className, label, url, fallback, onPick) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = `comment-picker-item ${className}`;
		button.setAttribute('aria-label', label);
		if (url) {
			const image = doc.createElement('img');
			image.setAttribute('src', url);
			image.setAttribute('alt', '');
			// 画像が読めなくても何が置かれていたか分かるようにする (一覧側と同じ扱い)
			image.addEventListener('error', () => { image.replaceWith(doc.createTextNode(fallback)); });
			button.appendChild(image);
		} else {
			button.textContent = fallback;
		}
		button.addEventListener('click', onPick);
		return button;
	}

	/**
	 * 今のタブの中身を並べ直す。
	 * @returns {void}
	 */
	function renderGrid() {
		grid.textContent = '';
		grid.dataset.tab = current;
		if (current === 'emoji') {
			for (const [name, id] of Object.entries(PIXIV_EMOJI)) {
				grid.appendChild(createItem('is-emoji', `(${name})`, emojiUrl(id), `(${name})`, () => {
					handlers?.onEmoji(name);
					close();
				}));
			}
			return;
		}
		for (const id of stampIds()) {
			grid.appendChild(createItem('is-stamp', `${strings.commentPicker.STAMP} ${id}`, stampUrl(id), id, () => {
				handlers?.onStamp(id);
				close();
			}));
		}
	}

	/**
	 * タブの見た目を今の状態に合わせる。
	 * @returns {void}
	 */
	function syncTabs() {
		for (const tab of tabs) {
			const selected = tab.dataset.tab === current;
			tab.setAttribute('aria-selected', String(selected));
			// 選ばれていないタブは Tab の巡回から外す (roving tabindex。UI_DESIGN_KIT §4.3)
			tab.setAttribute('tabindex', selected ? '0' : '-1');
			// 中身の見出しは選ばれているタブ。読み上げが「今どちらを見ているか」を言えるようにする
			if (selected) grid.setAttribute('aria-labelledby', `${IDS.TAB_PREFIX}${current}`);
		}
	}

	/**
	 * タブを選び直す。中身も見た目も一度に揃える。
	 * @param {string} key タブの種別 (TABS の key)
	 * @param {boolean} [moveFocus] フォーカスもそのタブへ移すか (左右キーのとき)
	 * @returns {void}
	 */
	function selectTab(key, moveFocus = false) {
		if (current !== key) {
			current = key;
			syncTabs();
			renderGrid();
		}
		if (moveFocus) tabs.find((tab) => tab.dataset.tab === key)?.focus();
	}

	/**
	 * 今フォーカスのあるタブの位置。
	 * @returns {number} タブにフォーカスが無ければ -1
	 */
	function focusedTabIndex() {
		return panel === null ? -1 : tabs.indexOf(activeElementIn(doc, panel));
	}

	/**
	 * 左右キーで隣のタブへ移る。端では折り返す。
	 * @param {KeyboardEvent} event キー
	 * @param {number} at 今フォーカスのあるタブの位置
	 * @returns {boolean} 移したなら true
	 */
	function moveTab(event, at) {
		const step = event.key === TAB_KEYS.NEXT ? 1 : (event.key === TAB_KEYS.PREV ? -1 : 0);
		if (step === 0) return false;
		selectTab(TABS[(at + step + TABS.length) % TABS.length].key, true);
		return true;
	}

	/**
	 * パネルを組み立てる。最初に開くときだけ通る。
	 * @returns {HTMLElement} パネル
	 */
	function buildPanel() {
		const element = doc.createElement('div');
		element.className = 'comment-picker';
		element.setAttribute('role', 'dialog');
		element.setAttribute('aria-label', strings.commentPicker.PANEL);

		const tablist = doc.createElement('div');
		tablist.className = 'comment-picker-tabs';
		tablist.setAttribute('role', 'tablist');
		tabs = TABS.map((one) => {
			const tab = doc.createElement('button');
			tab.type = 'button';
			tab.className = 'comment-picker-tab';
			tab.setAttribute('role', 'tab');
			tab.setAttribute('id', `${IDS.TAB_PREFIX}${one.key}`);
			tab.setAttribute('aria-controls', IDS.GRID);
			tab.dataset.tab = one.key;
			tab.textContent = one.label;
			tab.addEventListener('click', () => { selectTab(one.key); });
			tablist.appendChild(tab);
			return tab;
		});
		element.appendChild(tablist);

		grid = doc.createElement('div');
		grid.className = 'comment-picker-grid';
		// タブの中身であることを読み上げへ伝える。見出しは syncTabs() が選ばれたタブに向ける
		grid.setAttribute('role', 'tabpanel');
		grid.setAttribute('id', IDS.GRID);
		element.appendChild(grid);
		return element;
	}

	/**
	 * パネルが切り取られる上端 (画面座標) を求める。
	 *
	 * 「コメントだけを送る」設定では一覧 (`.comment-scroll`) が `overflow-y: auto` になり、
	 * 画面には入っていてもその領域の外側は見えない。切り取る相手は一番近い
	 * スクロールする祖先で、いなければ画面そのもの (0)。
	 * @returns {number} 上端 (px)
	 */
	function clipTop() {
		const view = doc.defaultView;
		for (let node = panel.parentElement; node; node = node.parentElement) {
			const style = view?.getComputedStyle?.(node);
			if (!style || !CLIPPING_OVERFLOW.includes(style.overflowY)) continue;
			// 測る口が無い相手は無いものとして通り過ぎる (テスト用の DOM)
			if (typeof node.getBoundingClientRect === 'function') return node.getBoundingClientRect().top;
		}
		return 0;
	}

	/**
	 * 上下どちらへ開くかを実際の位置から決める。
	 *
	 * 既定は上。一覧に重なるだけで済み、一覧を押し下げるより読みやすい。
	 * ただし入力欄が上端に貼り付いていると上には収まらず、タブごと外へ出てしまう。
	 * そのときだけ下へ回す。**差し込んだ直後に呼ぶこと**。(文書の中でないと位置を測れない)
	 * @returns {void}
	 */
	function applyDirection() {
		// 前に開いたときの向きは引きずらない。測り直した結果だけで決める
		panel.classList.remove(BELOW_CLASS);
		// テスト用の DOM には測る口が無い。見た目の調整なので黙って既定 (上) のままにする
		if (typeof panel.getBoundingClientRect !== 'function') return;
		// 既定の位置で描いた結果をそのまま読む。入力欄との間隔も高さも計算せずに済む。
		// 上へ出た分は上へスクロールしても戻ってこないので、下へ回すしかない
		if (panel.getBoundingClientRect().top < clipTop() + EDGE_MARGIN) panel.classList.add(BELOW_CLASS);
	}

	/**
	 * 閉じる。パネルは捨てずに差し込み先から外すだけ。
	 * @returns {void}
	 */
	function close() {
		// 項目ごと外すとフォーカスが body へ落ち、Escape がビュワーまで届く。開いたボタンへ返す。
		// パネルの外 (受け口が入力欄へ移したあと等) にあるフォーカスは動かさない
		const returnFocus = panel !== null && opener !== null && hasFocusWithin(doc, panel);
		panel?.remove();
		handlers = null;
		unwatchOutside?.();
		unwatchOutside = null;
		if (returnFocus) opener.focus();
		opener = null;
	}

	return {
		/**
		 * 入力欄の差し込み先に開く。
		 * @param {HTMLElement} slot 差し込み先
		 * @param {{opener?: HTMLElement, onEmoji: (name: string) => void, onStamp: (id: string) => void}} next 選ばれたときの受け口と、閉じるときにフォーカスを返す先
		 * @returns {void}
		 */
		open(slot, next) {
			close();
			panel ??= buildPanel();
			handlers = next;
			opener = next.opener ?? null;
			syncTabs();
			renderGrid();
			slot.appendChild(panel);
			// 向きは開くたびに決め直す。同じ入力欄でもサイドバーを送れば余地は変わる
			applyDirection();
			// 外側を押したら閉じる。捕捉フェーズで受けて、下の要素が反応する前に閉じる
			if (typeof doc.addEventListener === 'function') {
				const onOutside = (event) => {
					// パネルの中の操作では閉じない。項目側が自分で閉じる
					const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
					if (path.includes(panel) || path.includes(slot)) return;
					close();
				};
				doc.addEventListener('pointerdown', onOutside, true);
				unwatchOutside = () => { doc.removeEventListener('pointerdown', onOutside, true); };
			}
		},

		close,

		/**
		 * 開いているか。
		 * @returns {boolean} 開いていれば true
		 */
		isOpen() { return handlers !== null; },

		/**
		 * キー操作を先に使う。開いていなければ何もしない。
		 *
		 * Escape で閉じ、タブにフォーカスがあるときだけ左右キーでタブを移る。
		 * **ビュワーは document の捕捉フェーズで全キーを取っている** ので、タブ側に
		 * keydown を付けても届かない。ここで奪わないと左右キーが作品のページ送りになる。(§10.5)
		 * 本文を書いている最中の左右キー (キャレットの移動) は奪わない。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (handlers === null) return false;
			if (event.key === KEYS.CLOSE) {
				close();
				return true;
			}
			const at = focusedTabIndex();
			return at < 0 ? false : moveTab(event, at);
		},

		/**
		 * 後片付けをする。閉じたうえでパネル自体も手放す。
		 * @returns {void}
		 */
		dispose() {
			close();
			panel = null;
			grid = null;
			tabs = [];
		},
	};
}
