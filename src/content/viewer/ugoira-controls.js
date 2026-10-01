/**
 * うごイラの操作の帯。再生 / 一時停止・シークバー・コマ数・再生速度を下端に並べる。
 *
 * 再生そのもの (コマ送り・時刻の計算) は ugoira.js が持つ。ここは描画と入力の受け渡しだけで、
 * 押された・動かされたことをコールバックで伝え、ugoira.js から set* で状態を受け取る。
 *
 * 再生速度のメニューは role="menu" を名乗るので WAI-ARIA の menu パターンに従う:
 * 開いたら選んでいる項目へフォーカスし、上下キーで移動、Home / End で端へ、Escape で閉じてボタンへ戻す。
 * キーは consumeKey() で受ける。ビュワー本体が document の捕捉フェーズで上下キーを作品の移動に使っているため。
 */
import { createIcon } from '../../common/icons.js';
import { KEYS, UGOIRA_PLAYBACK_RATES, DEFAULT_UGOIRA_RATE } from '../../common/constants.js';
import { activeElementIn } from './focus.js';

/** 再生ボタンの表示。キーは今の再生状態、値は「押すと何になるか」。アイコンは言語に依らない。 */
const TOGGLE = Object.freeze({
	PLAYING: Object.freeze({ icon: 'pause', labelKey: 'PAUSE' }),
	PAUSED: Object.freeze({ icon: 'play', labelKey: 'PLAY' }),
});

/** 速度のメニューの中で使うキー。項目の移動と端への移動。 */
const MENU_KEYS = Object.freeze({
	NEXT: 'ArrowDown',
	PREV: 'ArrowUp',
	FIRST: 'Home',
	LAST: 'End',
});

/** シークバーの塗り分けを渡す CSS 変数。(再生済み / 読み込み済み の位置を % で持つ) */
const SEEK_VARS = Object.freeze({
	PLAYED: '--seek-played',
	LOADED: '--seek-loaded',
});

/** 割合を % にするときの分母。 */
const PERCENT = 100;

/**
 * 0 始まりの位置を、シークバーの塗り分けに使う % にする。コマが 1 つなら端まで塗る。
 * @param {number} index 位置 (0 始まり)
 * @param {number} total 全体の数
 * @returns {number} 0-100 の %
 */
export function seekPercent(index, total) {
	if (total <= 1) return PERCENT;
	return Math.min(PERCENT, Math.max(0, (index / (total - 1)) * PERCENT));
}

/**
 * @typedef {object} UgoiraControlsDeps
 * @property {Document} doc 対象のドキュメント
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {number} [rate] 最初の再生速度。無ければ等速
 * @property {() => void} onToggle 再生ボタンが押された
 * @property {() => void} onSeekStart マウス・指でシークバーをつかんだ (離すまで再生を止める)
 * @property {(index: number) => void} onSeek シークバーで位置が選ばれた (0 始まりのコマ番号)
 * @property {() => void} onSeekEnd シークバーを離した
 * @property {(rate: number) => void} onRate 再生速度が選ばれた
 */

/**
 * うごイラの操作の帯を作る。呼んだ時点では element を返すだけで、どこへも差し込まない。
 * @param {UgoiraControlsDeps} deps 依存
 * @returns {{
 *   element: HTMLElement,
 *   setPlaying: (playing: boolean) => void,
 *   setFrame: (index: number, total: number) => void,
 *   setLoaded: (count: number, total: number) => void,
 *   setRate: (rate: number) => void,
 *   consumeKey: (event: KeyboardEvent) => boolean,
 *   dispose: () => void,
 * }}
 */
export function createUgoiraControls(deps) {
	const { doc, strings } = deps;
	const text = strings.ugoira;
	/** 今の再生速度 */
	let rate = UGOIRA_PLAYBACK_RATES.includes(deps.rate) ? deps.rate : DEFAULT_UGOIRA_RATE;
	/** 速度のメニューを開いているか */
	let menuOpen = false;
	/** シークバーをマウス・指でつかんでいるか */
	let grabbing = false;

	const element = doc.createElement('div');
	element.className = 'ugoira-controls';
	element.setAttribute('role', 'group');
	element.setAttribute('aria-label', text.CONTROLS);

	/* --- 再生 / 一時停止 ------------------------------------------------- */
	const toggle = doc.createElement('button');
	toggle.type = 'button';
	toggle.className = 'ugoira-toggle';
	toggle.addEventListener('click', () => deps.onToggle());

	/* --- シークバー ------------------------------------------------------ */
	const seek = doc.createElement('input');
	seek.type = 'range';
	seek.className = 'ugoira-seek';
	seek.min = '0';
	seek.max = '0';
	seek.step = '1';
	seek.value = '0';
	seek.setAttribute('aria-label', text.SEEK);

	/**
	 * つかんでいた状態を終える。離した・取り消された・フォーカスが外れたのどれでも 1 回だけ伝える。
	 * @returns {void}
	 */
	function release() {
		if (!grabbing) return;
		grabbing = false;
		deps.onSeekEnd();
	}

	seek.addEventListener('pointerdown', () => {
		grabbing = true;
		deps.onSeekStart();
	});
	seek.addEventListener('input', () => deps.onSeek(Number(seek.value)));
	// 離したときは change が来る。指が外へ出て取り消されたときは change が来ないので両方で終える
	seek.addEventListener('change', release);
	seek.addEventListener('pointerup', release);
	seek.addEventListener('pointercancel', release);
	seek.addEventListener('blur', release);

	/* --- コマ数 ---------------------------------------------------------- */
	// 読み上げはシークバーの aria-valuetext が同じことを伝えるので、ここは目で見る用
	const counter = doc.createElement('span');
	counter.className = 'ugoira-frame';
	counter.setAttribute('aria-hidden', 'true');

	/* --- 再生速度 -------------------------------------------------------- */
	const rateWrap = doc.createElement('div');
	rateWrap.className = 'ugoira-rate-wrap';

	const rateButton = doc.createElement('button');
	rateButton.type = 'button';
	rateButton.className = 'ugoira-rate';
	rateButton.setAttribute('aria-haspopup', 'menu');
	rateButton.setAttribute('aria-expanded', 'false');

	const menu = doc.createElement('div');
	menu.className = 'ugoira-rate-menu';
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', text.RATE);
	menu.hidden = true;

	/** @type {HTMLButtonElement[]} 速度の項目。UGOIRA_PLAYBACK_RATES の並び */
	const items = UGOIRA_PLAYBACK_RATES.map((value) => {
		const item = doc.createElement('button');
		item.type = 'button';
		item.className = 'ugoira-rate-item';
		item.setAttribute('role', 'menuitemradio');
		item.dataset.rate = String(value);
		const label = doc.createElement('span');
		label.textContent = text.rate(value);
		item.append(label);
		if (value === DEFAULT_UGOIRA_RATE) {
			// 等速がどれかを文字でも示す。倍率の数字だけでは迷う
			const normal = doc.createElement('span');
			normal.className = 'ugoira-rate-normal';
			normal.textContent = text.NORMAL;
			item.append(normal);
		}
		item.addEventListener('click', () => {
			setRate(value);
			deps.onRate(value);
			closeMenu(true);
		});
		menu.append(item);
		return item;
	});

	/**
	 * メニューの開閉を画面に反映する。
	 * @param {boolean} next 開くなら true
	 * @returns {void}
	 */
	function setMenuOpen(next) {
		menuOpen = next;
		menu.hidden = !next;
		rateButton.setAttribute('aria-expanded', String(next));
	}

	/**
	 * メニューを閉じる。キーや項目で閉じたときはボタンへフォーカスを戻す。
	 * (戻さないと、隠れた項目にフォーカスが残ってモーダルのキー操作が効かなくなる)
	 * @param {boolean} refocus ボタンへフォーカスを戻すか
	 * @returns {void}
	 */
	function closeMenu(refocus) {
		if (!menuOpen) return;
		setMenuOpen(false);
		if (refocus) rateButton.focus();
	}

	rateButton.addEventListener('click', () => {
		if (menuOpen) {
			closeMenu(false);
			return;
		}
		setMenuOpen(true);
		// 開いたら選んでいる項目へ。そのまま上下で選び直せる
		items[UGOIRA_PLAYBACK_RATES.indexOf(rate)]?.focus();
	});

	/**
	 * フォーカスが速度の部品の外へ出たら閉じる。(Tab で抜けたとき)
	 * relatedTarget が無いとき (窓が非アクティブになった等) は閉じない。外側のクリックは pointerdown が受け持つ
	 * @param {FocusEvent} event フォーカスの移動
	 * @returns {void}
	 */
	function onFocusOut(event) {
		if (!menuOpen) return;
		const next = event.relatedTarget;
		if (!next) return;
		if (typeof rateWrap.contains === 'function' && rateWrap.contains(next)) return;
		setMenuOpen(false);
	}
	rateWrap.addEventListener('focusout', onFocusOut);

	/**
	 * メニューの外が押されたら閉じる。Shadow DOM の中なので composedPath() で見る。
	 * @param {PointerEvent} event 押された位置
	 * @returns {void}
	 */
	function onPointerDown(event) {
		if (!menuOpen) return;
		const path = event.composedPath?.() ?? [];
		if (path.includes(rateWrap)) return;
		setMenuOpen(false);
	}
	// 捕捉フェーズで受ける。pixiv 側やビュワーが途中で止めても届くようにする
	doc.addEventListener('pointerdown', onPointerDown, true);

	rateWrap.append(rateButton, menu);
	element.append(toggle, seek, counter, rateWrap);

	/**
	 * 再生ボタンの見た目を再生状態に合わせる。ボタンは「押すと何になるか」を示す。
	 * @param {boolean} playing 再生中か
	 * @returns {void}
	 */
	function setPlaying(playing) {
		const next = playing ? TOGGLE.PLAYING : TOGGLE.PAUSED;
		const label = text[next.labelKey];
		toggle.setAttribute('aria-label', label);
		toggle.title = label;
		toggle.replaceChildren(createIcon(doc, next.icon));
	}

	/**
	 * 今のコマをシークバーとコマ数へ写す。つかんでいる間はつまみを動かさない。(指の下から逃げる)
	 * @param {number} index 今のコマ番号 (0 始まり)
	 * @param {number} total 全体のコマ数
	 * @returns {void}
	 */
	function setFrame(index, total) {
		const last = Math.max(0, total - 1);
		seek.max = String(last);
		if (!grabbing) seek.value = String(index);
		seek.style.setProperty(SEEK_VARS.PLAYED, `${seekPercent(index, total)}%`);
		seek.setAttribute('aria-valuetext', text.frame(index + 1, total));
		counter.textContent = `${index + 1} / ${total}`;
	}

	/**
	 * 読み込み済みの範囲をシークバーの塗りへ写す。読み込み済みより先へは飛べない。
	 * @param {number} count 再生できるコマの数
	 * @param {number} total 全体のコマ数
	 * @returns {void}
	 */
	function setLoaded(count, total) {
		seek.style.setProperty(SEEK_VARS.LOADED, `${seekPercent(count - 1, total)}%`);
	}

	/**
	 * 速度の表示を合わせる。ボタンには今の倍率を、項目には選んでいる印を出す。
	 * @param {number} next 再生速度
	 * @returns {void}
	 */
	function setRate(next) {
		rate = next;
		rateButton.textContent = text.rate(next);
		const label = `${text.RATE}: ${text.rate(next)}`;
		rateButton.setAttribute('aria-label', label);
		rateButton.title = label;
		items.forEach((item, at) => item.setAttribute('aria-checked', String(UGOIRA_PLAYBACK_RATES[at] === next)));
	}

	/**
	 * 速度のメニューの項目の間でフォーカスを動かす。
	 * @param {string} key 押されたキー
	 * @returns {boolean} 動かしたなら true
	 */
	function moveFocus(key) {
		const current = items.indexOf(activeElementIn(doc, menu));
		let target;
		if (key === MENU_KEYS.FIRST) target = 0;
		else if (key === MENU_KEYS.LAST) target = items.length - 1;
		else if (key === MENU_KEYS.NEXT) target = current < 0 ? 0 : (current + 1) % items.length;
		else if (key === MENU_KEYS.PREV) target = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
		else return false;
		items[target].focus();
		return true;
	}

	setPlaying(true);
	setFrame(0, 0);
	setRate(rate);

	return {
		element,
		setPlaying,
		setFrame,
		setLoaded,
		setRate,

		/**
		 * キーを食い止める。ビュワー本体のキー操作 (Escape で閉じる・上下で作品を移動) より先に呼ばれ、
		 * true を返したときは本体が反応してはいけない。メニューを開いているときだけ食い止める。
		 * @param {KeyboardEvent} event キー
		 * @returns {boolean} 食い止めたなら true
		 */
		consumeKey(event) {
			if (!menuOpen) return false;
			if (event.key === KEYS.CLOSE) {
				event.preventDefault?.();
				closeMenu(true);
				return true;
			}
			if (moveFocus(event.key)) {
				event.preventDefault?.();
				return true;
			}
			return false;
		},

		/**
		 * 外へ張ったリスナを外す。要素は持ち主 (ugoira.js) が外す。
		 * @returns {void}
		 */
		dispose() {
			doc.removeEventListener('pointerdown', onPointerDown, true);
			rateWrap.removeEventListener('focusout', onFocusOut);
			grabbing = false;
			setMenuOpen(false);
		},
	};
}
