/**
 * 画面の上部に出す通知。
 * 入れ物を渡せばどこでも使える。今はビュワー (Shadow DOM) の原寸表示が使う。
 * 見た目は notice.css。使う側がその CSS を自分の文書 (または Shadow DOM) に入れる。
 */
import { createIcon } from './icons.js';

/** @typedef {'info'|'progress'|'error'} NoticeKind */
/** @typedef {{id: string, message: string, kind?: NoticeKind, timeoutMs?: number}} NoticeOptions */
/** @typedef {{update: (message: string) => void, dismiss: () => void}} NoticeHandle */

/** 通知の種別。 */
export const NOTICE_KINDS = Object.freeze({ INFO: 'info', PROGRESS: 'progress', ERROR: 'error' });

/** 種別ごとのアイコン。progress は CSS の回る印を使うのでアイコンを持たない。 */
const KIND_ICONS = Object.freeze({ [NOTICE_KINDS.INFO]: 'info', [NOTICE_KINDS.ERROR]: 'error' });

/**
 * 通知の置き場を作る。作った時点では何も出さない。
 * @param {Document} doc 対象のドキュメント
 * @param {HTMLElement} container 通知を重ねる入れ物 (position を持つ要素)
 * @param {{setTimeout?: Function, clearTimeout?: Function}} [deps] テスト用の依存
 * @returns {{show: (options: NoticeOptions) => NoticeHandle, dismiss: (id: string) => void, clear: () => void, dispose: () => void}}
 */
export function createNoticeArea(doc, container, deps = {}) {
	const later = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
	const cancel = deps.clearTimeout ?? ((id) => clearTimeout(id));
	/** @type {HTMLElement|null} */
	let area = null;
	/** @type {Map<string, {el: HTMLElement, text: HTMLElement, timer: number}>} */
	const items = new Map();

	/**
	 * 入れ物を用意する。
	 * @returns {HTMLElement} 入れ物
	 */
	function ensureArea() {
		if (area) return area;
		area = doc.createElement('div');
		area.className = 'notice-area';
		area.setAttribute('role', 'status');
		area.setAttribute('aria-live', 'polite');
		container.appendChild(area);
		return area;
	}

	/**
	 * 1 件消す。空になったら入れ物も外す。
	 * @param {string} id 通知の ID
	 * @returns {void}
	 */
	function dismiss(id) {
		const item = items.get(id);
		if (!item) return;
		if (item.timer) cancel(item.timer);
		item.el.remove();
		items.delete(id);
		if (items.size === 0) {
			area?.remove();
			area = null;
		}
	}

	/**
	 * 出す。同じ ID なら差し替える。
	 * @param {NoticeOptions} options 中身
	 * @returns {NoticeHandle} 後から文言を替える・消すための口
	 */
	function show({ id, message, kind = NOTICE_KINDS.INFO, timeoutMs }) {
		dismiss(id);
		const el = doc.createElement('div');
		el.className = 'notice';
		el.dataset.kind = kind;
		if (kind === NOTICE_KINDS.ERROR) el.setAttribute('role', 'alert');
		if (kind === NOTICE_KINDS.PROGRESS) {
			const spinner = doc.createElement('span');
			spinner.className = 'notice-spinner';
			spinner.setAttribute('aria-hidden', 'true');
			el.appendChild(spinner);
		} else if (KIND_ICONS[kind]) {
			el.appendChild(createIcon(doc, KIND_ICONS[kind]));
		}
		const text = doc.createElement('span');
		text.className = 'notice-text';
		text.textContent = message;
		el.appendChild(text);
		ensureArea().appendChild(el);
		const timer = Number.isFinite(timeoutMs) && timeoutMs > 0 ? later(() => dismiss(id), timeoutMs) : 0;
		const entry = { el, text, timer };
		items.set(id, entry);
		return {
			update(next) {
				if (items.get(id) === entry) text.textContent = next;
			},
			dismiss() {
				if (items.get(id) === entry) dismiss(id);
			},
		};
	}

	/**
	 * 全部消す。
	 * @returns {void}
	 */
	function clear() {
		for (const id of [...items.keys()]) dismiss(id);
	}

	return { show, dismiss, clear, dispose: clear };
}
