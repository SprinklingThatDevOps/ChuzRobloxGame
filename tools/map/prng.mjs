/**
 * Deterministic PRNG so map generation is reproducible across machines.
 * Regenerating the map must never produce a diff unless the generator changed.
 */
export function mulberry32(seed) {
	let a = seed >>> 0;
	return function random() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function makeRng(seed) {
	const next = mulberry32(seed);
	return {
		next,
		float: (min, max) => min + next() * (max - min),
		int: (min, max) => Math.floor(min + next() * (max - min + 1)),
		bool: (chance = 0.5) => next() < chance,
		pick: (list) => list[Math.floor(next() * list.length)],
		shuffle: (list) => {
			const out = list.slice();
			for (let i = out.length - 1; i > 0; i--) {
				const j = Math.floor(next() * (i + 1));
				[out[i], out[j]] = [out[j], out[i]];
			}
			return out;
		},
	};
}
