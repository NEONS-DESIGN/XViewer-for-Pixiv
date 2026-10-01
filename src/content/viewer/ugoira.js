/**
 * うごイラの再生。
 *
 * zip (img-zip-ugoira) は CORS 可なので、ページから直接 fetch する。(background を通さない)
 * zip の中身は全て STORE (無圧縮) なので、zip ライブラリは使わず受信しながら切り出す。
 * 先頭の数コマが読めた時点で再生を始め、残りは届いた順に足していく。
 * フレームは ImageBitmap で持たず、Blob URL + Image にしてデコードはブラウザへ任せる。
 * (全フレームを ImageBitmap で持つとメモリを大きく食う)
 * Blob URL は Image が読み終えたら revoke する。読み込み中に閉じたら閉じるときに revoke する。
 */
import { safeCdnUrl } from '../../pixiv/endpoints.js';
import { fetchUgoiraMeta } from '../../pixiv/illust-assets.js';
import { parseStoredZip, createStoredZipReader } from '../../pixiv/ugoira-zip.js';
import { assignImageSrc } from '../../common/image-source.js';
import { IMAGE_QUALITY, UGOIRA_START_FRAMES, UGOIRA_PLAYBACK_RATES, DEFAULT_UGOIRA_RATE } from '../../common/constants.js';
import { warn } from '../../common/log.js';
import { createUgoiraControls } from './ugoira-controls.js';

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
 * canvas の画素の寸法を決める。コマが静止画 (poster) より小さければ、静止画の幅まで縦横比を保って広げる。
 * canvas の表示寸法は画素の寸法で決まるので、再生が始まった瞬間に絵が縮まないようにするため。
 * 縦横比のずれがコマの縮小の丸め (コマの 1px 分) に収まるなら静止画の高さに揃える。(1px でも絵が動いて見える)
 * コマのほうが大きい (原寸の zip) ときはコマの寸法のままにして解像度を落とさない。
 * @param {{width: number, height: number}} frame 最初のコマの寸法
 * @param {{width: number, height: number}|null} poster 読めている静止画の寸法。読めていなければ null
 * @returns {{width: number, height: number}} canvas の width / height
 */
export function canvasSize(frame, poster) {
	if (!poster || !(poster.width > frame.width)) return { width: frame.width, height: frame.height };
	const scale = poster.width / frame.width;
	const height = frame.height * scale;
	return { width: poster.width, height: Math.abs(height - poster.height) <= scale ? poster.height : Math.round(height) };
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
 * @param {number} [state.rate] 再生速度 (倍率)。各コマの待ち時間をこれで割る。省くと等速
 * @returns {{index: number, startedAt: number, advanced: number, stalled: boolean}} 次のフレーム番号・開始時刻・進めたコマ数・次のコマ待ちか
 */
export function advanceFrame({ now, startedAt, index, timings, complete = true, rate = DEFAULT_UGOIRA_RATE }) {
	let elapsed = now - startedAt;
	let nextIndex = index;
	let advanced = 0;
	while (elapsed >= timings[nextIndex].delay / rate) {
		if (!complete && nextIndex === timings.length - 1) {
			return { index: nextIndex, startedAt: now - elapsed, advanced, stalled: true };
		}
		elapsed -= timings[nextIndex].delay / rate;
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
 * @property {typeof fetch} [fetchImpl] zip の通信の差し替え。テストから pixiv を叩かないために使う
 * @property {(url: string, deps?: object, init?: RequestInit) => Promise<unknown>} [getJsonImpl] ugoira_meta の取得の差し替え。client.js の getJson と同じ形
 * @property {number} [rate] 最初の再生速度 (倍率)。UGOIRA_PLAYBACK_RATES に無ければ等速
 * @property {(rate: number) => void} [onRateChange] 再生速度が選ばれたら呼ぶ。次に開く作品へ引き継ぐために使う
 * @property {() => HTMLImageElement} [createImage] フレーム用 Image の差し替え。Node には Image が無い
 * @property {(callback: FrameRequestCallback) => number} [requestAnimationFrame] コマ送りの差し替え
 * @property {(id: number) => void} [cancelAnimationFrame] コマ送りの停止の差し替え
 * @property {(callback: () => void, delay: number) => number} [setTimeout] 次のコマまで眠るタイマの差し替え
 * @property {(id: number) => void} [clearTimeout] タイマの停止の差し替え
 */

/**
 * うごイラ再生器を作る。
 * @param {UgoiraDeps} deps 依存
 * @returns {{render: (detail: object) => Promise<void>, consumeKey: (event: KeyboardEvent) => boolean, dispose: () => void}}
 */
export function createUgoiraPlayer(deps) {
	const { doc, container, strings } = deps;
	const fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
	const createImage = deps.createImage ?? (() => new Image());
	const raf = deps.requestAnimationFrame ?? ((callback) => requestAnimationFrame(callback));
	const caf = deps.cancelAnimationFrame ?? ((id) => cancelAnimationFrame(id));
	const later = deps.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
	const cancelLater = deps.clearTimeout ?? ((id) => clearTimeout(id));

	/** @type {Set<string>} 読み込み中の Image に渡した Blob URL。読み終えたら外して revoke し、残りは dispose で revoke する */
	let objectUrls = new Set();
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
	/** @type {ReturnType<typeof createUgoiraControls>|null} 操作の帯 (再生ボタン・シークバー・速度) */
	let controls = null;
	/** 再生速度 (倍率) */
	let rate = UGOIRA_PLAYBACK_RATES.includes(deps.rate) ? deps.rate : DEFAULT_UGOIRA_RATE;
	/** シークバーをつかむ前に再生していたか。離したら戻す */
	let resumeAfterSeek = false;
	/** meta にあるコマの数。読み込みの途中でもシークバーの長さはこれで決める */
	let totalFrames = 0;
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
	/** zip の取得を途中で止めるためのもの。dispose で abort する */
	const aborter = new AbortController();

	/**
	 * ugoira_meta を得る。同じ作品の分は覚えたもの (前後の作品の先読みで温めた分を含む) を使う。
	 * 覚えた Promise は共有なので止めない。dispose の後に届いた結果は呼び出し側が disposed で捨てる。
	 * @param {string} workId 作品 ID
	 * @returns {Promise<object>} ugoira_meta の body
	 */
	function loadMeta(workId) {
		return fetchUgoiraMeta(workId, strings.lang, deps.getJsonImpl ? { getJsonImpl: deps.getJsonImpl } : {});
	}

	/**
	 * 次のコマの期限まで眠り、起きたら requestAnimationFrame で描く時刻を合わせる。
	 * @param {number} now 今の時刻 (requestAnimationFrame の時刻)
	 * @returns {void}
	 */
	function scheduleNext(now) {
		const current = playable[frameIndex];
		const wait = Math.max(0, current.delay / rate - (now - frameStartedAt) - TIMER_SLACK_MS);
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
			frameStartedAt = now - playable[frameIndex].delay / rate;
		}
		const next = advanceFrame({ now, startedAt: frameStartedAt, index: frameIndex, timings: playable, complete, rate });
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
		// 透過のある形式は前のコマを消さないと重なって透ける
		if (mimeType !== DEFAULT_FRAME_MIME) context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
		controls?.setFrame(frameIndex, seekLength());
	}

	/**
	 * シークバーの長さ (全体のコマ数)。揃うまでは meta の数、揃ったら壊れたコマを除いた数。
	 * @returns {number} コマ数
	 */
	function seekLength() {
		return complete ? playable.length : Math.max(totalFrames, playable.length);
	}

	/**
	 * 予約しているタイマと requestAnimationFrame を取り消し、再生中なら今の時刻から数え直す。
	 * 位置を飛ばしたときに使う。(前の位置の期限で起きると、飛んだ先のコマを一瞬で送ってしまう)
	 * @returns {void}
	 */
	function restartClock() {
		if (timerId) cancelLater(timerId);
		timerId = 0;
		if (rafId) caf(rafId);
		rafId = 0;
		stalled = false;
		resuming = false;
		frameStartedAt = 0;
		if (playing) rafId = raf(tick);
	}

	/**
	 * 指定のコマへ飛ぶ。まだ読めていないコマへは飛ばず、読めている最後のコマで止める。
	 * @param {number} index 飛び先のコマ番号 (0 始まり)
	 * @returns {void}
	 */
	function seekTo(index) {
		if (!started || playable.length === 0 || !Number.isFinite(index)) return;
		frameIndex = Math.min(Math.max(0, Math.trunc(index)), playable.length - 1);
		draw();
		restartClock();
	}

	/**
	 * 再生速度を変える。今のコマの経過は持ち越し、次の期限から新しい速度で数える。
	 * @param {number} next 再生速度 (倍率)
	 * @returns {void}
	 */
	function setRate(next) {
		if (!UGOIRA_PLAYBACK_RATES.includes(next) || next === rate) return;
		rate = next;
		deps.onRateChange?.(next);
		// 眠っているタイマは前の速度の期限で起きるので、今の時刻から測り直す
		if (playing && timerId) {
			cancelLater(timerId);
			timerId = 0;
			rafId = raf(tick);
		}
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
		controls?.setPlaying(true);
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
		controls?.setPlaying(false);
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
	 * 再生できないことを伝える。以後に届いたコマでは再生を始めず、残りの受信も止める。
	 * @param {unknown} error 理由
	 * @returns {void}
	 */
	function fail(error) {
		failed = true;
		aborter.abort();
		// 静止画は出ているので、動かないことだけを伝える
		showPaneError(strings.ugoira.PLAY_FAILED);
		warn('failed to play ugoira', workId, error);
	}

	/**
	 * canvas を出して再生を始める。寸法は最初に再生できるコマと、出ている静止画で決める。
	 * @returns {void}
	 */
	function startPlayback() {
		started = true;
		const first = playable[0].image;
		const posterShown = poster.naturalWidth > 0 && poster.naturalHeight > 0;
		const size = canvasSize(
			{ width: first.naturalWidth, height: first.naturalHeight },
			posterShown ? { width: poster.naturalWidth, height: poster.naturalHeight } : null,
		);
		canvas.width = size.width;
		canvas.height = size.height;
		// JPEG は透過しないので、透過を切って合成の手間を省く
		context = canvas.getContext('2d', mimeType === DEFAULT_FRAME_MIME ? { alpha: false } : undefined);
		canvas.hidden = false;
		poster.hidden = true;
		controls.element.hidden = false;
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
		if (grew) {
			controls?.setLoaded(playable.length, seekLength());
			if (started) controls?.setFrame(frameIndex, seekLength());
		}
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
		objectUrls.add(url);
		pendingLoads += 1;
		const image = createImage();
		let settled = false;
		/**
		 * 読めたか失敗したかを記録する。デコードに失敗したコマは naturalWidth が 0 になり、
		 * drawImage に渡すと例外で tick が止まるので、印を付けて待ち時間ごと飛ばす。
		 * 読み終えた Image は中身を自分で持つので、Blob URL はここで手放す。
		 * @returns {void}
		 */
		const settle = () => {
			if (settled) return;
			settled = true;
			pendingLoads -= 1;
			if (objectUrls.delete(url)) URL.revokeObjectURL(url);
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
				if (done || disposed || failed) return;
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

			// 再生が始まるまでは隠す。静止画の間に押せる操作は無い
			controls = createUgoiraControls({
				doc,
				strings,
				rate,
				onToggle: () => {
					if (playing) pause();
					else play();
				},
				onSeekStart: () => {
					// つかんでいる間は止める。動かすとつまみが指の下から逃げる
					resumeAfterSeek = playing;
					if (playing) pause();
				},
				onSeek: seekTo,
				onSeekEnd: () => {
					if (resumeAfterSeek) play();
					resumeAfterSeek = false;
				},
				onRate: setRate,
			});
			controls.element.hidden = true;

			wrapper.append(poster, canvas, controls.element);
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
				totalFrames = metaFrames.length;
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
					// 失敗を出した後の abort は伝え直さない
					if (disposed || failed) return;
					// 読めない形式ならエントリを返していないので、待たずに失敗にする
					if (!started && error?.message === REASONS.UNSUPPORTED_ZIP) throw error;
					// 再生の前でも後でも、届いた分で 1 コマでも再生できるなら再生する
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
		 * キーを食い止める。速度のメニューを開いているときだけ。(Escape で閉じる・上下で項目を移る)
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			return controls?.consumeKey(event) === true;
		},

		/**
		 * 資源を解放する。読み込み中の Image に渡した Blob URL は、revoke しないとメモリが残る。
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
			objectUrls = new Set();
			frames = [];
			claimed = [];
			indexByName = new Map();
			playable = [];
			canvas = null;
			context = null;
			poster = null;
			controls?.dispose();
			controls = null;
			// 読み込み中の Image を待っている render を終わらせる
			notifyIdle();
		},
	};
}
