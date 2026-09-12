/**
 * コメントの表示。ルートコメントを並べ、返信は必要なときだけ引いて下にぶら下げる。
 * コメントの取得に失敗しても画像は見られるので、失敗はこの区画の中だけで伝える。
 */
import { createIcon } from '../../common/icons.js';
import { getJson } from '../../pixiv/client.js';
import { commentRootsUrl, commentRepliesUrl, safeCdnUrl, emojiUrl, stampUrl } from '../../pixiv/endpoints.js';
import { parseCommentText } from '../../pixiv/emoji.js';
import { COMMENT_PAGE_SIZE } from '../../common/constants.js';

/** 退会したユーザーの表示名。 */
/** 続きを読むボタンの文言。 */
const MORE_LABEL = 'もっと見る';

/** 読み込みに失敗したあとのボタンの文言。押すと同じ位置から読み直す。 */
const RETRY_LABEL = '再試行';

const DELETED_USER_NAME = '退会したユーザー';

/** スタンプコメントの本文の代わり。 */
const STAMP_PLACEHOLDER = '[スタンプ]';

/** 返信の開閉ボタンの文言。 */
const REPLIES_LABEL = Object.freeze({ SHOW: '返信を表示', HIDE: '返信を隠す' });

/** 返信の 1 ページ目。replies API は offset ではなく 1 始まりの page で送る。 */
const FIRST_REPLY_PAGE = 1;

/** 見出しの右端のボタンの文言。サイドバーの先頭 (投稿文) へ戻す。 */
const TO_TOP_LABEL = '上部へ';

/** 見出しが上端に貼り付いている間だけ付ける印。下に線を引くのに使う。 */
const STUCK_CLASS = 'is-stuck';

/**
 * 貼り付いたと見なす許容差 (px)。
 * 端数の丸めで 1px 足らずずれることがあり、ちょうど 0 で比べると線が点滅する。
 */
const STUCK_EPSILON = 1;

/**
 * 見出しがスクロール領域の上端に貼り付いているかを判定する。
 * @param {number} headingTop 見出しの上端 (画面座標)
 * @param {number} scrollportTop スクロール領域の上端 (画面座標)
 * @returns {boolean} 貼り付いていれば true
 */
export function isHeadingStuck(headingTop, scrollportTop) {
	return headingTop - scrollportTop <= STUCK_EPSILON;
}

/**
 * コメント区画を潰してよい下限の件数。
 * 主文がとても長い作品ではサイドバーの高さが足りず、コメント区画が圧縮される。
 * 0 まで潰れると一覧が箱の外へ出てスクロールでも届かなくなるので、この件数は必ず残す。
 */
const MIN_VISIBLE_COMMENTS = 3;

/**
 * コメント区画を潰してよい下限の高さを求める。
 *
 * 中身が下限より低いときは中身の高さをそのまま返す。
 * 「3 件分」を固定値にすると、中身が 1 件しか無い作品では下に空きができ、
 * 逆に短くしすぎると中身が切れる。どちらも起きないよう実測値から決める。
 * @param {object} sizes 実測値
 * @param {number} sizes.outside 一覧以外の子 (見出し・状態の文言) が使う高さの合計。margin 込み
 * @param {number} sizes.contentHeight 一覧の中身の高さ。一覧が無ければ 0
 * @param {number|null} sizes.nthBottom 残したい件数の最後のコメントの下端。件数が足りなければ null
 * @returns {number} 下限の高さ (px)
 */
export function commentsFloorHeight({ outside, contentHeight, nthBottom }) {
	// 件数が足りないときは中身を全部残す。中身の高さそのものなので空きは出ない
	const listFloor = nthBottom === null ? contentHeight : Math.min(contentHeight, nthBottom);
	return outside + listFloor;
}

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
 * @property {HTMLElement} [scrollTarget] 「上部へ」で先頭に戻す相手 (.sidebar)。無ければボタンを出さない
 * @property {(url: string) => Promise<object>} [fetchJson] 取得の差し替え。テストから通信させないために使う
 */

/**
 * コメント区画を作る。
 * @param {CommentsDeps} deps 依存
 * @returns {{load: (detail: object) => Promise<void>, dispose: () => void}}
 */
export function createComments(deps) {
	const { doc, container } = deps;
	const scrollTarget = deps.scrollTarget ?? null;
	const fetchJson = deps.fetchJson ?? ((url) => getJson(url));
	/** 読み込み済みの件数。「もっと見る」で増やす */
	let offset = 0;
	/** 今表示している作品 */
	let workId = null;
	/** @type {HTMLElement|null} */
	let list = null;
	/** @type {HTMLElement|null} 一覧のスクロール領域。下限を測るのに使う */
	let scroll = null;
	/** @type {HTMLButtonElement|null} */
	let moreButton = null;
	/** @type {HTMLElement|null} 読み込み失敗の表示。再試行で消す */
	let failure = null;
	/** @type {ResizeObserver|null} 中身の高さが変わったら下限を測り直す */
	let sizeWatcher = null;
	/** @type {HTMLElement|null} コメントの見出し。貼り付いたかを見るのに使う */
	let headingEl = null;
	/** @type {HTMLButtonElement|null} 見出しの右端の「上部へ」 */
	let toTopButton = null;
	/** @type {(() => void)|null} scrollTarget の購読を解く */
	let unwatchScroll = null;

	/**
	 * 要素の外側の高さ (margin 込み)。
	 * flex の中では上下の margin が相殺されないので、そのまま足せる。
	 * @param {HTMLElement} el 測る要素
	 * @returns {number} 高さ (px)
	 */
	function outerHeight(el) {
		const height = el.getBoundingClientRect().height;
		const view = doc.defaultView;
		if (!view?.getComputedStyle) return height;
		const style = view.getComputedStyle(el);
		return height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
	}

	/**
	 * MIN_VISIBLE_COMMENTS 件目のコメントの下端が、一覧の上から何 px かを測る。
	 * @returns {number|null} 高さ (px)。件数が足りなければ null
	 */
	function nthCommentBottom() {
		const nth = list?.children?.[MIN_VISIBLE_COMMENTS - 1];
		if (!nth || !scroll) return null;
		// すでに読み進めていても同じ値になるよう scrollTop を足す
		return nth.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top + scroll.scrollTop;
	}

	/**
	 * コメント区画を潰してよい下限を実測して入れる。
	 * 返信の開閉・「もっと見る」・幅の変化で中身の高さが変わるたびに呼ぶ。
	 * @returns {void}
	 */
	function applyFloor() {
		// テスト用の DOM には測る口が無い。見た目の調整なので黙って何もしない
		if (typeof container.getBoundingClientRect !== 'function') return;
		let outside = 0;
		for (const child of container.children) {
			if (child !== scroll) outside += outerHeight(child);
		}
		const height = commentsFloorHeight({
			outside,
			contentHeight: scroll ? scroll.scrollHeight : 0,
			nthBottom: nthCommentBottom(),
		});
		const next = `${Math.ceil(height)}px`;
		// 同じ値を書くと ResizeObserver が無駄に回る
		if (container.style.minHeight !== next) container.style.minHeight = next;
	}

	/**
	 * 高さが変わりうる要素を見張る。変わったら下限を測り直す。
	 * @param {HTMLElement} el 見張る要素
	 * @returns {void}
	 */
	function watchSize(el) {
		const Observer = doc.defaultView?.ResizeObserver;
		// テスト用の DOM には無い。見張れなくても初回の実測だけは効く
		if (!Observer) return;
		sizeWatcher ??= new Observer(() => { applyFloor(); });
		sizeWatcher.observe(el);
	}

	/**
	 * 「上部へ」の出し入れ。先頭にいるときは戻る先が無いので隠す。
	 * 押しても何も起きないボタンを見せないため (UI_DESIGN_KIT §6)。
	 * @returns {void}
	 */
	function syncToTop() {
		if (!toTopButton || !scrollTarget) return;
		toTopButton.hidden = !(scrollTarget.scrollTop > 0);
	}

	/**
	 * 貼り付いている間だけ見出しに印を付ける。下に線を引くのは CSS 側。
	 * 貼り付くと見出しとコメントが地続きに見えて境目が分からなくなるため。
	 * @returns {void}
	 */
	function syncStuck() {
		if (!headingEl || !scrollTarget) return;
		// テスト用の DOM には測る口が無い。見た目の調整なので黙って何もしない
		if (typeof headingEl.getBoundingClientRect !== 'function') return;
		const stuck = isHeadingStuck(
			headingEl.getBoundingClientRect().top,
			scrollTarget.getBoundingClientRect().top,
		);
		headingEl.classList.toggle(STUCK_CLASS, stuck);
	}

	/**
	 * サイドバーを送るたびに見直すもの。
	 * @returns {void}
	 */
	function syncScrollState() {
		syncToTop();
		syncStuck();
	}

	/**
	 * サイドバーの先頭へ戻す。動きを抑える設定なら一気に戻す。
	 * @returns {void}
	 */
	function scrollToTop() {
		if (!scrollTarget) return;
		const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
		if (typeof scrollTarget.scrollTo === 'function') {
			scrollTarget.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
			return;
		}
		// scrollTo を持たない相手 (古い実装・テスト用の DOM) でも戻せるようにする
		scrollTarget.scrollTop = 0;
	}

	/**
	 * 見出しを作る。右端に「上部へ」を置く。
	 *
	 * 「サイドバーごと送る」設定では見出しもコメントも一緒に流れるので、
	 * 読み進めたあと投稿文へ戻る手段がいる。
	 * 「コメントだけを送る」設定ではサイドバー自体がほとんど動かないので、
	 * 結果としてこのボタンもほとんど出ない。
	 * @returns {HTMLElement} 見出し
	 */
	function createHeading() {
		const heading = doc.createElement('h3');
		heading.className = 'comments-heading';
		headingEl = heading;

		// 「上部へ」を右端へ寄せるため、見出しの文字も要素に入れる
		const title = doc.createElement('span');
		title.className = 'comments-heading-text';
		title.textContent = 'コメント';
		heading.appendChild(title);

		if (scrollTarget) {
			toTopButton = doc.createElement('button');
			toTopButton.type = 'button';
			toTopButton.className = 'to-top';
			toTopButton.title = TO_TOP_LABEL;
			toTopButton.appendChild(createIcon(doc, 'expandLess'));
			const text = doc.createElement('span');
			text.textContent = TO_TOP_LABEL;
			toTopButton.appendChild(text);
			toTopButton.hidden = true;
			toTopButton.addEventListener('click', scrollToTop);
			heading.appendChild(toTopButton);

			if (typeof scrollTarget.addEventListener === 'function') {
				const onScroll = () => { syncScrollState(); };
				scrollTarget.addEventListener('scroll', onScroll, { passive: true });
				unwatchScroll = () => { scrollTarget.removeEventListener('scroll', onScroll); };
			}
			syncScrollState();
		}

		watchSize(heading);
		return heading;
	}

	/**
	 * コメント本体 (アバター・名前・本文・日時) を要素にする。
	 * ルートにも返信にも同じ形を使う。
	 * @param {Comment} comment コメント
	 * @returns {{item: HTMLElement, body: HTMLElement, repliesSlot: HTMLElement}} 要素・本文側の入れ物・返信ボタンの差し込み先
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

		// 下段は「返信ボタンが左、日時が右」で揃える。
		// 返信ボタンは後から差し込むので、無い場合でも枠だけ先に置いて位置をずらさない
		const meta = doc.createElement('div');
		meta.className = 'comment-meta';
		const repliesSlot = doc.createElement('span');
		repliesSlot.className = 'comment-replies-slot';
		const date = doc.createElement('span');
		date.className = 'comment-date';
		date.textContent = comment.date;
		meta.append(repliesSlot, date);

		body.append(name, text, meta);
		item.append(avatar, body);
		return { item, body, repliesSlot };
	}

	/**
	 * 返信の開閉を 1 件のコメントに付ける。
	 *
	 * 畳んだときは DOM ごと捨てて、開き直すときに取り直す。
	 * 残しておくとコメントの多い作品で要素が増え続ける。
	 * @param {Comment} comment ルートコメント
	 * @param {HTMLElement} body 返信をぶら下げる先 (.comment-body)
	 * @param {HTMLElement} repliesSlot 開閉ボタンの差し込み先 (下段の左端)
	 * @returns {void}
	 */
	function attachReplies(comment, body, repliesSlot) {
		/** 開いているか */
		let open = false;
		/** 次に取りに行くページ。1 始まり */
		let page = FIRST_REPLY_PAGE;
		/** @type {HTMLElement|null} 返信をまとめる入れ物。畳むとき丸ごと捨てる */
		let area = null;
		/** @type {HTMLElement|null} */
		let replyList = null;
		/** @type {HTMLButtonElement|null} */
		let replyMore = null;

		const toggle = doc.createElement('button');
		toggle.type = 'button';
		toggle.className = 'comment-replies';
		toggle.setAttribute('aria-expanded', 'false');
		// アイコンは差し替えるので、入れ物の span を挟んで中身だけ入れ替える
		const toggleMark = doc.createElement('span');
		toggleMark.className = 'comment-replies-mark';
		const toggleText = doc.createElement('span');
		toggle.append(toggleMark, toggleText);

		/**
		 * 開閉の見た目を揃える。
		 * @param {boolean} next 開くなら true
		 * @returns {void}
		 */
		function setOpen(next) {
			open = next;
			toggle.setAttribute('aria-expanded', String(next));
			toggleText.textContent = next ? REPLIES_LABEL.HIDE : REPLIES_LABEL.SHOW;
			toggleMark.textContent = '';
			toggleMark.appendChild(createIcon(doc, next ? 'expandLess' : 'expandMore'));
		}

		setOpen(false);

		/**
		 * 失敗を返信の場所に出す。コメント全体は読めるままにする。
		 * @param {unknown} error 失敗の中身
		 * @returns {void}
		 */
		function showFailure(error) {
			const failure = doc.createElement('p');
			failure.className = 'reply-error';
			failure.setAttribute('role', 'alert');
			failure.textContent = '返信を読み込めませんでした';
			body.appendChild(failure);
			console.warn('[GridViewer] failed to load replies', comment.id, error);
		}

		/**
		 * 返信を 1 ページ取って並べる。
		 * @returns {Promise<void>}
		 */
		async function loadPage() {
			const requestedWorkId = workId;
			toggle.disabled = true;
			if (replyMore) replyMore.disabled = true;
			try {
				const responseBody = await fetchJson(commentRepliesUrl(comment.id, page));
				// 待っている間に別の作品へ移っていたら捨てる
				if (workId !== requestedWorkId) return;
				// 畳まれていたら並べない
				if (!open) return;
				if (!area) {
					area = doc.createElement('div');
					area.className = 'comment-replies-area';
					replyList = doc.createElement('ul');
					replyList.className = 'comment-reply-list';
					area.appendChild(replyList);
					body.appendChild(area);
				}
				for (const raw of responseBody?.comments ?? []) {
					replyList.appendChild(createItem(normalizeComment(raw)).item);
				}
				page += 1;
				if (responseBody?.hasNext === true) {
					if (!replyMore) {
						replyMore = doc.createElement('button');
						replyMore.type = 'button';
						replyMore.className = 'more reply-more';
						replyMore.textContent = '返信をもっと見る';
						replyMore.addEventListener('click', () => { void loadPage(); });
						area.appendChild(replyMore);
					}
					replyMore.disabled = false;
				} else {
					replyMore?.remove();
					replyMore = null;
				}
			} catch (error) {
				if (workId !== requestedWorkId) return;
				// 開けなかったので閉じた状態に戻す。押し直せばもう一度試せる
				setOpen(false);
				showFailure(error);
			} finally {
				toggle.disabled = false;
			}
		}

		toggle.addEventListener('click', () => {
			if (open) {
				setOpen(false);
				area?.remove();
				area = null;
				replyList = null;
				replyMore = null;
				page = FIRST_REPLY_PAGE;
				return;
			}
			setOpen(true);
			void loadPage();
		});

		repliesSlot.appendChild(toggle);
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
			const body = await fetchJson(commentRootsUrl(requestedWorkId, offset, COMMENT_PAGE_SIZE));
			// 待っている間に破棄されたか、別の作品へ移っていたら捨てる
			if (workId !== requestedWorkId || !list) return;
			const comments = (body?.comments ?? []).map(normalizeComment);
			for (const comment of comments) {
				const { item, body: commentBody, repliesSlot } = createItem(comment);
				// 返信の開閉はルートにだけ付ける。pixiv 側も入れ子は 1 段まで
				if (comment.hasReplies) attachReplies(comment, commentBody, repliesSlot);
				list.appendChild(item);
			}
			offset += comments.length;
			failure?.remove();
			failure = null;
			if (moreButton) {
				moreButton.textContent = MORE_LABEL;
				moreButton.hidden = body?.hasNext !== true;
				moreButton.disabled = false;
			}
			applyFloor();
		} catch (error) {
			// 破棄後・別の作品へ移った後の失敗は伝えない。
			// これを入れないと、正常な切り替えが読み込み失敗として表示される
			if (workId !== requestedWorkId) return;
			// 一時的な失敗で以降が読めなくならないよう、ボタンは再試行として残す。
			// 表示は 1 つだけ。失敗のたびに積み上げない
			failure?.remove();
			failure = doc.createElement('p');
			failure.className = 'status';
			failure.dataset.kind = 'error';
			failure.setAttribute('role', 'alert');
			failure.textContent = 'コメントを読み込めませんでした';
			container.appendChild(failure);
			watchSize(failure);
			if (moreButton) {
				moreButton.textContent = RETRY_LABEL;
				moreButton.hidden = false;
				moreButton.disabled = false;
			}
			applyFloor();
			console.warn('[GridViewer] failed to load comments', requestedWorkId, error);
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
			// 前の作品で測った下限と、消える見出しの購読を残さない
			sizeWatcher?.disconnect();
			unwatchScroll?.();
			unwatchScroll = null;
			headingEl = null;
			toTopButton = null;
			scroll = null;
			container.style.minHeight = '';

			container.appendChild(createHeading());

			if (detail.commentOff) {
				const off = doc.createElement('p');
				off.className = 'status';
				off.textContent = 'この作品はコメントを受け付けていません';
				container.appendChild(off);
				watchSize(off);
				applyFloor();
				return;
			}
			if (detail.commentCount === 0) {
				const empty = doc.createElement('p');
				empty.className = 'status';
				empty.textContent = 'まだコメントはありません';
				container.appendChild(empty);
				watchSize(empty);
				applyFloor();
				return;
			}

			// 一覧と「もっと見る」を同じ領域に入れてスクロールさせる。
			// 外に置くと、一番下まで読んでいなくてもボタンが見えて不自然になる
			// 一覧と「もっと見る」を同じ領域に入れてスクロールさせる
			scroll = doc.createElement('div');
			scroll.className = 'comment-scroll';
			container.appendChild(scroll);

			list = doc.createElement('ul');
			list.className = 'comment-list';
			scroll.appendChild(list);
			// 返信の開閉でも高さが変わる。一覧そのものを見張れば全部拾える
			watchSize(list);

			moreButton = doc.createElement('button');
			moreButton.type = 'button';
			moreButton.className = 'more';
			moreButton.textContent = MORE_LABEL;
			moreButton.hidden = true;
			moreButton.addEventListener('click', () => { void loadMore(); });
			scroll.appendChild(moreButton);

			await loadMore();
		},

		dispose() {
			// 見張ったままだと、閉じたあとの高さの変化で測りに行って落ちる
			sizeWatcher?.disconnect();
			sizeWatcher = null;
			unwatchScroll?.();
			unwatchScroll = null;
			headingEl = null;
			toTopButton = null;
			list = null;
			scroll = null;
			moreButton = null;
			failure = null;
			workId = null;
		},
	};
}
