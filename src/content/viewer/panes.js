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
 * @property {{kind: string, message: string}|null} reason 見られない理由。見られるなら null
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
 * @property {(userId: string) => Promise<object>} [fetchUser] 作者情報の取得 (サイドバーとアクションの両方へ渡す)。テストから通信させないために使う
 */

/**
 * 判断に従ってペインを組み立てる。
 * 呼ぶ前に disposeAll() を済ませておくこと (取得を待つ前に解体するのが決まり)。
 *
 * サイドバーの中身 (本文・コメント・アクション) は主役の取得を待たずに先に作る。
 * うごイラの zip や /pages の往復を待ってからでは、コメントとボタンが数秒出ない。
 * await をまたがずに全ペインを作り終えるので、別の作品へ移ったあとに
 * 古い作品のコメントやいいねを新しいサイドバーへ差し込む事故も起きない
 * (いいねは取り消せないので、対象を間違えると実害が出る)。
 * @param {object} detail 正規化した作品詳細
 * @param {{isLoggedIn: boolean, self: object|null}} session セッション
 * @param {object} settings 設定
 * @param {RenderTargets} targets 描画先
 * @returns {Promise<void>}
 */
export async function renderWork(detail, session, settings, targets) {
	const { doc, stage, sidebar } = targets;
	const plan = planPanes(detail, session, settings);

	// hidden は毎回明示的に設定する。片方でしか触らないと、
	// 設定を戻したときに hidden が立ったままになって出てこなくなる
	sidebar.hidden = !plan.sidebar;

	// サイドバーを先に出す。文章とカウンタは画像の読み込みを待つ理由が無い。
	// コメントとアクションはサイドバーの中に入るので (plan.comments / plan.actions は
	// plan.sidebar を含意する)、この 1 ブロックで済ませる
	if (plan.sidebar) {
		sidebarPane = createSidebar({ doc, container: sidebar, fetchUser: targets.fetchUser });
		sidebarPane.render(detail);

		if (plan.comments) {
			// 「上部へ」はサイドバーそのものを先頭へ戻す。区画の中からは届かないので渡す。
			// 投稿できたらサイドバーのコメント件数を手元で +1 する (再取得はしない。SPEC §10.12)
			commentsPane = createComments({
				doc,
				container: sidebarPane.commentsSlot(),
				scrollTarget: sidebar,
				onPosted: () => { sidebarPane.bumpCommentCount(1); },
				onDeleted: () => { sidebarPane.bumpCommentCount(-1); },
			});
			void commentsPane.load(detail);
		}
		if (plan.actions) {
			// いいね・ブックマークはカウンタの行を押せるボタンへ差し替える形で入る。
			// フォローだけは作者行の右端に独立して置くので、描画先が 2 つに分かれる。
			// fetchUser はサイドバーと同じ差し替え口。渡さないとテストでも /ajax/user を叩きに行く
			actionsPane = createActionsBar({
				doc,
				container: sidebarPane.countsSlot(),
				followContainer: sidebarPane.followSlot(),
				fetchUser: targets.fetchUser,
			});
			actionsPane.render(detail);
		}
	}

	if (plan.main === MAIN_PANE.BLOCKED) {
		blockedPane = createBlocked({ doc, container: stage });
		blockedPane.render(detail, plan.reason);
		return;
	}

	if (plan.main === MAIN_PANE.UGOIRA) {
		ugoiraPane = createUgoiraPlayer({ doc, container: stage, settings });
		await ugoiraPane.render(detail);
	} else {
		// 原寸表示を開けるのは静止画だけ。うごイラ (canvas) と見られない作品には渡さない
		imagePane = createImagePane({ doc, container: stage, settings, zoom: targets.zoom });
		await imagePane.render(detail);
	}
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
 * Escape をサイドバーに使わせる。
 *
 * ビュワー本体は Escape でモーダルを閉じる。シェアメニューのように
 * 「まず自分が閉じたい」部品はここで先に食い止める。
 * keydown は document の捕捉フェーズで受けており、後から登録したリスナでは
 * 本体より先に処理できないので、本体側から順番に聞く形にしている。
 * @returns {boolean} 食い止めたなら true (本体は反応してはいけない)
 */
export function consumeEscape() {
	return sidebarPane?.consumeEscape() === true;
}

/**
 * キー操作を手前に出ているものへ先に使わせる。
 * consumeEscape() の一般形。開いたシェアメニューは Escape だけでなく上下 / Home / End も
 * 自分で使うので、本体が作品の移動に使う前にここで聞く。コメントの入力欄も同様で、
 * ピッカーを開いていたり書きかけの文章があれば Escape を自分で使う。
 * @param {KeyboardEvent} event キー
 * @returns {boolean} 食い止めたなら true (本体は反応してはいけない)
 */
export function consumeKey(event) {
	// 手前に出ているものから順に使わせる。シェアメニュー (浮いている) が先、次にコメントの入力欄
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
