import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComment, renderCommentText, renderStamp, createComments, commentsFloorHeight, isHeadingStuck } from '../../src/content/viewer/comments.js';
import { fakeElement, fakeDoc, find, findAll, iconName, flush } from '../helpers/dom.js';

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

/**
 * コメント区画を組み立てる。
 * @param {(url: string) => Promise<object>} fetchJson 取得の差し替え
 * @returns {{container: object, comments: object}} 描画先とコメント区画
 */
function build(fetchJson) {
	const container = fakeElement('div');
	const comments = createComments({ doc: fakeDoc(), container, fetchJson });
	return { container, comments };
}

test('「もっと見る」はスクロールする領域の中、一覧の後ろに置く', async () => {
	// 一番下まで読んだときだけ見えるようにする。外に置くと常に見えて不自然になる
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: true }));
	await comments.load(DETAIL);
	assert.deepEqual(container.children.map((child) => child.className), ['comments-heading', 'comment-scroll']);
	const scroll = container.children[1];
	assert.deepEqual(scroll.children.map((child) => child.className), ['comment-list', 'more']);
	assert.equal(scroll.children[1].hidden, false);
});

test('続きが無ければ「もっと見る」は出さない', async () => {
	const { container, comments } = build(async () => ({ comments: [ROOT], hasNext: false }));
	await comments.load(DETAIL);
	assert.equal(find(container, '.more').hidden, true);
});

test('返信があるコメントだけが返信の開閉ボタンを持つ', async () => {
	const { container, comments } = build(async () => ({
		comments: [ROOT, { ...ROOT, id: '2', hasReplies: false }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	const buttons = findAll(container, '.comment-replies');
	assert.equal(buttons.length, 1);
	assert.equal(buttons[0].tag, 'button');
	assert.equal(buttons[0].children[1].textContent, '返信を表示');
	assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
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
	assert.deepEqual(meta.children.map((child) => child.className), ['comment-replies-slot', 'comment-date']);
	assert.equal(meta.children[0].children[0].className, 'comment-replies');
});

test('返信が無いコメントでも日時は同じ下段に置く', async () => {
	// 返信ボタンの有無で日時の位置が動くと、一覧が揃わない
	const { container, comments } = build(async () => ({
		comments: [{ ...ROOT, hasReplies: false }],
		hasNext: false,
	}));
	await comments.load(DETAIL);
	const meta = find(container, '.comment-meta');
	assert.deepEqual(meta.children.map((child) => child.className), ['comment-replies-slot', 'comment-date']);
	assert.equal(meta.children[0].children.length, 0);
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

test('見出しの「上部へ」は戻れるときだけ出て、押すとサイドバーを先頭へ戻す', async () => {
	const container = fakeElement('div');
	const scrollTarget = fakeElement('div');
	scrollTarget.scrollTop = 0;
	const comments = createComments({
		doc: fakeDoc(),
		container,
		scrollTarget,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);

	// 先頭にいるので戻る先が無い。押しても何も起きないボタンは見せない
	const toTop = find(container, '.to-top');
	assert.equal(toTop.hidden, true);

	// 読み進めたら出す
	scrollTarget.scrollTop = 120;
	await scrollTarget.dispatch('scroll');
	assert.equal(toTop.hidden, false);

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
		doc: fakeDoc(),
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
