import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { WORK_CATEGORY } from '../../src/common/constants.js';
import { createDomSequence, extendWithAllWorks } from '../../src/content/sequence.js';
import { sortIdsDesc, clearPageSourceCache } from '../../src/pixiv/pages.js';

// profile/all の応答は pixiv/pages.js がユーザー単位で覚えるので、テストごとに捨てる
beforeEach(() => { clearPageSourceCache(); });

test('DOM 順の列は前後を返す', () => {
	const sequence = createDomSequence(['3', '2', '1']);
	assert.equal(sequence.next('3'), '2');
	assert.equal(sequence.prev('2'), '3');
});

test('列の端では null を返す', () => {
	const sequence = createDomSequence(['3', '2', '1']);
	assert.equal(sequence.prev('3'), null);
	assert.equal(sequence.next('1'), null);
});

test('列に無い ID は null を返す', () => {
	const sequence = createDomSequence(['3', '2']);
	assert.equal(sequence.next('99'), null);
	assert.equal(sequence.prev('99'), null);
	assert.equal(sequence.has('99'), false);
	assert.equal(sequence.has('3'), true);
});

test('sortIdsDesc は数値として降順に並べる', () => {
	// 文字列比較だと '9' > '10' になってしまうため数値で比べる
	assert.deepEqual(sortIdsDesc(['9', '10', '100', '2']), ['100', '10', '9', '2']);
});

test('extendWithAllWorks は全作品 ID の列を返す', async () => {
	const fakeGet = async () => ({
		illusts: { '100': null, '300': null },
		manga: { '200': null },
	});
	const sequence = await extendWithAllWorks(createDomSequence(['300']), '54734418', null, 'ja', { getJsonImpl: fakeGet });
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
	const illusts = await extendWithAllWorks(createDomSequence(['300']), '1', WORK_CATEGORY.ILLUST, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(illusts.ids, ['300', '100']);
	const manga = await extendWithAllWorks(createDomSequence(['200']), '1', WORK_CATEGORY.MANGA, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(manga.ids, ['200']);
});

test('extendWithAllWorks は失敗したら元の列を返す', async () => {
	const fakeGet = async () => { throw new Error('boom'); };
	const original = createDomSequence(['3', '2']);
	const sequence = await extendWithAllWorks(original, '1', null, 'ja', { getJsonImpl: fakeGet });
	assert.deepEqual(sequence.ids, ['3', '2']);
});
