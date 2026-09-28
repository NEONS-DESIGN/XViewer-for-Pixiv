/**
 * 画像要素へ読み込み先の URL を入れる。
 *
 * **i.pximg.net は Referer が pixiv.net でないと 403 を返す。**
 * Firefox は content script が読ませた資源に Referer を付けないことがある。
 * (`privacy.antitracking.isolateContentScriptResources` が有効な版) そのままだと画像が全部 403 になる。
 *
 * Firefox では `wrappedJSObject` (Xray を外したページ側の要素) を通して入れると、
 * ページが入れたのと同じ扱いになって Referer が付く。
 * Chrome の isolated world には `wrappedJSObject` が無いので、ただの代入になる。
 *
 * 入れる URL は呼び出し側で検証済みのもの (safeCdnUrl 等) に限ること。
 * Xray を外すとページ側が書き換えた setter を通る。(Firefox のみ) 渡すのは文字列だけなので
 * 拡張の内部をページへ渡すことにはならない。
 */

/**
 * Xray を外した要素を返す。Firefox 以外 (`wrappedJSObject` が無い環境) では要素そのもの。
 * @param {object} image 画像要素 (HTMLImageElement か、テストの偽物)
 * @returns {object} 代入に使う要素
 */
function pageSide(image) {
	return image.wrappedJSObject ?? image;
}

/**
 * `src` プロパティへ URL を入れる。(`image.src = url` と同じ)
 * @param {object} image 画像要素
 * @param {string} url 読み込み先。空文字で読み込みを止める
 * @returns {void}
 */
export function assignImageSrc(image, url) {
	pageSide(image).src = url;
}

/**
 * `src` 属性へ URL を入れる。(`image.setAttribute('src', url)` と同じ)
 * @param {Element} image 画像要素
 * @param {string} url 読み込み先
 * @returns {void}
 */
export function setImageSrcAttribute(image, url) {
	pageSide(image).setAttribute('src', url);
}
