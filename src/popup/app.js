/**
 * 設定画面の組み立てと保存の橋渡し。
 * 設定を読んで popup-ui に描かせ、変更をそのまま保存する。
 * エントリ (popup.js) は import した時点で走るので、試せるように依存を引数で受ける形にここへ出した。(SPEC §15)
 */
import { loadSettings as loadSettingsImpl, saveSetting as saveSettingImpl, resetSettings as resetSettingsImpl } from '../common/storage.js';
import { logError } from '../common/log.js';
import { loadPageLanguage as loadPageLanguageImpl } from '../common/language-store.js';
import { normalizeLanguage, uiLanguage } from '../common/language.js';
import { createStrings } from '../i18n/index.js';
import { renderPopup as renderPopupImpl } from './popup-ui.js';

/**
 * ブラウザの UI 言語を読む。拡張の外では空文字。
 * @returns {string} BCP 47 のタグ
 */
function defaultGetUILanguage() {
	return globalThis.chrome?.i18n?.getUILanguage?.() ?? '';
}

/**
 * 設定画面に使う言語を決める。
 *
 * popup は pixiv のページを持たないので自分では判定できない。
 * content script が最後に書いた値を使い、無ければブラウザの UI 言語へ落ちる。
 * 最後に必ず uiLanguage() を通すので、フォールバックの規則は content script と同一になる。
 * (未対応の言語は英語、判定そのものに失敗したら日本語)
 *
 * pixiv の表示言語はアカウント設定で全タブ共通なので、タブへ問い合わせる必要はない。
 * @param {{loadPageLanguage?: () => Promise<string|null>, getUILanguage?: () => string}} [deps] 差し替え
 * @returns {Promise<string>} 言語サブタグ
 */
export async function resolvePopupLanguage(deps = {}) {
	const load = deps.loadPageLanguage ?? loadPageLanguageImpl;
	const getUILanguage = deps.getUILanguage ?? defaultGetUILanguage;
	let stored = null;
	try {
		stored = await load();
	} catch {
		// 読めなくても描く。下のフォールバックへ落とす
	}
	return uiLanguage(stored ?? normalizeLanguage(getUILanguage()));
}

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
 * @param {() => Promise<string|null>} [deps.loadPageLanguage] pixiv の表示言語の読み出し (resolvePopupLanguage へ渡す)
 * @param {() => string} [deps.getUILanguage] ブラウザの UI 言語の読み出し (resolvePopupLanguage へ渡す)
 * @returns {Promise<void>} 最初の描画の完了
 */
export async function main({
	doc,
	loadSettings = loadSettingsImpl,
	saveSetting = saveSettingImpl,
	resetSettings = resetSettingsImpl,
	renderPopup = renderPopupImpl,
	report = logError,
	loadPageLanguage,
	getUILanguage,
}) {
	const root = doc.getElementById(ROOT_ID);
	if (!root) return;

	// 設定の読み出しと言語の解決を同時に行う。直列にすると popup が開くのが遅くなる
	const [initialSettings, lang] = await Promise.all([
		loadSettings(),
		resolvePopupLanguage({ loadPageLanguage, getUILanguage }),
	]);
	const strings = createStrings(lang);
	// popup.html は lang="ja" で書いてある。実際に描く言語へ合わせる
	doc.documentElement.lang = strings.lang;

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
	 * @param {{focusRole?: string|null, settings?: object}} [options] 描き直した後にフォーカスを戻す要素の data-role。
	 *   settings を渡すと読み直さずそれを使う (main() が言語の解決と同時に読んだ初回分の使い回し)
	 * @returns {Promise<void>} 完了
	 */
	async function refresh({ focusRole = null, settings: preloadedSettings } = {}) {
		try {
			await settle();
			const settings = preloadedSettings ?? await loadSettings();
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
		const entries = Object.entries(patch);
		if (entries.length !== 1) {
			// イベントハンドラの中で素の例外を投げると report を通らない
			report('popup: 変更は 1 項目ずつ受け取る', patch);
			return;
		}
		const [[key, value]] = entries;
		// saveSetting は失敗を false で返す契約だが、差し替えた実装が reject しても失敗として畳む。
		// ログだけ残して画面を変えたままにすると、利用者は保存できたと思って閉じてしまう
		const saving = saveSetting(key, value).catch((error) => {
			report('popup: 設定の保存に失敗しました', error);
			return false;
		});
		void track(saving).then((saved) => {
			if (saved && notice === null) return;
			notice = saved ? null : strings.popup.SAVE_FAILED;
			// 変えた項目へフォーカスを戻す。描き直しで body へ落ちると現在地が失われる。
			// 見出しのテーマ切り替えも data-role に設定キー (popupTheme) を持つので同じ経路で戻る
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

	await refresh({ settings: initialSettings });
}
