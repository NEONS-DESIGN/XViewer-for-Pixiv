/**
 * ライセンスタブと、設定タブの末尾に残す非公式の断り。
 * 言語に依らない値の出どころは `common/licenses.js`、文言の出どころは `strings` (src/i18n)。
 * ここでは並べるだけにする。(SPEC §11.1.1)
 */
import { PROJECT_LICENSE, THIRD_PARTY } from '../common/licenses.js';
import { createDescription } from './description.js';

/**
 * 外部サイトへのリンクを組み立てる。
 * popup から開くので必ず新しいタブにし、参照元を渡さない。(SPEC §13-3)
 * @param {Document} doc 対象のドキュメント
 * @param {string} url 行き先
 * @param {string} [label] 表示する文字。省略すると URL をそのまま出す
 * @returns {HTMLAnchorElement} リンク
 */
function createExternalLink(doc, url, label = url) {
	const link = doc.createElement('a');
	link.href = url;
	link.textContent = label;
	link.setAttribute('target', '_blank');
	link.setAttribute('rel', 'noopener noreferrer');
	return link;
}

/**
 * 設定タブの末尾に残す 1 行を組み立てる。
 * 本文はライセンスタブにあるが、タブを切り替えない利用者にも
 * 非公式であることだけは届かせる。
 * @param {Document} doc 対象のドキュメント
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} 1 行
 */
export function renderBriefDisclaimer(doc, strings) {
	const note = doc.createElement('p');
	note.className = 'disclaimer-brief';
	note.dataset.role = 'disclaimer-brief';
	note.textContent = strings.licenses.disclaimer.brief;
	return note;
}

/**
 * 見出しを作る。
 * @param {Document} doc 対象のドキュメント
 * @param {string} tag 'h2' か 'h3'
 * @param {string} text 見出しの文言
 * @returns {HTMLElement} 見出し
 */
function heading(doc, tag, text) {
	const element = doc.createElement(tag);
	element.textContent = text;
	return element;
}

/**
 * ライセンスタブの中身を組み立てる。
 * @param {Document} doc 対象のドキュメント
 * @param {object} strings 文言のカタログ
 * @returns {HTMLElement} パネル
 */
export function renderLicensePanel(doc, strings) {
	const panel = doc.createElement('div');
	panel.className = 'panel license';
	const headings = strings.popup.licenseHeadings;

	const disclaimer = doc.createElement('div');
	disclaimer.className = 'disclaimer';
	disclaimer.dataset.role = 'disclaimer';
	for (const line of strings.licenses.disclaimer.body) {
		const paragraph = doc.createElement('p');
		paragraph.textContent = line;
		disclaimer.append(paragraph);
	}

	const project = doc.createElement('p');
	project.className = 'license-item';
	project.textContent = `${PROJECT_LICENSE.name} / ${PROJECT_LICENSE.copyright}`;

	panel.append(
		heading(doc, 'h2', headings.disclaimer),
		disclaimer,
		heading(doc, 'h2', headings.project),
		project,
		heading(doc, 'h2', headings.thirdParty),
	);

	for (const item of THIRD_PARTY) {
		const entry = doc.createElement('div');
		entry.className = 'license-item';

		// ライセンス名は本文へのリンクにする。(CC BY 4.0 が URI の表示を求めるため)
		const terms = doc.createElement('p');
		terms.append(createExternalLink(doc, item.licenseUrl, item.license), doc.createTextNode(` / ${item.copyright}`));

		const source = doc.createElement('p');
		source.className = 'license-url';
		source.append(createExternalLink(doc, item.url));

		entry.append(heading(doc, 'h3', item.name), terms, createDescription(doc, strings.licenses.notes[item.name]), source);
		panel.append(entry);
	}

	return panel;
}
