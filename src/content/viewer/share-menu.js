/**
 * 作品のシェアメニュー。pixiv 本体のシェアボタンと同じ形にする。
 *
 * 中身 (どこへ何を渡すか) は pixiv/share.js が決める。ここは開閉と描画だけを持つ。
 * Shadow DOM の中に置かれるので、外側クリックの判定は composedPath() で見る
 * (シャドウ境界の外では event.target がホスト要素へ付け替えられるため)。
 */
import { createIcon } from '../../common/icons.js';
import { buildShareTargets } from '../../pixiv/share.js';

/** ボタンとメニューの見出しに使う文言。 */
const SHARE_LABEL = 'この作品をシェア';

/** コピーに失敗したときの文言。 */
const COPY_FAILED = 'コピーできませんでした';

/** コピーできたときの文言。 */
const COPY_DONE = 'リンクをコピーしました';

/**
 * @typedef {object} ShareMenuDeps
 * @property {Document} doc 対象のドキュメント
 * @property {object} detail 正規化した作品詳細
 * @property {(text: string) => Promise<void>} [writeText] クリップボードへ書く。既定は navigator.clipboard
 */

/**
 * シェアメニューを作る。
 * 呼んだ時点では element を返すだけで、どこへも差し込まない。
 * @param {ShareMenuDeps} deps 依存
 * @returns {{element: HTMLElement, isOpen: () => boolean, consumeEscape: () => boolean, dispose: () => void}}
 */
export function createShareMenu(deps) {
	const { doc, detail } = deps;
	const writeText = deps.writeText
		?? ((text) => navigator.clipboard.writeText(text));
	/** 開いているか */
	let open = false;

	const element = doc.createElement('div');
	element.className = 'share-wrap';

	const button = doc.createElement('button');
	button.type = 'button';
	button.className = 'share-button';
	button.title = SHARE_LABEL;
	button.setAttribute('aria-haspopup', 'true');
	button.setAttribute('aria-expanded', 'false');
	button.appendChild(createIcon(doc, 'share'));
	const buttonText = doc.createElement('span');
	buttonText.textContent = SHARE_LABEL;
	button.appendChild(buttonText);

	const list = doc.createElement('div');
	list.className = 'share-menu';
	list.hidden = true;
	list.setAttribute('role', 'menu');
	list.setAttribute('aria-label', SHARE_LABEL);

	const heading = doc.createElement('p');
	heading.className = 'share-menu-heading';
	heading.textContent = SHARE_LABEL;
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
	}

	for (const target of buildShareTargets(detail)) {
		if (target.href) {
			const link = doc.createElement('a');
			link.href = target.href;
			link.setAttribute('target', '_blank');
			// 外部サイトへ渡すので opener を持たせない
			link.setAttribute('rel', 'noopener noreferrer');
			fillItem(link, target);
			link.addEventListener('click', () => { setOpen(false); });
			list.appendChild(link);
			continue;
		}
		const copy = doc.createElement('button');
		copy.type = 'button';
		fillItem(copy, target);
		copy.addEventListener('click', () => {
			// クリップボードは権限や実行文脈で失敗しうる。落とさずに結果だけ伝える
			writeText(target.copyText).then(
				() => { status.textContent = COPY_DONE; },
				(error) => {
					status.textContent = COPY_FAILED;
					console.warn('[PixivMaster] failed to copy share url', error);
				},
			);
		});
		list.appendChild(copy);
	}
	list.appendChild(status);

	button.addEventListener('click', () => { setOpen(!open); });
	element.append(button, list);

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

	return {
		element,
		isOpen() { return open; },

		/**
		 * Escape を食い止める。
		 * ビュワー本体の Escape (モーダルを閉じる) より先に呼ばれ、
		 * true を返したときは本体が反応してはいけない。
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeEscape() {
			if (!open) return false;
			closeAndRefocus();
			return true;
		},

		dispose() {
			doc.removeEventListener('pointerdown', onPointerDown, true);
			setOpen(false);
		},
	};
}
