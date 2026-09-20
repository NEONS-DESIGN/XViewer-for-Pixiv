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
import { KEYS } from '../../common/constants.js';

/** 画面に出す文言。 */
const MESSAGES = Object.freeze({
	EMOJI: '絵文字',
	STAMP: 'スタンプ',
	/** パネル自体の説明。可視の見出しを持たないので付ける */
	PANEL: '絵文字とスタンプ',
});

/** タブの種別。 */
const TABS = Object.freeze([
	{ key: 'emoji', label: MESSAGES.EMOJI },
	{ key: 'stamp', label: MESSAGES.STAMP },
]);

/**
 * ピッカーを作る。
 * @param {{doc: Document}} deps 依存
 * @returns {{open: Function, close: () => void, isOpen: () => boolean, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}} ピッカー
 */
export function createCommentPicker(deps) {
	const { doc } = deps;
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
			grid.appendChild(createItem('is-stamp', `${MESSAGES.STAMP} ${id}`, stampUrl(id), id, () => {
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
			// 選ばれていないタブは Tab の巡回から外す (tablist の作法。UI_DESIGN_KIT §3)
			tab.setAttribute('tabindex', selected ? '0' : '-1');
		}
	}

	/**
	 * パネルを組み立てる。最初に開くときだけ通る。
	 * @returns {HTMLElement} パネル
	 */
	function buildPanel() {
		const element = doc.createElement('div');
		element.className = 'comment-picker';
		element.setAttribute('role', 'dialog');
		element.setAttribute('aria-label', MESSAGES.PANEL);

		const tablist = doc.createElement('div');
		tablist.className = 'comment-picker-tabs';
		tablist.setAttribute('role', 'tablist');
		tabs = TABS.map((one) => {
			const tab = doc.createElement('button');
			tab.type = 'button';
			tab.className = 'comment-picker-tab';
			tab.setAttribute('role', 'tab');
			tab.dataset.tab = one.key;
			tab.textContent = one.label;
			tab.addEventListener('click', () => {
				if (current === one.key) return;
				current = one.key;
				syncTabs();
				renderGrid();
			});
			tablist.appendChild(tab);
			return tab;
		});
		element.appendChild(tablist);

		grid = doc.createElement('div');
		grid.className = 'comment-picker-grid';
		element.appendChild(grid);
		return element;
	}

	/**
	 * 閉じる。パネルは捨てずに差し込み先から外すだけ。
	 * @returns {void}
	 */
	function close() {
		panel?.remove();
		handlers = null;
		unwatchOutside?.();
		unwatchOutside = null;
	}

	return {
		/**
		 * 入力欄の差し込み先に開く。
		 * @param {HTMLElement} slot 差し込み先
		 * @param {{onEmoji: (name: string) => void, onStamp: (id: string) => void}} next 選ばれたときの受け口
		 * @returns {void}
		 */
		open(slot, next) {
			close();
			panel ??= buildPanel();
			handlers = next;
			syncTabs();
			renderGrid();
			slot.appendChild(panel);
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
		 * Escape を食い止める。開いていなければ何もしない。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (event.key !== KEYS.CLOSE) return false;
			if (handlers === null) return false;
			close();
			return true;
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
