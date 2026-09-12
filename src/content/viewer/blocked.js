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
 */
import { canView } from '../../pixiv/normalize.js';
import { VIEWING_SETTINGS_URL } from '../../pixiv/endpoints.js';

/** ぼかしの強さ。48x48 の画像を引き伸ばす前提の値。 */
const BLUR_PX = 32;

/**
 * ブロックする理由を返す。
 * @param {{xRestrict: number}} work 作品
 * @param {{isLoggedIn: boolean, self: object|null}} session セッション
 * @returns {{kind: 'login'|'setting', message: string}|null} 見られるなら null
 */
export function blockReason(work, session) {
	if (canView(work, session.self)) return null;
	if (!session.isLoggedIn) {
		return { kind: 'login', message: 'この作品を見るには pixiv にログインしてください' };
	}
	return { kind: 'setting', message: 'pixiv の表示設定により非表示になっています' };
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

	return {
		/**
		 * ブロック表示を描く。
		 * @param {object} detail 正規化した作品詳細
		 * @param {{kind: string, message: string}} reason 理由
		 * @returns {void}
		 */
		render(detail, reason) {
			// 他のペインは自分の dispose() で片付ける。ここで消すのはビュワーの状態表示だけ
			container.querySelectorAll('.status').forEach((node) => node.remove());

			const blocked = doc.createElement('div');
			blocked.className = 'blocked';
			root = blocked;

			// 48x48 を引き伸ばしてぼかす。元が極小なので拡大しても中身は読み取れない
			const backdrop = doc.createElement('img');
			backdrop.className = 'blocked-backdrop';
			backdrop.src = detail.urls.mini ?? '';
			backdrop.alt = '';
			backdrop.style.filter = `blur(${BLUR_PX}px)`;
			backdrop.addEventListener('error', () => { backdrop.remove(); });

			const panel = doc.createElement('div');
			panel.className = 'blocked-panel';

			const message = doc.createElement('p');
			message.className = 'blocked-message';
			message.textContent = reason.message;
			panel.appendChild(message);

			if (reason.kind === 'setting') {
				const link = doc.createElement('a');
				link.className = 'blocked-link';
				link.href = VIEWING_SETTINGS_URL;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				link.textContent = '表示設定を変更する';
				panel.appendChild(link);
			}

			blocked.append(backdrop, panel);
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
