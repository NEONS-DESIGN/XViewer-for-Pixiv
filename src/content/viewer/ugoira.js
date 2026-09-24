/**
 * うごイラの再生。
 *
 * SITE_SPEC §4 の実測により、次のことが分かっている:
 *   - img-zip-ugoira は CORS 可。ページから直接 fetch できる (background 不要)
 *   - zip の中身は全て STORE (無圧縮)。zip ライブラリ不要
 *   - 70 フレームで 4.7MB (600x600) / 12.7MB (原寸)
 *
 * ImageBitmap を全フレーム持つと 540x960 x 70 枚で約 145MB になるため、
 * Blob URL + Image にしてデコードはブラウザへ任せる。
 * Blob URL は閉じるときに必ず revoke する。
 */
import { getJson } from '../../pixiv/client.js';
import { ugoiraMetaUrl, safeCdnUrl } from '../../pixiv/endpoints.js';
import { parseStoredZip } from '../../pixiv/ugoira-zip.js';
import { createIcon } from '../../common/icons.js';
import { assignImageSrc } from '../../common/image-source.js';
import { IMAGE_QUALITY } from '../../common/constants.js';
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
});

/** delay が読めなかったときに使う待ち時間 (ミリ秒)。 */
const FALLBACK_DELAY = 100;

/**
 * 遅れを取り戻すときに一気に進めてよい上限 (ミリ秒)。
 * タブが非可視の間は requestAnimationFrame が止まる。(SITE_SPEC §8) 戻ってきたときに
 * 止まっていた時間ぶんを全部コマ送りすると一瞬で数十フレーム飛ぶので、
 * これを超える遅れは捨てて今の時刻から数え直す。
 */
const MAX_CATCHUP_MS = 500;

/** zip 内の画像の形式が meta に無いときの既定値。SITE_SPEC §4 の実測では常に image/jpeg。 */
const DEFAULT_FRAME_MIME = 'image/jpeg';

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
 * zip のエントリと meta のフレーム情報を突き合わせる。
 * 並び順は meta が持つので、zip の並びには頼らない。
 * @param {Array<{name: string, bytes: Uint8Array}>} entries zip のエントリ
 * @param {Array<{file: string, delay: number}>} metaFrames meta のフレーム
 * @returns {Array<{bytes: Uint8Array, delay: number}>} 再生順のフレーム
 */
export function buildFrames(entries, metaFrames) {
	const byName = new Map(entries.map((entry) => [entry.name, entry.bytes]));
	const frames = [];
	for (const frame of metaFrames ?? []) {
		const bytes = byName.get(frame.file);
		if (!bytes) continue;
		frames.push({ bytes, delay: frame.delay > 0 ? frame.delay : FALLBACK_DELAY });
	}
	return frames;
}

/**
 * 今のフレームの開始時刻を進め、何コマ進めるかを決める。
 *
 * 開始時刻は「前のフレームの開始 + delay」で繰り越す。requestAnimationFrame の
 * 時刻に丸めると 1 コマごとに最大 1 刻み (約 16.7ms) ずつ遅れが積み上がる。
 * 遅れが大きいときは複数コマ進めるが、MAX_CATCHUP_MS を超える遅れは捨てる。
 * @param {object} state 今の状態
 * @param {number} state.now requestAnimationFrame の時刻
 * @param {number} state.startedAt 今のフレームの開始時刻
 * @param {number} state.index 今のフレーム番号
 * @param {Array<{delay: number}>} state.timings 各フレームの待ち時間
 * @returns {{index: number, startedAt: number, advanced: number}} 次のフレーム番号・開始時刻・進めたコマ数
 */
export function advanceFrame({ now, startedAt, index, timings }) {
	let elapsed = now - startedAt;
	let nextIndex = index;
	let advanced = 0;
	while (elapsed >= timings[nextIndex].delay) {
		elapsed -= timings[nextIndex].delay;
		nextIndex = (nextIndex + 1) % timings.length;
		advanced += 1;
		if (elapsed > MAX_CATCHUP_MS) {
			elapsed = 0;
			break;
		}
	}
	return { index: nextIndex, startedAt: now - elapsed, advanced };
}

/**
 * @typedef {object} UgoiraDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先 (.stage)
 * @property {object} settings 設定
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {typeof fetch} [fetchImpl] 通信 (meta と zip) の差し替え。テストから pixiv を叩かないために使う
 * @property {() => HTMLImageElement} [createImage] フレーム用 Image の差し替え。Node には Image が無い
 * @property {(callback: FrameRequestCallback) => number} [requestAnimationFrame] コマ送りの差し替え
 * @property {(id: number) => void} [cancelAnimationFrame] コマ送りの停止の差し替え
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

	/** @type {string[]} 作った Blob URL。dispose で必ず revoke する */
	let objectUrls = [];
	/** @type {HTMLImageElement[]} 各フレームの画像 */
	let images = [];
	/** @type {Array<{delay: number}>} 各フレームの待ち時間 */
	let timings = [];
	/** @type {HTMLCanvasElement|null} */
	let canvas = null;
	/** @type {CanvasRenderingContext2D|null} */
	let context = null;
	/** requestAnimationFrame の ID */
	let rafId = 0;
	/** 今のフレーム番号 */
	let frameIndex = 0;
	/** 今のフレームを表示し始めた時刻 */
	let frameStartedAt = 0;
	/** 再生中か */
	let playing = false;
	/** 破棄済みか。非同期処理の途中で捨てられたときに描かないようにする */
	let disposed = false;
	/** @type {HTMLElement|null} 自分が作った要素。dispose で外す */
	let root = null;
	/** meta と zip の取得を途中で止めるためのもの。dispose で abort する */
	const aborter = new AbortController();

	/**
	 * 1 コマ描いて次へ進める。
	 * @param {number} now requestAnimationFrame の時刻
	 * @returns {void}
	 */
	function tick(now) {
		if (!playing || disposed) return;
		if (frameStartedAt === 0) frameStartedAt = now;
		const next = advanceFrame({ now, startedAt: frameStartedAt, index: frameIndex, timings });
		frameIndex = next.index;
		frameStartedAt = next.startedAt;
		if (next.advanced > 0) draw();
		rafId = raf(tick);
	}

	/**
	 * 今のフレームを canvas に描く。
	 * @returns {void}
	 */
	function draw() {
		if (!context || !images[frameIndex]) return;
		context.drawImage(images[frameIndex], 0, 0, canvas.width, canvas.height);
	}

	/**
	 * 再生を始める。
	 * @returns {void}
	 */
	function play() {
		if (playing || images.length === 0) return;
		playing = true;
		frameStartedAt = 0;
		rafId = raf(tick);
	}

	/**
	 * 再生を止める。
	 * @returns {void}
	 */
	function pause() {
		playing = false;
		caf(rafId);
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
	 * フレームの画像を読み込む。
	 * 結果は戻り値で返す。モジュールの状態には入れない (待っている間に dispose されたときに
	 * 空にしたはずの images を埋め直さないため)
	 * @param {Array<{bytes: Uint8Array, delay: number}>} frames フレーム
	 * @param {string} mimeType zip 内の画像の形式
	 * @returns {Promise<HTMLImageElement[]>} フレーム順の画像。壊れたものも含む
	 */
	function loadImages(frames, mimeType) {
		const loaders = frames.map((frame) => {
			const url = URL.createObjectURL(new Blob([frame.bytes], { type: mimeType }));
			objectUrls.push(url);
			return new Promise((resolve) => {
				const image = createImage();
				// decode() は使わない。DOM に繋がっていない Image では
				// 画像が読めていても解決しないことがあり (実機で確認)、
				// そうなると Promise.all が永久に待って再生が始まらないまま静止画で止まる。
				// load / error は繋がっていなくても必ず発火する。
				// 失敗しても再生は続けたいので、error でも image を返して次の関門に任せる
				image.addEventListener('load', () => resolve(image), { once: true });
				image.addEventListener('error', () => resolve(image), { once: true });
				assignImageSrc(image, url);
			});
		});
		return Promise.all(loaders);
	}

	return {
		/**
		 * うごイラを描画して再生を始める。
		 * ビュワーの状態表示 (.status) は呼び出し側が消してから呼ぶ。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async render(detail) {
			const wrapper = doc.createElement('div');
			wrapper.className = 'ugoira';
			root = wrapper;

			// zip を待つ間は静止画を出して待たせない
			const poster = doc.createElement('img');
			poster.className = 'ugoira-poster';
			poster.alt = detail.title;
			assignImageSrc(poster, detail.urls[IMAGE_QUALITY.REGULAR] ?? '');

			canvas = doc.createElement('canvas');
			canvas.className = 'ugoira-canvas';
			// 再生が始まると poster は隠れる。canvas にも読み上げ用の名前を持たせる (UI_DESIGN_KIT §6)
			canvas.setAttribute('role', 'img');
			canvas.setAttribute('aria-label', detail.title);
			canvas.hidden = true;

			const toggle = doc.createElement('button');
			toggle.type = 'button';
			toggle.className = 'ugoira-toggle';
			/**
			 * ボタンの見た目を再生状態に合わせる。ボタンは「押すと何になるか」を示す。
			 * @param {boolean} isPlaying 再生中か
			 * @returns {void}
			 */
			const setToggle = (isPlaying) => {
				const next = isPlaying ? TOGGLE.PLAYING : TOGGLE.PAUSED;
				const label = strings.ugoira[next.labelKey];
				toggle.setAttribute('aria-label', label);
				toggle.title = label;
				toggle.replaceChildren(createIcon(doc, next.icon));
			};
			setToggle(true);
			toggle.hidden = true;
			toggle.addEventListener('click', () => {
				if (playing) pause();
				else play();
				setToggle(playing);
			});

			wrapper.append(poster, canvas, toggle);
			container.appendChild(wrapper);

			try {
				// meta の要求も dispose で止める。(zip と同じ signal)
				const meta = await getJson(ugoiraMetaUrl(detail.id, strings.lang), { fetchImpl, signal: aborter.signal });
				if (disposed) return;

				// API が返した値をそのまま外部オリジンへ投げない
				const zipUrl = safeCdnUrl(pickZipUrl(meta, deps.settings.imageQuality));
				if (!zipUrl) throw new Error(REASONS.ZIP_NOT_CDN);
				// 作品を送られたら途中でも転送を止める。zip は最大 12.7MB あり、
				// 見ていない作品の分が流れ続けると今見ている作品の取得が遅れる
				const response = await fetchImpl(zipUrl, { mode: 'cors', signal: aborter.signal });
				if (!response.ok) throw new Error(`${REASONS.ZIP_FETCH}: ${response.status}`);
				const buffer = await response.arrayBuffer();
				if (disposed) return;

				const frames = buildFrames(parseStoredZip(buffer), meta.frames);
				if (frames.length === 0) throw new Error(REASONS.NO_FRAMES);

				const loaded = await loadImages(frames, meta.mime_type ?? DEFAULT_FRAME_MIME);
				if (disposed) return;

				// デコードに失敗したフレームは naturalWidth が 0 になる。そのまま drawImage に渡すと
				// 例外で tick が止まり、ボタンが「一時停止」のまま動かなくなる。
				// 壊れたコマだけを待ち時間ごと落とし、残りで再生する
				images = [];
				timings = [];
				loaded.forEach((image, at) => {
					if (!image.naturalWidth || !image.naturalHeight) return;
					images.push(image);
					timings.push({ delay: frames[at].delay });
				});
				// 全部落ちたら 0x0 の canvas に描いても無言で何も出ないので、静止画のまま理由を出す
				if (images.length === 0) throw new Error(REASONS.DECODE);

				canvas.width = images[0].naturalWidth;
				canvas.height = images[0].naturalHeight;
				context = canvas.getContext('2d');
				canvas.hidden = false;
				poster.hidden = true;
				toggle.hidden = false;
				frameIndex = 0;
				draw();
				play();
			} catch (error) {
				// 破棄後の失敗 (abort を含む) は伝えない。枠ごと消えている
				if (disposed) return;
				// 静止画は出ているので、動かないことだけを伝える
				showPaneError(strings.ugoira.PLAY_FAILED);
				warn('failed to play ugoira', detail.id, error);
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
			images = [];
			timings = [];
			canvas = null;
			context = null;
		},
	};
}
