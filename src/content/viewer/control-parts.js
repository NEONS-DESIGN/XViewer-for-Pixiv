/**
 * 操作の帯 (うごイラ・自動送り) が共有する部品。
 * 再生ボタンの見た目の差し替えと、ボタンで開くポップアップの開閉を持つ。
 */
import { createIcon } from '../../common/icons.js';

/** 再生ボタンの表示。キーは今の再生状態、値は「押すと何になるか」。アイコンは言語に依らない。 */
export const PLAY_TOGGLE_LOOKS = Object.freeze({
	PLAYING: Object.freeze({ icon: 'pause', labelKey: 'PAUSE' }),
	PAUSED: Object.freeze({ icon: 'play', labelKey: 'PLAY' }),
});

/**
 * ボタンのアイコンと名前を差し替える。読み上げ名とマウスで見る名前の両方に入れる。
 * @param {Document} doc 対象のドキュメント
 * @param {HTMLButtonElement} button ボタン
 * @param {string} icon アイコンの名前
 * @param {string} label 名前
 * @returns {void}
 */
export function setButtonLook(doc, button, icon, label) {
	button.setAttribute('aria-label', label);
	button.title = label;
	button.replaceChildren(createIcon(doc, icon));
}

/**
 * 再生ボタンの見た目を再生状態に合わせる。ボタンは「押すと何になるか」を示す。
 * @param {Document} doc 対象のドキュメント
 * @param {HTMLButtonElement} button 再生ボタン
 * @param {boolean} playing 再生中か
 * @param {Record<string, string>} text 文言 (PLAY / PAUSE を持つ名前空間)
 * @returns {void}
 */
export function setPlayToggleLook(doc, button, playing, text) {
	const look = playing ? PLAY_TOGGLE_LOOKS.PLAYING : PLAY_TOGGLE_LOOKS.PAUSED;
	setButtonLook(doc, button, look.icon, text[look.labelKey]);
}

/**
 * @typedef {object} PopupToggleDeps
 * @property {Document} doc 対象のドキュメント。外の押下を捕捉フェーズで受ける先
 * @property {HTMLElement} wrap ボタンとポップアップを包む要素。この中の押下とフォーカスの移動では閉じない
 * @property {HTMLElement} button 開閉するボタン。aria-expanded を合わせる
 * @property {HTMLElement} popup 開閉するポップアップ。hidden を合わせる
 * @property {() => (HTMLElement|null|undefined)} [focusOnOpen] ボタンで開いたときにフォーカスを移す先
 * @property {(open: boolean) => void} [onChange] 開閉が変わったときに呼ぶ。dispose では呼ばない
 */

/**
 * @typedef {object} PopupToggle
 * @property {() => boolean} isOpen 開いているか
 * @property {(refocus: boolean) => void} close 閉じる。refocus ならボタンへフォーカスを戻す
 * @property {() => void} dispose 張ったリスナを外して閉じる。onChange は呼ばない
 */

/**
 * ボタンで開くポップアップの開閉を作る。ボタンを押すと開閉し、外を押したとき・Tab で外へ出たときに閉じる。
 * 外の押下は Shadow DOM の中でも分かるよう composedPath() で見る。document へは開いている間だけ張る。
 * @param {PopupToggleDeps} deps 依存
 * @returns {PopupToggle} 操作口
 */
export function createPopupToggle(deps) {
	const { doc, wrap, button, popup } = deps;
	let open = false;

	/**
	 * 開閉を画面に反映する。
	 * @param {boolean} next 開くなら true
	 * @param {boolean} notify onChange を呼ぶか
	 * @returns {void}
	 */
	function setOpen(next, notify) {
		if (next === open) return;
		open = next;
		popup.hidden = !next;
		button.setAttribute('aria-expanded', String(next));
		// 捕捉フェーズで受ける。pixiv 側やビュワーが途中で止めても届くようにする
		if (next) doc.addEventListener('pointerdown', onPointerDown, true);
		else doc.removeEventListener('pointerdown', onPointerDown, true);
		if (notify) deps.onChange?.(next);
	}

	/**
	 * 閉じる。キーや項目で閉じたときはボタンへフォーカスを戻す。
	 * (戻さないと、隠れた項目にフォーカスが残ってモーダルのキー操作が効かなくなる)
	 * @param {boolean} refocus ボタンへフォーカスを戻すか
	 * @returns {void}
	 */
	function close(refocus) {
		if (!open) return;
		setOpen(false, true);
		if (refocus) button.focus();
	}

	/**
	 * ポップアップの外が押されたら閉じる。
	 * @param {PointerEvent} event 押された位置
	 * @returns {void}
	 */
	function onPointerDown(event) {
		const path = event.composedPath?.() ?? [];
		if (!path.includes(wrap)) close(false);
	}

	/**
	 * フォーカスが外へ出たら閉じる。(Tab で抜けたとき)
	 * 行き先が無いとき (窓が非アクティブになった等) は閉じない。外側のクリックは pointerdown が受け持つ
	 * @param {FocusEvent} event フォーカスの移動
	 * @returns {void}
	 */
	function onFocusOut(event) {
		const target = event.relatedTarget;
		if (!open || !target || wrap.contains?.(target)) return;
		close(false);
	}

	/**
	 * ボタンが押されたら開閉する。開いたら選んでいる項目へフォーカスを移す。
	 * @returns {void}
	 */
	function onButtonClick() {
		if (open) {
			close(false);
			return;
		}
		setOpen(true, true);
		deps.focusOnOpen?.()?.focus();
	}

	button.addEventListener('click', onButtonClick);
	wrap.addEventListener('focusout', onFocusOut);

	return {
		isOpen: () => open,
		close,
		dispose() {
			button.removeEventListener('click', onButtonClick);
			wrap.removeEventListener('focusout', onFocusOut);
			setOpen(false, false);
		},
	};
}
