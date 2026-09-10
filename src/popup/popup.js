/**
 * 設定画面。
 * 保存ボタンは作らず、変更のたびに保存する (UI_DESIGN_KIT §9)。
 * 見た目の反映は保存の完了を待たない。待つと押した手応えが遅れるため。
 */
import { loadSettings, saveSetting } from '../common/storage.js';
import { IMAGE_QUALITY, PREFETCH_CHOICES, SETTINGS_DEFAULTS } from '../common/constants.js';

/** 保存したことを伝える表示を消すまでの時間 (ミリ秒)。 */
const STATUS_CLEAR_MS = 1500;

/** 真偽値で持つ設定と、対応する input の id。 */
const TOGGLE_KEYS = ['enabled', 'showSidebar', 'closeOnBackdrop'];

/**
 * 保存の結果を短く伝える。
 * 失敗したときは消さずに残す。ユーザーが気づかないまま値が失われるのを防ぐため。
 * @param {HTMLElement} status 表示先
 * @param {boolean} saved 保存できたか
 * @returns {void}
 */
function announceSaved(status, saved) {
	status.textContent = saved ? '保存しました' : '保存できませんでした';
	if (!saved) return;
	setTimeout(() => { status.textContent = ''; }, STATUS_CLEAR_MS);
}

/**
 * 画面を組み立てる。
 * @returns {Promise<void>}
 */
async function main() {
	const status = document.getElementById('status');

	// popup 自身の配色。OS の設定に合わせる。loadSettings より前に判定し、切り替わりのちらつきを防ぐ
	const prefersLight = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches;
	if (prefersLight) document.documentElement.dataset.theme = 'light';

	const settings = await loadSettings();

	for (const key of TOGGLE_KEYS) {
		const input = document.getElementById(key);
		input.checked = settings[key];
		input.addEventListener('change', () => {
			void saveSetting(key, input.checked).then((saved) => announceSaved(status, saved));
		});
	}

	const quality = document.getElementById('imageQuality');
	quality.value = settings.imageQuality;
	quality.addEventListener('change', () => {
		// 選択肢の外の値が入ることはないが、念のため既定へ倒す
		const value = Object.values(IMAGE_QUALITY).includes(quality.value)
			? quality.value
			: SETTINGS_DEFAULTS.imageQuality;
		void saveSetting('imageQuality', value).then((saved) => announceSaved(status, saved));
	});

	const prefetch = document.getElementById('prefetch');
	prefetch.value = String(settings.prefetch);
	prefetch.addEventListener('change', () => {
		const value = Number(prefetch.value);
		void saveSetting('prefetch', PREFETCH_CHOICES.includes(value) ? value : SETTINGS_DEFAULTS.prefetch)
			.then((saved) => announceSaved(status, saved));
	});
}

void main();
