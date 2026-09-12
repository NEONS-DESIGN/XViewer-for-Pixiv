import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDomSequence, extendWithAllWorks } from '../../src/content/sequence.js';

test('端に来たら全作品の並びへ広げて続きへ進める', async () => {
	// グリッドには 3 件しか無いが、全作品は 5 件ある状況
	const dom = createDomSequence(['500', '400', '300']);
	assert.equal(dom.next('300'), null);

	const fakeGet = async () => ({
		illusts: { '500': null, '400': null, '300': null, '200': null, '100': null },
		manga: {},
	});
	const extended = await extendWithAllWorks(dom, '1', null, { getJsonImpl: fakeGet });
	assert.equal(extended.next('300'), '200');
	assert.equal(extended.next('200'), '100');
	assert.equal(extended.next('100'), null);
});

test('広げたあとも前へ戻れる', async () => {
	const fakeGet = async () => ({ illusts: { '3': null, '2': null, '1': null }, manga: {} });
	const extended = await extendWithAllWorks(createDomSequence(['3']), '1', null, { getJsonImpl: fakeGet });
	assert.equal(extended.prev('2'), '3');
});
