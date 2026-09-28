import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { clearSessionCache } from '../../../src/content/session.js';
import { KEYS, LOADING_STATUS_DELAY_MS } from '../../../src/common/constants.js';
import { createStrings } from '../../../src/i18n/index.js';
import { PixivError, PIXIV_ERROR_KINDS } from '../../../src/pixiv/errors.js';
import { fakeElement, fakeDoc as fakeDocBase, find, findAll, flush } from '../../helpers/dom.js';
import { fakeSequence } from '../../helpers/sequence.js';

// viewer.js は viewer.css と common/tokens.css を import する。(esbuild が文字列にする)
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
 * ビュワーの設定の代わり。サイドバーは出さない。(作者情報の取得で通信させないため)
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
 * @param {object} [options] getJsonImpl と settings、setTimeout / clearTimeout / createImage の差し替え
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
		strings: options.strings ?? createStrings('ja'),
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
		clearUserCache: options.clearUserCache ?? (() => {}),
		setTimeout: options.setTimeout,
		clearTimeout: options.clearTimeout,
		createImage: options.createImage,
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

test('作品詳細は HTTP キャッシュを確かめ直し、優先度を上げて取る', async () => {
	// ページ側でいいね・ブックマークした直後に開いたとき、ブラウザに残った古い応答を使わせない
	const inits = [];
	const { viewer } = setup({
		getJsonImpl: async (url, deps, init) => {
			inits.push(init);
			return rawDetail(url.match(/illust\/(\d+)/)[1]);
		},
	});
	await viewer.open('1');
	assert.deepEqual(inits, [{ cache: 'no-cache', priority: 'high' }]);
});

test('openWork は DOM を組む前に作品詳細の取得を始め、priority high を付ける', async () => {
	const calls = [];
	const { viewer, doc } = setup({
		getJsonImpl: (url, jsonDeps, init) => {
			calls.push({ url, deps: jsonDeps, init, hostExists: doc.body.children.length > 0 });
			return new Promise(() => {});
		},
	});
	void viewer.open('1');
	assert.equal(calls.length, 1);
	assert.equal(calls[0].init.priority, 'high');
	assert.equal(calls[0].init.cache, 'no-cache');
	assert.ok(calls[0].deps.signal);
	// 取得の発行はホストを作るより前
	assert.equal(calls[0].hostExists, false);
});

test('作品を送ると前の作品の取得を中断する', async () => {
	const signals = [];
	const { viewer } = setup({
		getJsonImpl: (url, jsonDeps) => {
			signals.push(jsonDeps.signal);
			return new Promise(() => {});
		},
	});
	void viewer.open('1');
	void viewer.open('2');
	assert.equal(signals[0].aborted, true);
	assert.equal(signals[1].aborted, false);
	viewer.close();
	assert.equal(signals[1].aborted, true);
});

test('押し始めに取った詳細を、同じ作品を開いたときに使う', async () => {
	const { viewer, fetched } = setup();
	viewer.prefetchOnPress('1');
	await viewer.open('1');
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja']);
});

test('押し始めと違う作品を開くと、押し始めの取得は止めて取り直す', async () => {
	const signals = [];
	const { viewer } = setup({
		getJsonImpl: (url, jsonDeps) => {
			signals.push(jsonDeps.signal);
			return new Promise(() => {});
		},
	});
	viewer.prefetchOnPress('1');
	void viewer.open('2');
	assert.equal(signals.length, 2);
	assert.equal(signals[0].aborted, true);
});

test('cancelPressPrefetch で押し始めの取得を止める', () => {
	const signals = [];
	const { viewer } = setup({
		getJsonImpl: (url, jsonDeps) => {
			signals.push(jsonDeps.signal);
			return new Promise(() => {});
		},
	});
	viewer.prefetchOnPress('1');
	viewer.cancelPressPrefetch();
	assert.equal(signals.length, 1);
	assert.equal(signals[0].aborted, true);
});

test('close は開いていなくても押し始めの先読みを止める', () => {
	const signals = [];
	const { viewer } = setup({
		getJsonImpl: (url, jsonDeps) => {
			signals.push(jsonDeps.signal);
			return new Promise(() => {});
		},
	});
	viewer.prefetchOnPress('1');
	viewer.close();
	assert.equal(signals[0].aborted, true);
});

test('読み込み中の文言は LOADING_STATUS_DELAY_MS 経ってから出る', async () => {
	const timers = [];
	const { viewer, stage } = setup({
		getJsonImpl: () => new Promise(() => {}),
		setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
		clearTimeout: () => {},
	});
	void viewer.open('1');
	assert.equal(findAll(stage(), '.status').length, 0);
	assert.equal(timers.at(-1).ms, LOADING_STATUS_DELAY_MS);
	timers.at(-1).fn();
	assert.equal(findAll(stage(), '.status').length, 1);
});

test('新しく開いたときだけユーザー情報の覚えを捨て、作品を送る間は保つ', async () => {
	// ページ側でフォローしてから開き直すと、覚えていた isFollowed が古いまま出てしまう。
	// 開いている間はページのボタンを押せないので、送るたびに捨てる必要は無い
	let cleared = 0;
	const { viewer } = setup({ clearUserCache: () => { cleared += 1; } });
	await viewer.open('1', fakeSequence(['1', '2']));
	assert.equal(cleared, 1);
	await viewer.open('2');
	assert.equal(cleared, 1);
	viewer.close();
	await viewer.open('1');
	assert.equal(cleared, 2);
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

test('開いている間だけ背後を inert にし、元から inert の要素は剥がさない', async () => {
	const { viewer, doc } = setup();
	const plain = enrich(fakeElement('div'));
	const already = enrich(fakeElement('div'));
	already.setAttribute('inert', '');
	doc.body.append(plain, already);
	await viewer.open('1');
	assert.equal(plain.getAttribute('inert'), '');
	assert.equal(already.getAttribute('inert'), '');
	assert.equal(doc.body.children[2].getAttribute('inert'), null, 'ホスト自身には付けない');
	viewer.close();
	assert.equal(plain.getAttribute('inert'), null, '自分が付けた分は外す');
	assert.equal(already.getAttribute('inert'), '', '元から付いていた分は剥がさない');
});

test('閉じたら keydown を document から外す', async () => {
	// 外し忘れると、閉じた後も pixiv 側の全キーを捕捉フェーズで奪い続ける
	const { viewer, doc } = setup();
	await viewer.open('1');
	assert.equal(doc.listeners.keydown.length, 1);
	viewer.close();
	assert.equal(doc.listeners.keydown.length, 0);
});

test('取得を待っている間に閉じたら、届いた応答で描かない', async () => {
	// 閉じた後は stage が無い。応答で描きに行くと例外になる
	let release;
	const { viewer, doc } = setup({
		getJsonImpl: () => new Promise((resolve) => { release = () => resolve(rawDetail('1')); }),
	});
	const opening = viewer.open('1');
	viewer.close();
	release();
	await opening;
	assert.equal(viewer.isOpen(), false);
	assert.equal(doc.body.children.length, 0);
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
	// .counter / .pane-error / .status は p だが、余白扱いにして閉じてはいけない
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

test('作品が見つからない (404) ときは、削除か非公開の可能性を伝える', async () => {
	// 削除済みや存在しない作品の /ajax/illust/{id} は 404 を返す
	const { viewer, stage } = setup({
		getJsonImpl: async () => { throw new PixivError(PIXIV_ERROR_KINDS.NOT_FOUND, 'not found', 404); },
	});
	await viewer.open('1');
	assert.equal(find(stage(), '.status').textContent, '作品が見つかりませんでした。削除されたか、非公開になった可能性があります');
});

test('通信そのものが失敗したときは、接続を確かめるよう伝える', async () => {
	const { viewer, stage } = setup({
		getJsonImpl: async () => { throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, 'network'); },
	});
	await viewer.open('1');
	assert.equal(find(stage(), '.status').textContent, '通信に失敗しました。接続を確かめてから開き直してください');
});

test('描画に失敗したら描きかけのペインを捨ててから文言を出す', async () => {
	// 主役の描画で落ちたときに .frame や .ugoira の横に文言が並ばないように
	// 画像ペインは枠をステージへ足した後に settings.imageQuality を読む。
	// そこで投げさせて「枠を足した後に落ちた」状態を作る
	const broken = settings();
	Object.defineProperty(broken, 'imageQuality', { get() { throw new Error('壊れた設定'); } });
	const { viewer, stage } = setup({ settings: broken });
	await viewer.open('1');
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

test('createViewer は strings を子へ渡す', async () => {
	const strings = createStrings('en');
	const { viewer, doc, shadow } = setup({ strings });
	await viewer.open('1');
	// ダイアログの読み上げ名は英語カタログの値になる。ホストの lang も揃える
	assert.equal(find(shadow(), '.overlay').getAttribute('aria-label'), `作品 1 - ${strings.viewer.DIALOG_LABEL}`);
	assert.equal(doc.body.children[0].lang, strings.lang);
	viewer.dispose();
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
	// document の捕捉フェーズで全キーを取っているので、入力欄を素通しにしないと
	// コメントを書いている最中の上下キーで作品が送られる。composedPath の先頭を入力欄にして確かめる
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

test('入力欄にフォーカスがある状態でも Tab はフォーカストラップに届く', async () => {
	// 入力欄の素通しが Tab まで止めると、フォーカスがモーダルの外 (背後の pixiv) へ抜けてしまう
	const { viewer, doc, shadow } = setup();
	await viewer.open('1');
	const first = enrich(doc.createElement('button'));
	const last = enrich(doc.createElement('button'));
	last.getClientRects = () => [{}];
	shadow().querySelectorAll = () => [first, last];
	shadow().activeElement = first;
	const event = {
		key: KEYS.FOCUS_NEXT,
		shiftKey: false,
		composedPath: () => [{ tagName: 'TEXTAREA' }],
		preventDefault() {},
	};
	await doc.dispatch('keydown', event);
	assert.equal(last.focused, true, 'Tab が navigation.onKeyDown まで届いて次へ巡回する');
});

test('入力欄が空なら Escape でビュワーを閉じる', async () => {
	// 入力欄の素通しが Escape まで止めると、書きかけの文章が無くても閉じなくなってしまう
	const { viewer, doc, closed } = setup();
	await viewer.open('1');
	const event = {
		key: KEYS.CLOSE,
		composedPath: () => [{ tagName: 'TEXTAREA' }],
		preventDefault() {},
		stopPropagation() {},
	};
	await doc.dispatch('keydown', event);
	assert.equal(closed(), 1);
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

test('巡回先が無くても Tab を素通しさせない', async () => {
	// 原寸表示で 1 枚の作品はクリック領域が hidden で巡回先が空になる。
	// 背後は inert でページ内に行き先が無く、素通しすると文書の外 (アドレスバー) へ抜ける
	const { viewer, doc, shadow } = setup();
	await viewer.open('1');
	shadow().querySelectorAll = () => [];
	let prevented = 0;
	await doc.dispatch('keydown', { key: KEYS.FOCUS_NEXT, shiftKey: false, preventDefault() { prevented += 1; } });
	assert.equal(prevented, 1);
});

/**
 * 隣の画像の温めに使う Image の代わりを作り、作ったものを記録する。
 * @returns {{createImage: () => object, images: object[]}} 工場と記録
 */
function imageRecorder() {
	const images = [];
	return {
		images,
		createImage: () => {
			const image = { src: '', fetchPriority: 'auto' };
			images.push(image);
			return image;
		},
	};
}

/**
 * 取得の URL から作品 ID を読む。
 * @param {string} url 取得の URL
 * @returns {string} 作品 ID
 */
function idOf(url) {
	return url.match(/illust\/(\d+)/)[1];
}

/**
 * 下キー (次の作品) の keydown の代わり。
 * @returns {object} event の代わり
 */
function nextWorkKey() {
	return { key: KEYS.NEXT_WORK, preventDefault() {}, stopPropagation() {} };
}

/**
 * 上キー (前の作品) の keydown の代わり。
 * @returns {object} event の代わり
 */
function prevWorkKey() {
	return { key: KEYS.PREV_WORK, preventDefault() {}, stopPropagation() {} };
}

/**
 * 指定した作品の詳細だけ応答を返さない getJsonImpl を作り、渡された signal を記録する。
 * @param {string} holdId 応答を返さない作品 ID
 * @returns {{getJsonImpl: Function, signals: Object<string, AbortSignal>}} 取得の代わりと記録
 */
function holdingFetch(holdId) {
	const signals = {};
	return {
		signals,
		getJsonImpl: (url, jsonDeps) => {
			const id = idOf(url);
			signals[id] = jsonDeps.signal;
			return id === holdId ? new Promise(() => {}) : Promise.resolve(rawDetail(id));
		},
	};
}

test('prefetchNeighbor が false なら隣を温めない', async () => {
	const { createImage, images } = imageRecorder();
	const { viewer, fetched } = setup({ createImage });
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja']);
	assert.equal(images.length, 0);
});

test('prefetchNeighbor が true なら描き終えた後に隣の詳細を 1 本取り、送ったときに使う', async () => {
	const { createImage, images } = imageRecorder();
	const { viewer, doc, fetched, shadow } = setup({ settings: settings({ prefetchNeighbor: true }), createImage });
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja', '/ajax/illust/2?lang=ja']);
	// 1 枚目を優先度を下げて読んでおく
	assert.equal(images.length, 1);
	assert.equal(images[0].src, REGULAR_URL);
	assert.equal(images[0].fetchPriority, 'low');
	await doc.dispatch('keydown', nextWorkKey());
	await flush();
	assert.equal(fetched.filter((url) => url.includes('/illust/2')).length, 1);
	assert.match(find(shadow(), '.overlay').getAttribute('aria-label'), /作品 2/);
});

test('隣の詳細は優先度を下げて取り、開いた作品の詳細は優先度を上げたまま', async () => {
	const inits = {};
	const { viewer } = setup({
		settings: settings({ prefetchNeighbor: true }),
		createImage: imageRecorder().createImage,
		getJsonImpl: async (url, jsonDeps, init) => {
			inits[idOf(url)] = init;
			return rawDetail(idOf(url));
		},
	});
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.deepEqual(inits['1'], { cache: 'no-cache', priority: 'high' });
	assert.deepEqual(inits['2'], { cache: 'no-cache', priority: 'low' });
});

test('隣の温めは開くときと同じ言語で取る', async () => {
	const { viewer, fetched } = setup({
		settings: settings({ prefetchNeighbor: true }),
		strings: createStrings('en'),
		createImage: imageRecorder().createImage,
	});
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=en', '/ajax/illust/2?lang=en']);
});

test('一度使った隣の先読みは捨て、戻って来たら取り直す', async () => {
	const { viewer, doc, fetched } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage });
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	await doc.dispatch('keydown', nextWorkKey());
	await flush();
	await doc.dispatch('keydown', prevWorkKey());
	await flush();
	await doc.dispatch('keydown', nextWorkKey());
	await flush();
	assert.equal(fetched.filter((url) => url.includes('/illust/2')).length, 2);
});

test('上へ送ったあとは前の向きを温める', async () => {
	const { viewer, doc, fetched } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage });
	await viewer.open('3', fakeSequence(['1', '2', '3', '4']));
	await flush();
	await doc.dispatch('keydown', prevWorkKey());
	await flush();
	// 3 を開いて 4 を温め、上へ送って 2 を開いたら、次は 1 を温める
	assert.deepEqual(fetched.map(idOf), ['3', '4', '2', '1']);
});

test('見られない作品は詳細だけで、画像は読まない', async () => {
	const { createImage, images } = imageRecorder();
	const fetched = [];
	const { viewer } = setup({
		settings: settings({ prefetchNeighbor: true }),
		createImage,
		// fakeDoc に __NEXT_DATA__ が無いので未ログイン扱い。R-18 は見られない
		getJsonImpl: async (url) => {
			fetched.push(url);
			const id = idOf(url);
			return rawDetail(id, id === '2' ? { xRestrict: 1 } : {});
		},
	});
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.equal(fetched.filter((url) => url.includes('/illust/2')).length, 1);
	assert.equal(images.length, 0);
});

test('隣がうごイラなら meta まで温め、開いたときに meta を取り直さない', async (t) => {
	// 再生器は zip を取りに行くので、zip は 403 で返して止める。失敗の warn は黙らせる
	t.mock.method(console, 'warn', () => {});
	// 閉じるときに再生器が rAF を取り消す。Node には無いので足し、終わったら外す
	globalThis.cancelAnimationFrame = () => {};
	t.after(() => { delete globalThis.cancelAnimationFrame; });
	const pageFetched = [];
	t.mock.method(globalThis, 'fetch', async (url) => {
		pageFetched.push(String(url));
		return { ok: false, status: 403 };
	});
	const { createImage, images } = imageRecorder();
	const fetched = [];
	const { viewer, doc } = setup({
		settings: settings({ prefetchNeighbor: true }),
		createImage,
		getJsonImpl: async (url) => {
			fetched.push(url);
			if (url.includes('ugoira_meta')) {
				return { src: 'https://i.pximg.net/img-zip-ugoira/img/x_ugoira600x600.zip', frames: [] };
			}
			const id = idOf(url);
			return rawDetail(id, id === '2' ? { illustType: 2 } : {});
		},
	});
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.deepEqual(fetched, ['/ajax/illust/1?lang=ja', '/ajax/illust/2?lang=ja', '/ajax/illust/2/ugoira_meta?lang=ja']);
	// zip も画像も温めない
	assert.equal(images.length, 0);
	assert.deepEqual(pageFetched, []);
	await doc.dispatch('keydown', nextWorkKey());
	await flush();
	assert.equal(fetched.filter((url) => url.includes('ugoira_meta')).length, 1);
	assert.equal(pageFetched.filter((url) => url.includes('ugoira_meta')).length, 0);
	assert.equal(pageFetched.length, 1, '再生器は zip だけを取りに行く');
	viewer.close();
});

test('閉じたら隣の先読みを止める', async () => {
	const { getJsonImpl, signals } = holdingFetch('2');
	const { viewer } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage, getJsonImpl });
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	assert.equal(signals['2'].aborted, false);
	viewer.close();
	assert.equal(signals['2'].aborted, true);
});

test('閉じたら温めている画像と meta も止める', async () => {
	const { createImage, images } = imageRecorder();
	let metaSignal = null;
	const { viewer } = setup({
		settings: settings({ prefetchNeighbor: true }),
		createImage,
		getJsonImpl: (url, jsonDeps) => {
			if (url.includes('ugoira_meta')) {
				metaSignal = jsonDeps.signal;
				return new Promise(() => {});
			}
			const id = idOf(url);
			return Promise.resolve(rawDetail(id, id === '3' ? { illustType: 2 } : {}));
		},
	});
	// 1 を開くと 2 (一枚絵) の画像を温める
	await viewer.open('1', fakeSequence(['1', '2', '3']));
	await flush();
	assert.equal(images[0].src, REGULAR_URL);
	viewer.close();
	assert.equal(images[0].src, '');
	// 2 を開くと 3 (うごイラ) の meta を温める
	await viewer.open('2', fakeSequence(['1', '2', '3']));
	await flush();
	assert.ok(metaSignal);
	assert.equal(metaSignal.aborted, false);
	viewer.close();
	assert.equal(metaSignal.aborted, true);
	// Image は作り直さず 1 つを使い回す
	assert.equal(images.length, 1);
});

test('先読みを使って開いた作品の取得も、閉じたときに止める', async () => {
	const { getJsonImpl, signals } = holdingFetch('2');
	const { viewer, doc } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage, getJsonImpl });
	await viewer.open('1', fakeSequence(['1', '2', '3']));
	await flush();
	await doc.dispatch('keydown', nextWorkKey());
	// 2 は温めた取得をそのまま待っている
	assert.equal(signals['2'].aborted, false);
	viewer.close();
	assert.equal(signals['2'].aborted, true);
});

test('先読みを使って開いた作品の取得も、次に送ったときに止める', async () => {
	const { getJsonImpl, signals } = holdingFetch('2');
	const { viewer } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage, getJsonImpl });
	await viewer.open('1', fakeSequence(['1', '2', '3']));
	await flush();
	void viewer.open('2');
	assert.equal(signals['2'].aborted, false);
	void viewer.open('3');
	assert.equal(signals['2'].aborted, true);
	viewer.close();
});

test('隣の詳細が届く前に別の作品へ移ったら、その画像は読まない', async () => {
	const { createImage, images } = imageRecorder();
	let release = null;
	const { viewer, doc } = setup({
		settings: settings({ prefetchNeighbor: true }),
		createImage,
		getJsonImpl: (url) => {
			const id = idOf(url);
			if (id === '2') return new Promise((resolve) => { release = () => resolve(rawDetail('2')); });
			return Promise.resolve(rawDetail(id));
		},
	});
	await viewer.open('1', fakeSequence(['0', '1', '2']));
	await flush();
	await doc.dispatch('keydown', prevWorkKey());
	await flush();
	release();
	await flush();
	assert.equal(images.length, 0);
});

test('隣の先読みが失敗していたら、開くときに取り直す', async () => {
	const fetched = [];
	let failNext = true;
	const { viewer, doc, stage } = setup({
		settings: settings({ prefetchNeighbor: true }),
		createImage: imageRecorder().createImage,
		getJsonImpl: async (url) => {
			fetched.push(url);
			const id = idOf(url);
			if (id === '2' && failNext) {
				failNext = false;
				throw new PixivError(PIXIV_ERROR_KINDS.NETWORK, 'offline');
			}
			return rawDetail(id);
		},
	});
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	await doc.dispatch('keydown', nextWorkKey());
	await flush();
	assert.equal(fetched.filter((url) => url.includes('/illust/2')).length, 2);
	assert.equal(findAll(stage(), '.status').length, 0);
	assert.equal(findAll(stage(), '.frame').length, 1);
});

test('prefetchNeighbor を切ったら温めている途中の取得を止める', async () => {
	const { getJsonImpl, signals } = holdingFetch('2');
	const { viewer } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage, getJsonImpl });
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	viewer.setSettings(settings({ prefetchNeighbor: false }));
	assert.equal(signals['2'].aborted, true);
});

test('新しい並びで開き直したら隣の先読みを捨てる', async () => {
	const { getJsonImpl, signals } = holdingFetch('2');
	const { viewer } = setup({ settings: settings({ prefetchNeighbor: true }), createImage: imageRecorder().createImage, getJsonImpl });
	await viewer.open('1', fakeSequence(['1', '2']));
	await flush();
	const warmSignal = signals['2'];
	void viewer.open('2', fakeSequence(['9', '2']));
	assert.equal(warmSignal.aborted, true);
	// 温めた分は使わず取り直す
	assert.notEqual(signals['2'], warmSignal);
	viewer.close();
});
