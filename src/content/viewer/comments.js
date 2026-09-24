/**
 * コメントの表示。ルートコメントを並べ、返信は必要なときだけ引いて下にぶら下げる。
 * コメントの取得に失敗しても画像は見られるので、失敗はこの区画の中だけで伝える。
 *
 * 持つのは取得・描画・投稿と、それらをつなぐ状態 (今の作品・一覧・入力欄)。
 * 区画の採寸は comments-layout.js、削除の導線は comments-delete.js に分けてある。
 */
import { createIcon } from '../../common/icons.js';
import { setImageSrcAttribute } from '../../common/image-source.js';
import { currentLocalePrefix } from '../../common/locale.js';
import { getJson } from '../../pixiv/client.js';
import { commentRootsUrl, commentRepliesUrl, emojiUrl, stampUrl, userPath, illustUrl } from '../../pixiv/endpoints.js';
import { createAvatar, showAvatar } from './avatar.js';
import { createCommentForm } from './comment-form.js';
import { createCommentPicker } from './comment-picker.js';
import { createCommentsLayout } from './comments-layout.js';
import { attachDelete, createConfirmRegistry, DELETE_BUTTON_CLASS } from './comments-delete.js';
import { isFocused } from './focus.js';
import { parseCommentText } from '../../pixiv/emoji.js';
import { postComment, postStamp, deleteComment } from '../../pixiv/actions.js';
import { PIXIV_ERROR_KINDS } from '../../pixiv/errors.js';
import { readSession, clearSessionCache } from '../session.js';
import { COMMENT_PAGE_SIZE, DISPLAY_TIME_ZONE_OFFSET, KEYS } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/** 件数を数え直すときに付ける、キャッシュを外すためのパラメータ名。 */
const CACHE_BUSTER = '_';

/** 返信の 1 ページ目。replies API は offset ではなく 1 始まりの page で送る。 */
const FIRST_REPLY_PAGE = 1;

/** API の commentDate の形。'YYYY-MM-DD HH:mm' で時差を持たない。(SITE_SPEC.md) */
const COMMENT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/**
 * @typedef {object} Comment
 * @property {string} id
 * @property {string} userId
 * @property {string} userName
 * @property {string} avatarUrl
 * @property {string} text
 * @property {Date|null} date 投稿日時。読めなければ null
 * @property {boolean} isStamp
 * @property {string|null} stampId スタンプの ID。スタンプでなければ null
 * @property {boolean} hasReplies
 * @property {boolean} isDeleted 退会したユーザーか。ユーザーページへのリンクを出すかの判断に使う
 * @property {boolean} editable 自分が消せるコメントか。削除ボタンを出すかの判断に使う
 */

/**
 * コメントを共通の形にする。
 * @param {object} raw comments/roots の 1 件
 * @param {object} strings 文言のカタログ (src/i18n)
 * @returns {Comment} 正規化したコメント
 */
export function normalizeComment(raw, strings) {
	const isStamp = Boolean(raw.stampId);
	return {
		id: raw.id,
		userId: raw.userId ?? '',
		userName: raw.isDeletedUser ? strings.comments.DELETED_USER : (raw.userName ?? strings.comments.DELETED_USER),
		avatarUrl: raw.img ?? '',
		// スタンプのときは本文が空で届く。文字に置き換えず、描画側で画像にする
		text: raw.comment ?? '',
		date: parseCommentDate(raw.commentDate),
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
 * pixiv 本体は「あなた」だけを出す。(実測)
 * ID が読めなかったときに空文字どうしが一致して無関係なコメントへラベルが付かないよう、
 * 比べる前に両側が揃っていることを確かめる。
 * @param {{userId: string}} comment コメント
 * @param {string|null|undefined} selfId 自分のユーザー ID
 * @param {string|null|undefined} authorId 作品の作者のユーザー ID
 * @param {object} strings 文言のカタログ (src/i18n)
 * @returns {string|null} ラベルの文言。付けないなら null
 */
export function commentLabel(comment, selfId, authorId, strings) {
	const userId = comment.userId;
	if (!userId) return null;
	if (selfId && userId === selfId) return strings.comments.roles.SELF;
	if (authorId && userId === authorId) return strings.comments.roles.AUTHOR;
	return null;
}

/**
 * API の commentDate を Date にする。
 * 時差を持たない 'YYYY-MM-DD HH:mm' で届くので、表示と同じ DISPLAY_TIME_ZONE の時刻として読む。
 * 書式は言語ごとに違うので、ここでは文字列にせず描画のときにカタログへ渡す。
 * @param {unknown} value commentDate
 * @returns {Date|null} 日時。形が違う・存在しない日付なら null
 */
export function parseCommentDate(value) {
	if (typeof value !== 'string') return null;
	const match = COMMENT_DATE_PATTERN.exec(value);
	if (!match) return null;
	const [, year, month, day, hour, minute] = match;
	const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00${DISPLAY_TIME_ZONE_OFFSET}`);
	return Number.isNaN(date.getTime()) ? null : date;
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
		setImageSrcAttribute(image, emojiUrl(fragment.id));
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
 * @param {object} strings 文言のカタログ (src/i18n)
 * @returns {Node} 画像。URL を組み立てられなければ文字
 */
export function renderStamp(doc, stampId, strings) {
	const url = stampUrl(stampId);
	if (!url) {
		const fallback = doc.createElement('span');
		fallback.textContent = strings.comments.STAMP_PLACEHOLDER;
		return fallback;
	}
	const image = doc.createElement('img');
	image.className = 'comment-stamp';
	setImageSrcAttribute(image, url);
	image.setAttribute('alt', strings.comments.STAMP_ALT);
	image.addEventListener('error', () => { image.replaceWith(doc.createTextNode(strings.comments.STAMP_PLACEHOLDER)); });
	return image;
}

/**
 * @typedef {object} CommentsDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先
 * @property {object} strings 文言のカタログ (src/i18n)
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
	const { doc, container, strings } = deps;
	// コメント主のリンクは pixiv 本体のページを指すので、今の表示言語の接頭辞 (/en) を付ける
	const localePrefix = deps.localePrefix ?? currentLocalePrefix(doc);
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
	/** @type {HTMLElement|null} 見出しと入力欄をまとめた入れ物。貼り付いたかを見るのはこれ */
	let headerEl = null;
	/** @type {HTMLElement|null} 見出し (.comments-heading)。削除で行が消えたときのフォーカスの受け皿 */
	let headingEl = null;
	/** @type {HTMLButtonElement|null} 見出しの右端の「上部へ」 */
	let toTopButton = null;
	/** 今の作品に投稿できるか。返信の導線を出すかの判断にも使う。load() が決める */
	let canPost = false;
	/** @type {object|null} 絵文字とスタンプのピッカー。1 枚を使い回す */
	let picker = null;
	/** @type {Set<object>} 今出ている入力欄。Escape の行き先を決めるのに使う */
	const forms = new Set();
	/** @type {object|null} 今開いている作品。投稿に作者 ID が要る */
	let detailRef = null;
	/** 聞き返し中の削除ボタンの台帳。同時に 1 つだけ */
	const confirmations = createConfirmRegistry();
	/** 区画の採寸。測る相手は描き直すたびに変わるので、毎回この状態から引かせる */
	const layout = createCommentsLayout({
		doc,
		container,
		scrollTarget,
		parts: () => ({ scroll, list, header: headerEl, toTopButton }),
	});

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
		// 削除で行が消えて次の受け皿が無いとき、フォーカスをここへ戻す。Tab の巡回には入れない
		heading.setAttribute('tabindex', '-1');
		headingEl = heading;

		// 「上部へ」を右端へ寄せるため、見出しの文字も要素に入れる
		const title = doc.createElement('span');
		title.className = 'comments-heading-text';
		title.textContent = strings.comments.HEADING;
		heading.appendChild(title);

		if (scrollTarget) {
			toTopButton = doc.createElement('button');
			toTopButton.type = 'button';
			toTopButton.className = 'to-top';
			// 文言が見えているので title は付けない (同じ文字が重なるだけ)
			toTopButton.appendChild(createIcon(doc, 'expandLess'));
			const text = doc.createElement('span');
			text.textContent = strings.comments.TO_TOP;
			toTopButton.appendChild(text);
			toTopButton.hidden = true;
			toTopButton.addEventListener('click', () => { layout.scrollToTop(); });
			heading.appendChild(toTopButton);

			layout.watchScroll();
			// 最初の判定はここではできない。まだ container に入れていないので
			// 位置を測れず、上端に並んでいることになってしまう。入れてから load() が呼ぶ
		}

		return heading;
	}

	/**
	 * 更新系の失敗を文言にする。投稿にも削除にも使う。
	 * 401 はログインが切れている。(別タブでログアウトした等) 覚えているセッションを捨て、
	 * 再読み込みまで案内する。__NEXT_DATA__ は SPA 遷移で変わらないので捨てても
	 * 新しいトークンは得られない (SPEC §9.4)
	 * @param {unknown} error 失敗の中身
	 * @param {string} [fallback] 401 以外で出す文言。省略すると投稿の失敗
	 * @returns {string} 出す文言
	 */
	function postErrorMessage(error, fallback = strings.comments.POST_FAILED) {
		if (error?.kind === PIXIV_ERROR_KINDS.UNAUTHORIZED) {
			clearSessionCache();
			return strings.comments.SESSION_EXPIRED;
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
		picker ??= createCommentPicker({ doc, strings });
		const form = createCommentForm({
			doc,
			placeholder: options.placeholder,
			avatarUrl: options.avatarUrl,
			picker,
			strings,
			errorMessage: postErrorMessage,
			onSubmit: async (value) => {
				// 破棄された後に押されていれば送らない。(消えた作品へ投稿しない)
				if (!detailRef) return;
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
	 * 入力欄を出すかは load() が決めた canPost (モジュールの状態) で見る
	 * @param {boolean} commentOff コメントを受け付けていない作品か (未ログインの案内を出さない)
	 * @returns {HTMLElement} 入れ物
	 */
	function createHeader(commentOff) {
		const header = doc.createElement('div');
		header.className = 'comments-header';
		headerEl = header;
		header.appendChild(createHeading());
		if (canPost) {
			const form = buildForm({
				placeholder: strings.comments.COMMENT_PLACEHOLDER,
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
			signIn.textContent = strings.comments.SIGN_IN;
			header.appendChild(signIn);
		}
		// 入力欄の高さも下限に効く。入れ物ごと見張る
		layout.watchSize(header);
		return header;
	}

	/**
	 * 削除の導線に渡す依存。ボタンごとに作らず 1 つを使い回す。
	 * 世代の確認と画面から外す処理はこちらの状態を見るので、ここで閉じ込める
	 */
	const deleteDeps = {
		doc,
		strings,
		deleteComment: (illustId, commentId, token) => api.deleteComment(illustId, commentId, token),
		illustId: () => detailRef?.id ?? null,
		csrfToken: () => readSession(doc).csrfToken,
		watchGeneration: () => {
			const requestedWorkId = workId;
			const requestedList = list;
			return () => workId === requestedWorkId && list === requestedList;
		},
		errorMessage: (error) => postErrorMessage(error, strings.comments.DELETE_FAILED),
		confirmations,
		onRemoved: removeItem,
	};

	/**
	 * 消した行の後にフォーカスを置く先を決める。
	 * 同じ一覧の後ろの行にある削除ボタン、無ければ見出し。
	 * (一覧の項目自体はフォーカスできないので、次の「押せるもの」へ渡す)
	 * @param {HTMLElement} item これから消す行 (.comment-item)
	 * @returns {HTMLElement|null} 受け皿。見出しも無ければ null
	 */
	function focusAfterRemove(item) {
		const siblings = Array.from(item.parentElement?.children ?? []);
		for (const sibling of siblings.slice(siblings.indexOf(item) + 1)) {
			const button = sibling.querySelector(`.${DELETE_BUTTON_CLASS}`);
			if (button) return button;
		}
		return headingEl;
	}

	/**
	 * 削除できたコメントを画面から外し、件数を数え直す。(comments-delete.js から呼ばれる)
	 * @param {import('./comments-delete.js').RemovedInfo} info 消してよい行と、押した時点の世代
	 * @returns {Promise<void>}
	 */
	async function removeItem({ item, isRoot, focused, stillCurrent }) {
		const illustId = workId;
		// 受け皿は消す前に決める。消した後では隣が分からない
		const receiver = focused ? focusAfterRemove(item) : null;
		// 行に開いたままの返信欄は forms から外す。残すと消えた入力欄が Escape を食い止め続け、
		// その欄で開いていたピッカーも開いたままになる
		for (const form of forms) {
			if (item.contains(form.element)) {
				forms.delete(form);
				form.dispose();
			}
		}
		item.remove();
		// 読み込み済みの件数も戻す。戻さないと次の「もっと見る」が 1 件飛ばす。
		// 返信は roots の数え方に入らないのでルートのときだけ
		if (isRoot) offset = Math.max(0, offset - 1);
		// 最後の 1 件だったら「まだコメントはありません」へ戻す。
		// 戻さないと見出しだけが残って、読み込みに失敗したように見える
		if (list && list.children.length === 0) showEmpty();
		// 行ごと消えるとフォーカスが body へ落ち、キーボード利用者が Tab の起点を失う
		receiver?.focus();
		layout.applyFloor();
		// 受け手がいなければ数え直しも走らない。
		// 件数を出していない呼び出し元に無駄な通信をさせないので、これでよい
		if (!deps.onDeleted) return;
		const count = await countAfterDelete(illustId);
		// 数え直しを待つ間に別の作品へ移っていたら、前の作品の件数を今の作品に書かない
		if (!stillCurrent()) return;
		try {
			deps.onDeleted(count);
		} catch (error) {
			// 受け手の失敗は削除の失敗ではない。行は既に外しているので、伝えずに記録だけ残す
			warn('failed to apply comment count', illustId, error);
		}
	}

	/**
	 * コメント本体 (アバター・名前・本文・日時) を要素にする。
	 * ルートにも返信にも同じ形を使う。
	 * @param {Comment} comment コメント
	 * @param {boolean} [isRoot] ルートコメントか。削除で読み込み済みの件数 (offset) を戻すかの判断に使う
	 * @returns {{item: HTMLElement, body: HTMLElement, repliesSlot: HTMLElement, meta: HTMLElement}} 要素・本文側の入れ物・返信ボタンの差し込み先・下段
	 */
	function createItem(comment, isRoot = false) {
		const item = doc.createElement('li');
		item.className = 'comment-item';

		// 退会したユーザーと ID が取れなかったコメントには飛び先が無い。押せないままにする
		const userPage = comment.userId && !comment.isDeleted ? userPath(comment.userId, localePrefix) : null;

		// 作者行と同じ部品。CDN 以外の URL や読み込み失敗は枠だけ残して黙って続ける
		const avatar = createAvatar(doc, 'comment-avatar');
		showAvatar(avatar, comment.avatarUrl);

		// アイコンもリンクにする。(押せる範囲が広いほうが誤操作が減る)
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

		// 名前の直後にラベルを置く。(pixiv 本体と同じ並び) 付かないコメントには要素ごと作らない
		const label = commentLabel(comment, readSession(doc).self?.id ?? null, detailRef?.userId ?? null, strings);
		let labelNode = null;
		if (label) {
			labelNode = doc.createElement('span');
			// 本体は「あなた」だけ地を緑にしている。色の出し分けは CSS に任せ、印だけ付ける
			labelNode.className = label === strings.comments.roles.SELF ? 'comment-label is-self' : 'comment-label';
			labelNode.textContent = label;
		}

		const text = doc.createElement('p');
		text.className = 'comment-text';
		if (comment.isStamp) text.appendChild(renderStamp(doc, comment.stampId, strings));
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
		date.textContent = comment.date ? strings.comments.formatDateTime(comment.date) : '';
		meta.append(repliesSlot, date);

		body.append(name, ...(labelNode ? [labelNode] : []), text, meta);
		item.append(avatarNode, body);

		// 削除はルートにも返信にも付く。返信を書く導線は後から meta.prepend() で
		// 前へ差し込まれるので、並びは [返信][削除][返信を表示][日時] になる
		if (comment.editable) attachDelete(comment, { item, body, meta, isRoot }, deleteDeps);
		return { item, body, repliesSlot, meta };
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
			toggleText.textContent = next ? strings.comments.REPLIES_HIDE : strings.comments.REPLIES_SHOW;
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
			replyError.textContent = strings.comments.REPLY_FAILED;
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
				const responseBody = await fetchJson(commentRepliesUrl(comment.id, page, strings.lang));
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
					replyList.appendChild(createItem(normalizeComment(raw, strings)).item);
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
					replyMore.textContent = strings.comments.REPLY_MORE;
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
					replyMore.textContent = strings.comments.RETRY;
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
			 * 畳んでいるときは足さず、「返信を表示」を出すだけにする。(開けば取り直される)
			 * @param {object} posted actions.js が返した 1 件
			 * @returns {void}
			 */
			appendPosted(posted) {
				toggle.hidden = false;
				if (!open || !replyList) return;
				replyList.appendChild(createItem(fromPosted(posted)).item);
				layout.applyFloor();
			},
		};
	}

	/**
	 * 返信を書く導線を 1 件のコメントに付ける。
	 *
	 * 「返信を表示」の左に置く。押すたびに入力欄を出し入れし、畳んだら DOM ごと捨てる。
	 * (開いたまま残すとコメントの多い作品で入力欄が積み上がる)
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
		toggle.textContent = strings.comments.REPLY;
		toggle.setAttribute('aria-expanded', 'false');
		toggle.addEventListener('click', () => {
			if (form) {
				// forms から外し忘れると、消えた入力欄が Escape を食い止め続ける
				forms.delete(form);
				form.dispose();
				form = null;
				toggle.setAttribute('aria-expanded', 'false');
				layout.applyFloor();
				// 入力欄ごと消えるとフォーカスが body へ落ちる。押したボタンへ戻す
				toggle.focus();
				return;
			}
			form = buildForm({
				placeholder: strings.comments.REPLY_PLACEHOLDER,
				parentId: comment.id,
				avatarUrl: readSession(doc).self?.profileImg ?? null,
				onPosted: (posted) => { onReplied(posted); },
			});
			// 返信一覧より前、コメントの直下に出す。(pixiv 本体と同じ位置)
			// 返信の下に置くと、返信が多いコメントほど書く場所が遠くなる
			const area = body.querySelector('.comment-replies-area');
			if (area) body.insertBefore(form.element, area);
			else body.appendChild(form.element);
			toggle.setAttribute('aria-expanded', 'true');
			layout.applyFloor();
			form.focus();
		});

		meta.prepend(toggle);
	}

	/**
	 * ルートコメント 1 件を導線ごと組み立てる。
	 *
	 * 返信を読む導線と書く導線はルートにだけ付ける。(pixiv 側も入れ子は 1 段まで)
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
			userName: posted.userName || self?.name || strings.comments.DELETED_USER,
			avatarUrl: self?.profileImg ?? '',
			text: posted.text,
			// 応答に日時は入らないので手元の時計を使う。(pixiv 本体も同じ)
			date: new Date(),
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
	 * 取り直さないのは offset がずれ、読み進めた位置も飛ぶため。(pixiv 本体も同じ)
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
		layout.applyFloor();
	}

	/**
	 * 「まだコメントはありません」を出す。
	 * 読み込み前に 0 件だったときと、最後の 1 件を消したときの両方から呼ぶ。
	 * @returns {void}
	 */
	function showEmpty() {
		if (emptyEl) return;
		emptyEl = doc.createElement('p');
		emptyEl.className = 'status';
		emptyEl.textContent = strings.comments.EMPTY;
		container.appendChild(emptyEl);
		layout.watchSize(emptyEl);
	}

	/**
	 * 削除のあとのコメント件数を pixiv から引き直す。
	 *
	 * **手元で 1 を引くだけでは合わない。** ルートを消すとぶら下がっていた返信も
	 * 道連れになり (SITE_SPEC §4-8 実測)、開いていない返信の数は分からないため。
	 * 削除の反映は即時で、消した直後に引いても正しい値が返ることを実測で確認している。
	 * (ブックマークの削除と違って遅れない)
	 * 引けなかったときは null を返し、呼び出し側が手元で 1 を引く側へ倒す。
	 * @param {string} illustId 作品 ID
	 * @returns {Promise<number|null>} 新しい件数。引けなければ null
	 */
	async function countAfterDelete(illustId) {
		try {
			// 同じ URL を作品を開いた時点で引いているため、そのまま引き直すと
			// ブラウザのキャッシュが**削除前の件数**を返すことがある。(実機で確認)
			// 数え直しの意味が消えるので、毎回違う URL にして必ず取り直す
			const body = await fetchJson(`${illustUrl(illustId, strings.lang)}&${CACHE_BUSTER}=${Date.now()}`);
			const count = body?.commentCount;
			return typeof count === 'number' ? count : null;
		} catch (error) {
			// 数え直せなくても削除自体は通っている。件数は呼び出し側の控えに任せる
			warn('failed to re-read comment count', illustId, error);
			return null;
		}
	}

	/**
	 * 一覧とスクロール領域を組み立てて入れ物へ入れる。既にあれば何もしない。
	 * コメントのある作品では load() が、0 件の作品では 1 件目の投稿が呼ぶ。
	 * @returns {void}
	 */
	function ensureList() {
		// 一覧と「まだコメントはありません」は両立しない。1 件目が入る時点で消す。
		// 一覧の有無とは切り離す: 最後の 1 件を消して案内へ戻したあとは一覧が残ったまま案内が出ている
		emptyEl?.remove();
		emptyEl = null;
		if (list) return;

		// 一覧と「もっと見る」を同じ領域に入れてスクロールさせる。
		// 外に置くと、一番下まで読んでいなくてもボタンが見えて不自然になる
		scroll = doc.createElement('div');
		scroll.className = 'comment-scroll';
		container.appendChild(scroll);

		list = doc.createElement('ul');
		list.className = 'comment-list';
		scroll.appendChild(list);
		// 返信の開閉でも高さが変わる。一覧そのものを見張れば全部拾える
		layout.watchSize(list);

		moreButton = doc.createElement('button');
		moreButton.type = 'button';
		moreButton.className = 'more';
		moreButton.textContent = strings.comments.MORE;
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
			const body = await fetchJson(commentRootsUrl(requestedWorkId, offset, COMMENT_PAGE_SIZE, strings.lang));
			// 待っている間に破棄されたか、別の作品へ移ったか、描き直されていたら捨てる
			if (workId !== requestedWorkId || !list || list !== requestedList) return;
			const comments = (body?.comments ?? []).map((raw) => normalizeComment(raw, strings));
			for (const comment of comments) {
				list.appendChild(createRootItem(comment));
			}
			offset += comments.length;
			failure?.remove();
			failure = null;
			if (moreButton) {
				moreButton.textContent = strings.comments.MORE;
				moreButton.hidden = body?.hasNext !== true;
				moreButton.disabled = false;
			}
			layout.applyFloor();
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
			failure.textContent = strings.comments.LOAD_FAILED;
			container.appendChild(failure);
			layout.watchSize(failure);
			if (moreButton) {
				moreButton.textContent = strings.comments.RETRY;
				moreButton.hidden = false;
				moreButton.disabled = false;
			}
			layout.applyFloor();
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
			layout.reset();
			headerEl = null;
			headingEl = null;
			toTopButton = null;
			scroll = null;
			list = null;
			moreButton = null;
			failure = null;
			emptyEl = null;
			confirmations.clear();
			// 前の作品の入力欄は捨てる。書きかけごと消えるが、別の作品へ送るほうが害が大きい
			forms.clear();
			picker?.close();

			detailRef = detail;
			const session = readSession(doc);
			// コメントを受け付けていない作品と未ログインでは投稿できない。
			// 返信の導線を出すかの判断にも使うので、モジュールの状態として覚えておく
			canPost = detail.commentOff !== true && session.isLoggedIn === true && Boolean(session.csrfToken);
			container.appendChild(createHeader(detail.commentOff === true));
			// 判定は文書に入れてから。createHeader() の中では位置を測れない
			layout.syncScrollState();

			if (detail.commentOff) {
				const off = doc.createElement('p');
				off.className = 'status';
				off.textContent = strings.comments.COMMENT_OFF;
				container.appendChild(off);
				layout.watchSize(off);
				layout.applyFloor();
				return;
			}
			if (detail.commentCount === 0) {
				// 引いても空なので読みに行かない。一覧もまだ作らず、
				// 投稿されたときだけ prependComment() が作ってこの文言を消す
				showEmpty();
				layout.applyFloor();
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
			if (event.key === KEYS.CLOSE && confirmations.cancel()) return true;
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
			layout.dispose();
			headerEl = null;
			headingEl = null;
			toTopButton = null;
			list = null;
			scroll = null;
			moreButton = null;
			failure = null;
			emptyEl = null;
			confirmations.clear();
			workId = null;
			canPost = false;
			forms.clear();
			picker?.dispose();
			picker = null;
			detailRef = null;
		},
	};
}
