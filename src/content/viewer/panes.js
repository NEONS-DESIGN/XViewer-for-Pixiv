/**
 * どのペインを出すかの判断と、その組み立て。
 *
 * 「表示形式・サイドバー・コメント・アクションのどれを出すか」は条件の掛け算になり、
 * ここが壊れると読み込み中に前の作品が残る・設定を戻すと出てこない等の不具合になる。
 * 判断だけを純粋関数 planPanes() に切り出し、DOM を触らない形でテストで固定する。
 * DOM を作るのは renderWork()、片付けるのは disposeAll()。
 */
import { ILLUST_TYPES } from '../../pixiv/normalize.js';
import { createImagePane } from './image-pane.js';
import { createUgoiraPlayer } from './ugoira.js';
import { createSidebar } from './sidebar.js';
import { createComments } from './comments.js';
import { createActionsBar } from './actions-bar.js';
import { createBlocked, blockReason } from './blocked.js';

/** ステージに出す主役の種別。 */
export const MAIN_PANE = Object.freeze({
	IMAGE: 'image',
	UGOIRA: 'ugoira',
	BLOCKED: 'blocked',
});

/**
 * 主役のペインが作るときに読む設定。どれかが変わったら主役だけ作り直す。
 * うごイラは zip の画質だけを読む。(関係の無い設定で作り直すと、再生が頭に戻って全コマを展開し直すことになる)
 * ブロック表示は設定を読まない
 */
export const MAIN_PANE_SETTING_KEYS = Object.freeze({
	[MAIN_PANE.IMAGE]: Object.freeze(['imageQuality', 'prefetch', 'prefetchCustom', 'clickZoom']),
	[MAIN_PANE.UGOIRA]: Object.freeze(['imageQuality']),
	[MAIN_PANE.BLOCKED]: Object.freeze([]),
});

/** @type {ReturnType<typeof createImagePane>|null} */
let imagePane = null;
/** @type {ReturnType<typeof createUgoiraPlayer>|null} */
let ugoiraPane = null;
/** @type {ReturnType<typeof createSidebar>|null} */
let sidebarPane = null;
/** @type {ReturnType<typeof createComments>|null} */
let commentsPane = null;
/** @type {ReturnType<typeof createActionsBar>|null} */
let actionsPane = null;
/** @type {ReturnType<typeof createBlocked>|null} */
let blockedPane = null;

/**
 * @typedef {object} PanePlan
 * @property {'image'|'ugoira'|'blocked'} main ステージに出す主役
 * @property {boolean} sidebar サイドバーを出すか
 * @property {boolean} comments コメント区画を作るか (中の「受け付けていません」の出し分けは comments.js)
 * @property {boolean} actions いいね等のアクションを出すか
 * @property {{kind: 'login'|'setting'}|null} reason 見られない理由 (blocked.js の BLOCK_KINDS)。文言は描画側で引く。見られるなら null
 */

/**
 * 何を出すかを決める。DOM は触らない。
 *
 * 見られない作品でもサイドバーは出す。タイトル・タグ・カウンタは pixiv 本体でも見える情報で、
 * 隠す理由が無い。逆に本文の画像だけは出さない。
 * ブロックの判定はうごイラより先。見られない作品を再生してはいけない。
 * @param {object} detail 正規化した作品詳細
 * @param {{isLoggedIn: boolean, self: object|null}} session セッション
 * @param {object} settings 設定
 * @returns {PanePlan} 何を出すか
 */
export function planPanes(detail, session, settings) {
	const reason = blockReason(detail, session);
	const sidebar = settings.showSidebar === true;
	if (reason) {
		// 見られない作品には更新系もコメントも出さない
		return { main: MAIN_PANE.BLOCKED, sidebar, comments: false, actions: false, reason };
	}
	const main = detail.illustType === ILLUST_TYPES.UGOIRA ? MAIN_PANE.UGOIRA : MAIN_PANE.IMAGE;
	// コメントとアクションはサイドバーの中に入るので、サイドバーが無ければ出せない
	return { main, sidebar, comments: sidebar, actions: sidebar, reason: null };
}

/**
 * @typedef {object} RenderTargets
 * @property {Document} doc 対象のドキュメント
 * @property {HTMLElement} stage 主役の描画先 (.stage)
 * @property {HTMLElement} sidebar サイドバーの描画先 (.sidebar)
 * @property {{open: (pages: object) => void}} [zoom] 原寸表示のレイヤ (zoom.js)。画像ペインだけが使う
 * @property {(userId: string, lang: string) => Promise<object>} [fetchUser] 作者情報の取得。(サイドバーとアクションの両方へ渡す) テストから通信させないために使う
 * @property {object} strings 文言のカタログ (src/i18n)
 * @property {typeof createImagePane} [createImagePane] 画像ペインの差し替え口。テストが組み立ての順番を記録するために使う
 * @property {typeof createUgoiraPlayer} [createUgoiraPlayer] うごイラペインの差し替え口。テストが組み立ての順番を記録するために使う
 * @property {typeof createSidebar} [createSidebar] サイドバーの差し替え口。テストが組み立ての順番を記録するために使う
 * @property {number} [startPage] 最初に出すページ (0 始まり)。複数枚の画像の作品だけに効く
 * @property {number} [ugoiraRate] うごイラを再生し始める速度 (倍率)。前の作品で選んだ速度を引き継ぐ
 * @property {(rate: number) => void} [onUgoiraRateChange] うごイラの再生速度が選ばれたら呼ぶ
 */

/**
 * 主役 (画像 / うごイラ) を作り、描き始める。待たずに Promise を返す。
 * 同期部分 (1 枚目の src の代入、うごイラの poster) は返る前に走る。
 * ペインはモジュール変数へ入れてから render() を呼ぶ。render() が失敗しても disposeAll() で片付けられる
 * @param {PanePlan} plan 何を出すか (main は image か ugoira)
 * @param {object} detail 正規化した作品詳細
 * @param {object} settings 設定
 * @param {RenderTargets} targets 描画先
 * @returns {Promise<void>} 主役の描画の完了
 */
function startMain(plan, detail, settings, targets) {
	const { doc, stage, strings } = targets;
	if (plan.main === MAIN_PANE.UGOIRA) {
		const makeUgoiraPlayer = targets.createUgoiraPlayer ?? createUgoiraPlayer;
		ugoiraPane = makeUgoiraPlayer({
			doc,
			container: stage,
			settings,
			strings,
			rate: targets.ugoiraRate,
			onRateChange: targets.onUgoiraRateChange,
		});
		return ugoiraPane.render(detail);
	}
	// 原寸表示を開けるのは静止画だけ。うごイラ (canvas) と見られない作品には渡さない
	const makeImagePane = targets.createImagePane ?? createImagePane;
	imagePane = makeImagePane({ doc, container: stage, settings, zoom: targets.zoom, strings });
	return imagePane.render(detail, { startPage: targets.startPage ?? 0 });
}

/**
 * 判断に従ってペインを組み立てる。
 * 呼ぶ前に disposeAll() を済ませておくこと。(取得を待つ前に解体するのが決まり)
 *
 * 主役 (画像 / うごイラ) の読み込みを先に始め、その同期部分 (1 枚目の src の代入など) の
 * 直後にサイドバー・コメント・アクションを作る。await をまたがずに全ペインを作り終えるので、
 * 別の作品へ移ったあとに古い作品のコメントやいいねを新しいサイドバーへ差し込む事故も起きない。
 * (いいねは取り消せないので、対象を間違えると実害が出る)
 * ブロック表示のときは画像を読まないので、サイドバーを先に作る。
 * @param {object} detail 正規化した作品詳細
 * @param {{isLoggedIn: boolean, self: object|null}} session セッション
 * @param {object} settings 設定
 * @param {RenderTargets} targets 描画先
 * @returns {Promise<void>}
 */
export async function renderWork(detail, session, settings, targets) {
	const { doc, stage, sidebar, strings } = targets;
	const makeSidebar = targets.createSidebar ?? createSidebar;
	const plan = planPanes(detail, session, settings);

	// hidden は毎回明示的に設定する。片方でしか触らないと、
	// 設定を戻したときに hidden が立ったままになって出てこなくなる
	sidebar.hidden = !plan.sidebar;

	if (plan.main === MAIN_PANE.BLOCKED) {
		// 見られない作品は画像を読まないので、サイドバーを先に作って構わない
		if (plan.sidebar) {
			sidebarPane = makeSidebar({ doc, container: sidebar, fetchUser: targets.fetchUser, strings });
			sidebarPane.render(detail);
		}
		blockedPane = createBlocked({ doc, container: stage, strings });
		blockedPane.render(detail, plan.reason);
		return;
	}

	// 主役の読み込みをまず始める。同期部分で 1 枚目の src を代入するところまでは
	// サイドバーより先に走らせ、画面に絵が出るまでの体感を縮める
	const mainDone = startMain(plan, detail, settings, targets);

	// サイドバーの中身 (本文・コメント・アクション) は主役の取得を待たずに組み立てる。
	// コメントとアクションはサイドバーの中に入るので (plan.comments / plan.actions は
	// plan.sidebar を含意する)、この 1 ブロックで済ませる
	if (plan.sidebar) {
		// 件数の書き換え先は、この作品のサイドバーに固定する。
		// モジュール変数を呼ばれた時点で読むと、別の作品へ移った後の通知が新しいサイドバーへ届く
		const ownSidebar = makeSidebar({ doc, container: sidebar, fetchUser: targets.fetchUser, strings });
		sidebarPane = ownSidebar;
		ownSidebar.render(detail);

		if (plan.comments) {
			// 「上部へ」はサイドバーそのものを先頭へ戻す。区画の中からは届かないので渡す。
			// 投稿できたらサイドバーのコメント件数を手元で +1 する (再取得はしない)
			commentsPane = createComments({
				doc,
				container: ownSidebar.commentsSlot(),
				scrollTarget: sidebar,
				strings,
				pageSize: settings.commentPageSize,
				onPosted: () => { ownSidebar.bumpCommentCount(1); },
				// 削除は数え直した件数で置き換える。ルートを消すと返信も道連れになるので
				// 手元で 1 を引くだけでは合わない。引けなかったときだけ 1 を引く
				onDeleted: (count) => {
					if (count === null) ownSidebar.bumpCommentCount(-1);
					else ownSidebar.setCommentCount(count);
				},
			});
			void commentsPane.load(detail);
		}
		if (plan.actions) {
			// いいね・ブックマークはカウンタの行を押せるボタンへ差し替える形で入る。
			// フォローだけは作者行の右端に独立して置くので、描画先が 2 つに分かれる。
			// fetchUser はサイドバーと同じ差し替え口。渡さないとテストでも /ajax/user を叩きに行く
			actionsPane = createActionsBar({
				doc,
				container: ownSidebar.countsSlot(),
				followContainer: ownSidebar.followSlot(),
				fetchUser: targets.fetchUser,
				strings,
			});
			actionsPane.render(detail);
		}
	}

	await mainDone;
}

/**
 * ペインをすべて捨てる。
 * DOM の片付けは各ペインが dispose の中でやるので、ここは呼ぶだけ。
 * 必ず取得を待つ前に呼ぶこと。await の後ろに置くと読み込み中に前の作品の
 * 矢印とカウンタが残り、左右キーが古い img を触ってしまう。
 * @returns {void}
 */
export function disposeAll() {
	imagePane?.dispose();
	imagePane = null;
	ugoiraPane?.dispose();
	ugoiraPane = null;
	sidebarPane?.dispose();
	sidebarPane = null;
	commentsPane?.dispose();
	commentsPane = null;
	actionsPane?.dispose();
	actionsPane = null;
	blockedPane?.dispose();
	blockedPane = null;
}

/**
 * キー操作を手前に出ているものへ先に使わせる。
 *
 * ビュワー本体は Escape でモーダルを閉じ、上下キーで作品を移る。シェアメニューのように
 * 「まず自分が閉じたい」「項目送りに上下 / Home / End を使いたい」部品はここで先に食い止める。
 * コメントの入力欄も同様で、ピッカーを開いていたり書きかけの文章があれば Escape を自分で使う。
 * keydown は document の捕捉フェーズで受けており、後から登録したリスナでは
 * 本体より先に処理できないので、本体側から順番に聞く形にしている。
 * @param {KeyboardEvent} event キー
 * @returns {boolean} 食い止めたなら true (本体は反応してはいけない)
 */
export function consumeKey(event) {
	// 手前に出ているものから順に使わせる。浮いているメニュー (うごイラの速度・シェア) が先、次にコメントの入力欄
	if (ugoiraPane?.consumeKey?.(event) === true) return true;
	if (sidebarPane?.consumeKey(event) === true) return true;
	return commentsPane?.consumeKey(event) === true;
}

/**
 * 画像のページを送る。うごイラとブロック表示ではページの概念が無いので何もしない。
 * @param {number} direction 1 なら次、-1 なら前
 * @returns {void}
 */
export function movePage(direction) {
	if (direction > 0) imagePane?.next();
	else imagePane?.prev();
}

/**
 * その向きへ画像のページを送れるか。うごイラとブロック表示では常に false。
 * @param {number} direction 1 なら次、-1 なら前
 * @returns {boolean} 送れれば true
 */
export function canMovePage(direction) {
	return imagePane?.canMove(direction) === true;
}

/**
 * 今の画像のページ番号。画像ペインが無ければ (うごイラ・ブロック表示・読み込み中) null。
 * @returns {number|null} ページ番号 (0 始まり)
 */
export function currentPage() {
	return imagePane ? imagePane.pageIndex() : null;
}

/**
 * 設定が変わったときに、主役 (画像 / うごイラ) だけを作り直す。
 * サイドバー・コメント・アクションは触らない。(取り直さず、読んでいた位置も保つ)
 * 主役がその設定を読んでいなければ何もしない。
 * @param {object} detail 正規化した作品詳細 (今描いているもの)
 * @param {{isLoggedIn: boolean, self: object|null}} session セッション
 * @param {object} settings 新しい設定
 * @param {RenderTargets} targets 描画先。startPage に今のページを入れて渡す
 * @param {string[]} changedKeys 変わった設定のキー
 * @returns {{rebuilt: boolean, done: Promise<void>}} 作り直したかと、主役の描画の完了
 */
export function rerenderMain(detail, session, settings, targets, changedKeys) {
	const plan = planPanes(detail, session, settings);
	const keys = MAIN_PANE_SETTING_KEYS[plan.main];
	if (!changedKeys.some((key) => keys.includes(key))) return { rebuilt: false, done: Promise.resolve() };
	imagePane?.dispose();
	imagePane = null;
	ugoiraPane?.dispose();
	ugoiraPane = null;
	return { rebuilt: true, done: startMain(plan, detail, settings, targets) };
}
