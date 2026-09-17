import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockReason, createBlocked, BLOCK_KINDS } from '../../src/content/viewer/blocked.js';
import { fakeElement, fakeDoc, find } from '../helpers/dom.js';

/** ブロック表示へ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149425016',
	xRestrict: 1,
	urls: { mini: 'https://i.pximg.net/c/48x48/img-master/img/2026/09/10/00/00/00/x_square1200.jpg' },
});

/**
 * ブロック表示を描く。
 * @param {object} detail 作品詳細
 * @param {object} reason 理由
 * @returns {{container: object, pane: object}} 描画先とペイン
 */
function render(detail, reason) {
	const container = fakeElement('div');
	const pane = createBlocked({ doc: fakeDoc(), container });
	pane.render(detail, reason);
	return { container, pane };
}

test('全年齢作品は誰でも見られる', () => {
	assert.equal(blockReason({ xRestrict: 0 }, { isLoggedIn: true, self: { xRestrict: 0 } }), null);
	assert.equal(blockReason({ xRestrict: 0 }, { isLoggedIn: false, self: null }), null);
});

test('未ログインの R-18 はログインを促す', () => {
	const reason = blockReason({ xRestrict: 1 }, { isLoggedIn: false, self: null });
	assert.equal(reason.kind, 'login');
	assert.match(reason.message, /ログイン/);
});

test('ログイン済みで設定が足りない R-18 は設定を促す', () => {
	const reason = blockReason({ xRestrict: 1 }, { isLoggedIn: true, self: { xRestrict: 0 } });
	assert.equal(reason.kind, 'setting');
	assert.match(reason.message, /表示設定/);
});

test('R-18G は設定が 1 でも止まる', () => {
	const reason = blockReason({ xRestrict: 2 }, { isLoggedIn: true, self: { xRestrict: 1 } });
	assert.equal(reason.kind, 'setting');
});

test('設定が足りていれば R-18G も見られる', () => {
	assert.equal(blockReason({ xRestrict: 2 }, { isLoggedIn: true, self: { xRestrict: 2 } }), null);
});

test('ブロック表示は mini があるときだけぼかしの img を敷く', () => {
	const { container } = render(DETAIL, blockReason(DETAIL, { isLoggedIn: true, self: { xRestrict: 0 } }));
	const backdrop = find(container, '.blocked-backdrop');
	assert.equal(backdrop.src, DETAIL.urls.mini);
	assert.equal(backdrop.alt, '');
	// ぼかしの強さは CSS が持つ。JS から style を書かない
	assert.equal(backdrop.style.filter, undefined);
});

test('未ログインで urls が無ければ img を作らない', () => {
	// src='' の img は読み込み失敗の往復が 1 回増えるだけ
	const { container } = render({ ...DETAIL, urls: { mini: null } }, blockReason(DETAIL, { isLoggedIn: false, self: null }));
	assert.equal(find(container, '.blocked-backdrop'), null);
	assert.equal(find(container, 'img'), null);
	assert.equal(find(container, '.blocked-message').textContent, 'この作品を見るには pixiv にログインしてください');
});

test('表示設定で止まった作品には設定へのリンクと再読み込みの案内を出す', () => {
	// 覚えているセッションは SPA 遷移で更新されない。設定を変えても再読み込みまで反映されない
	const reason = blockReason(DETAIL, { isLoggedIn: true, self: { xRestrict: 0 } });
	assert.equal(reason.kind, BLOCK_KINDS.SETTING);
	const { container } = render(DETAIL, reason);
	const link = find(container, '.blocked-link');
	assert.equal(link.textContent, '表示設定を変更する');
	assert.equal(link.target, '_blank');
	assert.equal(link.rel, 'noopener noreferrer');
	assert.equal(find(container, '.blocked-note').textContent, '変更後はページを再読み込みしてください');
});

test('未ログインのブロックには設定へのリンクを出さない', () => {
	const { container } = render(DETAIL, blockReason(DETAIL, { isLoggedIn: false, self: null }));
	assert.equal(find(container, '.blocked-link'), null);
	assert.equal(find(container, '.blocked-note'), null);
});

test('ブロック表示はビュワーの状態表示を消さない', () => {
	// .status の掃除はビュワー本体 (viewer.js の clearStatus) の責務
	const container = fakeElement('div');
	const status = fakeElement('p');
	status.className = 'status';
	container.appendChild(status);
	const pane = createBlocked({ doc: fakeDoc(), container });
	pane.render(DETAIL, blockReason(DETAIL, { isLoggedIn: false, self: null }));
	assert.equal(container.children[0], status);
	pane.dispose();
	assert.deepEqual(container.children, [status]);
});
