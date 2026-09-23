/**
 * サイドバー。作者・投稿文・タグ・各カウンタを出す。
 *
 * 投稿文 (illustComment) は pixiv が返す HTML で、外部由来の入力を含む。
 * innerHTML は使わず、必要な要素 (改行とリンク) だけを自前で組み立てる。
 * ホストページが Trusted Types を強制していると innerHTML が例外になる事情もある。
 */
import { createIcon } from '../../common/icons.js';
import { formatCount } from '../../common/format.js';
import { warn } from '../../common/log.js';
import { currentLocalePrefix } from '../../common/locale.js';
import { PIXIV_ORIGIN, artworkPath, userPath, tagWorksPath } from '../../pixiv/endpoints.js';
import { createAvatar, showAvatar } from './avatar.js';
import { fetchUserProfile } from '../../pixiv/user.js';
import { createShareMenu } from './share-menu.js';

/** リンクとして扱ってよいスキーム。 */
const SAFE_SCHEMES = ['http:', 'https:'];

/** ユーザー ID の見出し。数字だけだと何の番号か分からないので前に置く。 */
const USER_ID_PREFIX = 'ID: ';

/** 読み上げにだけ渡す文字に付けるクラス。見た目は viewer.css の .visually-hidden。 */
const VISUALLY_HIDDEN_CLASS = 'visually-hidden';

/** カウンタの数字だけを持つ要素のクラス。bumpCommentCount() が書き換え先を探すのに使う。 */
const COUNT_VALUE_CLASS = 'count-value';

/** コメントのカウンタに付ける差し替え用の印。actions-bar のいいね・ブックマークと同じ流儀。 */
const COMMENT_COUNT_MARKER = 'count-comment';

/** 名前付きの実体参照の戻し表。数値参照 (&#39; / &#x27;) は decodeEntities が汎用に戻す。 */
const ENTITIES = Object.freeze({
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
});

/** 数値参照 (&#39; / &#x27;)。1 番目の捕捉が x 付きなら 16 進。 */
const NUMERIC_ENTITY_PATTERN = /&#(x[0-9a-f]+|\d+);/gi;

/** 名前付きの実体参照。ENTITIES のキーと同じ範囲。 */
const NAMED_ENTITY_PATTERN = /&(?:amp|lt|gt|quot);/g;

/** 投稿文の br。この前後で行を分ける。 */
const LINE_BREAK_PATTERN = /<br\s*\/?>/i;

/**
 * 投稿文の a。1 番目の捕捉が href、2 番目が中身。
 * g フラグ付きは lastIndex を持つので、使うときは行ごとに `new RegExp()` で複製する
 */
const ANCHOR_PATTERN = /<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis;

/** 残すタグ以外の全てのタグ。中身のテキストだけ残すために消す。 */
const ANY_TAG_PATTERN = /<[^>]*>/g;

/**
 * ISO 8601 の日時を画面の表記にする。
 * 書式の組み立てはカタログが持つ。ここは読めない値をはじくだけ。
 * @param {string} iso createDate など
 * @param {object} strings 文言のカタログ
 * @returns {string} 日時。読めなければ空文字
 */
export function formatDate(iso, strings) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return strings.sidebar.formatDateTime(date);
}

/**
 * 数値参照 1 つを文字に戻す。
 * @param {string} code 捕捉した部分 (39 / x27 など)
 * @returns {string|null} 戻した文字。符号位置として不正なら null
 */
function decodeNumericEntity(code) {
	const hex = code[0] === 'x' || code[0] === 'X';
	const codePoint = hex ? parseInt(code.slice(1), 16) : Number(code);
	try {
		return String.fromCodePoint(codePoint);
	} catch {
		return null;
	}
}

/**
 * 実体参照を戻す。
 * 数値参照を先に戻す。名前付きを先に戻すと &amp;#39; が &#39; になった後でもう一度戻されてしまう。
 * @param {string} text 対象
 * @returns {string} 戻した文字列
 */
function decodeEntities(text) {
	return text
		.replace(NUMERIC_ENTITY_PATTERN, (matched, code) => decodeNumericEntity(code) ?? matched)
		.replace(NAMED_ENTITY_PATTERN, (matched) => ENTITIES[matched] ?? matched);
}

/**
 * href がリンクとして安全かを確かめ、絶対 URL にして返す。
 * 投稿文には /users/123 のような相対リンクが入るので、base を渡して解決する。
 * (渡さないと相対リンクが全て弾かれ、本文テキストに落ちてしまう)
 * 返すのは絶対 URL。Shadow DOM の中では相対 URL の解決基準が分かりにくいため正規化する。
 * @param {string} href 投稿文の中の href
 * @returns {string|null} 使ってよい絶対 URL。安全でなければ null
 */
function resolveSafeHref(href) {
	try {
		const url = new URL(href, PIXIV_ORIGIN);
		return SAFE_SCHEMES.includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

/**
 * @typedef {{type: 'text', value: string} | {type: 'link', value: string, href: string}} CommentPart
 */

/**
 * 投稿文の HTML を行ごとの断片に分解する。
 * 対応するのは br と a だけ。他のタグは中身のテキストだけを残す。
 * @param {string|null} html illustComment
 * @returns {CommentPart[][]} 行ごとの断片
 */
export function splitComment(html) {
	if (!html) return [];
	return html
		.split(LINE_BREAK_PATTERN)
		.map((line) => {
			const parts = [];
			// g 付きの正規表現は lastIndex を持ち回るので、行ごとに複製して使う
			const pattern = new RegExp(ANCHOR_PATTERN);
			let cursor = 0;
			let matched;
			while ((matched = pattern.exec(line)) !== null) {
				const before = line.slice(cursor, matched.index);
				if (before) parts.push({ type: 'text', value: decodeEntities(before.replace(ANY_TAG_PATTERN, '')) });
				const label = decodeEntities(matched[2].replace(ANY_TAG_PATTERN, ''));
				const href = resolveSafeHref(decodeEntities(matched[1]));
				// 危険なスキームはリンクにせず本文として出す
				parts.push(href ? { type: 'link', value: label, href } : { type: 'text', value: label });
				cursor = matched.index + matched[0].length;
			}
			const rest = line.slice(cursor);
			if (rest) parts.push({ type: 'text', value: decodeEntities(rest.replace(ANY_TAG_PATTERN, '')) });
			return parts;
		});
}

/**
 * 断片を DOM に起こす。
 * @param {Document} doc 対象のドキュメント
 * @param {string|null} html illustComment
 * @returns {DocumentFragment} 組み立てた中身
 */
export function commentToNodes(doc, html) {
	const fragment = doc.createDocumentFragment();
	const lines = splitComment(html);
	lines.forEach((parts, lineIndex) => {
		if (lineIndex > 0) fragment.appendChild(doc.createElement('br'));
		for (const part of parts) {
			if (part.type === 'link') {
				const anchor = doc.createElement('a');
				anchor.href = part.href;
				anchor.target = '_blank';
				anchor.rel = 'noopener noreferrer';
				anchor.textContent = part.value;
				fragment.appendChild(anchor);
			} else {
				fragment.appendChild(doc.createTextNode(part.value));
			}
		}
	});
	return fragment;
}

/**
 * @typedef {object} SidebarDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先 (.sidebar)
 * @property {(userId: string, lang: string) => Promise<object>} [fetchUser] ユーザー情報の取得。既定は共有キャッシュ付きの取得
 * @property {object} strings 文言のカタログ (src/i18n)
 */

/**
 * サイドバーを作る。
 * @param {SidebarDeps} deps 依存
 * @returns {{render: (detail: object) => void, followSlot: () => HTMLElement, countsSlot: () => HTMLElement, commentsSlot: () => HTMLElement, bumpCommentCount: (delta: number) => void, setCommentCount: (next: number) => void, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}}
 */
export function createSidebar(deps) {
	const { doc, container, strings } = deps;
	// リンクは pixiv 本体のページを指すので、今の表示言語の接頭辞 (/en) を付ける
	const localePrefix = deps.localePrefix ?? currentLocalePrefix(doc);
	// actions-bar (フォロー状態) と同じ応答を使う。既定は共有キャッシュ付きなので通信は 1 回で済む
	const fetchUser = deps.fetchUser ?? fetchUserProfile;
	/** @type {HTMLElement|null} フォローボタンを後から差し込む場所 (作者行の右端) */
	let follow = null;
	/** @type {HTMLElement|null} カウンタの行。いいねとブックマークはここが押せるボタンに変わる */
	let counts = null;
	/** @type {HTMLElement|null} コメントを後から差し込む場所 */
	let comments = null;
	/**
	 * 今出しているコメントの件数。投稿のたびに手元で増やす。
	 * 取り直さないのは、投稿の反映に間があり、直後に引くと古い数字が返るため。
	 * (いいね・ブックマークと同じ方針。SPEC §10.12)
	 * **削除だけは例外で、数え直した値で置き換える**。(ルートを消すと返信も道連れになり、
	 * 手元では引く数が決まらないため。SPEC §10.11)
	 * @type {number}
	 */
	let commentCount = 0;
	/** @type {ReturnType<typeof createShareMenu>|null} シェアメニュー。Escape を先に食べる */
	let shareMenu = null;
	/** 描画の世代。アイコンの取得を待っている間に描き直されたかを見る */
	let generation = 0;

	/**
	 * カウンタ 1 つを作る。
	 *
	 * いいねとブックマークは actions-bar が押せるボタンへ差し替える。
	 * 差し替え先を探せるように印 (marker) を付ける。差し替えられなかったとき
	 * (未ログイン・見られない作品) はこのまま押せない表示として残る。
	 *
	 * 何の数字かは視覚的に隠した文字で持つ。role の無い span の aria-label は
	 * 読み上げに届かない (ARIA 1.2 で generic には付けられない) ので使わない。
	 * @param {string} iconName アイコン名
	 * @param {string} label 読み上げ用のラベル
	 * @param {number} value 値
	 * @param {string} [marker] 差し替え先を示す追加のクラス
	 * @returns {HTMLElement} 要素
	 */
	function createCount(iconName, label, value, marker) {
		const item = doc.createElement('span');
		item.className = marker ? `count ${marker}` : 'count';
		item.appendChild(createIcon(doc, iconName));
		const name = doc.createElement('span');
		name.className = VISUALLY_HIDDEN_CLASS;
		name.textContent = `${label} `;
		item.appendChild(name);
		const text = doc.createElement('span');
		// 数字だけを持つ要素に印を付けておく。bumpCommentCount() がここだけを書き換える
		text.className = COUNT_VALUE_CLASS;
		text.textContent = formatCount(value, strings.lang);
		item.appendChild(text);
		item.title = `${label} ${formatCount(value, strings.lang)}`;
		return item;
	}

	/**
	 * 作者行を作る。アイコン・名前・ユーザー ID を 1 つのリンクにまとめる。
	 *
	 * アイコンの URL は作品詳細に無いので /ajax/user/{id} を別に引く。
	 * render() は同期のままにして、取れたら後から src を入れる。
	 * @param {object} detail 正規化した作品詳細
	 * @returns {HTMLElement} .author-row
	 */
	function createAuthorRow(detail) {
		const row = doc.createElement('div');
		row.className = 'author-row';

		const author = doc.createElement('a');
		author.className = 'author';
		author.href = userPath(detail.userId, localePrefix);

		// 取れるまでは枠だけ。読み込めなかったときと同じ見え方にしておく
		const avatar = createAvatar(doc, 'author-avatar');
		author.appendChild(avatar);

		const identity = doc.createElement('span');
		identity.className = 'author-identity';
		const name = doc.createElement('span');
		name.className = 'author-name';
		name.textContent = detail.userName;
		const userId = doc.createElement('span');
		userId.className = 'author-id';
		userId.textContent = `${USER_ID_PREFIX}${detail.userId}`;
		identity.append(name, userId);
		author.appendChild(identity);

		const mine = generation;
		// 取れなくても名前とリンクは出ている。失敗は枠だけ残して黙って続ける。
		// fetchUser が同期で投げることもあるので、ここで Promise に揃える
		let pending;
		try {
			pending = Promise.resolve(fetchUser(detail.userId, strings.lang));
		} catch (error) {
			pending = Promise.reject(error);
		}
		pending
			.then((user) => {
				// 待っている間に別の作品へ移っていたら、前の作者の顔を入れない
				if (mine !== generation) return;
				showAvatar(avatar, user?.image);
			})
			.catch((error) => { warn('failed to load author icon', detail.userId, error); });

		follow = doc.createElement('div');
		follow.className = 'follow-slot';
		row.append(author, follow);
		return row;
	}

	/**
	 * 作品ページへのリンクとシェアボタンの行を作る。
	 * @param {object} detail 正規化した作品詳細
	 * @returns {HTMLElement} .link-row
	 */
	function createLinkRow(detail) {
		const row = doc.createElement('div');
		row.className = 'link-row';

		const original = doc.createElement('a');
		original.className = 'original-link';
		original.href = artworkPath(detail.id, localePrefix);
		original.setAttribute('target', '_blank');
		original.setAttribute('rel', 'noopener noreferrer');
		const label = doc.createElement('span');
		label.textContent = strings.sidebar.OPEN_ORIGINAL;
		original.append(label, createIcon(doc, 'openInNew'));
		row.appendChild(original);

		shareMenu = createShareMenu({ doc, detail, strings });
		row.appendChild(shareMenu.element);
		return row;
	}

	/**
	 * コメントの件数の表示を書き換える。増減も置き換えもここを通す。
	 * render() より前や dispose() の後に呼ばれても何もしない。
	 * @param {number} next 新しい件数。負数は 0 で止める
	 * @returns {void}
	 */
	function writeCommentCount(next) {
		if (!counts) return;
		const node = counts.querySelector(`.${COMMENT_COUNT_MARKER}`);
		if (!node) return;
		commentCount = Math.max(0, next);
		const value = node.querySelector(`.${COUNT_VALUE_CLASS}`);
		if (!value) return;
		value.textContent = formatCount(commentCount, strings.lang);
		node.title = `${strings.sidebar.COMMENTS} ${formatCount(commentCount, strings.lang)}`;
	}

	return {
		/**
		 * 作品詳細を描く。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {void}
		 */
		render(detail) {
			// 前の描画で走っているアイコンの取得を切り離す。
			// これを外すと、作品を送った直後に前の作者の顔が入ることがある
			generation += 1;
			shareMenu?.dispose();
			shareMenu = null;
			container.textContent = '';

			// 作品情報とコメントを別の入れ物に分ける。
			// スクロールするのはコメント一覧だけにしたいので、
			// サイドバー自身ではなく中の 2 つで縦の領域を分け合う (viewer.css の .sidebar)
			const info = doc.createElement('div');
			info.className = 'sidebar-info';
			container.appendChild(info);

			// 作者のアイコン・名前とフォローを同じ行に置く。
			// pixiv 本体と同じで、誰の作品かが最初に目に入る
			info.appendChild(createAuthorRow(detail));

			const title = doc.createElement('h2');
			title.className = 'title';
			title.textContent = detail.title;
			info.appendChild(title);

			const comment = doc.createElement('p');
			comment.className = 'comment';
			comment.appendChild(commentToNodes(doc, detail.comment));
			info.appendChild(comment);

			if (detail.tags.length > 0) {
				const tagList = doc.createElement('ul');
				tagList.className = 'tags';
				for (const tag of detail.tags) {
					const item = doc.createElement('li');
					const link = doc.createElement('a');
					link.href = tagWorksPath(tag, localePrefix);
					link.textContent = `#${tag}`;
					item.appendChild(link);
					tagList.appendChild(item);
				}
				info.appendChild(tagList);
			}

			// 投稿日時はタグの下・カウンタの罫線の上。読み物の締めくくりとして置く
			const date = doc.createElement('p');
			date.className = 'date';
			date.textContent = formatDate(detail.createDate, strings);
			info.appendChild(date);

			counts = doc.createElement('div');
			counts.className = 'counts';
			// アイコンの対応は pixiv 本体に合わせる。いいねは顔、ブックマークはハート
			counts.append(
				createCount('like', strings.sidebar.LIKE, detail.likeCount, 'count-like'),
				createCount('favorite', strings.sidebar.BOOKMARK, detail.bookmarkCount, 'count-bookmark'),
				createCount('visibility', strings.sidebar.VIEWS, detail.viewCount),
				createCount('comment', strings.sidebar.COMMENTS, detail.commentCount, COMMENT_COUNT_MARKER),
			);
			info.appendChild(counts);
			// 新しい作品を描いたら、前の作品で足した分は持ち越さず detail の値に揃える
			commentCount = typeof detail.commentCount === 'number' ? detail.commentCount : 0;

			info.appendChild(createLinkRow(detail));

			comments = doc.createElement('div');
			comments.className = 'comments';
			container.appendChild(comments);
		},

		followSlot() { return follow; },
		countsSlot() { return counts; },
		commentsSlot() { return comments; },

		/**
		 * コメントの件数を手元で増減する。
		 * 取り直さないのは、投稿の反映に間があり、直後に引くと古い数字が返るため。
		 * (いいね・ブックマークと同じ方針。SPEC §10.12)
		 * render() より前や dispose() の後に呼ばれても何もしない。
		 * @param {number} delta 増やす数 (減らすときは負数)
		 * @returns {void}
		 */
		bumpCommentCount(delta) {
			writeCommentCount(commentCount + delta);
		},

		/**
		 * コメントの件数を数え直した値で置き換える。
		 *
		 * 手元で足し引きできないときだけ使う。**ルートのコメントを消すと返信も道連れになり**、
		 * 開いていない返信の数は分からないので、削除のあとは pixiv から引き直した値を入れる。
		 * (SPEC §10.11) 投稿のように 1 件と分かっているときは bumpCommentCount() を使う。
		 * @param {number} next 新しい件数
		 * @returns {void}
		 */
		setCommentCount(next) {
			if (!Number.isFinite(next)) return;
			writeCommentCount(next);
		},

		/**
		 * キー操作をシェアメニューに先に使わせる。(Escape / 上下 / Home / End)
		 * ビュワー本体がモーダルを閉じたり作品を移ったりするより先に呼ばれ、
		 * true なら本体は反応しない。開いたメニューで下キーを押して次の作品へ移らないように
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			return shareMenu?.consumeKey(event) === true;
		},

		dispose() {
			// 自分が描いた中身は自分で消す。
			// これを外すと、次の作品を読み込んでいる間に前の作品の情報が残る
			generation += 1;
			shareMenu?.dispose();
			shareMenu = null;
			container.textContent = '';
			follow = null;
			counts = null;
			comments = null;
			commentCount = 0;
		},
	};
}
