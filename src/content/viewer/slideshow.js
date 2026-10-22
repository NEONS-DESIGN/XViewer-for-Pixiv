/**
 * 自動送り (スライドショー) の状態機械。計時と、どこへ送るかの判断だけを持つ。
 *
 * DOM には触れない。ページ・作品の移動とタイマーはすべて注入で受け取るので、
 * 偽のタイマーを渡せば単体で確かめられる。
 */
import { SLIDESHOW_MODES, MS_PER_SECOND } from '../../common/constants.js';
import { slideshowIntervalSeconds } from '../../common/storage.js';
import { warn } from '../../common/log.js';

/** 計時を一時的に止める理由。1 つでも立っていれば計時しない */
const SUSPEND_REASONS = Object.freeze(['zoom', 'hidden', 'typing', 'panel']);

/** 次へ送る向き */
const FORWARD = 1;

/** 前へ戻す向き */
const BACKWARD = -1;

/** 1 ページ目の添字 */
const FIRST_PAGE_INDEX = 0;

/** ページ数が分からない (画像の無いペイン) ときに仮に使うページ数 */
const UNKNOWN_PAGE_COUNT = 1;

/** 作品を離れられないので送らずに留まった、という送りの結果 */
const HELD = 'held';

/**
 * 自動送りが使う依存。
 * @typedef {object} SlideshowDeps
 * @property {() => object} getSettings 今の設定 (正規化済み)。呼ぶたびに読み直す
 * @property {(direction: 1|-1) => boolean} canMovePage 作品の中でその向きへページを送れるか
 * @property {(direction: 1|-1) => void} movePage 作品の中でページを送る
 * @property {(index: number) => void} showPage 作品の中の指定のページへ移る
 * @property {() => number|null} pageCount 今の作品のページ数。画像の無いペインでは null
 * @property {(direction: 1|-1) => Promise<boolean>} moveWork 隣の作品へ移る。移れたら true
 * @property {() => Promise<boolean>} moveToFirst 並びの先頭の作品へ移る。移れたら true
 * @property {() => string|null} currentWorkId 今開いている作品の ID
 * @property {() => boolean} [canLeaveWork] タイマーで今の作品を離れてよいか。省くと常に離れてよい
 * @property {(state: SlideshowState) => void} onChange 再生中か・計時の長さが変わったときに呼ばれる
 * @property {(callback: () => void, ms: number) => unknown} setTimeout タイマーを張る
 * @property {(handle: unknown) => void} clearTimeout タイマーを外す
 */

/**
 * コントローラーへ知らせる状態。
 * @typedef {object} SlideshowState
 * @property {boolean} playing 再生中か
 * @property {number|null} durationMs 計時中ならその長さ (ミリ秒)。計時していなければ null
 */

/**
 * 自動送りの操作口。
 * @typedef {object} Slideshow
 * @property {() => void} play 再生を始める。表示済みならその場で計時を始める。再生中かモードが off なら何もしない
 * @property {() => void} pause 再生を止め、計時をやめる
 * @property {() => void} toggle 再生と停止を切り替える
 * @property {() => boolean} isPlaying 再生中か
 * @property {(direction: 1|-1) => Promise<void>} step 前後ボタンからの送り。再生 / 停止は変えない。作品の移動を待っている間は何もしない。reject しない
 * @property {() => void} pageShown 今のページが表示し終わった。再生中なら計時を最初から始める
 * @property {() => void} pageLoading 作品の中で別のページの読み込みを待ち始めた。表示し終わるまで計時しない
 * @property {() => void} workLoading 作品を開き始めた。表示し終わるまで計時しない
 * @property {(reason: 'zoom'|'hidden'|'typing'|'panel', on: boolean) => void} setSuspended 計時を止める理由を立てる / 下ろす
 * @property {() => void} refresh 設定が変わった。off なら停止し、計時中なら新しい間隔で数え直す
 * @property {() => void} reset ビュワーを閉じた。停止し、理由も表示済みも捨てる
 */

/**
 * 自動送りの状態機械を作る。開いた直後は停止している。
 *
 * 送りの入口は 2 つある。
 * - タイマーが切れたとき (内部の advance): 送るものが無ければ停止する。今の作品を離れられなければ送らずに数え直す
 * - 前後ボタン (step): 再生 / 停止は変えない。送るものが無ければ、再生中なら計時を最初からやり直す
 * どちらも送り先の判断は同じ関数 (decide) で行う。
 * 作品の移動 (moveWork / moveToFirst) を待っている間は計時せず、新しい送りも受け付けない。
 * @param {SlideshowDeps} deps 依存
 * @returns {Slideshow}
 */
export function createSlideshow(deps) {
	const schedule = deps.setTimeout;
	const cancel = deps.clearTimeout;
	const canLeaveWork = () => (deps.canLeaveWork ? deps.canLeaveWork() : true);

	let playing = false;
	let shown = false;
	const suspended = new Set();
	/** @type {unknown} */
	let timer = null;
	/** @type {number|null} */
	let durationMs = null;
	/** 送りの世代。新しい送り・停止・reset のたびに進め、古い送りの結果を捨てるのに使う */
	let generation = 0;
	/** 作品の移動を待っている間は true */
	let workMovePending = false;
	/** 最後に知らせた状態。開いた直後の状態 (停止・計時なし) は知らせ済みとみなす */
	let lastNotified = { playing: false, durationMs: null };

	/**
	 * 今のモードを返す。
	 * @returns {string}
	 */
	function mode() {
		return deps.getSettings()?.slideshow ?? SLIDESHOW_MODES.OFF;
	}

	/**
	 * ループがオンか。
	 * @returns {boolean}
	 */
	function loopEnabled() {
		return deps.getSettings()?.slideshowLoop === true;
	}

	/**
	 * 今の状態をコントローラーへ知らせる。直前に知らせたものと同じなら知らせない。
	 * @returns {void}
	 */
	function notify() {
		const state = { playing, durationMs };
		if (lastNotified.playing === state.playing && lastNotified.durationMs === state.durationMs) return;
		lastNotified = state;
		try {
			deps.onChange(state);
		} catch (error) {
			warn('自動送りの状態の通知に失敗しました', error);
		}
	}

	/**
	 * 計時をやめる。知らせはしない。
	 * @returns {void}
	 */
	function clearTimer() {
		if (timer === null) return;
		cancel(timer);
		timer = null;
		durationMs = null;
	}

	/**
	 * 計時を止めて知らせる。
	 * @returns {void}
	 */
	function stopCounting() {
		clearTimer();
		notify();
	}

	/**
	 * 計時できる状態か。(再生中・表示済み・止める理由が無い・作品の移動を待っていない)
	 * @returns {boolean}
	 */
	function canCount() {
		return playing && shown && suspended.size === 0 && !workMovePending;
	}

	/**
	 * 計時できる状態なら、今の間隔で最初から数え直す。できなければ計時をやめる。
	 * 計時中に数え直すときは、いったん止めたことも知らせる。(同じ長さでもコントローラーが数え直しに気づけるように)
	 * @returns {void}
	 */
	function restartCounting() {
		stopCounting();
		if (canCount()) {
			const ms = slideshowIntervalSeconds(deps.getSettings()) * MS_PER_SECOND;
			if (Number.isFinite(ms) && ms > 0) {
				durationMs = ms;
				timer = schedule(onTimer, ms);
			} else {
				warn('自動送りの間隔が不正なので計時しません', ms);
			}
		}
		notify();
	}

	/**
	 * 作品の中でページを移る。移った先の pageShown まで計時しない。
	 * @param {() => void} move 実際に移る処理
	 * @returns {boolean} 常に true (移った)
	 */
	function movePageLocally(move) {
		shown = false;
		stopCounting();
		move();
		return true;
	}

	/**
	 * 作品の移動を待つ。待っている間は計時しない。例外は警告を出して「移れなかった」とみなす。
	 * @param {() => Promise<boolean>} move 作品を移る処理
	 * @returns {Promise<boolean>} 移れたら true
	 */
	async function awaitWorkMove(move) {
		workMovePending = true;
		try {
			return (await move()) === true;
		} catch (error) {
			warn('自動送りで作品を移れませんでした', error);
			return false;
		} finally {
			workMovePending = false;
		}
	}

	/**
	 * 送りを始めた時点の目印を控える。
	 * @returns {{generation: number, workId: string|null}}
	 */
	function captureToken() {
		generation += 1;
		return { generation, workId: deps.currentWorkId() };
	}

	/**
	 * 控えた目印から状況が変わったか。(別の作品へ移った・新しい送り / 停止 / reset があった)
	 * @param {{generation: number, workId: string|null}} token captureToken の戻り値
	 * @returns {boolean}
	 */
	function isStale(token) {
		return token.generation !== generation || token.workId !== deps.currentWorkId();
	}

	/**
	 * 今のページ数を返す。分からなければ 1 とみなす。
	 * @returns {number}
	 */
	function knownPageCount() {
		return deps.pageCount() ?? UNKNOWN_PAGE_COUNT;
	}

	/**
	 * 今の作品を離れる送りを止めるか。止めるのはタイマーからの送りで、離れられないときだけ。
	 * @param {boolean} automatic タイマーからの送りか
	 * @returns {boolean} 止めるなら true
	 */
	function holdsWork(automatic) {
		return automatic && !canLeaveWork();
	}

	/**
	 * 次へ送る先を決めて送る。
	 * @param {{generation: number, workId: string|null}} token 送りの目印
	 * @param {boolean} automatic タイマーからの送りか
	 * @returns {Promise<boolean|null|'held'>} 送ったら true、送るものが無ければ false、途中で状況が変わったら null、
	 *   作品を離れられずに留まったら 'held'
	 */
	async function decideForward(token, automatic) {
		if (deps.canMovePage(FORWARD)) return movePageLocally(() => deps.movePage(FORWARD));
		const current = mode();
		if (current === SLIDESHOW_MODES.WORK) {
			if (loopEnabled() && knownPageCount() > 1) return movePageLocally(() => deps.showPage(FIRST_PAGE_INDEX));
			return false;
		}
		if (current !== SLIDESHOW_MODES.SEQUENCE) return false;
		if (holdsWork(automatic)) return HELD;
		const movedToNext = await awaitWorkMove(() => deps.moveWork(FORWARD));
		if (isStale(token)) return null;
		if (movedToNext) return true;
		if (!loopEnabled()) return false;
		if (holdsWork(automatic)) return HELD;
		const movedToFirst = await awaitWorkMove(() => deps.moveToFirst());
		if (isStale(token)) return null;
		if (movedToFirst) return true;
		/* 今の作品が並びの先頭 (並びが 1 件) なら、ページだけ 1 ページ目へ戻す */
		if (knownPageCount() <= 1) return false;
		return movePageLocally(() => deps.showPage(FIRST_PAGE_INDEX));
	}

	/**
	 * 前へ戻す先を決めて戻す。
	 * @param {{generation: number, workId: string|null}} token 送りの目印
	 * @returns {Promise<boolean|null>} 戻したら true、戻すものが無ければ false、途中で状況が変わったら null
	 */
	async function decideBackward(token) {
		if (deps.canMovePage(BACKWARD)) return movePageLocally(() => deps.movePage(BACKWARD));
		const current = mode();
		if (current === SLIDESHOW_MODES.WORK) {
			const count = knownPageCount();
			if (loopEnabled() && count > 1) return movePageLocally(() => deps.showPage(count - 1));
			return false;
		}
		if (current !== SLIDESHOW_MODES.SEQUENCE) return false;
		const moved = await awaitWorkMove(() => deps.moveWork(BACKWARD));
		if (isStale(token)) return null;
		return moved;
	}

	/**
	 * 送り先を決めて送る。依存の例外は警告を出して「送るものが無い」とみなす。
	 * @param {1|-1} direction 向き
	 * @param {{generation: number, workId: string|null}} token 送りの目印
	 * @param {boolean} [automatic] タイマーからの送りか。省くとボタンからの送り
	 * @returns {Promise<boolean|null|'held'>} 送ったら true、送るものが無ければ false、途中で状況が変わったら null、
	 *   作品を離れられずに留まったら 'held'
	 */
	async function decide(direction, token, automatic = false) {
		try {
			return direction === BACKWARD ? await decideBackward(token) : await decideForward(token, automatic);
		} catch (error) {
			warn('自動送りの送りに失敗しました', error);
			return isStale(token) ? null : false;
		}
	}

	/**
	 * 送りを終えたあと、計時が止まったままで計時できる状態なら数え直す。
	 * (作品の移動を待っている間に送った先の表示が終わっていた・移れずに今のページのままだった、のとき)
	 * @returns {void}
	 */
	function resumeCountingAfterStep() {
		if (timer === null && canCount()) restartCounting();
	}

	/**
	 * タイマーが切れたときの送り。送るものが無ければ停止する。待っている間に停止されたら結果を捨てる。
	 * 作品を離れられずに留まったときは、停止せずに最初から数え直す。
	 * @returns {Promise<void>}
	 */
	async function advance() {
		if (workMovePending) return;
		const token = captureToken();
		const result = await decide(FORWARD, token, true);
		if (result === false && !isStale(token)) pause();
		else resumeCountingAfterStep();
	}

	/**
	 * タイマーが切れた。
	 * @returns {void}
	 */
	function onTimer() {
		timer = null;
		durationMs = null;
		notify();
		advance().catch((error) => { warn('自動送りの送りに失敗しました', error); });
	}

	/** @type {Slideshow['play']} */
	function play() {
		if (playing || mode() === SLIDESHOW_MODES.OFF) return;
		playing = true;
		restartCounting();
	}

	/** @type {Slideshow['pause']} */
	function pause() {
		generation += 1;
		playing = false;
		stopCounting();
	}

	/** @type {Slideshow['toggle']} */
	function toggle() {
		if (playing) pause();
		else play();
	}

	/** @type {Slideshow['step']} */
	async function step(direction) {
		if (workMovePending) return;
		try {
			const token = captureToken();
			stopCounting();
			await decide(direction === BACKWARD ? BACKWARD : FORWARD, token);
			resumeCountingAfterStep();
		} catch (error) {
			warn('自動送りの送りに失敗しました', error);
		}
	}

	/** @type {Slideshow['pageShown']} */
	function pageShown() {
		shown = true;
		restartCounting();
	}

	/** @type {Slideshow['pageLoading']} */
	function pageLoading() {
		shown = false;
		stopCounting();
	}

	/** @type {Slideshow['workLoading']} */
	function workLoading() {
		shown = false;
		stopCounting();
	}

	/** @type {Slideshow['setSuspended']} */
	function setSuspended(reason, on) {
		if (!SUSPEND_REASONS.includes(reason)) {
			warn('自動送りの一時停止の理由が不明です', reason);
			return;
		}
		if (on) {
			suspended.add(reason);
			stopCounting();
			return;
		}
		if (!suspended.delete(reason)) return;
		if (suspended.size === 0) restartCounting();
	}

	/** @type {Slideshow['refresh']} */
	function refresh() {
		if (mode() === SLIDESHOW_MODES.OFF) {
			pause();
			return;
		}
		if (timer !== null) restartCounting();
	}

	/** @type {Slideshow['reset']} */
	function reset() {
		generation += 1;
		playing = false;
		shown = false;
		suspended.clear();
		stopCounting();
	}

	return {
		play,
		pause,
		toggle,
		isPlaying: () => playing,
		step,
		pageShown,
		pageLoading,
		workLoading,
		setSuspended,
		refresh,
		reset,
	};
}
