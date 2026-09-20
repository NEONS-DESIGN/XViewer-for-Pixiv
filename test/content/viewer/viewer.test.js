import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { clearSessionCache } from '../../../src/content/session.js';
import { KEYS } from '../../../src/common/constants.js';
import { fakeElement, fakeDoc as fakeDocBase, find, findAll, flush } from '../../helpers/dom.js';

// viewer.js は viewer.css と common/tokens.css を import する (esbuild が文字列にする)。
// node はそのままでは .css を読めないので、空文字を返す読み込みフックを先に登録してから
// 動的 import で読む (静的 import は巻き上げられてフックより先に走る)
register(`data:text/javascript,${encodeURIComponent(`
export async function load(url, context, next) {
	if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default "";' };
	return next(url, context);
}
`)}`);
const { createViewer, isTextEntry } = await import('../../../src/content/viewer/viewer.js');

/** 実際の CDN と同じ形の URL。safeCdnUrl の関門を通す必要がある。 */
const REGULAR_URL = 'https://i.pximg.net/img-master/img/2026/09/10/00/00/00/x_p0_master1200.jpg';

/**
 * /ajax/illust/{id} の body の代わり。normalizeDetail が読むキーだけを持つ。
 * @param {string} id 作品 ID
 * @param {object} [overrides] 上書きする値
 * @returns {object} raw の代わり
 */
function rawDetail(id, overrides = {}) {
	return {
		illustId: id,
		illustTitle: `作品 ${id}`,
		illustType: 0,
		pageCount: 1,
		xRestrict: 0,
		aiType: 1,
		userId: '54734418',
		userName: '作者',
		createDate: '2026-09-08T17:45:00+09:00',
		illustComment: '',
		tags: { tags: [] },
		likeCount: 0,
		bookmarkCount: 0,
		viewCount: 0,
		commentCount: 0,
		commentOff: 0,
		likeData: false,
		bookmarkData: null,
		urls: { regular: REGULAR_URL },
		...overrides,
	};
}

/**
 * ビュワーの設定の代わり。サイドバーは出さない (作者情報の取得で通信させないため)。
 * @param {object} [overrides] 上書きする値
 * @returns {object} settings の代わり
 */
function settings(overrides = {}) {
	return {
		imageQuality: 'regular',
		prefetch: 0,
		showSidebar: false,
		sidebarScroll: 'comments',
		closeOnBackdrop: true,
		...overrides,
	};
}

/**
 * 要素の代わりに、ビュワーが使う口 (closest / hasAttribute / attachShadow) を足す。
 * @param {object} element 要素の代わり
 * @returns {object} 同じ要素
 */
function enrich(element) {
	element.hasAttribute = (name) => name in element.attributes;
	element.closest = (selector) => {
		for (let node = element; node; node = node.parent) {
			if (typeof node.matchesSelector === 'function' && node.matchesSelector(selector)) return node;
		}
		return null;
	};
	element.attachShadow = () => {
		const shadow = fakeElement('#shadow');
		shadow.activeElement = null;
		element.shadowRoot = shadow;
		return shadow;
	};
	return element;
}

/**
 * ビュワー用の document の代わり。body / documentElement / activeElement を持つ。
 * @returns {object} doc の代わり
 */
function fakeDoc() {
	const doc = fakeDocBase();
	const createElement = doc.createElement;
	doc.createElement = (tag) => enrich(createElement(tag));
	doc.body = enrich(fakeElement('body'));
	doc.documentElement = enrich(fakeElement('html'));
	doc.documentElement.dataset.theme = 'dark';
	doc.documentElement.clientWidth = 1000;
	doc.defaultView = { innerWidth: 1017 };
	doc.activeElement = null;
	doc.contains = (element) => {
		for (let node = element; node; node = node.parent) if (node === doc.body) return true;
		return false;
	};
	return doc;
}

/**
 * ビュワーと依存の記録を用意する。
 * @param {object} [options] getJsonImpl と settings の差し替え
 * @returns {{viewer: object, doc: object, fetched: string[], closed: () => number, shadow: () => object, stage: () => object}} 一式
 */
function setup(options = {}) {
	clearSessionCache();
	const doc = fakeDoc();
	const fetched = [];
	let closeRequests = 0;
	const viewer = createViewer({
		doc,
		settings: options.settings ?? settings(),
		onRequestClose: () => { closeRequests += 1; },
		onNavigate: () => {},
		canExtendSequence: () => false,
		extendSequence: async (current) => current,
		getJsonImpl: options.getJsonImpl ?? (async (url) => {
			fetched.push(url);
			return rawDetail(url.match(/illust\/(\d+)/)[1]);
		}),
		// サイドバーを出すテストだけが渡す。作者情報の取得で通信させない
		fetchUser: options.fetchUser,
	});
	const shadow = () => doc.body.children[0]?.shadowRoot ?? null;
	return {
		viewer,
		doc,
		fetched,
		closed: () => closeRequests,
		shadow,
		stage: () => find(shadow(), '.stage'),
	};
}

/**
 * ステージの click を組み立てる。押し始めと離した先を別々に指定できる。
 * @param {object} stage .stage の代わり
 * @param {object} pressed 押し始めた要素
 * @param {object} released 離した先 (click の target)
 * @returns {Promise<unknown[]>} リスナの完了
 */
async function pressAndRelease(stage, pressed, released) {
	await stage.dispatch('pointerdown', { target: pressed });
	return stage.dispatch('click', { target: released });
}

/**
 * 「押しても閉じない要素」の代わり。closest がセレクタに当たったと答える。
 * @param {object} stage 親にするステージ
 * @param {string} tag タグ名
 * @returns {object} 要素の代わり
 */
function keepOpenElement(stage, tag) {
	const element = enrich(fakeElement(tag));
	element.matchesSelector = () => true;
	stage.appendChild(element);
	return element;
}

/**
 * 余白の代わり。closest は何にも当たらない。
 * @param {object} stage 親にするステージ
 * @returns {object} 要素の代わり
 */
function backdropElement(stage) {
	const element = enrich(fakeElement('div'));
	element.matchesSelector = () => false;
	stage.appendChild(element);
	return element;
}

test('開くと作品を取得して描き、閉じると DOM ごと捨てる', async () => {
	const { viewer, doc, fetched, stage } = setup();
	await viewer.open('1');
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja']);
	assert.equal(viewer.isOpen(), true);
	assert.equal(findAll(stage(), '.frame').length, 1);
	// 読み込み中の文言は描く前に消す
	assert.equal(findAll(stage(), '.status').length, 0);
	viewer.close();
	assert.equal(viewer.isOpen(), false);
	assert.equal(doc.body.children.length, 0);
});

test('開いている間は body のスクロールを止め、スクロールバーの幅だけ padding で補う', async () => {
	// overflow: hidden でスクロールバーが消えると背後のページが広がって見える (X.com と同じ補正)
	const { viewer, doc } = setup();
	doc.body.setAttribute('style', 'color:red');
	await viewer.open('1');
	assert.equal(doc.body.getAttribute('style'), 'color:red;overflow:hidden;padding-right:17px');
	viewer.close();
	assert.equal(doc.body.getAttribute('style'), 'color:red');
});

test('余白で押して余白で離すと閉じる', async () => {
	const { viewer, stage, closed } = setup();
	await viewer.open('1');
	const backdrop = backdropElement(stage());
	await pressAndRelease(stage(), backdrop, backdrop);
	assert.equal(closed(), 1);
});

test('画像の上で押して余白で離しても閉じない', async () => {
	// click は押し始めと離した先が違うと共通祖先で発火する。
	// 画像をつまもうとした・誤ってドラッグしただけでモーダルが閉じてはいけない
	const { viewer, stage, closed } = setup();
	await viewer.open('1');
	const image = keepOpenElement(stage(), 'img');
	const backdrop = backdropElement(stage());
	await pressAndRelease(stage(), image, backdrop);
	assert.equal(closed(), 0);
	// 余白で押して画像の上で離しても同じ
	await pressAndRelease(stage(), backdrop, image);
	assert.equal(closed(), 0);
});

test('ページカウンタや文言の上で押しても閉じない', async () => {
	// .counter / .pane-error / .status は p なので、以前は余白扱いで閉じていた
	const { viewer, stage, closed } = setup();
	await viewer.open('1');
	for (const className of ['counter', 'pane-error', 'status']) {
		const text = keepOpenElement(stage(), 'p');
		text.className = className;
		await pressAndRelease(stage(), text, text);
	}
	assert.equal(closed(), 0);
});

test('closeOnBackdrop が偽なら余白を押しても閉じない', async () => {
	const { viewer, stage, closed } = setup({ settings: settings({ closeOnBackdrop: false }) });
	await viewer.open('1');
	const backdrop = backdropElement(stage());
	await pressAndRelease(stage(), backdrop, backdrop);
	assert.equal(closed(), 0);
});

test('開いたときのフォーカスはダイアログ本体に置く', async () => {
	// 中のボタンへ当てると、次にキーを押した瞬間に :focus-visible が立って
	// そのボタンに輪郭が出る。十字キーでフォーカスが動いたように見えてしまう。
	// ダイアログ本体 (tabindex="-1") なら読み上げの起点になり、輪郭も出ない
	const { viewer, shadow } = setup();
	await viewer.open('1');
	const overlay = find(shadow(), '.overlay');
	assert.equal(overlay.getAttribute('tabindex'), '-1');
	assert.equal(overlay.focused, true);
	assert.equal(find(shadow(), '.close').focused, false);
});

test('作品を送ってフォーカスが中から消えたらダイアログ本体へ戻す', async () => {
	// 押していたボタンがペインごと消えると、フォーカスは inert な body へ落ちて読み上げが文脈を失う
	const { viewer, shadow } = setup();
	await viewer.open('1');
	const overlay = find(shadow(), '.overlay');
	// 中の別の部品にフォーカスがある間は動かさない
	overlay.focused = false;
	shadow().activeElement = find(shadow(), '.frame');
	await viewer.open('2');
	assert.equal(overlay.focused, false);
	// 送った先でフォーカスが無くなっていたらダイアログ本体へ
	shadow().activeElement = null;
	await viewer.open('3');
	assert.equal(overlay.focused, true);
});

test('Tab は描画されている要素だけを巡回する', async () => {
	// 幅 900px 以下で display: none になったサイドバーのリンクは hidden 属性が立たない。
	// focus() が無言で失敗して Tab が効かなく見えるので、getClientRects で描画済みかを見る
	const { viewer, doc, shadow } = setup();
	await viewer.open('1');
	const first = enrich(doc.createElement('button'));
	const hidden = enrich(doc.createElement('a'));
	hidden.getClientRects = () => [];
	const last = enrich(doc.createElement('button'));
	last.getClientRects = () => [{}];
	shadow().querySelectorAll = () => [first, hidden, last];
	shadow().activeElement = first;
	const event = { key: KEYS.FOCUS_NEXT, shiftKey: false, preventDefault() {} };
	await doc.dispatch('keydown', event);
	assert.equal(hidden.focused, false);
	assert.equal(last.focused, true);
});

test('取得に失敗したら文言を出す', async () => {
	const { viewer, stage } = setup({ getJsonImpl: async () => { throw new Error('500'); } });
	await viewer.open('1');
	const status = find(stage(), '.status');
	assert.equal(status.textContent, '作品を読み込めませんでした');
	assert.equal(status.getAttribute('role'), 'alert');
	assert.equal(findAll(stage(), '.frame').length, 0);
});

test('描画に失敗したら描きかけのペインを捨ててから文言を出す', async () => {
	// 主役の描画で落ちたときに .frame や .ugoira の横に文言が並ばないように
	// 画像ペインは枠をステージへ足した後に settings.imageQuality を読む。
	// そこで投げさせて「枠を足した後に落ちた」状態を作る
	const broken = settings();
	Object.defineProperty(broken, 'imageQuality', { get() { throw new Error('壊れた設定'); } });
	const { viewer, stage } = setup({ settings: broken });
	await viewer.open('1');
	await flush();
	const status = find(stage(), '.status');
	assert.ok(status, '文言が出る');
	assert.equal(status.textContent, '作品を読み込めませんでした');
	assert.equal(findAll(stage(), '.frame').length, 0);
});

test('overlay の aria-label に作品名が乗る', async () => {
	const { viewer, shadow } = setup();
	await viewer.open('1');
	assert.equal(find(shadow(), '.overlay').getAttribute('aria-label'), '作品 1 - 作品ビュワー');
});

test('描画に効く設定が変わったら通信せずに描き直す', async () => {
	const { viewer, fetched, stage } = setup();
	await viewer.open('1');
	assert.equal(fetched.length, 1);
	viewer.setSettings(settings({ imageQuality: 'original' }));
	await flush();
	assert.equal(fetched.length, 1);
	assert.equal(findAll(stage(), '.frame').length, 1);
});

test('描画に効かない設定の変更では描き直さない', async () => {
	const { viewer, stage } = setup();
	await viewer.open('1');
	const frame = find(stage(), '.frame');
	viewer.setSettings(settings({ closeOnBackdrop: false }));
	await flush();
	assert.equal(find(stage(), '.frame'), frame);
});

test('取得を待っている間に設定が変わったら、その作品を取得からやり直す', async () => {
	// 覚えている詳細は前の作品のもの。それを描き直すと別の作品が出てしまう
	let release;
	const { viewer, fetched } = setup({
		getJsonImpl: async (url) => {
			fetched.push(url);
			const id = url.match(/illust\/(\d+)/)[1];
			if (id === '2' && fetched.length === 2) await new Promise((resolve) => { release = resolve; });
			return rawDetail(id);
		},
	});
	await viewer.open('1');
	const opening = viewer.open('2');
	viewer.setSettings(settings({ imageQuality: 'original' }));
	release();
	await opening;
	await flush();
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja', '/ajax/illust/2?lang=ja', '/ajax/illust/2?lang=ja']);
});

test('dispose は this に依らず閉じる', async () => {
	const { viewer } = setup();
	await viewer.open('1');
	const { dispose } = viewer;
	dispose();
	assert.equal(viewer.isOpen(), false);
});

/**
 * ID の配列から並びの代わりを作る。
 * @param {string[]} ids 作品 ID
 * @returns {{next: (id: string) => string|null, prev: (id: string) => string|null}} 並びの代わり
 */
function fakeSequence(ids) {
	const at = (id, offset) => {
		const index = ids.indexOf(id);
		return index < 0 ? null : (ids[index + offset] ?? null);
	};
	return { next: (id) => at(id, 1), prev: (id) => at(id, -1) };
}

test('開いたシェアメニューでは上下キーと Escape をメニューに使わせ、本体は動かない', async () => {
	// これが無いと、メニューの項目を送ろうとした下キーで次の作品へ移る。
	// Escape はメニューを閉じるだけで、モーダルは閉じない
	const { viewer, doc, fetched, shadow, closed } = setup({
		settings: settings({ showSidebar: true }),
		fetchUser: async () => ({}),
	});
	await viewer.open('1', fakeSequence(['1', '2']));
	assert.equal(fetched.length, 1);
	find(shadow(), '.share-button').click();
	const key = (name) => ({ key: name, preventDefault() {}, stopPropagation() {} });
	await doc.dispatch('keydown', key(KEYS.NEXT_WORK));
	await flush();
	assert.equal(fetched.length, 1);
	await doc.dispatch('keydown', key(KEYS.CLOSE));
	assert.equal(closed(), 0);
	// メニューが閉じた後は本体が受ける
	await doc.dispatch('keydown', key(KEYS.NEXT_WORK));
	await flush();
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja', '/ajax/illust/2?lang=ja']);
	await doc.dispatch('keydown', key(KEYS.CLOSE));
	assert.equal(closed(), 1);
});

test('入力欄の中のキーはビュワーの割り当てに使わない', () => {
	// composedPath の先頭が textarea なら、左右キーで作品が送られてはいけない
	assert.equal(isTextEntry({ composedPath: () => [{ tagName: 'TEXTAREA' }] }), true);
	assert.equal(isTextEntry({ composedPath: () => [{ tagName: 'INPUT' }] }), true);
	assert.equal(isTextEntry({ composedPath: () => [{ tagName: 'BUTTON' }] }), false);
	assert.equal(isTextEntry({ composedPath: () => [] }), false);
	assert.equal(isTextEntry({}), false);
});

test('編集できる要素の中でも効かせない', () => {
	assert.equal(isTextEntry({ composedPath: () => [{ tagName: 'DIV', isContentEditable: true }] }), true);
});

test('入力欄の中では上下キーで作品が送られない', async () => {
	// document の捕捉フェーズで全キーを取っているため、コメントを書いている最中の
	// 上下キーで作品が送られていた。composedPath の先頭を入力欄にして確かめる
	const { viewer, doc, fetched } = setup();
	await viewer.open('1', fakeSequence(['1', '2']));
	assert.equal(fetched.length, 1);
	const event = {
		key: KEYS.NEXT_WORK,
		composedPath: () => [{ tagName: 'TEXTAREA' }],
		preventDefault() {},
		stopPropagation() {},
	};
	await doc.dispatch('keydown', event);
	await flush();
	assert.equal(fetched.length, 1, '入力欄の中では作品が送られない');
});

test('クリックで原寸表示がオンなら、画像を押すと overlay の直下に原寸レイヤが出る', async () => {
	// ステージの中ではなく overlay の直下。サイドバーの上も覆う
	const { viewer, shadow, stage } = setup({ settings: settings({ clickZoom: true }) });
	await viewer.open('1');
	await find(stage(), 'img').dispatch('click', {});
	const zoom = find(shadow(), '.zoom');
	assert.ok(zoom, '原寸レイヤが出る');
	assert.equal(zoom.parent.className, 'overlay');
	assert.equal(find(zoom, '.zoom-image').src, REGULAR_URL);
});

test('クリックで原寸表示がオフなら、画像を押しても何も出ない', async () => {
	const { viewer, shadow, stage } = setup();
	await viewer.open('1');
	await find(stage(), 'img').dispatch('click', {});
	assert.equal(find(shadow(), '.zoom'), null);
});

test('原寸表示中の Escape はレイヤだけを閉じ、モーダルは閉じない', async () => {
	const { viewer, doc, shadow, stage, closed } = setup({ settings: settings({ clickZoom: true }) });
	await viewer.open('1');
	await find(stage(), 'img').dispatch('click', {});
	await doc.dispatch('keydown', { key: KEYS.CLOSE, preventDefault() {}, stopPropagation() {} });
	assert.equal(find(shadow(), '.zoom'), null);
	assert.equal(closed(), 0, 'モーダルは開いたまま');
});

test('作品を移ると原寸表示は閉じる', async () => {
	// 原寸のまま次の作品へ進むと、開くたびに巨大な画像を読むことになる
	const { viewer, shadow, stage } = setup({ settings: settings({ clickZoom: true }) });
	await viewer.open('1');
	await find(stage(), 'img').dispatch('click', {});
	await viewer.open('2');
	assert.equal(find(shadow(), '.zoom'), null);
});

test('設定を変えて描き直すと原寸表示は閉じる', async () => {
	const { viewer, shadow, stage } = setup({ settings: settings({ clickZoom: true }) });
	await viewer.open('1');
	await find(stage(), 'img').dispatch('click', {});
	viewer.setSettings(settings({ clickZoom: false }));
	await flush();
	assert.equal(find(shadow(), '.zoom'), null);
});

test('Tab は inert を付けた背後の部品を巡回しない', async () => {
	// 原寸表示中はステージとサイドバーに inert が付く。
	// inert の中の要素は focus() が無言で失敗するので、巡回の対象から外す
	const { viewer, doc, shadow } = setup();
	await viewer.open('1');
	const behind = enrich(doc.createElement('button'));
	behind.closest = (selector) => (selector.includes('inert') ? doc.createElement('div') : null);
	const front = enrich(doc.createElement('button'));
	front.closest = () => null;
	shadow().querySelectorAll = () => [behind, front];
	shadow().activeElement = null;
	await doc.dispatch('keydown', { key: KEYS.FOCUS_NEXT, shiftKey: false, preventDefault() {} });
	assert.equal(behind.focused, false);
	assert.equal(front.focused, true);
});
