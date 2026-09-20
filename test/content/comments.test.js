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
		isDeleted: false,
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

/**
 * 位置を測れる document の代わりを作る。
 * 本物と同じく、親に入るまでは全て 0 を返す。
 * @param {() => number} headingTop 親に入った後の見出しの上端
 * @returns {object} doc の代わり
 */
function measurableDoc(headingTop) {
	const doc = fakeDoc();
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
	const heading = find(container, '.comments-heading');
	const stuck = () => heading.className.includes('is-stuck');

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

	// 見出しを作った時点で測ると位置が全て 0 になり、上端に並んでいることになってしまう。
	// container へ入れてから測ること
	assert.equal(find(container, '.comments-heading').className.includes('is-stuck'), false);
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
	const doc = fakeDoc();
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
	doc.activeElement = toggle;
	await toggle.click();
	assert.equal(toggle.focused, true);

	const more = find(container, '.reply-more');
	doc.activeElement = more;
	await more.click();
	assert.equal(more.focused, true);
});

test('フォーカスが無いボタンには読み込み後もフォーカスを移さない', async () => {
	// マウスで押した人の画面を勝手にスクロールさせない
	const doc = fakeDoc();
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
	doc.activeElement = null;
	await toggle.click();
	assert.equal(toggle.focused, false);
	const more = find(container, '.more');
	await more.click();
	assert.equal(more.focused, false);
});

test('「もっと見る」をキーボードで押したら読み込み後にフォーカスを戻す', async () => {
	const doc = fakeDoc();
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
	doc.activeElement = more;
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
		doc: fakeDoc(),
		container,
		scrollTarget,
		fetchJson: async () => ({ comments: [ROOT], hasNext: false }),
	});
	await comments.load(DETAIL);
	const toTop = find(container, '.to-top');
	assert.equal(toTop.title, '');
	assert.equal(toTop.children[1].textContent, '上部へ');
});
