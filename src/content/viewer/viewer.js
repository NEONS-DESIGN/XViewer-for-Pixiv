/**
 * モーダルビュワー本体。
 *
 * pixiv の CSS と相互に干渉しないよう Shadow DOM の中に閉じ込める。
 * 開く・閉じるとキーボード操作だけを持ち、中身の描画は各ペインに任せる。
 */
// 配色トークン (common/tokens.css) は設定画面と共通。viewer.css より前に置き、変数を先に定義する
import tokensCss from '../../common/tokens.css';
import viewerCss from './viewer.css';
import {
	HOST_ELEMENT_ID,
	FOCUSABLE_SELECTOR,
	HIDDEN_SELECTOR,
	INERT_ATTRIBUTE,
	POPUP_THEMES,
	SIDEBAR_SCROLL,
	STATUS_KINDS,
	INERT_SELECTOR,
} from '../../common/constants.js';
import { createIcon } from '../../common/icons.js';
import { warn } from '../../common/log.js';
import { getJson } from '../../pixiv/client.js';
import { illustUrl } from '../../pixiv/endpoints.js';
import { normalizeDetail } from '../../pixiv/normalize.js';
import { readSession } from '../session.js';
import { renderWork, disposeAll, movePage, consumeKey } from './panes.js';
import { createZoomLayer } from './zoom.js';
import { createNavigation } from './navigation.js';

/** ホストページのスクロールを止めるために body へ付ける style。 */
const BODY_LOCK_STYLE = 'overflow:hidden';

/**
 * 設定のうち、変わったら今開いている作品を描き直す必要があるもの。
 * closeOnBackdrop は押されたときに読むので入れない。popupTheme はビュワーに関係ない
 */
const RERENDER_SETTING_KEYS = Object.freeze(['imageQuality', 'prefetch', 'showSidebar', 'clickZoom']);

/**
 * ステージの中で押しても閉じない要素。
 *
 * ステージの余白を押すと閉じるが、主役のペイン (.frame / .ugoira / .blocked) は
 * ステージ一杯に広がっているので「押された要素がステージ自身か」では判定できない。
 * 代わりに「画像そのものと操作部品と文言の上でなければ余白」とみなす。
 * `.blocked-backdrop` は見られない作品の背後に敷くぼかしで、画像本体ではないので除く。
 * `.counter` (1/32) と `.pane-error` / `.status` (文言) は p なので、入れておかないと
 * 読もうとして押しただけで閉じる。
 */
const KEEP_OPEN_SELECTOR = [
	'img:not(.blocked-backdrop)',
	'canvas',
	'video',
	'button',
	'a',
	'.blocked-panel',
	'.counter',
	'.pane-error',
	'.status',
].join(', ');

/** 利用者に見せる文言。 */
const MESSAGES = Object.freeze({
	DIALOG_LABEL: '作品ビュワー',
	CLOSE: '閉じる',
	CLOSE_TITLE: '閉じる (Esc)',
	LOADING: '読み込み中...',
	LOAD_FAILED: '作品を読み込めませんでした',
});

/**
 * @typedef {object} ViewerDeps
 * @property {Document} doc 対象のドキュメント
 * @property {object} settings 設定
 * @property {() => void} onRequestClose 閉じたいときに呼ばれる (履歴を戻す役は呼び出し側)
 * @property {(workId: string) => void} onNavigate 上下キーで作品が切り替わったときに呼ばれる (URL の差し替えは呼び出し側)
 * @property {() => boolean} canExtendSequence グリッドの端で全作品の並びへ広げてよいか (タグ絞り込み中は false)
 * @property {(current: import('../sequence.js').Sequence) => Promise<import('../sequence.js').Sequence>} extendSequence 端で全作品の並びへ広げる
 * @property {(url: string) => Promise<object>} [getJsonImpl] 作品詳細の取得。テストから通信させないために使う
 * @property {(userId: string) => Promise<object>} [fetchUser] 作者情報の取得。テストから通信させないために使う
 */

/**
 * 要素が描画されているか。
 * display: none の要素 (幅 900px 以下で畳んだサイドバー等) は focus() が無言で失敗するので、
 * Tab の巡回から外す。偽の DOM のように getClientRects を持たない相手は描画済みとみなす。
 * @param {Element} element 対象
 * @returns {boolean} 描画されていれば true
 */
function isRendered(element) {
	if (typeof element.getClientRects !== 'function') return true;
	return element.getClientRects().length > 0;
}

/**
 * 押された相手が「押しても閉じない要素」の中にあるか。
 * テキストノードや Shadow DOM の境界で closest を持たない相手が来ることがある。
 * @param {EventTarget|null} target 押された相手
 * @returns {boolean} 閉じない要素の中なら true
 */
function keepsOpen(target) {
	return typeof target?.closest === 'function' && Boolean(target.closest(KEEP_OPEN_SELECTOR));
}

/**
 * ビュワーを作る。
 * 生成した時点では画面に何も出さない。open() で初めて表示する。
 * @param {ViewerDeps} deps 依存
 * @returns {{open: (workId: string, nextSequence?: import('../sequence.js').Sequence) => Promise<void>, close: () => void, isOpen: () => boolean, dispose: () => void, setSettings: (s: object) => void}}
 */
export function createViewer(deps) {
	const { doc } = deps;
	const fetchJson = deps.getJsonImpl ?? getJson;
	let settings = deps.settings;

	/** @type {HTMLElement|null} */
	let host = null;
	/** @type {ShadowRoot|null} */
	let shadow = null;
	/** @type {HTMLElement|null} role="dialog" の入れ物。作品名を aria-label に写す */
	let overlay = null;
	/** @type {HTMLElement|null} */
	let stage = null;
	/** @type {HTMLElement|null} */
	let sidebar = null;
	/** @type {HTMLButtonElement|null} 閉じるボタン。開いた直後のフォーカス先 */
	let closeButton = null;
	/** @type {ReturnType<typeof createZoomLayer>|null} 原寸表示のレイヤ。ホストと一緒に作る */
	let zoomLayer = null;
	/** 開く要求の世代。await をまたいで古い応答を捨てるために使う */
	let requestToken = 0;
	/** @type {object|null} 最後に描いた作品詳細。設定が変わったときに通信なしで描き直すために持つ */
	let lastDetail = null;
	/** @type {Element|null} 開く前にフォーカスがあった要素。閉じたら戻す */
	let previousFocus = null;
	/** @type {Element[]} 自分が inert を付けた要素。元から付いていた分は触らない */
	let inertTargets = [];
	/** 閉じたときに戻す body の style */
	let savedBodyStyle = '';
	/** @type {EventTarget|null} ステージの中で押し始めた要素。click の相手と合わせて余白かどうかを見る */
	let pressTarget = null;
	// 作品間の移動とキー操作の割り振りは navigation.js が持つ。
	// ここに残るのはホストの構築と描画の指揮だけ
	const navigation = createNavigation({
		openWork: (workId) => openWork(workId),
		isOpen: () => host !== null,
		onRequestClose: () => deps.onRequestClose(),
		onNavigate: (workId) => deps.onNavigate(workId),
		canExtendSequence: () => deps.canExtendSequence(),
		extendSequence: (current) => deps.extendSequence(current),
		movePage,
		focusNext: (event) => trapFocus(event),
	});

	/**
	 * ホストと Shadow DOM を用意する。
	 * @returns {void}
	 */
	function ensureHost() {
		if (host) return;
		host = doc.createElement('div');
		host.id = HOST_ELEMENT_ID;
		shadow = host.attachShadow({ mode: 'open' });

		const style = doc.createElement('style');
		style.textContent = tokensCss + viewerCss;
		shadow.appendChild(style);

		overlay = doc.createElement('div');
		overlay.className = 'overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', MESSAGES.DIALOG_LABEL);
		// 開いたときのフォーカスの受け皿。ダイアログを名乗る以上、開いたら中へフォーカスを
		// 入れないと読み上げが文脈を失う。中のボタンではなく本体で受けるので、
		// 十字キーを押したときにどのボタンにも輪郭が出ない (§10.4)。
		// tabindex="-1" なので FOCUSABLE_SELECTOR には入らず、Tab の巡回先にはならない
		overlay.setAttribute('tabindex', '-1');

		stage = doc.createElement('div');
		stage.className = 'stage';

		closeButton = doc.createElement('button');
		closeButton.className = 'close';
		closeButton.type = 'button';
		// アイコンだけのボタンには必ず両方付ける (UI_DESIGN_KIT §6)
		closeButton.setAttribute('aria-label', MESSAGES.CLOSE);
		closeButton.title = MESSAGES.CLOSE_TITLE;
		closeButton.appendChild(createIcon(doc, 'close'));
		closeButton.addEventListener('click', () => deps.onRequestClose());

		sidebar = doc.createElement('div');
		sidebar.className = 'sidebar';

		stage.appendChild(closeButton);
		overlay.appendChild(stage);
		overlay.appendChild(sidebar);
		shadow.appendChild(overlay);

		// 背景 (画像とサイドバーの間の余白) を押すと閉じる。画像そのものでは閉じない。
		// click は押し始めと離した先が違うと両者の共通祖先で発火するので、
		// 画像の上で押して余白で離した (つまもうとした・誤ドラッグ) だけでは閉じないよう、
		// 押し始めの要素も覚えておいて両方が余白のときだけ閉じる
		stage.addEventListener('pointerdown', (event) => { pressTarget = event.target; });
		stage.addEventListener('click', (event) => {
			const pressed = pressTarget;
			pressTarget = null;
			if (!settings.closeOnBackdrop) return;
			if (keepsOpen(event.target) || keepsOpen(pressed)) return;
			deps.onRequestClose();
		});

		// 原寸表示は overlay の直下に敷く。ステージの中に入れるとサイドバーが上に残る。
		// 閉じたらフォーカスはダイアログ本体へ戻す (レイヤの中の部品ごと消えるため)
		zoomLayer = createZoomLayer({ doc, container: overlay, restoreFocus: () => overlay?.focus() });

		doc.body.appendChild(host);
	}

	/**
	 * ホストページのテーマをモーダルへ写す。
	 * 開いたままでもホスト側は切り替わるので、作品を開くたびに読み直す。
	 * @returns {void}
	 */
	function applyTheme() {
		if (!host) return;
		// 値の語彙は popup と同じ (light / dark)。light 以外はすべてダークに倒す
		host.dataset.theme = doc.documentElement.dataset.theme === POPUP_THEMES.LIGHT
			? POPUP_THEMES.LIGHT
			: POPUP_THEMES.DARK;
	}

	/**
	 * サイドバーの送り方を属性へ写す。中身は CSS が切り替える。
	 * 描き直しは要らないので、設定が変わったらその場で書き換える。
	 * @returns {void}
	 */
	function applySidebarScroll() {
		if (!host) return;
		// 値の語彙は設定と同じ。既定 (comments) 以外はすべて whole に倒す
		host.dataset.sidebarScroll = settings.sidebarScroll === SIDEBAR_SCROLL.WHOLE
			? SIDEBAR_SCROLL.WHOLE
			: SIDEBAR_SCROLL.COMMENTS;
	}

	/**
	 * ホストページのスクロールを止める。
	 *
	 * overflow: hidden でスクロールバーが消えると、背後のページがその幅だけ広がって見える。
	 * 消える前のスクロールバーの幅を測り、同じだけ padding-right を足して横幅を動かさない
	 * (X.com と同じ補正)。測れない環境 (偽の DOM) では 0 として扱う。
	 * @returns {void}
	 */
	function lockBody() {
		savedBodyStyle = doc.body.getAttribute('style') ?? '';
		const viewportWidth = doc.defaultView?.innerWidth ?? 0;
		const contentWidth = doc.documentElement?.clientWidth ?? 0;
		const gutter = Math.max(0, viewportWidth - contentWidth);
		const compensation = gutter > 0 ? `;padding-right:${gutter}px` : '';
		doc.body.setAttribute('style', `${savedBodyStyle};${BODY_LOCK_STYLE}${compensation}`);
	}

	/**
	 * lockBody() で変えた body の style を戻す。
	 * @returns {void}
	 */
	function unlockBody() {
		if (savedBodyStyle) doc.body.setAttribute('style', savedBodyStyle);
		else doc.body.removeAttribute('style');
		// 次に開くときへ持ち越さない。持ち越すと 2 回目に古い値を書き戻す
		savedBodyStyle = '';
	}

	/**
	 * モーダルの背後を Tab と読み上げから外す。
	 * 自分が付けた要素だけを覚え、元から inert だった要素は閉じるときに剥がさない。
	 * 対象は開いた時点で body の直下にある要素だけ。後から足されたもの (トースト等) は見ない。
	 * @returns {void}
	 */
	function lockBackground() {
		inertTargets = [];
		for (const element of Array.from(doc.body.children)) {
			if (element === host) continue;
			if (element.hasAttribute(INERT_ATTRIBUTE)) continue;
			element.setAttribute(INERT_ATTRIBUTE, '');
			inertTargets.push(element);
		}
	}

	/**
	 * lockBackground() で付けた inert を外す。
	 * @returns {void}
	 */
	function unlockBackground() {
		for (const element of inertTargets) element.removeAttribute(INERT_ATTRIBUTE);
		inertTargets = [];
	}

	/**
	 * Tab のフォーカスを Shadow DOM の中だけで巡回させる。
	 * FOCUSABLE_SELECTOR が disabled を除いているので、ここでは
	 * 隠れているものと inert の中のもの (原寸表示中の背後) だけを外す。
	 * @param {KeyboardEvent} event キー
	 * @returns {void}
	 */
	function trapFocus(event) {
		if (!shadow) return;
		const focusable = Array.from(shadow.querySelectorAll(FOCUSABLE_SELECTOR))
			.filter((element) => !element.closest(HIDDEN_SELECTOR)
				&& !element.closest(INERT_SELECTOR)
				&& isRendered(element));
		if (focusable.length === 0) return;
		event.preventDefault();
		const step = event.shiftKey ? -1 : 1;
		const current = focusable.indexOf(shadow.activeElement);
		// 中にフォーカスが無ければ端から入れる。端まで来たら折り返して外へ出さない
		const next = current < 0
			? (step > 0 ? 0 : focusable.length - 1)
			: (current + step + focusable.length) % focusable.length;
		focusable[next].focus();
	}

	/**
	 * ステージの状態表示を消す。
	 * ペインは自分の DOM を自分で片付けるので、ビュワーが出した文言はビュワーが消す。
	 * @returns {void}
	 */
	function clearStatus() {
		stage?.querySelectorAll('.status').forEach((node) => node.remove());
	}

	/**
	 * ステージに文言を出す。読み込み中と失敗の表示に使う。
	 * @param {string} message 文言
	 * @param {string} kind 種別 (STATUS_KINDS)
	 * @returns {void}
	 */
	function showStatus(message, kind) {
		const status = doc.createElement('p');
		status.className = 'status';
		status.dataset.kind = kind;
		if (kind === STATUS_KINDS.ERROR) status.setAttribute('role', 'alert');
		status.textContent = message;
		clearStatus();
		stage.appendChild(status);
	}

	/**
	 * キーボード操作。
	 *
	 * キーは手前に出ているものから順に使わせる。
	 * 原寸表示 (画面全体を覆う) が最優先で、次がサイドバーの部品 (シェアメニュー)。
	 * 開いているメニューを閉じたつもりでモーダルごと閉じる、メニューの項目を
	 * 下キーで送ったつもりで次の作品へ移る、を防ぐ。
	 * @param {KeyboardEvent} event キー
	 * @returns {void}
	 */
	function onKeyDown(event) {
		if (zoomLayer?.consumeKey(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (consumeKey(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		navigation.onKeyDown(event);
	}

	/**
	 * 作品詳細を描く。取得済みの detail からペインを組み立てる部分だけを持つ。
	 * 失敗したら描きかけのペインを捨ててから文言を出す。
	 * 捨てないと、主役の描画で落ちたときに .frame や .ugoira の横に文言が並ぶ。
	 * @param {object} detail 正規化した作品詳細
	 * @param {number} token 呼び出し時点の世代。違っていれば失敗も報告しない
	 * @returns {Promise<void>}
	 */
	async function renderDetail(detail, token) {
		try {
			clearStatus();
			overlay.setAttribute('aria-label', `${detail.title} - ${MESSAGES.DIALOG_LABEL}`);
			await renderWork(detail, readSession(doc), settings, {
				doc,
				stage,
				sidebar,
				zoom: zoomLayer,
				fetchUser: deps.fetchUser,
			});
		} catch (error) {
			if (token !== requestToken) return;
			zoomLayer?.close();
			disposeAll();
			showStatus(MESSAGES.LOAD_FAILED, STATUS_KINDS.ERROR);
			warn('failed to render', detail.id, error);
		}
	}

	/**
	 * 作品を開く (内部)。
	 * @param {string} workId 作品 ID
	 * @returns {Promise<void>}
	 */
	async function openWork(workId) {
		const token = ++requestToken;
		navigation.setCurrentWorkId(workId);
		// 既に開いている状態で body を再ロックすると、ロック済みの style を
		// 「元の値」として保存してしまい、閉じたあとスクロールが戻らなくなる。
		// 作品間を移動するときは open() が close() を挟まずに呼ばれる
		const wasOpen = host !== null;
		if (!wasOpen) previousFocus = doc.activeElement;
		ensureHost();
		// テーマは毎回読み直す。開いたままホスト側で切り替えられても追従させる
		applyTheme();
		applySidebarScroll();
		if (!wasOpen) {
			lockBody();
			doc.addEventListener('keydown', onKeyDown, true);
			lockBackground();
		}

		// 古いペインは取得を待つ前に必ず捨てる。
		// 読み込み中のサイドバーの見え方も設定どおりにしておく (renderWork でも改めて設定する)。
		// 原寸表示も一緒に閉じる。開いたまま作品を移ると、次の作品の原寸画像を毎回読むことになる
		zoomLayer?.close();
		disposeAll();
		// 開いた直後のキー操作がモーダルへ届くようにする。
		// 作品を送ったときは押していたボタンがペインごと消えてフォーカスが body へ落ちるので、
		// 中に無くなっていたらダイアログ本体へ戻す (読み上げが文脈を失わないように)。
		// 閉じるボタンなど中の部品へ当てないこと。次にキーを押した瞬間に :focus-visible が立ち、
		// 十字キーでフォーカスが動いたように見える (§10.4)
		if (!shadow.activeElement) overlay?.focus();
		sidebar.hidden = !settings.showSidebar;
		showStatus(MESSAGES.LOADING, STATUS_KINDS.INFO);

		let detail;
		try {
			const raw = await fetchJson(illustUrl(workId));
			// 待っている間に新しい要求が来ていたら捨てる。
			// 同じ作品を開き直したときも古い応答を捨てられるよう、ID ではなく世代で見る
			if (token !== requestToken) return;
			detail = normalizeDetail(raw);
		} catch (error) {
			if (token !== requestToken) return;
			showStatus(MESSAGES.LOAD_FAILED, STATUS_KINDS.ERROR);
			warn('failed to open', workId, error);
			return;
		}
		lastDetail = detail;
		await renderDetail(detail, token);
	}

	/**
	 * 閉じる。DOM は捨てて資源を残さない。
	 * @returns {void}
	 */
	function close() {
		// 開いていないのに body の style を触ると、ビュワーを開かずに
		// ブラウザバックしただけで pixiv 本体のインラインスタイルを消してしまう
		if (host === null) return;
		navigation.reset();
		// 取得の途中で閉じたときに、応答が返ってから描き直さないようにする
		requestToken += 1;
		lastDetail = null;
		pressTarget = null;
		doc.removeEventListener('keydown', onKeyDown, true);
		unlockBody();
		unlockBackground();
		zoomLayer?.dispose();
		zoomLayer = null;
		disposeAll();
		host.remove();
		host = null;
		shadow = null;
		overlay = null;
		stage = null;
		sidebar = null;
		closeButton = null;
		// 元いたサムネイルへ戻す。差し替えで消えていることがあるので繋がりを確かめる
		if (previousFocus && doc.contains(previousFocus)) previousFocus.focus?.();
		previousFocus = null;
	}

	return {
		/**
		 * 作品を開く。
		 * @param {string} workId 作品 ID
		 * @param {import('../sequence.js').Sequence} [nextSequence] 新しい並び。渡されたときだけ差し替える
		 * @returns {Promise<void>}
		 */
		async open(workId, nextSequence) {
			if (nextSequence) navigation.setSequence(nextSequence);
			await openWork(workId);
		},

		close,

		isOpen() {
			return host !== null;
		},

		/**
		 * 設定を差し替える。popup で変えた値を即座に反映するため。
		 * 描画に効く項目が変わっていて作品を開いていれば、その作品を描き直す。
		 * ペインは生成時の設定を掴んでいるので、差し替えるだけでは今の作品に効かない。
		 * 描き直しは覚えている作品詳細から行い、通信はしない。
		 * 取得の途中 (覚えている詳細が今の作品と違う) なら取得からやり直す
		 * @param {object} next 新しい設定
		 * @returns {void}
		 */
		setSettings(next) {
			const previous = settings;
			settings = next;
			const workId = navigation.currentWorkId();
			if (!host || !workId) return;
			// 送り方は CSS だけで切り替わる。描き直すと読んでいた位置が飛ぶので属性だけ差し替える
			applySidebarScroll();
			if (!RERENDER_SETTING_KEYS.some((key) => previous[key] !== next[key])) return;
			if (!lastDetail || String(lastDetail.id) !== String(workId)) {
				void openWork(workId);
				return;
			}
			const token = ++requestToken;
			zoomLayer?.close();
			disposeAll();
			void renderDetail(lastDetail, token);
		},

		// close と同じ。呼び出し側 (main.js) の撤去の作法に合わせた別名
		dispose: close,
	};
}
