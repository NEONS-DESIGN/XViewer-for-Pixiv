import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ICON_OUTPUTS, iconFileName } from '../../scripts/icon-svg.mjs';

/** 検査対象の manifest。 */
const MANIFEST_PATH = new URL('../../src/manifest.json', import.meta.url);

/** 生成するサイズから作った、あるべきアイコンの対応表。 */
const EXPECTED = Object.fromEntries(
	ICON_OUTPUTS.map(({ size }) => [String(size), `icons/${iconFileName(size)}`]),
);

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

test('manifest の icons は生成するサイズと一致する', () => {
	assert.deepEqual(manifest.icons, EXPECTED);
});

test('action は default_popup だけを持つ', () => {
	// default_icon / default_title は省略すると icons / name に倒れる。書くと同じ内容を 2 か所で持つことになる
	assert.deepEqual(Object.keys(manifest.action), ['default_popup']);
});

test('manifest の説明文に非公式である旨がある', () => {
	// pixiv の商標ガイドラインが求める 2 つの表記。ストアの一覧に出る文なのでここが要
	assert.match(manifest.description, /非公式/);
	assert.match(manifest.description, /作成・配布するものではありません/);
});
