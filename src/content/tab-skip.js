/**
 * グリッドのフォーカス順から、作品を開く導線以外を外す。
 *
 * pixiv のカードはフォーカス可能な要素が「サムネイル → ブックマーク → タイトル」の
 * 3 つ並んでいるため、素の Tab では次の作品まで 3 回押すことになる。
 * ここでは掴んだ要素に tabindex="-1" を足して、押す回数を 1 回に戻す。
 * クラス名はビルドごとに変わるので、掴んでよいのは作品リンクとカード内の位置関係だけ。
 */
import { ARTWORK_LINK_SELECTOR, GRID_TAB_SKIP, TAB_SKIP_REFRESH_MS } from '../common/constants.js';

/** カードの中でブックマークボタンを指すセレクタ。カード内の button は 1 個だけ (実測)。 */
const CARD_BUTTON_SELECTOR = 'button';

/** 作品カードを指すセレクタ。pixiv のグリッドは 1 作品 = 1 個の li (実測)。 */
const CARD_SELECTOR = 'li';

/** 自分が tabindex を足した目印。これが付いた要素だけを元へ戻す。 */
const MARK_TABINDEX = 'data-pm-tabskip';

/** 自分が aria-label を足した目印。 */
const MARK_LABEL = 'data-pm-label';

/**
 * カードの中で、フォーカス順から外す要素を選ぶ。
 * 1 本目の作品リンクはサムネイル (作品を開く導線) なので決して外さない。
 * @param {ParentNode} card 作品カード (li)
 * @param {string} mode GRID_TAB_SKIP のいずれか
 * @returns {Element[]} 外す要素。mode が不明なら空
 */
export function planSkipTargets(card, mode) {
	if (mode !== GRID_TAB_SKIP.BOTH && mode !== GRID_TAB_SKIP.TITLE) return [];
	// 2 本目以降が作品タイトルのリンク。サムネイルと同じ href を指す
	const targets = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)].slice(1);
	if (mode === GRID_TAB_SKIP.BOTH) targets.push(...card.querySelectorAll(CARD_BUTTON_SELECTOR));
	return targets;
}

/**
 * グリッドのフォーカス順を組み替え続ける。
 *
 * 無限スクロールで増えるカードにも当てたいので MutationObserver で追う。
 * グリッドの再描画は数千回走るため、通知そのものでは動かず間隔ごとに 1 回だけ走らせる。
 * @param {Document} doc 対象のドキュメント
 * @param {string} mode GRID_TAB_SKIP のいずれか
 * @param {{createObserver?: Function, schedule?: Function, cancel?: Function}} [deps] テスト用の依存
 * @returns {{setMode: (mode: string) => void, dispose: () => void}} 解除と切り替え
 */
export function attachTabSkip(doc, mode, deps = {}) {
	const createObserver = deps.createObserver ?? ((fn) => new globalThis.MutationObserver(fn));
	const schedule = deps.schedule ?? ((fn) => setTimeout(fn, TAB_SKIP_REFRESH_MS));
	const cancel = deps.cancel ?? ((id) => clearTimeout(id));

	let current = mode;
	let timer = 0;
	let pending = false;

	/**
	 * 1 枚のカードを処理する。
	 * pixiv が既に tabindex や aria-label を持たせている要素には触らない。
	 * @param {ParentNode} card 作品カード
	 * @returns {void}
	 */
	const applyCard = (card) => {
		const targets = planSkipTargets(card, current);
		for (const el of targets) {
			if (el.hasAttribute('tabindex')) continue;
			el.setAttribute('tabindex', '-1');
			el.setAttribute(MARK_TABINDEX, '');
		}
		// タイトルのリンクを飛ばすと読み上げから作品名が消えるので、サムネイル側へ移す
		const links = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)];
		const [thumb, title] = links;
		if (!thumb || !title || !targets.includes(title)) return;
		const name = (title.textContent ?? '').trim();
		if (!name || thumb.hasAttribute('aria-label')) return;
		thumb.setAttribute('aria-label', name);
		thumb.setAttribute(MARK_LABEL, '');
	};

	/**
	 * 今ある全カードへ当てる。
	 * 属性を触るだけなので失敗しない想定だが、落ちるとグリッドの購読ごと巻き込むため受ける。
	 * @returns {void}
	 */
	const apply = () => {
		if (current === GRID_TAB_SKIP.NONE) return;
		try {
			const done = new Set();
			for (const link of doc.querySelectorAll(ARTWORK_LINK_SELECTOR)) {
				const card = link.closest?.(CARD_SELECTOR);
				// カードが取れない置き方は対象外。掴めないものへ当てにいかない
				if (!card || done.has(card)) continue;
				done.add(card);
				applyCard(card);
			}
		} catch (error) {
			console.warn('[PixivMaster] tab skip failed', error);
		}
	};

	/**
	 * 自分が足した分だけ取り除き、pixiv 標準のフォーカス順へ戻す。
	 * @returns {void}
	 */
	const restore = () => {
		try {
			for (const el of doc.querySelectorAll(`[${MARK_TABINDEX}]`)) {
				el.removeAttribute('tabindex');
				el.removeAttribute(MARK_TABINDEX);
			}
			for (const el of doc.querySelectorAll(`[${MARK_LABEL}]`)) {
				el.removeAttribute('aria-label');
				el.removeAttribute(MARK_LABEL);
			}
		} catch (error) {
			console.warn('[PixivMaster] tab skip restore failed', error);
		}
	};

	const observer = createObserver(() => {
		if (pending) return;
		pending = true;
		timer = schedule(() => {
			pending = false;
			apply();
		});
	});
	if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });
	apply();

	return {
		setMode(next) {
			if (next === current) return;
			// 元へ戻してから当て直す。ブックマークだけ戻すような差分は追わない
			restore();
			current = next;
			apply();
		},
		dispose() {
			observer.disconnect();
			if (timer) cancel(timer);
			timer = 0;
			pending = false;
			restore();
		},
	};
}
