import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkLabel, likeLabel } from '../../src/content/viewer/actions-bar.js';

test('ブックマークのラベルは状態で変わる', () => {
	assert.equal(bookmarkLabel(null), 'ブックマークに追加');
	assert.equal(bookmarkLabel('38764402172'), 'ブックマークから削除');
});

test('いいねのラベルは取り消せないことを明記する', () => {
	// pixiv の仕様上いいねは解除できない。押す前に分かるようにしておく
	assert.equal(likeLabel(false), 'いいね (取り消せません)');
	assert.equal(likeLabel(true), 'いいね済み');
});
