/**
 * コメントの表示。ルートコメントだけを出し、返信は本体ページへ誘導する。
 * コメントの取得に失敗しても画像は見られるので、失敗はこの区画の中だけで伝える。
 */
import { getJson } from '../../pixiv/client.js';
import { commentRootsUrl, safeCdnUrl, emojiUrl, stampUrl } from '../../pixiv/endpoints.js';
import { parseCommentText } from '../../pixiv/emoji.js';
import { COMMENT_PAGE_SIZE } from '../../common/constants.js';

/** 退会したユーザーの表示名。 */
const DELETED_USER_NAME = '退会したユーザー';

/** スタンプコメントの本文の代わり。 */
const STAMP_PLACEHOLDER = '[スタンプ]';

/**
 * @typedef {object} Comment
 * @property {string} id
 * @property {string} userId
 * @property {string} userName
 * @property {string} avatarUrl
 * @property {string} text
 * @property {string} date
 * @property {boolean} isStamp
 * @property {string|null} stampId スタンプの ID。スタンプでなければ null
 * @property {boolean} hasReplies
 */

/**
 * コメントを共通の形にする。
 * @param {object} raw comments/roots の 1 件
 * @returns {Comment} 正規化したコメント
 */
export function normalizeComment(raw) {
	const isStamp = Boolean(raw.stampId);
	return {
		id: raw.id,
		userId: raw.userId ?? '',
		userName: raw.isDeletedUser ? DELETED_USER_NAME : (raw.userName ?? DELETED_USER_NAME),
		avatarUrl: raw.img ?? '',
		// スタンプのときは本文が空で届く。文字に置き換えず、描画側で画像にする
		text: raw.comment ?? '',
		date: raw.commentDate ?? '',
		isStamp,
		stampId: isStamp ? String(raw.stampId) : null,
		hasReplies: raw.hasReplies === true,
	};
}

/**
 * コメント本文を描画用のノードにする。絵文字は画像へ、それ以外は文字のまま。
 * @param {Document} doc document
 * @param {string} text コメント本文
 * @returns {Node[]} 並べるノード
 */
export function renderCommentText(doc, text) {
	return parseCommentText(text).map((fragment) => {
		if (fragment.kind !== 'emoji') return doc.createTextNode(fragment.text);
		const image = doc.createElement('img');
		image.className = 'comment-emoji';
		image.setAttribute('src', emojiUrl(fragment.id));
		// 読み上げと、画像が出ないときの控えを兼ねて元の文字を持たせる
		image.setAttribute('alt', fragment.text);
		// 落ちても本文が読めるように、元の (heaven) の形へ戻す
		image.addEventListener('error', () => { image.replaceWith(doc.createTextNode(fragment.text)); });
		return image;
	});
}

/**
 * スタンプを描画用のノードにする。
 * @param {Document} doc document
 * @param {string|null} stampId スタンプ ID
 * @returns {Node} 画像。URL を組み立てられなければ文字
 */
export function renderStamp(doc, stampId) {
	const url = stampUrl(stampId);
	if (!url) {
		const fallback = doc.createElement('span');
		fallback.textContent = STAMP_PLACEHOLDER;
		return fallback;
	}
	const image = doc.createElement('img');
	image.className = 'comment-stamp';
	image.setAttribute('src', url);
	image.setAttribute('alt', 'スタンプ');
	image.addEventListener('error', () => { image.replaceWith(doc.createTextNode(STAMP_PLACEHOLDER)); });
	return image;
}

/**
 * @typedef {object} CommentsDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先
 */

/**
 * コメント区画を作る。
 * @param {CommentsDeps} deps 依存
 * @returns {{load: (detail: object) => Promise<void>, dispose: () => void}}
 */
export function createComments(deps) {
	const { doc, container } = deps;
	/** 読み込み済みの件数。「もっと見る」で増やす */
	let offset = 0;
	/** 今表示している作品 */
	let workId = null;
	/** @type {HTMLElement|null} */
	let list = null;
	/** @type {HTMLButtonElement|null} */
	let moreButton = null;

	/**
	 * コメント 1 件を要素にする。
	 * @param {Comment} comment コメント
	 * @returns {HTMLElement} 要素
	 */
	function createItem(comment) {
		const item = doc.createElement('li');
		item.className = 'comment-item';

		const avatar = doc.createElement('img');
		avatar.className = 'comment-avatar';
		avatar.alt = '';
		// API が返した値をそのまま外部オリジンへのリクエストにしない。
		// pixiv の CDN 以外を指していたら読み込まず、読み込み失敗と同じ見え方にする
		const avatarUrl = safeCdnUrl(comment.avatarUrl);
		if (avatarUrl) avatar.src = avatarUrl;
		else avatar.style.visibility = 'hidden';
		// 読み込めなくても本文は読めるので、枠だけ残して黙って続ける
		avatar.addEventListener('error', () => { avatar.style.visibility = 'hidden'; });

		const body = doc.createElement('div');
		body.className = 'comment-body';

		const name = doc.createElement('span');
		name.className = 'comment-name';
		name.textContent = comment.userName;

		const text = doc.createElement('p');
		text.className = 'comment-text';
		if (comment.isStamp) text.appendChild(renderStamp(doc, comment.stampId));
		else text.append(...renderCommentText(doc, comment.text));

		const meta = doc.createElement('span');
		meta.className = 'comment-date';
		meta.textContent = comment.date;

		body.append(name, text, meta);

		if (comment.hasReplies) {
			const replies = doc.createElement('a');
			replies.className = 'comment-replies';
			replies.href = `/artworks/${workId}`;
			replies.target = '_blank';
			replies.rel = 'noopener noreferrer';
			replies.textContent = '返信を pixiv で見る';
			body.appendChild(replies);
		}

		item.append(avatar, body);
		return item;
	}

	/**
	 * 続きを読み込んで並べる。
	 * @returns {Promise<void>}
	 */
	async function loadMore() {
		// 読み込み中に別の作品へ移ることがある。応答が返ったときに
		// まだ同じ作品を見ているかを確かめてから描く
		const requestedWorkId = workId;
		if (moreButton) moreButton.disabled = true;
		try {
			const body = await getJson(commentRootsUrl(requestedWorkId, offset, COMMENT_PAGE_SIZE));
			// 待っている間に破棄されたか、別の作品へ移っていたら捨てる
			if (workId !== requestedWorkId || !list) return;
			const comments = (body?.comments ?? []).map(normalizeComment);
			for (const comment of comments) {
				list.appendChild(createItem(comment));
			}
			offset += comments.length;
			if (moreButton) {
				moreButton.hidden = body?.hasNext !== true;
				moreButton.disabled = false;
			}
		} catch (error) {
			// 破棄後・別の作品へ移った後の失敗は伝えない。
			// これを入れないと、正常な切り替えが読み込み失敗として表示される
			if (workId !== requestedWorkId) return;
			const failure = doc.createElement('p');
			failure.className = 'status';
			failure.dataset.kind = 'error';
			failure.setAttribute('role', 'alert');
			failure.textContent = 'コメントを読み込めませんでした';
			container.appendChild(failure);
			if (moreButton) moreButton.hidden = true;
			console.warn('[PixivMaster] failed to load comments', requestedWorkId, error);
		}
	}

	return {
		/**
		 * 作品のコメントを読み込む。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async load(detail) {
			workId = detail.id;
			offset = 0;
			container.textContent = '';

			const heading = doc.createElement('h3');
			heading.className = 'comments-heading';
			heading.textContent = 'コメント';
			container.appendChild(heading);

			if (detail.commentOff) {
				const off = doc.createElement('p');
				off.className = 'status';
				off.textContent = 'この作品はコメントを受け付けていません';
				container.appendChild(off);
				return;
			}
			if (detail.commentCount === 0) {
				const empty = doc.createElement('p');
				empty.className = 'status';
				empty.textContent = 'まだコメントはありません';
				container.appendChild(empty);
				return;
			}

			list = doc.createElement('ul');
			list.className = 'comment-list';
			container.appendChild(list);

			moreButton = doc.createElement('button');
			moreButton.type = 'button';
			moreButton.className = 'more';
			moreButton.textContent = 'もっと見る';
			moreButton.hidden = true;
			moreButton.addEventListener('click', () => { void loadMore(); });
			container.appendChild(moreButton);

			await loadMore();
		},

		dispose() {
			list = null;
			moreButton = null;
			workId = null;
		},
	};
}
