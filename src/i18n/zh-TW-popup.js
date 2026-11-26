/**
 * 繁体字中国語 (台湾)の文言カタログのうち、設定画面 (popup) だけが使う節。(theme / licenses / popup)
 * content script の束に入れないため zh-TW.js から分けてある。popup はこの節だけを読む。
 * 形は ja-popup.js と必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 */
export default {
	theme: {
		TO_LIGHT: '切換為淺色模式',
		TO_DARK: '切換為深色模式',
	},
	licenses: {
		disclaimer: {
			brief: '這是 pixiv 的非官方擴充功能。詳情請見「授權」分頁。',
			body: [
				'本擴充功能是利用 pixiv 平台開發的非官方擴充功能，並非由 pixiv Inc. 製作或發布。與該公司沒有任何關係，也未獲得其合作、支援或推薦。',
				'因使用本擴充功能而產生的一切後果，均由使用者自行承擔。',
				'pixiv 及相關服務可能在未經通知的情況下修訂、變更或停止提供功能及內容，屆時本擴充功能可能無法運作。',
			],
		},
		notes: {
			'Material Symbols': '畫面中圖示的圖形資料',
			'Font Awesome Free': '分享選單中的品牌標誌。僅從 SVG 中擷取圖形使用（未變更形狀）。各標誌均為其權利人的商標',
		},
	},
	popup: {
		TABS_LABEL: '切換顯示內容',
		/**
		 * 既定の選択肢の見出しに印を付ける。
		 * @param {string} label 選択肢の見出し
		 * @returns {string} 印を付けた見出し
		 */
		withDefault: (label) => `${label}（預設）`,
		/** 親の項目がオフなので操作できない項目を押したときの警告 */
		dependency: {
			/**
			 * 親のスイッチをオンにするよう促す。
			 * @param {string} label 親の項目の見出し
			 * @returns {string} 警告
			 */
			turnOn: (label) => `請開啟「${label}」。`,
			/**
			 * 親の選択肢で「オフ」以外を選ぶよう促す。
			 * @param {string} label 親の項目の見出し
			 * @param {string} off 親の選択肢のうちオフに当たるものの見出し
			 * @returns {string} 警告
			 */
			chooseOther: (label, off) => `請在「${label}」中選擇「${off}」以外的選項。`,
		},
		SAVE_FAILED: '無法儲存。請確認瀏覽器的設定同步。',
		RESET_FAILED: '無法重設。請確認瀏覽器的設定同步。',
		tabs: {
			settings: '設定',
			advanced: '詳細設定',
			license: '授權',
		},
		licenseHeadings: {
			disclaimer: '免責聲明',
			project: '本擴充功能的授權',
			thirdParty: '隨附的第三方素材',
		},
		reset: {
			label: '重設設定',
			description: '將包含配色在內的所有設定恢復為預設值。',
			cancel: '取消',
			confirm: '重設',
		},
		headings: {
			viewer: '檢視器',
			image: '圖片',
			userPage: '用戶頁面',
			controls: '操作',
			slideshow: '自動翻頁',
			comments: '評論',
		},
		fields: {
			enabled: {
				label: '使用檢視器',
				description: '關閉後會恢復為 pixiv 的標準行為。',
			},
			viewerOnUser: {
				label: '在使用者頁面使用',
				description: '從使用者頁面的作品列表開啟時顯示檢視器。',
			},
			viewerOnHome: {
				label: '在首頁使用',
				description: '從 pixiv 首頁（首頁 / 插畫 / 漫畫）的作品開啟時顯示檢視器。',
			},
			viewerOnSearch: {
				label: '在搜尋結果中使用',
				description: '從搜尋結果（標籤頁面與搜尋頁面）開啟時顯示檢視器。',
			},
			showSidebar: {
				label: '顯示側邊欄',
				description: '在圖片旁顯示作品說明、標籤、讚數及評論。關閉後，會在關閉按鈕旁顯示作品頁面的連結。',
			},
			sidebarScroll: {
				label: '側邊欄的捲動方式',
				description: '縱向捲動側邊欄時的行為。',
				comments: {
					label: '只捲動評論',
					description: '作品說明與標籤保持固定，只捲動評論列表。',
				},
				whole: {
					label: '整個側邊欄一起捲動',
					description: '從作品說明到評論連成一體捲動。即使作品說明很長，也能直接往下讀到評論。',
				},
			},
			imageQuality: {
				label: '圖片解析度',
				description: '檢視器載入的圖片尺寸。',
				regular: {
					label: '標準（長邊 1200px）',
					description: '載入較輕快，適合平常瀏覽。',
				},
				original: {
					label: '原尺寸',
					description: '畫質清晰，但載入較慢。',
				},
			},
			prefetch: {
				label: '預先載入',
				description: '預先載入接下來要看的圖片，切換時會更快。',
				/**
				 * 先読みの「カスタム」の選択肢。枚数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の枚数
				 * @param {number} max 選べる最大の枚数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自訂', description: `從 ${min}～${max} 張中選擇前後預先載入的張數。` }),
				none: {
					label: '不預先載入',
					description: '每次切換時才載入。可以節省流量。',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '前後 1 張', description: '只預先載入相鄰的 1 張。' }
					: {
						label: `前後 ${count} 張`,
						description: `預先載入前後各 ${count} 張。連續瀏覽時更流暢。`,
					}),
			},
			prefetchCustom: {
				label: '預先載入張數',
				warning: '預先載入過多會佔用大量記憶體。',
			},
			sidebarWidth: {
				label: '側邊欄寬度',
				description: '視窗較寬時顯示在右側的側邊欄寬度。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}px`,
			},
			sidebarDrawerMax: {
				label: '拉出的側邊欄寬度',
				description: '視窗較窄（寬 900px 以下）時拉出的側邊欄相對於視窗寬度的上限。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			backdropMode: {
				label: '背景濃度',
				description: '鋪在圖片後方的黑色幕布濃度。調低後可以透過它看到後方的頁面。',
				theme: {
					label: '跟隨主題',
					description: '深色時為 92%，淺色時為 88%。',
				},
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自訂', description: `從 ${min}～${max}% 中選擇濃度。` }),
			},
			backdropOpacity: {
				label: '濃度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneMode: {
				label: '畫面邊緣點擊區域寬度',
				description: '點擊畫面邊緣翻頁時所用邊緣的寬度，為相對於圖片顯示區域的比例。選擇自訂時，可分別設定左右邊緣與上下邊緣。',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自訂', description: `分別從 ${min}～${max}% 中選擇左右與上下的寬度。` }),
			},
			navZoneSize: {
				label: '左右寬度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneSizeVertical: {
				label: '上下寬度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			zoomZoneMode: {
				label: '原尺寸顯示的點擊區域寬度',
				description: '在原尺寸顯示畫面中，用於翻頁的左右邊緣寬度。',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自訂', description: `從 ${min}～${max}% 中選擇寬度。` }),
			},
			zoomZoneSize: {
				label: '寬度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			commentPageSize: {
				label: '一次讀取的評論數',
				description: '開啟時與點擊「瀏覽更多」時讀取的則數。從下一個開啟的作品開始生效。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value} 則`,
			},
			prefetchNeighbor: {
				label: '預先載入前後作品',
				description: '顯示完成後，會預先載入 1 件透過 ↑ ↓ 可能前往的作品。切換更快，但即使未切換就關閉，也會增加流量消耗。',
			},
			clickZoom: {
				label: '點擊以原尺寸顯示',
				description: '點擊圖片後，會以原尺寸填滿整個畫面開啟（與 pixiv 的作品頁面相同）。點擊左右兩端或按 ← → 翻頁，再點擊一次或按 Esc 返回。無論上方的解析度設定為何，都會載入原尺寸圖片。',
			},
			hidePickup: {
				label: '隱藏精選欄',
				description: '隱藏個人資料首頁上的「精選」。作品列表會立刻映入眼簾。',
			},
			infiniteScroll: {
				label: '無限捲動',
				description: '將插畫、漫畫列表的換頁，改為往下持續載入的形式。',
				off: {
					label: '不使用',
					description: '維持 pixiv 標準的分頁（1 2 3 …）。',
				},
				onReach: {
					label: '捲到底部時載入',
					description: '捲到最底部後才載入下一頁。流量較少，但需要稍等一下。',
				},
				ahead: {
					label: '隨時預先載入下一頁',
					description: '在距離底部還有一個畫面的高度時就排好下一頁。不必等待就能繼續瀏覽。',
				},
			},
			closeOnBackdrop: {
				label: '點擊背景關閉',
				description: '點擊圖片外側即可關閉。容易誤觸而關閉的話，請關掉此選項。',
			},
			navZones: {
				label: '點擊畫面邊緣翻頁',
				description: '點擊畫面邊緣即可翻頁或切換作品。移到邊緣時游標會變成箭頭。',
				off: {
					label: '不使用',
					description: '只用箭頭按鈕和鍵盤翻頁。',
				},
				horizontal: {
					label: '左右翻頁',
					description: '點擊左右邊緣即可切換到上一頁或下一頁。在圖片上也有效。',
				},
				vertical: {
					label: '上下切換作品',
					description: '點擊上下邊緣即可切換到上一個或下一個作品。翻頁請用箭頭按鈕。',
				},
				both: {
					label: '左右翻頁・上下切換作品',
					description: '左右翻頁，上下切換作品。四角以左右優先。',
				},
			},
			slideshow: {
				label: '自動翻頁',
				description: '依固定間隔自動翻到下一頁。啟用後檢視器下方會出現操作列。',
				off: {
					label: '不使用',
					description: '手動翻頁。',
				},
				work: {
					label: '僅在作品內',
					description: '翻到最後一頁後停止。',
				},
				sequence: {
					label: '到尾端後進入下一作品',
					description: '最後一頁之後，進入下一個作品。',
				},
			},
			slideshowInterval: {
				label: '翻頁間隔',
				description: '翻到下一頁前的等待時間。從圖片顯示後開始計時。',
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
				custom: (min, max) => ({ label: '自訂', description: `從 ${min}～${max} 秒中選擇，以 0.5 秒為單位。` }),
			},
			slideshowIntervalCustom: {
				label: '間隔',
				option: (s) => `${s} 秒`,
			},
			slideshowLoop: {
				label: '循環',
				description: '翻到最後後回到開頭。僅在作品內時回到第 1 頁，到尾端後進入下一作品時回到清單中的第一個作品。',
			},
			gridTabSkip: {
				label: '網格中的 Tab 移動',
				description: '按 Tab 移到下一個作品時的跳過方式。',
				both: {
					label: '跳過收藏與標題',
					description: '使用者頁面的卡片會依序經過「縮圖 → 收藏 → 標題」3 個位置。跳過後按 1 次 Tab 即可移到下一個作品。在首頁與搜尋結果中，不會跳過作者的連結。',
				},
				title: {
					label: '只跳過標題',
					description: '收藏按鈕仍可在網格中直接點擊。',
				},
				none: {
					label: '不跳過',
					description: '維持 pixiv 標準的順序。',
				},
			},
		},
	},
};
