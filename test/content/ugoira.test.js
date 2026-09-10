import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickZipUrl, buildFrames } from '../../src/content/viewer/ugoira.js';

const META = {
	src: 'https://i.pximg.net/img-zip-ugoira/img/x_ugoira600x600.zip',
	originalSrc: 'https://i.pximg.net/img-zip-ugoira/img/x_ugoira1920x1080.zip',
	mime_type: 'image/jpeg',
	frames: [{ file: '000000.jpg', delay: 100 }, { file: '000001.jpg', delay: 100 }],
};

test('解像度の設定に応じて zip を選ぶ', () => {
	// regular は 600x600 (実測 4.7MB) / original は 1920x1080 (実測 12.7MB)
	assert.equal(pickZipUrl(META, 'regular'), META.src);
	assert.equal(pickZipUrl(META, 'original'), META.originalSrc);
});

test('originalSrc が無ければ src へ落とす', () => {
	assert.equal(pickZipUrl({ src: 'a' }, 'original'), 'a');
});

test('buildFrames は meta の順番で中身と待ち時間を組む', () => {
	const entries = [
		{ name: '000001.jpg', bytes: new Uint8Array([2]) },
		{ name: '000000.jpg', bytes: new Uint8Array([1]) },
	];
	const frames = buildFrames(entries, META.frames);
	assert.equal(frames.length, 2);
	assert.deepEqual([...frames[0].bytes], [1]);
	assert.equal(frames[0].delay, 100);
	assert.deepEqual([...frames[1].bytes], [2]);
});

test('buildFrames は zip に無いファイルを飛ばす', () => {
	const frames = buildFrames([{ name: '000000.jpg', bytes: new Uint8Array([1]) }], META.frames);
	assert.equal(frames.length, 1);
});

test('buildFrames は空でも落ちない', () => {
	assert.deepEqual(buildFrames([], META.frames), []);
	assert.deepEqual(buildFrames([], []), []);
});
