/**
 * 画面端のクリック領域。ステージの左右でページを、上下で作品を送る。
 *
 * 透明な部品は重ねず、ステージの座標で判定する。上下の領域が閉じるボタンや
 * うごイラの再生ボタンを覆わないようにするため。領域の中でもボタンとリンクは今までどおり押せる。
 * 今どの領域の上にいるかは stage の data-nav-zone に書き、カーソルは CSS が変える。
 */
import { NAV_ZONES, NAV_ZONE_RATIO, NAV_ZONE_KINDS } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/** 領域の中でも領域より優先する部品。押せば今までどおりその部品が動く */
const PASS_THROUGH_SELECTOR = 'button, a, input, textarea, select, .blocked-panel';

/**
 * 端に着いて今は送れない領域に付ける data-nav-zone の値。
 * 押しても何も起きないが、閉じたり原寸表示に入ったりもしない。カーソルは既定へ戻す
 */
export const NAV_ZONE_IDLE = 'idle';

/** 領域ごとの送り先。axis が page ならページ、work なら作品 */
const ZONE_ACTIONS = Object.freeze({
	[NAV_ZONE_KINDS.PREV_PAGE]: Object.freeze({ axis: 'page', direction: -1 }),
	[NAV_ZONE_KINDS.NEXT_PAGE]: Object.freeze({ axis: 'page', direction: 1 }),
	[NAV_ZONE_KINDS.PREV_WORK]: Object.freeze({ axis: 'work', direction: -1 }),
	[NAV_ZONE_KINDS.NEXT_WORK]: Object.freeze({ axis: 'work', direction: 1 }),
});

/**
 * 座標がどの領域に入るかを返す。四隅は左右 (ページ) を優先する。
 * @param {number} x 画面上の X 座標 (clientX)
 * @param {number} y 画面上の Y 座標 (clientY)
 * @param {{left: number, top: number, width: number, height: number}|null} rect ステージの矩形
 * @param {string} mode 設定 navZones の値
 * @returns {string|null} NAV_ZONE_KINDS の値。どこにも入らなければ null
 */
export function zoneAt(x, y, rect, mode) {
	if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	const rx = (x - rect.left) / rect.width;
	const ry = (y - rect.top) / rect.height;
	if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return null;
	const horizontal = mode === NAV_ZONES.HORIZONTAL || mode === NAV_ZONES.BOTH;
	const vertical = mode === NAV_ZONES.VERTICAL || mode === NAV_ZONES.BOTH;
	if (horizontal) {
		if (rx < NAV_ZONE_RATIO) return NAV_ZONE_KINDS.PREV_PAGE;
		if (rx > 1 - NAV_ZONE_RATIO) return NAV_ZONE_KINDS.NEXT_PAGE;
	}
	if (vertical) {
		if (ry < NAV_ZONE_RATIO) return NAV_ZONE_KINDS.PREV_WORK;
		if (ry > 1 - NAV_ZONE_RATIO) return NAV_ZONE_KINDS.NEXT_WORK;
	}
	return null;
}

/**
 * イベントが領域より優先する部品の上で起きたか。
 * 発火した時点の道筋 (composedPath) を boundary の手前まで見る。
 * 道筋を持たない相手 (合成したイベント等) は event.target の closest() で見る。
 * @param {Event} event pointer / click
 * @param {EventTarget} boundary ここより外側は見ない
 * @returns {boolean} 部品の上なら true
 */
function passesThrough(event, boundary) {
	const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
	if (path.length === 0) {
		const target = event.target;
		return typeof target?.closest === 'function' && Boolean(target.closest(PASS_THROUGH_SELECTOR));
	}
	for (const node of path) {
		if (node === boundary) return false;
		if (typeof node.matches === 'function' && node.matches(PASS_THROUGH_SELECTOR)) return true;
	}
	return false;
}

/**
 * @typedef {object} NavZonesDeps
 * @property {HTMLElement} stage 判定の基準にするステージ。サイドバーは含まない
 * @property {() => string} getMode 今の設定 navZones を返す
 * @property {(direction: number) => boolean} canMovePage その向きへページを送れるか
 * @property {(direction: number) => boolean} canMoveWork その向きへ作品を送れるか
 * @property {(direction: number) => void} movePage ページを送る
 * @property {(direction: number) => Promise<void>} moveWork 作品を送る
 */

/**
 * ステージにクリック領域を張る。
 * @param {NavZonesDeps} deps 依存
 * @returns {{refresh: () => void, reset: () => void}}
 *   refresh は最後のポインタ位置でカーソルを描き直す。reset は覚えた位置を捨てる
 */
export function createNavZones(deps) {
	const { stage } = deps;
	/** @type {{x: number, y: number, passed: boolean}|null} 最後にポインタがあった場所。送った後にカーソルを描き直すために持つ */
	let lastPoint = null;
	/** @type {string|null} 押し始めた領域。離した領域と同じときだけ送る */
	let pressedKind = null;

	/**
	 * 領域が今どう使えるかを返す。
	 * ready はその向きへ送れる。idle は逆向きにだけ送れる (最後のページの右など)。
	 * none はどちらにも送れない (1 枚の作品やうごイラの左右など) ので、領域として扱わない
	 * @param {string} kind NAV_ZONE_KINDS の値
	 * @returns {'ready'|'idle'|'none'} 状態
	 */
	function stateOf(kind) {
		const { axis, direction } = ZONE_ACTIONS[kind];
		const canMove = axis === 'page' ? deps.canMovePage : deps.canMoveWork;
		if (canMove(direction)) return 'ready';
		if (canMove(-direction)) return 'idle';
		return 'none';
	}

	/**
	 * 座標が指す領域とその状態を返す。
	 * @param {number} x clientX
	 * @param {number} y clientY
	 * @param {boolean} passed 領域より優先する部品の上か
	 * @returns {{kind: string, ready: boolean}|null} 領域として扱わないなら null
	 */
	function resolveAt(x, y, passed) {
		const mode = deps.getMode();
		// オフのときは測らない。(ポインタが動くたびにレイアウトを読ませない)
		if (passed || mode === NAV_ZONES.OFF || typeof stage.getBoundingClientRect !== 'function') return null;
		const kind = zoneAt(x, y, stage.getBoundingClientRect(), mode);
		if (!kind) return null;
		const state = stateOf(kind);
		if (state === 'none') return null;
		return { kind, ready: state === 'ready' };
	}

	/**
	 * イベントの位置が指す領域を返す。
	 * @param {MouseEvent} event pointer / click
	 * @returns {{kind: string, ready: boolean}|null} 領域
	 */
	function resolve(event) {
		return resolveAt(event.clientX, event.clientY, passesThrough(event, stage));
	}

	/**
	 * カーソルの印を書く。
	 * @param {{kind: string, ready: boolean}|null} hit 領域
	 * @returns {void}
	 */
	function paint(hit) {
		if (!hit) {
			delete stage.dataset.navZone;
			return;
		}
		stage.dataset.navZone = hit.ready ? hit.kind : NAV_ZONE_IDLE;
	}

	/**
	 * 最後のポインタ位置でカーソルを描き直す。
	 * @returns {void}
	 */
	function refresh() {
		paint(lastPoint ? resolveAt(lastPoint.x, lastPoint.y, lastPoint.passed) : null);
	}

	/**
	 * 領域の送りを実行する。作品の送りは通信を待つので、終わったらカーソルを描き直す。
	 * @param {string} kind NAV_ZONE_KINDS の値
	 * @returns {void}
	 */
	function run(kind) {
		const { axis, direction } = ZONE_ACTIONS[kind];
		if (axis === 'page') {
			deps.movePage(direction);
			refresh();
			return;
		}
		Promise.resolve(deps.moveWork(direction)).then(refresh, (error) => warn('failed to move work by zone', error));
	}

	stage.addEventListener('pointermove', (event) => {
		lastPoint = { x: event.clientX, y: event.clientY, passed: passesThrough(event, stage) };
		refresh();
	});
	stage.addEventListener('pointerleave', () => {
		lastPoint = null;
		paint(null);
	});
	// 捕捉フェーズで受ける。画像の click (原寸表示) とステージの click (余白で閉じる) より先に止めるため。
	// ステージ自身 (padding) を押したときは同じ要素のリスナになるので、stopImmediatePropagation で止める
	stage.addEventListener('pointerdown', (event) => {
		pressedKind = resolve(event)?.kind ?? null;
	}, true);
	stage.addEventListener('click', (event) => {
		const pressed = pressedKind;
		pressedKind = null;
		const hit = resolve(event);
		if (!hit && !pressed) return;
		// 領域で押し始めたか離したなら、閉じたり原寸表示に入ったりはさせない
		event.stopImmediatePropagation();
		if (!hit || hit.kind !== pressed || !hit.ready) return;
		run(hit.kind);
	}, true);

	return {
		refresh,
		reset() {
			lastPoint = null;
			pressedKind = null;
			paint(null);
		},
	};
}
