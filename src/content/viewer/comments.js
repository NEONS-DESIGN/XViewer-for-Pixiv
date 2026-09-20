/**
 * コメントの表示。ルートコメントを並べ、返信は必要なときだけ引いて下にぶら下げる。
 * コメントの取得に失敗しても画像は見られるので、失敗はこの区画の中だけで伝える。
 */
import { createIcon } from '../../common/icons.js';
import { getJson } from '../../pixiv/client.js';
import { commentRootsUrl, commentRepliesUrl, emojiUrl, stampUrl, userPath, illustUrl } from '../../pixiv/endpoints.js';
import { createAvatar, showAvatar } from './avatar.js';
import { createCommentForm } from './comment-form.js';
import { createCommentPicker } from './comment-picker.js';
import { isFocused } from './focus.js';
import { parseCommentText } from '../../pixiv/emoji.js';
import { postComment, postStamp, deleteComment } from '../../pixiv/actions.js';
import { PIXIV_ERROR_KINDS } from '../../pixiv/errors.js';
import { readSession, clearSessionCache } from '../session.js';
import { COMMENT_PAGE_SIZE, KEYS } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/** 画面に出す文言。 */
const MESSAGES = Object.freeze({
	/** 見出し */
	HEADING: 'コメント',
	/** 続きを読むボタン */
	MORE: 'もっと見る',
	/** 読み込みに失敗したあとのボタン。押すと同じ位置から読み直す */
	RETRY: '再試行',
	/** 退会したユーザーの表示名 */
	DELETED_USER: '退会したユーザー',
	/** スタンプコメントの本文の代わり (画像が出せないとき) */
	STAMP_PLACEHOLDER: '[スタンプ]',
	/** スタンプ画像の alt */
	STAMP_ALT: 'スタンプ',
	/** 返信の開閉ボタン */
	REPLIES_SHOW: '返信を表示',
	REPLIES_HIDE: '返信を隠す',
	/** 返信の続きを読むボタン */
	REPLY_MORE: '返信をもっと見る',
	REPLY_FAILED: '返信を読み込めませんでした',
	LOAD_FAILED: 'コメントを読み込めませんでした',
	COMMENT_OFF: 'この作品はコメントを受け付けていません',
	EMPTY: 'まだコメントはありません',
	/** 見出しの右端のボタン。サイドバーの先頭 (投稿文) へ戻す */
	TO_TOP: '上部へ',
	/** 投稿の入力欄 */
	COMMENT_PLACEHOLDER: 'コメントする',
	REPLY_PLACEHOLDER: '返信する',
	REPLY: '返信',
	/** 未ログイン */
	SIGN_IN: 'ログインするとコメントできます',
	/** 投稿の失敗 */
	POST_FAILED: 'コメントを投稿できませんでした',
	SESSION_EXPIRED: 'ログインが切れています。pixiv にログインし直し、このページを再読み込みしてください',
	/** 削除。取り消せないので押すと一度聞き返す */
	DELETE: '削除',
	DELETE_CONFIRM: '本当に削除？',
	DELETE_FAILED: 'コメントを削除できませんでした',
});

/**
 * 投稿者に付けるラベルの文言。
 * pixiv 本体と同じく名前の直後に出す (SITE_SPEC §4)。
 */
const LABELS = Object.freeze({
	SELF: 'あなた',
	AUTHOR: '作者',
});

/** 返信の 1 ページ目。replies API は offset ではなく 1 始まりの page で送る。 */
const FIRST_REPLY_PAGE = 1;

/** 見出しと入力欄の入れ物が上端に貼り付いている間だけ付ける印。下に線を引くのに使う。 */
const STUCK_CLASS = 'is-stuck';

/**
 * 貼り付いたと見なす許容差 (px)。
 * 端数の丸めで 1px 足らずずれることがあり、ちょうど 0 で比べると線が点滅する。
 */
const STUCK_EPSILON = 1;

/**
 * 見出しがスクロール領域の上端に貼り付いているかを判定する。
 * @param {number} headingTop 見出しの上端 (画面座標)。実際に測るのは見出しと入力欄をまとめた入れ物
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
 * @property {boolean} isDeleted 退会したユーザーか。ユーザーページへのリンクを出すかの判断に使う
 * @property {boolean} editable 自分が消せるコメントか。削除ボタンを出すかの判断に使う
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
		userName: raw.isDeletedUser ? MESSAGES.DELETED_USER : (raw.userName ?? MESSAGES.DELETED_USER),
		avatarUrl: raw.img ?? '',
		// スタンプのときは本文が空で届く。文字に置き換えず、描画側で画像にする
		text: raw.comment ?? '',
		date: raw.commentDate ?? '',
		isStamp,
		stampId: isStamp ? String(raw.stampId) : null,
		hasReplies: raw.hasReplies === true,
		isDeleted: raw.isDeletedUser === true,
		editable: raw.editable === true,
	};
}

/**
 * 投稿者に付けるラベルを決める。
 *
 * **自分が最優先。** 自分の作品に自分でコメントすると両方に当てはまるが、
 * pixiv 本体は「あなた」だけを出す (実測)。
 * ID が読めなかったときに空文字どうしが一致して無関係なコメントへラベルが付かないよう、
 * 比べる前に両側が揃っていることを確かめる。
 * @param {{userId: string}} comment コメント
 * @param {string|null|undefined} selfId 自分のユーザー ID
 * @param {string|null|undefined} authorId 作品の作者のユーザー ID
 * @returns {string|null} ラベルの文言。付けないなら null
 */
export function commentLabel(comment, selfId, authorId) {
	const userId = comment.userId;
	if (!userId) return null;
	if (selfId && userId === selfId) return LABELS.SELF;
	if (authorId && userId === authorId) return LABELS.AUTHOR;
	return null;
}

/**
 * 投稿した時刻を一覧の日時と同じ形にする。
 * 応答に日時は入らないので手元の時計を使う (pixiv 本体も同じ)。
 * 形は API の commentDate に合わせた 'YYYY-MM-DD HH:mm'。
 * @param {Date} at 時刻
 * @returns {string} 'YYYY-MM-DD HH:mm'
 */
export function formatPostedDate(at) {
	const pad = (value) => String(value).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
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
		fallback.textContent = MESSAGES.STAMP_PLACEHOLDER;
		return fallback;
	}
	const image = doc.createElement('img');
	image.className = 'comment-stamp';
	image.setAttribute('src', url);
	image.setAttribute('alt', MESSAGES.STAMP_ALT);
	image.addEventListener('error', () => { image.replaceWith(doc.createTextNode(MESSAGES.STAMP_PLACEHOLDER)); });
	return image;
}

/**
 * @typedef {object} CommentsDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先
 * @property {HTMLElement} [scrollTarget] 「上部へ」で先頭に戻す相手 (.sidebar)。無ければボタンを出さない
 * @property {(url: string) => Promise<object>} [fetchJson] 取得の差し替え。テストから通信させないために使う
 * @property {{postComment?: Function, postStamp?: Function, deleteComment?: Function}} [actions] 更新系の差し替え。テストから通信させないために使う
 * @property {() => void} [onPosted] 投稿できたときに 1 回呼ぶ。コメント件数の +1 に使う
 * @property {(count: number|null) => void} [onDeleted] 削除できたときに 1 回呼ぶ。引数は数え直した件数で、引けなければ null
 */

/**
 * コメント区画を作る。
 * @param {CommentsDeps} deps 依存
 * @returns {{load: (detail: object) => Promise<void>, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}}
 */
export function createComments(deps) {
	const { doc, container } = deps;
	const scrollTarget = deps.scrollTarget ?? null;
	const fetchJson = deps.fetchJson ?? ((url) => getJson(url));
	const api = { postComment, postStamp, deleteComment, ...deps.actions };
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
	/** @type {HTMLElement|null} 「まだコメントはありません」。1 件目を投稿したら消す */
	let emptyEl = null;
	/** @type {(() => void)|null} 聞き返し中の削除ボタンを畳む口。同時に 1 つだけ持つ */
	let confirmingDelete = null;
	/** @type {ResizeObserver|null} 中身の高さが変わったら下限を測り直す */
	let sizeWatcher = null;
	/** @type {HTMLElement|null} 見出しと入力欄をまとめた入れ物。貼り付いたかを見るのはこれ */
	let headerEl = null;
	/** @type {HTMLButtonElement|null} 見出しの右端の「上部へ」 */
	let toTopButton = null;
	/** @type {(() => void)|null} scrollTarget の購読を解く */
	let unwatchScroll = null;
	/** 今の作品に投稿できるか。返信の導線を出すかの判断にも使う。load() が決める */
	let canPost = false;
	/** @type {object|null} 絵文字とスタンプのピッカー。1 枚を使い回す */
	let picker = null;
	/** @type {Set<object>} 今出ている入力欄。Escape の行き先を決めるのに使う */
	const forms = new Set();
	/** @type {object|null} 今開いている作品。投稿に作者 ID が要る */
	let detailRef = null;

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
	 * サイドバーを送るたびに見直す。
	 *
	 * **下の線と「上部へ」は同じ合図で出す。** どちらも「見出しと入力欄が上端に貼り付いた」ことに
	 * 結び付いている: 線はコメントとの境目を示すため、ボタンは投稿文が画面から出た
	 * ことを意味するため。貼り付いていなければ投稿文はまだ見えているので、戻す導線は要らない。
	 * @returns {void}
	 */
	function syncScrollState() {
		if (!headerEl || !scrollTarget) return;
		// テスト用の DOM には測る口が無い。見た目の調整なので黙って何もしない
		if (typeof headerEl.getBoundingClientRect !== 'function') return;
		// 文書に入る前は位置が全て 0 で、上端に並んでいると誤判定する
		if (headerEl.isConnected === false) return;
		const stuck = isHeadingStuck(
			headerEl.getBoundingClientRect().top,
			scrollTarget.getBoundingClientRect().top,
		);
		headerEl.classList.toggle(STUCK_CLASS, stuck);
		// 押しても何も起きないボタンは見せない (UI_DESIGN_KIT §6)
		if (toTopButton) toTopButton.hidden = !stuck;
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

		// 「上部へ」を右端へ寄せるため、見出しの文字も要素に入れる
		const title = doc.createElement('span');
		title.className = 'comments-heading-text';
		title.textContent = MESSAGES.HEADING;
		heading.appendChild(title);

		if (scrollTarget) {
			toTopButton = doc.createElement('button');
			toTopButton.type = 'button';
			toTopButton.className = 'to-top';
			// 文言が見えているので title は付けない (同じ文字が重なるだけ)
			toTopButton.appendChild(createIcon(doc, 'expandLess'));
			const text = doc.createElement('span');
			text.textContent = MESSAGES.TO_TOP;
			toTopButton.appendChild(text);
			toTopButton.hidden = true;
			toTopButton.addEventListener('click', scrollToTop);
			heading.appendChild(toTopButton);

			if (typeof scrollTarget.addEventListener === 'function') {
				const onScroll = () => { syncScrollState(); };
				scrollTarget.addEventListener('scroll', onScroll, { passive: true });
				unwatchScroll = () => { scrollTarget.removeEventListener('scroll', onScroll); };
			}
			// 最初の判定はここではできない。まだ container に入れていないので
			// 位置を測れず、上端に並んでいることになってしまう。入れてから load() が呼ぶ
		}

		return heading;
	}

	/**
	 * 更新系の失敗を文言にする。投稿にも削除にも使う。
	 * 401 はログインが切れている (別タブでログアウトした等)。覚えているセッションを捨て、
	 * 再読み込みまで案内する。__NEXT_DATA__ は SPA 遷移で変わらないので捨てても
	 * 新しいトークンは得られない (SPEC §9.4)
	 * @param {unknown} error 失敗の中身
	 * @param {string} [fallback] 401 以外で出す文言。省略すると投稿の失敗
	 * @returns {string} 出す文言
	 */
	function postErrorMessage(error, fallback = MESSAGES.POST_FAILED) {
		if (error?.kind === PIXIV_ERROR_KINDS.UNAUTHORIZED) {
			clearSessionCache();
			return MESSAGES.SESSION_EXPIRED;
		}
		return fallback;
	}

	/**
	 * 入力欄を 1 つ作る。投稿の宛先と、成功したときの置き場所だけが違う。
	 * @param {object} options 設定
	 * @param {string} options.placeholder 空のときの文言
	 * @param {string|null} options.parentId 返信先のルートコメント ID。作品へのコメントなら null
	 * @param {string|null} options.avatarUrl 左に出すアバター
	 * @param {(posted: object, value: object) => void} options.onPosted 投稿できたときの置き場所
	 * @returns {object} 入力欄
	 */
	function buildForm(options) {
		picker ??= createCommentPicker({ doc });
		const form = createCommentForm({
			doc,
			placeholder: options.placeholder,
			avatarUrl: options.avatarUrl,
			picker,
			errorMessage: postErrorMessage,
			onSubmit: async (value) => {
				const requestedWorkId = workId;
				// 同じ作品で load() を呼び直されたときも捨てられるよう、一覧そのものも世代の印にする
				// (loadMore() と同じ。workId だけでは気付けず、組み直した一覧へ差し込んでしまう)
				const requestedList = list;
				// トークンは押された時点で読む。失効時にキャッシュを捨てれば全ての入力欄が追従する
				const token = readSession(doc).csrfToken;
				const posted = value.stampId === null
					? await api.postComment(detailRef.id, detailRef.userId, value.text, options.parentId, token)
					: await api.postStamp(detailRef.id, detailRef.userId, value.stampId, options.parentId, token);
				// 待っている間に別の作品へ移ったか描き直されていたら画面へは足さない (投稿自体は通っている)
				if (workId !== requestedWorkId || list !== requestedList) return;
				options.onPosted(posted, value);
				deps.onPosted?.();
			},
		});
		forms.add(form);
		return form;
	}

	/**
	 * 見出しと作品への入力欄をまとめた入れ物を作る。
	 *
	 * 入力欄を見出しと同じ入れ物に入れるのは、「サイドバーごと送る」設定で
	 * 一緒に画面の上端へ貼り付かせるため。別の子にすると見出しだけが貼り付き、
	 * 入力欄は流れていく。
	 * @param {boolean} canPost 入力欄を出してよいか
	 * @param {boolean} commentOff コメントを受け付けていない作品か (未ログインの案内を出さない)
	 * @returns {HTMLElement} 入れ物
	 */
	function createHeader(canPost, commentOff) {
		const header = doc.createElement('div');
		header.className = 'comments-header';
		headerEl = header;
		header.appendChild(createHeading());
		if (canPost) {
			const form = buildForm({
				placeholder: MESSAGES.COMMENT_PLACEHOLDER,
				parentId: null,
				avatarUrl: null,
				onPosted: (posted) => { prependComment(posted); },
			});
			header.appendChild(form.element);
		} else if (!commentOff) {
			// 案内を出すのは未ログインのときだけ。コメントを受け付けていない作品は一覧側が
			// 伝えるので、両方出して二重に断らない
			const signIn = doc.createElement('p');
			signIn.className = 'status';
			signIn.textContent = MESSAGES.SIGN_IN;
			header.appendChild(signIn);
		}
		// 入力欄の高さも下限に効く。入れ物ごと見張る
		watchSize(header);
		return header;
	}

	/**
	 * コメント本体 (アバター・名前・本文・日時) を要素にする。
	 * ルートにも返信にも同じ形を使う。
	 * @param {Comment} comment コメント
	 * @returns {{item: HTMLElement, body: HTMLElement, repliesSlot: HTMLElement, meta: HTMLElement}} 要素・本文側の入れ物・返信ボタンの差し込み先・下段
	 */
	function createItem(comment, isRoot = false) {
		const item = doc.createElement('li');
		item.className = 'comment-item';

		// 退会したユーザーと ID が取れなかったコメントには飛び先が無い。押せないままにする
		const userPage = comment.userId && !comment.isDeleted ? userPath(comment.userId) : null;

		// 作者行と同じ部品。CDN 以外の URL や読み込み失敗は枠だけ残して黙って続ける
		const avatar = createAvatar(doc, 'comment-avatar');
		showAvatar(avatar, comment.avatarUrl);

		// アイコンもリンクにする (押せる範囲が広いほうが誤操作が減る)。
		// ただし名前と飛び先が同じなので、読み上げと Tab の巡回からは外して 1 件 1 リンクに見せる
		let avatarNode = avatar;
		if (userPage) {
			const avatarLink = doc.createElement('a');
			avatarLink.className = 'comment-avatar-link';
			avatarLink.href = userPage;
			avatarLink.setAttribute('aria-hidden', 'true');
			avatarLink.setAttribute('tabindex', '-1');
			avatarLink.appendChild(avatar);
			avatarNode = avatarLink;
		}

		const body = doc.createElement('div');
		body.className = 'comment-body';

		// 飛び先があるときだけ a にする。target は付けない (作者行と同じく同じタブで開く)
		const name = doc.createElement(userPage ? 'a' : 'span');
		name.className = 'comment-name';
		if (userPage) name.href = userPage;
		name.textContent = comment.userName;

		// 名前の直後にラベルを置く (pixiv 本体と同じ並び)。付かないコメントには要素ごと作らない
		const label = commentLabel(comment, readSession(doc).self?.id ?? null, detailRef?.userId ?? null);
		let labelNode = null;
		if (label) {
			labelNode = doc.createElement('span');
			labelNode.className = 'comment-label';
			labelNode.textContent = label;
		}

		const text = doc.createElement('p');
		text.className = 'comment-text';
		if (comment.isStamp) text.appendChild(renderStamp(doc, comment.stampId));
		else text.append(...renderCommentText(doc, comment.text));

		// 下段は「返信を書く導線が左端、返信を読む導線がその隣、日時が右端」で揃える。
		// どちらの導線も後から差し込む。返信を読む導線は枠だけ先に置いて、
		// 返信の有無で日時の位置がずれないようにする
		const meta = doc.createElement('div');
		meta.className = 'comment-meta';
		const repliesSlot = doc.createElement('span');
		repliesSlot.className = 'comment-replies-slot';
		const date = doc.createElement('span');
		date.className = 'comment-date';
		date.textContent = comment.date;
		meta.append(repliesSlot, date);

		body.append(name, ...(labelNode ? [labelNode] : []), text, meta);
		item.append(avatarNode, body);

		// 削除はルートにも返信にも付く。返信を書く導線は後から meta.prepend() で
		// 前へ差し込まれるので、並びは [返信][削除][返信を表示][日時] になる
		if (comment.editable) attachDelete(comment, item, body, meta, isRoot);
		return { item, body, repliesSlot, meta };
	}

	/**
	 * 削除の導線を 1 件のコメントに付ける。ルートにも返信にも同じものを使う。
	 *
	 * **削除は取り消せないので、一度目の押下では消さずに文言を聞き返しに変える。**
	 * 別のモーダルを出さないのは、ビュワー自体がモーダルの中だから
	 * (二重に重ねるとどれを閉じているのか分からなくなる)。
	 * フォーカスが外れたら聞き返しをやめる。押しっぱなしの確認を残すと、
	 * 別のコメントを消すつもりで押し直したときに誤爆する。
	 * @param {Comment} comment 消す対象
	 * @param {HTMLElement} item 一覧から外す相手 (.comment-item)
	 * @param {HTMLElement} body 失敗の表示をぶら下げる先 (.comment-body)
	 * @param {HTMLElement} meta 下段。ボタンをここの先頭へ差し込む
	 * @param {boolean} isRoot ルートコメントか。読み込み済みの件数を戻すかの判断に使う
	 * @returns {void}
	 */
	function attachDelete(comment, item, body, meta, isRoot) {
		/** 聞き返している最中か */
		let confirming = false;
		/** @type {HTMLElement|null} 失敗の表示。1 つだけ持つ */
		let failureNode = null;

		const button = doc.createElement('button');
		button.type = 'button';
		button.className = 'comment-delete';
		button.textContent = MESSAGES.DELETE;

		/**
		 * 聞き返しの見た目を切り替える。
		 * @param {boolean} next 聞き返すなら true
		 * @returns {void}
		 */
		function setConfirming(next) {
			confirming = next;
			button.textContent = next ? MESSAGES.DELETE_CONFIRM : MESSAGES.DELETE;
			button.classList.toggle('is-confirming', next);
			// 聞き返しは同時に 1 つだけ。Escape で畳めるよう外から掴めるようにしておく
			if (next) {
				if (confirmingDelete && confirmingDelete !== cancel) confirmingDelete();
				confirmingDelete = cancel;
			} else if (confirmingDelete === cancel) {
				confirmingDelete = null;
			}
		}

		/**
		 * 聞き返しをやめる。外 (Escape・別のボタン) から呼ぶ用の口。
		 * @returns {void}
		 */
		function cancel() { setConfirming(false); }

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
			failureNode.textContent = postErrorMessage(error, MESSAGES.DELETE_FAILED);
			body.appendChild(failureNode);
			warn('failed to delete comment', comment.id, error);
		}

		/**
		 * 実際に消す。消せたら一覧から外して件数を減らす。
		 * @returns {Promise<void>}
		 */
		async function remove() {
			// 描き直しの途中で押されることは無いが、押した瞬間に破棄されていれば送らない
			if (!detailRef) return;
			const illustId = detailRef.id;
			// 待っている間に別の作品へ移ったり描き直されたりしたら、画面には手を出さない
			const requestedWorkId = workId;
			const requestedList = list;
			button.disabled = true;
			try {
				await api.deleteComment(illustId, comment.id, readSession(doc).csrfToken);
				if (workId !== requestedWorkId || list !== requestedList) return;
				failureNode?.remove();
				failureNode = null;
				item.remove();
				// 読み込み済みの件数も戻す。戻さないと次の「もっと見る」が 1 件飛ばす。
				// 返信は roots の数え方に入らないのでルートのときだけ
				if (isRoot) offset = Math.max(0, offset - 1);
				// 最後の 1 件だったら「まだコメントはありません」へ戻す。
				// 戻さないと見出しだけが残って、読み込みに失敗したように見える
				if (list && list.children.length === 0) showEmpty();
				deps.onDeleted?.(await countAfterDelete(illustId));
				applyFloor();
			} catch (error) {
				if (workId !== requestedWorkId || list !== requestedList) return;
				// 消せていないのに画面から外すと、読み直したときに戻ってきて食い違う
				showFailure(error);
				// disabled にした時点でフォーカスが body へ落ちている。押し直せるよう戻す
				button.focus();
			} finally {
				button.disabled = false;
				// 押し直せるように聞き返しは畳む
				setConfirming(false);
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

	/**
	 * 返信の開閉を 1 件のコメントに付ける。
	 *
	 * 畳んだときは DOM ごと捨てて、開き直すときに取り直す。
	 * 残しておくとコメントの多い作品で要素が増え続ける。
	 * @param {Comment} comment ルートコメント
	 * @param {HTMLElement} body 返信をぶら下げる先 (.comment-body)
	 * @param {HTMLElement} repliesSlot 開閉ボタンの差し込み先 (下段、返信ボタンの隣)
	 * @returns {{appendPosted: (posted: object) => void}} 投稿できた返信を足す口
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
		/** @type {HTMLElement|null} 返信の読み込み失敗の表示。1 つだけ持ち、次の読み込みの前に消す */
		let replyError = null;

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
			toggleText.textContent = next ? MESSAGES.REPLIES_HIDE : MESSAGES.REPLIES_SHOW;
			toggleMark.textContent = '';
			toggleMark.appendChild(createIcon(doc, next ? 'expandLess' : 'expandMore'));
		}

		setOpen(false);

		/**
		 * 失敗の表示を消す。
		 * @returns {void}
		 */
		function clearFailure() {
			replyError?.remove();
			replyError = null;
		}

		/**
		 * 失敗を返信の場所に出す。コメント全体は読めるままにする。
		 * 表示は 1 つだけ。失敗のたびに積み上げない
		 * @param {unknown} error 失敗の中身
		 * @returns {void}
		 */
		function showFailure(error) {
			clearFailure();
			replyError = doc.createElement('p');
			replyError.className = 'reply-error';
			replyError.setAttribute('role', 'alert');
			replyError.textContent = MESSAGES.REPLY_FAILED;
			body.appendChild(replyError);
			warn('failed to load replies', comment.id, error);
		}

		/**
		 * 返信を 1 ページ取って並べる。
		 * @returns {Promise<void>}
		 */
		async function loadPage() {
			const requestedWorkId = workId;
			// disabled にするとフォーカスが body へ落ちる。終わったら押したボタンへ戻す
			const focusedMore = replyMore !== null && isFocused(doc, replyMore);
			const focusedToggle = isFocused(doc, toggle);
			toggle.disabled = true;
			if (replyMore) replyMore.disabled = true;
			try {
				const responseBody = await fetchJson(commentRepliesUrl(comment.id, page));
				// 待っている間に別の作品へ移っていたら捨てる
				if (workId !== requestedWorkId) return;
				// 畳まれていたら並べない
				if (!open) return;
				clearFailure();
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
						replyMore.addEventListener('click', () => { void loadPage(); });
						area.appendChild(replyMore);
					}
					// 再試行から読み直せたら文言を戻す
					replyMore.textContent = MESSAGES.REPLY_MORE;
				} else {
					replyMore?.remove();
					replyMore = null;
				}
			} catch (error) {
				if (workId !== requestedWorkId) return;
				if (page === FIRST_REPLY_PAGE) {
					// 1 件も出せていない。閉じた状態に戻し、押し直せばもう一度試せるようにする
					setOpen(false);
				} else if (replyMore) {
					// 続きだけが取れなかった。見えている返信は残し、ボタンを再試行に替える
					replyMore.textContent = MESSAGES.RETRY;
				}
				showFailure(error);
			} finally {
				toggle.disabled = false;
				if (replyMore) replyMore.disabled = false;
				// 押したボタンが消えていたら (続きが無くなった) 開閉ボタンへ戻す
				if (focusedMore) (replyMore ?? toggle).focus();
				else if (focusedToggle) toggle.focus();
			}
		}

		toggle.addEventListener('click', () => {
			if (open) {
				setOpen(false);
				area?.remove();
				area = null;
				replyList = null;
				replyMore = null;
				clearFailure();
				page = FIRST_REPLY_PAGE;
				return;
			}
			setOpen(true);
			void loadPage();
		});

		// 返信が無くても枠は作る。自分が返信したらその場で出せるようにするため
		toggle.hidden = comment.hasReplies !== true;
		repliesSlot.appendChild(toggle);

		return {
			/**
			 * 投稿できた返信を返信一覧の末尾へ足す。
			 * 畳んでいるときは足さず、「返信を表示」を出すだけにする (開けば取り直される)。
			 * @param {object} posted actions.js が返した 1 件
			 * @returns {void}
			 */
			appendPosted(posted) {
				toggle.hidden = false;
				if (!open || !replyList) return;
				replyList.appendChild(createItem(fromPosted(posted)).item);
				applyFloor();
			},
		};
	}

	/**
	 * 返信を書く導線を 1 件のコメントに付ける。
	 *
	 * 「返信を表示」の左に置く。押すたびに入力欄を出し入れし、畳んだら DOM ごと捨てる
	 * (開いたまま残すとコメントの多い作品で入力欄が積み上がる)。
	 * @param {Comment} comment ルートコメント
	 * @param {HTMLElement} body 入力欄をぶら下げる先 (.comment-body)
	 * @param {HTMLElement} meta 下段。ボタンをここの先頭へ差し込む
	 * @param {(posted: object) => void} onReplied 返信できたときに呼ぶ (返信一覧へ足す)
	 * @returns {void}
	 */
	function attachReplyForm(comment, body, meta, onReplied) {
		/** @type {object|null} 開いている入力欄。畳んでいる間は null */
		let form = null;

		const toggle = doc.createElement('button');
		toggle.type = 'button';
		toggle.className = 'comment-reply-toggle';
		toggle.textContent = MESSAGES.REPLY;
		toggle.setAttribute('aria-expanded', 'false');
		toggle.addEventListener('click', () => {
			if (form) {
				// forms から外し忘れると、消えた入力欄が Escape を食い止め続ける
				forms.delete(form);
				form.dispose();
				form = null;
				toggle.setAttribute('aria-expanded', 'false');
				applyFloor();
				// 入力欄ごと消えるとフォーカスが body へ落ちる。押したボタンへ戻す
				toggle.focus();
				return;
			}
			form = buildForm({
				placeholder: MESSAGES.REPLY_PLACEHOLDER,
				parentId: comment.id,
				avatarUrl: readSession(doc).self?.profileImg ?? null,
				onPosted: (posted) => { onReplied(posted); },
			});
			// 返信一覧より前、コメントの直下に出す (pixiv 本体と同じ位置)。
			// 返信の下に置くと、返信が多いコメントほど書く場所が遠くなる
			const area = body.querySelector('.comment-replies-area');
			if (area) body.insertBefore(form.element, area);
			else body.appendChild(form.element);
			toggle.setAttribute('aria-expanded', 'true');
			applyFloor();
			form.focus();
		});

		meta.prepend(toggle);
	}

	/**
	 * ルートコメント 1 件を導線ごと組み立てる。
	 *
	 * 返信を読む導線と書く導線はルートにだけ付ける (pixiv 側も入れ子は 1 段まで)。
	 * 一覧から読んだ 1 件も投稿直後の 1 件もここを通し、同じ形にする。
	 * @param {Comment} comment ルートコメント
	 * @returns {HTMLElement} 一覧へ入れる 1 件 (.comment-item)
	 */
	function createRootItem(comment) {
		const { item, body, repliesSlot, meta } = createItem(comment, true);
		const replies = attachReplies(comment, body, repliesSlot);
		// 投稿できない作品・未ログインでは返信も書けない
		if (canPost) attachReplyForm(comment, body, meta, (posted) => { replies.appendPosted(posted); });
		return item;
	}

	/**
	 * 投稿の応答を一覧の 1 件の形にする。
	 * アバターは応答に入らないのでセッションの値を使う。
	 * @param {object} posted actions.js が返した 1 件
	 * @returns {Comment} 一覧に並べる形
	 */
	function fromPosted(posted) {
		const self = readSession(doc).self;
		return {
			id: posted.id,
			userId: posted.userId || self?.id || '',
			userName: posted.userName || self?.name || MESSAGES.DELETED_USER,
			avatarUrl: self?.profileImg ?? '',
			text: posted.text,
			date: formatPostedDate(new Date()),
			isStamp: posted.stampId !== null,
			stampId: posted.stampId,
			hasReplies: false,
			isDeleted: false,
			// 今書いたものなので必ず自分で消せる
			editable: true,
		};
	}

	/**
	 * 投稿できたコメントを一覧の先頭へ差し込む。
	 * 取り直さないのは offset がずれ、読み進めた位置も飛ぶため (pixiv 本体も同じ)。
	 * @param {object} posted actions.js が返した 1 件
	 * @returns {void}
	 */
	function prependComment(posted) {
		// 0 件の作品では load() が一覧を作っていない。1 件目の投稿でここが作る。
		// 作らずに捨てると、投稿は通っているのに画面へ出ない
		ensureList();
		// 一覧から読んだ 1 件と同じ導線を付ける。付けないと、描き直すまで
		// この 1 件にだけ返信できない。返信はまだ無いので「返信を表示」は隠れる
		list.prepend(createRootItem(fromPosted(posted)));
		applyFloor();
	}

	/**
	 * 一覧とスクロール領域を組み立てて入れ物へ入れる。既にあれば何もしない。
	 * コメントのある作品では load() が、0 件の作品では 1 件目の投稿が呼ぶ。
	 * @returns {void}
	 */
	/**
	 * 「まだコメントはありません」を出す。
	 * 読み込み前に 0 件だったときと、最後の 1 件を消したときの両方から呼ぶ。
	 * @returns {void}
	 */
	function showEmpty() {
		if (emptyEl) return;
		emptyEl = doc.createElement('p');
		emptyEl.className = 'status';
		emptyEl.textContent = MESSAGES.EMPTY;
		container.appendChild(emptyEl);
		watchSize(emptyEl);
	}

	/**
	 * 削除のあとのコメント件数を pixiv から引き直す。
	 *
	 * **手元で 1 を引くだけでは合わない。** ルートを消すとぶら下がっていた返信も
	 * 道連れになり (SITE_SPEC §4-8 実測)、開いていない返信の数は分からないため。
	 * 削除の反映は即時で、消した直後に引いても正しい値が返ることを実測で確認している
	 * (ブックマークの削除と違って遅れない)。
	 * 引けなかったときは null を返し、呼び出し側が手元で 1 を引く側へ倒す。
	 * @param {string} illustId 作品 ID
	 * @returns {Promise<number|null>} 新しい件数。引けなければ null
	 */
	async function countAfterDelete(illustId) {
		try {
			const body = await fetchJson(illustUrl(illustId));
			const count = body?.commentCount;
			return typeof count === 'number' ? count : null;
		} catch (error) {
			// 数え直せなくても削除自体は通っている。件数は呼び出し側の控えに任せる
			warn('failed to re-read comment count', illustId, error);
			return null;
		}
	}

	function ensureList() {
		if (list) return;
		// 一覧と「まだコメントはありません」は両立しない。1 件目が入る時点で消す
		emptyEl?.remove();
		emptyEl = null;

		// 一覧と「もっと見る」を同じ領域に入れてスクロールさせる。
		// 外に置くと、一番下まで読んでいなくてもボタンが見えて不自然になる
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
		moreButton.textContent = MESSAGES.MORE;
		// 続きがあるかは読んでみるまで分からない。loadMore() が出す
		moreButton.hidden = true;
		moreButton.addEventListener('click', () => { void loadMore(); });
		scroll.appendChild(moreButton);
	}

	/**
	 * 続きを読み込んで並べる。
	 * @returns {Promise<void>}
	 */
	async function loadMore() {
		// 読み込み中に別の作品へ移ることがある。応答が返ったときに
		// まだ同じ作品を見ているかを確かめてから描く
		const requestedWorkId = workId;
		// 同じ作品で load() を呼び直されたときも捨てられるよう、一覧そのものを世代の印にする
		const requestedList = list;
		const button = moreButton;
		// disabled にするとフォーカスが body へ落ちる。終わったら押したボタンへ戻す
		const focused = button !== null && isFocused(doc, button);
		if (button) button.disabled = true;
		try {
			const body = await fetchJson(commentRootsUrl(requestedWorkId, offset, COMMENT_PAGE_SIZE));
			// 待っている間に破棄されたか、別の作品へ移ったか、描き直されていたら捨てる
			if (workId !== requestedWorkId || !list || list !== requestedList) return;
			const comments = (body?.comments ?? []).map(normalizeComment);
			for (const comment of comments) {
				list.appendChild(createRootItem(comment));
			}
			offset += comments.length;
			failure?.remove();
			failure = null;
			if (moreButton) {
				moreButton.textContent = MESSAGES.MORE;
				moreButton.hidden = body?.hasNext !== true;
				moreButton.disabled = false;
			}
			applyFloor();
		} catch (error) {
			// 破棄後・別の作品へ移った後・描き直した後の失敗は伝えない。
			// これを入れないと、正常な切り替えが読み込み失敗として表示される
			if (workId !== requestedWorkId || list !== requestedList) return;
			// 一時的な失敗で以降が読めなくならないよう、ボタンは再試行として残す。
			// 表示は 1 つだけ。失敗のたびに積み上げない
			failure?.remove();
			failure = doc.createElement('p');
			failure.className = 'status';
			failure.dataset.kind = 'error';
			failure.setAttribute('role', 'alert');
			failure.textContent = MESSAGES.LOAD_FAILED;
			container.appendChild(failure);
			watchSize(failure);
			if (moreButton) {
				moreButton.textContent = MESSAGES.RETRY;
				moreButton.hidden = false;
				moreButton.disabled = false;
			}
			applyFloor();
			warn('failed to load comments', requestedWorkId, error);
		} finally {
			// 隠れたボタン (続きが無い) にはフォーカスを置けない。その場合は諦める
			if (focused && button && list === requestedList && !button.hidden) button.focus();
		}
	}

	return {
		/**
		 * 作品のコメントを読み込む。
		 * 前の作品の描画は全て捨てる。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async load(detail) {
			workId = detail.id;
			offset = 0;
			container.textContent = '';
			// 前の作品で測った下限と、消える見出しの購読を残さない。
			// 一覧やボタンの参照も戻す。残すと前の作品の応答が新しい一覧へ追記される
			sizeWatcher?.disconnect();
			unwatchScroll?.();
			unwatchScroll = null;
			headerEl = null;
			toTopButton = null;
			scroll = null;
			list = null;
			moreButton = null;
			failure = null;
			emptyEl = null;
			confirmingDelete = null;
			// 前の作品の入力欄は捨てる。書きかけごと消えるが、別の作品へ送るほうが害が大きい
			forms.clear();
			picker?.close();
			container.style.minHeight = '';

			detailRef = detail;
			const session = readSession(doc);
			// コメントを受け付けていない作品と未ログインでは投稿できない。
			// 返信の導線を出すかの判断にも使うので、モジュールの状態として覚えておく
			canPost = detail.commentOff !== true && session.isLoggedIn === true && Boolean(session.csrfToken);
			container.appendChild(createHeader(canPost, detail.commentOff === true));
			// 判定は文書に入れてから。createHeader() の中では位置を測れない
			syncScrollState();

			if (detail.commentOff) {
				const off = doc.createElement('p');
				off.className = 'status';
				off.textContent = MESSAGES.COMMENT_OFF;
				container.appendChild(off);
				watchSize(off);
				applyFloor();
				return;
			}
			if (detail.commentCount === 0) {
				// 引いても空なので読みに行かない。一覧もまだ作らず、
				// 投稿されたときだけ prependComment() が作ってこの文言を消す
				showEmpty();
				applyFloor();
				return;
			}

			ensureList();
			await loadMore();
		},

		/**
		 * キー操作を入力欄に先に使わせる。
		 * 開いているピッカーの Escape と、書きかけを消さないための Escape を食い止める。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (picker?.consumeKey(event) === true) return true;
			// 削除の聞き返しは Escape で畳む。ここで食い止めないとビュワーごと閉じてしまい、
			// キーボードだけの利用者には取り消す手段が無くなる
			if (event.key === KEYS.CLOSE && confirmingDelete) {
				confirmingDelete();
				return true;
			}
			for (const form of forms) {
				if (form.consumeKey(event) === true) return true;
			}
			return false;
		},

		/**
		 * コメント区画を片付ける。
		 * @returns {void}
		 */
		dispose() {
			// 見張ったままだと、閉じたあとの高さの変化で測りに行って落ちる
			sizeWatcher?.disconnect();
			sizeWatcher = null;
			unwatchScroll?.();
			unwatchScroll = null;
			headerEl = null;
			toTopButton = null;
			list = null;
			scroll = null;
			moreButton = null;
			failure = null;
			emptyEl = null;
			confirmingDelete = null;
			workId = null;
			canPost = false;
			forms.clear();
			picker?.dispose();
			picker = null;
			detailRef = null;
		},
	};
}
