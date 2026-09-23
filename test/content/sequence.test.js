import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_CATEGORY } from '../../src/common/constants.js';
import { createSequence, extendWithAllWorks } from '../../src/content/sequence.js';
import { clearPageSourceCache } from '../../src/pixiv/pages.js';

// profile/all の応答は pixiv/pages.js がユーザー単位で覚えるので、テストごとに捨てる
beforeEach(() => { clearPageSourceCache(); });

test('DOM 順の列は前後を返す', () => {
	const sequence = createSequence(['3', '2', '1']);
	assert.equal(sequence.next('3'), '2');
	assert.equal(sequence.prev('2'), '3');
});

test('列の端では null を返す', () => {
	const sequence = createSequence(['3', '2', '1']);
	assert.equal(sequence.prev('3'), null);
	assert.equal(sequence.next('1'), null);
});

test('列に無い ID は null を返す', () => {
	const sequence = createSequence(['3', '2']);
	assert.equal(sequence.next('99'), null);
	assert.equal(sequence.prev('99'), null);
	assert.equal(sequence.has('99'), false);
	assert.equal(sequence.has('3'), true);
});

test('同じ ID が 2 回入っていても最初の位置だけを残す', () => {
	// 後ろの位置で上書きすると next() が 2 回目の位置から進み、間の作品を飛ばす
	const sequence = createSequence(['3', '2', '3', '1']);
	assert.deepEqual(sequence.ids, ['3', '2', '1']);
	assert.equal(sequence.next('3'), '2');
	assert.equal(sequence.next('2'), '1');
	assert.equal(sequence.prev('1'), '2');
});

test('extendWithAllWorks は全作品 ID の列を返す', async () => {
	const fakeGet = async () => ({
		illusts: { '100': null, '300': null },
		manga: { '200': null },
	});
	const sequence = await extendWithAllWorks(createSequence(['300']), '54734418', null, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(sequence.ids, ['300', '200', '100']);
	assert.equal(sequence.next('300'), '200');
	assert.equal(sequence.next('200'), '100');
});

test('extendWithAllWorks は種別を指定するとその作品だけに絞る', async () => {
	// イラストタブ・漫画タブで端を越えたとき、グリッドに無い種別の作品へ飛ばないため
	const fakeGet = async () => ({
		illusts: { '100': null, '300': null },
		manga: { '200': null },
	});
	const illusts = await extendWithAllWorks(createSequence(['300']), '1', WORK_CATEGORY.ILLUST, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(illusts.ids, ['300', '100']);
	const manga = await extendWithAllWorks(createSequence(['200']), '1', WORK_CATEGORY.MANGA, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(manga.ids, ['200']);
});

test('端に来たら全作品の並びへ広げて続きへ進め、広げたあとも前へ戻れる', async () => {
	// グリッドには 3 件しか無いが、全作品は 5 件ある状況
	const dom = createSequence(['500', '400', '300']);
	assert.equal(dom.next('300'), null);

	const fakeGet = async () => ({
		illusts: { '500': null, '400': null, '300': null, '200': null, '100': null },
		manga: {},
	});
	const extended = await extendWithAllWorks(dom, '1', null, 'ja', { getJsonImpl: fakeGet });
	assert.equal(extended.next('300'), '200');
	assert.equal(extended.next('200'), '100');
	assert.equal(extended.next('100'), null);
	assert.equal(extended.prev('200'), '300');
});

test('extendWithAllWorks は失敗したら元の列を返す', async () => {
	const fakeGet = async () => { throw new Error('boom'); };
	const original = createSequence(['3', '2']);
	const sequence = await extendWithAllWorks(original, '1', null, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(sequence.ids, ['3', '2']);
});
