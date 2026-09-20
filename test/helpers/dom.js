/**
 * テスト用の DOM の代わり。
 * jsdom を入れずに済ませるため、src が使う口だけを備える。
 * 以前は各テストが似た偽物を持っていたが、足りない口を足すたびに 6 か所を直すことになるので
 * ここへ寄せた。本物との違いは「children / listeners / attributes を素の配列や辞書で覗ける」こと。
 */
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

/**
 * セレクタに要素が合うか。class (`.name`) とタグ名、カンマ区切りの並びだけを解する。
 * @param {object} node 要素の代わり
 * @param {string} selector '.status, .frame' や 'span' のようなセレクタ
 * @returns {boolean} 合えば true
 */
function matches(node, selector) {
	return selector.split(',').some((part) => {
		const wanted = part.trim();
		if (wanted.startsWith('.')) return classNames(node).includes(wanted.slice(1));
		return node.tag === wanted;
	});
}

/**
 * className を空白で割った配列にする。
 * @param {object} node 要素の代わり
 * @returns {string[]} class 名の並び
 */
function classNames(node) {
	return String(node.className ?? '').split(/\s+/).filter(Boolean);
}

/**
 * セレクタに合う子孫をすべて集める (起点自身は含めない。querySelectorAll と同じ)。
 * @param {object} root 起点
 * @param {string} selector '.name' / 'tag' / それらのカンマ区切り
 * @returns {object[]} 見つかった要素 (文書順)
 */
export function findAll(root, selector) {
	const found = [];
	const walk = (node) => {
		for (const child of node.children ?? []) {
			if (matches(child, selector)) found.push(child);
			walk(child);
		}
	};
	walk(root);
	return found;
}

/**
 * セレクタに合う子孫を 1 つ探す (起点自身は含めない。querySelector と同じ)。
 * @param {object} root 起点
 * @param {string} selector '.name' / 'tag' / それらのカンマ区切り
 * @returns {object|null} 見つかった要素
 */
export function find(root, selector) {
	return findAll(root, selector)[0] ?? null;
}

/**
 * 要素の代わりを作る。
 * - children / parent で親子関係を追える
 * - listeners[type] に登録順の配列で覚え、dispatch(type, event) で呼び出す
 * - textContent は本物と同じく、代入で子を消し、取得で子の文字を繋げる
 * - classList は className の文字列を読み書きする (どちらで見ても同じ状態)
 * - focus() は木の根 (getRootNode()) の activeElement を動かす。
 *   **disabled にするとブラウザと同じくフォーカスが外れる** (本物の挙動。これが無いと
 *   「送信中に disabled にしてフォーカスを失う」不具合をテストで捕まえられない)
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
export function fakeElement(tag) {
	let text = '';
	const element = {
		tag,
		children: [],
		parent: null,
		attributes: {},
		dataset: {},
		listeners: {},
		style: {},
		innerHTML: '',
		className: '',
		src: '',
		href: '',
		type: '',
		value: '',
		title: '',
		checked: false,
		hidden: false,
		focused: false,
		/** replaceWith で差し替えられた先。差し替えを確かめるテストが見る */
		replacedWith: null,
		classList: {
			add(name) {
				if (!classNames(element).includes(name)) element.className = [...classNames(element), name].join(' ');
			},
			remove(name) {
				element.className = classNames(element).filter((one) => one !== name).join(' ');
			},
			toggle(name, force) {
				const on = force ?? !classNames(element).includes(name);
				if (on) element.classList.add(name);
				else element.classList.remove(name);
				return on;
			},
			contains(name) { return classNames(element).includes(name); },
		},
		appendChild(child) {
			child.parent = element;
			element.children.push(child);
			return child;
		},
		append(...nodes) {
			for (const node of nodes) element.appendChild(node);
		},
		prepend(...nodes) {
			for (const node of nodes) node.parent = element;
			element.children.unshift(...nodes);
		},
		insertBefore(next, reference) {
			const at = element.children.indexOf(reference);
			next.parent = element;
			// 本物は参照が null なら末尾へ入れる。見つからない場合もそれに倣う
			if (at < 0) element.children.push(next);
			else element.children.splice(at, 0, next);
			return next;
		},
		replaceChildren(...nodes) {
			element.children = [];
			text = '';
			element.append(...nodes);
		},
		replaceChild(next, previous) {
			const at = element.children.indexOf(previous);
			if (at >= 0) {
				element.children[at] = next;
				next.parent = element;
				previous.parent = null;
			}
			return previous;
		},
		replaceWith(...nodes) { element.replacedWith = nodes; },
		remove() {
			if (!element.parent) return;
			element.parent.children = element.parent.children.filter((child) => child !== element);
			element.parent = null;
		},
		setAttribute(name, value) { element.attributes[name] = String(value); },
		getAttribute(name) { return element.attributes[name] ?? null; },
		removeAttribute(name) { delete element.attributes[name]; },
		/**
		 * その要素が自分か自分の子孫か。
		 * @param {object} node 調べる要素
		 * @returns {boolean} 含んでいれば true
		 */
		contains(node) {
			for (let at = node; at; at = at.parent) {
				if (at === element) return true;
			}
			return false;
		},
		/**
		 * 自分の属する木の根を返す。本物は document か shadowRoot を返す。
		 * @returns {object} 根 (親をたどれる限りの一番上)
		 */
		getRootNode() {
			let root = element;
			while (root.parent) root = root.parent;
			return root;
		},
		addEventListener(type, handler) { (element.listeners[type] ??= []).push(handler); },
		removeEventListener(type, handler) {
			element.listeners[type] = (element.listeners[type] ?? []).filter((one) => one !== handler);
		},
		/**
		 * 登録済みのリスナを登録順に同期で呼ぶ。
		 * 戻り値はリスナの戻り値 (async なら Promise) をまとめたもの。await すれば非同期の処理まで待てる
		 * @param {string} type イベント名
		 * @param {object} [event] イベントの代わり
		 * @returns {Promise<unknown[]>} 全リスナの完了
		 */
		dispatch(type, event = {}) {
			return Promise.all([...(element.listeners[type] ?? [])].map((handler) => handler(event)));
		},
		click() { return element.dispatch('click', {}); },
		/**
		 * フォーカスを自分へ移す。前にフォーカスのあった要素からは外す。
		 * @returns {void}
		 */
		focus() {
			const root = element.getRootNode();
			const previous = root.activeElement ?? null;
			if (previous === element) return;
			if (previous) previous.blur();
			root.activeElement = element;
			element.focused = true;
			void element.dispatch('focus', {});
		},
		/**
		 * フォーカスを外す。
		 * @returns {void}
		 */
		blur() {
			const root = element.getRootNode();
			if (root.activeElement === element) root.activeElement = null;
			if (element.focused === false) return;
			element.focused = false;
			void element.dispatch('blur', {});
		},
		querySelector(selector) { return find(element, selector); },
		querySelectorAll(selector) { return findAll(element, selector); },
	};
	Object.defineProperty(element, 'parentElement', {
		enumerable: true,
		get() { return element.parent; },
	});
	let disabled = false;
	Object.defineProperty(element, 'disabled', {
		enumerable: true,
		get() { return disabled; },
		set(value) {
			disabled = value;
			// 本物のブラウザは disabled にした瞬間にフォーカスを body へ落とす
			if (value === true) element.blur();
		},
	});
	Object.defineProperty(element, 'textContent', {
		get() {
			if (element.children.length === 0) return text;
			return element.children.map((child) => child.textContent).join('');
		},
		set(value) {
			text = value;
			// 実際の DOM と同じく、文字列を入れると子は消える
			element.children = [];
		},
	});
	return element;
}

/**
 * document の代わり。要素を作る役と、document 自身へのリスナ登録 (外側クリック等) を持つ。
 * @param {{nextData?: string}} [options] __NEXT_DATA__ の中身。省略すると script が無い (未ログイン) 扱い
 * @returns {object} doc の代わり
 */
export function fakeDoc(options = {}) {
	const doc = fakeElement('#document');
	doc.createElement = (tag) => fakeElement(tag);
	doc.createElementNS = (_ns, tag) => fakeElement(tag);
	doc.createDocumentFragment = () => fakeElement('#fragment');
	doc.createTextNode = (value) => {
		const node = fakeElement('#text');
		node.textContent = value;
		return node;
	};
	doc.getElementById = () => (options.nextData === undefined ? null : { textContent: options.nextData });
	return doc;
}

/**
 * createIcon が描いた svg から図形の名前を割り出す。
 * 偽の要素は innerHTML を覚えるだけなので、図形データと突き合わせて名前へ戻す。
 * @param {object} icon svg の代わり
 * @returns {string|undefined} ICON_SHAPES のキー
 */
export function iconName(icon) {
	return Object.keys(ICON_SHAPES).find((name) => ICON_SHAPES[name].markup === icon.innerHTML);
}

/**
 * 溜まっている非同期処理 (microtask と、その中で積まれたもの) を流し切る。
 * `await Promise.resolve()` を何度も並べる書き方は、実装側の await の段数が変わると壊れるので使わない。
 * @returns {Promise<void>}
 */
export function flush() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
