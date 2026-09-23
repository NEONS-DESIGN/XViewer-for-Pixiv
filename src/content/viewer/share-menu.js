/**
 * 作品のシェアメニュー。pixiv 本体のシェアボタンと同じ形にする。
 *
 * 中身 (どこへ何を渡すか) は pixiv/share.js が決める。ここは開閉と描画だけを持つ。
 * Shadow DOM の中に置かれるので、外側クリックの判定は composedPath() で見る。
 * (シャドウ境界の外では event.target がホスト要素へ付け替えられるため)
 *
 * role="menu" を名乗るので WAI-ARIA の menu パターンに従う: 開いたら最初の項目へフォーカスし、
 * 上下キーで項目を移動、Home / End で端へ、Escape で閉じてボタンへ戻す。
 * Tab で項目の外へ出たら閉じる。(focusout)
 * キーは consumeKey() で受ける。ビュワー本体が document の捕捉フェーズで
 * 上下キーを作品の移動に使っているため、要素側のリスナでは間に合わない。(SPEC §10.5)
 */
import { createIcon } from '../../common/icons.js';
import { buildShareTargets } from '../../pixiv/share.js';
import { activeElementIn } from './focus.js';
import { KEYS } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/** メニューの中で使うキー。項目の移動と端への移動。 */
const MENU_KEYS = Object.freeze({
	NEXT: 'ArrowDown',
	PREV: 'ArrowUp',
	FIRST: 'Home',
	LAST: 'End',
});

/**
 * @typedef {object} ShareMenuDeps
 * @property {Document} doc 対象のドキュメント
 * @property {object} detail 正規化した作品詳細
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {(text: string) => Promise<void>} [writeText] クリップボードへ書く。既定は navigator.clipboard
 */

/**
 * シェアメニューを作る。
 * 呼んだ時点では element を返すだけで、どこへも差し込まない。
 * @param {ShareMenuDeps} deps 依存
 * @returns {{element: HTMLElement, isOpen: () => boolean, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}}
 */
export function createShareMenu(deps) {
	const { doc, detail, strings } = deps;
	const writeText = deps.writeText
		?? ((text) => navigator.clipboard.writeText(text));
	/** 開いているか */
	let open = false;
	/** @type {HTMLElement[]} メニューの項目。矢印キーの移動先 */
	const items = [];

	const element = doc.createElement('div');
	element.className = 'share-wrap';

	const button = doc.createElement('button');
	button.type = 'button';
	button.className = 'share-button';
	button.setAttribute('aria-haspopup', 'true');
	button.setAttribute('aria-expanded', 'false');
	button.appendChild(createIcon(doc, 'share'));
	// 文言が見えているので title は付けない (同じ文字が重なるだけ)
	const buttonText = doc.createElement('span');
	buttonText.textContent = strings.shareMenu.SHARE;
	button.appendChild(buttonText);

	const list = doc.createElement('div');
	list.className = 'share-menu';
	list.hidden = true;
	list.setAttribute('role', 'menu');
	list.setAttribute('aria-label', strings.shareMenu.SHARE);

	const heading = doc.createElement('p');
	heading.className = 'share-menu-heading';
	heading.textContent = strings.shareMenu.SHARE;
	list.appendChild(heading);

	/** コピーの結果を伝える場所。読み上げにも渡す */
	const status = doc.createElement('p');
	status.className = 'share-status';
	status.setAttribute('role', 'status');

	/**
	 * 開閉を画面に反映する。
	 * @param {boolean} next 開くなら true
	 * @returns {void}
	 */
	function setOpen(next) {
		open = next;
		list.hidden = !next;
		button.setAttribute('aria-expanded', String(next));
		// 開き直したときに前回の結果が残らないようにする
		if (!next) status.textContent = '';
	}

	/**
	 * 閉じてボタンへフォーカスを戻す。
	 * 戻さないとフォーカスが消えた要素に残り、モーダルのキー操作が効かなくなる。
	 * @returns {void}
	 */
	function closeAndRefocus() {
		setOpen(false);
		button.focus();
	}

	/**
	 * 項目の間でフォーカスを動かす。
	 * 今の所在は focus.js から引く。(Shadow DOM の中では document.activeElement がホストを返す)
	 * @param {string} key 押されたキー
	 * @returns {boolean} 動かしたなら true
	 */
	function moveFocus(key) {
		if (items.length === 0) return false;
		const current = items.indexOf(activeElementIn(doc, element));
		let target;
		if (key === MENU_KEYS.FIRST) target = 0;
		else if (key === MENU_KEYS.LAST) target = items.length - 1;
		else if (key === MENU_KEYS.NEXT) target = current < 0 ? 0 : (current + 1) % items.length;
		else if (key === MENU_KEYS.PREV) target = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
		else return false;
		items[target].focus();
		return true;
	}

	/**
	 * 項目 1 つの中身 (アイコンと文言) を入れる。
	 * @param {HTMLElement} item 項目
	 * @param {{icon: string, label: string}} target シェア先
	 * @returns {void}
	 */
	function fillItem(item, target) {
		item.className = 'share-item';
		item.setAttribute('role', 'menuitem');
		item.appendChild(createIcon(doc, target.icon));
		const text = doc.createElement('span');
		text.textContent = target.label;
		item.appendChild(text);
		items.push(item);
	}

	for (const target of buildShareTargets(detail, strings)) {
		if (target.href) {
			const link = doc.createElement('a');
			link.href = target.href;
			link.setAttribute('target', '_blank');
			// 外部サイトへ渡すので opener を持たせない
			link.setAttribute('rel', 'noopener noreferrer');
			fillItem(link, target);
			// 押した a は hidden の中に入るので、ボタンへ戻さないとフォーカスが body へ落ちる
			link.addEventListener('click', closeAndRefocus);
			list.appendChild(link);
			continue;
		}
		const copy = doc.createElement('button');
		copy.type = 'button';
		fillItem(copy, target);
		copy.addEventListener('click', () => {
			// クリップボードは権限や実行文脈で失敗しうる。落とさずに結果だけ伝える。
			// navigator.clipboard が無い環境では同期で TypeError が出るので、Promise の中で呼んで reject 側へ流す
			Promise.resolve().then(() => writeText(target.copyText)).then(
				() => { status.textContent = strings.shareMenu.COPY_DONE; },
				(error) => {
					status.textContent = strings.shareMenu.COPY_FAILED;
					warn('failed to copy share url', error);
				},
			);
		});
		list.appendChild(copy);
	}
	list.appendChild(status);

	button.addEventListener('click', () => {
		setOpen(!open);
		// menu パターンでは開いたら最初の項目にフォーカスを置く。キーボードで開いた人が
		// そのまま矢印で選べるようにする (マウスでも focus-visible は出ないので邪魔にならない)
		if (open) items[0]?.focus();
	});
	element.append(button, list);

	/**
	 * フォーカスがメニューの外へ出たら閉じる。(Tab で抜けたとき)
	 * relatedTarget が無い (見出しの文字を押した・窓が非アクティブになった) ときは閉じない。
	 * 外側のクリックは pointerdown 側が受け持つ
	 * @param {FocusEvent} event フォーカスの移動
	 * @returns {void}
	 */
	function onFocusOut(event) {
		if (!open) return;
		const next = event.relatedTarget;
		if (!next) return;
		// 項目もボタンも element の子孫なので、contains で一緒に見られる
		if (next === element || (typeof element.contains === 'function' && element.contains(next))) return;
		setOpen(false);
	}

	element.addEventListener('focusout', onFocusOut);

	/**
	 * メニューの外が押されたら閉じる。
	 * @param {PointerEvent} event 押された位置
	 * @returns {void}
	 */
	function onPointerDown(event) {
		if (!open) return;
		const path = event.composedPath?.() ?? [];
		if (path.includes(element)) return;
		setOpen(false);
	}

	// 捕捉フェーズで受ける。pixiv 側が途中で止めても届くようにする
	doc.addEventListener('pointerdown', onPointerDown, true);

	/**
	 * キーを食い止める。
	 * ビュワー本体のキー操作 (Escape で閉じる・上下で作品を移動) より先に呼ばれ、
	 * true を返したときは本体が反応してはいけない。
	 * @param {KeyboardEvent} event キー
	 * @returns {boolean} 食い止めたなら true
	 */
	function consumeKey(event) {
		if (!open) return false;
		if (event.key === KEYS.CLOSE) {
			event.preventDefault?.();
			closeAndRefocus();
			return true;
		}
		if (moveFocus(event.key)) {
			event.preventDefault?.();
			return true;
		}
		return false;
	}

	return {
		element,
		isOpen() { return open; },
		consumeKey,

		dispose() {
			doc.removeEventListener('pointerdown', onPointerDown, true);
			element.removeEventListener('focusout', onFocusOut);
			setOpen(false);
		},
	};
}
