/**
 * いいね・ブックマーク・フォローのボタン。
 *
 * いいねは pixiv の仕様上取り消せない。確認ダイアログは閲覧の流れを止めるので出さず、
 * 「済みなら押せない」「ラベルで明記する」「押したら知らせる」の 3 つで誤爆を防ぐ。
 * ブックマーク削除は反映が数秒遅れるため、画面は先に更新して再取得で確認しない。
 */
import { createIcon } from '../../common/icons.js';
import { readSession } from '../../pixiv/session.js';
import { likeIllust, addBookmark, deleteBookmark, followUser, unfollowUser } from '../../pixiv/actions.js';

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
 * @typedef {object} ActionsDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先
 */

/**
 * アクション列を作る。
 * @param {ActionsDeps} deps 依存
 * @returns {{render: (detail: object) => void, dispose: () => void}}
 */
export function createActionsBar(deps) {
	const { doc, container } = deps;
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

	return {
		/**
		 * 作品に対する操作を描く。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {void}
		 */
		render(detail) {
			container.textContent = '';
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
			let following = false;

			const likeButton = createButton('favorite', likeLabel(liked), async () => {
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

			const bookmarkButton = createButton('bookmark', bookmarkLabel(bookmarkId), async (event) => {
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

			const followButton = createButton('personAdd', 'この作者をフォロー', async () => {
				followButton.disabled = true;
				const token = readSession(doc).csrfToken;
				try {
					if (following) {
						await unfollowUser(detail.userId, token);
						if (disposed) return;
						following = false;
						relabel(followButton, 'この作者をフォロー');
						followButton.classList.remove('is-on');
						announce('フォローを解除しました');
					} else {
						await followUser(detail.userId, token);
						if (disposed) return;
						following = true;
						relabel(followButton, 'フォロー中');
						followButton.classList.add('is-on');
						announce('フォローしました');
					}
				} catch (error) {
					if (disposed) return;
					announce('フォローを変更できませんでした');
					console.warn('[PixivMaster] follow failed', error);
				} finally {
					followButton.disabled = false;
				}
			});

			container.append(likeButton, bookmarkButton, followButton, statusLine);
		},

		dispose() {
			disposed = true;
			statusLine = null;
		},
	};
}
