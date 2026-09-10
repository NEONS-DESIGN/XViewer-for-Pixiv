/**
 * ビュワーの中の移動。キー操作の割り振りと、作品間の行き先の決定だけを持つ。
 *
 * 並び (sequence) と今開いている作品を持つのはここ。
 * 実際に開く処理 (openWork) と、ページ送り・フォーカスの巡回は注入で受け取る。
 * DOM を直接は触らないので、依存を差し替えれば単体で確かめられる。
 */
import { KEYS } from '../../common/constants.js';

/**
 * @typedef {object} NavigationDeps
 * @property {(workId: string) => Promise<void>} openWork 作品を開く
 * @property {() => boolean} isOpen モーダルが開いているか
 * @property {() => void} onRequestClose 閉じたいときに呼ばれる
 * @property {(workId: string) => void} onNavigate 作品が切り替わったときに呼ばれる
 * @property {() => boolean} canExtendSequence 全作品の並びへ広げてよいか
 * @property {(current: import('../sequence.js').Sequence) => Promise<import('../sequence.js').Sequence>} extendSequence 端で並びを広げる
 * @property {(direction: number) => void} movePage ページを送る (1 なら次、-1 なら前)
 * @property {(event: KeyboardEvent) => void} focusNext Tab のフォーカスを巡回させる
 */

/**
 * 移動の担当を作る。
 * @param {NavigationDeps} deps 依存
 * @returns {{moveWork: (direction: number) => Promise<void>, onKeyDown: (event: KeyboardEvent) => void, setSequence: (next: object) => void, setCurrentWorkId: (workId: string) => void, currentWorkId: () => string|null, reset: () => void}}
 */
export function createNavigation(deps) {
	/** 今開いている作品の並び。上下キーでの移動に使う */
	let sequence = null;
	/** 今開いている作品。移動の基準 */
	let currentWorkId = null;
	/** 端で全作品の並びへ広げている最中かどうか。二重に広げないためのガード */
	let extending = false;

	/**
	 * 前後の作品へ移動する。
	 * 端に達したら全作品の並びへ広げてもう一度試す。
	 * @param {number} direction 1 なら次、-1 なら前
	 * @returns {Promise<void>}
	 */
	async function moveWork(direction) {
		if (!sequence || !currentWorkId) return;
		let target = direction > 0 ? sequence.next(currentWorkId) : sequence.prev(currentWorkId);

		// 端に来た。全作品の並びへ広げられるなら広げてもう一度
		if (!target && deps.canExtendSequence() && !extending) {
			const from = currentWorkId;
			extending = true;
			try {
				sequence = await deps.extendSequence(sequence);
			} catch (error) {
				// 広げられなくても今の作品は見られる。端で止まるだけにする
				console.warn('[PixivMaster] failed to extend sequence', error);
				return;
			} finally {
				extending = false;
			}
			// 待っている間に上キーで戻っていたら、完了を理由に勝手に進めない
			if (currentWorkId !== from) return;
			target = direction > 0 ? sequence.next(currentWorkId) : sequence.prev(currentWorkId);
		}
		if (!target) return;

		deps.onNavigate(target);
		await deps.openWork(target);
	}

	/**
	 * キーボード操作。
	 * @param {KeyboardEvent} event キー
	 * @returns {void}
	 */
	function onKeyDown(event) {
		if (!deps.isOpen()) return;
		if (event.key === KEYS.CLOSE) {
			event.preventDefault();
			deps.onRequestClose();
			return;
		}
		if (event.key === KEYS.FOCUS_NEXT) {
			deps.focusNext(event);
			return;
		}
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
		if (event.key === KEYS.NEXT_WORK) {
			event.preventDefault();
			void moveWork(1);
			return;
		}
		if (event.key === KEYS.PREV_WORK) {
			event.preventDefault();
			void moveWork(-1);
			return;
		}
	}

	return {
		moveWork,
		onKeyDown,

		/**
		 * 並びを差し替える。
		 * @param {import('../sequence.js').Sequence} next 新しい並び
		 * @returns {void}
		 */
		setSequence(next) {
			sequence = next;
		},

		/**
		 * 今開いている作品を記録する。
		 * @param {string} workId 作品 ID
		 * @returns {void}
		 */
		setCurrentWorkId(workId) {
			currentWorkId = workId;
		},

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
		},
	};
}
