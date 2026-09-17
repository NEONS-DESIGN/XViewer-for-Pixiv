/**
 * 表示できない作品のブロック表示。
 *
 * 判定は作品の xRestrict とユーザー設定の xRestrict の比較で行う。
 * error フラグや urls では判定できない (SITE_SPEC §6):
 *   - 未ログイン      urls が全て null
 *   - 表示設定 OFF    urls は有効な URL が返る。/pages だけが 404
 *
 * ぼかしには urls.mini (48x48) を使う。元画像が極小なので拡大しても中身が分からない。
 * regular をぼかすと解除の余地が残るため、この方式を守ること。
 * ぼかしの強さは viewer.css の .blocked-backdrop が持つ。
 */
import { canView } from '../../pixiv/normalize.js';
import { VIEWING_SETTINGS_URL } from '../../pixiv/endpoints.js';

/** ブロックの種別。 */
export const BLOCK_KINDS = Object.freeze({
	/** 未ログイン。ログインすれば見られる可能性がある */
	LOGIN: 'login',
	/** ログイン済みだが pixiv の表示設定で止まっている */
	SETTING: 'setting',
});

/**
 * 利用者に見せる文言。
 * 表示設定を変えても、覚えているセッション (__NEXT_DATA__) は SPA 遷移で更新されないので
 * (SITE_SPEC §0)、再読み込みまで案内する。
 */
const MESSAGES = Object.freeze({
	LOGIN_REQUIRED: 'この作品を見るには pixiv にログインしてください',
	HIDDEN_BY_SETTING: 'pixiv の表示設定により非表示になっています',
	RELOAD_AFTER_CHANGE: '変更後はページを再読み込みしてください',
	CHANGE_SETTING: '表示設定を変更する',
});

/**
 * ブロックする理由を返す。
 * @param {{xRestrict: number}} work 作品
 * @param {{isLoggedIn: boolean, self: object|null}} session セッション
 * @returns {{kind: 'login'|'setting', message: string}|null} 見られるなら null
 */
export function blockReason(work, session) {
	if (canView(work, session.self)) return null;
	if (!session.isLoggedIn) {
		return { kind: BLOCK_KINDS.LOGIN, message: MESSAGES.LOGIN_REQUIRED };
	}
	return { kind: BLOCK_KINDS.SETTING, message: MESSAGES.HIDDEN_BY_SETTING };
}

/**
 * @typedef {object} BlockedDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先 (.stage)
 */

/**
 * ブロック表示を作る。
 * @param {BlockedDeps} deps 依存
 * @returns {{render: (detail: object, reason: object) => void, dispose: () => void}}
 */
export function createBlocked(deps) {
	const { doc, container } = deps;
	/** @type {HTMLElement|null} 自分が作った要素。dispose で外す */
	let root = null;

	/**
	 * 背後に敷くぼかしを作る。
	 * @param {string} mini urls.mini (48x48)
	 * @returns {HTMLImageElement} img
	 */
	function createBackdrop(mini) {
		// 48x48 を引き伸ばしてぼかす。元が極小なので拡大しても中身は読み取れない
		const backdrop = doc.createElement('img');
		backdrop.className = 'blocked-backdrop';
		backdrop.src = mini;
		backdrop.alt = '';
		backdrop.addEventListener('error', () => { backdrop.remove(); });
		return backdrop;
	}

	return {
		/**
		 * ブロック表示を描く。
		 * ビュワーの状態表示 (.status) はビュワー自身が消すので、ここでは触らない。
		 * @param {object} detail 正規化した作品詳細
		 * @param {{kind: string, message: string}} reason 理由
		 * @returns {void}
		 */
		render(detail, reason) {
			const blocked = doc.createElement('div');
			blocked.className = 'blocked';
			root = blocked;

			// 未ログインでは urls が全て null。無いときに img を作ると src='' の失敗が 1 往復増えるだけ
			const mini = detail.urls?.mini;
			if (mini) blocked.appendChild(createBackdrop(mini));

			const panel = doc.createElement('div');
			panel.className = 'blocked-panel';

			const message = doc.createElement('p');
			message.className = 'blocked-message';
			message.textContent = reason.message;
			panel.appendChild(message);

			if (reason.kind === BLOCK_KINDS.SETTING) {
				const link = doc.createElement('a');
				link.className = 'blocked-link';
				link.href = VIEWING_SETTINGS_URL;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				link.textContent = MESSAGES.CHANGE_SETTING;
				panel.appendChild(link);

				const note = doc.createElement('p');
				note.className = 'blocked-note';
				note.textContent = MESSAGES.RELOAD_AFTER_CHANGE;
				panel.appendChild(note);
			}

			blocked.appendChild(panel);
			container.appendChild(blocked);
		},

		dispose() {
			// 自分が作った DOM は自分で片付ける。
			// 他のペインの消去セレクタに .blocked を足す形にすると、
			// 無関係なペイン同士が互いのクラス名を知ることになる。
			// これを外さないと、次に開いた作品の画像と横に並んで両方潰れる
			root?.remove();
			root = null;
		},
	};
}
