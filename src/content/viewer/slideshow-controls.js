/**
 * 自動送りの操作の帯。前へ・再生 / 停止・次へ・ループ・送る間隔を、ステージの下端に並べる。
 *
 * 計時や送りの判断は slideshow.js が持つ。ここは描画と入力の受け渡しだけで、
 * 押されたことをコールバックで伝え、setState / setSettings で状態を受け取る。
 *
 * 送る間隔のパネルは role="dialog" の中に radiogroup を置く。radio の慣例どおり、
 * 矢印キーで選び直すとその場で確定する。キーは consumeKey() で受ける。
 * ビュワー本体が document の捕捉フェーズで矢印キーと Escape を作品の移動と閉じるのに使っているため。
 */
import { createIcon } from '../../common/icons.js';
import {
	KEYS,
	SLIDESHOW_CONTROLS_IDLE_MS,
	SLIDESHOW_INTERVAL_CHOICES,
	SLIDESHOW_INTERVAL_CUSTOM,
	SLIDESHOW_INTERVAL_CUSTOM_RANGE,
} from '../../common/constants.js';
import { slideshowIntervalSeconds } from '../../common/storage.js';
import { hasFocusWithin } from './focus.js';

/** 再生ボタンの表示。キーは今の再生状態、値は「押すと何になるか」。アイコンは言語に依らない。 */
const TOGGLE = Object.freeze({
	PLAYING: Object.freeze({ icon: 'pause', labelKey: 'PAUSE' }),
	PAUSED: Object.freeze({ icon: 'play', labelKey: 'PLAY' }),
});

/** 送る間隔の項目に並べる値。秒数の選択肢の後ろにカスタムを置く。 */
const INTERVAL_OPTIONS = Object.freeze([...SLIDESHOW_INTERVAL_CHOICES, SLIDESHOW_INTERVAL_CUSTOM]);

/** 送る間隔の項目の中で使うキー。選択を次 / 前へ動かすキーと、端へ動かすキー。 */
const RADIO_KEYS = Object.freeze({
	NEXT: Object.freeze(['ArrowDown', 'ArrowRight']),
	PREV: Object.freeze(['ArrowUp', 'ArrowLeft']),
	FIRST: 'Home',
	LAST: 'End',
});

/** スライダーの上で食い止めるキー。(通すと作品が移る。つまみを上下で動かす操作は諦める) */
const RANGE_BLOCKED_KEYS = Object.freeze([KEYS.PREV_WORK, KEYS.NEXT_WORK]);

/** 動きを減らす設定の問い合わせ */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** 進捗の線が伸びきるまでの時間を渡す CSS 変数 */
const DURATION_VAR = '--slideshow-duration';

/**
 * @typedef {object} SlideshowControlsDeps
 * @property {Document} doc 対象のドキュメント
 * @property {HTMLElement} container 帯を差し込む先 (ステージ)
 * @property {HTMLElement} activityTarget ポインタの動きを見る要素 (overlay)。動いたら帯を出す
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {{slideshowInterval: number|string, slideshowIntervalCustom: number, slideshowLoop: boolean}} settings 正規化済みの設定
 * @property {() => void} onToggle 再生ボタンが押された
 * @property {(direction: 1|-1) => void} onStep 前へ (-1)・次へ (1) が押された
 * @property {(loop: boolean) => void} onLoopChange ループが切り替えられた
 * @property {(change: {slideshowInterval?: number|string, slideshowIntervalCustom?: number}) => void} onIntervalChange 送る間隔が選ばれた
 * @property {(open: boolean) => void} onPanelChange 送る間隔のパネルが開いた・閉じた
 * @property {(callback: () => void, ms: number) => unknown} setTimeout タイマーを張る
 * @property {(handle: unknown) => void} clearTimeout タイマーを外す
 * @property {(query: string) => {matches: boolean}} [matchMedia] メディアクエリの判定。無ければ動きを減らさない扱い
 */

/**
 * @typedef {object} SlideshowControls
 * @property {HTMLElement} element 帯の要素
 * @property {(settings: SlideshowControlsDeps['settings']) => void} setSettings ループと送る間隔の表示を設定に合わせる
 * @property {(state: import('./slideshow.js').SlideshowState) => void} setState 再生状態と進捗の線を合わせる
 * @property {() => void} wake 帯を出し、隠すまでの計時をやり直す
 * @property {(event: KeyboardEvent) => boolean} consumeKey パネルが使ったキーなら true
 * @property {() => void} dispose 要素とリスナとタイマーを片付ける
 */

/**
 * 自動送りの操作の帯を作り、container の末尾へ差し込む。フォーカスは動かさない。
 * @param {SlideshowControlsDeps} deps 依存
 * @returns {SlideshowControls} 操作口
 */
export function createSlideshowControls(deps) {
	const { doc, strings } = deps;
	const text = strings.slideshow;
	/** 付けたリスナ。dispose でまとめて外す */
	const listeners = [];
	/** 送る間隔の設定値 (秒数かカスタム) */
	let interval = deps.settings.slideshowInterval;
	/** カスタムの秒数 */
	let customSeconds = deps.settings.slideshowIntervalCustom;
	/** ループするか */
	let loop = deps.settings.slideshowLoop === true;
	/** 送る間隔のパネルを開いているか */
	let panelOpen = false;
	/** カーソルが帯の上にあるか */
	let hovering = false;
	/** 隠すまでのタイマー。張っていなければ null */
	let idleTimer = null;
	/** 片付け済みか */
	let disposed = false;

	/**
	 * リスナを付け、dispose で外せるように覚える。
	 * @param {EventTarget} target 付ける先
	 * @param {string} type イベント名
	 * @param {(event: Event) => void} handler 受け手
	 * @param {boolean} [capture] 捕捉フェーズで受けるか
	 * @returns {void}
	 */
	function listen(target, type, handler, capture = false) {
		target.addEventListener(type, handler, capture);
		listeners.push({ target, type, handler, capture });
	}

	/**
	 * アイコンだけのボタンを作る。読み上げ名とマウスで見る名前の両方を付ける。
	 * @param {string} className クラス名
	 * @param {string} icon アイコンの名前
	 * @param {string} label 名前
	 * @returns {HTMLButtonElement} ボタン
	 */
	function iconButton(className, icon, label) {
		const button = doc.createElement('button');
		button.type = 'button';
		button.className = className;
		setButtonLook(button, icon, label);
		return button;
	}

	/**
	 * ボタンのアイコンと名前を差し替える。
	 * @param {HTMLButtonElement} button ボタン
	 * @param {string} icon アイコンの名前
	 * @param {string} label 名前
	 * @returns {void}
	 */
	function setButtonLook(button, icon, label) {
		button.setAttribute('aria-label', label);
		button.title = label;
		button.replaceChildren(createIcon(doc, icon));
	}

	const element = doc.createElement('div');
	element.className = 'slideshow-controls';
	element.setAttribute('role', 'group');
	element.setAttribute('aria-label', text.CONTROLS);

	/* --- 進捗の線 -------------------------------------------------------- */
	const progress = doc.createElement('div');
	progress.className = 'slideshow-progress';
	progress.setAttribute('aria-hidden', 'true');

	/* --- 前へ・再生 / 停止・次へ・ループ --------------------------------- */
	const prev = iconButton('slideshow-prev', 'skipPrevious', text.PREV);
	listen(prev, 'click', () => deps.onStep(-1));

	const toggle = iconButton('slideshow-toggle', TOGGLE.PAUSED.icon, text[TOGGLE.PAUSED.labelKey]);
	listen(toggle, 'click', () => deps.onToggle());

	const next = iconButton('slideshow-next', 'skipNext', text.NEXT);
	listen(next, 'click', () => deps.onStep(1));

	const loopButton = iconButton('slideshow-loop', 'repeat', text.LOOP);
	listen(loopButton, 'click', () => {
		setLoop(!loop);
		deps.onLoopChange(loop);
	});

	/* --- 送る間隔 -------------------------------------------------------- */
	const speedWrap = doc.createElement('div');
	speedWrap.className = 'slideshow-speed-wrap';

	const speedButton = doc.createElement('button');
	speedButton.type = 'button';
	speedButton.className = 'slideshow-speed';
	speedButton.setAttribute('aria-haspopup', 'dialog');
	speedButton.setAttribute('aria-expanded', 'false');
	const speedLabel = doc.createElement('span');
	speedLabel.className = 'slideshow-speed-label';
	speedButton.append(createIcon(doc, 'timer'), speedLabel);

	const panel = doc.createElement('div');
	panel.className = 'slideshow-speed-panel';
	panel.setAttribute('role', 'dialog');
	panel.setAttribute('aria-label', text.INTERVAL);
	panel.hidden = true;

	const radiogroup = doc.createElement('div');
	radiogroup.className = 'slideshow-speed-options';
	radiogroup.setAttribute('role', 'radiogroup');
	radiogroup.setAttribute('aria-label', text.INTERVAL);

	/** @type {HTMLButtonElement[]} 送る間隔の項目。INTERVAL_OPTIONS の並び */
	const options = INTERVAL_OPTIONS.map((value) => {
		const item = doc.createElement('button');
		item.type = 'button';
		item.className = 'slideshow-speed-option';
		item.setAttribute('role', 'radio');
		item.dataset.interval = String(value);
		item.textContent = value === SLIDESHOW_INTERVAL_CUSTOM ? text.CUSTOM : text.seconds(value);
		listen(item, 'click', () => choose(value));
		radiogroup.append(item);
		return item;
	});

	// label で包んでスライダーと結び付ける。(id を振らずに済む)
	const custom = doc.createElement('label');
	custom.className = 'slideshow-custom';
	const customLabel = doc.createElement('span');
	customLabel.className = 'slideshow-custom-label';
	customLabel.textContent = text.CUSTOM_RANGE;
	const range = doc.createElement('input');
	range.type = 'range';
	range.className = 'slideshow-custom-range';
	range.min = String(SLIDESHOW_INTERVAL_CUSTOM_RANGE.min);
	range.max = String(SLIDESHOW_INTERVAL_CUSTOM_RANGE.max);
	range.step = String(SLIDESHOW_INTERVAL_CUSTOM_RANGE.step);
	const rangeValue = doc.createElement('output');
	rangeValue.className = 'slideshow-custom-value';
	custom.append(customLabel, range, rangeValue);

	/**
	 * スライダーの今の値を秒数の表示へ写す。
	 * @param {number} seconds 秒数
	 * @returns {void}
	 */
	function showRangeValue(seconds) {
		const label = text.seconds(seconds);
		rangeValue.textContent = label;
		range.setAttribute('aria-valuetext', label);
	}

	// 動かしている間は表示だけ。離したとき (change) に確定する
	listen(range, 'input', () => showRangeValue(Number(range.value)));
	listen(range, 'change', () => {
		const seconds = Number(range.value);
		if (!Number.isFinite(seconds)) return;
		customSeconds = seconds;
		renderInterval();
		deps.onIntervalChange({ slideshowIntervalCustom: seconds });
	});

	panel.append(radiogroup, custom);
	speedWrap.append(speedButton, panel);
	element.append(progress, prev, toggle, next, loopButton, speedWrap);

	/**
	 * 選んでいる項目の位置。設定が選択肢に無ければ先頭を返す。
	 * @returns {number} INTERVAL_OPTIONS の位置
	 */
	function selectedIndex() {
		return Math.max(0, INTERVAL_OPTIONS.indexOf(interval));
	}

	/**
	 * 送る間隔の表示 (ボタン・項目の印・スライダー) を今の値に合わせる。
	 * 選んでいる項目だけを Tab で止まる位置にする。
	 * @returns {void}
	 */
	function renderInterval() {
		const seconds = slideshowIntervalSeconds({ slideshowInterval: interval, slideshowIntervalCustom: customSeconds });
		const label = text.seconds(seconds);
		speedLabel.textContent = label;
		const name = `${text.INTERVAL}: ${label}`;
		speedButton.setAttribute('aria-label', name);
		speedButton.title = name;
		const selected = selectedIndex();
		options.forEach((item, at) => {
			const checked = INTERVAL_OPTIONS[at] === interval;
			item.setAttribute('aria-checked', String(checked));
			item.setAttribute('tabindex', at === selected ? '0' : '-1');
		});
		custom.hidden = interval !== SLIDESHOW_INTERVAL_CUSTOM;
		range.value = String(customSeconds);
		showRangeValue(customSeconds);
	}

	/**
	 * 送る間隔の項目を選ぶ。選び直したときだけ知らせる。
	 * @param {number|string} value INTERVAL_OPTIONS の値
	 * @returns {void}
	 */
	function choose(value) {
		if (value === interval) return;
		interval = value;
		renderInterval();
		deps.onIntervalChange({ slideshowInterval: value });
	}

	/**
	 * ループの表示を合わせる。
	 * @param {boolean} next ループするか
	 * @returns {void}
	 */
	function setLoop(next) {
		loop = next;
		loopButton.setAttribute('aria-pressed', String(next));
	}

	/**
	 * パネルの開閉を画面に反映し、変わったときだけ知らせる。
	 * 開いている間は帯を隠さず、閉じたら隠すまでの計時をやり直す。
	 * @param {boolean} open 開くなら true
	 * @returns {void}
	 */
	function setPanelOpen(open) {
		if (open === panelOpen) return;
		panelOpen = open;
		panel.hidden = !open;
		speedButton.setAttribute('aria-expanded', String(open));
		if (open) showControls();
		else scheduleIdle();
		deps.onPanelChange(open);
	}

	/**
	 * パネルを閉じる。キーで閉じたときは速度のボタンへフォーカスを戻す。
	 * (戻さないと、隠れた項目にフォーカスが残ってモーダルのキー操作が効かなくなる)
	 * @param {boolean} refocus ボタンへフォーカスを戻すか
	 * @returns {void}
	 */
	function closePanel(refocus) {
		if (!panelOpen) return;
		setPanelOpen(false);
		if (refocus) speedButton.focus();
	}

	listen(speedButton, 'click', () => {
		if (panelOpen) {
			closePanel(false);
			return;
		}
		setPanelOpen(true);
		// 開いたら選んでいる項目へ。そのまま矢印で選び直せる
		options[selectedIndex()].focus();
	});

	/**
	 * フォーカスが速度の部品の外へ出たら閉じる。(Tab で抜けたとき)
	 * 行き先が無いとき (窓が非アクティブになった等) は閉じない。外側のクリックは pointerdown が受け持つ
	 * @param {FocusEvent} event フォーカスの移動
	 * @returns {void}
	 */
	function onSpeedFocusOut(event) {
		if (!panelOpen) return;
		const target = event.relatedTarget;
		if (!target) return;
		if (speedWrap.contains(target)) return;
		closePanel(false);
	}
	listen(speedWrap, 'focusout', onSpeedFocusOut);

	/**
	 * パネルの外が押されたら閉じる。Shadow DOM の中なので composedPath() で見る。
	 * @param {PointerEvent} event 押された位置
	 * @returns {void}
	 */
	function onDocumentPointerDown(event) {
		if (!panelOpen) return;
		const path = event.composedPath?.() ?? [];
		if (path.includes(speedWrap)) return;
		closePanel(false);
	}
	// 捕捉フェーズで受ける。pixiv 側やビュワーが途中で止めても届くようにする
	listen(doc, 'pointerdown', onDocumentPointerDown, true);

	/* --- 自動で隠す ------------------------------------------------------ */

	/**
	 * 隠すまでのタイマーを外す。
	 * @returns {void}
	 */
	function cancelIdle() {
		if (idleTimer === null) return;
		deps.clearTimeout(idleTimer);
		idleTimer = null;
	}

	/**
	 * 隠すまでの計時をやり直す。
	 * @returns {void}
	 */
	function scheduleIdle() {
		if (disposed) return;
		cancelIdle();
		idleTimer = deps.setTimeout(onIdle, SLIDESHOW_CONTROLS_IDLE_MS);
	}

	/**
	 * 待ち終えたら隠す。カーソルが乗っている・フォーカスがある・パネルが開いている間は隠さない。
	 * (それぞれが終わったときに計時をやり直す)
	 * @returns {void}
	 */
	function onIdle() {
		idleTimer = null;
		if (hovering || panelOpen || hasFocusWithin(doc, element)) return;
		element.dataset.idle = '';
	}

	/**
	 * 帯を見える状態へ戻す。
	 * @returns {void}
	 */
	function showControls() {
		delete element.dataset.idle;
	}

	/**
	 * 帯を出し、隠すまでの計時をやり直す。
	 * @returns {void}
	 */
	function wake() {
		if (disposed) return;
		showControls();
		scheduleIdle();
	}

	listen(deps.activityTarget, 'pointermove', wake);
	listen(deps.activityTarget, 'pointerdown', wake);
	listen(element, 'pointerenter', () => {
		hovering = true;
		showControls();
	});
	listen(element, 'pointerleave', () => {
		hovering = false;
		scheduleIdle();
	});
	listen(element, 'focusin', wake);
	listen(element, 'focusout', (event) => {
		const target = event.relatedTarget;
		if (target && element.contains(target)) return;
		scheduleIdle();
	});

	/* --- 進捗の線 -------------------------------------------------------- */

	/**
	 * 動きを減らす設定になっているか。判定の口が無ければ減らさない。
	 * @returns {boolean} 減らすなら true
	 */
	function prefersReducedMotion() {
		return deps.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true;
	}

	/**
	 * 進捗の線を 0 から描き直す。走っている印を外して幅を読み直し、
	 * 縮んだ状態を一度描かせてから、伸びる時間を入れて印を付け直す。
	 * @param {number} durationMs 伸びきるまでの時間 (ミリ秒)
	 * @returns {void}
	 */
	function restartProgress(durationMs) {
		delete progress.dataset.running;
		if (prefersReducedMotion()) return;
		// 読むだけで描き直しが起きる。印の付け外しが 1 回の描画にまとまると線が 0 へ戻らない
		void progress.offsetWidth;
		progress.style.setProperty(DURATION_VAR, `${durationMs}ms`);
		progress.dataset.running = '';
	}

	/**
	 * 再生ボタンの見た目を再生状態に合わせる。ボタンは「押すと何になるか」を示す。
	 * @param {boolean} playing 再生中か
	 * @returns {void}
	 */
	function setPlaying(playing) {
		const look = playing ? TOGGLE.PLAYING : TOGGLE.PAUSED;
		setButtonLook(toggle, look.icon, text[look.labelKey]);
	}

	/**
	 * 押されたキーで選ぶ項目の位置を決める。端から先は反対の端へ回る。
	 * @param {string} key 押されたキー
	 * @returns {number|null} 選ぶ項目の位置。選択を動かすキーでなければ null
	 */
	function radioTargetIndex(key) {
		const current = selectedIndex();
		const last = INTERVAL_OPTIONS.length - 1;
		if (key === RADIO_KEYS.FIRST) return 0;
		if (key === RADIO_KEYS.LAST) return last;
		if (RADIO_KEYS.NEXT.includes(key)) return current === last ? 0 : current + 1;
		if (RADIO_KEYS.PREV.includes(key)) return current === 0 ? last : current - 1;
		return null;
	}

	setLoop(loop);
	renderInterval();
	deps.container.append(element);
	wake();

	return {
		element,

		/**
		 * ループと送る間隔の表示を設定に合わせる。コールバックは呼ばない。
		 * @param {SlideshowControlsDeps['settings']} settings 正規化済みの設定
		 * @returns {void}
		 */
		setSettings(settings) {
			setLoop(settings.slideshowLoop === true);
			interval = settings.slideshowInterval;
			customSeconds = settings.slideshowIntervalCustom;
			renderInterval();
		},

		/**
		 * 再生状態と進捗の線を合わせる。計時の長さが届くたびに線を 0 から描き直し、null なら消す。
		 * @param {import('./slideshow.js').SlideshowState} state 自動送りの状態
		 * @returns {void}
		 */
		setState(state) {
			setPlaying(state.playing === true);
			if (typeof state.durationMs === 'number') restartProgress(state.durationMs);
			else delete progress.dataset.running;
		},

		wake,

		/**
		 * キーを食い止める。ビュワー本体のキー操作 (Escape で閉じる・矢印で送る) より先に呼ばれ、
		 * true を返したときは本体が反応してはいけない。パネルを開いているときだけ食い止める。
		 * スライダーの上の左右と端のキーは、つまみを動かす既定の動作に任せるので false を返す。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (!panelOpen) return false;
			if (event.key === KEYS.CLOSE) {
				event.preventDefault?.();
				closePanel(true);
				return true;
			}
			const target = event.composedPath?.()[0];
			if (target === range) {
				if (!RANGE_BLOCKED_KEYS.includes(event.key)) return false;
				event.preventDefault?.();
				return true;
			}
			const targetIndex = radioTargetIndex(event.key);
			if (targetIndex === null) return false;
			event.preventDefault?.();
			choose(INTERVAL_OPTIONS[targetIndex]);
			options[targetIndex].focus();
			return true;
		},

		/**
		 * 要素を外し、付けたリスナとタイマーを片付ける。パネルが開いていても onPanelChange は呼ばない。
		 * @returns {void}
		 */
		dispose() {
			if (disposed) return;
			disposed = true;
			cancelIdle();
			for (const { target, type, handler, capture } of listeners) target.removeEventListener(type, handler, capture);
			listeners.length = 0;
			element.remove();
		},
	};
}
