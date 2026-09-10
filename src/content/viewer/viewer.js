/**
 * モーダルビュワー本体。
 *
 * pixiv の CSS と相互に干渉しないよう Shadow DOM の中に閉じ込める。
 * 開く・閉じるとキーボード操作だけを持ち、中身の描画は各ペインに任せる。
 */
import viewerCss from './viewer.css';
import { HOST_ELEMENT_ID, KEYS } from '../../common/constants.js';
import { createIcon } from '../../common/icons.js';
import { getJson } from '../../pixiv/client.js';
import { illustUrl } from '../../pixiv/endpoints.js';
import { normalizeDetail, canView } from '../../pixiv/normalize.js';
import { readSession } from '../../pixiv/session.js';
import { createImagePane } from './image-pane.js';
import { createSidebar } from './sidebar.js';

/** ホストページのスクロールを止めるために body へ付ける style。 */
const BODY_LOCK_STYLE = 'overflow:hidden';

/**
 * @typedef {object} ViewerDeps
 * @property {Document} doc 対象のドキュメント
 * @property {object} settings 設定
 * @property {() => void} onRequestClose 閉じたいときに呼ばれる (履歴を戻す役は呼び出し側)
 */

/**
 * ビュワーを作る。
 * 生成した時点では画面に何も出さない。open() で初めて表示する。
 * @param {ViewerDeps} deps 依存
 * @returns {{open: (workId: string) => Promise<void>, close: () => void, isOpen: () => boolean, dispose: () => void, setSettings: (s: object) => void}}
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
	/** 開く処理が競合しないよう、最後に開こうとした作品を覚えておく */
	let currentWorkId = null;
	/** 閉じたときに戻す body の style */
	let savedBodyStyle = '';
	/** @type {ReturnType<typeof createImagePane>|null} */
	let imagePane = null;
	/** @type {ReturnType<typeof createSidebar>|null} */
	let sidebarPane = null;

	/**
	 * ホストと Shadow DOM を用意する。
	 * @returns {void}
	 */
	function ensureHost() {
		if (host) return;
		host = doc.createElement('div');
		host.id = HOST_ELEMENT_ID;
		// ホストページのテーマに合わせる
		host.dataset.theme = doc.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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

		const closeButton = doc.createElement('button');
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
			if (event.target === stage) deps.onRequestClose();
		});

		doc.body.appendChild(host);
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
		stage.querySelectorAll('.status, img').forEach((node) => node.remove());
		stage.appendChild(status);
	}

	/**
	 * キーボード操作。
	 * @param {KeyboardEvent} event キー
	 * @returns {void}
	 */
	function onKeyDown(event) {
		if (!host) return;
		if (event.key === KEYS.CLOSE) {
			event.preventDefault();
			deps.onRequestClose();
		}
		if (event.key === KEYS.NEXT_PAGE) {
			event.preventDefault();
			imagePane?.next();
			return;
		}
		if (event.key === KEYS.PREV_PAGE) {
			event.preventDefault();
			imagePane?.prev();
			return;
		}
	}

	return {
		/**
		 * 作品を開く。
		 * @param {string} workId 作品 ID
		 * @returns {Promise<void>}
		 */
		async open(workId) {
			currentWorkId = workId;
			// 既に開いている状態で body を再ロックすると、ロック済みの style を
			// 「元の値」として保存してしまい、閉じたあとスクロールが戻らなくなる。
			// 作品間を移動するときは open() が close() を挟まずに呼ばれる
			const wasOpen = host !== null;
			ensureHost();
			if (!wasOpen) {
				savedBodyStyle = doc.body.getAttribute('style') ?? '';
				doc.body.setAttribute('style', `${savedBodyStyle};${BODY_LOCK_STYLE}`);
				doc.addEventListener('keydown', onKeyDown, true);
			}
			showStatus('読み込み中...', 'info');

			try {
				const raw = await getJson(illustUrl(workId));
				// 開こうとしている間に別の作品へ移っていたら捨てる
				if (currentWorkId !== workId) return;
				const detail = normalizeDetail(raw);
				const session = readSession(doc);
				if (!canView(detail, session.self)) {
					// 詳しい表示は Task 21 で差し替える
					showStatus('表示設定により非表示になっています', 'info');
					return;
				}
				// 作品を続けて開くときに古いペインの資源を残さない
				imagePane?.dispose();
				imagePane = createImagePane({
					doc,
					container: stage,
					settings,
				});
				// 作品を続けて開くときに古いサイドバーの資源を残さない。
				// hidden は毎回明示的に設定する。片方でしか触らないと、
				// 設定を戻したときに hidden が立ったままになって出てこなくなる
				sidebarPane?.dispose();
				sidebarPane = null;
				sidebar.hidden = !settings.showSidebar;
				if (settings.showSidebar) {
					sidebarPane = createSidebar({ doc, container: sidebar });
					sidebarPane.render(detail);
				}
				await imagePane.render(detail);
			} catch (error) {
				if (currentWorkId !== workId) return;
				showStatus('作品を読み込めませんでした', 'error');
				console.warn('[PixivMaster] failed to open', workId, error);
			}
		},

		/**
		 * 閉じる。DOM は捨てて資源を残さない。
		 * @returns {void}
		 */
		close() {
			currentWorkId = null;
			doc.removeEventListener('keydown', onKeyDown, true);
			if (savedBodyStyle) doc.body.setAttribute('style', savedBodyStyle);
			else doc.body.removeAttribute('style');
			imagePane?.dispose();
			imagePane = null;
			sidebarPane?.dispose();
			sidebarPane = null;
			host?.remove();
			host = null;
			shadow = null;
			stage = null;
			sidebar = null;
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
