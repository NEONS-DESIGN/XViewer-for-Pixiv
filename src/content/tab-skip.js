/**
 * グリッドのフォーカス順から、作品を開く導線以外を外す。
 *
 * pixiv のカードはフォーカス可能な要素が「サムネイル → ブックマーク → タイトル」の
 * 3 つ並んでいるため、素の Tab では次の作品まで 3 回押すことになる。
 * ここでは掴んだ要素に tabindex="-1" を足して、押す回数を 1 回に戻す。
 * クラス名はビルドごとに変わるので、掴んでよいのは作品リンクとカード内の位置関係だけ。
 */
import {
	ARTWORK_LINK_SELECTOR,
	CARD_SELECTOR,
	CARD_BUTTON_SELECTOR,
	GRID_TAB_SKIP,
	TAB_SKIP_REFRESH_MS,
	TAB_SKIP_MARK_ATTR,
	TAB_SKIP_LABEL_ATTR,
} from '../common/constants.js';
import { warn } from '../common/log.js';

/**
 * カードの中で、フォーカス順から外す要素を選ぶ。
 * 1 本目の作品リンクはサムネイル (作品を開く導線) なので決して外さない。
 * @param {ParentNode} card 作品カード (li)
 * @param {string} mode GRID_TAB_SKIP のいずれか
 * @param {Element[]} [links] カード内の作品リンク。呼び出し側が既に集めていれば渡す (二度引かないため)
 * @returns {Element[]} 外す要素。mode が不明なら空
 */
export function planSkipTargets(card, mode, links = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)]) {
	if (mode !== GRID_TAB_SKIP.BOTH && mode !== GRID_TAB_SKIP.TITLE) return [];
	// 2 本目以降が作品タイトルのリンク。サムネイルと同じ href を指す
	const targets = links.slice(1);
	if (mode === GRID_TAB_SKIP.BOTH) targets.push(...card.querySelectorAll(CARD_BUTTON_SELECTOR));
	return targets;
}

/**
 * サムネイルのリンクが読み上げ名を既に持っているか。
 * 実機の img の alt は作品サマリの alt (「#タグ タイトル - 作者のイラスト」) なので、
 * alt があれば作品名は読み上げられる。(SITE_SPEC §3) そこへ aria-label を足すと alt を上書きし、
 * タグと作者名が読み上げから消える。
 * @param {Element} thumb サムネイルのリンク
 * @returns {boolean} 名前が取れるなら true
 */
function hasAccessibleName(thumb) {
	if (thumb.hasAttribute('aria-label')) return true;
	const alt = thumb.querySelector?.('img')?.getAttribute('alt') ?? '';
	return alt.trim() !== '';
}

/**
 * 増えたノードの下にある作品リンクを集める。ノード自身が作品リンクならそれも含める。
 * 要素でないノード (テキスト等) は querySelectorAll を持たないので空にする。
 * @param {Node} root 増えたノード
 * @returns {Element[]} 作品リンク
 */
function linksUnder(root) {
	if (typeof root?.querySelectorAll !== 'function') return [];
	const links = [...root.querySelectorAll(ARTWORK_LINK_SELECTOR)];
	if (root.matches?.(ARTWORK_LINK_SELECTOR)) links.push(root);
	return links;
}

/**
 * グリッドのフォーカス順を組み替え続ける。
 *
 * 無限スクロールで増えるカードにも当てたいので MutationObserver で追う。
 * グリッドの再描画は数千回走るため、通知そのものでは動かず間隔ごとに 1 回だけ走らせる。
 * 走らせるときも document 全体ではなく、通知で増えたノードの部分木だけを見る。
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
	/** 当て直しを予約中か。schedule が同期で発火する実装でも壊れないよう、timer とは別に持つ */
	let pending = false;
	/** 予約の取り消しに使う ID。0 なら持っていない */
	let timer = 0;
	/** @type {Set<Node>} 予約中に通知で増えたノード。発火したときにまとめて見る */
	const pendingRoots = new Set();

	/**
	 * 1 枚のカードを処理する。
	 * pixiv が既に tabindex や aria-label を持たせている要素には触らない。
	 * @param {ParentNode} card 作品カード
	 * @returns {void}
	 */
	const applyCard = (card) => {
		const links = [...card.querySelectorAll(ARTWORK_LINK_SELECTOR)];
		const targets = planSkipTargets(card, current, links);
		for (const el of targets) {
			if (el.hasAttribute('tabindex')) continue;
			el.setAttribute('tabindex', '-1');
			el.setAttribute(TAB_SKIP_MARK_ATTR, '');
		}
		// タイトルのリンクを飛ばすと、サムネイルに名前が無いカードでは読み上げから作品名が消える。
		// alt が空のときだけ補う (alt があれば作品名は既に読める)
		const [thumb, title] = links;
		if (!thumb || !title || !targets.includes(title)) return;
		if (hasAccessibleName(thumb)) return;
		const name = (title.textContent ?? '').trim();
		if (!name) return;
		thumb.setAttribute('aria-label', name);
		thumb.setAttribute(TAB_SKIP_LABEL_ATTR, '');
	};

	/**
	 * 作品リンクを持つカードへ当てる。
	 * 属性を触るだけなので失敗しない想定だが、落ちるとグリッドの購読ごと巻き込むため受ける。
	 * @param {Node[]} roots 探す起点。初回と setMode では doc 全体、通知では増えたノードだけ
	 * @returns {void}
	 */
	const apply = (roots) => {
		if (current === GRID_TAB_SKIP.NONE) return;
		try {
			const done = new Set();
			for (const root of roots) {
				for (const link of linksUnder(root)) {
					const card = link.closest?.(CARD_SELECTOR);
					// カードが取れない置き方は対象外。掴めないものへ当てにいかない
					if (!card || done.has(card)) continue;
					done.add(card);
					applyCard(card);
				}
			}
		} catch (error) {
			warn('tab skip failed', error);
		}
	};

	/**
	 * 自分が足した分だけ取り除き、pixiv 標準のフォーカス順へ戻す。
	 * @returns {void}
	 */
	const restore = () => {
		try {
			for (const el of doc.querySelectorAll(`[${TAB_SKIP_MARK_ATTR}]`)) {
				el.removeAttribute('tabindex');
				el.removeAttribute(TAB_SKIP_MARK_ATTR);
			}
			for (const el of doc.querySelectorAll(`[${TAB_SKIP_LABEL_ATTR}]`)) {
				el.removeAttribute('aria-label');
				el.removeAttribute(TAB_SKIP_LABEL_ATTR);
			}
		} catch (error) {
			warn('tab skip restore failed', error);
		}
	};

	/**
	 * 予約した当て直し。溜めていたノードを引き取って走る。
	 * @returns {void}
	 */
	const flush = () => {
		pending = false;
		timer = 0;
		const roots = [...pendingRoots];
		pendingRoots.clear();
		apply(roots);
	};

	// 何も外さない設定では予約すら入れない。無限スクロールの再描画ごとに空振りのタイマを積まないため
	const observer = createObserver((records) => {
		if (current === GRID_TAB_SKIP.NONE) return;
		for (const record of records ?? []) {
			for (const node of record.addedNodes ?? []) pendingRoots.add(node);
		}
		if (pending) return;
		pending = true;
		const id = schedule(flush);
		// schedule が同期で発火する実装では flush が先に済んでいる。その ID は取り消す先が無いので持たない
		if (pending) timer = id;
	});
	if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });
	apply([doc]);

	return {
		setMode(next) {
			if (next === current) return;
			// 元へ戻してから当て直す。ブックマークだけ戻すような差分は追わない
			restore();
			current = next;
			apply([doc]);
		},
		dispose() {
			observer.disconnect();
			if (timer) cancel(timer);
			timer = 0;
			pending = false;
			pendingRoots.clear();
			restore();
		},
	};
}
