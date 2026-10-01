import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickZipUrl, advanceFrame, createUgoiraPlayer } from '../../src/content/viewer/ugoira.js';
import { seekPercent } from '../../src/content/viewer/ugoira-controls.js';
import { fakeElement, fakeDoc, find, findAll, flush } from '../helpers/dom.js';
import { buildStoredZip, bytes, localSpan } from '../helpers/zip.js';
import { UGOIRA_START_FRAMES, UGOIRA_PLAYBACK_RATES, DEFAULT_UGOIRA_RATE } from '../../src/common/constants.js';
import { createStrings } from '../../src/i18n/index.js';

/** 文言のカタログ (日本語)。 */
const STRINGS = createStrings('ja');

const META = {
	src: 'https://i.pximg.net/img-zip-ugoira/img/x_ugoira600x600.zip',
	originalSrc: 'https://i.pximg.net/img-zip-ugoira/img/x_ugoira1920x1080.zip',
	mime_type: 'image/jpeg',
	frames: [{ file: '000000.jpg', delay: 100 }, { file: '000001.jpg', delay: 100 }],
};

test('解像度の設定に応じて zip を選ぶ', () => {
	// regular は 600x600、original は 1920x1080 の枠に収まる大きさの zip
	assert.equal(pickZipUrl(META, 'regular'), META.src);
	assert.equal(pickZipUrl(META, 'original'), META.originalSrc);
});

test('originalSrc が無ければ src へ落とす', () => {
	assert.equal(pickZipUrl({ src: 'a' }, 'original'), 'a');
});

/** 30ms x 3 コマの待ち時間。 */
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

test('advanceFrame は揃っていない間、揃った最後のコマで止まり先頭へ戻らない', () => {
	// 2 コマ目までしか届いていない。待ち時間を過ぎても 0 コマ目へ戻さず、待っていることを返す
	const next = advanceFrame({ now: 1100, startedAt: 1000, index: 0, timings: TIMINGS.slice(0, 2), complete: false });
	assert.equal(next.index, 1);
	assert.equal(next.advanced, 1);
	assert.equal(next.stalled, true);
});

test('advanceFrame は速度で待ち時間を割る', () => {
	// 30ms のコマを 2 倍速なら 15ms で進め、0.5 倍速なら 60ms まで留まる
	assert.equal(advanceFrame({ now: 1015, startedAt: 1000, index: 0, timings: TIMINGS, rate: 2 }).index, 1);
	assert.equal(advanceFrame({ now: 1059, startedAt: 1000, index: 0, timings: TIMINGS, rate: 0.5 }).index, 0);
	assert.equal(advanceFrame({ now: 1060, startedAt: 1000, index: 0, timings: TIMINGS, rate: 0.5 }).index, 1);
});

test('速度の選択肢は遅い順に並び、等速を含む', () => {
	assert.deepEqual([...UGOIRA_PLAYBACK_RATES].sort((a, b) => a - b), [...UGOIRA_PLAYBACK_RATES]);
	assert.ok(UGOIRA_PLAYBACK_RATES.includes(DEFAULT_UGOIRA_RATE));
});

test('seekPercent は位置を 0-100 の % にし、1 コマなら端まで塗る', () => {
	assert.equal(seekPercent(0, 5), 0);
	assert.equal(seekPercent(4, 5), 100);
	assert.equal(seekPercent(2, 5), 50);
	assert.equal(seekPercent(0, 1), 100);
	assert.equal(seekPercent(9, 5), 100);
});

test('advanceFrame は揃っていなくても次のコマがあれば普段どおり進める', () => {
	const next = advanceFrame({ now: 1035, startedAt: 1000, index: 0, timings: TIMINGS.slice(0, 2), complete: false });
	assert.equal(next.index, 1);
	assert.equal(next.startedAt, 1030);
	assert.equal(next.stalled, false);
});

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
const ZIP3 = buildStoredZip([
	{ name: '000000.jpg', bytes: bytes(1, 1) },
	{ name: '000001.jpg', bytes: bytes(1, 2) },
	{ name: '000002.jpg', bytes: bytes(1, 3) },
]).buffer;

/** 5 コマの zip のエントリ。受信の途中で再生が始まるかを見る。 */
const ENTRIES5 = Array.from({ length: 5 }, (_, at) => ({ name: `00000${at}.jpg`, bytes: bytes(4, at * 10) }));

/** 5 コマの meta。 */
const META5 = Object.freeze({
	...META,
	frames: ENTRIES5.map((entry) => ({ file: entry.name, delay: 30 })),
});

/** 5 コマ分の zip。 */
const ZIP5 = buildStoredZip(ENTRIES5);

/**
 * 少しずつ流せる zip の応答を作る。
 * dispose で signal が abort されると、本物の fetch と同じく読み取りが AbortError で落ちる。
 * @param {Uint8Array} zip zip 全体
 * @returns {{respond: (init: object) => object, send: (from: number, to: number) => void, close: () => void, fail: (error: Error) => void, state: {cancelled: boolean}}} 応答と操作
 */
function streamedZip(zip) {
	let controller;
	const state = { cancelled: false };
	const body = new ReadableStream({
		start(streamController) { controller = streamController; },
		cancel() { state.cancelled = true; },
	});
	return {
		respond(init) {
			init.signal.addEventListener('abort', () => {
				try { controller.error(new DOMException('aborted', 'AbortError')); } catch { /* 閉じた後 */ }
			}, { once: true });
			return { ok: true, status: 200, body, arrayBuffer: async () => { throw new Error('body を読むこと'); } };
		},
		send(from, to) { controller.enqueue(new Uint8Array(zip.buffer, from, to - from)); },
		close() { controller.close(); },
		fail(error) { controller.error(error); },
		state,
	};
}

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
 * @param {boolean} [options.holdTimers] true なら setTimeout の関数をすぐには呼ばない。(timers から呼ぶ) 省くとすぐ呼ぶ
 * @param {object} [options.strings] 文言のカタログ。省くと日本語
 * @param {Promise<object>|null} [options.preloadedMeta] 温めておいた ugoira_meta の body
 * @returns {object} container / player / 作った Image / rAF のコールバック / 取り消した rAF の ID / 描いたコマ / zip fetch の init / releaseImages / setTimeout の記録 / getContext の引数
 */
function build({ sizes = [10, 10, 10], fetchImpl, holdImages = false, holdTimers = false, strings = STRINGS, preloadedMeta = null, rate, onRateChange } = {}) {
	const doc = fakeDoc();
	const drawn = [];
	const contextArgs = [];
	const create = doc.createElement;
	doc.createElement = (tag) => {
		const element = create(tag);
		if (tag === 'canvas') {
			element.getContext = (...args) => {
				contextArgs.push(args);
				return { drawImage(image) { drawn.push(image); } };
			};
		}
		return element;
	};
	/** @type {Array<{callback: Function, delay: number}>} setTimeout に渡されたもの。ID は積んだ順の 1 始まり */
	const timers = [];
	const clearedTimers = [];
	const container = fakeElement('div');
	const images = [];
	const rafCallbacks = [];
	/** cancelAnimationFrame に渡された ID。rAF の ID は予約した順の 1 始まり */
	const cancelled = [];
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
		strings,
		fetchImpl: fetchImpl ?? defaultFetch,
		preloadedMeta,
		rate,
		onRateChange,
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
		cancelAnimationFrame: (id) => { cancelled.push(id); },
		setTimeout: (callback, delay) => {
			timers.push({ callback, delay });
			if (!holdTimers) callback();
			return timers.length;
		},
		clearTimeout: (id) => { clearedTimers.push(id); },
	});
	return { container, player, images, rafCallbacks, cancelled, drawn, zipInits, releaseImages, timers, clearedTimers, contextArgs };
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

test('dispose で Blob URL を全部 revoke し、rAF を止める', async (t) => {
	// Blob URL は revoke しないとメモリに残る。rAF は止めないと捨てた canvas へ描き続ける
	const revoke = t.mock.method(URL, 'revokeObjectURL');
	const { player, cancelled } = build();
	await player.render(DETAIL);
	assert.equal(revoke.mock.callCount(), 0);
	player.dispose();
	assert.equal(revoke.mock.callCount(), 3, 'フレーム数ぶん revoke する');
	assert.deepEqual(cancelled, [1], '再生開始で予約した rAF を取り消す');
});

test('dispose すると meta の要求も止める', async () => {
	// zip だけでなく ugoira_meta の往復にも同じ signal を渡す
	let signal = null;
	const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
		signal = init.signal;
		signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
	});
	const { container, player } = build({ fetchImpl });
	const rendering = player.render(DETAIL);
	await flush();
	assert.ok(signal);
	assert.equal(signal.aborted, false);
	player.dispose();
	assert.equal(signal.aborted, true);
	await rendering;
	assert.equal(findAll(container, '.pane-error').length, 0);
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
	const { container, player, rafCallbacks, cancelled } = build();
	await player.render(DETAIL);
	const toggle = find(container, '.ugoira-toggle');
	assert.equal(toggle.getAttribute('aria-label'), '一時停止');
	await toggle.click();
	assert.equal(toggle.getAttribute('aria-label'), '再生');
	assert.deepEqual(cancelled, [1], '止めたときに予約していた rAF を取り消す');
	await toggle.click();
	assert.equal(toggle.getAttribute('aria-label'), '一時停止');
	assert.equal(rafCallbacks.length, 2);
	player.dispose();
});

/* --- 操作の帯 (シークバー・速度) ------------------------------------- */

test('再生が始まるまで操作の帯は隠し、始まったら出す', async () => {
	const { container, player } = build();
	const rendering = player.render(DETAIL);
	assert.equal(find(container, '.ugoira-controls').hidden, true);
	await rendering;
	const controls = find(container, '.ugoira-controls');
	assert.equal(controls.hidden, false);
	assert.equal(controls.getAttribute('role'), 'group');
	// 再生ボタン・シークバー・コマ数・速度の順に並ぶ
	assert.deepEqual(controls.children.map((child) => child.className), ['ugoira-toggle', 'ugoira-seek', 'ugoira-frame', 'ugoira-rate-wrap']);
	player.dispose();
});

test('シークバーとコマ数は今のコマに追従する', async () => {
	const { container, player, rafCallbacks } = build();
	await player.render(DETAIL);
	const seek = find(container, '.ugoira-seek');
	assert.equal(seek.max, '2');
	assert.equal(seek.value, '0');
	assert.equal(find(container, '.ugoira-frame').textContent, '1 / 3');
	assert.equal(seek.getAttribute('aria-valuetext'), '3 コマ中 1 コマ目');
	rafCallbacks[0](1000);
	rafCallbacks[1](1030);
	assert.equal(seek.value, '1');
	assert.equal(find(container, '.ugoira-frame').textContent, '2 / 3');
	assert.equal(seek.style.getPropertyValue('--seek-played'), '50%');
	assert.equal(seek.style.getPropertyValue('--seek-loaded'), '100%');
	player.dispose();
});

test('シークバーを動かすとそのコマを描き、今の時刻から数え直す', async () => {
	const { container, player, images, drawn, rafCallbacks } = build({ holdTimers: true });
	await player.render(DETAIL);
	rafCallbacks[0](1000);
	const seek = find(container, '.ugoira-seek');
	seek.value = '2';
	await seek.dispatch('input');
	assert.equal(drawn.at(-1), images[2]);
	assert.equal(find(container, '.ugoira-frame').textContent, '3 / 3');
	// 前の位置の期限で起きないよう、予約を取り消して rAF を取り直す
	assert.equal(rafCallbacks.length, 2);
	rafCallbacks[1](5000);
	// 飛んだ直後の tick では進めない (5000ms 経っていても、数え始めは今)
	assert.equal(drawn.at(-1), images[2]);
	player.dispose();
});

test('シークバーをつかんでいる間は止め、離したら再生に戻る', async () => {
	const { container, player } = build();
	await player.render(DETAIL);
	const seek = find(container, '.ugoira-seek');
	const toggle = find(container, '.ugoira-toggle');
	await seek.dispatch('pointerdown');
	assert.equal(toggle.getAttribute('aria-label'), '再生', 'つかんでいる間は止まっている');
	seek.value = '1';
	await seek.dispatch('input');
	await seek.dispatch('change');
	assert.equal(toggle.getAttribute('aria-label'), '一時停止', '離したら再生に戻る');
	player.dispose();
});

test('止めていたなら、シークバーを離しても止まったまま', async () => {
	const { container, player } = build();
	await player.render(DETAIL);
	const toggle = find(container, '.ugoira-toggle');
	await toggle.click();
	const seek = find(container, '.ugoira-seek');
	await seek.dispatch('pointerdown');
	await seek.dispatch('change');
	assert.equal(toggle.getAttribute('aria-label'), '再生');
	player.dispose();
});

test('まだ読めていないコマへは飛ばず、読めている最後のコマで止める', async () => {
	const stream = streamedZip(ZIP5);
	const { container, player, images, drawn } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	const rendering = player.render(DETAIL);
	// 先頭 UGOIRA_START_FRAMES コマだけ届けて再生を始める
	stream.send(0, localSpan(ENTRIES5, UGOIRA_START_FRAMES));
	await flush();
	const seek = find(container, '.ugoira-seek');
	assert.equal(seek.max, String(META5.frames.length - 1), 'シークバーの長さは meta のコマ数');
	seek.value = String(META5.frames.length - 1);
	await seek.dispatch('input');
	assert.equal(drawn.at(-1), images[UGOIRA_START_FRAMES - 1]);
	assert.equal(seek.value, String(UGOIRA_START_FRAMES - 1), 'つまみも読めている最後へ戻す');
	stream.send(localSpan(ENTRIES5, UGOIRA_START_FRAMES), ZIP5.length);
	stream.close();
	await rendering;
	player.dispose();
});

test('速度のメニューで選ぶと、待ち時間を割って再生し、選んだ速度を知らせる', async () => {
	const chosen = [];
	const { container, player, rafCallbacks, timers } = build({ holdTimers: true, onRateChange: (rate) => chosen.push(rate) });
	await player.render(DETAIL);
	const rateButton = find(container, '.ugoira-rate');
	assert.equal(rateButton.textContent, '1×');
	assert.equal(rateButton.getAttribute('aria-label'), '再生速度: 1×');
	await rateButton.click();
	const menu = find(container, '.ugoira-rate-menu');
	assert.equal(menu.hidden, false);
	assert.equal(rateButton.getAttribute('aria-expanded'), 'true');
	const items = findAll(container, '.ugoira-rate-item');
	assert.deepEqual(items.map((item) => item.dataset.rate), UGOIRA_PLAYBACK_RATES.map(String));
	assert.equal(items.find((item) => item.dataset.rate === '1').getAttribute('aria-checked'), 'true');
	await items.find((item) => item.dataset.rate === '2').click();
	assert.deepEqual(chosen, [2]);
	assert.equal(menu.hidden, true, '選んだら閉じる');
	assert.equal(rateButton.textContent, '2×');
	assert.equal(items.find((item) => item.dataset.rate === '2').getAttribute('aria-checked'), 'true');
	// 30ms のコマを 2 倍速: 15ms から余白 4ms を引いた 11ms 眠る
	rafCallbacks.at(-1)(1000);
	assert.equal(timers.at(-1).delay, 11);
	player.dispose();
});

test('前の作品で選んだ速度で再生を始める', async () => {
	const { container, player, rafCallbacks, timers } = build({ holdTimers: true, rate: 0.5 });
	await player.render(DETAIL);
	assert.equal(find(container, '.ugoira-rate').textContent, '0.5×');
	rafCallbacks[0](1000);
	// 30ms のコマを 0.5 倍速: 60ms から余白 4ms を引いた 56ms 眠る
	assert.equal(timers[0].delay, 56);
	player.dispose();
});

test('選択肢に無い速度を渡されたら等速で始める', async () => {
	const { container, player } = build({ rate: 3 });
	await player.render(DETAIL);
	assert.equal(find(container, '.ugoira-rate').textContent, '1×');
	player.dispose();
});

test('速度のメニューを開いている間は Escape と上下キーを食い止め、閉じたら本体へ渡す', async () => {
	const { container, player } = build();
	await player.render(DETAIL);
	const key = (name) => ({ key: name, preventDefault() {} });
	assert.equal(player.consumeKey(key('Escape')), false, '閉じている間は本体 (ビュワーを閉じる) に任せる');
	await find(container, '.ugoira-rate').click();
	assert.equal(player.consumeKey(key('ArrowDown')), true, '項目の移動に使う (作品を送らない)');
	assert.equal(player.consumeKey(key('Escape')), true, 'メニューだけ閉じる');
	assert.equal(find(container, '.ugoira-rate-menu').hidden, true);
	assert.equal(player.consumeKey(key('ArrowDown')), false);
	player.dispose();
});

test('再生ボタンの読み上げ名が英語になる', async () => {
	const { container, player } = build({ strings: createStrings('en') });
	await player.render(DETAIL);
	const toggle = find(container, '.ugoira-toggle');
	assert.equal(toggle.getAttribute('aria-label'), 'Pause');
	await toggle.click();
	assert.equal(toggle.getAttribute('aria-label'), 'Play');
	player.dispose();
});

test('温めた meta を渡されたら ugoira_meta を取りに行かない', async () => {
	const asked = [];
	const fetchImpl = async (url) => {
		asked.push(url);
		return { ok: true, status: 200, arrayBuffer: async () => ZIP3 };
	};
	const { container, player } = build({ fetchImpl, preloadedMeta: Promise.resolve(META3) });
	await player.render(DETAIL);
	assert.equal(asked.filter((url) => url.includes('ugoira_meta')).length, 0);
	assert.equal(asked.length, 1, 'zip だけを取る');
	assert.equal(find(container, '.ugoira-canvas').hidden, false);
	player.dispose();
});

test('温めた meta が失敗していたら、いつもどおり取り直す', async () => {
	const asked = [];
	const fetchImpl = async (url) => {
		asked.push(url);
		if (url.includes('ugoira_meta')) return metaResponse(META3);
		return { ok: true, status: 200, arrayBuffer: async () => ZIP3 };
	};
	const { container, player } = build({ fetchImpl, preloadedMeta: Promise.reject(new Error('warm failed')) });
	await player.render(DETAIL);
	assert.equal(asked.filter((url) => url.includes('ugoira_meta')).length, 1);
	assert.equal(findAll(container, '.pane-error').length, 0, '温めの失敗だけでは失敗を出さない');
	assert.equal(find(container, '.ugoira-canvas').hidden, false);
	player.dispose();
});

/**
 * meta と、少しずつ流す zip を返す通信の代わり。
 * @param {object} stream streamedZip の戻り値
 * @param {object} [meta] ugoira_meta の body
 * @returns {Function} fetch の代わり
 */
function streamingFetch(stream, meta = META5) {
	return async (url, init) => {
		if (url.includes('ugoira_meta')) return metaResponse(meta);
		return stream.respond(init);
	};
}

/** 5 コマとも読める大きさ。 */
const SIZES5 = [10, 10, 10, 10, 10];

test('先頭 UGOIRA_START_FRAMES コマが読めた時点で再生を始める', async () => {
	const stream = streamedZip(ZIP5);
	const { container, player, images, drawn, rafCallbacks } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	let finished = false;
	const rendering = player.render(DETAIL).then(() => { finished = true; });
	const canvas = find(container, '.ugoira-canvas');
	// 1 コマ足りないうちは静止画のまま
	stream.send(0, localSpan(ENTRIES5, UGOIRA_START_FRAMES - 1));
	await flush();
	assert.equal(canvas.hidden, true);
	stream.send(localSpan(ENTRIES5, UGOIRA_START_FRAMES - 1), localSpan(ENTRIES5, UGOIRA_START_FRAMES));
	await flush();
	assert.equal(canvas.hidden, false);
	assert.equal(find(container, '.ugoira-poster').hidden, true);
	assert.equal(find(container, '.ugoira-toggle').hidden, false);
	assert.deepEqual(drawn, [images[0]]);
	assert.equal(rafCallbacks.length, 1);
	assert.equal(finished, false, 'zip の残りはまだ受信中');
	stream.send(localSpan(ENTRIES5, UGOIRA_START_FRAMES), ZIP5.length);
	stream.close();
	await rendering;
	assert.equal(images.length, 5);
	assert.equal(findAll(container, '.pane-error').length, 0);
	player.dispose();
});

test('次のコマが未着ならそのコマで待ち、届いたら進む', async () => {
	const stream = streamedZip(ZIP5);
	const { player, images, drawn, rafCallbacks, timers } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	const rendering = player.render(DETAIL);
	stream.send(0, localSpan(ENTRIES5, 3));
	await flush();
	rafCallbacks[0](1000);
	rafCallbacks[1](1030);
	rafCallbacks[2](1060);
	assert.deepEqual(drawn, [images[0], images[1], images[2]]);
	// 3 コマ目の待ち時間が過ぎても 4 コマ目は未着。先頭へ戻らず、次の予約もしない
	rafCallbacks[3](1090);
	assert.deepEqual(drawn, [images[0], images[1], images[2]]);
	assert.equal(rafCallbacks.length, 4);
	// 4 コマ目が届いたら 1 コマだけ進む。待っていた時間は繰り越さない
	stream.send(localSpan(ENTRIES5, 3), localSpan(ENTRIES5, 4));
	await flush();
	assert.equal(rafCallbacks.length, 5);
	rafCallbacks[4](5000);
	assert.deepEqual(drawn.slice(3), [images[3]]);
	// 4 コマ目は届いた時刻から 30ms 見せる (余白 4ms を引いて眠る)
	assert.equal(timers.at(-1).delay, 26);
	stream.send(localSpan(ENTRIES5, 4), ZIP5.length);
	stream.close();
	await rendering;
	player.dispose();
});

test('response.body が無ければ全体を受け取ってから再生する', async () => {
	let reads = 0;
	const fetchImpl = async (url) => {
		if (url.includes('ugoira_meta')) return metaResponse(META3);
		return { ok: true, status: 200, arrayBuffer: async () => { reads += 1; return ZIP3; } };
	};
	const { container, player, images } = build({ fetchImpl });
	await player.render(DETAIL);
	assert.equal(reads, 1);
	assert.equal(images.length, 3);
	assert.equal(find(container, '.ugoira-canvas').hidden, false);
	player.dispose();
});

/**
 * 受信しながらは読めない形の zip を 1 回だけ返す通信を作る。
 * @param {Array<{name: string, bytes: Uint8Array, flags?: number, method?: number}>} entries zip のエントリ
 * @returns {{fetchImpl: Function, stream: object, zipInits: object[], zip: Uint8Array}} 通信の代わりと記録
 */
function unreadableZip(entries) {
	const zip = buildStoredZip(entries);
	const stream = streamedZip(zip);
	const zipInits = [];
	const fetchImpl = async (url, init) => {
		if (url.includes('ugoira_meta')) return metaResponse(META3);
		zipInits.push(init);
		return stream.respond(init);
	};
	return { fetchImpl, stream, zipInits, zip };
}

test('data descriptor の zip は取り直さず、受信をやめて再生できないことを出す', async () => {
	// 2 つ目のエントリに bit 3。受信しながらは切り出せず、全体を受け取っても parseStoredZip では読めない
	const entries = ENTRIES5.slice(0, 3).map((entry, at) => ({ ...entry, flags: at === 1 ? 0x08 : 0 }));
	const { fetchImpl, stream, zipInits, zip } = unreadableZip(entries);
	const { container, player } = build({ fetchImpl });
	const rendering = player.render(DETAIL);
	stream.send(0, zip.length);
	await rendering;
	assert.equal(stream.state.cancelled, true, '途中まで読んだ body は取り消す');
	assert.equal(zipInits.length, 1, 'zip を取り直している');
	assert.equal(find(container, '.pane-error').textContent, 'うごイラを再生できませんでした');
	assert.equal(find(container, '.ugoira-canvas').hidden, true);
	player.dispose();
});

test('STORE 以外の zip は取り直さず、受信をやめて再生できないことを出す', async () => {
	const entries = ENTRIES5.slice(0, 3).map((entry, at) => ({ ...entry, method: at === 0 ? 8 : 0 }));
	const { fetchImpl, stream, zipInits, zip } = unreadableZip(entries);
	const { container, player, images } = build({ fetchImpl });
	const rendering = player.render(DETAIL);
	stream.send(0, zip.length);
	await rendering;
	assert.equal(stream.state.cancelled, true, '途中まで読んだ body は取り消す');
	assert.equal(zipInits.length, 1, 'zip を取り直している');
	assert.equal(images.length, 0);
	assert.equal(find(container, '.pane-error').textContent, 'うごイラを再生できませんでした');
	player.dispose();
});

test('JPEG なら alpha:false で getContext する', async () => {
	const { player, contextArgs } = build();
	await player.render(DETAIL);
	assert.deepEqual(contextArgs, [['2d', { alpha: false }]]);
	player.dispose();
});

test('JPEG 以外は透過を残して getContext する', async () => {
	const fetchImpl = async (url) => {
		if (url.includes('ugoira_meta')) return metaResponse({ ...META3, mime_type: 'image/png' });
		return { ok: true, status: 200, arrayBuffer: async () => ZIP3 };
	};
	const { player, contextArgs } = build({ fetchImpl });
	await player.render(DETAIL);
	assert.deepEqual(contextArgs, [['2d', undefined]]);
	player.dispose();
});

test('再生はタイマで次のコマの期限まで眠り、rAF を 1 回だけ使う', async () => {
	const { player, images, drawn, rafCallbacks, timers } = build({ holdTimers: true });
	await player.render(DETAIL);
	assert.equal(rafCallbacks.length, 1);
	rafCallbacks[0](1000);
	// 30ms のコマなので、余白 4ms を引いた 26ms 眠る。眠っている間は rAF を回さない
	assert.deepEqual(timers.map((timer) => timer.delay), [26]);
	assert.equal(rafCallbacks.length, 1);
	timers[0].callback();
	assert.equal(rafCallbacks.length, 2);
	rafCallbacks[1](1030);
	assert.deepEqual(drawn, [images[0], images[1]]);
	// rAF が期限より早く来たら、残りの分だけ眠り直す
	timers[1].callback();
	rafCallbacks[2](1050);
	assert.deepEqual(drawn, [images[0], images[1]]);
	assert.equal(timers[2].delay, 6);
	player.dispose();
});

test('止めるとタイマも取り消す', async () => {
	const { container, player, rafCallbacks, clearedTimers } = build({ holdTimers: true });
	await player.render(DETAIL);
	rafCallbacks[0](1000);
	await find(container, '.ugoira-toggle').click();
	assert.deepEqual(clearedTimers, [1]);
	player.dispose();
});

test('受信中に dispose されたら転送を止め、Blob URL を全部 revoke して黙る', async (t) => {
	const revoke = t.mock.method(URL, 'revokeObjectURL');
	const stream = streamedZip(ZIP5);
	const { container, player, rafCallbacks, cancelled } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	const rendering = player.render(DETAIL);
	stream.send(0, localSpan(ENTRIES5, 3));
	await flush();
	assert.equal(rafCallbacks.length, 1);
	player.dispose();
	await rendering;
	assert.equal(revoke.mock.callCount(), 3);
	assert.deepEqual(cancelled, [1]);
	assert.equal(container.children.length, 0);
	assert.equal(findAll(container, '.pane-error').length, 0);
});

test('再生が始まった後に受信が失敗したら、届いた分で繰り返す', async () => {
	const stream = streamedZip(ZIP5);
	const { container, player, images, drawn, rafCallbacks } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	const rendering = player.render(DETAIL);
	stream.send(0, localSpan(ENTRIES5, 3));
	await flush();
	stream.fail(new TypeError('network error'));
	await rendering;
	assert.equal(findAll(container, '.pane-error').length, 0);
	rafCallbacks[0](1000);
	rafCallbacks[1](1030);
	rafCallbacks[2](1060);
	rafCallbacks[3](1090);
	assert.deepEqual(drawn, [images[0], images[1], images[2], images[0]]);
	player.dispose();
});

test('再生が始まる前に受信が失敗したら、静止画のまま理由を出す', async () => {
	const stream = streamedZip(ZIP5);
	const { container, player, drawn } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	const rendering = player.render(DETAIL);
	stream.send(0, localSpan(ENTRIES5, 1));
	await flush();
	stream.fail(new TypeError('network error'));
	await rendering;
	await flush();
	assert.equal(find(container, '.pane-error').textContent, 'うごイラを再生できませんでした');
	assert.equal(find(container, '.ugoira-poster').hidden, false);
	assert.equal(find(container, '.ugoira-canvas').hidden, true);
	assert.equal(drawn.length, 0);
	player.dispose();
});

test('受信中に一時停止したら、コマが届いても止まったまま', async () => {
	const stream = streamedZip(ZIP5);
	const { container, player, rafCallbacks } = build({ fetchImpl: streamingFetch(stream), sizes: SIZES5 });
	const rendering = player.render(DETAIL);
	stream.send(0, localSpan(ENTRIES5, 3));
	await flush();
	const toggle = find(container, '.ugoira-toggle');
	await toggle.click();
	stream.send(localSpan(ENTRIES5, 3), ZIP5.length);
	stream.close();
	await rendering;
	assert.equal(toggle.getAttribute('aria-label'), '再生');
	assert.equal(rafCallbacks.length, 1, '届いても rAF を予約しない');
	player.dispose();
});

test('meta にコマが無ければ静止画のまま理由を出す', async () => {
	const fetchImpl = async (url) => {
		if (url.includes('ugoira_meta')) return metaResponse({ ...META3, frames: [] });
		return { ok: true, status: 200, arrayBuffer: async () => ZIP3 };
	};
	const { container, player, rafCallbacks } = build({ fetchImpl });
	await player.render(DETAIL);
	assert.equal(find(container, '.pane-error').textContent, 'うごイラを再生できませんでした');
	assert.equal(rafCallbacks.length, 0);
	player.dispose();
});
