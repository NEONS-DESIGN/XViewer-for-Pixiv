/**
 * 日本語の文言カタログのうち、設定画面 (popup) だけが使う節。(theme / licenses / popup)
 * content script の束に入れないため ja.js から分けてある。popup はこの節だけを読む。
 * 他の言語の *-popup.js はこれと同じ形を持つ。
 */
export default {
	theme: {
		TO_LIGHT: 'ライトモードに切り替える',
		TO_DARK: 'ダークモードに切り替える',
	},
	licenses: {
		disclaimer: {
			brief: 'pixiv 非公式の拡張機能です。詳しくは「ライセンス」タブへ。',
			body: [
				'pixiv プラットフォームを利用して開発した非公式の拡張機能です。ピクシブ株式会社が作成・配布するものではありません。同社とは一切関係がなく、提携・支援・推奨を受けたものでもありません。',
				'利用によって生じた一切の結果については、利用者自身が責任を負うものとします。',
				'pixiv および関連サービスは予告なく機能や掲載内容の改訂・変更・提供停止を行う場合があり、そのときこの拡張が動かなくなることがあります。',
			],
		},
		notes: {
			'Material Symbols': '画面のアイコンの図形データ',
			'Font Awesome Free': 'シェアメニューのブランドロゴ。SVG から図形だけを抜き出して使っています。(形は変えていません) 各ロゴはそれぞれの権利者の商標です',
		},
	},
	popup: {
		TABS_LABEL: '表示するものの切り替え',
		/**
		 * 既定の選択肢の見出しに印を付ける。
		 * @param {string} label 選択肢の見出し
		 * @returns {string} 印を付けた見出し
		 */
		withDefault: (label) => `${label} (既定)`,
		/** 親の項目がオフなので操作できない項目を押したときの警告 */
		dependency: {
			/**
			 * 親のスイッチをオンにするよう促す。
			 * @param {string} label 親の項目の見出し
			 * @returns {string} 警告
			 */
			turnOn: (label) => `「${label}」をオンにしてください。`,
			/**
			 * 親の選択肢で「オフ」以外を選ぶよう促す。
			 * @param {string} label 親の項目の見出し
			 * @param {string} off 親の選択肢のうちオフに当たるものの見出し
			 * @returns {string} 警告
			 */
			chooseOther: (label, off) => `「${label}」で「${off}」以外を選んでください。`,
		},
		SAVE_FAILED: '保存できませんでした。ブラウザの設定同期を確認してください。',
		RESET_FAILED: '初期化できませんでした。ブラウザの設定同期を確認してください。',
		tabs: {
			settings: '設定',
			advanced: '詳細設定',
			license: 'ライセンス',
		},
		licenseHeadings: {
			disclaimer: '免責事項',
			project: 'この拡張機能のライセンス',
			thirdParty: '同梱している第三者の成果物',
		},
		reset: {
			label: '設定を初期化',
			description: '配色を含むすべての設定を既定に戻します。',
			cancel: 'やめる',
			confirm: '初期化する',
		},
		headings: {
			viewer: 'ビュワー',
			image: '画像',
			userPage: 'ユーザーページ',
			controls: '操作',
			slideshow: '自動送り',
			comments: 'コメント',
		},
		fields: {
			enabled: {
				label: 'ビュワーを使う',
				description: 'オフにすると pixiv 標準の動作に戻ります。',
			},
			viewerOnUser: {
				label: 'ユーザーページで使う',
				description: 'ユーザーページの作品一覧から開いたときにビュワーを出します。',
			},
			viewerOnHome: {
				label: 'ホームで使う',
				description: 'pixiv のホーム (ホーム / イラスト / マンガ) の作品から開いたときにビュワーを出します。',
			},
			viewerOnSearch: {
				label: '検索結果で使う',
				description: '検索結果 (タグのページと検索画面) から開いたときにビュワーを出します。',
			},
			showSidebar: {
				label: 'サイドバーを表示する',
				description: '投稿文・タグ・いいね数・コメントを画像の横に出します。オフにすると、作品ページへのリンクを閉じるボタンの横に出します。',
			},
			sidebarScroll: {
				label: 'サイドバーのスクロール',
				description: 'サイドバーを縦に送るときの動き方です。',
				comments: {
					label: 'コメントだけを送る',
					description: '投稿文とタグは固定したまま、コメント一覧だけを送ります。',
				},
				whole: {
					label: 'サイドバーごと送る',
					description: '投稿文からコメントまでを 1 つにつなげて送ります。投稿文が長い作品でも、そのまま読み進めてコメントまで辿り着けます。',
				},
			},
			imageQuality: {
				label: '画像の解像度',
				description: 'ビュワーで読み込む画像の大きさです。',
				regular: {
					label: '標準 (長辺 1200px)',
					description: '読み込みが軽く、普段の閲覧に向きます。',
				},
				original: {
					label: '原寸',
					description: '鮮明ですが、読み込みが重くなります。',
				},
			},
			prefetch: {
				label: '先読み',
				description: '次に見る画像を先に読み込んでおくと、切り替えが速くなります。',
				/**
				 * 先読みの「カスタム」の選択肢。枚数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の枚数
				 * @param {number} max 選べる最大の枚数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: 'カスタム', description: `前後に読む枚数を ${min}〜${max} 枚から選びます。` }),
				none: {
					label: 'しない',
					description: '切り替えるたびに読み込みます。通信量を抑えられます。',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '前後 1 枚', description: '隣の 1 枚だけ先に読み込みます。' }
					: {
						label: `前後 ${count} 枚`,
						description: `前後 ${count} 枚ずつ先に読み込みます。続けて見るときに滑らかです。`,
					}),
			},
			prefetchCustom: {
				label: '先読みする枚数',
				warning: '多く先読みを行うとメモリを圧迫します。',
			},
			sidebarWidth: {
				label: 'サイドバーの幅',
				description: '画面が広いときに右に出るサイドバーの幅です。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}px`,
			},
			sidebarDrawerMax: {
				label: '引き出したサイドバーの幅',
				description: '画面が狭いとき (幅 900px 以下) に引き出したサイドバーの、画面の幅に対する上限です。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			backdropMode: {
				label: '背景の濃さ',
				description: '画像の後ろに敷く黒い幕の濃さです。下げると後ろのページが透けて見えます。',
				theme: {
					label: 'テーマに合わせる',
					description: 'ダークでは 92%、ライトでは 88% にします。',
				},
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: 'カスタム', description: `濃さを ${min}〜${max}% から選びます。` }),
			},
			backdropOpacity: {
				label: '濃さ',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneMode: {
				label: '画面端のクリック領域の幅',
				description: '画面端のクリックで送るときの、端の幅です。画像を出す部分に対する割合で、カスタムでは左右の端と上下の端で別々に選べます。',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: 'カスタム', description: `左右と上下の幅を、それぞれ ${min}〜${max}% から選びます。` }),
			},
			navZoneSize: {
				label: '左右の幅',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneSizeVertical: {
				label: '上下の幅',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			zoomZoneMode: {
				label: '原寸表示のクリック領域の幅',
				description: '原寸表示の画面で、ページ送りに使う左右の端の幅です。',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: 'カスタム', description: `幅を ${min}〜${max}% から選びます。` }),
			},
			zoomZoneSize: {
				label: '幅',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			commentPageSize: {
				label: '一度に読むコメントの数',
				description: '開いたときと「もっと見る」を押したときに読み込む件数です。次に開いた作品から変わります。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value} 件`,
			},
			prefetchNeighbor: {
				label: '前後の作品も先読み',
				description: '↑ ↓ で作品を送る先を、表示し終えてから 1 件だけ読み込んでおきます。送るのが速くなりますが、送らずに閉じた分の通信が増えます。',
			},
			clickZoom: {
				label: 'クリックで原寸表示',
				description: '画像を押すと、原寸のまま画面いっぱいに開きます。(pixiv の作品ページと同じ) 左右の端を押すか ← → でページを送り、もう一度押すか Esc で戻ります。上の解像度の指定にかかわらず原寸の画像を読み込みます。',
			},
			hidePickup: {
				label: 'ピックアップ欄を隠す',
				description: 'プロフィールのホームに出る「ピックアップ」を隠します。作品一覧がすぐ目に入ります。',
			},
			infiniteScroll: {
				label: '無限スクロール',
				description: 'イラスト・マンガ一覧のページ送りを、下に続けて読み込む形にします。',
				off: {
					label: '使わない',
					description: 'pixiv 標準のページャ (1 2 3 …) のままにします。',
				},
				onReach: {
					label: '下まで来たら読み込む',
					description: '一番下に着いてから次のページを読みます。通信は少なめですが、そのぶん少し待ちます。',
				},
				ahead: {
					label: '常に 1 ページ先を読んでおく',
					description: '下に着く 1 画面ぶん手前で次のページを並べます。待たずに読み進められます。',
				},
			},
			closeOnBackdrop: {
				label: '背景クリックで閉じる',
				description: '画像の外側を押すと閉じます。誤って閉じるならオフに。',
			},
			navZones: {
				label: '画面端のクリックで送る',
				description: '画面の端を押してページや作品を送ります。端ではカーソルが矢印に変わります。',
				off: {
					label: '使わない',
					description: '矢印ボタンとキー操作だけで送ります。',
				},
				horizontal: {
					label: '左右でページ送り',
					description: '左右の端を押すと前後のページへ送ります。画像の上でも効きます。',
				},
				vertical: {
					label: '上下で作品送り',
					description: '上下の端を押すと前後の作品へ移ります。ページは矢印ボタンで送ります。',
				},
				both: {
					label: '左右でページ・上下で作品',
					description: '左右でページ、上下で作品を送ります。四隅は左右が優先です。',
				},
			},
			slideshow: {
				label: '自動送り',
				description: 'ページを一定の間隔で自動的に送ります。使うとビュワーの下に操作バーが出ます。',
				off: {
					label: '使わない',
					description: '手で送ります。',
				},
				work: {
					label: '作品の中だけ',
					description: '最後のページまで送ったら止まります。',
				},
				sequence: {
					label: '端で次の作品へ',
					description: '最後のページの次は、次の作品へ移ります。',
				},
			},
			slideshowInterval: {
				label: '送る間隔',
				description: '次のページへ送るまでの時間です。画像が表示されてから数えます。',
				/**
				 * 間隔の選択肢の見出し。
				 * @param {number} seconds 秒数
				 * @returns {string} 見出し
				 */
				option: (s) => `${s} 秒`,
				/**
				 * 間隔の「カスタム」の選択肢。秒数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の秒数
				 * @param {number} max 選べる最大の秒数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: 'カスタム', description: `${min}〜${max} 秒を 0.5 秒刻みで選びます。` }),
			},
			slideshowIntervalCustom: {
				label: '間隔',
				option: (s) => `${s} 秒`,
			},
			slideshowLoop: {
				label: 'ループ',
				description: '最後まで送ったら先頭へ戻ります。作品の中だけなら 1 ページ目へ、端で次の作品へなら並びの最初の作品へ戻ります。',
			},
			gridTabSkip: {
				label: 'グリッドの Tab 移動',
				description: 'Tab で次の作品へ移るときの飛ばし方です。',
				both: {
					label: 'ブックマークとタイトルを飛ばす',
					description: 'ユーザーページのカードは「サムネイル → ブックマーク → タイトル」の 3 つを順に辿ります。飛ばすと Tab 1 回で次の作品へ移れます。ホームと検索では、作者のリンクは飛ばしません。',
				},
				title: {
					label: 'タイトルだけ飛ばす',
					description: 'ブックマークはグリッドのまま押せます。',
				},
				none: {
					label: '飛ばさない',
					description: 'pixiv 標準の順序のままにします。',
				},
			},
		},
	},
};
