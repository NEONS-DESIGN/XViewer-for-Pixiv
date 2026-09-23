/**
 * 設定画面の組み立てと保存の橋渡し。
 * 設定を読んで popup-ui に描かせ、変更をそのまま保存する。
 * エントリ (popup.js) は import した時点で走るので、試せるように依存を引数で受ける形にここへ出した。(SPEC §15)
 */
import { loadSettings as loadSettingsImpl, saveSetting as saveSettingImpl, resetSettings as resetSettingsImpl } from '../common/storage.js';
import { logError } from '../common/log.js';
import { DEFAULT_LANGUAGE } from '../common/language.js';
import { createStrings } from '../i18n/index.js';
import { renderPopup as renderPopupImpl } from './popup-ui.js';

/** 描き先の要素の id (popup.html)。 */
const ROOT_ID = 'app';

/**
 * data-role で要素を探すセレクタ。
 * @param {string} role data-role の値
 * @returns {string} セレクタ
 */
function roleSelector(role) {
	return `[data-role="${role}"]`;
}

/**
 * 画面を組み立てる。
 * @param {object} deps 依存。テストでは偽物に差し替える
 * @param {Document} deps.doc 対象のドキュメント
 * @param {typeof loadSettingsImpl} [deps.loadSettings] 設定の読み出し
 * @param {typeof saveSettingImpl} [deps.saveSetting] 設定の保存
 * @param {typeof resetSettingsImpl} [deps.resetSettings] 設定の初期化
 * @param {typeof renderPopupImpl} [deps.renderPopup] 画面の描画
 * @param {typeof logError} [deps.report] 描画に失敗したときの記録
 * @returns {Promise<void>} 最初の描画の完了
 */
export async function main({
	doc,
	loadSettings = loadSettingsImpl,
	saveSetting = saveSettingImpl,
	resetSettings = resetSettingsImpl,
	renderPopup = renderPopupImpl,
	report = logError,
}) {
	const root = doc.getElementById(ROOT_ID);
	if (!root) return;

	// 表示言語の判定は Task 13 で入れる。ここでは暫定で既定の言語を使う
	const strings = createStrings(DEFAULT_LANGUAGE);

	// 保存の失敗だけを画面に出す。成功は画面がそのまま変わるので言葉を足さない。
	// 出した通知は次の保存が成功したときに消す (UI_DESIGN_KIT §4.8)
	let notice = null;

	/** 直近に描いた画面。描き直すときに現在のタブを引き継ぐために持つ。 */
	let screen = null;

	/** 進行中の保存。描き直しの前に待ち、画面が storage より古い値を出さないようにする。 */
	const pending = new Set();

	/**
	 * 保存を進行中として覚える。終わったら忘れる。
	 * @template T
	 * @param {Promise<T>} promise 保存の結果
	 * @returns {Promise<T>} 同じ Promise
	 */
	function track(promise) {
		pending.add(promise);
		promise.finally(() => pending.delete(promise)).catch(() => {});
		return promise;
	}

	/**
	 * 進行中の保存をすべて待つ。待っている間に増えた分も待つ。
	 * @returns {Promise<void>}
	 */
	async function settle() {
		while (pending.size > 0) await Promise.allSettled([...pending]);
	}

	/**
	 * 設定を読み直して描き直す。
	 * 利用者の現在地 (開いているタブ・フォーカス) は描き直しの外で持って復元する。(UI_DESIGN_KIT §7)
	 * 描画の例外はここで受けて記録する。呼び出し側は結果を待たないので、放すと素の unhandled rejection になる
	 * @param {{focusRole?: string|null}} [options] 描き直した後にフォーカスを戻す要素の data-role
	 * @returns {Promise<void>} 完了
	 */
	async function refresh({ focusRole = null } = {}) {
		try {
			await settle();
			const settings = await loadSettings();
			screen = renderPopup({
				doc,
				root,
				settings,
				strings,
				notice,
				initialTab: screen?.currentTab() ?? null,
				onChange,
				onReset,
			});
			if (focusRole) root.querySelector(roleSelector(focusRole))?.focus();
		} catch (error) {
			report('popup: 設定画面の描画に失敗しました', error);
		}
	}

	/**
	 * 設定を 1 項目保存する。失敗したら通知を出して描き直し、通知が出ている間に成功したら消す。
	 * @param {object} patch 変えた項目 (popup-ui からは常に 1 キーだけ届く)
	 * @returns {void}
	 */
	function onChange(patch) {
		const [[key, value]] = Object.entries(patch);
		void track(saveSetting(key, value)).then((saved) => {
			if (saved && notice === null) return;
			notice = saved ? null : strings.popup.SAVE_FAILED;
			// 変えた項目へフォーカスを戻す。描き直しで body へ落ちると現在地が失われる
			return refresh({ focusRole: key });
		}).catch((error) => report('popup: 設定の保存に失敗しました', error));
	}

	/**
	 * 設定を既定へ戻して描き直す。
	 * @returns {void}
	 */
	function onReset() {
		void track(resetSettings()).then((done) => {
			notice = done ? null : strings.popup.RESET_FAILED;
			// 確定ボタンを押した直後の現在地は、描き直した後の初期化ボタンに戻す
			return refresh({ focusRole: 'reset' });
		}).catch((error) => report('popup: 設定の初期化に失敗しました', error));
	}

	await refresh();
}
