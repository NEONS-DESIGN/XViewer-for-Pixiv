/**
 * ビュワーの中の移動。キー操作の割り振りと、作品間の行き先の決定だけを持つ。
 *
 * 並び (sequence) と今開いている作品を持つのはここ。
 * 実際に開く処理 (openWork) と、ページ送り・フォーカスの巡回は注入で受け取る。
 * DOM を直接は触らないので、依存を差し替えれば単体で確かめられる。
 */
import { KEYS } from '../../common/constants.js';
import { warn } from '../../common/log.js';

/**
 * @typedef {import('../sequence.js').Sequence} Sequence
 */

/**
 * @typedef {object} NavigationDeps
 * @property {(workId: string) => Promise<void>} openWork 作品を開く
 * @property {() => boolean} isOpen モーダルが開いているか
 * @property {() => void} onRequestClose 閉じたいときに呼ばれる
 * @property {(workId: string) => void} onNavigate 作品が切り替わったときに呼ばれる
 * @property {() => boolean} canExtendSequence 全作品の並びへ広げてよいか
 * @property {(current: Sequence) => Promise<Sequence>} extendSequence 端で並びを広げる
 * @property {(direction: number) => void} movePage ページを送る (1 なら次、-1 なら前)
 * @property {(event: KeyboardEvent) => void} focusNext Tab のフォーカスを巡回させる
 */

/**
 * @typedef {object} Navigation
 * @property {(direction: number) => Promise<void>} moveWork 前後の作品へ移動する
 * @property {(event: KeyboardEvent) => void} onKeyDown キーボード操作
 * @property {(next: Sequence) => void} setSequence 並びを差し替える
 * @property {(workId: string) => void} setCurrentWorkId 今開いている作品を記録する
 * @property {() => string|null} currentWorkId 今開いている作品
 * @property {() => void} reset 閉じたときに状態を捨てる
 */

/**
 * 修飾キーが押されているか。
 * Alt+← (ブラウザの「戻る」) や Ctrl+← (OS の操作) をビュワーが潰さないための判定。
 * Shift は含めない。(Shift+Tab は逆向きの巡回として focusNext が扱う)
 * @param {KeyboardEvent} event キー
 * @returns {boolean} Alt / Ctrl / Meta のどれかが押されていれば true
 */
function hasModifier(event) {
	return event.altKey === true || event.ctrlKey === true || event.metaKey === true;
}

/**
 * 移動の担当を作る。
 * @param {NavigationDeps} deps 依存
 * @returns {Navigation} 移動の操作
 */
export function createNavigation(deps) {
	/** @type {Sequence|null} 今開いている作品の並び。上下キーでの移動に使う */
	let sequence = null;
	/** @type {string|null} 今開いている作品。移動の基準 */
	let currentWorkId = null;
	/** 端で全作品の並びへ広げている最中かどうか。二重に広げないためのガード */
	let extending = false;
	/** 今の並びを全作品へ広げ済みか。真の端で押すたびに取り直さないためのガード */
	let extended = false;

	/**
	 * 今の並びで隣の作品を探す。
	 * @param {number} direction 1 なら次、-1 なら前
	 * @returns {string|null} 隣の作品 ID。端なら null
	 */
	function neighbor(direction) {
		if (!sequence || !currentWorkId) return null;
		return direction > 0 ? sequence.next(currentWorkId) : sequence.prev(currentWorkId);
	}

	/**
	 * 並びを全作品へ広げる。
	 * 広げた並びに今の作品が含まれていなければ差し替えない。(差し替えると next も prev も
	 * null になり、元の並びで戻れたはずの上キーまで効かなくなる)
	 * 待っている間に閉じたり別の作品へ移ったりしていたら、結果は捨てる。
	 * @returns {Promise<boolean>} 並びを差し替えたら true
	 */
	async function extend() {
		const from = currentWorkId;
		const base = sequence;
		extending = true;
		let next;
		try {
			next = await deps.extendSequence(base);
		} catch (error) {
			// 広げられなくても今の作品は見られる。端で止まるだけにする
			warn('failed to extend sequence', error);
			return false;
		} finally {
			extending = false;
		}
		// reset() で捨てた後や、待っている間に別の作品へ移った後の結果は使わない
		if (sequence !== base || currentWorkId !== from) return false;
		// 一度試した並びは、含まれていなくても取り直さない (取り直しても同じ結果になる)
		extended = true;
		if (!next || typeof next.has !== 'function' || !next.has(from)) return false;
		sequence = next;
		return true;
	}

	/**
	 * 前後の作品へ移動する。
	 * 端に達したら全作品の並びへ広げてもう一度試す。
	 * @param {number} direction 1 なら次、-1 なら前
	 * @returns {Promise<void>}
	 */
	async function moveWork(direction) {
		if (!sequence || !currentWorkId) return;
		let target = neighbor(direction);

		// 端に来た。全作品の並びへ広げられるなら広げてもう一度。
		// 待っている間に別の作品へ移っていたら extend() が false を返すので、ここでは確かめ直さない
		if (!target && !extended && !extending && deps.canExtendSequence()) {
			if (!(await extend())) return;
			target = neighbor(direction);
		}
		if (!target) return;

		deps.onNavigate(target);
		await deps.openWork(target);
	}

	/**
	 * キーボード操作。
	 * IME の変換中と修飾キー付き (Escape を除く) は奪わない。
	 * 作品移動はキーリピートでは動かさない。(リピートごとに通信と replaceState が走るため)
	 * @param {KeyboardEvent} event キー
	 * @returns {void}
	 */
	function onKeyDown(event) {
		if (!deps.isOpen()) return;
		if (event.isComposing === true) return;
		if (event.key === KEYS.CLOSE) {
			event.preventDefault();
			deps.onRequestClose();
			return;
		}
		if (event.key === KEYS.FOCUS_NEXT) {
			deps.focusNext(event);
			return;
		}
		if (hasModifier(event)) return;
		if (event.key === KEYS.NEXT_PAGE) {
			event.preventDefault();
			deps.movePage(1);
			return;
		}
		if (event.key === KEYS.PREV_PAGE) {
			event.preventDefault();
			deps.movePage(-1);
			return;
		}
		if (event.key === KEYS.NEXT_WORK || event.key === KEYS.PREV_WORK) {
			// ページのスクロールは押しっぱなしでも起こさない。移動だけを 1 回に留める
			event.preventDefault();
			if (event.repeat === true) return;
			void moveWork(event.key === KEYS.NEXT_WORK ? 1 : -1);
		}
	}

	return {
		moveWork,
		onKeyDown,

		/**
		 * 並びを差し替える。
		 * @param {Sequence} next 新しい並び
		 * @returns {void}
		 */
		setSequence(next) {
			sequence = next;
			extended = false;
		},

		/**
		 * 今開いている作品を記録する。
		 * @param {string} workId 作品 ID
		 * @returns {void}
		 */
		setCurrentWorkId(workId) {
			currentWorkId = workId;
		},

		/**
		 * 今開いている作品を返す。
		 * @returns {string|null} 作品 ID。閉じていれば null
		 */
		currentWorkId() {
			return currentWorkId;
		},

		/**
		 * 閉じたときに状態を捨てる。
		 * @returns {void}
		 */
		reset() {
			sequence = null;
			currentWorkId = null;
			extended = false;
		},
	};
}
