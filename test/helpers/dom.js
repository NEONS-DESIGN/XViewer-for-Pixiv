/**
 * テスト用の DOM の代わり。
 * jsdom を入れずに済ませるため、src が使う口だけを備える。
 * 以前は各テストが似た偽物を持っていたが、足りない口を足すたびに 6 か所を直すことになるので
 * ここへ寄せた。本物との違いは「children / listeners / attributes を素の配列や辞書で覗ける」こと。
 *
 * 本物に寄せてある挙動 (テストで不具合を捕まえるために要る):
 * - `id` / `hidden` / `disabled` / `dataset.*` は属性 (`attributes`) と相互に反映する。
 *   `[hidden]` / `[data-role="x"]` / `button:not([disabled])` のような属性セレクタで探せる
 * - `focus()` は disabled な要素では何もしない。disabled にした瞬間にフォーカスは外れる
 * - `replaceWith()` は親の children を実際に差し替える
 * - `textContent` の代入は String() 相当に倒す。(null は '')
 *
 * 本物と違う点 (テストを書くときに注意):
 * - `click()` / `dispatch()` は**バブリングしない**。祖先で受ける委譲 (tabs.js の list の keydown 等) を
 *   試すときは、その祖先へ直接 dispatch する
 * - セレクタは単純セレクタの並び (`tag.class[attr="v"]:not([attr])`) とカンマ区切りだけを解する。
 *   子孫結合子 (`a b` / `a > b`) や `:has()` などの解せないセレクタは**投げる**。
 *   黙って false を返すと「X が残っていないこと」のような否定の assert が空振りで通るため
 */
import { ICON_SHAPES } from '../../src/common/icon-shapes.js';

/**
 * __NEXT_DATA__ を持つ script 要素の id。(`src/content/session.js` の定数と同じ値。export されていないので写す)
 */
const NEXT_DATA_ID = '__NEXT_DATA__';

/** セレクタの字句。先頭から順に試す */
const TAG_TOKEN = /^[a-zA-Z][\w-]*/;
const CLASS_TOKEN = /^\.([\w-]+)/;
const ID_TOKEN = /^#([\w-]+)/;
const ATTR_TOKEN = /^\[([\w-]+)(?:([~^$*|]?=)"([^"]*)")?\]/;
const NOT_TOKEN = /^:not\(([^()]*)\)/;
/** 解する属性の比較演算子 */
const ATTR_OPERATORS = Object.freeze({
	'=': (actual, value) => actual === value,
	'^=': (actual, value) => actual.startsWith(value),
	'$=': (actual, value) => actual.endsWith(value),
	'*=': (actual, value) => actual.includes(value),
});

/**
 * セレクタに要素が合うか。
 * 解するのは単純セレクタの並び (`tag` / `.class` / `#id` / `[attr]` / `[attr="v"]` / `[attr^="v"]` /
 * `:not(単純セレクタ)`) と、それらのカンマ区切り。それ以外は投げる。
 * (カンマで先に分けるので、属性の値にカンマを含むセレクタも解せない扱いになる)
 * @param {object} node 要素の代わり
 * @param {string} selector '.status, .frame' や 'button:not([disabled])' のようなセレクタ
 * @returns {boolean} 合えば true
 * @throws {Error} 解せないセレクタ
 */
export function matches(node, selector) {
	return String(selector).split(',').some((part) => matchesCompound(node, part.trim()));
}

/**
 * カンマを含まない複合セレクタ 1 本に合うか。
 * @param {object} node 要素の代わり
 * @param {string} selector 複合セレクタ
 * @returns {boolean} 合えば true
 * @throws {Error} 解せないセレクタ
 */
function matchesCompound(node, selector) {
	if (selector === '') throw new Error('fake DOM: 空のセレクタです');
	let rest = selector;
	let ok = true;
	while (rest !== '') {
		let token;
		if ((token = TAG_TOKEN.exec(rest))) {
			ok &&= node.tag === token[0].toLowerCase();
		} else if ((token = CLASS_TOKEN.exec(rest))) {
			ok &&= classNames(node).includes(token[1]);
		} else if ((token = ID_TOKEN.exec(rest))) {
			ok &&= node.getAttribute?.('id') === token[1];
		} else if ((token = ATTR_TOKEN.exec(rest))) {
			ok &&= matchesAttribute(node, token[1], token[2], token[3]);
		} else if ((token = NOT_TOKEN.exec(rest))) {
			ok &&= !matchesCompound(node, token[1].trim());
		} else {
			// 子孫結合子や :has() など。黙って false を返すと否定の assert が空振りで通る
			throw new Error(`fake DOM が解せないセレクタです: "${selector}" (${rest} の手前まで解しました)`);
		}
		rest = rest.slice(token[0].length);
	}
	return ok;
}

/**
 * 属性セレクタ 1 つに合うか。
 * @param {object} node 要素の代わり
 * @param {string} name 属性名
 * @param {string|undefined} operator 比較演算子。無ければ「持っているか」だけ見る
 * @param {string|undefined} value 比べる値
 * @returns {boolean} 合えば true
 * @throws {Error} 解せない演算子
 */
function matchesAttribute(node, name, operator, value) {
	const actual = typeof node.getAttribute === 'function' ? node.getAttribute(name) : null;
	if (actual === null) return false;
	if (operator === undefined) return true;
	const compare = ATTR_OPERATORS[operator];
	if (!compare) throw new Error(`fake DOM が解せない属性の演算子です: ${operator}`);
	return compare(actual, value);
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
 * セレクタに合う子孫をすべて集める。(起点自身は含めない。querySelectorAll と同じ)
 * @param {object} root 起点
 * @param {string} selector matches() が解するセレクタ
 * @returns {object[]} 見つかった要素 (文書順)
 * @throws {Error} 解せないセレクタ
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
 * セレクタに合う子孫を 1 つ探す。(起点自身は含めない。querySelector と同じ)
 * @param {object} root 起点
 * @param {string} selector matches() が解するセレクタ
 * @returns {object|null} 見つかった要素
 * @throws {Error} 解せないセレクタ
 */
export function find(root, selector) {
	return findAll(root, selector)[0] ?? null;
}

/**
 * data-role で要素を探す。起点自身も候補に入れる。
 * popup の部品はクラス名を持たず data-role で識別するので、テストはこれで掴む。
 * @param {object} root 探し始める要素
 * @param {string} role 探す data-role の値
 * @returns {object|null} 見つかった要素
 */
export function findRole(root, role) {
	const selector = `[data-role="${role}"]`;
	if (matches(root, selector)) return root;
	return find(root, selector);
}

/**
 * dataset のキー (camelCase) を data-* 属性名にする。
 * @param {string} key 'sidebarScroll' のようなキー
 * @returns {string} 'data-sidebar-scroll' のような属性名
 */
function datasetAttributeName(key) {
	return `data-${String(key).replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}`;
}

/**
 * data-* 属性名を dataset のキー (camelCase) にする。
 * @param {string} name 'data-sidebar-scroll' のような属性名
 * @returns {string} 'sidebarScroll' のようなキー
 */
function datasetKey(name) {
	return name.slice('data-'.length).replace(/-([a-z])/g, (_, lower) => lower.toUpperCase());
}

/**
 * 属性辞書を data-* として読み書きする dataset の代わりを作る。
 * @param {Record<string, string>} attributes 要素の属性辞書
 * @returns {object} dataset の代わり (Proxy)
 */
function createDataset(attributes) {
	return new Proxy({}, {
		get(_, key) {
			if (typeof key !== 'string') return undefined;
			return attributes[datasetAttributeName(key)];
		},
		set(_, key, value) {
			attributes[datasetAttributeName(key)] = String(value);
			return true;
		},
		has(_, key) {
			return typeof key === 'string' && datasetAttributeName(key) in attributes;
		},
		deleteProperty(_, key) {
			delete attributes[datasetAttributeName(key)];
			return true;
		},
		ownKeys() {
			return Object.keys(attributes).filter((name) => name.startsWith('data-')).map(datasetKey);
		},
		getOwnPropertyDescriptor(_, key) {
			const name = datasetAttributeName(key);
			if (!(name in attributes)) return undefined;
			return { value: attributes[name], writable: true, enumerable: true, configurable: true };
		},
	});
}

/**
 * 要素の代わりを作る。
 * - children / parent で親子関係を追える
 * - listeners[type] に登録順の配列で覚え、dispatch(type, event) で呼び出す。**バブリングしない**
 * - textContent は本物と同じく、代入で子を消し、取得で子の文字を繋げる
 * - classList は className の文字列を読み書きする (どちらで見ても同じ状態)
 * - id / hidden / disabled / dataset は attributes と相互に反映する
 * - focus() は木の根 (getRootNode()) の activeElement を動かす。disabled な要素では何もしない。
 *   **disabled にするとブラウザと同じくフォーカスが外れる** (本物の挙動。これが無いと
 *   「送信中に disabled にしてフォーカスを失う」不具合をテストで捕まえられない)
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
export function fakeElement(tag) {
	let text = '';
	/** @type {Record<string, string>} 属性辞書。id / hidden / disabled / data-* もここへ写る */
	const attributes = {};
	const element = {
		tag,
		tagName: tag.toUpperCase(),
		children: [],
		parent: null,
		attributes,
		dataset: createDataset(attributes),
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
		focused: false,
		/** replaceWith で差し替えられた先。差し替えを確かめるテストが見る (木も実際に差し替わる) */
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
			child.remove?.();
			child.parent = element;
			element.children.push(child);
			return child;
		},
		append(...nodes) {
			for (const node of nodes) element.appendChild(node);
		},
		prepend(...nodes) {
			for (const node of nodes) {
				node.remove?.();
				node.parent = element;
			}
			element.children.unshift(...nodes);
		},
		insertBefore(next, reference) {
			next.remove?.();
			const at = element.children.indexOf(reference);
			next.parent = element;
			// 本物は参照が null なら末尾へ入れる。見つからない場合もそれに倣う
			if (at < 0) element.children.push(next);
			else element.children.splice(at, 0, next);
			return next;
		},
		replaceChildren(...nodes) {
			for (const child of element.children) child.parent = null;
			element.children = [];
			text = '';
			element.append(...nodes);
		},
		replaceChild(next, previous) {
			const at = element.children.indexOf(previous);
			if (at >= 0) {
				next.remove?.();
				element.children[at] = next;
				next.parent = element;
				previous.parent = null;
			}
			return previous;
		},
		/**
		 * 自分を別のノードに差し替える。親の children を実際に書き換える。
		 * @param {...object} nodes 代わりに入るノード
		 * @returns {void}
		 */
		replaceWith(...nodes) {
			element.replacedWith = nodes;
			const parent = element.parent;
			if (!parent) return;
			const at = parent.children.indexOf(element);
			for (const node of nodes) {
				node.remove?.();
				node.parent = parent;
			}
			parent.children.splice(at, 1, ...nodes);
			element.parent = null;
		},
		remove() {
			if (!element.parent) return;
			element.parent.children = element.parent.children.filter((child) => child !== element);
			element.parent = null;
		},
		setAttribute(name, value) { attributes[name] = String(value); },
		getAttribute(name) { return attributes[name] ?? null; },
		hasAttribute(name) { return name in attributes; },
		removeAttribute(name) { delete attributes[name]; },
		/**
		 * セレクタに自分が合うか。
		 * @param {string} selector matches() が解するセレクタ
		 * @returns {boolean} 合えば true
		 */
		matches(selector) { return matches(element, selector); },
		/**
		 * 自分から親へ向かって、セレクタに合う最初の要素を返す。
		 * @param {string} selector matches() が解するセレクタ
		 * @returns {object|null} 見つかった要素
		 */
		closest(selector) {
			for (let node = element; node; node = node.parent) {
				if (typeof node.getAttribute === 'function' && matches(node, selector)) return node;
			}
			return null;
		},
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
		 * 登録済みのリスナを登録順に同期で呼ぶ。**祖先へはバブリングしない。**
		 * 戻り値はリスナの戻り値 (async なら Promise) をまとめたもの。await すれば非同期の処理まで待てる
		 * @param {string} type イベント名
		 * @param {object} [event] イベントの代わり
		 * @returns {Promise<unknown[]>} 全リスナの完了
		 */
		dispatch(type, event = {}) {
			return Promise.all([...(element.listeners[type] ?? [])].map((handler) => handler(event)));
		},
		/**
		 * click を自分のリスナへだけ届ける。**祖先へはバブリングしない。**
		 * @returns {Promise<unknown[]>} 全リスナの完了
		 */
		click() { return element.dispatch('click', {}); },
		/**
		 * フォーカスを自分へ移す。前にフォーカスのあった要素からは外す。
		 * 本物と同じく、disabled な要素にはフォーカスを置けない (何もしない)。
		 * @returns {void}
		 */
		focus() {
			if (element.disabled) return;
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
	// id は属性とプロパティの両方から読み書きされる (style-injector は .id、tabs.js は setAttribute)
	Object.defineProperty(element, 'id', {
		enumerable: true,
		get() { return attributes.id ?? ''; },
		set(value) { attributes.id = String(value); },
	});
	// hidden は [hidden] 属性と同じもの。HIDDEN_SELECTOR で探せるように属性へ写す
	Object.defineProperty(element, 'hidden', {
		enumerable: true,
		get() { return 'hidden' in attributes; },
		set(value) {
			if (value) attributes.hidden = '';
			else delete attributes.hidden;
		},
	});
	Object.defineProperty(element, 'disabled', {
		enumerable: true,
		get() { return 'disabled' in attributes; },
		set(value) {
			if (value) attributes.disabled = '';
			else delete attributes.disabled;
			// 本物のブラウザは disabled にした瞬間にフォーカスを body へ落とす
			if (value) element.blur();
		},
	});
	Object.defineProperty(element, 'textContent', {
		get() {
			if (element.children.length === 0) return text;
			return element.children.map((child) => child.textContent).join('');
		},
		set(value) {
			// 本物は String() 相当。null / undefined は空文字になる
			text = value == null ? '' : String(value);
			// 実際の DOM と同じく、文字列を入れると子は消える
			for (const child of element.children) child.parent = null;
			element.children = [];
		},
	});
	return element;
}

/**
 * document の代わり。要素を作る役と、document 自身へのリスナ登録 (外側クリック等) を持つ。
 * 本物と同じく documentElement (html) > head / body の木を最初から持ち、activeElement は null。
 * getElementById は `__NEXT_DATA__` だけ nextData の stub を返し、それ以外は木を id で探す。
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
	doc.documentElement = doc.appendChild(fakeElement('html'));
	doc.head = doc.documentElement.appendChild(fakeElement('head'));
	doc.body = doc.documentElement.appendChild(fakeElement('body'));
	doc.activeElement = null;
	doc.getElementById = (id) => {
		if (id === NEXT_DATA_ID) return options.nextData === undefined ? null : { textContent: options.nextData };
		return find(doc, `[id="${id}"]`);
	};
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
