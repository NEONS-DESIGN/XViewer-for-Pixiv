import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentForm } from '../../../src/content/viewer/comment-form.js';
import { fakeDoc, find, flush } from '../../helpers/dom.js';
import { createStrings } from '../../../src/i18n/index.js';

/** テストで使う文言のカタログ。日本語の文言は元の MESSAGES と同じ値。 */
const STRINGS = createStrings('ja');

/**
 * 入力欄を作る。
 * @param {object} [options] onSubmit の差し替えなど
 * @returns {object} 入力欄と記録
 */
function build(options = {}) {
	const sent = [];
	const form = createCommentForm({
		doc: fakeDoc(),
		placeholder: 'コメントする',
		onSubmit: options.onSubmit ?? (async (value) => { sent.push(value); }),
		picker: options.picker,
		avatarUrl: options.avatarUrl,
		strings: options.strings ?? STRINGS,
	});
	return { form, sent, element: form.element };
}

/**
 * textarea に文字を入れる。
 * @param {object} element 入力欄
 * @param {string} value 入れる文字
 * @returns {object} textarea
 */
function type(element, value) {
	const input = find(element, '.comment-form-input');
	input.value = value;
	return input;
}

test('空のままでは送信できない', async () => {
	const { element, sent } = build();
	const submit = find(element, '.comment-form-submit');
	assert.equal(submit.disabled, true);
	await submit.click();
	assert.deepEqual(sent, []);
});

test('文字を入れると送信できる', async () => {
	const { element, sent } = build();
	const input = type(element, 'いいですね');
	await input.dispatch('input', {});
	const submit = find(element, '.comment-form-submit');
	assert.equal(submit.disabled, false);
	await submit.click();
	await flush();
	assert.deepEqual(sent, [{ text: 'いいですね', stampId: null }]);
});

test('前後の空白だけなら送信できない', async () => {
	const { element } = build();
	const input = type(element, '   ');
	await input.dispatch('input', {});
	assert.equal(find(element, '.comment-form-submit').disabled, true);
});

test('Ctrl+Enter で送信する', async () => {
	const { element, sent } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await input.dispatch('keydown', { key: 'Enter', ctrlKey: true, preventDefault() {} });
	await flush();
	assert.deepEqual(sent, [{ text: 'あ', stampId: null }]);
});

test('Enter だけでは送信しない', async () => {
	const { element, sent } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await input.dispatch('keydown', { key: 'Enter', ctrlKey: false, preventDefault() {} });
	await flush();
	assert.deepEqual(sent, []);
});

test('変換中の Ctrl+Enter では送らない', async () => {
	const { element, sent } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await input.dispatch('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, preventDefault() {} });
	await flush();
	assert.deepEqual(sent, []);
});

test('送信できたら本文を空にする', async () => {
	const { element } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(input.value, '');
	assert.equal(find(element, '.comment-form-submit').disabled, true);
});

test('失敗したら本文を残してエラーを出す', async () => {
	const { element } = build({ onSubmit: async () => { throw new Error('失敗'); } });
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(input.value, 'あ');
	const error = find(element, '.comment-form-error');
	assert.equal(error.getAttribute('role'), 'alert');
	assert.equal(error.textContent, 'コメントを投稿できませんでした');
});

test('エラーは 1 つだけ。次の送信の前に消える', async () => {
	let fail = true;
	const { element } = build({ onSubmit: async () => { if (fail) throw new Error('失敗'); } });
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await find(element, '.comment-form-submit').click();
	await flush();
	fail = false;
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(find(element, '.comment-form-error'), null);
});

test('送信中は入力とボタンを止める', async () => {
	let release;
	const blocked = new Promise((resolve) => { release = resolve; });
	const { element } = build({ onSubmit: () => blocked });
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	const submit = find(element, '.comment-form-submit');
	const running = submit.click();
	assert.equal(input.disabled, true);
	assert.equal(submit.disabled, true);
	assert.equal(submit.getAttribute('aria-busy'), 'true');
	release();
	await running;
	await flush();
	assert.equal(input.disabled, false);
	assert.equal(submit.getAttribute('aria-busy'), null);
});

test('スタンプを選ぶと確認の表示になり、送信で確定する', async () => {
	const picked = [];
	const picker = {
		open: (_slot, handlers) => { picked.push(handlers); },
		close: () => {},
		isOpen: () => false,
	};
	const { element, sent } = build({ picker });
	await find(element, '.comment-form-pick').click();
	picked[0].onStamp('304');
	// 本文の代わりにスタンプの確認が出て、そのまま送るとスタンプになる
	assert.ok(find(element, '.comment-form-stamp'));
	assert.equal(find(element, '.comment-form-input').hidden, true);
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.deepEqual(sent, [{ text: '', stampId: '304' }]);
	assert.equal(find(element, '.comment-form-stamp'), null);
});

test('選んだスタンプは取り消せる', async () => {
	const picked = [];
	const picker = { open: (_slot, handlers) => { picked.push(handlers); }, close: () => {}, isOpen: () => false };
	const { element } = build({ picker });
	await find(element, '.comment-form-pick').click();
	picked[0].onStamp('304');
	await find(element, '.comment-form-stamp-clear').click();
	assert.equal(find(element, '.comment-form-stamp'), null);
	assert.equal(find(element, '.comment-form-input').hidden, false);
	assert.equal(find(element, '.comment-form-submit').disabled, true);
});

test('絵文字は本文の末尾に入る', async () => {
	const picked = [];
	const picker = { open: (_slot, handlers) => { picked.push(handlers); }, close: () => {}, isOpen: () => false };
	const { element } = build({ picker });
	const input = type(element, 'すき');
	await find(element, '.comment-form-pick').click();
	picked[0].onEmoji('heaven');
	assert.equal(input.value, 'すき(heaven)');
	assert.equal(find(element, '.comment-form-submit').disabled, false);
});

test('入力中の Escape はビュワーへ渡さない', async () => {
	const { form, element } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	input.focus();
	assert.equal(form.consumeKey({ key: 'Escape' }), true);
});

test('空のままならビュワーの Escape を邪魔しない', async () => {
	const { form, element } = build();
	find(element, '.comment-form-input').focus();
	assert.equal(form.consumeKey({ key: 'Escape' }), false);
});

test('フォーカスが外にあるときは Escape を食い止めない', () => {
	const { form, element } = build();
	type(element, 'あ');
	assert.equal(form.consumeKey({ key: 'Escape' }), false);
});

test('スタンプの取り消しボタンにフォーカスがあるときも Escape を食い止める', async () => {
	const picked = [];
	const picker = { open: (_slot, handlers) => { picked.push(handlers); }, close: () => {}, isOpen: () => false };
	const { form, element } = build({ picker });
	await find(element, '.comment-form-pick').click();
	picked[0].onStamp('304');
	find(element, '.comment-form-stamp-clear').focus();
	assert.equal(form.consumeKey({ key: 'Escape' }), true);
});

test('アバターを渡したときだけ左に出す', () => {
	assert.equal(find(build().element, '.comment-form-avatar'), null);
	const withAvatar = build({ avatarUrl: 'https://i.pximg.net/user-profile/img/1_50.jpg' });
	assert.ok(find(withAvatar.element, '.comment-form-avatar'));
});

test('送信が終わったら本文の入力へフォーカスを戻す', async () => {
	// disabled にした瞬間にブラウザがフォーカスを body へ落とす。戻さないと続けて書けない
	const { element } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	input.focus();
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(input.focused, true);
});

test('送信に失敗しても入力へフォーカスを戻し、Escape で書きかけを消させない', async () => {
	// 戻さないと Escape がビュワーまで届き、残したはずの本文ごとモーダルが閉じる
	const { form, element } = build({ onSubmit: async () => { throw new Error('失敗'); } });
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	input.focus();
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(input.focused, true);
	assert.equal(form.consumeKey({ key: 'Escape' }), true);
});

test('スタンプの送信に失敗したら送信ボタンへフォーカスを戻す', async () => {
	// 本文の入力はスタンプを選んでいる間 hidden。隠れた要素には戻せない
	const picked = [];
	const picker = { open: (_slot, handlers) => { picked.push(handlers); }, close: () => {}, isOpen: () => false };
	const { form, element } = build({ picker, onSubmit: async () => { throw new Error('失敗'); } });
	await find(element, '.comment-form-pick').click();
	picked[0].onStamp('304');
	const submit = find(element, '.comment-form-submit');
	submit.focus();
	await submit.click();
	await flush();
	assert.equal(submit.focused, true);
	assert.equal(form.consumeKey({ key: 'Escape' }), true);
});

test('フォーカスが外にあるまま送ったときは奪わない', async () => {
	// マウスで押した人の画面を勝手に動かさない (「もっと見る」と同じ作法)
	const { element } = build();
	const input = type(element, 'あ');
	await input.dispatch('input', {});
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(input.focused, false);
});

test('中身に合わせて高さを測り直す', async () => {
	// 本家と同じく、行が増えたらスクロールではなく入力欄自体が伸びる
	const { element } = build();
	const input = find(element, '.comment-form-input');
	// 一度 auto へ戻してから測らないと、縮むときに前の高さが残る
	const applied = [];
	Object.defineProperty(input, 'scrollHeight', { get: () => 84, configurable: true });
	input.style.height = '';
	await input.dispatch('input', {});
	applied.push(input.style.height);
	assert.deepEqual(applied, ['84px']);
});

test('高さの測り直しは縮むときも効く', async () => {
	const { element } = build();
	const input = find(element, '.comment-form-input');
	let scroll = 84;
	Object.defineProperty(input, 'scrollHeight', { get: () => scroll, configurable: true });
	await input.dispatch('input', {});
	assert.equal(input.style.height, '84px');
	// 消したときに前の高さが残ると、空の入力欄が伸びたままになる
	scroll = 31;
	await input.dispatch('input', {});
	assert.equal(input.style.height, '31px');
});

test('送信できたら高さも元に戻す', async () => {
	const { element } = build();
	const input = find(element, '.comment-form-input');
	let scroll = 84;
	Object.defineProperty(input, 'scrollHeight', { get: () => scroll, configurable: true });
	input.value = 'あ\nい\nう';
	await input.dispatch('input', {});
	assert.equal(input.style.height, '84px');
	scroll = 31;
	await find(element, '.comment-form-submit').click();
	await flush();
	assert.equal(input.style.height, '31px');
});

test('測れない DOM では高さに触らない', async () => {
	// scrollHeight を持たない相手 (テスト用の DOM の既定) で落ちない
	const { element } = build();
	const input = find(element, '.comment-form-input');
	await input.dispatch('input', {});
	assert.equal(input.style.height, undefined);
});

test('英語のカタログでは送信ボタンが英語になる', () => {
	const { element } = build({ strings: createStrings('en') });
	assert.equal(find(element, '.comment-form-submit').textContent, 'Post');
});
