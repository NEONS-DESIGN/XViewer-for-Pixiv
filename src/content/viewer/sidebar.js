/**
 * サイドバー。作者・投稿文・タグ・各カウンタを出す。
 *
 * 投稿文 (illustComment) は pixiv が返す HTML で、外部由来の入力を含む。
 * innerHTML は使わず、必要な要素 (改行とリンク) だけを自前で組み立てる。
 * ホストページが Trusted Types を強制していると innerHTML が例外になる事情もある。
 */
import { createIcon } from '../../common/icons.js';
import { PIXIV_ORIGIN, safeCdnUrl } from '../../pixiv/endpoints.js';
import { fetchUserProfile } from '../../pixiv/user.js';
import { createShareMenu } from './share-menu.js';

/** リンクとして扱ってよいスキーム。 */
const SAFE_SCHEMES = ['http:', 'https:'];

/** ユーザー ID の見出し。数字だけだと何の番号か分からないので前に置く。 */
const USER_ID_PREFIX = 'ID: ';

/** 日時の表示に使うタイムゾーン。閲覧地に依らず pixiv 本体と同じ表示にするため固定する。 */
const DISPLAY_TIME_ZONE = 'Asia/Tokyo';

/** 日時の書式。年月日は数値、時刻は 24 時間の 2 桁。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ja-JP', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/** 実体参照の戻し表。pixiv が返すのはこの範囲。 */
const ENTITIES = Object.freeze({
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
});

/**
 * 数値を 3 桁区切りにする。
 * @param {number|null|undefined} value 数値
 * @returns {string} 区切った文字列
 */
export function formatCount(value) {
	const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
	return number.toLocaleString('ja-JP');
}

/**
 * ISO 8601 の日時を日本語表記にする。
 * ローカル時刻のゲッタを使うと閲覧地によって pixiv 本体と違う日時が出るため、JST に固定する。
 * @param {string} iso createDate など
 * @returns {string} 日本語の日時。読めなければ空文字
 */
export function formatDate(iso) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const parts = {};
	for (const { type, value } of DATE_TIME_FORMAT.formatToParts(date)) parts[type] = value;
	return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

/**
 * 実体参照を戻す。
 * @param {string} text 対象
 * @returns {string} 戻した文字列
 */
function decodeEntities(text) {
	return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (matched) => ENTITIES[matched] ?? matched);
}

/**
 * href がリンクとして安全かを確かめ、絶対 URL にして返す。
 * 投稿文には /users/123 のような相対リンクが入るので、base を渡して解決する
 * (渡さないと相対リンクが全て弾かれ、本文テキストに落ちてしまう)。
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
		.split(/<br\s*\/?>/i)
		.map((line) => {
			const parts = [];
			const pattern = /<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis;
			let cursor = 0;
			let matched;
			while ((matched = pattern.exec(line)) !== null) {
				const before = line.slice(cursor, matched.index);
				if (before) parts.push({ type: 'text', value: decodeEntities(before.replace(/<[^>]*>/g, '')) });
				const label = decodeEntities(matched[2].replace(/<[^>]*>/g, ''));
				const href = resolveSafeHref(decodeEntities(matched[1]));
				// 危険なスキームはリンクにせず本文として出す
				parts.push(href ? { type: 'link', value: label, href } : { type: 'text', value: label });
				cursor = matched.index + matched[0].length;
			}
			const rest = line.slice(cursor);
			if (rest) parts.push({ type: 'text', value: decodeEntities(rest.replace(/<[^>]*>/g, '')) });
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
 * @property {(userId: string) => Promise<object>} [fetchUser] ユーザー情報の取得。既定は共有キャッシュ付きの取得
 */

/**
 * サイドバーを作る。
 * @param {SidebarDeps} deps 依存
 * @returns {{render: (detail: object) => void, followSlot: () => HTMLElement, countsSlot: () => HTMLElement, commentsSlot: () => HTMLElement, consumeEscape: () => boolean, dispose: () => void}}
 */
export function createSidebar(deps) {
	const { doc, container } = deps;
	// actions-bar (フォロー状態) と同じ応答を使う。既定は共有キャッシュ付きなので通信は 1 回で済む
	const fetchUser = deps.fetchUser ?? ((userId) => fetchUserProfile(userId));
	/** @type {HTMLElement|null} フォローボタンを後から差し込む場所 (作者行の右端) */
	let follow = null;
	/** @type {HTMLElement|null} カウンタの行。いいねとブックマークはここが押せるボタンに変わる */
	let counts = null;
	/** @type {HTMLElement|null} コメントを後から差し込む場所 */
	let comments = null;
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
		const text = doc.createElement('span');
		text.textContent = formatCount(value);
		item.appendChild(text);
		item.title = `${label} ${formatCount(value)}`;
		item.setAttribute('aria-label', item.title);
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
		author.href = `/users/${detail.userId}`;

		const avatar = doc.createElement('img');
		avatar.className = 'author-avatar';
		// 名前が隣にあるので読み上げでは重複する。装飾として扱う
		avatar.setAttribute('alt', '');
		// 取れるまでは枠だけ。読み込めなかったときと同じ見え方にしておく
		avatar.style.visibility = 'hidden';
		avatar.addEventListener('error', () => { avatar.style.visibility = 'hidden'; });
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
			pending = Promise.resolve(fetchUser(detail.userId));
		} catch (error) {
			pending = Promise.reject(error);
		}
		pending
			.then((user) => {
				// 待っている間に別の作品へ移っていたら、前の作者の顔を入れない
				if (mine !== generation) return;
				// 応答の値をそのまま外部オリジンへのリクエストにしない
				const url = safeCdnUrl(user?.image);
				if (!url) return;
				avatar.src = url;
				avatar.style.visibility = '';
			})
			.catch((error) => { console.warn('[PixivMaster] failed to load author icon', detail.userId, error); });

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
		original.href = `/artworks/${detail.id}`;
		original.setAttribute('target', '_blank');
		original.setAttribute('rel', 'noopener noreferrer');
		const label = doc.createElement('span');
		label.textContent = '作品ページを開く';
		original.append(label, createIcon(doc, 'openInNew'));
		row.appendChild(original);

		shareMenu = createShareMenu({ doc, detail });
		row.appendChild(shareMenu.element);
		return row;
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
					link.href = `/tags/${encodeURIComponent(tag)}/artworks`;
					link.textContent = `#${tag}`;
					item.appendChild(link);
					tagList.appendChild(item);
				}
				info.appendChild(tagList);
			}

			// 投稿日時はタグの下・カウンタの罫線の上。読み物の締めくくりとして置く
			const date = doc.createElement('p');
			date.className = 'date';
			date.textContent = formatDate(detail.createDate);
			info.appendChild(date);

			counts = doc.createElement('div');
			counts.className = 'counts';
			// アイコンの対応は pixiv 本体に合わせる。いいねは顔、ブックマークはハート
			counts.append(
				createCount('like', 'いいね', detail.likeCount, 'count-like'),
				createCount('favorite', 'ブックマーク', detail.bookmarkCount, 'count-bookmark'),
				createCount('visibility', '閲覧数', detail.viewCount),
				createCount('comment', 'コメント', detail.commentCount),
			);
			info.appendChild(counts);

			info.appendChild(createLinkRow(detail));

			comments = doc.createElement('div');
			comments.className = 'comments';
			container.appendChild(comments);
		},

		followSlot() { return follow; },
		countsSlot() { return counts; },
		commentsSlot() { return comments; },

		/**
		 * Escape をシェアメニューに使わせる。
		 * ビュワー本体がモーダルを閉じるより先に呼ばれ、true なら本体は反応しない。
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeEscape() {
			return shareMenu?.consumeEscape() === true;
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
		},
	};
}
