/**
 * 設定画面のエントリ。
 * 組み立てと保存の橋渡しは app.js が持つ。ここは実物の document で起動するだけ。
 */
import { logError } from '../common/log.js';
import { main } from './app.js';

void main({ doc: document }).catch((error) => {
	// ここまで来ると画面が空のままなので、原因を残して気づけるようにする
	logError('popup: 設定画面の表示に失敗しました', error);
});
