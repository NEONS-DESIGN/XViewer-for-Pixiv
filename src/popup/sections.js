/**
 * 設定画面の文言と定義表。
 * 画面に出る文字列はすべてここに置き、描画側 (popup-ui.js) は表を回すだけにする (UI_DESIGN_KIT §7)。
 * 項目を足すときは SECTIONS へ 1 行足す。キーは SETTINGS_DEFAULTS と 1 対 1 に対応させる
 * (対応は test/popup/popup-ui.test.js が見張る)。
 */
import {
	IMAGE_QUALITY,
	PREFETCH_CHOICES,
	GRID_TAB_SKIP,
	SIDEBAR_SCROLL,
	INFINITE_SCROLL,
} from '../common/constants.js';

/** 画面の題名。拡張の名前をそのまま出す。 */
export const TITLE = 'GridViewer for Pixiv';

/**
 * タブの定義。順番がそのまま画面の並びと左右キーの順になる。
 * 設定は 1 枚のまま。分けるのは「操作する画面」と「読む画面」であって、設定項目同士ではない。
 */
export const TABS = Object.freeze([
	Object.freeze({ id: 'settings', label: '設定' }),
	Object.freeze({ id: 'license', label: 'ライセンス' }),
]);

/** タブの並び自体の読み上げ名。個々のタブ名だけでは何の切り替えか分からないため。 */
export const TABS_LABEL = '表示するものの切り替え';

/** ライセンスタブの見出し。 */
export const LICENSE_HEADINGS = Object.freeze({
	disclaimer: '免責事項',
	project: 'この拡張機能のライセンス',
	thirdParty: '同梱している第三者の成果物',
});

/**
 * 「設定を初期化」の文言。確認の行では「やめる」を左、「初期化する」を右に並べる。
 * role は data-role の接頭辞 (reset / reset-confirmation / reset-cancel / reset-confirm)。
 */
export const RESET_FIELD = Object.freeze({
	role: 'reset',
	label: '設定を初期化',
	description: '配色を含むすべての設定を既定に戻します。',
	cancel: 'やめる',
	confirm: '初期化する',
});

/**
 * 先読みの選択肢を枚数から起こす。
 * 文言を添字で手書きすると PREFETCH_CHOICES の並びや値を変えたときに黙ってずれるので、値から作る。
 * @param {number} count 前後に先読みする枚数
 * @returns {{value: string, label: string, description: string}} 選択肢
 */
function prefetchOption(count) {
	if (count === 0) {
		return Object.freeze({
			value: String(count),
			label: 'しない',
			description: '切り替えるたびに読み込みます。通信量を抑えられます。',
		});
	}
	if (count === 1) {
		return Object.freeze({
			value: String(count),
			label: '前後 1 枚',
			description: '隣の 1 枚だけ先に読み込みます。',
		});
	}
	return Object.freeze({
		value: String(count),
		label: `前後 ${count} 枚`,
		description: `${count} 枚先まで読み込みます。続けて見るときに滑らかです。`,
	});
}

/**
 * 画面の中身。見出しごとに関連する項目をまとめる。
 *
 * kind が 'toggle' ならスイッチ、'choice' なら選択肢。
 * choice の値は select の都合で文字列にしてある。保存時の型は SETTINGS_DEFAULTS の既定値の型から
 * 描画側が導く (数値の項目なら Number() へ戻す) ので、ここに型の印は持たない。
 */
export const SECTIONS = Object.freeze([
	Object.freeze({
		heading: 'ビュワー',
		fields: Object.freeze([
			Object.freeze({
				kind: 'toggle',
				key: 'enabled',
				label: 'ビュワーを使う',
				description: 'オフにすると pixiv 標準の動作に戻ります。',
			}),
			Object.freeze({
				kind: 'toggle',
				key: 'showSidebar',
				label: 'サイドバーを表示する',
				description: '投稿文・タグ・いいね数・コメントを画像の横に出します。',
			}),
			Object.freeze({
				kind: 'choice',
				key: 'sidebarScroll',
				label: 'サイドバーのスクロール',
				description: 'サイドバーを縦に送るときの動き方です。',
				options: Object.freeze([
					Object.freeze({
						value: SIDEBAR_SCROLL.COMMENTS,
						label: 'コメントだけを送る',
						description: '投稿文とタグは固定したまま、コメント一覧だけを送ります。',
					}),
					Object.freeze({
						value: SIDEBAR_SCROLL.WHOLE,
						label: 'サイドバーごと送る',
						description: '投稿文からコメントまでを 1 つにつなげて送ります。主文が長い作品でも、そのまま読み進めてコメントまで辿り着けます。',
					}),
				]),
			}),
		]),
	}),
	Object.freeze({
		heading: '画像',
		fields: Object.freeze([
			Object.freeze({
				kind: 'choice',
				key: 'imageQuality',
				label: '画像の解像度',
				description: 'ビュワーで読み込む画像の大きさです。',
				options: Object.freeze([
					Object.freeze({
						value: IMAGE_QUALITY.REGULAR,
						label: '標準 (長辺 1200px)',
						description: '読み込みが軽く、普段の閲覧に向きます。',
					}),
					Object.freeze({
						value: IMAGE_QUALITY.ORIGINAL,
						label: '原寸',
						description: '鮮明ですが、読み込みが重くなります。',
					}),
				]),
			}),
			Object.freeze({
				kind: 'choice',
				key: 'prefetch',
				label: '先読み',
				description: '次に見る画像を先に読み込んでおくと、切り替えが速くなります。',
				options: Object.freeze(PREFETCH_CHOICES.map(prefetchOption)),
			}),
		]),
	}),
	Object.freeze({
		heading: 'ユーザーページ',
		fields: Object.freeze([
			Object.freeze({
				kind: 'toggle',
				key: 'hidePickup',
				label: 'ピックアップ欄を隠す',
				description: 'プロフィールのホームに出る「ピックアップ」を隠します。作品一覧がすぐ目に入ります。',
			}),
			Object.freeze({
				kind: 'choice',
				key: 'infiniteScroll',
				label: '無限スクロール',
				description: 'イラスト・マンガ一覧のページ送りを、下に続けて読み込む形にします。',
				options: Object.freeze([
					Object.freeze({
						value: INFINITE_SCROLL.OFF,
						label: '使わない',
						description: 'pixiv 標準のページャ (1 2 3 …) のままにします。',
					}),
					Object.freeze({
						value: INFINITE_SCROLL.ON_REACH,
						label: '下まで来たら読み込む',
						description: '一番下に着いてから次のページを読みます。通信は少なめですが、そのぶん少し待ちます。',
					}),
					Object.freeze({
						value: INFINITE_SCROLL.PREFETCH,
						label: '常に 1 ページ先を読んでおく',
						description: '下に着く 1 画面ぶん手前で次のページを並べます。待たずに読み進められます。',
					}),
				]),
			}),
		]),
	}),
	Object.freeze({
		heading: '操作',
		fields: Object.freeze([
			Object.freeze({
				kind: 'toggle',
				key: 'closeOnBackdrop',
				label: '背景クリックで閉じる',
				description: '画像の外側を押すと閉じます。誤って閉じるならオフに。',
			}),
			Object.freeze({
				kind: 'choice',
				key: 'gridTabSkip',
				label: 'グリッドの Tab 移動',
				description: 'Tab で次の作品へ移るときの飛ばし方です。',
				options: Object.freeze([
					Object.freeze({
						value: GRID_TAB_SKIP.BOTH,
						label: 'ブックマークとタイトルを飛ばす',
						description: 'カードは「サムネ → ブックマーク → タイトル」の 3 つを順に辿ります。飛ばすと Tab 1 回で次の作品へ移れ、飛ばした操作はビュワーの中で行えます。',
					}),
					Object.freeze({
						value: GRID_TAB_SKIP.TITLE,
						label: 'タイトルだけ飛ばす',
						description: 'ブックマークはグリッドのまま押せます。',
					}),
					Object.freeze({
						value: GRID_TAB_SKIP.NONE,
						label: '飛ばさない',
						description: 'pixiv 標準の順序のままにします。',
					}),
				]),
			}),
		]),
	}),
]);
