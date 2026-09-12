/**
 * 設定画面のエントリ。
 * 設定を読んで popup-ui に描かせ、変更をそのまま保存する。
 * 画面の組み立ては popup-ui.js が持ち、ここは保存との橋渡しだけを受け持つ。
 */
import { loadSettings, saveSetting, resetSettings } from '../common/storage.js';
import { renderPopup } from './popup-ui.js';

/** 保存に失敗したときに画面へ出す一言。 */
const SAVE_FAILED = '保存できませんでした。ブラウザの設定同期を確認してください。';

/** 初期化に失敗したときに画面へ出す一言。 */
const RESET_FAILED = '初期化できませんでした。ブラウザの設定同期を確認してください。';

/**
 * 画面を組み立てる。
 * @returns {Promise<void>} 完了
 */
async function main() {
	const root = document.getElementById('app');
	if (!root) return;

	// 保存の失敗だけを画面に出す。成功は画面がそのまま変わるので言葉を足さない
	let notice = null;

	/**
	 * 設定を読み直して描き直す。
	 * @returns {Promise<void>} 完了
	 */
	async function refresh() {
		const settings = await loadSettings();
		renderPopup({
			doc: document,
			root,
			settings,
			notice,
			onChange: (patch) => {
				// 1 項目ずつ書く。popup-ui からは常に 1 キーだけ届く
				const [[key, value]] = Object.entries(patch);
				void saveSetting(key, value).then((saved) => {
					if (saved) return;
					notice = SAVE_FAILED;
					void refresh();
				});
			},
			onReset: () => {
				void resetSettings().then((done) => {
					notice = done ? null : RESET_FAILED;
					return refresh();
				});
			},
		});
	}

	await refresh();
}

void main().catch((error) => {
	// ここまで来ると画面が空のままなので、原因を残して気づけるようにする
	console.error('[PixivMaster:popup] 設定画面の表示に失敗しました', error);
});
