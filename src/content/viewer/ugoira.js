/**
 * うごイラの再生。
 *
 * zip (img-zip-ugoira) は CORS 可なので、ページから直接 fetch する。(background を通さない)
 * zip の中身は全て STORE (無圧縮) なので、zip ライブラリは使わず受信しながら切り出す。
 * 先頭の数コマが読めた時点で再生を始め、残りは届いた順に足していく。
 * フレームは ImageBitmap で持たず、Blob URL + Image にしてデコードはブラウザへ任せる。
 * (全フレームを ImageBitmap で持つとメモリを大きく食う)
 * Blob URL は閉じるときに必ず revoke する。
 */
import { getJson } from '../../pixiv/client.js';
import { ugoiraMetaUrl, safeCdnUrl } from '../../pixiv/endpoints.js';
import { parseStoredZip, createStoredZipReader } from '../../pixiv/ugoira-zip.js';
import { createIcon } from '../../common/icons.js';
import { assignImageSrc } from '../../common/image-source.js';
import { IMAGE_QUALITY, UGOIRA_START_FRAMES } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/** 再生ボタンの表示。キーは今の再生状態、値は「押すと何になるか」。アイコンは言語に依らない。 */
const TOGGLE = Object.freeze({
	PLAYING: Object.freeze({ icon: 'pause', labelKey: 'PAUSE' }),
	PAUSED: Object.freeze({ icon: 'play', labelKey: 'PLAY' }),
});

/** 開発者向けの失敗理由。画面には出さず warn に渡す。 */
const REASONS = Object.freeze({
	ZIP_NOT_CDN: 'zip の URL が pixiv の CDN ではありません',
	ZIP_FETCH: 'zip の取得に失敗しました',
	NO_FRAMES: 'フレームがありません',
	DECODE: 'フレームの画像をデコードできませんでした',
	UNSUPPORTED_ZIP: '受信しながら読めない形式の zip です (data descriptor か STORE 以外)',
});

/** delay が読めなかったときに使う待ち時間 (ミリ秒)。 */
const FALLBACK_DELAY = 100;

/**
 * 遅れを取り戻すときに一気に進めてよい上限 (ミリ秒)。
 * タブが非可視の間は requestAnimationFrame が止まる。戻ってきたときに
 * 止まっていた時間ぶんを全部コマ送りすると一瞬で数十フレーム飛ぶので、
 * これを超える遅れは捨てて今の時刻から数え直す。
 */
const MAX_CATCHUP_MS = 500;

/**
 * 次のコマの期限より手前で目を覚ます余白 (ミリ秒)。
 * タイマは遅れて発火しやすいので、少し早めに起きて requestAnimationFrame で描く時刻を合わせる。
 */
const TIMER_SLACK_MS = 4;

/** zip 内の画像の形式が meta に無いときの既定値。JPEG なら canvas の透過を切る。 */
const DEFAULT_FRAME_MIME = 'image/jpeg';

/** デコードできなかった・zip に無かったコマの印。再生では飛ばす。 */
const BROKEN = Object.freeze({ broken: true });

/**
 * 設定に応じて使う zip を選ぶ。
 * @param {object} meta ugoira_meta の body
 * @param {string} quality IMAGE_QUALITY のいずれか
 * @returns {string} zip の URL
 */
export function pickZipUrl(meta, quality) {
	if (quality === IMAGE_QUALITY.ORIGINAL) return meta.originalSrc ?? meta.src;
	return meta.src;
}

/**
 * 今のフレームの開始時刻を進め、何コマ進めるかを決める。
 *
 * 開始時刻は「前のフレームの開始 + delay」で繰り越す。requestAnimationFrame の
 * 時刻に丸めると 1 コマごとに最大 1 刻み (約 16.7ms) ずつ遅れが積み上がる。
 * 遅れが大きいときは複数コマ進めるが、MAX_CATCHUP_MS を超える遅れは捨てる。
 * コマが揃っていない (complete が false) 間は、timings の最後のコマの待ち時間を過ぎても先頭へ戻らず、
 * stalled を立ててそのコマに留まる。
 * @param {object} state 今の状態
 * @param {number} state.now requestAnimationFrame の時刻
 * @param {number} state.startedAt 今のフレームの開始時刻
 * @param {number} state.index 今のフレーム番号
 * @param {Array<{delay: number}>} state.timings 各フレームの待ち時間 (再生できる分)
 * @param {boolean} [state.complete] 全コマが揃っているか。省くと揃っている扱い
 * @returns {{index: number, startedAt: number, advanced: number, stalled: boolean}} 次のフレーム番号・開始時刻・進めたコマ数・次のコマ待ちか
 */
export function advanceFrame({ now, startedAt, index, timings, complete = true }) {
	let elapsed = now - startedAt;
	let nextIndex = index;
	let advanced = 0;
	while (elapsed >= timings[nextIndex].delay) {
		if (!complete && nextIndex === timings.length - 1) {
			return { index: nextIndex, startedAt: now - elapsed, advanced, stalled: true };
		}
		elapsed -= timings[nextIndex].delay;
		nextIndex = (nextIndex + 1) % timings.length;
		advanced += 1;
		if (elapsed > MAX_CATCHUP_MS) {
			elapsed = 0;
			break;
		}
	}
	return { index: nextIndex, startedAt: now - elapsed, advanced, stalled: false };
}

/**
 * @typedef {object} UgoiraDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先 (.stage)
 * @property {object} settings 設定
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {typeof fetch} [fetchImpl] 通信 (meta と zip) の差し替え。テストから pixiv を叩かないために使う
 * @property {Promise<object>|null} [preloadedMeta] 先に取っておいた ugoira_meta の body。拒否されていたら取り直す
 * @property {() => HTMLImageElement} [createImage] フレーム用 Image の差し替え。Node には Image が無い
 * @property {(callback: FrameRequestCallback) => number} [requestAnimationFrame] コマ送りの差し替え
 * @property {(id: number) => void} [cancelAnimationFrame] コマ送りの停止の差し替え
 * @property {(callback: () => void, delay: number) => number} [setTimeout] 次のコマまで眠るタイマの差し替え
 * @property {(id: number) => void} [clearTimeout] タイマの停止の差し替え
 */

/**
 * うごイラ再生器を作る。
 * @param {UgoiraDeps} deps 依存
 * @returns {{render: (detail: object) => Promise<void>, dispose: () => void}}
 */
export function createUgoiraPlayer(deps) {
	const { doc, container, strings } = deps;
	const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
	const createImage = deps.createImage ?? (() => new Image());
	const raf = deps.requestAnimationFrame ?? ((callback) => requestAnimationFrame(callback));
	const caf = deps.cancelAnimationFrame ?? ((id) => cancelAnimationFrame(id));
	const later = deps.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
	const cancelLater = deps.clearTimeout ?? ((id) => clearTimeout(id));

	/** @type {string[]} 作った Blob URL。dispose で必ず revoke する */
	let objectUrls = [];
	/** @type {Array<{image: HTMLImageElement, delay: number}|typeof BROKEN|undefined>} meta の順の各コマ。undefined は未着 */
	let frames = [];
	/** @type {Map<string, number>} zip のファイル名 → frames の添字 */
	let indexByName = new Map();
	/** @type {boolean[]} 添字ごとに、zip のエントリを受け取ったか (二重に読まないため) */
	let claimed = [];
	/** 受け取ったエントリの数 (meta にあるものだけ) */
	let claimedCount = 0;
	/** 読み込み中の Image の数 */
	let pendingLoads = 0;
	/** @type {Array<() => void>} 読み込み中の Image が無くなるのを待っている関数 */
	let idleWaiters = [];
	/** @type {Array<{image: HTMLImageElement, delay: number}>} 再生できるコマ。先頭から途切れなく届いた分 (壊れたものは飛ばす) */
	let playable = [];
	/** frames のうち、playable へ入れるかを決め終えた数 */
	let scannedFrames = 0;
	/** 全コマの扱いが決まったか。揃うまでは最後のコマで待ち、揃ったら先頭へ戻る */
	let complete = false;
	/** zip の形式。getContext の透過と Blob の type に使う */
	let mimeType = DEFAULT_FRAME_MIME;
	/** @type {HTMLCanvasElement|null} */
	let canvas = null;
	/** @type {CanvasRenderingContext2D|null} */
	let context = null;
	/** @type {HTMLImageElement|null} 再生が始まるまで出しておく静止画 */
	let poster = null;
	/** @type {HTMLButtonElement|null} 再生ボタン */
	let toggle = null;
	/** requestAnimationFrame の ID */
	let rafId = 0;
	/** 次のコマまで眠るタイマの ID */
	let timerId = 0;
	/** 今のフレーム番号 (playable の添字) */
	let frameIndex = 0;
	/** 今のフレームを表示し始めた時刻 */
	let frameStartedAt = 0;
	/** 再生中か */
	let playing = false;
	/** 次のコマが未着で待っているか。届いたら再開する */
	let stalled = false;
	/** 待っていたコマが届いて再開した直後の tick か。待っていた時間を繰り越さないために使う */
	let resuming = false;
	/** 再生を始めたか (canvas を出したか) */
	let started = false;
	/** 失敗を表示したか。以後に届いたコマでは再生を始めない */
	let failed = false;
	/** 破棄済みか。非同期処理の途中で捨てられたときに描かないようにする */
	let disposed = false;
	/** @type {HTMLElement|null} 自分が作った要素。dispose で外す */
	let root = null;
	/** 再生中の作品 ID。失敗の記録に添える */
	let workId = '';
	/** meta と zip の取得を途中で止めるためのもの。dispose で abort する */
	const aborter = new AbortController();

	/**
	 * ugoira_meta を得る。先に取っておいたものがあればそれを使い、
	 * 無いか失敗していたらここで取り直す。(先取りの失敗だけでは再生を諦めない)
	 * @param {string} workId 作品 ID
	 * @returns {Promise<object>} ugoira_meta の body
	 */
	async function loadMeta(workId) {
		if (deps.preloadedMeta) {
			try {
				return await deps.preloadedMeta;
			} catch {
				// 取り直しに進む
			}
		}
		// meta の要求も dispose で止める。(zip と同じ signal)
		return getJson(ugoiraMetaUrl(workId, strings.lang), { fetchImpl, signal: aborter.signal });
	}

	/**
	 * 次のコマの期限まで眠り、起きたら requestAnimationFrame で描く時刻を合わせる。
	 * @param {number} now 今の時刻 (requestAnimationFrame の時刻)
	 * @returns {void}
	 */
	function scheduleNext(now) {
		const current = playable[frameIndex];
		const wait = Math.max(0, current.delay - (now - frameStartedAt) - TIMER_SLACK_MS);
		timerId = later(() => {
			timerId = 0;
			if (!playing || disposed) return;
			rafId = raf(tick);
		}, wait);
	}

	/**
	 * 1 コマ描いて次へ進める。次のコマが未着なら、何も予約せずに届くのを待つ。
	 * @param {number} now requestAnimationFrame の時刻
	 * @returns {void}
	 */
	function tick(now) {
		rafId = 0;
		if (!playing || disposed || playable.length === 0) return;
		if (frameStartedAt === 0) frameStartedAt = now;
		if (resuming) {
			// 待っていた間の時間は繰り越さず、届いた今から次のコマを数える
			resuming = false;
			frameStartedAt = now - playable[frameIndex].delay;
		}
		const next = advanceFrame({ now, startedAt: frameStartedAt, index: frameIndex, timings: playable, complete });
		frameIndex = next.index;
		frameStartedAt = next.startedAt;
		if (next.advanced > 0) draw();
		if (next.stalled) {
			stalled = true;
			return;
		}
		scheduleNext(now);
	}

	/**
	 * 今のフレームを canvas に描く。
	 * @returns {void}
	 */
	function draw() {
		const frame = playable[frameIndex];
		if (!context || !frame) return;
		context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
	}

	/**
	 * 再生を始める。
	 * @returns {void}
	 */
	function play() {
		if (playing || playable.length === 0) return;
		playing = true;
		stalled = false;
		resuming = false;
		frameStartedAt = 0;
		rafId = raf(tick);
	}

	/**
	 * 再生を止める。予約しているタイマと requestAnimationFrame を両方取り消す。
	 * @returns {void}
	 */
	function pause() {
		playing = false;
		stalled = false;
		resuming = false;
		if (timerId) cancelLater(timerId);
		timerId = 0;
		if (rafId) caf(rafId);
		rafId = 0;
	}

	/**
	 * ペインの中にエラー行を出す。
	 * 静止画 (poster) は出ているので、共有の状態表示で消さずに枠の中へ重ねる。
	 * @param {string} message 文言
	 * @returns {void}
	 */
	function showPaneError(message) {
		if (disposed || !root) return;
		root.querySelector('.pane-error')?.remove();
		const line = doc.createElement('p');
		line.className = 'pane-error';
		line.setAttribute('role', 'alert');
		line.textContent = message;
		root.appendChild(line);
	}

	/**
	 * 再生できないことを伝える。以後に届いたコマでは再生を始めない。
	 * @param {unknown} error 理由
	 * @returns {void}
	 */
	function fail(error) {
		failed = true;
		// 静止画は出ているので、動かないことだけを伝える
		showPaneError(strings.ugoira.PLAY_FAILED);
		warn('failed to play ugoira', workId, error);
	}

	/**
	 * canvas を出して再生を始める。寸法は最初に再生できるコマで決める。
	 * @returns {void}
	 */
	function startPlayback() {
		started = true;
		const first = playable[0].image;
		canvas.width = first.naturalWidth;
		canvas.height = first.naturalHeight;
		// JPEG は透過しないので、透過を切って合成の手間を省く
		context = canvas.getContext('2d', mimeType === DEFAULT_FRAME_MIME ? { alpha: false } : undefined);
		canvas.hidden = false;
		poster.hidden = true;
		toggle.hidden = false;
		frameIndex = 0;
		draw();
		play();
	}

	/**
	 * 先頭から途切れなく届いた分を playable へ足し、揃った数に応じて再生を始める・再開する。
	 * @returns {void}
	 */
	function onFramesChanged() {
		if (disposed || failed) return;
		const before = playable.length;
		while (scannedFrames < frames.length && frames[scannedFrames] !== undefined) {
			const frame = frames[scannedFrames];
			if (frame !== BROKEN) playable.push(frame);
			scannedFrames += 1;
		}
		const nowComplete = scannedFrames === frames.length;
		const grew = playable.length > before || (nowComplete && !complete);
		complete = nowComplete;
		if (!started) {
			// 壊れたコマがあって UGOIRA_START_FRAMES に届かなくても、揃ったら残りで始める
			if (playable.length > 0 && (playable.length >= UGOIRA_START_FRAMES || complete)) startPlayback();
			return;
		}
		// 次のコマを待っていたなら、届いた今から進める。一時停止中は止まったまま
		if (grew && stalled && playing) {
			stalled = false;
			resuming = true;
			rafId = raf(tick);
		}
	}

	/**
	 * 読み込み中の Image が無くなったら待っている関数を呼ぶ。破棄後は残りを待たずに呼ぶ。
	 * @returns {void}
	 */
	function notifyIdle() {
		if (pendingLoads > 0 && !disposed) return;
		for (const resolve of idleWaiters.splice(0)) resolve();
	}

	/**
	 * 読み込み中の Image が無くなるまで待つ。
	 * @returns {Promise<void>}
	 */
	function waitForLoads() {
		if (pendingLoads === 0 || disposed) return Promise.resolve();
		return new Promise((resolve) => { idleWaiters.push(resolve); });
	}

	/**
	 * zip のエントリを 1 コマとして読み込む。meta に無い名前と、二度目に来た名前は捨てる。
	 * decode() は使わない。DOM に繋がっていない Image では画像が読めていても解決しないことがある。
	 * load / error は繋がっていなくても必ず発火する。
	 * @param {{name: string, parts: Uint8Array[]}} entry zip のエントリ
	 * @param {Array<{file: string, delay: number}>} metaFrames meta のフレーム
	 * @returns {void}
	 */
	function addFrame(entry, metaFrames) {
		const at = indexByName.get(entry.name);
		if (at === undefined || claimed[at] || disposed) return;
		claimed[at] = true;
		claimedCount += 1;
		const delay = metaFrames[at].delay > 0 ? metaFrames[at].delay : FALLBACK_DELAY;
		const url = URL.createObjectURL(new Blob(entry.parts, { type: mimeType }));
		objectUrls.push(url);
		pendingLoads += 1;
		const image = createImage();
		let settled = false;
		/**
		 * 読めたか失敗したかを記録する。デコードに失敗したコマは naturalWidth が 0 になり、
		 * drawImage に渡すと例外で tick が止まるので、印を付けて待ち時間ごと飛ばす。
		 * @returns {void}
		 */
		const settle = () => {
			if (settled) return;
			settled = true;
			pendingLoads -= 1;
			if (!disposed) {
				frames[at] = image.naturalWidth && image.naturalHeight ? { image, delay } : BROKEN;
				try {
					onFramesChanged();
				} catch (error) {
					pause();
					fail(error);
				}
			}
			notifyIdle();
		};
		image.addEventListener('load', settle, { once: true });
		image.addEventListener('error', settle, { once: true });
		assignImageSrc(image, url);
	}

	/**
	 * zip を読み、エントリが揃うたびに onEntry へ渡す。
	 * body を読めるなら受信しながら切り出す。body が無ければ同じ応答の全体を受け取ってから切り出す。
	 * 受信しながらは切り出せない形 (data descriptor か STORE 以外) は全体を受け取っても読めないので、
	 * 取り直さずに受信をやめて失敗にする。
	 * @param {Response} response zip の応答
	 * @param {(entry: {name: string, parts: Uint8Array[]}) => void} onEntry エントリを受け取る関数
	 * @returns {Promise<void>}
	 * @throws {Error} 通信の失敗、読めない形式の zip
	 */
	async function readFrames(response, onEntry) {
		if (typeof response.body?.getReader === 'function') {
			const reader = response.body.getReader();
			const zipReader = createStoredZipReader();
			for (;;) {
				const { done, value } = await reader.read();
				if (done || disposed) return;
				for (const entry of zipReader.push(value)) onEntry(entry);
				if (zipReader.ended()) {
					// 残りは中央ディレクトリだけなので受け取らない
					reader.cancel().catch(() => {});
					return;
				}
				if (zipReader.needsFallback()) {
					reader.cancel().catch(() => {});
					throw new Error(REASONS.UNSUPPORTED_ZIP);
				}
			}
		}
		const buffer = await response.arrayBuffer();
		if (disposed) return;
		for (const entry of parseStoredZip(buffer)) onEntry({ name: entry.name, parts: [entry.bytes] });
	}

	return {
		/**
		 * うごイラを描画して再生を始める。先頭の数コマが読めた時点で再生を始め、
		 * 返す Promise は zip を読み終えて全コマの扱いが決まったときに解決する。
		 * ビュワーの状態表示 (.status) は呼び出し側が消してから呼ぶ。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async render(detail) {
			workId = detail.id;
			const wrapper = doc.createElement('div');
			wrapper.className = 'ugoira';
			root = wrapper;

			// zip を待つ間は静止画を出して待たせない
			poster = doc.createElement('img');
			poster.className = 'ugoira-poster';
			poster.alt = detail.title;
			assignImageSrc(poster, detail.urls[IMAGE_QUALITY.REGULAR] ?? '');

			canvas = doc.createElement('canvas');
			canvas.className = 'ugoira-canvas';
			// 再生が始まると poster は隠れる。canvas にも読み上げ用の名前を持たせる
			canvas.setAttribute('role', 'img');
			canvas.setAttribute('aria-label', detail.title);
			canvas.hidden = true;

			const button = doc.createElement('button');
			toggle = button;
			button.type = 'button';
			button.className = 'ugoira-toggle';
			/**
			 * ボタンの見た目を再生状態に合わせる。ボタンは「押すと何になるか」を示す。
			 * @param {boolean} isPlaying 再生中か
			 * @returns {void}
			 */
			const setToggle = (isPlaying) => {
				const next = isPlaying ? TOGGLE.PLAYING : TOGGLE.PAUSED;
				const label = strings.ugoira[next.labelKey];
				button.setAttribute('aria-label', label);
				button.title = label;
				button.replaceChildren(createIcon(doc, next.icon));
			};
			setToggle(true);
			button.hidden = true;
			button.addEventListener('click', () => {
				if (playing) pause();
				else play();
				setToggle(playing);
			});

			wrapper.append(poster, canvas, button);
			container.appendChild(wrapper);

			try {
				const meta = await loadMeta(detail.id);
				if (disposed) return;

				// API が返した値をそのまま外部オリジンへ投げない
				const zipUrl = safeCdnUrl(pickZipUrl(meta, deps.settings.imageQuality));
				if (!zipUrl) throw new Error(REASONS.ZIP_NOT_CDN);
				const metaFrames = Array.isArray(meta.frames) ? meta.frames : [];
				// 並び順は meta が持つので、zip の並びには頼らない
				frames = new Array(metaFrames.length).fill(undefined);
				claimed = new Array(metaFrames.length).fill(false);
				indexByName = new Map(metaFrames.map((frame, at) => [frame.file, at]));
				mimeType = meta.mime_type ?? DEFAULT_FRAME_MIME;

				// 作品を送られたら途中でも転送を止める。zip は 10MB を超えることがあり、
				// 見ていない作品の分が流れ続けると今見ている作品の取得が遅れる
				const response = await fetchImpl(zipUrl, { mode: 'cors', signal: aborter.signal });
				if (!response.ok) throw new Error(`${REASONS.ZIP_FETCH}: ${response.status}`);
				try {
					await readFrames(response, (entry) => addFrame(entry, metaFrames));
				} catch (error) {
					// 再生が始まっていれば、届いた分で繰り返す
					if (disposed || !started) throw error;
					warn('ugoira zip stopped midway', detail.id, error);
				}
				await waitForLoads();
				if (disposed || failed) return;

				// zip に無かったコマは飛ばす
				for (let at = 0; at < frames.length; at += 1) {
					if (frames[at] === undefined) frames[at] = BROKEN;
				}
				onFramesChanged();
				if (started) return;
				// 全部落ちたら 0x0 の canvas に描いても無言で何も出ないので、静止画のまま理由を出す
				throw new Error(claimedCount === 0 ? REASONS.NO_FRAMES : REASONS.DECODE);
			} catch (error) {
				// 破棄後の失敗 (abort を含む) は伝えない。枠ごと消えている
				if (disposed) return;
				fail(error);
			}
		},

		/**
		 * 資源を解放する。Blob URL を revoke しないとメモリが残る。
		 * @returns {void}
		 */
		dispose() {
			disposed = true;
			aborter.abort();
			// 自分が作った DOM は自分で片付ける。
			// これを外すと、次に開いた作品の画像と横に並んで両方潰れる
			root?.remove();
			root = null;
			pause();
			for (const url of objectUrls) URL.revokeObjectURL(url);
			objectUrls = [];
			frames = [];
			claimed = [];
			indexByName = new Map();
			playable = [];
			canvas = null;
			context = null;
			poster = null;
			toggle = null;
			// 読み込み中の Image を待っている render を終わらせる
			notifyIdle();
		},
	};
}
