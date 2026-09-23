/**
 * コメントの入力欄。作品へのコメントと、コメントへの返信で同じ部品を使う。
 *
 * 投稿そのものは知らない。onSubmit に値を渡し、解決したら入力を空にするだけ。
 * pixiv 本体はスタンプを選んだ瞬間に投稿するが、ここは一段挟んで「送信」で確定する。
 * (モーダルの中の小さいパネルで誤爆すると実害が出る。設計書 §4.3)
 */
import { createIcon } from '../../common/icons.js';
import { createAvatar, showAvatar } from './avatar.js';
import { hasFocusWithin } from './focus.js';
import { stampUrl } from '../../pixiv/endpoints.js';
import { KEYS } from '../../common/constants.js';

/** 送信するキー。Ctrl (Mac は Cmd) と一緒に押す。Enter だけは改行のまま残す。 */
const SUBMIT_KEY = 'Enter';

/**
 * 入力欄を作る。
 * @param {object} deps 依存
 * @param {Document} deps.doc document
 * @param {string} deps.placeholder 空のときに出す文言
 * @param {string|null} [deps.avatarUrl] 左に出すアバター。省略すると出さない
 * @param {object} [deps.picker] 絵文字とスタンプのピッカー (comment-picker.js の形。`open` / `close` / `isOpen` / `isOpenIn`)。省略すると選ぶボタンを出さない
 * @param {(value: {text: string, stampId: string|null}) => Promise<void>} deps.onSubmit 送信
 * @param {(error: unknown) => string} [deps.errorMessage] 失敗時の文言。省略すると既定の文言
 * @param {object} deps.strings 文言のカタログ (src/i18n)
 * @returns {object} 入力欄
 */
export function createCommentForm(deps) {
	const { doc, placeholder, onSubmit, strings } = deps;
	const picker = deps.picker ?? null;
	const errorMessage = deps.errorMessage ?? (() => strings.commentForm.FAILED);

	/** @type {string|null} 選んでいるスタンプ。選んでいる間は本文を送らない */
	let stampId = null;
	/** 送信中か。二重送信を止める */
	let sending = false;
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
	submit.textContent = strings.commentForm.SUBMIT;
	row.appendChild(submit);

	/**
	 * この入力欄の中にフォーカスがあるか。Escape を食い止めるかの判断に使う。
	 *
	 * 真偽値で覚えないこと。`disabled` にした瞬間にブラウザがフォーカスを外すので、
	 * 送信のたびに嘘になる。(書きかけを Escape で失う原因だった)
	 * @returns {boolean} 中にフォーカスがあれば true
	 */
	function isFocusInside() {
		return hasFocusWithin(doc, element);
	}

	/**
	 * 送信のあとにフォーカスを戻す先。
	 * スタンプを選んでいる間は本文の入力が hidden で、隠れた要素には戻せない。
	 * @returns {HTMLElement} 戻す先
	 */
	function focusTarget() {
		return input.hidden ? submit : input;
	}

	/**
	 * 送れる中身があるか。
	 * @returns {boolean} 本文かスタンプがあれば true
	 */
	function hasInput() {
		return stampId !== null || input.value.trim() !== '';
	}

	/**
	 * 入力欄の高さを中身に合わせ直す。
	 *
	 * 本家と同じく、行が増えたらスクロールさせずに入力欄自体を伸ばす。
	 * **先に height を空に戻してから測る。** 前の高さが残っていると
	 * scrollHeight がその値のままになり、行を消しても縮まない。
	 * 上限は CSS の max-height が持つ。(超えた分だけ中がスクロールする)
	 * 測る口が無い DOM (テスト用の偽物) では何もしない。見た目の調整なので黙って続ける
	 * @returns {void}
	 */
	function syncHeight() {
		if (typeof input.scrollHeight !== 'number') return;
		input.style.height = '';
		input.style.height = `${input.scrollHeight}px`;
	}

	/**
	 * 本文のキャレット位置に文字を差し込む。選択範囲があればそれを置き換える。
	 * 絵文字は文字として入る。表示側の parseCommentText() が画像へ戻す。
	 * キャレットの位置が取れない相手 (テスト用の DOM) では末尾へ足す
	 * @param {string} token 差し込む文字 ('(heaven)' の形)
	 * @returns {void}
	 */
	function insertAtCaret(token) {
		const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
		const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
		input.value = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
		// value を入れ直すとキャレットは末尾へ飛ぶ。差し込んだ直後へ戻す
		const caret = start + token.length;
		if (typeof input.setSelectionRange === 'function') input.setSelectionRange(caret, caret);
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
		// 隠している間は測れない。戻したところで測り直す
		syncHeight();
	}

	/**
	 * スタンプを選んだ状態にする。本文とは排他。(pixiv 本体も同じ)
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
		image.setAttribute('alt', strings.commentForm.STAMP_ALT);
		const clear = doc.createElement('button');
		clear.type = 'button';
		clear.className = 'comment-form-stamp-clear';
		clear.title = strings.commentForm.STAMP_CLEAR;
		clear.setAttribute('aria-label', strings.commentForm.STAMP_CLEAR);
		clear.appendChild(createIcon(doc, 'close'));
		clear.addEventListener('click', () => { clearStamp(); });
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
		// disabled にするとブラウザがフォーカスを body へ落とす。先に覚えて、終わったら戻す。
		// 戻さないと、本文を残した失敗のあとの Escape がビュワーまで届いて書きかけごと消える
		const restoreFocus = isFocusInside();
		input.disabled = true;
		submit.disabled = true;
		submit.setAttribute('aria-busy', 'true');
		try {
			await onSubmit(stampId === null
				? { text: input.value.trim(), stampId: null }
				: { text: '', stampId });
			clearError();
			input.value = '';
			// 伸びたままにすると、空の入力欄が長文のときの高さで残る。clearStamp() が測り直す
			clearStamp();
		} catch (error) {
			// 本文は消さない。消すと打ち直しになる
			showError(error);
		} finally {
			sending = false;
			input.disabled = false;
			submit.removeAttribute('aria-busy');
			syncSubmit();
			// 戻すのは全て有効に戻したあと。disabled のままの要素にはフォーカスを置けない
			if (restoreFocus) focusTarget().focus();
		}
	}

	input.addEventListener('input', () => {
		syncSubmit();
		syncHeight();
	});
	input.addEventListener('keydown', (event) => {
		// 変換中の Enter は確定の Enter。送信に使わない
		if (event.isComposing === true) return;
		if (event.key !== SUBMIT_KEY) return;
		if (event.ctrlKey !== true && event.metaKey !== true) return;
		event.preventDefault?.();
		void send();
	});
	submit.addEventListener('click', () => send());

	if (picker) {
		const pick = doc.createElement('button');
		pick.type = 'button';
		pick.className = 'comment-form-pick';
		pick.title = strings.commentForm.PICK;
		pick.setAttribute('aria-label', strings.commentForm.PICK);
		pick.appendChild(createIcon(doc, 'mood'));
		pick.addEventListener('click', () => {
			if (picker.isOpen()) {
				picker.close();
				return;
			}
			picker.open(pickSlot, {
				// 閉じるときにフォーカスを返す先。項目ごと消えて body へ落ちるのを防ぐ
				opener: pick,
				onEmoji: (name) => {
					// 絵文字は本文。スタンプとは両立しないので、選んでいれば取り消して本文へ戻す。
					// 戻さないと hidden の textarea に書かれ、スタンプの送信で黙って消える
					if (stampId !== null) clearStamp();
					insertAtCaret(`(${name})`);
					syncSubmit();
					// 1 行増えることがある
					syncHeight();
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

		hasInput,

		/**
		 * Escape を食い止める。
		 * 書きかけを Escape で消さないため、中身があるときはビュワーを閉じさせない。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (event.key !== KEYS.CLOSE) return false;
			if (!isFocusInside()) return false;
			return hasInput();
		},

		/**
		 * 入力欄を片付ける。この欄で開いているピッカーも閉じる。
		 * ピッカーは 1 枚を共有しているので、別の欄で開いているものは閉じない
		 * @returns {void}
		 */
		dispose() {
			if (picker?.isOpenIn(element)) picker.close();
			clearError();
			element.remove();
		},
	};
}
