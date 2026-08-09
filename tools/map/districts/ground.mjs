import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT } from "../layout.mjs";

/** The midway floor, the perimeter hoarding, and the grime that sells both. */
export function buildGround(b, rng) {
	const { ground, wall, avenue, crossAvenue, plaza } = LAYOUT;

	b.inGroup("Ground", () => {
		// Dead ground beyond the hoarding. Nobody walks on it, but the dead
		// trees have to be standing on something or they read as floating
		// props the moment the fog thins.
		b.box({
			name: "Wasteland",
			pos: [0, -ground.thickness / 2 - 0.5, 0],
			size: [760, ground.thickness, 760],
			color: shade(PAINT.plumDark, -0.45),
			material: MATERIAL.slate,
		});

		b.box({
			name: "Midway",
			pos: [0, -ground.thickness / 2, 0],
			size: [ground.size, ground.thickness, ground.size],
			color: PAINT.asphalt,
			material: MATERIAL.concrete,
		});

		// Main avenue boardwalk, laid plank by plank so the fog has texture to bite.
		const avenueLength = avenue.fromZ - avenue.toZ;
		const plankCount = Math.floor(avenueLength / 4);
		for (let i = 0; i < plankCount; i++) {
			const z = avenue.toZ + i * 4 + 2;
			b.box({
				name: "AvenuePlank",
				pos: [0, 0.06, z],
				size: [avenue.halfWidth * 2, 0.12, 3.7],
				color: i % 2 === 0 ? PAINT.boardwalk : PAINT.boardwalkDark,
				material: MATERIAL.planks,
			});
		}

		// East-west cross avenue.
		const crossLength = crossAvenue.toX - crossAvenue.fromX;
		const crossPlanks = Math.floor(crossLength / 4);
		for (let i = 0; i < crossPlanks; i++) {
			const x = crossAvenue.fromX + i * 4 + 2;
			if (Math.abs(x) < plaza.radius - 4) continue;
			b.box({
				name: "CrossPlank",
				pos: [x, 0.06, 0],
				size: [3.7, 0.12, crossAvenue.halfWidth * 2],
				color: i % 2 === 0 ? PAINT.boardwalk : PAINT.boardwalkDark,
				material: MATERIAL.planks,
			});
		}

		// Plaza disc: concentric slate rings around the clock tower.
		for (let r = plaza.radius; r > 8; r -= 8) {
			b.part({
				name: "PlazaRing",
				shape: "cyl",
				pos: [0, 0.08, 0],
				size: [0.16, r * 2, r * 2],
				rot: [0, 0, 90],
				color: r % 16 === 0 ? shade(PAINT.plum, 0.08) : PAINT.plumDark,
				material: MATERIAL.slate,
			});
		}
	});

	buildPerimeter(b, rng);
	scatterGrime(b, rng);
}

function buildPerimeter(b, rng) {
	const { wall } = LAYOUT;
	b.inGroup("Perimeter", () => {
		const sides = [
			{ axis: "x", sign: 1 },
			{ axis: "x", sign: -1 },
			{ axis: "z", sign: 1 },
			{ axis: "z", sign: -1 },
		];
		for (const side of sides) {
			const count = Math.floor((wall.half * 2) / wall.segment);
			for (let i = 0; i < count; i++) {
				const t = -wall.half + i * wall.segment + wall.segment / 2;
				const along = side.axis === "x" ? [side.sign * wall.half, 0, t] : [t, 0, side.sign * wall.half];
				const size =
					side.axis === "x" ? [2.5, wall.height, wall.segment + 0.4] : [wall.segment + 0.4, wall.height, 2.5];

				b.box({
					name: "Hoarding",
					pos: [along[0], wall.height / 2, along[2]],
					size,
					color: i % 3 === 0 ? PAINT.plumDark : PAINT.plum,
					material: MATERIAL.planks,
				});

				// A dying neon capping strip: most of the run is dark, which makes
				// the segments that still work feel deliberate.
				if (i % 2 === 0) {
					const color = NEON_ORDER[(i + (side.sign > 0 ? 0 : 2)) % NEON_ORDER.length];
					const stripSize =
						side.axis === "x" ? [0.6, 0.6, wall.segment - 2] : [wall.segment - 2, 0.6, 0.6];
					b.box({
						name: "HoardingNeon",
						pos: [along[0], wall.height + 0.4, along[2]],
						size: stripSize,
						color,
						material: MATERIAL.neon,
						canCollide: false,
						castShadow: false,
					});
					if (i % 6 === 0) {
						b.light({
							pos: [along[0] * 0.97, wall.height + 1.5, along[2] * 0.97],
							color,
							range: 30,
							brightness: 1.1,
							flicker: rng.float(0.02, 0.12),
						});
					}
				}
			}
		}

		// Dead trees just past the hoarding: silhouettes for the fog to carve.
		for (let i = 0; i < 26; i++) {
			const angle = rng.float(0, Math.PI * 2);
			const dist = rng.float(wall.half + 14, wall.half + 60);
			const x = Math.cos(angle) * dist;
			const z = Math.sin(angle) * dist;
			const height = rng.float(22, 42);
			b.tube([x, 0, z], [x + rng.float(-3, 3), height, z + rng.float(-3, 3)], rng.float(1.4, 2.6), {
				name: "DeadTree",
				color: PAINT.plumDark,
				material: MATERIAL.wood,
				canCollide: false,
			});
			const branches = rng.int(2, 4);
			for (let j = 0; j < branches; j++) {
				const bh = height * rng.float(0.5, 0.9);
				b.tube(
					[x, bh, z],
					[x + rng.float(-11, 11), bh + rng.float(2, 9), z + rng.float(-11, 11)],
					rng.float(0.5, 1.1),
					{ name: "DeadBranch", color: PAINT.plumDark, material: MATERIAL.wood, canCollide: false },
				);
			}
		}
	});
}

function scatterGrime(b, rng) {
	b.inGroup("Grime", () => {
		// Standing water. Flat, dark and reflective -- it doubles every neon sign.
		for (let i = 0; i < 46; i++) {
			const x = rng.float(-190, 190);
			const z = rng.float(-190, 190);
			const w = rng.float(6, 22);
			const d = rng.float(5, 18);
			b.box({
				name: "Puddle",
				pos: [x, 0.05, z],
				size: [w, 0.08, d],
				rot: [0, rng.float(0, 180), 0],
				color: [10, 10, 16],
				material: MATERIAL.glass,
				transparency: 0.25,
				reflectance: 0.55,
				canCollide: false,
				castShadow: false,
			});
		}

		// Trash: torn tickets, cups, a lost shoe or two.
		const litterColors = [PAINT.bone, PAINT.canvasCream, PAINT.canvasRed, PAINT.brass, PAINT.crate];
		for (let i = 0; i < 150; i++) {
			const x = rng.float(-196, 196);
			const z = rng.float(-196, 196);
			b.box({
				name: "Litter",
				pos: [x, rng.float(0.1, 0.3), z],
				size: [rng.float(0.5, 1.8), rng.float(0.1, 0.5), rng.float(0.5, 1.8)],
				rot: [rng.float(-8, 8), rng.float(0, 180), rng.float(-8, 8)],
				color: rng.pick(litterColors),
				material: MATERIAL.plastic,
				canCollide: false,
				castShadow: false,
			});
		}

		// Toppled balloons, still tethered, still glowing.
		for (let i = 0; i < 18; i++) {
			const x = rng.float(-180, 180);
			const z = rng.float(-180, 180);
			const color = rng.pick(NEON_ORDER);
			const y = rng.float(1.6, 3.2);
			b.sphere({
				name: "LostBalloon",
				pos: [x, y, z],
				size: [2.6, 3.2, 2.6],
				color,
				material: MATERIAL.neon,
				transparency: 0.35,
				canCollide: false,
				castShadow: false,
			});
			b.tube([x, y - 1.6, z], [x + rng.float(-1, 1), 0.1, z + rng.float(-1, 1)], 0.12, {
				name: "BalloonString",
				color: PAINT.bone,
				material: MATERIAL.plastic,
				canCollide: false,
				castShadow: false,
			});
		}
	});
}

export const GROUND_NEON = NEON;
