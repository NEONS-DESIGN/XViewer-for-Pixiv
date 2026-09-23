import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withArea } from '../../src/common/storage-area.js';
import { fakeArea } from '../helpers/storage.js';

test('withArea は deps.area が undefined なら既定の領域を使う', async () => {
	const { area, written } = fakeArea();
	const result = await withArea({}, () => area, async (a) => { await a.set({ k: 1 }); return 'ok'; }, 'fallback');
	assert.equal(result, 'ok');
	assert.deepEqual(written, { k: 1 });
});

test('withArea は deps.area が null なら「領域なし」として既定の領域へ落ちない', async () => {
	// `??` で倒すと null でも既定の領域 (本番では chrome.storage) へ落ちてしまい、テストと本番で意味が変わる
	let defaultCalls = 0;
	const result = await withArea({ area: null }, () => { defaultCalls += 1; return fakeArea().area; }, async () => 'ran', 'fallback');
	assert.equal(result, 'fallback');
	assert.equal(defaultCalls, 0);
});

test('withArea は既定の領域が無ければ fallback を返す', async () => {
	assert.equal(await withArea({}, () => null, async () => 'ran', 'fallback'), 'fallback');
});

test('withArea は処理が投げても fallback を返し、外へ出さない', async () => {
	const result = await withArea({ area: fakeArea().area }, () => null, async () => { throw new Error('storage error'); }, 'fallback');
	assert.equal(result, 'fallback');
});
