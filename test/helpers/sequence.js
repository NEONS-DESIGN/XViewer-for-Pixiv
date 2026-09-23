/**
 * ビュワーの「作品の並び」(sequence) の偽物。
 * navigation.js は extend の結果を `has` で確かめるので、has を持たない偽物を渡すと
 * 「含まれていない」扱いになる。ここで 1 本にして、必ず has 付きで渡す。
 */

/**
 * ID の配列から並びの代わりを作る。
 * @param {string[]} ids 作品 ID (表示順)
 * @returns {{next: (id: string) => string|null, prev: (id: string) => string|null, has: (id: string) => boolean}} 並びの代わり
 */
export function fakeSequence(ids) {
	const at = (id, offset) => {
		const index = ids.indexOf(id);
		if (index < 0) return null;
		return ids[index + offset] ?? null;
	};
	return {
		next: (id) => at(id, 1),
		prev: (id) => at(id, -1),
		has: (id) => ids.includes(id),
	};
}
