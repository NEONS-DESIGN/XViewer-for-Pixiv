import test from 'node:test';
import assert from 'node:assert/strict';
import { savePageLanguage, loadPageLanguage, rememberPageLanguage } from '../../src/common/language-store.js';
import { fakeArea } from '../helpers/storage.js';

test('savePageLanguage は言語を保存する', async () => {
	const { area } = fakeArea();
	assert.equal(await savePageLanguage('en', { area }), true);
	assert.equal(await loadPageLanguage({ area }), 'en');
});

test('loadPageLanguage は保存が無ければ null を返す', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea().area }), null);
});

test('loadPageLanguage は壊れた保存値を null にする', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: 42 }).area }), null);
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: '' }).area }), null);
});

test('loadPageLanguage は保存値を正規化して返す', async () => {
	assert.equal(await loadPageLanguage({ area: fakeArea({ pageLanguage: 'en-US' }).area }), 'en');
});

test('保存領域が無くても投げない', async () => {
	assert.equal(await savePageLanguage('en', { area: null }), false);
	assert.equal(await loadPageLanguage({ area: null }), null);
});

test('保存領域が失敗しても投げない', async () => {
	const broken = {
		async get() { throw new Error('storage error'); },
		async set() { throw new Error('storage error'); },
	};
	assert.equal(await savePageLanguage('en', { area: broken }), false);
	assert.equal(await loadPageLanguage({ area: broken }), null);
});

/**
 * 書き込みの回数を数える保存領域の偽物。
 * @param {object} [initial] 最初から入っている値
 * @param {{failGet?: boolean}} [options] failGet: true で get を失敗させる
 * @returns {{area: object, sets: () => number}} 領域と書き込みの回数
 */
function countingArea(initial = {}, options = {}) {
	const { area } = fakeArea(initial);
	let sets = 0;
	return {
		area: {
			async get(keys) {
				if (options.failGet) throw new Error('storage error');
				return area.get(keys);
			},
			async set(patch) {
				sets += 1;
				return area.set(patch);
			},
		},
		sets: () => sets,
	};
}

test('rememberPageLanguage は覚えている値と同じなら書かない', async () => {
	// pixiv のページを開くたびに呼ばれる。値は普通変わらないので、毎回 set を走らせない
	const { area, sets } = countingArea({ pageLanguage: 'ja' });
	assert.equal(await rememberPageLanguage('ja', { area }), true);
	assert.equal(sets(), 0);
});

test('rememberPageLanguage は値が違う・無いときだけ書く', async () => {
	const changed = countingArea({ pageLanguage: 'ja' });
	assert.equal(await rememberPageLanguage('en', { area: changed.area }), true);
	assert.equal(changed.sets(), 1);
	assert.equal(await loadPageLanguage({ area: changed.area }), 'en');
	const empty = countingArea();
	assert.equal(await rememberPageLanguage('ko', { area: empty.area }), true);
	assert.equal(empty.sets(), 1);
	assert.equal(await loadPageLanguage({ area: empty.area }), 'ko');
});

test('rememberPageLanguage は覚えている値が読めなくても書きにいく', async () => {
	const { area, sets } = countingArea({ pageLanguage: 'ja' }, { failGet: true });
	assert.equal(await rememberPageLanguage('en', { area }), true);
	assert.equal(sets(), 1);
});

test('rememberPageLanguage は保存領域が無い・書けなくても投げない', async () => {
	assert.equal(await rememberPageLanguage('en', { area: null }), false);
	const broken = {
		async get() { throw new Error('storage error'); },
		async set() { throw new Error('storage error'); },
	};
	assert.equal(await rememberPageLanguage('en', { area: broken }), false);
});
