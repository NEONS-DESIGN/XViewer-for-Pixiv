/**
 * モーダルビュワー本体。
 *
 * pixiv の CSS と相互に干渉しないよう Shadow DOM の中に閉じ込める。
 * 開く・閉じるとキーボード操作だけを持ち、中身の描画は各ペインに任せる。
 */
import viewerCss from './viewer.css';
import {
	HOST_ELEMENT_ID,
	FOCUSABLE_SELECTOR,
	HIDDEN_SELECTOR,
	INERT_ATTRIBUTE,
} from '../../common/constants.js';
import { createIcon } from '../../common/icons.js';
import { getJson } from '../../pixiv/client.js';
import { illustUrl } from '../../pixiv/endpoints.js';
import { normalizeDetail } from '../../pixiv/normalize.js';
import { readSession } from '../session.js';
import { renderWork, disposeAll, movePage } from './panes.js';
import { createNavigation } from './navigation.js';

/** ホストページのスクロールを止めるために body へ付ける style。 */
const BODY_LOCK_STYLE = 'overflow:hidden';

/** テーマの値。ホストページの data-theme と合わせてある。 */
const THEME = Object.freeze({ LIGHT: 'light', DARK: 'dark' });

/**
 * ステージの中で押しても閉じない要素。
 *
 * ステージの余白を押すと閉じるが、主役のペイン (.frame / .ugoira / .blocked) は
 * ステージ一杯に広がっているので「押された要素がステージ自身か」では判定できない。
 * 代わりに「画像そのものと操作部品の上でなければ余白」とみなす。
 * `.blocked-backdrop` は見られない作品の背後に敷くぼかしで、画像本体ではないので除く。
 */
const KEEP_OPEN_SELECTOR = 'img:not(.blocked-backdrop), canvas, video, button, a, .blocked-panel';

/**
 * @typedef {object} ViewerDeps
 * @property {Document} doc 対象のドキュメント
 * @property {object} settings 設定
 * @property {() => void} onRequestClose 閉じたいときに呼ばれる (履歴を戻す役は呼び出し側)
 * @property {(workId: string) => void} onNavigate 上下キーで作品が切り替わったときに呼ばれる (URL の差し替えは呼び出し側)
 * @property {() => boolean} canExtendSequence グリッドの端で全作品の並びへ広げてよいか (タグ絞り込み中は false)
 * @property {(current: import('../sequence.js').Sequence) => Promise<import('../sequence.js').Sequence>} extendSequence 端で全作品の並びへ広げる
 */

/**
 * ビュワーを作る。
 * 生成した時点では画面に何も出さない。open() で初めて表示する。
 * @param {ViewerDeps} deps 依存
 * @returns {{open: (workId: string, nextSequence?: import('../sequence.js').Sequence) => Promise<void>, close: () => void, isOpen: () => boolean, dispose: () => void, setSettings: (s: object) => void}}
 */
export function createViewer(deps) {
	const { doc } = deps;
	let settings = deps.settings;

	/** @type {HTMLElement|null} */
	let host = null;
	/** @type {ShadowRoot|null} */
	let shadow = null;
	/** @type {HTMLElement|null} */
	let stage = null;
	/** @type {HTMLElement|null} */
	let sidebar = null;
	/** @type {HTMLButtonElement|null} 閉じるボタン。開いた直後のフォーカス先 */
	let closeButton = null;
	/** 開く要求の世代。await をまたいで古い応答を捨てるために使う */
	let requestToken = 0;
	/** @type {Element|null} 開く前にフォーカスがあった要素。閉じたら戻す */
	let previousFocus = null;
	/** @type {Element[]} 自分が inert を付けた要素。元から付いていた分は触らない */
	let inertTargets = [];
	/** 閉じたときに戻す body の style */
	let savedBodyStyle = '';
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
		style.textContent = viewerCss;
		shadow.appendChild(style);

		const overlay = doc.createElement('div');
		overlay.className = 'overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', '作品ビュワー');

		stage = doc.createElement('div');
		stage.className = 'stage';

		closeButton = doc.createElement('button');
		closeButton.className = 'close';
		closeButton.type = 'button';
		// アイコンだけのボタンには必ず両方付ける (UI_DESIGN_KIT §6)
		closeButton.setAttribute('aria-label', '閉じる');
		closeButton.title = '閉じる (Esc)';
		closeButton.appendChild(createIcon(doc, 'close'));
		closeButton.addEventListener('click', () => deps.onRequestClose());

		sidebar = doc.createElement('div');
		sidebar.className = 'sidebar';

		stage.appendChild(closeButton);
		overlay.appendChild(stage);
		overlay.appendChild(sidebar);
		shadow.appendChild(overlay);

		// 背景 (画像とサイドバーの間の余白) を押すと閉じる。画像そのものでは閉じない
		stage.addEventListener('click', (event) => {
			if (!settings.closeOnBackdrop) return;
			// テキストノードや Shadow DOM の境界で closest を持たない相手が来ることがある
			const target = event.target;
			if (typeof target?.closest === 'function' && target.closest(KEEP_OPEN_SELECTOR)) return;
			deps.onRequestClose();
		});

		doc.body.appendChild(host);
	}

	/**
	 * ホストページのテーマをモーダルへ写す。
	 * 開いたままでもホスト側は切り替わるので、作品を開くたびに読み直す。
	 * @returns {void}
	 */
	function applyTheme() {
		if (!host) return;
		host.dataset.theme = doc.documentElement.dataset.theme === THEME.LIGHT ? THEME.LIGHT : THEME.DARK;
	}

	/**
	 * モーダルの背後を Tab と読み上げから外す。
	 * 自分が付けた要素だけを覚え、元から inert だった要素は閉じるときに剥がさない。
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
	 * @param {KeyboardEvent} event キー
	 * @returns {void}
	 */
	function trapFocus(event) {
		if (!shadow) return;
		const focusable = Array.from(shadow.querySelectorAll(FOCUSABLE_SELECTOR))
			.filter((element) => !element.closest(HIDDEN_SELECTOR) && !element.disabled);
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
	 * ステージに文言を出す。読み込み中と失敗の表示に使う。
	 * @param {string} message 文言
	 * @param {'info'|'error'} kind 種別
	 * @returns {void}
	 */
	function showStatus(message, kind) {
		const status = doc.createElement('p');
		status.className = 'status';
		status.dataset.kind = kind;
		if (kind === 'error') status.setAttribute('role', 'alert');
		status.textContent = message;
		// ペインは自分の DOM を自分で片付けるので、ここは状態表示だけを消す
		stage.querySelectorAll('.status').forEach((node) => node.remove());
		stage.appendChild(status);
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
		if (!wasOpen) {
			savedBodyStyle = doc.body.getAttribute('style') ?? '';
			doc.body.setAttribute('style', `${savedBodyStyle};${BODY_LOCK_STYLE}`);
			doc.addEventListener('keydown', navigation.onKeyDown, true);
			lockBackground();
			// 開いた直後のキー操作がモーダルへ届くようにする
			closeButton?.focus();
		}

		// 古いペインは取得を待つ前に必ず捨てる。
		// 読み込み中のサイドバーの見え方も設定どおりにしておく (renderWork でも改めて設定する)
		disposeAll();
		sidebar.hidden = !settings.showSidebar;
		showStatus('読み込み中...', 'info');

		try {
			const raw = await getJson(illustUrl(workId));
			// 待っている間に新しい要求が来ていたら捨てる。
			// 同じ作品を開き直したときも古い応答を捨てられるよう、ID ではなく世代で見る
			if (token !== requestToken) return;
			const detail = normalizeDetail(raw);
			const session = readSession(doc);
			await renderWork(detail, session, settings, {
				doc,
				stage,
				sidebar,
				onError: (message) => showStatus(message, 'error'),
				// renderWork の内側の await をまたぐ間に別の作品へ移ったかを見せる
				isStale: () => token !== requestToken,
			});
		} catch (error) {
			if (token !== requestToken) return;
			showStatus('作品を読み込めませんでした', 'error');
			console.warn('[PixivMaster] failed to open', workId, error);
		}
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

		/**
		 * 閉じる。DOM は捨てて資源を残さない。
		 * @returns {void}
		 */
		close() {
			// 開いていないのに body の style を触ると、ビュワーを開かずに
			// ブラウザバックしただけで pixiv 本体のインラインスタイルを消してしまう
			if (host === null) return;
			navigation.reset();
			// 取得の途中で閉じたときに、応答が返ってから描き直さないようにする
			requestToken += 1;
			doc.removeEventListener('keydown', navigation.onKeyDown, true);
			if (savedBodyStyle) doc.body.setAttribute('style', savedBodyStyle);
			else doc.body.removeAttribute('style');
			// 次に開くときへ持ち越さない。持ち越すと 2 回目に古い値を書き戻す
			savedBodyStyle = '';
			unlockBackground();
			disposeAll();
			host.remove();
			host = null;
			shadow = null;
			stage = null;
			sidebar = null;
			closeButton = null;
			// 元いたサムネイルへ戻す。差し替えで消えていることがあるので繋がりを確かめる
			if (previousFocus && doc.contains(previousFocus)) previousFocus.focus?.();
			previousFocus = null;
		},

		isOpen() {
			return host !== null;
		},

		/**
		 * 設定を差し替える。popup で変えた値を即座に反映するため。
		 * @param {object} next 新しい設定
		 * @returns {void}
		 */
		setSettings(next) {
			settings = next;
		},

		dispose() {
			this.close();
		},
	};
}
