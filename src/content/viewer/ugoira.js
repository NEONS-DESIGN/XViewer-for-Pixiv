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
import { IMAGE_QUALITY } from '../../common/constants.js';

/** delay が読めなかったときに使う待ち時間 (ミリ秒)。 */
const FALLBACK_DELAY = 100;

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
 * @typedef {object} UgoiraDeps
 * @property {Document} doc
 * @property {HTMLElement} container 描画先 (.stage)
 * @property {object} settings 設定
 * @property {(message: string) => void} onError 失敗を伝える
 */

/**
 * うごイラ再生器を作る。
 * @param {UgoiraDeps} deps 依存
 * @returns {{render: (detail: object) => Promise<void>, dispose: () => void}}
 */
export function createUgoiraPlayer(deps) {
	const { doc, container } = deps;

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

	/**
	 * 1 コマ描いて次へ進める。
	 * @param {number} now requestAnimationFrame の時刻
	 * @returns {void}
	 */
	function tick(now) {
		if (!playing || disposed) return;
		if (frameStartedAt === 0) frameStartedAt = now;
		const elapsed = now - frameStartedAt;
		if (elapsed >= timings[frameIndex].delay) {
			frameIndex = (frameIndex + 1) % images.length;
			frameStartedAt = now;
			draw();
		}
		rafId = requestAnimationFrame(tick);
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
		rafId = requestAnimationFrame(tick);
	}

	/**
	 * 再生を止める。
	 * @returns {void}
	 */
	function pause() {
		playing = false;
		cancelAnimationFrame(rafId);
		rafId = 0;
	}

	/**
	 * フレームの画像を読み込む。
	 * @param {Array<{bytes: Uint8Array, delay: number}>} frames フレーム
	 * @param {string} mimeType zip 内の画像の形式
	 * @returns {Promise<void>}
	 */
	async function loadImages(frames, mimeType) {
		const loaders = frames.map((frame) => {
			const url = URL.createObjectURL(new Blob([frame.bytes], { type: mimeType }));
			objectUrls.push(url);
			return new Promise((resolve) => {
				const image = new Image();
				// decode() は使わない。DOM に繋がっていない Image では
				// 画像が読めていても解決しないことがあり (実機で確認)、
				// そうなると Promise.all が永久に待って再生が始まらないまま静止画で止まる。
				// load / error は繋がっていなくても必ず発火する。
				// 失敗しても再生は続けたいので、error でも image を返して次の関門に任せる
				image.addEventListener('load', () => resolve(image), { once: true });
				image.addEventListener('error', () => resolve(image), { once: true });
				image.src = url;
			});
		});
		images = await Promise.all(loaders);
		timings = frames.map((frame) => ({ delay: frame.delay }));
	}

	return {
		/**
		 * うごイラを描画して再生を始める。
		 * @param {object} detail 正規化した作品詳細
		 * @returns {Promise<void>}
		 */
		async render(detail) {
			container.querySelectorAll('.status, .frame, .blocked, .ugoira').forEach((node) => node.remove());

			const wrapper = doc.createElement('div');
			wrapper.className = 'ugoira';
			root = wrapper;

			// zip を待つ間は静止画を出して待たせない
			const poster = doc.createElement('img');
			poster.className = 'ugoira-poster';
			poster.alt = detail.title;
			poster.src = detail.urls.regular ?? '';

			canvas = doc.createElement('canvas');
			canvas.className = 'ugoira-canvas';
			canvas.hidden = true;

			const toggle = doc.createElement('button');
			toggle.type = 'button';
			toggle.className = 'ugoira-toggle';
			toggle.setAttribute('aria-label', '一時停止');
			toggle.title = '一時停止';
			toggle.appendChild(createIcon(doc, 'pause'));
			toggle.hidden = true;
			toggle.addEventListener('click', () => {
				if (playing) {
					pause();
					toggle.setAttribute('aria-label', '再生');
					toggle.title = '再生';
					toggle.textContent = '';
					toggle.appendChild(createIcon(doc, 'play'));
				} else {
					play();
					toggle.setAttribute('aria-label', '一時停止');
					toggle.title = '一時停止';
					toggle.textContent = '';
					toggle.appendChild(createIcon(doc, 'pause'));
				}
			});

			wrapper.append(poster, canvas, toggle);
			container.appendChild(wrapper);

			try {
				const meta = await getJson(ugoiraMetaUrl(detail.id));
				if (disposed) return;

				// API が返した値をそのまま外部オリジンへ投げない
				const zipUrl = safeCdnUrl(pickZipUrl(meta, deps.settings.imageQuality));
				if (!zipUrl) throw new Error('zip の URL が pixiv の CDN ではありません');
				const response = await fetch(zipUrl, { mode: 'cors' });
				if (!response.ok) throw new Error(`zip の取得に失敗しました: ${response.status}`);
				const buffer = await response.arrayBuffer();
				if (disposed) return;

				const frames = buildFrames(parseStoredZip(buffer), meta.frames);
				if (frames.length === 0) throw new Error('フレームがありません');

				await loadImages(frames, meta.mime_type ?? 'image/jpeg');
				if (disposed) return;

				// デコードに失敗すると 0 になる。0x0 の canvas に描いても無言で何も出ないので、
				// 静止画のまま catch へ落として理由を出す
				const width = images[0].naturalWidth;
				const height = images[0].naturalHeight;
				if (!width || !height) throw new Error('フレームの画像をデコードできませんでした');
				canvas.width = width;
				canvas.height = height;
				context = canvas.getContext('2d');
				canvas.hidden = false;
				poster.hidden = true;
				toggle.hidden = false;
				frameIndex = 0;
				draw();
				play();
			} catch (error) {
				if (disposed) return;
				// 静止画は出ているので、動かないことだけを伝える
				deps.onError('うごイラを再生できませんでした');
				console.warn('[PixivMaster] failed to play ugoira', detail.id, error);
			}
		},

		/**
		 * 資源を解放する。Blob URL を revoke しないとメモリが残る。
		 * @returns {void}
		 */
		dispose() {
			disposed = true;
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
