/**
 * カスタマイズ可能な select (`appearance: base-select`) の対応判定。
 * 対応環境では選択肢の中に説明を添えられるので、セレクトの下に説明行を置かずに済む。
 */

/**
 * 選択肢を装飾できるか (`appearance: base-select` に対応しているか) を返す。
 *
 * 従来の select は選択肢に文字しか置けず、閉じた状態の中身も差し替えられない。
 * 対応環境では `<button><selectedcontent>` で閉じた状態を自前の要素として描け、
 * 選択肢にも説明を添えられる。
 * **判定に失敗したら非対応へ倒す。** base-select は比較的新しい機能で、
 * 非対応のブラウザを使う利用者が実在するため。
 * @param {Window|undefined} win 対象の window (`CSS.supports` の提供元)
 * @returns {boolean} 対応していれば true
 */
export function supportsRichOptions(win) {
	try {
		return Boolean(win?.CSS?.supports?.('appearance', 'base-select'));
	} catch {
		// 判定そのものが投げても描画は続ける
		return false;
	}
}
