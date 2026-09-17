import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideInfiniteSync, SYNC_ACTIONS } from '../../src/content/infinite-sync.js';
import { INFINITE_SCROLL } from '../../src/common/constants.js';

/** 作者 1 のイラストタブに張ったまま、3 ページ目を基準に 5 ページ目まで継ぎ足した状態。 */
const ATTACHED = Object.freeze({
	wanted: INFINITE_SCROLL.ON_REACH,
	key: '1|illusts',
	gridKey: '1|illusts',
	attachedKey: '1|illusts',
	active: true,
	detached: false,
	listChanged: false,
	param: 5,
	ownPage: 5,
	basePage: 3,
});

/**
 * 基準の状態に差分を重ねて判断させる。
 * @param {Partial<import('../../src/content/infinite-sync.js').SyncInput>} patch 上書き
 * @returns {import('../../src/content/infinite-sync.js').SyncDecision} 判断
 */
function decide(patch) {
	return decideInfiniteSync({ ...ATTACHED, ...patch });
}

test('自分が書いた ?p= の呼び戻しでは張ったままにする', () => {
	// writePageParam の replaceState は inject.js のフックで同期的に呼び戻される
	const decision = decide({});
	assert.equal(decision.action, SYNC_ACTIONS.KEEP);
	assert.equal(decision.basePage, 3);
	assert.equal(decision.ownPage, 5);
	assert.equal(decision.changedGrid, false);
});

test('まだ張っていないグリッドでは張る', () => {
	const decision = decide({ gridKey: null, attachedKey: null, active: false, param: 1, ownPage: null, basePage: 1 });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.gridKey, '1|illusts');
	assert.equal(decision.changedGrid, true);
});

test('pixiv が ?p= を動かしたら、その値を基準にして張り直す', () => {
	// ページャを踏んだ / 戻るで前のページへ出た。グリッドには pixiv がその値のページを並べている
	const decision = decide({ param: 2 });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.basePage, 2);
	assert.equal(decision.ownPage, null, '前に自分が書いた値は URL に残っていないので忘れる');
});

test('pixiv が ?p= を基準ページへ戻しただけなら撤去せず、URL を自分の位置へ書き直す', () => {
	// モーダルを閉じると Next.js が自分の state の URL (?p=3) へ replaceState し直す。
	// グリッドの中身は変わっていないので、継ぎ足したカードを捨ててはいけない
	const decision = decide({ param: 3 });
	assert.equal(decision.action, SYNC_ACTIONS.RESTORE_PARAM);
	assert.equal(decision.basePage, 3);
	assert.equal(decision.ownPage, 5, '自分の書いた値は覚えたまま');
});

test('張れていないグリッドで ?p= が基準ページと同じでも、戻したとは見なさない', () => {
	// 継ぎ足していないなら「戻す」先が無い。素直に pixiv の値を基準にする
	const decision = decide({ active: false, param: 3, ownPage: 5 });
	assert.equal(decision.action, SYNC_ACTIONS.KEEP);
	assert.equal(decision.ownPage, null);
});

test('別のグリッドへ移ったら記憶を捨てて張り直す', () => {
	const decision = decide({ key: '2|', param: 1 });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.changedGrid, true);
	assert.equal(decision.gridKey, '2|');
	assert.equal(decision.basePage, 1);
	assert.equal(decision.ownPage, null);
});

test('対象外のページへ出たら撤去する', () => {
	const decision = decide({ key: null, param: 1 });
	assert.equal(decision.action, SYNC_ACTIONS.DETACH);
	assert.equal(decision.gridKey, null);
	assert.equal(decision.changedGrid, true);
});

test('設定をオフにしたら撤去するが、グリッドの記憶は残す', () => {
	// 再び入れたときに「このグリッドは何ページ目を並べているか」を見失わないため
	const decision = decide({ wanted: INFINITE_SCROLL.OFF });
	assert.equal(decision.action, SYNC_ACTIONS.DETACH);
	assert.equal(decision.gridKey, '1|illusts');
	assert.equal(decision.basePage, 3);
});

test('オフの間に pixiv が ?p= を動かしても基準ページは追従する', () => {
	// 再び入れたとき、グリッドに並んでいるのはその値のページ
	const decision = decide({ wanted: INFINITE_SCROLL.OFF, attachedKey: null, active: false, param: 2, ownPage: null });
	assert.equal(decision.action, SYNC_ACTIONS.DETACH);
	assert.equal(decision.basePage, 2);
});

test('オフから戻したら覚えていた基準ページで張り直す', () => {
	// 撤去のときに ?p= は基準ページへ書き戻してあるので、URL と記憶は一致している
	const decision = decide({ attachedKey: null, active: false, param: 3, ownPage: null });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.basePage, 3);
});

test('グリッドを描き直されたら張り直すが、基準ページは変えない', () => {
	// Next.js の router state は replaceState では動かないので、描き直しは同じクエリで起きる。
	// pixiv が navigate したなら ?p= の枝で基準が更新される
	const decision = decide({ detached: true });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.basePage, 3);
	assert.equal(decision.ownPage, 5);
});

test('描き直しと同時に pixiv が ?p= を動かしていたら、その値を基準にする', () => {
	const decision = decide({ detached: true, param: 1 });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.basePage, 1);
	assert.equal(decision.ownPage, null);
});

test('雛形が採れないグリッドでは、同じ ul のままなら試し直さない', () => {
	// 全カードがブックマーク済みの作者ページ等では何度試しても同じ。DOM が動くたびに
	// captureTemplates (getComputedStyle x 48) を回さない
	const decision = decide({ active: false, param: 3, ownPage: null });
	assert.equal(decision.action, SYNC_ACTIONS.KEEP);
});

test('雛形が採れないグリッドでも、別の ul が現れたら試し直す', () => {
	// 掴んだのが描き途中の ul だっただけかもしれない
	const decision = decide({ active: false, listChanged: true, param: 3, ownPage: null });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.basePage, 3);
});

test('雛形が採れないまま pixiv が ?p= を動かしたら試し直す', () => {
	const decision = decide({ active: false, param: 4, ownPage: null });
	assert.equal(decision.action, SYNC_ACTIONS.REATTACH);
	assert.equal(decision.basePage, 4);
});

test('設定の変更は張ったままモードの差し替えで追従する', () => {
	const decision = decide({ wanted: INFINITE_SCROLL.PREFETCH });
	assert.equal(decision.action, SYNC_ACTIONS.KEEP);
});
