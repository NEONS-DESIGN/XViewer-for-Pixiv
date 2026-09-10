/**
 * #__NEXT_DATA__ の中身からセッション情報を組み立てる。
 * pixiv は Next.js の Pages Router で動いており、ログイン状態・表示設定・CSRF トークンが
 * ここに入っている (SITE_SPEC §0)。
 *
 * ここは文字列を受け取る純粋関数だけを置く。DOM から読み出す役は content/session.js。
 */

/** 読めなかったときに返す値。未ログインと同じ扱いにする。 */
const EMPTY_SESSION = Object.freeze({ isLoggedIn: false, self: null, csrfToken: null });

/**
 * @typedef {object} SessionSelf
 * @property {number} xRestrict 表示設定 0=全年齢のみ 1=R-18まで 2=R-18Gまで
 * @property {boolean} hideAiWorks AI 作品を隠す設定
 */

/**
 * @typedef {object} Session
 * @property {boolean} isLoggedIn
 * @property {SessionSelf|null} self 未ログインなら null
 * @property {string|null} csrfToken 更新系 API に必要
 */

/**
 * __NEXT_DATA__ の中身を解析する。
 * 壊れていても例外を投げない。セッションが読めないことは画面を落とす理由にならず、
 * 未ログインとして扱えば全年齢作品は見られるため。
 *
 * __NEXT_DATA__ は SPA 遷移では更新されないので、同じページでは何度読んでも同じ値になる。
 * トークンの失効は 401 を見て別に扱う (この関数の担当ではない)。
 * @param {string|null} text script 要素の中身
 * @returns {Session} セッション情報
 */
export function parseNextData(text) {
	if (!text) return { ...EMPTY_SESSION };

	let pageProps;
	try {
		pageProps = JSON.parse(text)?.props?.pageProps;
	} catch {
		return { ...EMPTY_SESSION };
	}
	if (!pageProps) return { ...EMPTY_SESSION };

	const session = {
		isLoggedIn: pageProps.isLoggedIn === true,
		self: null,
		csrfToken: null,
	};

	// preloadedState は JSON 文字列として二重に入っている
	try {
		const preloaded = JSON.parse(pageProps.serverSerializedPreloadedState);
		session.csrfToken = preloaded?.api?.token ?? null;
		const self = preloaded?.userData?.self;
		if (self) {
			session.self = {
				xRestrict: typeof self.xRestrict === 'number' ? self.xRestrict : 0,
				hideAiWorks: self.hideAiWorks === true,
			};
		}
	} catch {
		// ログイン状態だけ分かれば表示の判断はできる
	}

	return session;
}
