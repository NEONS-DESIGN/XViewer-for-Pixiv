/**
 * ストアへアップロードする CRX を作る。(Chrome ウェブストアの「検証済み CRX アップロード」用)
 *
 *   npm run pack:crx -- --key <秘密鍵の .pem>
 *
 * 1. ビルドし直し、dist/manifest.json の version が package.json と合っているかを確かめる
 * 2. dist/ の写しを Chrome の --pack-extension で秘密鍵を使って署名する
 * 3. できた CRX の署名を公開鍵で検証し、出力先へ置く
 *
 * 秘密鍵の場所はリポジトリに書かない。--key か環境変数 XVIEWER_CRX_KEY で渡す。
 * 同じ版の CRX が出力先に既にあれば止まる。(ストアへ上げた版を上書きしないため。--force で上書き)
 *
 * Chrome は使い捨てのプロファイルで起動する。普段の Chrome が起動していると、
 * 同じプロファイルでは処理がそちらへ渡されてしまい、CRX が作られないため。
 */
import { spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { verifyCrx3 } from './crx.mjs';
import { toManifestVersion } from './manifest-version.mjs';
import { OUT_DIR } from './static-files.mjs';

/** 秘密鍵の場所を渡す環境変数。 */
const KEY_ENV = 'XVIEWER_CRX_KEY';

/** Chrome の場所を渡す環境変数。(自動で見つからないとき用) */
const CHROME_ENV = 'CHROME_PATH';

/** CRX の出力先の既定。 */
const DEFAULT_OUT_DIR = 'store/versions';

/** 出力するファイル名の接頭辞。手で作っている zip と同じ名前の付け方にそろえる。 */
const FILE_PREFIX = 'XViewer for Pixiv_';

/** 一時ディレクトリの接頭辞。 */
const TEMP_PREFIX = 'xviewer-crx-';

/** 一時ディレクトリの中で dist の写しを置く名前。CRX は隣に <名前>.crx としてできる。 */
const PACK_DIR_NAME = 'extension';

/** Chrome の終了を待つ上限。 */
const CHROME_TIMEOUT_MS = 60_000;

/** Chrome の終了後、CRX が書き上がるのを待つ上限と間隔。 */
const OUTPUT_WAIT_MS = 10_000;
const OUTPUT_POLL_MS = 200;

/** 一時ディレクトリを消すときの再試行。(Chrome がプロファイルを掴んだまま少し残ることがある) */
const CLEANUP_RETRIES = 5;
const CLEANUP_RETRY_DELAY_MS = 500;

/** version の出どころ。 */
const PACKAGE_JSON = 'package.json';

/**
 * OS ごとの Chrome 系ブラウザの既定の場所。先頭から探す。
 * @returns {string[]} 候補
 */
function chromeCandidates() {
	if (process.platform === 'win32') {
		const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
		return [
			...roots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
			...roots.map((root) => join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')),
			...roots.map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
		];
	}
	if (process.platform === 'darwin') {
		return [
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
			'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
		];
	}
	return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/**
 * コマンドライン引数を読む。
 * @returns {{key: string, outDir: string, chrome: string | undefined, force: boolean}}
 * @throws {Error} 秘密鍵の場所が無いとき
 */
function readOptions() {
	const { values } = parseArgs({
		options: {
			key: { type: 'string' },
			out: { type: 'string' },
			chrome: { type: 'string' },
			force: { type: 'boolean', default: false },
		},
	});
	const key = values.key ?? process.env[KEY_ENV];
	if (!key) throw new Error(`秘密鍵の場所を --key か環境変数 ${KEY_ENV} で渡してください`);
	return {
		key: resolve(key),
		outDir: resolve(values.out ?? DEFAULT_OUT_DIR),
		chrome: values.chrome ?? process.env[CHROME_ENV],
		force: values.force,
	};
}

/**
 * 秘密鍵を読み、対になる公開鍵 (SPKI DER) を求める。秘密鍵の中身は表示しない。
 * @param {string} path 秘密鍵の場所
 * @returns {Promise<Buffer>} 公開鍵
 * @throws {Error} 読めない・RSA の秘密鍵でないとき
 */
async function readPublicKeyFromPrivate(path) {
	let pem;
	try {
		pem = await readFile(path, 'utf8');
	} catch (error) {
		throw new Error(`秘密鍵を読めません (${path}): ${error.message}`);
	}
	let privateKey;
	try {
		privateKey = createPrivateKey(pem);
	} catch (error) {
		throw new Error(`秘密鍵として解釈できません (${path}): ${error.message}`);
	}
	// ストアの検証済みアップロードが受け付けるのは RSA だけ
	if (privateKey.asymmetricKeyType !== 'rsa') {
		throw new Error(`RSA の秘密鍵ではありません (${privateKey.asymmetricKeyType})`);
	}
	return createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
}

/**
 * ビルドし直し、dist の manifest が package.json の version になっているかを確かめる。
 * @returns {Promise<string>} package.json の version
 * @throws {Error} ビルドの失敗、version の不一致
 */
async function buildAndCheckVersion() {
	const { version } = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'));
	const result = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
	if (result.status !== 0) throw new Error('ビルドに失敗しました');
	const manifest = JSON.parse(await readFile(join(OUT_DIR, 'manifest.json'), 'utf8'));
	const expected = toManifestVersion(version);
	if (manifest.version !== expected) {
		throw new Error(`dist/manifest.json の version (${manifest.version}) が package.json (${expected}) と合いません`);
	}
	return version;
}

/**
 * 使う Chrome を決める。
 * @param {string | undefined} requested 指定された場所
 * @returns {string} Chrome の実行ファイル
 * @throws {Error} 見つからないとき
 */
function findChrome(requested) {
	if (requested) {
		if (!existsSync(requested)) throw new Error(`指定された Chrome がありません: ${requested}`);
		return requested;
	}
	const found = chromeCandidates().find((path) => existsSync(path));
	if (!found) throw new Error(`Chrome が見つかりません。--chrome か環境変数 ${CHROME_ENV} で場所を渡してください`);
	return found;
}

/**
 * ファイルができて大きさが落ち着くまで待つ。
 * @param {string} path 待つファイル
 * @returns {Promise<void>}
 * @throws {Error} 待っても現れないとき
 */
async function waitForFile(path) {
	const deadline = Date.now() + OUTPUT_WAIT_MS;
	let lastSize = -1;
	while (Date.now() < deadline) {
		const size = await stat(path).then((s) => s.size, () => -1);
		// 2 回続けて同じ大きさなら書き終わったと見なす
		if (size > 0 && size === lastSize) return;
		lastSize = size;
		await sleep(OUTPUT_POLL_MS);
	}
	throw new Error('Chrome が CRX を作りませんでした (秘密鍵の形式や dist の中身を確かめてください)');
}

/**
 * Chrome で dist を署名して CRX にする。
 * @param {string} chrome Chrome の実行ファイル
 * @param {string} keyPath 秘密鍵
 * @param {string} workDir 一時ディレクトリ
 * @returns {Promise<Buffer>} CRX の中身
 * @throws {Error} Chrome の失敗、CRX ができないとき
 */
async function packWithChrome(chrome, keyPath, workDir) {
	const extensionDir = join(workDir, PACK_DIR_NAME);
	await cp(OUT_DIR, extensionDir, { recursive: true });
	const result = spawnSync(chrome, [
		`--pack-extension=${extensionDir}`,
		`--pack-extension-key=${keyPath}`,
		`--user-data-dir=${join(workDir, 'profile')}`,
		// 失敗してもダイアログで止まらないようにする
		'--no-message-box',
	], { timeout: CHROME_TIMEOUT_MS, stdio: 'inherit' });
	if (result.error) throw new Error(`Chrome を起動できません: ${result.error.message}`);
	if (result.status !== 0) throw new Error(`Chrome が異常終了しました (終了コード ${result.status})`);
	const crxPath = `${extensionDir}.crx`;
	await waitForFile(crxPath);
	return readFile(crxPath);
}

/**
 * CRX を作る。
 * @returns {Promise<void>}
 */
async function main() {
	const options = readOptions();
	const publicKey = await readPublicKeyFromPrivate(options.key);
	const chrome = findChrome(options.chrome);
	const version = await buildAndCheckVersion();

	const outPath = join(options.outDir, `${FILE_PREFIX}${version}.crx`);
	if (existsSync(outPath) && !options.force) {
		throw new Error(`${outPath} が既にあります。version を上げるか、作り直すなら --force を付けてください`);
	}

	const workDir = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
	try {
		const crx = await packWithChrome(chrome, options.key, workDir);
		const { archiveSize } = verifyCrx3(crx, publicKey);
		await mkdir(options.outDir, { recursive: true });
		await copyFile(join(workDir, `${PACK_DIR_NAME}.crx`), outPath);
		console.log(`[pack:crx] 署名を検証しました (zip 本体 ${archiveSize} bytes)`);
		console.log(`[pack:crx] ${outPath} (${crx.length} bytes, version ${version})`);
	} finally {
		// 片付けの失敗で結果の表示を邪魔しない
		await rm(workDir, { recursive: true, force: true, maxRetries: CLEANUP_RETRIES, retryDelay: CLEANUP_RETRY_DELAY_MS })
			.catch((error) => console.error(`[pack:crx] 一時ディレクトリを消せませんでした (${workDir}): ${error.message}`));
	}
}

try {
	await main();
} catch (error) {
	console.error(`[pack:crx] ${error?.message ?? error}`);
	process.exit(1);
}
