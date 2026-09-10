/**
 * サイドバー。作者・投稿文・タグ・各カウンタを出す。
 *
 * 投稿文 (illustComment) は pixiv が返す HTML で、外部由来の入力を含む。
 * innerHTML は使わず、必要な要素 (改行とリンク) だけを自前で組み立てる。
 * ホストページが Trusted Types を強制していると innerHTML が例外になる事情もある。
 */
import { createIcon } from '../../common/icons.js';

/** リンクとして扱ってよいスキーム。 */
const SAFE_SCHEMES = ['http:', 'https:'];

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
 * @param {string} iso createDate など
 * @returns {string} 日本語の日時。読めなければ空文字
 */
export function formatDate(iso) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (n) => String(n).padStart(2, '0');
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 `
		+ `${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
 * href がリンクとして安全か。
 * @param {string} href URL
 * @returns {boolean} 安全なら true
 */
function isSafeHref(href) {
	try {
		return SAFE_SCHEMES.includes(new URL(href).protocol);
	} catch {
		return false;
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
				const href = decodeEntities(matched[1]);
				const label = decodeEntities(matched[2].replace(/<[^>]*>/g, ''));
				// 危険なスキームはリンクにせず本文として出す
				parts.push(isSafeHref(href) ? { type: 'link', value: label, href } : { type: 'text', value: label });
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
 */

/**
 * サイドバーを作る。
 * @param {SidebarDeps} deps 依存
 * @returns {{render: (detail: object) => void, actionsSlot: () => HTMLElement, commentsSlot: () => HTMLElement, dispose: () => void}}
 */
export function createSidebar(deps) {
	const { doc, container } = deps;
	/** @type {HTMLElement|null} アクション (いいね等) を後から差し込む場所 */
	let actions = null;
	/** @type {HTMLElement|null} コメントを後から差し込む場所 */
	let comments = null;

	/**
	 * カウンタ 1 つを作る。
	 * @param {string} iconName アイコン名
	 * @param {string} label 読み上げ用のラベル
	 * @param {number} value 値
	 * @returns {HTMLElement} 要素
	 */
	function createCount(iconName, label, value) {
		const item = doc.createElement('span');
		item.className = 'count';
		item.appendChild(createIcon(doc, iconName));
		const text = doc.createElement('span');
		text.textContent = formatCount(value);
		item.appendChild(text);
		item.title = `${label} ${formatCount(value)}`;
		item.setAttribute('aria-label', item.title);
		return item;
	}

	return {
		/**
		 * 作品詳細を描く。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {void}
		 */
		render(detail) {
			container.textContent = '';

			const author = doc.createElement('a');
			author.className = 'author';
			author.href = `/users/${detail.userId}`;
			author.textContent = detail.userName;
			container.appendChild(author);

			const title = doc.createElement('h2');
			title.className = 'title';
			title.textContent = detail.title;
			container.appendChild(title);

			actions = doc.createElement('div');
			actions.className = 'actions';
			container.appendChild(actions);

			const comment = doc.createElement('p');
			comment.className = 'comment';
			comment.appendChild(commentToNodes(doc, detail.comment));
			container.appendChild(comment);

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
				container.appendChild(tagList);
			}

			const counts = doc.createElement('div');
			counts.className = 'counts';
			counts.append(
				createCount('favorite', 'いいね', detail.likeCount),
				createCount('bookmark', 'ブックマーク', detail.bookmarkCount),
				createCount('visibility', '閲覧数', detail.viewCount),
				createCount('comment', 'コメント', detail.commentCount),
			);
			container.appendChild(counts);

			const date = doc.createElement('p');
			date.className = 'date';
			date.textContent = formatDate(detail.createDate);
			container.appendChild(date);

			const original = doc.createElement('a');
			original.className = 'original-link';
			original.href = `/artworks/${detail.id}`;
			original.target = '_blank';
			original.rel = 'noopener noreferrer';
			original.textContent = 'pixiv で開く';
			original.appendChild(createIcon(doc, 'openInNew'));
			container.appendChild(original);

			comments = doc.createElement('div');
			comments.className = 'comments';
			container.appendChild(comments);
		},

		actionsSlot() { return actions; },
		commentsSlot() { return comments; },

		dispose() {
			actions = null;
			comments = null;
		},
	};
}
