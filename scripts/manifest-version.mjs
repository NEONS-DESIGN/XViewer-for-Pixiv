/**
 * package.json の version を Chrome 拡張の manifest が受け付ける形へ整える。
 *
 * ビルド本体 (build.mjs) は import した時点で走ってしまい単体で確かめられないので、
 * 判断だけをここへ切り出してある (SPEC.md §15)。
 *
 * manifest の version の規則 (developer.chrome.com/docs/extensions/reference/manifest/version):
 *   - 1 個から 4 個の整数をドットで繋いだもの
 *   - 各整数は 0 以上 65535 以下
 *   - 0 以外の整数は 0 で始められない (032 は不正)
 *   - 全ての整数が 0 ではいけない (0 と 0.0.0.0 は不正。0.1.0.0 は正しい)
 *
 * semver の prerelease / build metadata (0.2.0-beta.1+abc) は version には書けない。
 * 落としたうえで、表示用の version_name に元の文字列を残す。
 */

/** version の成分として認める形。0 か、0 で始まらない整数。 */
const VERSION_PART_PATTERN = /^(?:0|[1-9]\d*)$/;

/** ドットで区切った成分の数の下限と上限。 */
const VERSION_PART_MIN_COUNT = 1;
const VERSION_PART_MAX_COUNT = 4;

/** 各成分の上限。 */
const VERSION_PART_MAX = 65535;

/** semver の prerelease / build metadata。version には書けないので落とす。 */
const SEMVER_SUFFIX_PATTERN = /[-+].*$/;

/**
 * package.json の version を manifest の version へ変換する。
 * @param {string} version package.json の version
 * @returns {string} manifest に書ける version
 * @throws {Error} manifest の規則に合わないとき
 */
export function toManifestVersion(version) {
	if (typeof version !== 'string' || version.trim() === '') {
		throw new Error('package.json に version がありません');
	}

	const core = version.trim().replace(SEMVER_SUFFIX_PATTERN, '');
	const parts = core.split('.');

	if (parts.length < VERSION_PART_MIN_COUNT || parts.length > VERSION_PART_MAX_COUNT) {
		throw new Error(
			`version はドット区切りで ${VERSION_PART_MIN_COUNT}-${VERSION_PART_MAX_COUNT} 個の整数にしてください: ${version}`,
		);
	}
	for (const part of parts) {
		if (!VERSION_PART_PATTERN.test(part)) {
			throw new Error(`version の成分が整数でないか 0 で始まっています: ${version}`);
		}
		if (Number(part) > VERSION_PART_MAX) {
			throw new Error(`version の成分は ${VERSION_PART_MAX} 以下にしてください: ${version}`);
		}
	}
	if (parts.every((part) => part === '0')) {
		throw new Error(`version を全て 0 にはできません: ${version}`);
	}

	return core;
}

/**
 * manifest の内容に version を差し込む。
 * 渡された manifest は書き換えず、新しいオブジェクトを返す。
 * @param {object} manifest src/manifest.json の内容 (version を持たない)
 * @param {string} packageVersion package.json の version
 * @returns {object} version を差し込んだ manifest
 * @throws {Error} version が manifest の規則に合わないとき
 */
export function applyVersion(manifest, packageVersion) {
	const version = toManifestVersion(packageVersion);
	const applied = { ...manifest, version };
	// prerelease を落としたときだけ、元の文字列を表示用に残す。
	// 常に付けると version と同じ文字列が二重に並ぶだけになる
	const original = packageVersion.trim();
	if (original !== version) applied.version_name = original;
	return applied;
}
