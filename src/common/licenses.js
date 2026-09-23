/**
 * 設定画面の「ライセンス」タブに出す、言語に依らない値。
 *
 * **ここが出どころ。** 同じ内容が NOTICE にもあるが、片方だけ直すと食い違うので、
 * NOTICE 側に載っていることを test/common/licenses.test.js で縛っている。
 * 項目を足すときは、このファイルと NOTICE の両方に足す。
 *
 * **文言 (免責事項と note) は src/i18n のカタログが持つ。** ここは言語に依らない
 * 名前・著作権表示・ライセンス名・URL だけを持つ。
 */

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
 * 「この拡張のどこで使っているか」(note) は言語に依るのでここには置かず、
 * strings.licenses.notes[name] から引く。
 * @type {readonly {name: string, copyright: string, license: string, url: string}[]}
 */
export const THIRD_PARTY = Object.freeze([
	Object.freeze({
		name: 'Material Symbols',
		copyright: 'Copyright Google LLC',
		license: 'Apache License, Version 2.0',
		url: 'https://github.com/google/material-design-icons',
	}),
	Object.freeze({
		name: 'Font Awesome Free',
		copyright: 'Copyright Fonticons, Inc.',
		license: 'CC BY 4.0',
		url: 'https://github.com/FortAwesome/Font-Awesome',
	}),
]);
