/**
 * Just enough solid-body maths to ask where a character can stand.
 *
 * MapData describes parts, not a collision mesh, so this reconstructs the
 * volumes Roblox will build from them. It is used twice: the generator refuses
 * to place a spawn inside a wall, and tools/check-spawns.mjs re-checks the
 * finished map so a regression cannot ship quietly.
 */

const DEG = Math.PI / 180;

// An R6 character, roughly. Wider and shorter than the real rig on purpose:
// the point is to reject spawns that are *nearly* clear as well as ones that
// are plainly buried.
export const BODY = {
	halfWidth: 1.6,
	height: 5,
	rootHeight: 3,
};

/**
 * Push a world point into a part's local frame. Roblox composes
 * CFrame.Angles(x, y, z) as Rx * Ry * Rz, so the inverse unwinds Z, then Y,
 * then X.
 */
function toLocal(point, part) {
	let x = point[0] - part.pos[0];
	let y = point[1] - part.pos[1];
	let z = point[2] - part.pos[2];

	const rot = part.rot;
	if (rot) {
		const rx = rot[0] * DEG;
		const ry = rot[1] * DEG;
		const rz = rot[2] * DEG;

		let s = Math.sin(-rx);
		let c = Math.cos(-rx);
		[y, z] = [y * c - z * s, y * s + z * c];

		s = Math.sin(-ry);
		c = Math.cos(-ry);
		[x, z] = [x * c + z * s, -x * s + z * c];

		s = Math.sin(-rz);
		c = Math.cos(-rz);
		[x, y] = [x * c - y * s, x * s + y * c];
	}
	return [x, y, z];
}

export function containsPoint(point, part) {
	const [x, y, z] = toLocal(point, part);
	const [sx, sy, sz] = part.size;
	if (part.shape === "cyl") {
		// Roblox cylinders run along local X, circular in Y/Z.
		return Math.abs(x) <= sx / 2 && Math.hypot(y, z) <= sy / 2;
	}
	if (part.shape === "sphere") {
		return Math.hypot(x, y, z) <= Math.min(sx, sy, sz) / 2;
	}
	return Math.abs(x) <= sx / 2 && Math.abs(y) <= sy / 2 && Math.abs(z) <= sz / 2;
}

export function collidableParts(parts) {
	return parts.filter((part) => part.canCollide !== false);
}

/** Bounding radius, used to skip parts that cannot possibly be relevant. */
function reachOf(part) {
	return Math.max(part.size[0], part.size[1], part.size[2]) / 2 + 1;
}

/**
 * Points sampled through the volume a standing character occupies. Exact
 * capsule/OBB intersection is not worth the code: a spawn is either clear or
 * it is inside something big enough for these samples to find.
 */
function bodySamples(feet) {
	const samples = [];
	const w = BODY.halfWidth;
	for (const dy of [0.3, BODY.height * 0.5, BODY.height - 0.3]) {
		for (const [dx, dz] of [
			[0, 0],
			[w, 0],
			[-w, 0],
			[0, w],
			[0, -w],
		]) {
			samples.push([feet[0] + dx, feet[1] + dy, feet[2] + dz]);
		}
	}
	return samples;
}

/** Every collidable part a character standing at `feet` would be inside of. */
export function bodyObstructions(feet, parts) {
	const near = parts.filter((part) => {
		const reach = reachOf(part) + BODY.height;
		return (
			Math.abs(part.pos[0] - feet[0]) <= reach &&
			Math.abs(part.pos[1] - feet[1]) <= reach &&
			Math.abs(part.pos[2] - feet[2]) <= reach
		);
	});

	const hits = [];
	for (const sample of bodySamples(feet)) {
		for (const part of near) {
			if (!hits.includes(part) && containsPoint(sample, part)) hits.push(part);
		}
	}
	return hits;
}

export function isClear(feet, parts) {
	return bodyObstructions(feet, parts).length === 0;
}

/**
 * Sampled downward cast. Returns how far the character falls before landing
 * and what they land on, or null if there is nothing underneath at all --
 * which in Roblox means falling past FallenPartsDestroyHeight and dying.
 */
export function groundBelow(feet, parts, maxDrop = 600, step = 0.25) {
	const near = parts.filter((part) => {
		const reach = reachOf(part);
		return (
			Math.abs(part.pos[0] - feet[0]) <= reach &&
			Math.abs(part.pos[2] - feet[2]) <= reach &&
			part.pos[1] - reach <= feet[1]
		);
	});

	for (let drop = 0; drop <= maxDrop; drop += step) {
		const probe = [feet[0], feet[1] - drop, feet[2]];
		for (const part of near) {
			if (containsPoint(probe, part)) return { drop, part };
		}
	}
	return null;
}
