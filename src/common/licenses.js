/**
 * 設定画面の「ライセンス」タブに出す文言。
 *
 * **ここが出どころ。** 同じ内容が NOTICE にもあるが、片方だけ直すと食い違うので、
 * NOTICE 側に載っていることを test/common/licenses.test.js で縛っている。
 * 項目を足すときは、このファイルと NOTICE の両方に足す。
 */

/**
 * 非公式である旨。
 * pixiv の登録商標のガイドライン「アプリケーション、各種サービス等への使用について」5 が
 * 求める 2 つの表記 (プラットフォームを利用した開発である旨 / 公式の配布物ではない旨) を
 * body に必ず含める。短くするときも、この 2 つは落とさない。
 * @type {{brief: string, body: readonly string[]}}
 */
export const DISCLAIMER = Object.freeze({
	/** 設定タブの末尾に残す 1 行。タブを切り替えない利用者にも届かせるためのもの。 */
	brief: 'pixiv 非公式の拡張機能です。詳しくは「ライセンス」タブへ。',
	/** ライセンスタブに出す本文。 */
	body: Object.freeze([
		'pixiv プラットフォームを利用して開発した非公式の拡張機能です。ピクシブ株式会社が作成・配布するものではありません。同社とは一切関係がなく、提携・支援・推奨を受けたものでもありません。',
		'利用によって生じた一切の結果については、利用者自身が責任を負うものとします。',
		'pixiv および関連サービスは予告なく機能や掲載内容の改訂・変更・提供停止を行う場合があり、そのときこの拡張が動かなくなることがあります。',
	]),
});

/**
 * この拡張自身のライセンス。LICENSE ファイルと一致させる。
 * @type {{name: string, copyright: string}}
 */
export const PROJECT_LICENSE = Object.freeze({
	name: 'MIT License',
	copyright: 'Copyright (c) 2026 NEONS',
});

/**
 * 同梱している第三者の成果物。
 * note は「この拡張のどこで使っているか」。利用者が何の話か分かるようにするためのもの。
 * @type {readonly {name: string, copyright: string, license: string, url: string, note: string}[]}
 */
export const THIRD_PARTY = Object.freeze([
	Object.freeze({
		name: 'Material Symbols',
		copyright: 'Copyright Google LLC',
		license: 'Apache License, Version 2.0',
		url: 'https://github.com/google/material-design-icons',
		note: '画面のアイコンの図形データ',
	}),
	Object.freeze({
		name: 'Font Awesome Free',
		copyright: 'Copyright Fonticons, Inc.',
		license: 'CC BY 4.0',
		url: 'https://github.com/FortAwesome/Font-Awesome',
		note: 'シェアメニューのブランドロゴ。各ロゴはそれぞれの権利者の商標です',
	}),
]);
