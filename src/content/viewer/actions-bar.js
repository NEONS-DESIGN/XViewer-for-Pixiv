/**
 * いいね・ブックマーク・フォローのボタン。
 *
 * いいねは pixiv の仕様上取り消せない。確認ダイアログは閲覧の流れを止めるので出さず、
 * 「済みなら押せない」「ラベルで明記する」「押したら知らせる」の 3 つで誤爆を防ぐ。
 * ブックマーク削除は反映が数秒遅れるため、画面は先に更新して再取得で確認しない。
 *
 * アイコンの対応は pixiv 本体に合わせる。いいねは顔 (like)、ブックマークはハート (favorite)。
 * 逆にすると意味が入れ替わって見える。
 *
 * いいねとブックマークはサイドバーのカウンタの上に並べ、フォローだけは作者行の右端へ描く。
 * 描画先が 2 つに分かれるので container と followContainer を別々に受け取る。
 */
import { createIcon } from '../../common/icons.js';
import { readSession } from '../session.js';
import { getJson } from '../../pixiv/client.js';
import { userUrl } from '../../pixiv/endpoints.js';
import { likeIllust, addBookmark, deleteBookmark, followUser, unfollowUser } from '../../pixiv/actions.js';

/**
 * 作者ごとのフォロー状態。
 *
 * フォロー状態は作品詳細 (/ajax/illust/{id}) には入っておらず、
 * /ajax/user/{id}?full=1 を別に引く必要がある (SITE_SPEC §4)。
 * ユーザーページでは作者が変わらないので、作品を送るたびに引き直すのは無駄。
 * 自分で変えたときはここも更新するので、拡張の中では食い違わない。
 * @type {Map<string, boolean>}
 */
const followCache = new Map();

/**
 * 覚えたフォロー状態を捨てる。テストから使う。
 * @returns {void}
 */
export function clearFollowCache() {
	followCache.clear();
}

/**
 * ブックマークボタンのラベル。
 * @param {string|null} bookmarkId ブックマーク済みならその ID
 * @returns {string} ラベル
 */
export function bookmarkLabel(bookmarkId) {
	return bookmarkId ? 'ブックマークから削除' : 'ブックマークに追加';
}

/**
 * いいねボタンのラベル。
 * @param {boolean} liked いいね済みか
 * @returns {string} ラベル
 */
export function likeLabel(liked) {
	return liked ? 'いいね済み' : 'いいね (取り消せません)';
}

/**
 * フォローボタンのラベル。
 * @param {boolean} following フォロー済みか
 * @returns {string} ラベル
 */
export function followLabel(following) {
	return following ? 'フォロー中' : 'フォロー';
}

/**
 * @typedef {object} ActionsDeps
 * @property {Document} doc
 * @property {HTMLElement} container いいね・ブックマークの描画先 (.actions)
 * @property {HTMLElement} [followContainer] フォローの描画先 (.follow-slot)。無ければフォローを出さない
 * @property {(userId: string) => Promise<object>} [fetchUser] ユーザー情報の取得。既定は /ajax/user/{id}?full=1
 */

/**
 * アクション列を作る。
 * @param {ActionsDeps} deps 依存
 * @returns {{render: (detail: object) => void, dispose: () => void}}
 */
export function createActionsBar(deps) {
	const { doc, container, followContainer } = deps;
	const fetchUser = deps.fetchUser ?? ((userId) => getJson(userUrl(userId)));
	/** 押した結果を読み上げさせるための領域 */
	let statusLine = null;
	/** 破棄済みか。await の後に自分がまだ生きているか確かめるために使う */
	let disposed = false;

	/**
	 * 操作の結果を伝える。
	 * @param {string} message 文言
	 * @returns {void}
	 */
	function announce(message) {
		if (statusLine) statusLine.textContent = message;
	}

	/**
	 * ボタンを作る。
	 * @param {string} iconName アイコン名
	 * @param {string} label ラベル
	 * @param {(event: MouseEvent) => void} onClick 押されたとき
	 * @returns {HTMLButtonElement} ボタン
	 */
	function createButton(iconName, label, onClick) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = 'action';
		button.setAttribute('aria-label', label);
		button.title = label;
		button.appendChild(createIcon(doc, iconName));
		const text = doc.createElement('span');
		text.textContent = label;
		button.appendChild(text);
		button.addEventListener('click', onClick);
		return button;
	}

	/**
	 * ボタンのラベルを差し替える。
	 * @param {HTMLButtonElement} button 対象
	 * @param {string} label 新しいラベル
	 * @returns {void}
	 */
	function relabel(button, label) {
		button.setAttribute('aria-label', label);
		button.title = label;
		button.querySelector('span').textContent = label;
	}

	/**
	 * ボタンのアイコンを差し替える。
	 * @param {HTMLButtonElement} button 対象
	 * @param {string} iconName 新しいアイコン名
	 * @returns {void}
	 */
	function reicon(button, iconName) {
		const current = button.querySelector('svg');
		if (current) button.replaceChild(createIcon(doc, iconName), current);
	}

	/**
	 * フォローボタンの見た目を状態に合わせる。
	 * フォロー中は「押すと解除」になるので、塗りつぶしを外して目立たせない。
	 * @param {HTMLButtonElement} button 対象
	 * @param {boolean} following フォロー済みか
	 * @returns {void}
	 */
	function applyFollowState(button, following) {
		relabel(button, followLabel(following));
		reicon(button, following ? 'personCheck' : 'personAdd');
		button.classList.toggle('is-on', following);
	}

	/**
	 * フォロー状態を取り出す。作者ごとに 1 回だけ取りに行く。
	 * @param {string} userId 作者の ID
	 * @returns {Promise<boolean>} フォロー済みか
	 */
	async function resolveFollowing(userId) {
		if (followCache.has(userId)) return followCache.get(userId);
		const body = await fetchUser(userId);
		const following = body?.isFollowed === true;
		followCache.set(userId, following);
		return following;
	}

	/**
	 * フォローボタンを作って描く。
	 * 状態が分かるまでは押せない。押した先が「フォロー」か「解除」か決まらないため。
	 * @param {object} detail 正規化した作品詳細
	 * @returns {void}
	 */
	function renderFollow(detail) {
		let following = false;

		const button = createButton('personAdd', followLabel(false), async () => {
			button.disabled = true;
			const token = readSession(doc).csrfToken;
			try {
				if (following) await unfollowUser(detail.userId, token);
				else await followUser(detail.userId, token);
				if (disposed) return;
				following = !following;
				followCache.set(detail.userId, following);
				applyFollowState(button, following);
				announce(following ? 'フォローしました' : 'フォローを解除しました');
			} catch (error) {
				if (disposed) return;
				announce('フォローを変更できませんでした');
				console.warn('[PixivMaster] follow failed', error);
			} finally {
				button.disabled = false;
			}
		});
		button.className = 'action action-follow';
		button.disabled = true;
		button.setAttribute('aria-busy', 'true');
		followContainer.appendChild(button);

		void (async () => {
			try {
				following = await resolveFollowing(detail.userId);
			} catch (error) {
				// 取れなくても押せる状態には戻す。押せばフォロー自体は効く
				console.warn('[PixivMaster] follow state failed', error);
			}
			if (disposed) return;
			applyFollowState(button, following);
			button.disabled = false;
			button.removeAttribute('aria-busy');
		})();
	}

	return {
		/**
		 * 作品に対する操作を描く。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {void}
		 */
		render(detail) {
			container.textContent = '';
			if (followContainer) followContainer.textContent = '';
			const session = readSession(doc);

			statusLine = doc.createElement('p');
			statusLine.className = 'action-status';
			// 押した結果を読み上げさせる。alert ではないので操作を邪魔しない
			statusLine.setAttribute('role', 'status');

			// 未ログインでは更新系が使えない
			if (!session.isLoggedIn || !session.csrfToken) {
				const notice = doc.createElement('p');
				notice.className = 'status';
				notice.textContent = 'ログインするといいねやブックマークができます';
				container.append(notice, statusLine);
				return;
			}

			let liked = detail.likedByMe;
			let bookmarkId = detail.bookmarkId;

			const likeButton = createButton('like', likeLabel(liked), async () => {
				if (liked) return;
				likeButton.disabled = true;
				try {
					await likeIllust(detail.id, readSession(doc).csrfToken);
					if (disposed) return;
					liked = true;
					relabel(likeButton, likeLabel(true));
					likeButton.classList.add('is-on');
					announce('いいねしました');
				} catch (error) {
					if (disposed) return;
					likeButton.disabled = false;
					announce('いいねできませんでした');
					console.warn('[PixivMaster] like failed', error);
				}
			});
			likeButton.disabled = liked;
			if (liked) likeButton.classList.add('is-on');

			const bookmarkButton = createButton('favorite', bookmarkLabel(bookmarkId), async (event) => {
				bookmarkButton.disabled = true;
				const wasBookmarked = Boolean(bookmarkId);
				// 反映が遅れるので画面を先に変える
				const token = readSession(doc).csrfToken;
				try {
					if (wasBookmarked) {
						await deleteBookmark(bookmarkId, token);
						bookmarkId = null;
						bookmarkButton.classList.remove('is-on');
						announce('ブックマークを外しました');
					} else {
						// 非公開で入れたいときは Shift を押しながら
						const isPrivate = event.shiftKey;
						bookmarkId = await addBookmark(detail.id, isPrivate, token);
						bookmarkButton.classList.add('is-on');
						announce(isPrivate ? '非公開でブックマークしました' : 'ブックマークしました');
					}
					if (disposed) return;
					relabel(bookmarkButton, bookmarkLabel(bookmarkId));
				} catch (error) {
					if (disposed) return;
					announce('ブックマークを変更できませんでした');
					console.warn('[PixivMaster] bookmark failed', error);
				} finally {
					bookmarkButton.disabled = false;
				}
			});
			if (bookmarkId) bookmarkButton.classList.add('is-on');

			container.append(likeButton, bookmarkButton, statusLine);

			// フォローの描画先はサイドバーの作者行。無い構成では出さない
			if (followContainer) renderFollow(detail);
		},

		dispose() {
			disposed = true;
			statusLine = null;
		},
	};
}
