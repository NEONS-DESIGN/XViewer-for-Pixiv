import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickZipUrl, buildFrames, advanceFrame, createUgoiraPlayer } from '../../src/content/viewer/ugoira.js';
import { fakeElement, fakeDoc, find, findAll, flush } from '../helpers/dom.js';

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

/** 30ms x 3 コマの待ち時間。SITE_SPEC §4 の実測作品と同じ刻み */
const TIMINGS = [{ delay: 30 }, { delay: 30 }, { delay: 30 }];

test('advanceFrame は開始時刻を「前の開始 + delay」で繰り越し、rAF の刻みで遅れない', () => {
	// 17ms 刻みで 300ms 送ると、30ms のコマは 10 回進むのが正しい。
	// 開始時刻を rAF の時刻に丸めると 1 コマ 34ms になり 9 回しか進まない
	let state = { startedAt: 1000, index: 0, advanced: 0 };
	let total = 0;
	for (let step = 0; step <= 18; step += 1) {
		state = advanceFrame({ now: 1000 + step * 17, startedAt: state.startedAt, index: state.index, timings: TIMINGS });
		total += state.advanced;
	}
	assert.equal(total, 10);
	assert.equal(state.index, 10 % 3);
	// 開始時刻はコマの境目 (1300) に揃う
	assert.equal(state.startedAt, 1300);
});

test('advanceFrame は遅れが数コマ分なら一気に進める', () => {
	const next = advanceFrame({ now: 1100, startedAt: 1000, index: 0, timings: TIMINGS });
	assert.equal(next.advanced, 3);
	assert.equal(next.index, 0);
	assert.equal(next.startedAt, 1090);
});

test('advanceFrame は非可視だった後の大きな遅れを捨てて数え直す', () => {
	// タブが隠れて 8 秒止まっていた。全部コマ送りすると一瞬で数十フレーム飛ぶ
	const next = advanceFrame({ now: 9000, startedAt: 1000, index: 1, timings: TIMINGS });
	assert.equal(next.advanced, 1);
	assert.equal(next.index, 2);
	assert.equal(next.startedAt, 9000);
});

test('advanceFrame は待ち時間に届かなければ何もしない', () => {
	const next = advanceFrame({ now: 1020, startedAt: 1000, index: 2, timings: TIMINGS });
	assert.equal(next.advanced, 0);
	assert.equal(next.index, 2);
	assert.equal(next.startedAt, 1000);
});

/**
 * テスト用に STORE 方式の zip を組み立てる。
 * @param {Array<{name: string, data: number[]}>} files エントリ
 * @returns {ArrayBuffer} zip
 */
function buildZip(files) {
	const chunks = [];
	for (const file of files) {
		const nameBytes = new TextEncoder().encode(file.name);
		const header = new Uint8Array(30);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x04034b50, true);
		view.setUint16(4, 20, true);
		view.setUint16(8, 0, true);
		view.setUint32(18, file.data.length, true);
		view.setUint32(22, file.data.length, true);
		view.setUint16(26, nameBytes.length, true);
		view.setUint16(28, 0, true);
		chunks.push(header, nameBytes, new Uint8Array(file.data));
	}
	const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out.buffer;
}

/** 再生器へ渡す作品詳細の代わり。 */
const DETAIL = Object.freeze({
	id: '149448910',
	title: 'うごく',
	urls: { regular: 'https://i.pximg.net/img-master/img/x_master1200.jpg' },
});

/** 3 コマの meta。 */
const META3 = Object.freeze({
	...META,
	frames: [
		{ file: '000000.jpg', delay: 30 },
		{ file: '000001.jpg', delay: 30 },
		{ file: '000002.jpg', delay: 30 },
	],
});

/** 3 コマ分の zip。 */
const ZIP3 = buildZip([
	{ name: '000000.jpg', data: [1] },
	{ name: '000001.jpg', data: [2] },
	{ name: '000002.jpg', data: [3] },
]);

/**
 * ugoira_meta の応答の代わり。client.js は text() で読んでから JSON.parse する
 * @param {object} body 応答の body
 * @returns {object} fetch の応答の代わり
 */
function metaResponse(body) {
	return { ok: true, status: 200, text: async () => JSON.stringify({ error: false, body }) };
}

/**
 * うごイラ再生器を組み立てる。
 * @param {object} [options] 差し替え
 * @param {number[]} [options.sizes] 作った順に各 Image へ与える naturalWidth。0 は壊れたコマ
 * @param {Function} [options.fetchImpl] 通信の代わり。省くと meta と zip を返す
 * @param {boolean} [options.holdImages] true なら Image の load を releaseImages() まで止める
 * @returns {object} container / player / 作った Image / rAF のコールバック / 描いたコマ / zip fetch の init / releaseImages
 */
function build({ sizes = [10, 10, 10], fetchImpl, holdImages = false } = {}) {
	const doc = fakeDoc();
	const drawn = [];
	const create = doc.createElement;
	doc.createElement = (tag) => {
		const element = create(tag);
		if (tag === 'canvas') {
			element.getContext = () => ({ drawImage(image) { drawn.push(image); } });
		}
		return element;
	};
	const container = fakeElement('div');
	const images = [];
	const rafCallbacks = [];
	const zipInits = [];
	/** 止めている load を出す関数の一覧 */
	const pendingLoads = [];
	const releaseImages = () => { for (const fire of pendingLoads.splice(0)) fire(); };
	const defaultFetch = async (url, init) => {
		if (url.includes('ugoira_meta')) {
			return metaResponse(META3);
		}
		zipInits.push(init);
		return { ok: true, status: 200, arrayBuffer: async () => ZIP3 };
	};
	const player = createUgoiraPlayer({
		doc,
		container,
		settings: { imageQuality: 'regular' },
		fetchImpl: fetchImpl ?? defaultFetch,
		createImage: () => {
			const image = fakeElement('img');
			const size = sizes[images.length] ?? 10;
			images.push(image);
			// src を入れたら次のマイクロタスクで load / error を出す。壊れたコマは naturalWidth 0
			Object.defineProperty(image, 'src', {
				set() {
					image.naturalWidth = size;
					image.naturalHeight = size;
					const fire = () => { void image.dispatch(size > 0 ? 'load' : 'error'); };
					if (holdImages) pendingLoads.push(fire);
					else queueMicrotask(fire);
				},
			});
			return image;
		},
		requestAnimationFrame: (callback) => { rafCallbacks.push(callback); return rafCallbacks.length; },
		cancelAnimationFrame: () => {},
	});
	return { container, player, images, rafCallbacks, drawn, zipInits, releaseImages };
}

test('render は静止画を先に出し、読めたら canvas に切り替えて再生を始める', async () => {
	const { container, player, images, rafCallbacks, drawn } = build();
	const rendering = player.render(DETAIL);
	const poster = find(container, '.ugoira-poster');
	assert.equal(poster.src, DETAIL.urls.regular);
	assert.equal(poster.hidden, false);
	await rendering;
	const canvas = find(container, '.ugoira-canvas');
	assert.equal(canvas.hidden, false);
	assert.equal(poster.hidden, true);
	// 再生中は poster が隠れるので canvas に名前を持たせる
	assert.equal(canvas.getAttribute('role'), 'img');
	assert.equal(canvas.getAttribute('aria-label'), 'うごく');
	assert.equal(find(container, '.ugoira-toggle').hidden, false);
	// 最初のコマを描いて、rAF を予約している
	assert.deepEqual(drawn, [images[0]]);
	assert.equal(rafCallbacks.length, 1);
	// 30ms 進むとコマが進む
	rafCallbacks[0](1000);
	rafCallbacks[1](1030);
	assert.deepEqual(drawn, [images[0], images[1]]);
	player.dispose();
});

test('壊れたコマは落として残りで再生する', async () => {
	const { player, images, rafCallbacks, drawn } = build({ sizes: [10, 0, 10] });
	await player.render(DETAIL);
	// 2 コマ目は drawImage に渡さない。渡すと例外で tick が止まり、ボタンが「一時停止」のまま動かなくなる
	rafCallbacks[0](1000);
	rafCallbacks[1](1030);
	rafCallbacks[2](1060);
	assert.deepEqual(drawn, [images[0], images[2], images[0]]);
	player.dispose();
});

test('全部のコマが壊れていたら静止画のまま枠の中に理由を出す', async () => {
	const { container, player, drawn } = build({ sizes: [0, 0, 0] });
	await player.render(DETAIL);
	const error = find(container, '.pane-error');
	assert.equal(error.textContent, 'うごイラを再生できませんでした');
	assert.equal(error.getAttribute('role'), 'alert');
	assert.equal(error.parent.className, 'ugoira');
	assert.equal(find(container, '.ugoira-poster').hidden, false);
	assert.equal(find(container, '.ugoira-canvas').hidden, true);
	assert.equal(drawn.length, 0);
	// 共有の状態表示 (.status) には触らない
	assert.equal(findAll(container, '.status').length, 0);
});

test('zip の取得に失敗しても静止画は残す', async () => {
	const fetchImpl = async (url) => {
		if (url.includes('ugoira_meta')) {
			return metaResponse(META3);
		}
		return { ok: false, status: 403 };
	};
	const { container, player } = build({ fetchImpl });
	await player.render(DETAIL);
	assert.equal(find(container, '.pane-error').textContent, 'うごイラを再生できませんでした');
	assert.equal(find(container, '.ugoira-poster').hidden, false);
});

test('CDN 以外の zip は取りに行かない', async () => {
	const asked = [];
	const fetchImpl = async (url) => {
		asked.push(url);
		return metaResponse({ ...META3, src: 'https://evil.example.com/x.zip' });
	};
	const { container, player } = build({ fetchImpl });
	await player.render(DETAIL);
	assert.equal(asked.length, 1);
	assert.equal(find(container, '.pane-error').textContent, 'うごイラを再生できませんでした');
});

test('dispose すると zip の転送を止め、届いても描かない', async () => {
	let signal = null;
	let release;
	const fetchImpl = async (url, init) => {
		if (url.includes('ugoira_meta')) {
			return metaResponse(META3);
		}
		signal = init.signal;
		await new Promise((resolve) => { release = resolve; });
		// 本物の fetch は abort されると AbortError で落ちる
		throw new DOMException('aborted', 'AbortError');
	};
	const { container, player, drawn } = build({ fetchImpl });
	const rendering = player.render(DETAIL);
	await flush();
	assert.ok(signal);
	assert.equal(signal.aborted, false);
	player.dispose();
	assert.equal(signal.aborted, true);
	assert.equal(container.children.length, 0);
	release();
	await rendering;
	assert.equal(drawn.length, 0);
	assert.equal(findAll(container, '.pane-error').length, 0);
});

test('コマの読み込み中に dispose されたら描かない', async () => {
	const { container, player, images, drawn, rafCallbacks, releaseImages } = build({ holdImages: true });
	const rendering = player.render(DETAIL);
	// meta と zip を抜けて Image を作った (まだ読めていない) 時点で捨てる
	await flush();
	assert.equal(images.length, 3);
	player.dispose();
	releaseImages();
	await rendering;
	assert.equal(drawn.length, 0);
	assert.equal(rafCallbacks.length, 0);
	assert.equal(container.children.length, 0);
});

test('再生ボタンは押すと止まり、もう一度押すと動く', async () => {
	const { container, player, rafCallbacks } = build();
	await player.render(DETAIL);
	const toggle = find(container, '.ugoira-toggle');
	assert.equal(toggle.getAttribute('aria-label'), '一時停止');
	await toggle.click();
	assert.equal(toggle.getAttribute('aria-label'), '再生');
	await toggle.click();
	assert.equal(toggle.getAttribute('aria-label'), '一時停止');
	assert.equal(rafCallbacks.length, 2);
	player.dispose();
});
