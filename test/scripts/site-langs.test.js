import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	SITE_LANGUAGES,
	SITE_PAGES,
	relativeHref,
	renderPage,
	renderSitemap,
	syncSiteLanguages,
	localDate,
} from '../../scripts/site-langs.mjs';

const [JA, EN, KO] = SITE_LANGUAGES;

/** 目印だけを持つ最小のページ。 */
const SKELETON = [
	'<head>',
	'<!-- lang:head -->',
	'<!-- /lang:head -->',
	'</head>',
	'\t<!-- lang:menu -->',
	'\t<!-- /lang:menu -->',
	'\t\t<!-- lang:footer -->',
	'\t\t<!-- /lang:footer -->',
].join('\n');

test('サイトの言語は日本語を先頭 (x-default) に 5 つ', () => {
	assert.deepEqual(SITE_LANGUAGES.map((one) => one.hreflang), ['ja', 'en', 'ko', 'zh-CN', 'zh-TW']);
	assert.equal(JA.dir, '');
});

test('relativeHref はページの深さに合わせた相対リンクを返す', () => {
	assert.equal(relativeHref(JA, JA, 'index.html'), './');
	assert.equal(relativeHref(JA, KO, 'index.html'), 'ko/');
	assert.equal(relativeHref(KO, JA, 'index.html'), '../');
	assert.equal(relativeHref(KO, EN, 'privacy.html'), '../en/privacy.html');
	// 同じ言語へのリンクは同じフォルダの中で閉じる
	assert.equal(relativeHref(KO, KO, 'privacy.html'), 'privacy.html');
	assert.equal(relativeHref(KO, KO, 'index.html'), './');
});

test('renderPage は目印の中だけを書き直し、今の言語に印を付ける', () => {
	const html = renderPage(SKELETON, KO, 'index.html');
	assert.match(html, /<link rel="canonical" href="https:\/\/xviewer\.neonsdesign\.com\/ko\/">/);
	assert.match(html, /hreflang="x-default" href="https:\/\/xviewer\.neonsdesign\.com\/"/);
	assert.match(html, /<a href="\.\/" hreflang="ko" lang="ko" aria-current="true">한국어<\/a>/);
	assert.match(html, /<span class="visually-hidden">언어: <\/span>/);
	// フッターは自分以外の 4 言語
	const footer = html.slice(html.indexOf('<!-- lang:footer -->'));
	assert.equal(footer.match(/<li>/g).length, SITE_LANGUAGES.length - 1);
	assert.ok(!footer.includes('>한국어<'));
	// 目印の行のインデントが中身にも付く
	assert.match(html, /\n\t\t<li><a href="\.\.\/"/);
});

test('renderPage は何度かけても同じ結果になり、改行をページに合わせる', () => {
	const once = renderPage(SKELETON.replace(/\n/g, '\r\n'), JA, 'privacy.html');
	assert.equal(renderPage(once, JA, 'privacy.html'), once);
	assert.ok(!/[^\r]\n/.test(once), 'LF だけの改行が混ざっている');
});

test('renderPage は目印が欠けていれば投げる', () => {
	assert.throws(() => renderPage('<head></head>', JA, 'index.html'), /lang:head/);
});

test('renderSitemap は全ページを並べ、既存の lastmod を引き継ぐ', () => {
	const previous = '<url>\n\t\t<loc>https://xviewer.neonsdesign.com/</loc>\n\t\t<lastmod>2026-01-01</lastmod>';
	const xml = renderSitemap(previous, '2026-09-28');
	assert.equal(xml.match(/<url>/g).length, SITE_LANGUAGES.length * 2);
	assert.match(xml, /<loc>https:\/\/xviewer\.neonsdesign\.com\/<\/loc>\n\t\t<lastmod>2026-01-01<\/lastmod>/);
	assert.match(xml, /<loc>https:\/\/xviewer\.neonsdesign\.com\/zh-tw\/privacy\.html<\/loc>\n\t\t<lastmod>2026-09-28<\/lastmod>/);
});

test('localDate は手元の日付を 0 埋めの YYYY-MM-DD にする', () => {
	// 月と日は 1 桁でも 2 桁にする
	assert.equal(localDate(new Date(2026, 0, 5, 12, 0)), '2026-01-05');
	assert.equal(localDate(new Date(2026, 11, 31, 12, 0)), '2026-12-31');
});

test('localDate は UTC ではなく手元の時刻の日付を返す', () => {
	// 手元の 0 時台は UTC だと前日になる地域 (日本など) があるが、手元の日付を返す
	const midnight = new Date(2026, 9, 2, 0, 30);
	assert.equal(localDate(midnight), '2026-10-02');
});

test('site/ の全ページと sitemap.xml は言語の表と揃っている', async () => {
	// 揃っていなければ node scripts/site-langs.mjs を走らせる
	const siteDir = fileURLToPath(new URL('../../site/', import.meta.url));
	assert.deepEqual(await syncSiteLanguages({ siteDir, check: true }), []);
});

/**
 * site/ のページだけを一時フォルダへ写す。sitemap.xml は写さない。
 * @returns {Promise<string>} 一時フォルダ (site/ の代わり)
 */
async function copyPagesToTemp() {
	const source = fileURLToPath(new URL('../../site/', import.meta.url));
	const dir = await mkdtemp(path.join(tmpdir(), 'xviewer-site-langs-'));
	for (const language of SITE_LANGUAGES) {
		await mkdir(path.join(dir, language.dir), { recursive: true });
		for (const page of SITE_PAGES) {
			await copyFile(path.join(source, language.dir, page), path.join(dir, language.dir, page));
		}
	}
	return dir;
}

test('sitemap.xml が無ければ作り直す対象にする', async (t) => {
	const dir = await copyPagesToTemp();
	t.after(() => rm(dir, { recursive: true, force: true }));
	assert.deepEqual(await syncSiteLanguages({ siteDir: dir, check: true }), [path.join(dir, 'sitemap.xml')]);
});

test('sitemap.xml が無い以外の理由で読めなければ投げ、lastmod を書き直さない', async (t) => {
	const dir = await copyPagesToTemp();
	t.after(() => rm(dir, { recursive: true, force: true }));
	// フォルダにしておくと readFile が ENOENT 以外 (EISDIR) で失敗する
	await mkdir(path.join(dir, 'sitemap.xml'));
	await assert.rejects(syncSiteLanguages({ siteDir: dir, check: true }), /sitemap.xml を読めません/);
});
