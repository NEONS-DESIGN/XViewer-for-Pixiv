/**
 * pixiv の作品カード (li) を模した偽 DOM。
 * 実測した形 (SITE_SPEC §3) に合わせてある:
 *   li > div > [ div > div[width] > [a.thumbnail_link > [div > div[radius] > img|figure, div(overlay)],
 *                                    div > div[bookmark_button] > button > svg > path x2],
 *                div > a(title) ]
 * dom.js の findAll は属性セレクタを解さないので、ここでは属性まで見る簡易セレクタを持つ。
 */
import { TAB_SKIP_MARK_ATTR, TAB_SKIP_LABEL_ATTR } from '../../src/common/constants.js';

/**
 * 要素の代わりを作る。cloneNode と closest を持つ。
 * @param {string} tag タグ名 (小文字)
 * @param {Record<string, string>} [attrs] 属性
 * @returns {object} 要素の代わり
 */
export function el(tag, attrs = {}) {
	let text = '';
	/** @type {Map<string, Function[]>} 種類ごとの購読者 */
	const listeners = new Map();
	const node = {
		tag,
		tagName: tag.toUpperCase(),
		children: [],
		parent: null,
		attributes: { ...attrs },
		style: {
			values: {},
			setProperty(name, value) { this.values[name] = value; },
			removeProperty(name) { delete this.values[name]; },
		},
		appendChild(child) { child.parent = node; node.children.push(child); return child; },
		append(...nodes) { for (const one of nodes) node.appendChild(one); },
		// 本物と同じく、参照ノードが null なら末尾、子でなければ投げる
		insertBefore(child, reference) {
			if (reference === null || reference === undefined) return node.appendChild(child);
			const index = node.children.indexOf(reference);
			if (index < 0) throw new Error('insertBefore: reference node is not a child');
			child.parent = node;
			node.children.splice(index, 0, child);
			return child;
		},
		addEventListener(type, handler) {
			if (!listeners.has(type)) listeners.set(type, []);
			listeners.get(type).push(handler);
		},
		removeEventListener(type, handler) {
			listeners.set(type, (listeners.get(type) ?? []).filter((one) => one !== handler));
		},
		/**
		 * 購読者を呼ぶ。
		 * 本物は真偽値を返すが、ここでは**最後の購読者の戻り値**を返す。
		 * 非同期の購読者をテストから await できるようにするための、意図した差。
		 * @param {{type: string}} event 出来事
		 * @returns {*} 最後の購読者の戻り値
		 */
		dispatchEvent(event) {
			let result;
			for (const handler of [...(listeners.get(event.type) ?? [])]) result = handler({ target: node, ...event });
			return result;
		},
		/**
		 * 押す。dispatchEvent と同じく購読者の戻り値を返す (本物は undefined)。
		 * @returns {*} 購読者の戻り値
		 */
		click() { return node.dispatchEvent({ type: 'click' }); },
		/**
		 * 出来事を起こし、自分から祖先 (最後に ownerDocument) へ向けて購読者を呼ぶ。
		 * capture と bubble の順序は区別しない (拡張は capture でしか購読しないため)。
		 * 戻り値は最後に値を返した購読者のもの。非同期の購読者をテストから await するために返す。
		 * @param {string} type 出来事の種類
		 * @param {object} [init] 出来事に足す値 (shiftKey や preventDefault など)
		 * @returns {*} 最後に値を返した購読者の戻り値
		 */
		dispatch(type, init = {}) {
			// target は最初に押されたノードで固定する。init より後ろに置かないと、
			// dispatchEvent が階層ごとに自分へ差し替えてしまう
			const event = { ...init, type, target: init.target ?? node };
			let result;
			let current = node;
			while (current) {
				const returned = current.dispatchEvent?.(event);
				if (returned !== undefined) result = returned;
				current = current.parent ?? current.ownerDocument ?? null;
			}
			return result;
		},
		remove() {
			if (!node.parent) return;
			node.parent.children = node.parent.children.filter((one) => one !== node);
			node.parent = null;
		},
		setAttribute(name, value) { node.attributes[name] = String(value); },
		getAttribute(name) { return node.attributes[name] ?? null; },
		hasAttribute(name) { return name in node.attributes; },
		removeAttribute(name) { delete node.attributes[name]; },
		closest(selector) {
			let current = node;
			while (current) {
				if (matches(current, selector)) return current;
				current = current.parent;
			}
			return null;
		},
		querySelector(selector) { return descendants(node).find((one) => matches(one, selector)) ?? null; },
		querySelectorAll(selector) { return descendants(node).filter((one) => matches(one, selector)); },
		cloneNode() {
			const copy = el(tag, { ...node.attributes });
			copy.style.values = { ...node.style.values };
			if (node.children.length === 0) copy.textContent = text;
			for (const child of node.children) copy.appendChild(child.cloneNode(true));
			return copy;
		},
	};
	// 本物と同じ名前で親を引けるようにする。src 側が偽物の parent を知らずに済む
	Object.defineProperty(node, 'parentElement', {
		get() { return node.parent; },
	});
	Object.defineProperty(node, 'nextSibling', {
		get() {
			if (!node.parent) return null;
			return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null;
		},
	});
	Object.defineProperty(node, 'textContent', {
		get() { return node.children.length === 0 ? text : node.children.map((one) => one.textContent).join(''); },
		set(value) { text = value; node.children = []; },
	});
	return node;
}

/**
 * 子孫を文書順に集める。
 * @param {object} root 起点
 * @returns {object[]} 子孫
 */
function descendants(root) {
	const found = [];
	const walk = (node) => {
		for (const child of node.children) {
			found.push(child);
			walk(child);
		}
	};
	walk(root);
	return found;
}

/**
 * タグ名と属性だけを見る簡易セレクタ。
 * 'a[href^="/artworks/"]' / '[data-ga4-label="bookmark_button"]' / 'li' / 'img' を解する。
 * @param {object} node 要素
 * @param {string} selector セレクタ
 * @returns {boolean} 合えば true
 */
function matches(node, selector) {
	const parsed = /^([a-z]*)(?:\[([\w-]+)(?:([~^$*]?=)"([^"]*)")?\])?$/.exec(selector.trim());
	if (!parsed) return false;
	const [, tag, name, op, value] = parsed;
	if (tag && node.tag !== tag) return false;
	if (!name) return true;
	const actual = node.getAttribute(name);
	if (actual === null) return false;
	if (!op) return true;
	if (op === '^=') return actual.startsWith(value);
	if (op === '*=') return actual.includes(value);
	return actual === value;
}

/**
 * 作品カード 1 枚を組む。
 * @param {{id?: string, userId?: string, title?: string, pages?: number, loaded?: boolean,
 *   bookmarked?: boolean, tabSkipped?: boolean, heart?: boolean}} [options] カードの内容。
 *   heart: false でブックマークボタンごと落とす (自分のユーザーページ。SITE_SPEC §4)
 * @returns {object} li の代わり
 */
export function makeCard(options = {}) {
	const {
		id = '100', userId = '9', title = '作品', pages = 1,
		loaded = true, bookmarked = false, tabSkipped = true, heart = true,
	} = options;
	const li = el('li');
	const outer = li.appendChild(el('div'));
	const thumbBox = outer.appendChild(el('div'));
	const sized = thumbBox.appendChild(el('div', { width: '184', height: '184' }));

	const thumb = sized.appendChild(el('a', {
		href: `/artworks/${id}`,
		'data-ga4-label': 'thumbnail_link',
		'data-gtm-value': id,
		'data-gtm-user-id': userId,
		...(tabSkipped ? { 'aria-label': title, [TAB_SKIP_LABEL_ATTR]: '' } : {}),
	}));
	const imgBox = thumb.appendChild(el('div')).appendChild(el('div', { radius: '4' }));
	imgBox.appendChild(loaded
		? el('img', { src: `https://i.pximg.net/${id}.jpg`, alt: `#タグ ${title}`, class: 'sc-x' })
		: el('figure'));

	const overlay = thumb.appendChild(el('div'));
	overlay.appendChild(el('div'));
	if (pages > 1) {
		const badge = overlay.appendChild(el('div'));
		const inner = badge.appendChild(el('div'));
		// バッジのアイコンも path を持つ。ハートを塗る処理がここまで塗らないことを見られるようにする
		inner.appendChild(el('svg')).appendChild(el('path', { 'data-fill': 'rgb(255, 255, 255)' }));
		const count = inner.appendChild(el('span'));
		count.textContent = String(pages);
	}

	// 自分の作品には pixiv がブックマークボタンを描かない (SITE_SPEC §4)
	if (heart) {
		const heartBox = thumbBox.appendChild(el('div')).appendChild(el('div', { 'data-ga4-label': 'bookmark_button' }));
		const button = heartBox.appendChild(el('button', {
			type: 'button',
			...(tabSkipped ? { tabindex: '-1', [TAB_SKIP_MARK_ATTR]: '' } : {}),
		}));
		const svg = button.appendChild(el('svg'));
		const fills = bookmarked ? ['rgb(255, 64, 96)', 'rgb(255, 64, 96)'] : ['rgb(31, 31, 31)', 'rgb(245, 245, 245)'];
		for (const fill of fills) svg.appendChild(el('path', { 'data-fill': fill }));
	}

	const titleLink = outer.appendChild(el('div')).appendChild(el('a', { href: `/artworks/${id}` }));
	titleLink.textContent = title;
	return li;
}

/**
 * グリッド (ul) を組む。
 * @param {object[]} cards makeCard で作った li
 * @returns {{ul: object, wrap: object}} ul とその親
 */
export function makeGrid(cards) {
	const wrap = el('div');
	const ul = wrap.appendChild(el('ul'));
	for (const card of cards) ul.appendChild(card);
	return { ul, wrap };
}

/**
 * 偽の getComputedStyle。path の data-fill を fill として返す。
 * @param {object} node 要素
 * @returns {{fill: string}} 見た目
 */
export function fakeComputedStyle(node) {
	return { fill: node.getAttribute('data-fill') ?? 'none' };
}
