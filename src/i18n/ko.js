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
		LOADING: '불러오는 중…',
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
	slideshow: {
		CONTROLS: '자동 넘기기',
		PLAY: '자동 넘기기 재생',
		PAUSE: '자동 넘기기 정지',
		PREV: '이전',
		NEXT: '다음',
		LOOP: '반복',
		INTERVAL: '넘기는 간격',
		CUSTOM: '사용자 지정',
		CUSTOM_RANGE: '간격 (초)',
		/**
		 * 秒数の見出し。小数はそのまま出す。(2.5 秒)
		 * @param {number} value 秒数
		 * @returns {string} 見出し
		 */
		seconds: (value) => `${value}초`,
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
};
