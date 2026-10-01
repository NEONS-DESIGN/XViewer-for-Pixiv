/**
 * 韓国語の文言カタログ。
 *
 * **ここは文言だけを持つ。** 構造・キー・URL・アイコン名は言語に依らないので元の場所に残す。
 * 形は ja.js と必ず揃える。ずれは test/i18n/catalog.test.js が落とす。
 * 用語は pixiv 本体の韓国語 UI に揃える。(좋아요 / 북마크 / 열람수 / 댓글 など)
 * 引数を取る文言は関数にする。語順や助詞が日本語と違うので、外からテンプレートを埋める形では破綻する。
 */
import { DISPLAY_TIME_ZONE } from '../common/constants.js';

/** 日時の書式。年月日は数値、時刻は 24 時間の 2 桁。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('ko-KR', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/** コメントの日時の書式。一覧は詰めて見せたいので、年月日も 2 桁の数値にする。 */
const COMMENT_DATE_TIME_FORMAT = new Intl.DateTimeFormat('ko-KR', {
	timeZone: DISPLAY_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

/**
 * Intl の書式で日時を部品に分ける。
 * @param {Intl.DateTimeFormat} format 書式
 * @param {Date} date 日時
 * @returns {Record<string, string>} year / month / day / hour / minute などの部品
 */
function toParts(format, date) {
	return Object.fromEntries(format.formatToParts(date).map(({ type, value }) => [type, value]));
}

/** ログインが切れたときの案内。いいね・ブックマークとコメントの両方で出す。 */
const SESSION_EXPIRED = '로그인이 만료되었습니다. pixiv에 다시 로그인한 후 이 페이지를 새로고침해 주세요';

export default {
	viewer: {
		DIALOG_LABEL: '작품 뷰어',
		CLOSE: '닫기',
		CLOSE_TITLE: '닫기 (Esc)',
		WORK_PAGE: '작품 페이지로',
		WORK_PAGE_TITLE: '작품 페이지를 새 탭에서 열기',
		SIDEBAR_OPEN: '사이드바 열기',
		SIDEBAR_CLOSE: '사이드바 닫기',
		LOADING: '불러오는 중...',
		LOAD_FAILED: '작품을 불러오지 못했습니다',
		NOT_FOUND: '작품을 찾을 수 없습니다. 삭제되었거나 비공개로 바뀌었을 수 있습니다',
		NETWORK_FAILED: '통신에 실패했습니다. 연결을 확인한 뒤 다시 열어 주세요',
	},
	imagePane: {
		PREV_PAGE: '이전 페이지',
		NEXT_PAGE: '다음 페이지',
		IMAGE_FAILED: '이미지를 불러오지 못했습니다',
		PAGES_FAILED: '두 번째 이후 이미지를 불러오지 못했습니다',
	},
	zoom: {
		LABEL: '원본 크기 보기',
		PREV_PAGE: '이전 페이지',
		NEXT_PAGE: '다음 페이지',
		PREVIEW_NOTICE: '표준 화질로 임시 표시 중입니다. 원본을 불러오는 중…',
	},
	sidebar: {
		OPEN_ORIGINAL: '작품 페이지 열기',
		LIKE: '좋아요',
		BOOKMARK: '북마크',
		VIEWS: '열람수',
		COMMENTS: '댓글',
		/**
		 * 日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} '2026년 9월 23일 13:05' の形
		 */
		formatDateTime(date) {
			const parts = toParts(DATE_TIME_FORMAT, date);
			return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute}`;
		},
	},
	actionsBar: {
		messages: {
			LOGIN_TO_ACT: '로그인하면 좋아요와 북마크를 할 수 있습니다',
			SESSION_EXPIRED,
			LIKED: '좋아요를 눌렀습니다',
			ALREADY_LIKED: '이미 좋아요를 누른 작품입니다',
			LIKE_FAILED: '좋아요를 누르지 못했습니다',
			BOOKMARKED: '북마크했습니다',
			BOOKMARKED_PRIVATE: '비공개로 북마크했습니다',
			UNBOOKMARKED: '북마크를 해제했습니다',
			BOOKMARK_FAILED: '북마크를 변경하지 못했습니다',
			FOLLOWED: '팔로우했습니다',
			UNFOLLOWED: '팔로우를 해제했습니다',
			FOLLOW_FAILED: '팔로우를 변경하지 못했습니다',
		},
		BOOKMARK_PRIVATE_HINT: '(Shift + 클릭으로 비공개)',
		/**
		 * ブックマークのボタンの読み上げ名。
		 * @param {boolean} bookmarked 入っていれば true
		 * @returns {string} 押すと何が起きるか
		 */
		bookmarkLabel: (bookmarked) => (bookmarked ? '북마크에서 삭제' : '북마크에 추가'),
		/**
		 * いいねのボタンの読み上げ名。
		 * @param {boolean} liked 済みなら true
		 * @returns {string} 状態か、押すと何が起きるか
		 */
		likeLabel: (liked) => (liked ? '좋아요 완료' : '좋아요 (취소할 수 없음)'),
		/**
		 * フォローのボタンの読み上げ名。
		 * @param {boolean} following フォロー中なら true
		 * @returns {string} 状態
		 */
		followLabel: (following) => (following ? '팔로우 중' : '팔로우하기'),
		/**
		 * カウンタの読み上げ名。
		 * 「열람수 1,234건」のように単位を付けると不自然な項目があるので、単位は付けない。
		 * @param {string} label 何の数か
		 * @param {string} formattedCount 桁区切り済みの件数
		 * @returns {string} 読み上げ名
		 */
		countLabel: (label, formattedCount) => `${label} ${formattedCount}`,
	},
	comments: {
		HEADING: '댓글',
		MORE: '더보기',
		RETRY: '다시 시도',
		DELETED_USER: '탈퇴한 유저',
		/**
		 * コメントの日時を画面の表記にする。
		 * @param {Date} date 表示する日時
		 * @returns {string} '2026-09-23 13:05' の形
		 */
		formatDateTime(date) {
			const parts = toParts(COMMENT_DATE_TIME_FORMAT, date);
			return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
		},
		STAMP_PLACEHOLDER: '[스탬프]',
		STAMP_ALT: '스탬프',
		REPLIES_SHOW: '답변 보기',
		REPLIES_HIDE: '답변 숨기기',
		REPLY_MORE: '답변 더보기',
		REPLY_FAILED: '답변을 불러오지 못했습니다',
		LOAD_FAILED: '댓글을 불러오지 못했습니다',
		COMMENT_OFF: '이 작품은 댓글을 받지 않습니다',
		EMPTY: '아직 댓글이 없습니다',
		TO_TOP: '맨 위로',
		COMMENT_PLACEHOLDER: '댓글 달기',
		REPLY_PLACEHOLDER: '답변 달기',
		REPLY: '답변',
		SIGN_IN: '로그인하면 댓글을 달 수 있습니다',
		POST_FAILED: '댓글을 등록하지 못했습니다',
		SESSION_EXPIRED,
		DELETE: '삭제',
		DELETE_CONFIRM: '정말 삭제할까요?',
		DELETE_FAILED: '댓글을 삭제하지 못했습니다',
		roles: {
			SELF: '나',
			AUTHOR: '작가',
		},
	},
	commentForm: {
		SUBMIT: '전송',
		PICK: '이모지와 스탬프',
		STAMP_ALT: '스탬프',
		STAMP_CLEAR: '선택한 스탬프 취소',
		FAILED: '댓글을 등록하지 못했습니다',
	},
	commentPicker: {
		EMOJI: '이모지',
		STAMP: '스탬프',
		PANEL: '이모지와 스탬프',
	},
	shareMenu: {
		SHARE: '이 작품 공유',
		COPY_FAILED: '복사하지 못했습니다',
		COPY_DONE: '링크를 복사했습니다',
	},
	share: {
		COPY_LINK: '링크 복사',
	},
	ugoira: {
		PAUSE: '일시 정지',
		PLAY: '재생',
		PLAY_FAILED: '움짤을 재생하지 못했습니다',
		CONTROLS: '재생 조작',
		SEEK: '재생 위치',
		RATE: '재생 속도',
		NORMAL: '표준',
		/**
		 * 再生速度の倍率の見出し。
		 * @param {number} value 倍率
		 * @returns {string} 見出し
		 */
		rate: (value) => `${value}×`,
		/**
		 * シークバーの読み上げ。今が何コマ目か。
		 * @param {number} current 今のコマ (1 始まり)
		 * @param {number} total 全体のコマ数
		 * @returns {string} 読み上げの文言
		 */
		frame: (current, total) => `${total}프레임 중 ${current}번째`,
	},
	blocked: {
		LOGIN_REQUIRED: '이 작품을 보려면 pixiv에 로그인해 주세요',
		HIDDEN_BY_SETTING: 'pixiv 표시 설정에 따라 숨겨져 있습니다',
		RELOAD_AFTER_CHANGE: '변경한 후에는 페이지를 새로고침해 주세요',
		CHANGE_SETTING: '표시 설정 변경하기',
	},
	infinite: {
		LOADING: '작품을 불러오는 중입니다',
		ERROR: '작품을 불러오지 못했습니다',
		BUILD_FAILED: '작품을 표시하지 못했습니다',
		RETRY: '다시 시도',
		DONE: '모든 작품을 표시했습니다',
	},
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
			comments: '댓글',
		},
		fields: {
			enabled: {
				label: '뷰어 사용',
				description: '끄면 pixiv 기본 동작으로 돌아갑니다.',
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
			backdropOpacity: {
				label: '배경 농도',
				description: '이미지 뒤에 까는 검은 막의 농도입니다. 낮추면 뒤의 페이지가 비쳐 보입니다.',
				theme: {
					label: '테마에 맞추기',
					description: '다크에서는 92%, 라이트에서는 88%로 합니다.',
				},
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			navZoneSize: {
				label: '화면 가장자리 클릭 영역 크기',
				description: '화면 가장자리 클릭으로 넘길 때 쓰는 가장자리의 너비 (좌우) 와 높이 (상하) 입니다. 이미지를 표시하는 부분에 대한 비율입니다.',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			zoomZoneSize: {
				label: '원본 크기 보기의 클릭 영역 너비',
				description: '원본 크기 보기 화면에서 좌우 가장자리를 눌러 페이지를 넘기는 범위의 너비입니다.',
				/**
				 * 選択肢の見出し。値から作る。
				 * @param {number} value 選択肢の値
				 * @returns {string} 見出し
				 */
				option: (value) => `${value}%`,
			},
			commentPageSize: {
				label: '한 번에 불러올 댓글 수',
				description: '열었을 때와 「더보기」를 눌렀을 때 불러오는 개수입니다. 다음에 여는 작품부터 바뀝니다.',
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
			gridTabSkip: {
				label: '그리드의 Tab 이동',
				description: 'Tab으로 다음 작품으로 이동할 때 건너뛰는 방식입니다.',
				both: {
					label: '북마크와 제목 건너뛰기',
					description: '카드는 ‘썸네일 → 북마크 → 제목’ 3곳을 차례로 거칩니다. 건너뛰면 Tab 한 번으로 다음 작품으로 이동할 수 있으며, 건너뛴 조작은 뷰어 안에서 할 수 있습니다.',
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
