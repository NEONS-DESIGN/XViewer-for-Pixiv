/**
 * 親の項目がオフのときに、子の項目を非活性にする。(サイドバーを出さないなら、サイドバーのスクロールは選べない、など)
 *
 * disabled は使わず aria-disabled で見せる。disabled にすると押しても何も届かず、なぜ押せないのかを伝えられないため。
 * 非活性の項目を押す・キーで動かすと操作を止め、項目の下に「親の項目をオンにしてください」を出す。
 * 出した警告はしばらくすると消え、親がオンになったときにも消える。
 */
import { createIcon } from '../common/icons.js';

/** 警告を出しておく時間 (ミリ秒)。 */
export const LOCK_WARNING_MS = 4000;

/** 非活性の項目の入れ物に付ける印。見た目 (薄く・押せないカーソル) は popup.css がこれで決める */
export const LOCKED_CLASS = 'is-locked';

/** 警告の行に添えるアイコン。色だけに頼らず形でも示す */
const WARNING_ICON = 'error';

/** レンジの値を動かすキー。非活性のときは止める */
const RANGE_KEYS = Object.freeze(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

/** 選択肢を開く・選び直すキー。非活性のときは止める */
const SELECT_KEYS = Object.freeze([...RANGE_KEYS, ' ', 'Enter']);

/**
 * 親の項目の条件を満たしているか。
 * off を持たない条件は「親がオン (true)」、off を持つ条件は「親の値が off 以外」を求める。
 * @param {{key: string, off?: string}|undefined} requires 親の条件。無ければ常に満たす
 * @param {object} settings 今の設定
 * @returns {boolean} 満たしていれば true
 */
export function isRequirementMet(requires, settings) {
	if (!requires) return true;
	const value = settings[requires.key];
	return requires.off === undefined ? value === true : value !== requires.off;
}

/**
 * 空白区切りの属性値へ語を足す・外す。(aria-describedby の付け外しに使う)
 * @param {Element} element 対象
 * @param {string} name 属性名
 * @param {string} token 語
 * @param {boolean} present 足すなら true
 * @returns {void}
 */
function toggleToken(element, name, token, present) {
	const tokens = (element.getAttribute(name) ?? '').split(/\s+/).filter((one) => one && one !== token);
	if (present) tokens.push(token);
	if (tokens.length > 0) element.setAttribute(name, tokens.join(' '));
	else element.removeAttribute(name);
}

/**
 * 項目に非活性の振る舞いを付ける。
 * @param {Document} doc 対象のドキュメント
 * @param {object} options 設定
 * @param {HTMLElement} options.wrapper 項目の入れ物。印 (LOCKED_CLASS) を付け、末尾に警告の行を足す
 * @param {HTMLInputElement|HTMLSelectElement} options.control 操作部品
 * @param {'toggle'|'choice'|'range'} options.kind 部品の種類
 * @param {string} options.key 設定キー。警告の行の id と data-role の元にする
 * @param {string} options.message 押されたときに出す警告
 * @param {{setTimeout?: Function, clearTimeout?: Function}} [options.timers] タイマの差し替え
 * @returns {{setLocked: (locked: boolean) => void, isLocked: () => boolean}} 非活性の切り替え
 */
export function attachFieldLock(doc, { wrapper, control, kind, key, message, timers = {} }) {
	const later = timers.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
	const cancel = timers.clearTimeout ?? ((id) => clearTimeout(id));
	let locked = false;
	let timer = null;
	/** 最後に受け入れた値。非活性の間に値が変わってしまったときに戻す (選択肢とレンジ) */
	let lastValue = control.value;

	const warningId = `${key}-lock`;
	const warning = doc.createElement('p');
	warning.className = 'field-lock-warning';
	warning.setAttribute('id', warningId);
	warning.dataset.role = warningId;
	// 出たときに読み上げへも届くよう status にする
	warning.setAttribute('role', 'status');
	warning.hidden = true;
	const text = doc.createElement('span');
	warning.append(createIcon(doc, WARNING_ICON), text);
	wrapper.append(warning);

	/**
	 * 警告を消す。
	 * @returns {void}
	 */
	function hideWarning() {
		if (timer !== null) cancel(timer);
		timer = null;
		warning.hidden = true;
		text.textContent = '';
		toggleToken(control, 'aria-describedby', warningId, false);
	}

	/**
	 * 警告を出し、しばらくしたら消す。続けて押されたら消すまでの時間を延ばす。
	 * @returns {void}
	 */
	function showWarning() {
		text.textContent = message;
		warning.hidden = false;
		toggleToken(control, 'aria-describedby', warningId, true);
		if (timer !== null) cancel(timer);
		timer = later(hideWarning, LOCK_WARNING_MS);
		// テスト (Node) でタイマがプロセスを待たせないようにする。ブラウザには無いので呼べるときだけ
		timer?.unref?.();
	}

	/**
	 * 非活性の間の操作を止めて警告を出す。
	 * @param {Event} event 操作
	 * @returns {void}
	 */
	function block(event) {
		if (!locked) return;
		event.preventDefault?.();
		event.stopImmediatePropagation?.();
		showWarning();
	}

	/**
	 * 指定のキーだけを止める関数を作る。Tab などフォーカスの移動は止めない。
	 * @param {readonly string[]} keys 止めるキー
	 * @returns {(event: KeyboardEvent) => void} keydown の処理
	 */
	const blockKeys = (keys) => (event) => {
		if (keys.includes(event.key)) block(event);
	};

	/**
	 * 非活性の間に値が変わってしまったら戻して警告を出す。止めきれなかったときの控え。
	 * @param {Event} event input / change
	 * @returns {void}
	 */
	function revert(event) {
		if (!locked) {
			if (event.type === 'change') lastValue = control.value;
			return;
		}
		control.value = lastValue;
		event.stopImmediatePropagation?.();
		showWarning();
	}

	// 部品の処理より先に止めるため、捕捉で登録する。(部品自身の上では捕捉の登録が先に呼ばれる)
	if (kind === 'toggle') {
		// チェックボックスは click の既定動作を止めれば切り替わらない。ラベルを押したときも同じ click が届く
		control.addEventListener('click', block, true);
	} else if (kind === 'choice') {
		control.addEventListener('mousedown', block, true);
		control.addEventListener('click', block, true);
		control.addEventListener('keydown', blockKeys(SELECT_KEYS), true);
		control.addEventListener('change', revert, true);
	} else {
		control.addEventListener('pointerdown', block, true);
		control.addEventListener('mousedown', block, true);
		control.addEventListener('keydown', blockKeys(RANGE_KEYS), true);
		control.addEventListener('input', revert, true);
		control.addEventListener('change', revert, true);
	}

	return {
		/**
		 * 非活性を切り替える。活性に戻したら出ている警告も消す。
		 * @param {boolean} next 非活性にするなら true
		 * @returns {void}
		 */
		setLocked(next) {
			locked = next;
			wrapper.classList.toggle(LOCKED_CLASS, next);
			if (next) {
				control.setAttribute('aria-disabled', 'true');
				lastValue = control.value;
			} else {
				control.removeAttribute('aria-disabled');
				hideWarning();
			}
		},
		isLocked() { return locked; },
	};
}
