/**
 * 韓国語の文言カタログのうち、設定画面 (popup) だけが使う節。(theme / licenses / popup)
 * content script の束に入れないため ko.js から分けてある。popup はこの節だけを読む。
 * 形は ja-popup.js と必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 */
export default {
	theme: {
		TO_LIGHT: '라이트 모드로 전환',
		TO_DARK: '다크 모드로 전환',
	},
	licenses: {
		disclaimer: {
			brief: 'pixiv 비공식 확장 프로그램입니다. 자세한 내용은 ‘라이선스’ 탭을 확인하세요.',
			body: [
				'pixiv 플랫폼을 이용하여 개발한 비공식 확장 프로그램입니다. pixiv Inc.에서 제작·배포하는 것이 아닙니다. 이 회사와는 아무런 관계가 없으며, 제휴·지원·추천을 받은 것도 아닙니다.',
				'이용으로 인해 발생하는 모든 결과에 대해서는 이용자 본인이 책임을 집니다.',
				'pixiv 및 관련 서비스는 예고 없이 기능이나 게재 내용을 개정·변경하거나 제공을 중단할 수 있으며, 이때 이 확장 프로그램이 작동하지 않게 될 수 있습니다.',
			],
		},
		notes: {
			'Material Symbols': '화면 아이콘의 도형 데이터',
			'Font Awesome Free': '공유 메뉴의 브랜드 로고. SVG에서 도형만 추출하여 사용합니다. (모양은 바꾸지 않았습니다) 각 로고는 해당 권리자의 상표입니다',
		},
	},
	popup: {
		TABS_LABEL: '표시할 내용 전환',
		/**
		 * 既定の選択肢の見出しに印を付ける。
		 * @param {string} label 選択肢の見出し
		 * @returns {string} 印を付けた見出し
		 */
		withDefault: (label) => `${label} (기본값)`,
		/** 親の項目がオフなので操作できない項目を押したときの警告 */
		dependency: {
			/**
			 * 親のスイッチをオンにするよう促す。
			 * @param {string} label 親の項目の見出し
			 * @returns {string} 警告
			 */
			turnOn: (label) => `‘${label}’을(를) 켜 주세요.`,
			/**
			 * 親の選択肢で「オフ」以外を選ぶよう促す。
			 * @param {string} label 親の項目の見出し
			 * @param {string} off 親の選択肢のうちオフに当たるものの見出し
			 * @returns {string} 警告
			 */
			chooseOther: (label, off) => `‘${label}’에서 ‘${off}’ 이외의 항목을 선택해 주세요.`,
		},
		SAVE_FAILED: '저장하지 못했습니다. 브라우저의 설정 동기화를 확인해 주세요.',
		RESET_FAILED: '초기화하지 못했습니다. 브라우저의 설정 동기화를 확인해 주세요.',
		tabs: {
			settings: '설정',
			advanced: '상세 설정',
			license: '라이선스',
		},
		licenseHeadings: {
			disclaimer: '면책 조항',
			project: '이 확장 프로그램의 라이선스',
			thirdParty: '포함된 제3자 저작물',
		},
		reset: {
			label: '설정 초기화',
			description: '색상 구성을 포함한 모든 설정을 기본값으로 되돌립니다.',
			cancel: '취소',
			confirm: '초기화',
		},
		headings: {
			viewer: '뷰어',
			image: '이미지',
			userPage: '유저 페이지',
			controls: '조작',
			slideshow: '자동 넘기기',
			comments: '댓글',
		},
		fields: {
			enabled: {
				label: '뷰어 사용',
				description: '끄면 pixiv 기본 동작으로 돌아갑니다.',
			},
			viewerOnUser: {
				label: '사용자 페이지에서 사용',
				description: '사용자 페이지의 작품 목록에서 열 때 뷰어를 표시합니다.',
			},
			viewerOnHome: {
				label: '홈에서 사용',
				description: 'pixiv 홈(홈 / 일러스트 / 만화)의 작품에서 열 때 뷰어를 표시합니다.',
			},
			viewerOnSearch: {
				label: '검색 결과에서 사용',
				description: '검색 결과(태그 페이지와 검색 화면)에서 열 때 뷰어를 표시합니다.',
			},
			showSidebar: {
				label: '사이드바 표시',
				description: '작품 설명·태그·좋아요 수·댓글을 이미지 옆에 표시합니다. 끄면 닫기 버튼 옆에 작품 페이지 링크를 표시합니다.',
			},
			sidebarScroll: {
				label: '사이드바 스크롤',
				description: '사이드바를 세로로 스크롤할 때의 동작입니다.',
				comments: {
					label: '댓글만 스크롤',
					description: '작품 설명과 태그는 고정한 채 댓글 목록만 스크롤합니다.',
				},
				whole: {
					label: '사이드바 전체 스크롤',
					description: '작품 설명부터 댓글까지 하나로 이어서 스크롤합니다. 설명이 긴 작품도 그대로 읽어 내려가 댓글까지 도달할 수 있습니다.',
				},
			},
			imageQuality: {
				label: '이미지 해상도',
				description: '뷰어에서 불러올 이미지의 크기입니다.',
				regular: {
					label: '표준 (긴 변 1200px)',
					description: '가볍게 불러올 수 있어 평소 감상에 적합합니다.',
				},
				original: {
					label: '원본 크기',
					description: '선명하지만 불러오기가 무거워집니다.',
				},
			},
			prefetch: {
				label: '미리 불러오기',
				description: '다음에 볼 이미지를 미리 불러와 두면 전환이 빨라집니다.',
				/**
				 * 先読みの「カスタム」の選択肢。枚数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の枚数
				 * @param {number} max 選べる最大の枚数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '사용자 지정', description: `앞뒤로 미리 불러올 장수를 ${min}~${max}장 중에서 고릅니다.` }),
				none: {
					label: '사용 안 함',
					description: '전환할 때마다 불러옵니다. 데이터 사용량을 줄일 수 있습니다.',
				},
				/**
				 * 先読みする枚数の選択肢。
				 * 文言を添字で手書きすると PREFETCH_CHOICES の並びを変えたときに黙ってずれるので、値から作る。
				 * @param {number} count 前後に先読みする枚数 (1 以上)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				some: (count) => (count === 1
					? { label: '앞뒤 1장', description: '바로 옆 1장만 미리 불러옵니다.' }
					: {
						label: `앞뒤 ${count}장`,
						description: `앞뒤로 ${count}장까지 미리 불러옵니다. 연달아 볼 때 매끄럽습니다.`,
					}),
			},
			prefetchCustom: {
				label: '미리 불러올 장수',
				warning: '많이 미리 불러오면 메모리를 압박합니다.',
			},
			sidebarWidth: {
				label: '사이드바 너비',
				description: '화면이 넓을 때 오른쪽에 표시되는 사이드바의 너비입니다.',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}px`,
			},
			sidebarDrawerMax: {
				label: '꺼낸 사이드바 너비',
				description: '화면이 좁을 때 (너비 900px 이하) 꺼낸 사이드바의, 화면 너비에 대한 상한입니다.',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			backdropMode: {
				label: '배경 농도',
				description: '이미지 뒤에 까는 검은 막의 농도입니다. 낮추면 뒤의 페이지가 비쳐 보입니다.',
				theme: {
					label: '테마에 맞추기',
					description: '다크에서는 92%, 라이트에서는 88%로 합니다.',
				},
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '사용자 지정', description: `농도를 ${min}~${max}% 중에서 고릅니다.` }),
			},
			backdropOpacity: {
				label: '농도',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneMode: {
				label: '화면 가장자리 클릭 영역 너비',
				description: '화면 가장자리 클릭으로 넘길 때 쓰는 가장자리의 너비입니다. 이미지를 표시하는 부분에 대한 비율이며, 사용자 지정에서는 좌우 가장자리와 상하 가장자리를 따로 고를 수 있습니다.',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '사용자 지정', description: `좌우와 상하의 너비를 각각 ${min}~${max}% 중에서 고릅니다.` }),
			},
			navZoneSize: {
				label: '좌우 너비',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			navZoneSizeVertical: {
				label: '상하 너비',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			zoomZoneMode: {
				label: '원본 크기 보기의 클릭 영역 너비',
				description: '원본 크기 보기 화면에서 페이지를 넘길 때 쓰는 좌우 가장자리의 너비입니다.',
				/**
				 * 「カスタム」の選択肢。値は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の値 (%)
				 * @param {number} max 選べる最大の値 (%)
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '사용자 지정', description: `너비를 ${min}~${max}% 중에서 고릅니다.` }),
			},
			zoomZoneSize: {
				label: '너비',
				/**
				 * 値の読み方。レンジの今の値・目盛り・既定の選択肢の見出しに使う。
				 * @param {number} value 値 (%)
				 * @returns {string} 読み
				 */
				option: (value) => `${value}%`,
			},
			commentPageSize: {
				label: '한 번에 불러올 댓글 수',
				description: '열었을 때와 ‘더보기’를 눌렀을 때 불러오는 개수입니다. 다음에 여는 작품부터 바뀝니다.',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}개`,
			},
			prefetchNeighbor: {
				label: '앞뒤 작품도 미리 불러오기',
				description: '표시가 끝나면, ↑ ↓로 이동할 작품을 1개만 미리 불러옵니다. 이동은 빨라지지만, 이동하지 않고 닫아도 통신량이 늘어납니다.',
			},
			clickZoom: {
				label: '클릭하여 원본 크기 보기',
				description: '이미지를 누르면 원본 크기 그대로 화면 가득 엽니다. (pixiv 작품 페이지와 같음) 좌우 끝을 누르거나 ← →로 페이지를 넘기고, 다시 누르거나 Esc로 돌아갑니다. 위의 해상도 설정과 관계없이 원본 크기 이미지를 불러옵니다.',
			},
			hidePickup: {
				label: '픽업 영역 숨기기',
				description: '프로필 홈에 표시되는 ‘픽업’을 숨깁니다. 작품 목록이 바로 눈에 들어옵니다.',
			},
			infiniteScroll: {
				label: '무한 스크롤',
				description: '일러스트·만화 목록의 페이지 넘김을 아래로 이어서 불러오는 방식으로 바꿉니다.',
				off: {
					label: '사용 안 함',
					description: 'pixiv 기본 페이지 이동 (1 2 3 …)을 그대로 사용합니다.',
				},
				onReach: {
					label: '맨 아래에 닿으면 불러오기',
					description: '맨 아래에 닿은 뒤 다음 페이지를 불러옵니다. 통신량은 적지만 그만큼 조금 기다려야 합니다.',
				},
				ahead: {
					label: '항상 1페이지 앞서 불러오기',
					description: '맨 아래에 닿기 한 화면 전에 다음 페이지를 미리 이어 붙입니다. 기다리지 않고 계속 볼 수 있습니다.',
				},
			},
			closeOnBackdrop: {
				label: '배경 클릭으로 닫기',
				description: '이미지 바깥을 누르면 닫힙니다. 실수로 닫힌다면 꺼 두세요.',
			},
			navZones: {
				label: '화면 가장자리 클릭으로 넘기기',
				description: '화면 가장자리를 눌러 페이지나 작품을 넘깁니다. 가장자리에서는 커서가 화살표로 바뀝니다.',
				off: {
					label: '사용 안 함',
					description: '화살표 버튼과 키로만 넘깁니다.',
				},
				horizontal: {
					label: '좌우로 페이지 넘기기',
					description: '좌우 가장자리를 누르면 이전·다음 페이지로 넘깁니다. 이미지 위에서도 작동합니다.',
				},
				vertical: {
					label: '상하로 작품 넘기기',
					description: '상하 가장자리를 누르면 이전·다음 작품으로 이동합니다. 페이지는 화살표 버튼으로 넘깁니다.',
				},
				both: {
					label: '좌우는 페이지, 상하는 작품',
					description: '좌우로 페이지를, 상하로 작품을 넘깁니다. 네 모서리는 좌우가 우선입니다.',
				},
			},
			slideshow: {
				label: '자동 넘기기',
				description: '일정한 간격으로 페이지를 자동으로 넘깁니다. 사용하면 뷰어 아래에 조작 바가 표시됩니다.',
				off: {
					label: '사용 안 함',
					description: '직접 넘깁니다.',
				},
				work: {
					label: '작품 안에서만',
					description: '마지막 페이지까지 넘기면 멈춥니다.',
				},
				sequence: {
					label: '끝에서 다음 작품으로',
					description: '마지막 페이지 다음은 다음 작품으로 넘어갑니다.',
				},
			},
			slideshowInterval: {
				label: '넘기는 간격',
				description: '다음 페이지로 넘어가기까지의 시간입니다. 이미지가 표시된 뒤부터 셉니다.',
				/**
				 * 間隔の選択肢の見出し。
				 * @param {number} seconds 秒数
				 * @returns {string} 見出し
				 */
				option: (s) => `${s}초`,
				/**
				 * 間隔の「カスタム」の選択肢。秒数は選択肢の下に出るレンジで選ぶ。
				 * @param {number} min 選べる最小の秒数
				 * @param {number} max 選べる最大の秒数
				 * @returns {{label: string, description: string}} 選択肢の文言
				 */
				custom: (min, max) => ({ label: '사용자 지정', description: `${min}~${max}초를 0.5초 단위로 고릅니다.` }),
			},
			slideshowIntervalCustom: {
				label: '간격',
				option: (s) => `${s}초`,
			},
			slideshowLoop: {
				label: '반복',
				description: '끝까지 넘기면 처음으로 돌아갑니다. 작품 안에서만이면 첫 페이지로, 끝에서 다음 작품으로면 목록의 첫 작품으로 돌아갑니다.',
			},
			gridTabSkip: {
				label: '그리드의 Tab 이동',
				description: 'Tab으로 다음 작품으로 이동할 때 건너뛰는 방식입니다.',
				both: {
					label: '북마크와 제목 건너뛰기',
					description: '사용자 페이지의 카드는 ‘썸네일 → 북마크 → 제목’ 3곳을 차례로 거칩니다. 건너뛰면 Tab 한 번으로 다음 작품으로 이동할 수 있습니다. 홈과 검색에서는 작가 링크를 건너뛰지 않습니다.',
				},
				title: {
					label: '제목만 건너뛰기',
					description: '북마크는 그리드에서 그대로 누를 수 있습니다.',
				},
				none: {
					label: '건너뛰지 않음',
					description: 'pixiv 기본 순서를 그대로 사용합니다.',
				},
			},
		},
	},
};
