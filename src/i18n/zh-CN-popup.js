/**
 * 簡体字中国語の文言カタログのうち、設定画面 (popup) だけが使う節。(theme / licenses / popup)
 * content script の束に入れないため zh-CN.js から分けてある。popup はこの節だけを読む。
 * 形は ja-popup.js と必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 */
export default {
	theme: {
		TO_LIGHT: '切换到浅色模式',
		TO_DARK: '切换到深色模式',
	},
	licenses: {
		disclaimer: {
			brief: '这是一款非官方的 pixiv 扩展程序。详情请查看“许可证”标签页。',
			body: [
				'这是利用 pixiv 平台开发的非官方扩展程序，并非由 pixiv Inc. 制作或发布。本扩展程序与该公司没有任何关系，也未获得其合作、支持或推荐。',
				'因使用本扩展程序而产生的一切后果，均由用户自行承担。',
				'pixiv 及相关服务可能会在不事先通知的情况下修订、更改或停止提供功能及内容，届时本扩展程序可能无法正常运行。',
			],
		},
		notes: {
			'Material Symbols': '界面图标的图形数据',
			'Font Awesome Free': '分享菜单中的品牌标志。仅从 SVG 中提取图形使用（未改变形状）。各标志均为其各自权利人的商标',
		},
	},
	popup: {
		TABS_LABEL: '切换显示内容',
		/**
		 * 既定の選択肢の見出しに印を付ける。
		 * @param {string} label 選択肢の見出し
		 * @returns {string} 印を付けた見出し
		 */
		withDefault: (label) => `${label}（默认）`,
		/** 親の項目がオフなので操作できない項目を押したときの警告 */
		dependency: {
			/**
			 * 親のスイッチをオンにするよう促す。
			 * @param {string} label 親の項目の見出し
			 * @returns {string} 警告
			 */
			turnOn: (label) => `请开启“${label}”。`,
			/**
			 * 親の選択肢で「オフ」以外を選ぶよう促す。
			 * @param {string} label 親の項目の見出し
			 * @param {string} off 親の選択肢のうちオフに当たるものの見出し
			 * @returns {string} 警告
			 */
			chooseOther: (label, off) => `请在“${label}”中选择“${off}”以外的选项。`,
		},
		SAVE_FAILED: '无法保存。请检查浏览器的设置同步。',
		RESET_FAILED: '无法重置。请检查浏览器的设置同步。',
		tabs: {
			settings: '设置',
			advanced: '详细设置',
			license: '许可证',
		},
		licenseHeadings: {
			disclaimer: '免责声明',
			project: '本扩展程序的许可证',
			thirdParty: '随附的第三方资源',
		},
		reset: {
			label: '重置设置',
			description: '将包括配色在内的所有设置恢复为默认值。',
			cancel: '取消',
			confirm: '重置',
		},
		headings: {
			viewer: '查看器',
			image: '图片',
			userPage: '用户页面',
			controls: '操作',
			slideshow: '自动翻页',
			comments: '评论',
		},
		fields: {
			enabled: {
				label: '使用查看器',
				description: '关闭后将恢复 pixiv 的默认行为。',
			},
			viewerOnUser: {
				label: '在用户页面使用',
				description: '从用户页面的作品列表打开时显示查看器。',
			},
			viewerOnHome: {
				label: '在首页使用',
				description: '从 pixiv 首页（首页 / 插画 / 漫画）的作品打开时显示查看器。',
			},
			viewerOnSearch: {
				label: '在搜索结果中使用',
				description: '从搜索结果（标签页面和搜索页面）打开时显示查看器。',
			},
			showSidebar: {
				label: '显示侧边栏',
				description: '在图片旁显示作品说明、标签、点赞数和评论。关闭后，会在关闭按钮旁显示作品页面的链接。',
			},
			sidebarScroll: {
				label: '侧边栏的滚动方式',
				description: '上下滚动侧边栏时的行为。',
				comments: {
					label: '仅滚动评论',
					description: '作品说明和标签保持固定，只滚动评论列表。',
				},
				whole: {
					label: '整个侧边栏一起滚动',
					description: '将作品说明到评论连成一体滚动。即使作品说明很长，也能一路读到评论。',
				},
			},
			imageQuality: {
				label: '图片分辨率',
				description: '查看器中加载的图片尺寸。',
				regular: {
					label: '标准（长边 1200px）',
					description: '加载更快，适合日常浏览。',
				},
				original: {
					label: '原图',
					description: '更清晰，但加载较慢。',
				},
			},
			prefetch: {
				label: '预加载',
				description: '提前加载接下来要看的图片，切换时会更快。',
				/**
				 * 先読みの「カスタム」の選択肢。枚数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の枚数
				 * @param {number} max 選べる最大の枚数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自定义', description: `从 ${min}～${max} 张中选择前后各预加载的张数。` }),
				none: {
					label: '不预加载',
					description: '每次切换时才加载。可以节省流量。',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '前后各 1 张', description: '只提前加载相邻的 1 张。' }
					: {
						label: `前后各 ${count} 张`,
						description: `提前加载前后各 ${count} 张。连续浏览时更流畅。`,
					}),
			},
			prefetchCustom: {
				label: '预加载张数',
				warning: '预加载过多会占用大量内存。',
			},
			sidebarWidth: {
				label: '侧边栏宽度',
				description: '窗口较宽时显示在右侧的侧边栏的宽度。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}px`,
			},
			sidebarDrawerMax: {
				label: '拉出的侧边栏宽度',
				description: '窗口较窄（宽 900px 以下）时拉出的侧边栏相对于窗口宽度的上限。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			backdropMode: {
				label: '背景浓度',
				description: '铺在图片后面的黑色幕布的浓度。调低后可以透过它看到后面的页面。',
				theme: {
					label: '跟随主题',
					description: '深色时为 92%，浅色时为 88%。',
				},
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自定义', description: `从 ${min}～${max}% 中选择浓度。` }),
			},
			backdropOpacity: {
				label: '浓度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneMode: {
				label: '画面边缘点击区域宽度',
				description: '点击画面边缘翻页时所用边缘的宽度，为相对于图片显示区域的比例。选择自定义时，可分别设置左右边缘和上下边缘。',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自定义', description: `分别从 ${min}～${max}% 中选择左右和上下的宽度。` }),
			},
			navZoneSize: {
				label: '左右宽度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneSizeVertical: {
				label: '上下宽度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			zoomZoneMode: {
				label: '原图显示的点击区域宽度',
				description: '在原图显示画面中，用于翻页的左右边缘的宽度。',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '自定义', description: `从 ${min}～${max}% 中选择宽度。` }),
			},
			zoomZoneSize: {
				label: '宽度',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			commentPageSize: {
				label: '一次读取的评论数',
				description: '打开时和点击“浏览更多”时读取的条数。从下一个打开的作品开始生效。',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value} 条`,
			},
			prefetchNeighbor: {
				label: '预加载前后作品',
				description: '显示完成后，会预先加载 1 件 ↑ ↓ 可能移动到的作品。切换更快，但即使未切换就关闭，也会增加流量消耗。',
			},
			clickZoom: {
				label: '点击查看原图',
				description: '点击图片后，以原始尺寸铺满整个屏幕打开（与 pixiv 的作品页面相同）。点击左右边缘或按 ← → 翻页，再次点击或按 Esc 返回。无论上方的分辨率设置如何，都会加载原图。',
			},
			hidePickup: {
				label: '隐藏精选栏',
				description: '隐藏个人资料主页中显示的“精选”，让作品列表一眼可见。',
			},
			infiniteScroll: {
				label: '无限滚动',
				description: '将插画和漫画列表的翻页改为向下连续加载。',
				off: {
					label: '不使用',
					description: '保留 pixiv 默认的分页（1 2 3 …）。',
				},
				onReach: {
					label: '滚动到底部时加载',
					description: '到达最底部后才加载下一页。流量较少，但需要稍等片刻。',
				},
				ahead: {
					label: '始终提前加载下一页',
					description: '在距离底部还有一屏时就加载好下一页，无需等待即可继续浏览。',
				},
			},
			closeOnBackdrop: {
				label: '点击背景关闭',
				description: '点击图片外侧即可关闭。如果容易误关，请关闭此项。',
			},
			navZones: {
				label: '点击画面边缘翻页',
				description: '点击画面边缘即可翻页或切换作品。移到边缘时光标会变成箭头。',
				off: {
					label: '不使用',
					description: '只用箭头按钮和键盘翻页。',
				},
				horizontal: {
					label: '左右翻页',
					description: '点击左右边缘即可切换到上一页或下一页。在图片上也有效。',
				},
				vertical: {
					label: '上下切换作品',
					description: '点击上下边缘即可切换到上一个或下一个作品。翻页请用箭头按钮。',
				},
				both: {
					label: '左右翻页・上下切换作品',
					description: '左右翻页，上下切换作品。四角以左右优先。',
				},
			},
			slideshow: {
				label: '自动翻页',
				description: '按固定间隔自动翻到下一页。启用后查看器下方会出现操作栏。',
				off: {
					label: '不使用',
					description: '手动翻页。',
				},
				work: {
					label: '仅在作品内',
					description: '翻到最后一页后停止。',
				},
				sequence: {
					label: '到末尾后进入下一作品',
					description: '最后一页之后，进入下一个作品。',
				},
			},
			slideshowInterval: {
				label: '翻页间隔',
				description: '翻到下一页前的等待时间。从图片显示后开始计时。',
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
				custom: (min, max) => ({ label: '自定义', description: `从 ${min}～${max} 秒中选择，以 0.5 秒为单位。` }),
			},
			slideshowIntervalCustom: {
				label: '间隔',
				option: (s) => `${s} 秒`,
			},
			slideshowLoop: {
				label: '循环',
				description: '翻到最后后回到开头。仅在作品内时回到第 1 页，到末尾后进入下一作品时回到列表中的第一个作品。',
			},
			gridTabSkip: {
				label: '网格中的 Tab 键导航',
				description: '按 Tab 移到下一个作品时的跳过方式。',
				both: {
					label: '跳过收藏和标题',
					description: '用户页面的卡片会依次经过“缩略图 → 收藏 → 标题”这 3 个位置。跳过后按一次 Tab 即可移到下一个作品。在首页和搜索结果中，不会跳过作者的链接。',
				},
				title: {
					label: '仅跳过标题',
					description: '收藏按钮仍可在网格中直接点击。',
				},
				none: {
					label: '不跳过',
					description: '保留 pixiv 默认的顺序。',
				},
			},
		},
	},
};
