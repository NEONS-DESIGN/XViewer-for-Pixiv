/**
 * コメントの削除の導線。1 件のコメント (ルートにも返信にも) に「削除」ボタンを付ける。
 *
 * **削除は取り消せないので、一度目の押下では消さずに文言を聞き返しに変える。**
 * 別のモーダルを出さないのは、ビュワー自体がモーダルの中だから。
 * (二重に重ねるとどれを閉じているのか分からなくなる)
 * 聞き返しは画面で同時に 1 つだけ。`createConfirmRegistry()` が覚え、Escape で畳む口を出す。
 *
 * ここが持つのは通信とボタンの状態だけ。一覧から外す・件数を戻す・空の案内へ戻す・
 * フォーカスの受け皿を決めるのは comments.js (`deps.onRemoved`) の仕事。
 */
import { isFocused } from './focus.js';
import { warn } from '../../common/log.js';

/** 削除ボタンのクラス名。comments.js がフォーカスの受け皿を探すときにも使う */
export const DELETE_BUTTON_CLASS = 'comment-delete';

/**
 * 聞き返し中の削除ボタンを 1 つに絞る台帳。
 * @returns {{claim: (cancel: () => void) => void, release: (cancel: () => void) => void, cancel: () => boolean, clear: () => void}} 台帳
 */
export function createConfirmRegistry() {
	/** @type {(() => void)|null} 聞き返し中の削除ボタンを畳む口 */
	let current = null;
	return {
		/**
		 * 聞き返しを始めたボタンを覚える。前のボタンが聞き返し中なら先に畳む。
		 * 前の聞き返しを残すと、別のコメントを消すつもりで押し直したときに誤爆する
		 * @param {() => void} cancel そのボタンの聞き返しを畳む口
		 * @returns {void}
		 */
		claim(cancel) {
			if (current && current !== cancel) current();
			current = cancel;
		},

		/**
		 * 聞き返しをやめたボタンを忘れる。別のボタンに移っていたら何もしない。
		 * @param {() => void} cancel 忘れる口
		 * @returns {void}
		 */
		release(cancel) {
			if (current === cancel) current = null;
		},

		/**
		 * 聞き返し中のボタンがあれば畳む。(Escape の行き先)
		 * @returns {boolean} 畳んだなら true
		 */
		cancel() {
			if (!current) return false;
			current();
			return true;
		},

		/**
		 * 描き直し・破棄で忘れる。ボタンごと捨てるので畳む必要は無い。
		 * @returns {void}
		 */
		clear() {
			current = null;
		},
	};
}

/**
 * @typedef {object} DeleteTarget
 * @property {HTMLElement} item 一覧から外す相手 (.comment-item)
 * @property {HTMLElement} body 失敗の表示をぶら下げる先 (.comment-body)
 * @property {HTMLElement} meta 下段。ボタンをここの先頭へ差し込む
 * @property {boolean} isRoot ルートコメントか。読み込み済みの件数を戻すかの判断に使う
 */

/**
 * @typedef {object} RemovedInfo
 * @property {HTMLElement} item 消してよい行 (.comment-item)
 * @property {boolean} isRoot ルートコメントか
 * @property {boolean} focused 押した時点でボタンにフォーカスがあったか。(キーボードで押した)
 * @property {() => boolean} stillCurrent 押した時点の作品・一覧をまだ見ているか。await の後に確かめる
 */

/**
 * @typedef {object} DeleteDeps
 * @property {Document} doc
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {(illustId: string, commentId: string, token: string) => Promise<void>} deleteComment 削除の通信
 * @property {() => string|null} illustId 今の作品 ID。破棄済みなら null (送らない)
 * @property {() => string|null} csrfToken 押された時点の CSRF トークン。null なら client.js が UNAUTHORIZED に倒す
 * @property {() => (() => boolean)} watchGeneration 押した時点の作品・一覧を覚え、まだ同じかを返す口を作る
 * @property {(error: unknown) => string} errorMessage 失敗の文言
 * @property {ReturnType<typeof createConfirmRegistry>} confirmations 聞き返しの台帳
 * @property {(info: RemovedInfo) => Promise<void>|void} onRemoved 消せたとき。画面から外すのは呼び出し側
 */

/**
 * 削除の導線を 1 件のコメントに付ける。
 *
 * フォーカスが外れたら聞き返しをやめる。押しっぱなしの確認を残すと、
 * 別のコメントを消すつもりで押し直したときに誤爆する。
 * @param {{id: string}} comment 消す対象
 * @param {DeleteTarget} target 付ける先
 * @param {DeleteDeps} deps 依存
 * @returns {void}
 */
export function attachDelete(comment, target, deps) {
	const { doc, strings, confirmations } = deps;
	const { item, body, meta, isRoot } = target;
	/** 聞き返している最中か */
	let confirming = false;
	/** @type {HTMLElement|null} 失敗の表示。1 つだけ持つ */
	let failureNode = null;

	const button = doc.createElement('button');
	button.type = 'button';
	button.className = DELETE_BUTTON_CLASS;
	button.textContent = strings.comments.DELETE;

	/**
	 * 聞き返しをやめる。外 (Escape・別のボタン) から呼ぶ用の口。
	 * @returns {void}
	 */
	function cancel() { setConfirming(false); }

	/**
	 * 聞き返しの見た目を切り替える。
	 * @param {boolean} next 聞き返すなら true
	 * @returns {void}
	 */
	function setConfirming(next) {
		confirming = next;
		button.textContent = next ? strings.comments.DELETE_CONFIRM : strings.comments.DELETE;
		button.classList.toggle('is-confirming', next);
		// 聞き返しは同時に 1 つだけ。Escape で畳めるよう台帳に載せておく
		if (next) confirmations.claim(cancel);
		else confirmations.release(cancel);
	}

	/**
	 * 失敗を 1 つだけ出す。コメント自体は読めるまま残す。
	 * @param {unknown} error 失敗の中身
	 * @returns {void}
	 */
	function showFailure(error) {
		failureNode?.remove();
		failureNode = doc.createElement('p');
		failureNode.className = 'comment-error';
		failureNode.setAttribute('role', 'alert');
		failureNode.textContent = deps.errorMessage(error);
		body.appendChild(failureNode);
		warn('failed to delete comment', comment.id, error);
	}

	/**
	 * 実際に消す。消せたら呼び出し側に画面から外させる。
	 * @returns {Promise<void>}
	 */
	async function remove() {
		// 描き直しの途中で押されることは無いが、押した瞬間に破棄されていれば送らない
		const illustId = deps.illustId();
		if (illustId === null) return;
		// 待っている間に別の作品へ移ったり描き直されたりしたら、画面には手を出さない
		const stillCurrent = deps.watchGeneration();
		// disabled にするとフォーカスが body へ落ちる。押した時点の所在を覚えておき、
		// 成功したら呼び出し側が受け皿へ移す。(失敗したときはこのボタン自身へ戻す)
		const focused = isFocused(doc, button);
		/** 失敗したときにフォーカスを戻すか。戻すのは finally で disabled を外した後 */
		let refocus = false;
		/** 消せたか。画面から外すのは finally でボタンを元に戻した後 */
		let removed = false;
		button.disabled = true;
		try {
			await deps.deleteComment(illustId, comment.id, deps.csrfToken());
			if (!stillCurrent()) return;
			failureNode?.remove();
			failureNode = null;
			removed = true;
		} catch (error) {
			if (!stillCurrent()) return;
			// 消せていないのに画面から外すと、読み直したときに戻ってきて食い違う
			showFailure(error);
			refocus = true;
		} finally {
			button.disabled = false;
			// 押し直せるように聞き返しは畳む
			setConfirming(false);
			// disabled にした時点でフォーカスが body へ落ちている。押し直せるよう戻す。
			// disabled なままの要素には focus() が効かないので、戻すのは有効に戻したあと
			if (refocus) button.focus();
		}
		// 消せた後の処理 (件数の数え直し等) の失敗は削除の失敗ではない。try の外で呼ぶ。
		// 行は既に消えているので画面には出さず、unhandled rejection にもしない
		if (!removed) return;
		try {
			await deps.onRemoved({ item, isRoot, focused, stillCurrent });
		} catch (error) {
			warn('failed to remove deleted comment', comment.id, error);
		}
	}

	button.addEventListener('click', () => {
		if (!confirming) {
			setConfirming(true);
			return;
		}
		void remove();
	});
	button.addEventListener('blur', () => { setConfirming(false); });

	meta.prepend(button);
}
