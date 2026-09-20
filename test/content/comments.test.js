import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComment, renderCommentText, renderStamp, createComments, commentsFloorHeight, isHeadingStuck, formatPostedDate, commentLabel } from '../../src/content/viewer/comments.js';
import { fakeElement, fakeDoc, find, findAll, iconName, flush } from '../helpers/dom.js';
import { clearSessionCache } from '../../src/content/session.js';
import { PixivError, PIXIV_ERROR_KINDS } from '../../src/pixiv/errors.js';
import { stampIds } from '../../src/pixiv/stamps.js';
import { buildNextData } from '../helpers/pixiv.js';

test('コメントを共通の形にする', () => {
	const raw = {
		userId: '92064764',
		userName: 'キーー',
		img: 'https://s.pximg.net/common/images/no_profile.png',
		id: '233674946',
		comment: 'タグに橘さんを入れるなwww',
		stampId: null,
		commentDate: '2026-09-10 09:20',
		hasReplies: false,
	};
	assert.deepEqual(normalizeComment(raw), {
		id: '233674946',
		userId: '92064764',
		userName: 'キーー',
		avatarUrl: 'https://s.pximg.net/common/images/no_profile.png',
		text: 'タグに橘さんを入れるなwww',
		date: '2026-09-10 09:20',
		isStamp: false,
		stampId: null,
		hasReplies: false,
		isDeleted: false,
		editable: false,
	});
});

test('スタンプのコメントは stampId を持ち回る', () => {
	// SITE_SPEC 実測: スタンプのときは comment が空で stampId に文字列が入る
	const comment = normalizeComment({ id: '1', userId: '2', userName: 'x', img: '', comment: '', stampId: '304', commentDate: '', hasReplies: false });
	assert.equal(comment.isStamp, true);
	assert.equal(comment.stampId, '304');
	assert.equal(comment.text, '');
});

test('返信があるコメントに印を付ける', () => {
	const comment = normalizeComment({ id: '1', userId: '2', userName: 'x', img: '', comment: 'a', stampId: null, commentDate: '', hasReplies: true });
	assert.equal(comment.hasReplies, true);
});

test('削除されたユーザーでも落ちない', () => {
	const comment = normalizeComment({ id: '1', isDeletedUser: true, comment: 'a', commentDate: '' });
	assert.equal(comment.userName, '退会したユーザー');
	// 飛び先が無いことを後段 (リンクにするかの判断) へ伝える
	assert.equal(comment.isDeleted, true);
});

test('絵文字を含まない本文は文字のまま並べる', () => {
	const nodes = renderCommentText(fakeDoc(), 'かわいい');
	assert.equal(nodes.length, 1);
	assert.equal(nodes[0].tag, '#text');
	assert.equal(nodes[0].textContent, 'かわいい');
});

test('本文の絵文字を画像にする', () => {
	const nodes = renderCommentText(fakeDoc(), 'すき(heaven)');
	assert.equal(nodes.length, 2);
	assert.equal(nodes[0].textContent, 'すき');
	assert.equal(nodes[1].tag, 'img');
	assert.equal(nodes[1].className, 'comment-emoji');
	assert.equal(nodes[1].attributes.src, 'https://s.pximg.net/common/images/emoji/104.png');
	// 読み上げでも何の絵文字か分かるようにする
	assert.equal(nodes[1].attributes.alt, '(heaven)');
});

test('絵文字の画像が読めなければ元の文字に戻す', () => {
	const nodes = renderCommentText(fakeDoc(), '(heaven)');
	const image = nodes[0];
	image.listeners.error[0]();
	assert.equal(image.replacedWith.length, 1);
	assert.equal(image.replacedWith[0].textContent, '(heaven)');
});

test('スタンプを画像にする', () => {
	const stamp = renderStamp(fakeDoc(), '304');
	assert.equal(stamp.tag, 'img');
	assert.equal(stamp.className, 'comment-stamp');
	assert.equal(stamp.attributes.src, 'https://s.pximg.net/common/images/stamp/generated-stamps/304_s.jpg');
	assert.equal(stamp.attributes.alt, 'スタンプ');
});

test('スタンプの画像が読めなければ文字で伝える', () => {
	const stamp = renderStamp(fakeDoc(), '304');
	stamp.listeners.error[0]();
	assert.equal(stamp.replacedWith[0].textContent, '[スタンプ]');
});

test('スタンプの ID が使えなければ画像を出さない', () => {
	// URL を組み立てられない値でも、コメントが 1 件消えたように見せない
	const stamp = renderStamp(fakeDoc(), '../evil');
	assert.equal(stamp.tag, 'span');
	assert.equal(stamp.textContent, '[スタンプ]');
});


/** ルートコメント 1 件の生データ。 */
const ROOT = Object.freeze({
	userId: '92064764',
	userName: 'キーー',
	img: 'https://s.pximg.net/common/images/no_profile.png',
	id: '233573595',
	comment: 'かわいい',
	stampId: null,
	commentDate: '2026-09-10 09:20',
	hasReplies: true,
});

/** 返信 1 件の生データ。 */
const REPLY = Object.freeze({
	userId: '1',
	userName: '作者',
	img: 'https://s.pximg.net/common/images/no_profile.png',
	id: '233573600',
	comment: 'ありがとう(heaven)',
	stampId: null,
	commentDate: '2026-09-10 10:00',
	commentRootId: '233573595',
	hasReplies: false,
});

/** コメント区画へ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({ id: '149425016', commentOff: false, commentCount: 1 });

/** コメント区画へ渡す作品詳細の代わり (投稿に作者 ID が要る)。 */
const POST_DETAIL = Object.freeze({ id: '149425016', userId: '54734418', commentOff: false, commentCount: 1 });

/** 自分のセッション。投稿できる状態 */
const SELF = Object.freeze({
	id: '99',
	name: '自分',
	profileImg: 'https://i.pximg.net/user-profile/img/1_50.jpg',
	xRestrict: 1,
	hideAiWorks: false,
});

/**
 * ログイン済みの document の代わりを作る。
 * readSession() は解析結果を覚えるので、前のテストの値が残らないよう毎回捨てる。
 * @returns {object} doc の代わり
 */
function loggedInDoc() {
	clearSessionCache();
	return fakeDoc({ nextData: buildNextData({ token: 'csrf-token', self: SELF }) });
}

/**
 * コメント区画を組み立てる。
 * @param {(url: string) => Promise<object>} fetchJson 取得の差し替え
 * @returns {{container: object, comments: object}} 描画先とコメント区画
 */
function build(fetchJson) {
	const container = fakeElement('div');
	const comments = createComments({ doc: loggedInDoc(), container, fetchJson });
	return { container, comments };
}

/**
 * 投稿できる状態のコメント区画を組み立てる。
 * @param {object} [options] fetchJson と actions の差し替え
 * @returns {{doc: object, container: object, comments: object, posted: Array, tokens: string[]}} 描画先・コメント区画・投稿の記録・渡された CSRF トークンの記録
 */
function buildPostable(options = {}) {
	const doc = loggedInDoc();
	const container = fakeElement('div');
	const posted = [];
	const tokens = [];
	const comments = createComments({
		doc,
		container,
		fetchJson: options.fetchJson ?? (async () => ({ comments: [ROOT], hasNext: false })),
		actions: options.actions ?? {
			postComment: async (...args) => {
				posted.push(['comment', ...args.slice(0, 4)]);
				tokens.push(args[4]);
				return { id: '900', userId: '99', userName: '自分', text: args[2], stampId: null };
			},
			postStamp: async (...args) => {
				posted.push(['stamp', ...args.slice(0, 4)]);
				tokens.push(args[4]);
				return { id: '901', userId: '99', userName: '自分', text: '', stampId: args[2] };
			},
		},
		onPosted: options.onPosted,
		onDeleted: options.onDeleted,
	});
	return { doc, container, comments, posted, tokens };
}

/**
 * コメント 1 件にぶら下がっている返信の入力欄を探す。
 * 偽の DOM は子孫セレクタを解さないので、本文側の入れ物から引き直す。
 * @param {object} item コメント 1 件 (.comment-item)
 * @returns {object|null} 入力欄 (.comment-form)。開いていなければ null
 */
function replyForm(item) {
	return find(find(item, '.comment-body'), '.comment-form');
}

/**
 * 入力欄に本文を書いて送信ボタンを押す。
 * @param {object} form 入力欄 (.comment-form)
 * @param {string} text 書く本文
 * @returns {Promise<void>}
 */
async function submitText(form, text) {
	const input = find(form, '.comment-form-input');
	input.value = text;
	await input.dispatch('input', {});
	await find(form, '.comment-form-submit').click();
	await flush();
}

test('「もっと見る」はスクロールする領域の中、一覧の後ろに置く', async () => {
	// 一番下まで読んだときだけ見えるようにする。外に置くと常に見えて不自然になる
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: true }));
	await comments.load(DETAIL);
	assert.deepEqual(container.children.map((child) => child.className), ['comments-header', 'comment-scroll']);
	const scroll = container.children[1];
	assert.deepEqual(scroll.children.map((child) => child.className), ['comment-list', 'more']);
	assert.equal(scroll.children[1].hidden, false);
});

test('続きが無ければ「もっと見る」は出さない', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	assert.equal(find(container, '.more').hidden, true);
});

test('投稿者のアイコンと名前をユーザーページへのリンクにする', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);

	const avatarLink = find(container, '.comment-avatar-link');
	assert.equal(avatarLink.tag, 'a');
	assert.equal(avatarLink.href, '/users/92064764');
	// 同じ飛び先のリンクが 1 件に 2 つ並ぶので、アイコン側は読み上げと Tab から外す
	assert.equal(avatarLink.getAttribute('aria-hidden'), 'true');
	assert.equal(avatarLink.getAttribute('tabindex'), '-1');
	assert.equal(find(avatarLink, '.comment-avatar').tag, 'img');

	const name = find(container, '.comment-name');
	assert.equal(name.tag, 'a');
	assert.equal(name.href, '/users/92064764');
	assert.equal(name.textContent, 'キーー');
	// 同じタブで開く。サイドバーの作者行 (.author) と揃える
	assert.equal(name.getAttribute('target'), null);
});

test('退会したユーザーはリンクにしない', async () => {
	// 飛んでも何も無いページへ送らない
	const { container, comments } = build(async () => ({
		comments: [{ ...ROOT, isDeletedUser: true }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	assert.equal(find(container, '.comment-avatar-link'), null);
	assert.equal(find(container, '.comment-avatar').tag, 'img');
	const name = find(container, '.comment-name');
	assert.equal(name.tag, 'span');
	assert.equal(name.textContent, '退会したユーザー');
});

test('ユーザー ID が取れなければリンクにしない', async () => {
	const { container, comments } = build(async () => ({
		comments: [{ ...ROOT, userId: undefined }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	assert.equal(find(container, '.comment-avatar-link'), null);
	assert.equal(find(container, '.comment-name').tag, 'span');
});

test('返信の投稿者もユーザーページへのリンクになる', async () => {
	const { container, comments } = build(async (url) => {
		if (url.includes('replies')) return { comments: [REPLY], hasNext: false };
		return { comments: [ROOT], hasNext: false };
	});
	await comments.load(DETAIL);
	find(container, '.comment-replies').click();
	await flush();
	const reply = find(container, '.comment-reply-list');
	assert.equal(find(reply, '.comment-name').href, '/users/1');
	assert.equal(find(reply, '.comment-avatar-link').href, '/users/1');
});

test('返信が無いコメントでは返信の開閉ボタンを隠す', async () => {
	// 枠は全件に作る。返信を投稿したその場で出せるようにするため (作り直すと位置がずれる)
	const { container, comments } = build(async () => ({
		comments: [ROOT, { ...ROOT, id: '2', hasReplies: false }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	const buttons = findAll(container, '.comment-replies');
	assert.equal(buttons.length, 2);
	assert.equal(buttons[0].tag, 'button');
	assert.equal(buttons[0].children[1].textContent, '返信を表示');
	assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
	assert.equal(buttons[0].hidden, false);
	assert.equal(buttons[1].hidden, true);
});

test('返信を表示すると replies API を引いてぶら下げる', async () => {
	const asked = [];
	const { container, comments } = build(async (url) => {
		asked.push(url);
		if (url.includes('replies')) return { comments: [REPLY], hasNext: false };
		return { comments: [ROOT], hasNext: false };
	});
	await comments.load(DETAIL);
	find(container, '.comment-replies').click();
	await flush();
	assert.equal(asked[1], '/ajax/illusts/comments/replies?comment_id=233573595&page=1&lang=ja');
	const list = find(container, '.comment-reply-list');
	assert.equal(list.children.length, 1);
	// 返信の本文もルートと同じ描き方 (絵文字は画像) にする
	assert.equal(find(list, '.comment-emoji').attributes.src, 'https://s.pximg.net/common/images/emoji/104.png');
	const toggle = find(container, '.comment-replies');
	assert.equal(toggle.children[1].textContent, '返信を隠す');
	assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('もう一度押すと返信を畳む', async () => {
	const { container, comments } = build(async (url) => (url.includes('replies')
		? { comments: [REPLY], hasNext: false }
		: { comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	toggle.click();
	await flush();
	toggle.click();
	assert.equal(find(container, '.comment-reply-list'), null);
	assert.equal(toggle.children[1].textContent, '返信を表示');
	assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('返信に続きがあれば「返信をもっと見る」を出して次のページを足す', async () => {
	const asked = [];
	const { container, comments } = build(async (url) => {
		asked.push(url);
		if (!url.includes('replies')) return { comments: [ROOT], hasNext: false };
		return url.includes('page=1')
			? { comments: [REPLY], hasNext: true }
			: { comments: [{ ...REPLY, id: '233573601' }], hasNext: false };
	});
	await comments.load(DETAIL);
	find(container, '.comment-replies').click();
	await flush();
	const more = find(container, '.reply-more');
	assert.equal(more.textContent, '返信をもっと見る');
	more.click();
	await flush();
	assert.equal(asked[2], '/ajax/illusts/comments/replies?comment_id=233573595&page=2&lang=ja');
	assert.equal(find(container, '.comment-reply-list').children.length, 2);
	assert.equal(find(container, '.reply-more'), null);
});

test('返信を読み込めなくてもコメントは読めるままにする', async () => {
	const { container, comments } = build(async (url) => {
		if (url.includes('replies')) throw new Error('落ちた');
		return { comments: [ROOT], hasNext: false };
	});
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	toggle.click();
	await flush();
	assert.equal(find(container, '.reply-error').textContent, '返信を読み込めませんでした');
	// 押し直せる状態に戻す
	assert.equal(toggle.disabled, false);
	assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('返信の開閉ボタンは開いているかが分かるアイコンを持つ', async () => {
	// 文言だけだと押した結果が分かりにくい。向きで開閉を示す
	const { container, comments } = build(async (url) => (url.includes('replies')
		? { comments: [REPLY], hasNext: false }
		: { comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	const mark = toggle.children[0];
	assert.equal(iconName(mark.children[0]), 'expandMore');
	toggle.click();
	await flush();
	assert.equal(iconName(mark.children[0]), 'expandLess');
});

test('コメントの下段は返信ボタンが左、日時が右', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	const body = find(container, '.comment-body');
	assert.deepEqual(body.children.map((child) => child.className), ['comment-name', 'comment-text', 'comment-meta']);
	const meta = find(container, '.comment-meta');
	assert.deepEqual(meta.children.map((child) => child.className), ['comment-reply-toggle', 'comment-replies-slot', 'comment-date']);
	assert.equal(meta.children[1].children[0].className, 'comment-replies');
});

test('返信が無いコメントでも日時は同じ下段に置く', async () => {
	// 返信ボタンの有無で日時の位置が動くと、一覧が揃わない
	const { container, comments } = build(async () => ({
		comments: [{ ...ROOT, hasReplies: false }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	const meta = find(container, '.comment-meta');
	assert.deepEqual(meta.children.map((child) => child.className), ['comment-reply-toggle', 'comment-replies-slot', 'comment-date']);
	// 枠は作るが中のボタンは隠す。場所を空けたままにして日時を動かさない
	assert.equal(meta.children[1].children[0].hidden, true);
});

test('読み込みに失敗したら再試行できるようにボタンを残す', async () => {
	// 一時的な失敗で以降のコメントが読めなくならないため。失敗の表示は積み上げない
	let fail = true;
	const { container, comments } = build(async () => {
		if (fail) throw new Error('落ちた');
		return { comments: [ROOT], hasNext: false };
	});
	await comments.load(DETAIL);
	const more = find(container, '.more');
	assert.equal(more.hidden, false);
	assert.equal(more.disabled, false);
	assert.equal(more.textContent, '再試行');
	assert.equal(container.children.filter((child) => child.className === 'status').length, 1);

	// もう一度失敗しても表示は 1 つのまま
	await more.dispatch('click');
	assert.equal(container.children.filter((child) => child.className === 'status').length, 1);

	fail = false;
	await more.dispatch('click');
	assert.equal(container.children.filter((child) => child.className === 'status').length, 0);
	assert.equal(find(container, '.comment-list').children.length, 1);
	assert.equal(more.hidden, true);
	assert.equal(more.textContent, 'もっと見る');
});

test('コメント区画の下限は「見出しなど + 3 件目の下端」', () => {
	// 3 件目まで表示できる高さ。中身はそれより長いので、ここで止めて残りはスクロールさせる
	assert.equal(commentsFloorHeight({ outside: 59, contentHeight: 772, nthBottom: 264 }), 323);
});

test('コメント区画の下限は中身の高さを超えない (余白を作らない)', () => {
	// 1 件しか無いので 3 件目が無い。中身の高さがそのまま下限になる
	assert.equal(commentsFloorHeight({ outside: 59, contentHeight: 88, nthBottom: null }), 147);
	// 3 件あっても中身のほうが短いときは中身に合わせる
	assert.equal(commentsFloorHeight({ outside: 59, contentHeight: 200, nthBottom: 264 }), 259);
});

test('一覧が無いとき (0 件・コメント不可・失敗) の下限は文言の高さだけ', () => {
	assert.equal(commentsFloorHeight({ outside: 109, contentHeight: 0, nthBottom: null }), 109);
});

/**
 * 位置を測れる document の代わりを作る。
 * 本物と同じく、親に入るまでは全て 0 を返す。
 * @param {() => number} headingTop 親に入った後の上端 (見出しと入力欄の入れ物を測る)
 * @returns {object} doc の代わり
 */
function measurableDoc(headingTop) {
	const doc = loggedInDoc();
	const create = doc.createElement;
	doc.createElement = (tag) => {
		const element = create(tag);
		element.getBoundingClientRect = () => (element.parent
			? { top: headingTop(), height: 44, bottom: headingTop() + 44 }
			: { top: 0, height: 0, bottom: 0 });
		return element;
	};
	return doc;
}

test('見出しの「上部へ」は下の線と同じ合図 (貼り付き) で出る', async () => {
	// 見出しの位置はサイドバーの送り量で決まる。上端に届いた時点が貼り付き
	let scrolled = 0;
	const container = fakeElement('div');
	const scrollTarget = fakeElement('div');
	scrollTarget.scrollTop = 0;
	scrollTarget.getBoundingClientRect = () => ({ top: 0, height: 861, bottom: 861 });
	const comments = createComments({
		doc: measurableDoc(() => 431 - scrolled),
		container,
		scrollTarget,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);

	const toTop = find(container, '.to-top');
	// 印が付くのは見出しと入力欄をまとめた入れ物のほう
	const header = find(container, '.comments-header');
	const stuck = () => header.className.includes('is-stuck');

	// まだ投稿文が見えている。線もボタンも出さない
	assert.equal(stuck(), false);
	assert.equal(toTop.hidden, true);

	// 少し送っただけでは届かない
	scrolled = 200;
	scrollTarget.scrollTop = 200;
	await scrollTarget.dispatch('scroll');
	assert.equal(stuck(), false);
	assert.equal(toTop.hidden, true);

	// 上端に届いたら両方出す
	scrolled = 431;
	scrollTarget.scrollTop = 431;
	await scrollTarget.dispatch('scroll');
	assert.equal(stuck(), true);
	assert.equal(toTop.hidden, false);

	// 押すと先頭へ戻る
	await toTop.click();
	assert.equal(scrollTarget.scrollTop, 0);
});

test('scrollTarget が無ければ「上部へ」は作らない', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	assert.equal(find(container, '.to-top'), null);
});

test('dispose すると scrollTarget の購読を解く', async () => {
	const container = fakeElement('div');
	const scrollTarget = fakeElement('div');
	scrollTarget.scrollTop = 0;
	const comments = createComments({
		doc: loggedInDoc(),
		container,
		scrollTarget,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);
	assert.equal(scrollTarget.listeners.scroll.length, 1);
	comments.dispose();
	assert.equal(scrollTarget.listeners.scroll.length, 0);
});

test('見出しは上端に届いたら貼り付いたと見なす', () => {
	// スクロール領域の上端より下にいる間は貼り付いていない
	assert.equal(isHeadingStuck(431, 0), false);
	// 上端に並んだら貼り付き。端数で 1px 足らずずれても点滅させない
	assert.equal(isHeadingStuck(0, 0), true);
	assert.equal(isHeadingStuck(0.6, 0), true);
	// 区画ごと通り過ぎて上へ出た後も貼り付き扱い (画面外なので線は見えない)
	assert.equal(isHeadingStuck(-120, 0), true);
	// スクロール領域が画面の上端に無いときも基準は領域側
	assert.equal(isHeadingStuck(60, 60), true);
	assert.equal(isHeadingStuck(90, 60), false);
});

test('開いた直後の見出しを貼り付き扱いにしない', async () => {
	const doc = measurableDoc(() => 200);
	const container = fakeElement('div');
	const scrollTarget = fakeElement('div');
	scrollTarget.scrollTop = 0;
	scrollTarget.getBoundingClientRect = () => ({ top: 0, height: 861, bottom: 861 });

	const comments = createComments({
		doc,
		container,
		scrollTarget,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);

	// 入れ物を作った時点で測ると位置が全て 0 になり、上端に並んでいることになってしまう。
	// container へ入れてから測ること
	assert.equal(find(container, '.comments-header').className.includes('is-stuck'), false);
});

test('返信の失敗表示は 1 つだけで、読み直せたら消す', async () => {
	let fail = true;
	const { container, comments } = build(async (url) => {
		if (!url.includes('replies')) return { comments: [ROOT], hasNext: false };
		if (fail) throw new Error('落ちた');
		return { comments: [REPLY], hasNext: false };
	});
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	await toggle.click();
	await toggle.click();
	// 2 回失敗しても積み上げない
	assert.equal(findAll(container, '.reply-error').length, 1);
	fail = false;
	await toggle.click();
	assert.equal(findAll(container, '.reply-error').length, 0);
	assert.equal(find(container, '.comment-reply-list').children.length, 1);
});

test('返信を畳んだら失敗の表示も消す', async () => {
	let fail = true;
	const { container, comments } = build(async (url) => {
		if (!url.includes('replies')) return { comments: [ROOT], hasNext: false };
		if (fail) throw new Error('落ちた');
		return { comments: [REPLY], hasNext: true };
	});
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	await toggle.click();
	assert.equal(findAll(container, '.reply-error').length, 1);
	// 開き直して読めたあと畳む
	fail = false;
	await toggle.click();
	assert.equal(findAll(container, '.reply-error').length, 0);
	await toggle.click();
	assert.equal(find(container, '.comment-replies-area'), null);
	assert.equal(findAll(container, '.reply-error').length, 0);
});

test('2 ページ目以降の返信に失敗しても、見えている返信は残して再試行にする', async () => {
	// 1 ページ目が見えているのに「返信を表示」へ戻すと、開いていないのに返信が出ている状態になる
	let failNext = true;
	const { container, comments } = build(async (url) => {
		if (!url.includes('replies')) return { comments: [ROOT], hasNext: false };
		if (url.includes('page=1')) return { comments: [REPLY], hasNext: true };
		if (failNext) throw new Error('落ちた');
		return { comments: [{ ...REPLY, id: '233573601' }], hasNext: false };
	});
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	await toggle.click();
	const more = find(container, '.reply-more');
	await more.click();
	assert.equal(find(container, '.comment-reply-list').children.length, 1);
	assert.equal(toggle.getAttribute('aria-expanded'), 'true');
	assert.equal(toggle.children[1].textContent, '返信を隠す');
	assert.equal(more.textContent, '再試行');
	assert.equal(more.disabled, false);
	assert.equal(find(container, '.reply-error').textContent, '返信を読み込めませんでした');
	// 押し直せば同じページから読み直し、文言を戻す
	failNext = false;
	await more.click();
	assert.equal(find(container, '.comment-reply-list').children.length, 2);
	assert.equal(find(container, '.reply-error'), null);
	assert.equal(find(container, '.reply-more'), null);
});

test('キーボードで押した返信ボタンへ読み込み後にフォーカスを戻す', async () => {
	// disabled にした瞬間にフォーカスが body へ落ち、Tab の起点を失う
	const doc = loggedInDoc();
	const container = fakeElement('div');
	const comments = createComments({
		doc,
		container,
		fetchJson: async (url) => (url.includes('replies')
			? { comments: [REPLY], hasNext: true }
			: { comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	toggle.focus();
	await toggle.click();
	assert.equal(toggle.focused, true);

	const more = find(container, '.reply-more');
	more.focus();
	await more.click();
	assert.equal(more.focused, true);
});

test('フォーカスが無いボタンには読み込み後もフォーカスを移さない', async () => {
	// マウスで押した人の画面を勝手にスクロールさせない
	const doc = loggedInDoc();
	const container = fakeElement('div');
	const comments = createComments({
		doc,
		container,
		fetchJson: async (url) => (url.includes('replies')
			? { comments: [REPLY], hasNext: false }
			: { comments: [ROOT], hasNext: true }),
	});
	await comments.load(DETAIL);
	const toggle = find(container, '.comment-replies');
	await toggle.click();
	assert.equal(toggle.focused, false);
	const more = find(container, '.more');
	await more.click();
	assert.equal(more.focused, false);
});

test('「もっと見る」をキーボードで押したら読み込み後にフォーカスを戻す', async () => {
	const doc = loggedInDoc();
	const container = fakeElement('div');
	let page = 0;
	const comments = createComments({
		doc,
		container,
		fetchJson: async () => {
			page += 1;
			return { comments: [{ ...ROOT, id: String(page), hasReplies: false }], hasNext: page < 3 };
		},
	});
	await comments.load(DETAIL);
	const more = find(container, '.more');
	more.focus();
	await more.click();
	assert.equal(more.focused, true);
});

test('load を呼び直すと前の作品の一覧へは追記しない', async () => {
	let release;
	const { container, comments } = build((url) => {
		if (url.includes('offset=0')) {
			return new Promise((resolve) => { release = resolve; });
		}
		return Promise.resolve({ comments: [ROOT], hasNext: false });
	});
	// 1 回目は応答を止めておく
	const first = comments.load(DETAIL);
	const firstList = find(container, '.comment-list');
	// 2 回目 (同じ作品を描き直す) は即座に応答する
	const releaseFirst = release;
	const second = comments.load(DETAIL);
	releaseFirst({ comments: [ROOT, { ...ROOT, id: '2' }], hasNext: false });
	release({ comments: [ROOT], hasNext: false });
	await Promise.all([first, second]);
	// 1 回目の応答 (2 件) は捨てられ、2 回目の 1 件だけが今の一覧にある
	const list = find(container, '.comment-list');
	assert.notEqual(list, firstList);
	assert.equal(list.children.length, 1);
});

test('文字が見えている「上部へ」に title を重ねない', async () => {
	const container = fakeElement('div');
	const scrollTarget = fakeElement('div');
	scrollTarget.scrollTop = 0;
	const comments = createComments({
		doc: loggedInDoc(),
		container,
		scrollTarget,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);
	const toTop = find(container, '.to-top');
	assert.equal(toTop.title, '');
	assert.equal(toTop.children[1].textContent, '上部へ');
});

test('見出しと入力欄を 1 つの header にまとめる', async () => {
	// 「サイドバーごと送る」設定で一緒に上端へ貼り付かせるため、同じ入れ物に入れる
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	assert.deepEqual(container.children.map((child) => child.className), ['comments-header', 'comment-scroll']);
	const header = container.children[0];
	assert.deepEqual(header.children.map((child) => child.className), ['comments-heading', 'comment-form']);
});

test('コメントを投稿すると作者 ID 付きで送られる', async () => {
	const { container, comments, posted } = buildPostable();
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');
	// illustId / authorUserId / text / parentId
	assert.deepEqual(posted[0], ['comment', '149425016', '54734418', 'いいですね', null]);
});

test('スタンプを選んで投稿するとスタンプとして送られる', async () => {
	const { container, comments, posted } = buildPostable();
	await comments.load(POST_DETAIL);
	const form = find(find(container, '.comments-header'), '.comment-form');
	await find(form, '.comment-form-pick').click();
	// 2 つ目のタブがスタンプ
	await findAll(form, '.comment-picker-tab')[1].click();
	await find(form, '.comment-picker-grid').children[0].click();
	await find(form, '.comment-form-submit').click();
	await flush();
	assert.deepEqual(posted[0], ['stamp', '149425016', '54734418', stampIds()[0], null]);
});

test('投稿できたコメントを一覧の先頭へ差し込む', async () => {
	// 取り直すと offset がずれ、読み進めた位置も飛ぶ
	let notified = 0;
	const { container, comments } = buildPostable({ onPosted: () => { notified += 1; } });
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');

	const list = find(container, '.comment-list');
	assert.equal(list.children.length, 2);
	const first = list.children[0];
	assert.equal(find(first, '.comment-name').textContent, '自分');
	assert.equal(find(first, '.comment-text').textContent, 'いいですね');
	// 投稿直後に返信は無いので、開閉ボタンは隠しておく (一覧と同じ規則)
	assert.equal(find(first, '.comment-replies').hidden, true);
	// 件数を +1 する側へ 1 回だけ伝える
	assert.equal(notified, 1);
});

test('投稿できたら入力欄を空に戻す', async () => {
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');
	assert.equal(find(container, '.comment-form-input').value, '');
});

test('投稿に失敗しても書きかけは消さない', async () => {
	let notified = 0;
	const { container, comments } = buildPostable({
		onPosted: () => { notified += 1; },
		actions: {
			postComment: async () => { throw new Error('落ちた'); },
			postStamp: async () => { throw new Error('落ちた'); },
		},
	});
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');
	assert.equal(find(container, '.comment-form-input').value, 'いいですね');
	assert.equal(find(container, '.comment-form-error').textContent, 'コメントを投稿できませんでした');
	// 一覧は元のまま。失敗で 1 件増やさない
	assert.equal(find(container, '.comment-list').children.length, 1);
	// 差し込んでいないので、件数を増やす側へも知らせない
	assert.equal(notified, 0);
});

test('投稿したスタンプは一覧へ画像として差し込まれる', async () => {
	// 送る値だけでなく、差し込んだ 1 件が画像として描かれることまで見る
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	const form = find(find(container, '.comments-header'), '.comment-form');
	await find(form, '.comment-form-pick').click();
	// 2 つ目のタブがスタンプ
	await findAll(form, '.comment-picker-tab')[1].click();
	await find(form, '.comment-picker-grid').children[0].click();
	await find(form, '.comment-form-submit').click();
	await flush();
	const first = find(container, '.comment-list').children[0];
	assert.equal(find(first, '.comment-stamp') !== null, true);
});

test('ログインが切れていたら再読み込みまで案内する', async () => {
	// 401 は別タブでログアウトした等。__NEXT_DATA__ は SPA 遷移で変わらないので読み直させる
	const { container, comments } = buildPostable({
		actions: {
			postComment: async () => { throw new PixivError(PIXIV_ERROR_KINDS.UNAUTHORIZED, 'unauthorized', 401); },
			postStamp: async () => { throw new Error('落ちた'); },
		},
	});
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');
	assert.equal(
		find(container, '.comment-form-error').textContent,
		'ログインが切れています。pixiv にログインし直し、このページを再読み込みしてください',
	);
});

/**
 * 投稿の応答を待たせたまま load() を呼び直し、応答を返す。
 * @param {object} nextDetail 呼び直すときの作品詳細
 * @returns {Promise<{container: object, notified: number}>} 描画先と onPosted が呼ばれた回数
 */
async function postThenReload(nextDetail) {
	let release;
	let notified = 0;
	const container = fakeElement('div');
	const comments = createComments({
		doc: loggedInDoc(),
		container,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
		actions: {
			postComment: () => new Promise((resolve) => { release = resolve; }),
			postStamp: async () => ({}),
		},
		onPosted: () => { notified += 1; },
	});
	await comments.load(POST_DETAIL);
	const input = find(container, '.comment-form-input');
	input.value = 'いいですね';
	await input.dispatch('input', {});
	// 応答を待たせたまま描き直す
	void find(container, '.comment-form-submit').click();
	await comments.load(nextDetail);
	release({ id: '900', userId: '99', userName: '自分', text: 'いいですね', stampId: null });
	await flush();
	return { container, notified };
}

test('投稿を待っている間に別の作品へ移ったら画面へは足さない', async () => {
	// 投稿自体は通っているが、今見ている作品の一覧に別の作品のコメントを混ぜない
	const { container, notified } = await postThenReload({ ...POST_DETAIL, id: '149425017' });
	assert.equal(find(container, '.comment-list').children.length, 1);
	assert.equal(notified, 0);
});

test('投稿を待っている間に同じ作品を描き直したら画面へは足さない', async () => {
	// 作品が同じだと workId では気付けない。一覧そのものも世代の印にする (loadMore() と同じ)。
	// 気付かないと組み直した一覧へ差し込まれ、件数も二重に増える
	const { container, notified } = await postThenReload(POST_DETAIL);
	assert.equal(find(container, '.comment-list').children.length, 1);
	assert.equal(notified, 0);
});

test('コメントを受け付けていない作品には入力欄を出さない', async () => {
	const { container, comments } = buildPostable();
	await comments.load({ ...POST_DETAIL, commentOff: true });
	assert.equal(find(container, '.comment-form'), null);
});

test('未ログインなら入力欄の代わりに案内を出す', async () => {
	clearSessionCache();
	const container = fakeElement('div');
	const comments = createComments({
		doc: fakeDoc({ nextData: buildNextData({ isLoggedIn: false, token: '' }) }),
		container,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	assert.equal(find(container, '.comment-form'), null);
	assert.equal(find(find(container, '.comments-header'), '.status').textContent, 'ログインするとコメントできます');
});

test('未ログインでもコメントを受け付けていない作品では案内を重ねない', async () => {
	// 「ログインすれば書ける」と「受け付けていない」が並ぶと、どちらが理由か読めなくなる
	clearSessionCache();
	const container = fakeElement('div');
	const comments = createComments({
		doc: fakeDoc({ nextData: buildNextData({ isLoggedIn: false, token: '' }) }),
		container,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load({ ...POST_DETAIL, commentOff: true });
	assert.deepEqual(
		findAll(container, '.status').map((status) => status.textContent),
		['この作品はコメントを受け付けていません'],
	);
});

test('書きかけがあるうちは Escape をビュワーへ渡さない', async () => {
	// Escape で閉じると打った本文が消える
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	const input = find(container, '.comment-form-input');
	input.focus();
	assert.equal(comments.consumeKey({ key: 'Escape' }), false);

	input.value = '書きかけ';
	await input.dispatch('input', {});
	assert.equal(comments.consumeKey({ key: 'Escape' }), true);

	// ピッカーが開いていれば、先にそちらを閉じる
	await find(container, '.comment-form-pick').click();
	assert.equal(comments.consumeKey({ key: 'Escape' }), true);
	assert.equal(find(container, '.comment-picker'), null);
});

test('投稿した時刻を一覧の日時と同じ形にする', () => {
	// 応答に日時は入らないので手元の時計を使う。桁は一覧に合わせて 0 で埋める
	assert.equal(formatPostedDate(new Date(2026, 8, 20, 9, 5)), '2026-09-20 09:05');
	assert.equal(formatPostedDate(new Date(2026, 11, 31, 23, 59)), '2026-12-31 23:59');
});

test('投稿には CSRF トークンを渡す', async () => {
	// トークンが欠けると pixiv 側が 403 を返す。押された時点のセッションから読めているかを見る
	const { container, comments, tokens } = buildPostable();
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');
	assert.deepEqual(tokens, ['csrf-token']);
});

test('返信ボタンは「返信を表示」の左に並ぶ', async () => {
	// 返信を書く導線が左端、返信を読む導線がその隣、日時が右端
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	const meta = find(container, '.comment-meta');
	assert.deepEqual(meta.children.map((child) => child.className), [
		'comment-reply-toggle', 'comment-replies-slot', 'comment-date',
	]);
	assert.equal(meta.children[0].textContent, '返信');
	assert.equal(meta.children[0].type, 'button');
});

test('返信ボタンは押すたびに入力欄を出し入れする', async () => {
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	const item = find(container, '.comment-item');
	const toggle = find(item, '.comment-reply-toggle');
	assert.equal(toggle.getAttribute('aria-expanded'), 'false');

	await toggle.click();
	assert.equal(toggle.getAttribute('aria-expanded'), 'true');
	assert.deepEqual(find(item, '.comment-body').children.map((child) => child.className), [
		'comment-name', 'comment-text', 'comment-meta', 'comment-form',
	]);

	await toggle.click();
	assert.equal(toggle.getAttribute('aria-expanded'), 'false');
	// 畳んだら DOM ごと捨てる。開きっぱなしの入力欄を積み上げない
	assert.equal(replyForm(item), null);
});

test('返信の入力欄は返信一覧より前に出す', async () => {
	// pixiv 本体と同じ位置。返信の下に出すと、返信が多いほど遠くなる
	const { container, comments } = buildPostable({
		fetchJson: async (url) => (url.includes('replies')
			? { comments: [REPLY], hasNext: false }
			: { comments: [ROOT], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	const item = find(container, '.comment-item');
	await find(item, '.comment-replies').click();
	await flush();
	await find(item, '.comment-reply-toggle').click();
	assert.deepEqual(find(item, '.comment-body').children.map((child) => child.className), [
		'comment-name', 'comment-text', 'comment-meta', 'comment-form', 'comment-replies-area',
	]);
});

test('返信は parent_id 付きで送られる', async () => {
	const { container, comments, posted } = buildPostable();
	await comments.load(POST_DETAIL);
	const item = find(container, '.comment-item');
	await find(item, '.comment-reply-toggle').click();
	await submitText(replyForm(item), 'ありがとう');
	// illustId / authorUserId / text / parentId
	assert.deepEqual(posted[0], ['comment', '149425016', '54734418', 'ありがとう', ROOT.id]);
});

test('返信できたら開いている返信一覧の末尾へ足す', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async (url) => (url.includes('replies')
			? { comments: [REPLY], hasNext: false }
			: { comments: [ROOT], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	const item = find(container, '.comment-item');
	await find(item, '.comment-replies').click();
	await flush();
	await find(item, '.comment-reply-toggle').click();
	await submitText(replyForm(item), 'ありがとう');

	const replies = find(item, '.comment-reply-list');
	assert.equal(replies.children.length, 2);
	assert.equal(find(replies.children[1], '.comment-text').textContent, 'ありがとう');
	// 返信に返信は付けられない (pixiv 側も入れ子は 1 段まで)
	assert.equal(find(replies.children[1], '.comment-reply-toggle'), null);
});

test('返信が無かったコメントも返信できたら「返信を表示」を出す', async () => {
	// 畳んだままなら足さずにボタンだけ出す。開けば取り直されるので二重にならない
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, hasReplies: false }], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	const item = find(container, '.comment-item');
	assert.equal(find(item, '.comment-replies').hidden, true);

	await find(item, '.comment-reply-toggle').click();
	await submitText(replyForm(item), 'ありがとう');
	assert.equal(find(item, '.comment-replies').hidden, false);
	assert.equal(find(item, '.comment-reply-list'), null);
});

test('返信コメントには返信ボタンを付けない', async () => {
	// pixiv 側も入れ子は 1 段まで
	const { container, comments } = buildPostable({
		fetchJson: async (url) => (url.includes('replies')
			? { comments: [REPLY], hasNext: false }
			: { comments: [ROOT], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	await find(container, '.comment-replies').click();
	await flush();
	const reply = find(find(container, '.comment-reply-list'), '.comment-item');
	assert.equal(find(reply, '.comment-reply-toggle'), null);
});

test('未ログインでは返信ボタンを出さない', async () => {
	clearSessionCache();
	const container = fakeElement('div');
	const comments = createComments({
		doc: fakeDoc({ nextData: buildNextData({ isLoggedIn: false, token: '' }) }),
		container,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	assert.equal(find(container, '.comment-reply-toggle'), null);
	// 返信を読む導線は未ログインでも残す
	assert.equal(find(container, '.comment-replies').hidden, false);
});

test('返信欄を閉じたら書きかけごと捨てて Escape を渡す', async () => {
	// 閉じた入力欄が残っていると、見えない書きかけが Escape を食い止め続ける
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	const item = find(container, '.comment-item');
	const toggle = find(item, '.comment-reply-toggle');
	await toggle.click();
	const input = find(replyForm(item), '.comment-form-input');
	await input.dispatch('focus', {});
	input.value = '書きかけ';
	await input.dispatch('input', {});
	assert.equal(comments.consumeKey({ key: 'Escape' }), true);

	await toggle.click();
	assert.equal(comments.consumeKey({ key: 'Escape' }), false);
	// disabled と同じ理由。消えた入力欄にフォーカスを残さず、押したボタンへ戻す
	assert.equal(toggle.focused, true);
});

test('投稿できたコメントにも返信の導線を付ける', async () => {
	// 一覧から読んだ 1 件と同じ形にする。付けないと描き直すまでその 1 件にだけ返信できない
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'いいですね');
	const first = find(container, '.comment-list').children[0];
	assert.equal(find(first, '.comment-reply-toggle').textContent, '返信');
	await find(first, '.comment-reply-toggle').click();
	assert.ok(replyForm(first));
});

test('0 件の作品へ投稿した 1 件も一覧に出す', async () => {
	// 一覧を作るのは load() だけだったので、0 件の作品では投稿の 1 件が黙って捨てられていた
	const { container, comments } = buildPostable();
	await comments.load({ ...POST_DETAIL, commentCount: 0 });
	assert.equal(find(container, '.status').textContent, 'まだコメントはありません');

	await submitText(find(find(container, '.comments-header'), '.comment-form'), 'はじめまして');
	// 1 件入ったら「まだコメントはありません」は嘘になる
	assert.equal(find(container, '.status'), null);
	const items = findAll(find(container, '.comment-list'), '.comment-item');
	assert.equal(items.length, 1);
	assert.equal(find(items[0], '.comment-text').textContent, 'はじめまして');
	// 一覧から読んだ 1 件と同じ導線が付く
	assert.equal(find(items[0], '.comment-reply-toggle').textContent, '返信');
	await find(items[0], '.comment-reply-toggle').click();
	assert.ok(replyForm(items[0]));
});

test('0 件だった作品でも 2 件目は 1 件目の上に入る', async () => {
	const { container, comments } = buildPostable();
	await comments.load({ ...POST_DETAIL, commentCount: 0 });
	const form = find(find(container, '.comments-header'), '.comment-form');
	await submitText(form, '1 件目');
	await submitText(form, '2 件目');
	assert.deepEqual(
		find(container, '.comment-list').children.map((item) => find(item, '.comment-text').textContent),
		['2 件目', '1 件目'],
	);
});

test('投稿していない 0 件の作品には一覧を作らない', async () => {
	const { container, comments } = buildPostable();
	await comments.load({ ...POST_DETAIL, commentCount: 0 });
	assert.deepEqual(container.children.map((child) => child.className), ['comments-header', 'status']);
	assert.equal(find(container, '.comment-list'), null);
});

test('コメントを受け付けていない作品には一覧も入力欄も作らない', async () => {
	const { container, comments } = buildPostable();
	await comments.load({ ...POST_DETAIL, commentOff: true, commentCount: 0 });
	assert.deepEqual(container.children.map((child) => child.className), ['comments-header', 'status']);
	assert.equal(find(container, '.comment-form'), null);
	assert.equal(find(container, '.comment-list'), null);
	assert.equal(find(container, '.status').textContent, 'この作品はコメントを受け付けていません');
});

test('コメントは削除できるかを持ち回る', () => {
	// editable は一覧 API が付けてくる。自分のコメントと自分の作品のコメントで true (SITE_SPEC §4)
	assert.equal(normalizeComment({ id: '1', comment: 'a', commentDate: '', editable: true }).editable, true);
	assert.equal(normalizeComment({ id: '1', comment: 'a', commentDate: '' }).editable, false);
});

test('投稿者のラベルは自分が最優先', () => {
	// 自分の作品に自分でコメントすると両方に当てはまる。pixiv 本体は「あなた」を出す (実測)
	assert.equal(commentLabel({ userId: '99' }, '99', '99'), 'あなた');
	assert.equal(commentLabel({ userId: '99' }, '99', '54734418'), 'あなた');
	assert.equal(commentLabel({ userId: '54734418' }, '99', '54734418'), '作者');
	assert.equal(commentLabel({ userId: '92064764' }, '99', '54734418'), null);
});

test('ラベルは ID が欠けていたら出さない', () => {
	// 空文字どうしが一致して、無関係なコメントに「あなた」が付くのを防ぐ
	assert.equal(commentLabel({ userId: '' }, '', ''), null);
	assert.equal(commentLabel({ userId: '99' }, null, null), null);
});

test('自分のコメントには「あなた」、作者には「作者」が名前の後ろに付く', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async () => ({
			comments: [
				{ ...ROOT, id: 'a', userId: '99', userName: '自分', hasReplies: false },
				{ ...ROOT, id: 'b', userId: '54734418', userName: '作者さん', hasReplies: false },
				{ ...ROOT, id: 'c', hasReplies: false },
			],
			hasNext: false,
		}),
	});
	await comments.load(POST_DETAIL);
	const items = findAll(container, '.comment-item');
	assert.deepEqual(items.map((one) => find(one, '.comment-label')?.textContent ?? null), ['あなた', '作者', null]);
	// 名前のすぐ後ろに置く (pixiv 本体と同じ並び)
	const body = find(items[0], '.comment-body');
	assert.deepEqual(body.children.slice(0, 2).map((child) => child.className), ['comment-name', 'comment-label is-self']);
});

test('削除できるコメントにだけ削除ボタンを出す', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async () => ({
			comments: [
				{ ...ROOT, id: 'a', editable: true, hasReplies: false },
				{ ...ROOT, id: 'b', hasReplies: false },
			],
			hasNext: false,
		}),
	});
	await comments.load(POST_DETAIL);
	const items = findAll(container, '.comment-item');
	assert.ok(find(items[0], '.comment-delete'));
	assert.equal(find(items[1], '.comment-delete'), null);
});

test('下段の並びは 返信・削除・返信を表示・日時', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, editable: true }], hasNext: false }),
	});
	await comments.load(POST_DETAIL);
	assert.deepEqual(find(container, '.comment-meta').children.map((child) => child.className), [
		'comment-reply-toggle', 'comment-delete', 'comment-replies-slot', 'comment-date',
	]);
});

test('削除は一度目で確認に変わり、二度目で実行する', async () => {
	const removed = [];
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false }),
		actions: { deleteComment: async (...args) => { removed.push(args.slice(0, 3)); } },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	assert.equal(button.textContent, '削除');
	await button.click();
	// 取り消せない操作なので、一度目では消さずに聞き返す
	assert.deepEqual(removed, []);
	assert.equal(button.textContent, '本当に削除？');
	await button.click();
	await flush();
	assert.deepEqual(removed, [['149425016', '233573595', 'csrf-token']]);
});

test('確認中にフォーカスが外れたら元に戻す', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false }),
		actions: { deleteComment: async () => {} },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	assert.equal(button.textContent, '本当に削除？');
	await button.dispatch('blur', {});
	assert.equal(button.textContent, '削除');
});

test('削除できたら一覧から外して件数を数え直す', async () => {
	let delta = null;
	const { container, comments } = buildPostable({
		fetchJson: async (url) => (url.includes('/ajax/illust/')
			// ルートを消すと返信も道連れになるので、件数は引き直した値で置き換える
			? { commentCount: 7 }
			: {
				comments: [
					{ ...ROOT, id: 'a', editable: true, hasReplies: false },
					{ ...ROOT, id: 'b', hasReplies: false },
				],
				hasNext: false,
			}),
		actions: { deleteComment: async () => {} },
		onDeleted: (count) => { delta = count; },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	await button.click();
	await flush();
	assert.equal(findAll(container, '.comment-item').length, 1);
	assert.equal(delta, 7);
});

test('削除に失敗したら行を残して知らせる', async () => {
	let delta = 'よばれていない';
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false }),
		actions: { deleteComment: async () => { throw new Error('失敗'); } },
		onDeleted: (count) => { delta = count; },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	await button.click();
	await flush();
	// 消せていないのに画面から消すと、読み直したときに戻ってくる
	assert.equal(findAll(container, '.comment-item').length, 1);
	assert.equal(delta, 'よばれていない');
	const error = find(container, '.comment-error');
	assert.equal(error.getAttribute('role'), 'alert');
	assert.equal(error.textContent, 'コメントを削除できませんでした');
	// 押し直せるように文言を戻す
	assert.equal(button.textContent, '削除');
});

test('投稿した直後の 1 件も自分で消せる', async () => {
	const { container, comments } = buildPostable();
	await comments.load(POST_DETAIL);
	const form = find(find(container, '.comments-header'), '.comment-form');
	const input = find(form, '.comment-form-input');
	input.value = 'あ';
	await input.dispatch('input', {});
	await find(form, '.comment-form-submit').click();
	await flush();
	const first = find(container, '.comment-list').children[0];
	assert.ok(find(first, '.comment-delete'));
	assert.equal(find(first, '.comment-label').textContent, 'あなた');
});

test('返信も削除できる', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async (url) => (url.includes('replies')
			? { comments: [{ ...REPLY, editable: true }], hasNext: false }
			: { comments: [ROOT], hasNext: false }),
		actions: { deleteComment: async () => {} },
	});
	await comments.load(POST_DETAIL);
	await find(container, '.comment-replies').click();
	await flush();
	const reply = find(container, '.comment-reply-list');
	assert.ok(find(reply, '.comment-delete'));
});

test('最後の 1 件を消したら空の案内へ戻す', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async (url) => (url.includes('/ajax/illust/')
			? { commentCount: 0 }
			: { comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false }),
		actions: { deleteComment: async () => {} },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	await button.click();
	await flush();
	// 見出しだけが残ると、読み込みに失敗したように見える
	assert.equal(find(container, '.status').textContent, 'まだコメントはありません');
});

test('削除に失敗したら押したボタンへフォーカスを戻す', async () => {
	// disabled にした時点でフォーカスが body へ落ちる。戻さないと押し直せない
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false }),
		actions: { deleteComment: async () => { throw new Error('失敗'); } },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	await button.click();
	await flush();
	assert.equal(button.focused, true);
});

test('Escape は削除の聞き返しだけを畳んでビュワーへ渡さない', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async () => ({ comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false }),
		actions: { deleteComment: async () => {} },
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	assert.equal(comments.consumeKey({ key: 'Escape' }), true);
	assert.equal(button.textContent, '削除');
	// 畳んだあとの Escape はビュワーに渡す
	assert.equal(comments.consumeKey({ key: 'Escape' }), false);
});

test('聞き返しは同時に 1 つだけ', async () => {
	const { container, comments } = buildPostable({
		fetchJson: async () => ({
			comments: [
				{ ...ROOT, id: 'a', editable: true, hasReplies: false },
				{ ...ROOT, id: 'b', editable: true, hasReplies: false },
			],
			hasNext: false,
		}),
		actions: { deleteComment: async () => {} },
	});
	await comments.load(POST_DETAIL);
	const buttons = findAll(container, '.comment-delete');
	await buttons[0].click();
	await buttons[1].click();
	// 前の聞き返しを残すと、別のコメントを消すつもりで押し直したときに誤爆する
	assert.equal(buttons[0].textContent, '削除');
	assert.equal(buttons[1].textContent, '本当に削除？');
});

test('返信を消すと返信一覧から外れ、読み込み済みの件数は動かない', async () => {
	const removed = [];
	const { container, comments } = buildPostable({
		fetchJson: async (url) => {
			if (url.includes('/ajax/illust/')) return { commentCount: 5 };
			if (url.includes('replies')) return { comments: [{ ...REPLY, editable: true }], hasNext: false };
			return { comments: [ROOT], hasNext: false };
		},
		actions: { deleteComment: async (...args) => { removed.push(args[1]); } },
	});
	await comments.load(POST_DETAIL);
	await find(container, '.comment-replies').click();
	await flush();
	const button = find(find(container, '.comment-reply-list'), '.comment-delete');
	await button.click();
	await button.click();
	await flush();
	assert.deepEqual(removed, [REPLY.id]);
	assert.equal(find(container, '.comment-reply-list').children.length, 0);
	// ルートは消えていないので一覧はそのまま
	assert.equal(findAll(container, '.comment-list').length, 1);
});

test('件数の数え直しはブラウザのキャッシュを外して引く', async () => {
	// 作品を開いた時点で同じ URL を引いているので、素で引き直すと削除前の件数が返る
	const urls = [];
	const { container, comments } = buildPostable({
		fetchJson: async (url) => {
			urls.push(url);
			return url.includes('/ajax/illust/')
				? { commentCount: 0 }
				: { comments: [{ ...ROOT, editable: true, hasReplies: false }], hasNext: false };
		},
		actions: { deleteComment: async () => {} },
		// 受け手がいないと数え直しごと省かれる (?.() は引数も評価しない)
		onDeleted: () => {},
	});
	await comments.load(POST_DETAIL);
	const button = find(container, '.comment-delete');
	await button.click();
	await button.click();
	await flush();
	const counted = urls.find((url) => url.includes('/ajax/illust/'));
	assert.match(counted, /[?&]_=\d+/);
});

test('「あなた」のラベルだけ印を付けて色を分ける', async () => {
	// pixiv 本体は「あなた」が緑、「作者」が青 (実測)。地の色は CSS が is-self で切り替える
	const { container, comments } = buildPostable({
		fetchJson: async () => ({
			comments: [
				{ ...ROOT, id: 'a', userId: '99', userName: '自分', hasReplies: false },
				{ ...ROOT, id: 'b', userId: '54734418', userName: '作者さん', hasReplies: false },
			],
			hasNext: false,
		}),
	});
	await comments.load(POST_DETAIL);
	const labels = findAll(container, '.comment-label');
	assert.deepEqual(labels.map((one) => one.textContent), ['あなた', '作者']);
	assert.equal(labels[0].classList.contains('is-self'), true);
	assert.equal(labels[1].classList.contains('is-self'), false);
});
