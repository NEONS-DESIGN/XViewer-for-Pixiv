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
 * **自分の作品には 3 つとも出さない。** pixiv は自分にいいね・ブックマーク・フォローをさせず、
 * 本体の UI もこの 3 つを描かない。(SITE_SPEC §4) 押せば必ず失敗するので、そもそも出さない。
 * 判定は `isOwnWork(detail, session.self)` = 作者 ID と `userData.self.id` の一致だけ。
 *
 * **いいねとブックマークは独立したボタンを持たない。** サイドバーのカウンタ
 * (.count-like / .count-bookmark) をボタンへ差し替え、数字そのものを押させる。(X.com と同じ形)
 * 押す対象と結果が同じ場所にあるので、押した後に数字が動くのが分かる。
 * 差し替えないままなら押せない表示として残るので、未ログインでも件数は読める。
 *
 * フォローだけは作者行の右端に独立したボタンとして描く。
 * 描画先が 2 つに分かれるので container (カウンタの行) と followContainer を別々に受け取る。
 *
 * フォロー状態は作品詳細 (/ajax/illust/{id}) には入っておらず、
 * /ajax/user/{id}?full=1 を別に引く。(SITE_SPEC §4) 覚えるのは pixiv/user.js の 1 か所で、
 * 自分でフォロー / 解除したときは patchUser で書き戻す。ここに別のキャッシュは持たない。
 * pixiv 本体のヘッダで変えた場合はページを再読み込みするまで追従しない。
 */
import { STATUS_KINDS } from '../../common/constants.js';
import { createIcon } from '../../common/icons.js';
import { formatCount } from '../../common/format.js';
import { warn } from '../../common/log.js';
import { readSession, clearSessionCache } from '../session.js';
import { fetchUserProfile, patchUserProfile } from '../../pixiv/user.js';
import { isOwnWork } from '../../pixiv/normalize.js';
import { PIXIV_ERROR_KINDS } from '../../pixiv/errors.js';
import { likeIllust, addBookmark, deleteBookmark, followUser, unfollowUser } from '../../pixiv/actions.js';

/** 利用者に見せる文言。 */
const MESSAGES = Object.freeze({
	LOGIN_TO_ACT: 'ログインするといいねやブックマークができます',
	SESSION_EXPIRED: 'ログインが切れています。pixiv にログインし直し、このページを再読み込みしてください',
	LIKED: 'いいねしました',
	ALREADY_LIKED: '既にいいね済みでした',
	LIKE_FAILED: 'いいねできませんでした',
	BOOKMARKED: 'ブックマークしました',
	BOOKMARKED_PRIVATE: '非公開でブックマークしました',
	UNBOOKMARKED: 'ブックマークを外しました',
	BOOKMARK_FAILED: 'ブックマークを変更できませんでした',
	FOLLOWED: 'フォローしました',
	UNFOLLOWED: 'フォローを解除しました',
	FOLLOW_FAILED: 'フォローを変更できませんでした',
});

/** ブックマークを非公開で入れる操作の手掛かり。title にだけ添える。(画面には出ない) */
export const BOOKMARK_PRIVATE_HINT = '(Shift + クリックで非公開)';

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
 * 押せるカウンタの読み上げ用の文言。
 * 見えているのはアイコンと数字だけなので、操作の説明と件数を両方入れる。
 * @param {string} label 操作の説明 (いいね済み など)
 * @param {number} count 件数
 * @returns {string} 文言
 */
export function countLabel(label, count) {
	return `${label} ${formatCount(count)} 件`;
}

/**
 * @typedef {object} ActionsDeps
 * @property {Document} doc
 * @property {HTMLElement} container カウンタの行 (.counts)。中の .count-like / .count-bookmark を差し替える
 * @property {HTMLElement} [followContainer] フォローの描画先 (.follow-slot)。無ければフォローを出さない
 * @property {(userId: string) => Promise<object>} [fetchUser] ユーザー情報の取得。既定は /ajax/user/{id}?full=1
 * @property {(userId: string, patch: object) => void} [patchUser] 覚えているユーザー情報の書き換え。既定は pixiv/user.js
 * @property {object} [actions] 更新系の差し替え。テストから通信させないために使う
 */

/**
 * アクション列を作る。
 * @param {ActionsDeps} deps 依存
 * @returns {{render: (detail: object) => void, dispose: () => void}}
 */
export function createActionsBar(deps) {
	const { doc, container, followContainer } = deps;
	// サイドバー (作者アイコン) と同じ応答を使う。作品ごとに 2 本走らせない
	const fetchUser = deps.fetchUser ?? fetchUserProfile;
	// 自分で変えたフォロー状態は覚えている応答へ書き戻す。次の作品で取り直さないため
	const patchUser = deps.patchUser ?? patchUserProfile;
	// 更新系はまとめて差し替えられるようにしておく。
	// テストで本物の pixiv を叩かないためと、いいねが取り消せないため
	const api = { likeIllust, addBookmark, deleteBookmark, followUser, unfollowUser, ...deps.actions };
	/** 押した結果を読み上げさせるための領域 */
	let statusLine = null;
	/** 破棄済みか。await の後に自分がまだ生きているか確かめるために使う */
	let disposed = false;

	/**
	 * 操作の結果を伝える。
	 *
	 * 成功は画面に出さない。押した結果はボタン自身の見た目 (ラベル・disabled・is-on) が
	 * 既に伝えているので、下に文言が出るとカウンタの位置が動くだけで邪魔になる。
	 * 読み上げには渡したいので要素は残し、CSS で見えなくしている。(viewer.css の .action-status)
	 * 失敗だけはボタンの見た目に出ないので、目にも見えるようにする。
	 * @param {string} message 文言
	 * @param {string} [kind] 種別 (STATUS_KINDS)。error だけ画面に出す
	 * @returns {void}
	 */
	function announce(message, kind = STATUS_KINDS.INFO) {
		if (!statusLine) return;
		statusLine.textContent = message;
		statusLine.setAttribute('data-kind', kind);
	}

	/**
	 * 更新系の失敗を伝える。
	 * 401 はログインが切れている。(別タブでログアウトした等)
	 * 覚えているセッションを捨て、通信失敗とは別の文言で知らせる。
	 * __NEXT_DATA__ は初期 HTML のもので SPA 遷移では更新されないので (SITE_SPEC §0)、
	 * ログインし直しただけでは新しい CSRF トークンを読めない。文言で再読み込みまで案内する
	 * @param {string} message 通常の失敗文言
	 * @param {unknown} error 投げられたエラー
	 * @param {string} logLabel console に出す見出し
	 * @returns {void}
	 */
	function announceFailure(message, error, logLabel) {
		if (error?.kind === PIXIV_ERROR_KINDS.UNAUTHORIZED) {
			clearSessionCache();
			announce(MESSAGES.SESSION_EXPIRED, STATUS_KINDS.ERROR);
		} else {
			announce(message, STATUS_KINDS.ERROR);
		}
		warn(logLabel, error);
	}

	/**
	 * 文言付きのボタンを作る。
	 * 文言が見えているので aria-label は付けない。(可視テキストと重複して二度読まれる)
	 * @param {string} iconName アイコン名
	 * @param {string} label ラベル
	 * @param {(event: MouseEvent) => void} onClick 押されたとき
	 * @returns {HTMLButtonElement} ボタン
	 */
	function createButton(iconName, label, onClick) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = 'action';
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
	 * カウンタ 1 つを押せるボタンへ差し替える。
	 * 中身 (アイコンと数字) は describeCount() が入れる。
	 * @param {string} marker 差し替える .count に付いている印 (count-like など)
	 * @param {string} iconName アイコン名
	 * @param {(event: MouseEvent) => void} onClick 押されたとき
	 * @returns {HTMLButtonElement|null} 差し替えたボタン。印が見つからなければ null
	 */
	function upgradeCount(marker, iconName, onClick) {
		const item = container.querySelector(`.${marker}`);
		if (!item) return null;
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = `count count-action ${marker}`;
		button.appendChild(createIcon(doc, iconName));
		button.appendChild(doc.createElement('span'));
		button.addEventListener('click', onClick);
		container.replaceChild(button, item);
		return button;
	}

	/**
	 * 押せるカウンタの数字と説明を書き直す。
	 * 見えているのはアイコンと数字だけなので、何のボタンかは aria-label と title が持つ。
	 * @param {HTMLButtonElement|null} button 対象。null なら何もしない
	 * @param {string} label 操作の説明 (いいね済み など)
	 * @param {number} count 件数
	 * @param {string} [hint] title にだけ添える操作の手掛かり (Shift で非公開 など)
	 * @returns {void}
	 */
	function describeCount(button, label, count, hint) {
		if (!button) return;
		const text = countLabel(label, count);
		button.setAttribute('aria-label', text);
		button.title = hint ? `${text} ${hint}` : text;
		button.querySelector('span').textContent = formatCount(count);
	}

	/**
	 * ブックマークのカウンタの説明を状態に合わせて書き直す。
	 * 未ブックマークのときだけ、非公開で入れる操作の手掛かりを title に添える。
	 * @param {HTMLButtonElement|null} button 対象
	 * @param {string|null} bookmarkId ブックマーク済みならその ID
	 * @param {number} count 件数
	 * @returns {void}
	 */
	function describeBookmark(button, bookmarkId, count) {
		describeCount(button, bookmarkLabel(bookmarkId), count, bookmarkId ? undefined : BOOKMARK_PRIVATE_HINT);
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
	 * フォロー状態を取り出す。同じ作者の応答は pixiv/user.js が覚えているので、ここでは覚えない。
	 * @param {string} userId 作者の ID
	 * @returns {Promise<boolean>} フォロー済みか
	 */
	async function resolveFollowing(userId) {
		const body = await fetchUser(userId);
		return body?.isFollowed === true;
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
				if (following) await api.unfollowUser(detail.userId, token);
				else await api.followUser(detail.userId, token);
				if (disposed) return;
				following = !following;
				// 覚えている応答へ書き戻す。次の作品でも取り直さずに今の状態が出る
				patchUser(detail.userId, { isFollowed: following });
				applyFollowState(button, following);
				announce(following ? MESSAGES.FOLLOWED : MESSAGES.UNFOLLOWED);
			} catch (error) {
				if (disposed) return;
				announceFailure(MESSAGES.FOLLOW_FAILED, error, 'follow failed');
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
				warn('follow state failed', error);
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
			// カウンタの行はサイドバーが描いた中身をそのまま使う。ここで消さないこと
			if (followContainer) followContainer.textContent = '';
			const session = readSession(doc);

			// 未ログインでは更新系が使えない。カウンタは押せない表示のまま残すので件数は読める。
			// 押せるものが無いので、結果を読み上げる領域も要らない
			if (!session.isLoggedIn || !session.csrfToken) {
				const notice = doc.createElement('p');
				notice.className = 'status';
				notice.textContent = MESSAGES.LOGIN_TO_ACT;
				container.appendChild(notice);
				return;
			}

			// 自分の作品には、いいね・ブックマーク・フォローのどれもできない。
			// pixiv 本体もこの 3 つを描かない。(SITE_SPEC §4) 押せば必ず失敗するボタンを出さない。
			// カウンタは押せない表示のまま残るので件数は読めるし、作者は自分の名前なので
			// なぜ押せないかは画面から分かる (案内の文言は足さない)
			if (isOwnWork(detail, session.self)) return;

			statusLine = doc.createElement('p');
			statusLine.className = 'action-status';
			// 押した結果を読み上げさせる。alert ではないので操作を邪魔しない
			statusLine.setAttribute('role', 'status');

			let liked = detail.likedByMe;
			let bookmarkId = detail.bookmarkId;
			// 押した結果を数字にも出す。再取得はせず手元で足し引きする
			// (pixiv 側の集計は遅れて反映されるので、取り直しても押した直後は変わらない)
			let likeCount = detail.likeCount;
			let bookmarkCount = detail.bookmarkCount;

			const likeButton = upgradeCount('count-like', 'like', async () => {
				if (liked) return;
				likeButton.disabled = true;
				try {
					// 戻り値は「送信前に既にいいね済みだったか」。(別タブで先に押していた等)
					// 済みなら pixiv 側の件数は増えないので、手元の足し込みも見送る
					const alreadyLiked = await api.likeIllust(detail.id, readSession(doc).csrfToken);
					if (disposed) return;
					liked = true;
					if (alreadyLiked !== true) likeCount += 1;
					likeButton.classList.add('is-on');
					describeCount(likeButton, likeLabel(true), likeCount);
					announce(alreadyLiked === true ? MESSAGES.ALREADY_LIKED : MESSAGES.LIKED);
				} catch (error) {
					if (disposed) return;
					likeButton.disabled = false;
					announceFailure(MESSAGES.LIKE_FAILED, error, 'like failed');
				}
			});
			describeCount(likeButton, likeLabel(liked), likeCount);
			if (likeButton) {
				// いいねは取り消せない。済みなら押させない
				likeButton.disabled = liked;
				if (liked) likeButton.classList.add('is-on');
			}

			const bookmarkButton = upgradeCount('count-bookmark', 'favorite', async (event) => {
				bookmarkButton.disabled = true;
				const wasBookmarked = Boolean(bookmarkId);
				// 反映が遅れるので画面を先に変える
				const token = readSession(doc).csrfToken;
				try {
					if (wasBookmarked) {
						await api.deleteBookmark(bookmarkId, token);
						// 破棄済みのボタンを触らない。状態の書き換えも await の直後で止める
						if (disposed) return;
						bookmarkId = null;
						// 表示が負の数になるのを防ぐ。pixiv 側の集計とずれていても画面は壊さない
						bookmarkCount = Math.max(0, bookmarkCount - 1);
						bookmarkButton.classList.remove('is-on');
						announce(MESSAGES.UNBOOKMARKED);
					} else {
						// 非公開で入れたいときは Shift を押しながら
						const isPrivate = event.shiftKey === true;
						const added = await api.addBookmark(detail.id, isPrivate, token);
						if (disposed) return;
						bookmarkId = added;
						bookmarkCount += 1;
						bookmarkButton.classList.add('is-on');
						announce(isPrivate ? MESSAGES.BOOKMARKED_PRIVATE : MESSAGES.BOOKMARKED);
					}
					describeBookmark(bookmarkButton, bookmarkId, bookmarkCount);
				} catch (error) {
					if (disposed) return;
					announceFailure(MESSAGES.BOOKMARK_FAILED, error, 'bookmark failed');
				} finally {
					bookmarkButton.disabled = false;
				}
			});
			describeBookmark(bookmarkButton, bookmarkId, bookmarkCount);
			if (bookmarkId) bookmarkButton?.classList.add('is-on');

			container.appendChild(statusLine);

			// フォローの描画先はサイドバーの作者行。無い構成では出さない
			if (followContainer) renderFollow(detail);
		},

		dispose() {
			disposed = true;
			statusLine = null;
		},
	};
}
