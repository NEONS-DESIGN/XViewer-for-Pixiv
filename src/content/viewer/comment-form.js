/**
 * コメントの入力欄。作品へのコメントと、コメントへの返信で同じ部品を使う。
 *
 * 投稿そのものは知らない。onSubmit に値を渡し、解決したら入力を空にするだけ。
 * pixiv 本体はスタンプを選んだ瞬間に投稿するが、ここは一段挟んで「送信」で確定する
 * (モーダルの中の小さいパネルで誤爆すると実害が出る。設計書 §4.3)。
 */
import { createIcon } from '../../common/icons.js';
import { createAvatar, showAvatar } from './avatar.js';
import { stampUrl } from '../../pixiv/endpoints.js';
import { KEYS } from '../../common/constants.js';

/** 画面に出す文言。 */
const MESSAGES = Object.freeze({
	SUBMIT: '送信',
	PICK: '絵文字とスタンプ',
	STAMP_ALT: 'スタンプ',
	STAMP_CLEAR: '選んだスタンプを取り消す',
	FAILED: 'コメントを投稿できませんでした',
});

/** 送信するキー。Ctrl (Mac は Cmd) と一緒に押す。Enter だけは改行のまま残す。 */
const SUBMIT_KEY = 'Enter';

/**
 * 入力欄を作る。
 * @param {object} deps 依存
 * @param {Document} deps.doc document
 * @param {string} deps.placeholder 空のときに出す文言
 * @param {string|null} [deps.avatarUrl] 左に出すアバター。省略すると出さない
 * @param {object} [deps.picker] 絵文字とスタンプのピッカー。省略すると選ぶボタンを出さない
 * @param {(value: {text: string, stampId: string|null}) => Promise<void>} deps.onSubmit 送信
 * @param {(error: unknown) => string} [deps.errorMessage] 失敗時の文言。省略すると既定の文言
 * @returns {object} 入力欄
 */
export function createCommentForm(deps) {
	const { doc, placeholder, onSubmit } = deps;
	const picker = deps.picker ?? null;
	const errorMessage = deps.errorMessage ?? (() => MESSAGES.FAILED);

	/** @type {string|null} 選んでいるスタンプ。選んでいる間は本文を送らない */
	let stampId = null;
	/** 送信中か。二重送信を止める */
	let sending = false;
	/** この入力欄の中にフォーカスがあるか。Escape を食い止めるかの判断に使う */
	let focused = false;
	/** @type {HTMLElement|null} 失敗の表示。1 つだけ持つ */
	let errorNode = null;

	const element = doc.createElement('div');
	element.className = 'comment-form';

	const row = doc.createElement('div');
	row.className = 'comment-form-row';
	element.appendChild(row);

	if (deps.avatarUrl) {
		const avatar = createAvatar(doc, 'comment-form-avatar');
		showAvatar(avatar, deps.avatarUrl);
		row.appendChild(avatar);
	}

	const field = doc.createElement('div');
	field.className = 'comment-form-field';
	row.appendChild(field);

	const input = doc.createElement('textarea');
	input.className = 'comment-form-input';
	input.rows = 1;
	input.setAttribute('placeholder', placeholder);
	input.setAttribute('aria-label', placeholder);
	field.appendChild(input);

	/** スタンプを選んでいる間だけ出す確認の表示。 */
	const stampBox = doc.createElement('div');
	stampBox.className = 'comment-form-stamp-box';
	stampBox.hidden = true;
	field.appendChild(stampBox);

	const pickSlot = doc.createElement('span');
	pickSlot.className = 'comment-form-pick-slot';
	field.appendChild(pickSlot);

	const submit = doc.createElement('button');
	submit.type = 'button';
	submit.className = 'comment-form-submit';
	submit.textContent = MESSAGES.SUBMIT;
	row.appendChild(submit);

	/**
	 * 送れる中身があるか。
	 * @returns {boolean} 本文かスタンプがあれば true
	 */
	function hasInput() {
		return stampId !== null || input.value.trim() !== '';
	}

	/**
	 * 送信ボタンの状態を今の中身に合わせる。
	 * @returns {void}
	 */
	function syncSubmit() {
		submit.disabled = sending || !hasInput();
	}

	/**
	 * 失敗の表示を消す。
	 * @returns {void}
	 */
	function clearError() {
		errorNode?.remove();
		errorNode = null;
	}

	/**
	 * 失敗を入力欄の下に出す。表示は 1 つだけ。
	 * @param {unknown} error 失敗の中身
	 * @returns {void}
	 */
	function showError(error) {
		clearError();
		errorNode = doc.createElement('p');
		errorNode.className = 'comment-form-error';
		errorNode.setAttribute('role', 'alert');
		errorNode.textContent = errorMessage(error);
		element.appendChild(errorNode);
	}

	/**
	 * スタンプの選択を捨てて本文の入力に戻す。
	 * @returns {void}
	 */
	function clearStamp() {
		stampId = null;
		stampBox.textContent = '';
		stampBox.hidden = true;
		input.hidden = false;
		syncSubmit();
	}

	/**
	 * スタンプを選んだ状態にする。本文とは排他 (pixiv 本体も同じ)。
	 * @param {string} id スタンプ ID
	 * @returns {void}
	 */
	function selectStamp(id) {
		stampId = id;
		stampBox.textContent = '';
		const image = doc.createElement('img');
		image.className = 'comment-form-stamp';
		const url = stampUrl(id);
		if (url) image.setAttribute('src', url);
		image.setAttribute('alt', MESSAGES.STAMP_ALT);
		const clear = doc.createElement('button');
		clear.type = 'button';
		clear.className = 'comment-form-stamp-clear';
		clear.title = MESSAGES.STAMP_CLEAR;
		clear.setAttribute('aria-label', MESSAGES.STAMP_CLEAR);
		clear.appendChild(createIcon(doc, 'close'));
		clear.addEventListener('click', () => { clearStamp(); });
		clear.addEventListener('focus', () => { focused = true; });
		clear.addEventListener('blur', () => { focused = false; });
		stampBox.append(image, clear);
		stampBox.hidden = false;
		// 本文は隠すだけで消さない。取り消したら書きかけが戻る
		input.hidden = true;
		syncSubmit();
	}

	/**
	 * 今の中身を送る。送信中と空のときは何もしない。
	 * @returns {Promise<void>}
	 */
	async function send() {
		if (sending || !hasInput()) return;
		sending = true;
		input.disabled = true;
		submit.disabled = true;
		submit.setAttribute('aria-busy', 'true');
		try {
			await onSubmit(stampId === null
				? { text: input.value.trim(), stampId: null }
				: { text: '', stampId });
			clearError();
			input.value = '';
			clearStamp();
		} catch (error) {
			// 本文は消さない。消すと打ち直しになる
			showError(error);
		} finally {
			sending = false;
			input.disabled = false;
			submit.removeAttribute('aria-busy');
			syncSubmit();
		}
	}

	input.addEventListener('input', () => { syncSubmit(); });
	input.addEventListener('keydown', (event) => {
		// 変換中の Enter は確定の Enter。送信に使わない
		if (event.isComposing === true) return;
		if (event.key !== SUBMIT_KEY) return;
		if (event.ctrlKey !== true && event.metaKey !== true) return;
		event.preventDefault?.();
		void send();
	});
	submit.addEventListener('click', () => send());

	for (const target of [input, submit]) {
		target.addEventListener('focus', () => { focused = true; });
		target.addEventListener('blur', () => { focused = false; });
	}

	if (picker) {
		const pick = doc.createElement('button');
		pick.type = 'button';
		pick.className = 'comment-form-pick';
		pick.title = MESSAGES.PICK;
		pick.setAttribute('aria-label', MESSAGES.PICK);
		pick.appendChild(createIcon(doc, 'mood'));
		pick.addEventListener('focus', () => { focused = true; });
		pick.addEventListener('blur', () => { focused = false; });
		pick.addEventListener('click', () => {
			if (picker.isOpen()) {
				picker.close();
				return;
			}
			picker.open(pickSlot, {
				onEmoji: (name) => {
					// 絵文字は文字として入る。表示側の parseCommentText() が画像へ戻す
					input.value = `${input.value}(${name})`;
					syncSubmit();
					input.focus();
				},
				onStamp: (id) => { selectStamp(id); },
			});
		});
		pickSlot.appendChild(pick);
	}

	syncSubmit();

	return {
		element,

		/**
		 * 本文の入力へフォーカスを移す。
		 * @returns {void}
		 */
		focus() { input.focus(); },

		/**
		 * 中身を捨てる。
		 * @returns {void}
		 */
		reset() {
			input.value = '';
			clearStamp();
			clearError();
		},

		hasInput,

		/**
		 * Escape を食い止める。
		 * 書きかけを Escape で消さないため、中身があるときはビュワーを閉じさせない。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (event.key !== KEYS.CLOSE) return false;
			if (!focused) return false;
			return hasInput();
		},

		/**
		 * 入力欄を片付ける。開いていればピッカーも閉じる。
		 * @returns {void}
		 */
		dispose() {
			picker?.close();
			clearError();
			element.remove();
		},
	};
}
