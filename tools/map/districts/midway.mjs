import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT, HEIGHTS } from "../layout.mjs";

const STALLS = [
	{ name: "RING THE HOLLOW", game: "rings", accent: NEON.magenta },
	{ name: "DUCK POND", game: "ducks", accent: NEON.cyan },
	{ name: "MILK BOTTLES", game: "bottles", accent: NEON.amber },
	{ name: "TEST YOUR NERVE", game: "strength", accent: NEON.lime },
	{ name: "FORTUNES  5c", game: "fortune", accent: NEON.violet },
	{ name: "SPUN SUGAR", game: "candy", accent: NEON.magenta },
	{ name: "SHOOTING GALLERY", game: "gallery", accent: NEON.amber },
	{ name: "PRIZE EVERY TIME", game: "prizes", accent: NEON.cyan },
	{ name: "GUESS YOUR WEIGHT", game: "scale", accent: NEON.lime },
	{ name: "THE COIN TOSS", game: "rings", accent: NEON.violet },
];

/** Stall rows down the main avenue and along the cross avenue. */
export function buildMidway(b, rng) {
	const { avenue, crossAvenue, plaza } = LAYOUT;

	let index = 0;
	// South avenue: stalls face inward from both sides.
	for (let z = avenue.toZ + 22; z < avenue.fromZ - 16; z += 34) {
		for (const side of [-1, 1]) {
			const spec = STALLS[index % STALLS.length];
			index++;
			buildStall(b, rng, {
				pos: [side * (avenue.halfWidth + 12), 0, z],
				yaw: side > 0 ? 90 : -90,
				spec,
			});
		}
	}

	// Cross avenue: stalls on the north side only, so the south stays open.
	for (let x = -150; x <= 150; x += 42) {
		if (Math.abs(x) < plaza.radius + 12) continue;
		const spec = STALLS[index % STALLS.length];
		index++;
		buildStall(b, rng, {
			pos: [x, 0, -(crossAvenue.halfWidth + 12)],
			yaw: 0,
			spec,
		});
	}

	buildStringLights(b, rng);
	buildLampPosts(b, rng);
	buildStreetFurniture(b, rng);
}

/**
 * Sodium lamp posts along both avenues and around the park edge.
 * These are the neutral key lights that give the buildings their form.
 */
function buildLampPosts(b, rng) {
	const { avenue, crossAvenue, plaza } = LAYOUT;
	const spots = [];
	for (let z = avenue.toZ + 10; z < avenue.fromZ; z += 36) {
		spots.push([-avenue.halfWidth - 3, z]);
		spots.push([avenue.halfWidth + 3, z]);
	}
	for (let x = crossAvenue.fromX + 24; x < crossAvenue.toX; x += 40) {
		if (Math.abs(x) < plaza.radius + 6) continue;
		spots.push([x, crossAvenue.halfWidth + 3]);
	}
	// Corner posts so the quiet quarters of the park are not pitch black.
	for (const [x, z] of [
		[-120, -110], [120, -110], [-160, 60], [160, 60], [-70, -140], [70, 60], [-60, 170], [60, 170],
	]) {
		spots.push([x, z]);
	}

	b.inGroup("LampPosts", () => {
		for (const [x, z] of spots) {
			const height = 21;
			b.tube([x, 0, z], [x, height, z], 1, {
				name: "LampPost",
				color: PAINT.iron,
				material: MATERIAL.corroded,
			});
			b.box({
				name: "LampBase",
				pos: [x, 1.2, z],
				size: [2.6, 2.4, 2.6],
				color: PAINT.iron,
				material: MATERIAL.corroded,
			});
			// Swan-neck arm.
			b.beam([x, height, z], [x + 3.4, height + 1.6, z], 0.7, 0.7, {
				name: "LampArm",
				color: PAINT.iron,
				material: MATERIAL.corroded,
				canCollide: false,
			});
			b.box({
				name: "LampHood",
				pos: [x + 4.6, height + 1.4, z],
				size: [4, 1.2, 4],
				color: PAINT.ironLight,
				material: MATERIAL.metal,
				canCollide: false,
			});
			const dying = rng.bool(0.22);
			b.box({
				name: "LampLens",
				pos: [x + 4.6, height + 0.6, z],
				size: [3.2, 0.5, 3.2],
				color: dying ? [120, 108, 90] : [255, 226, 178],
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
			b.light({
				pos: [x + 4.6, height - 0.4, z],
				color: [255, 224, 182],
				range: 52,
				brightness: dying ? 0.9 : 2.3,
				flicker: dying ? rng.float(0.3, 0.7) : undefined,
			});
		}
	});
}

function buildStall(b, rng, { pos, yaw, spec }) {
	const [sx, , sz] = pos;
	const rad = (yaw * Math.PI) / 180;
	// Local axes: forward is where the counter faces, right runs along the front.
	const fwd = [Math.sin(rad), 0, Math.cos(rad)];
	const right = [Math.cos(rad), 0, -Math.sin(rad)];
	const at = (r, y, f) => [sx + right[0] * r + fwd[0] * f, y, sz + right[2] * r + fwd[2] * f];

	b.blocker({
		type: "rect",
		center: [sx + fwd[0] * -4, sz + fwd[2] * -4],
		size: yaw % 180 === 0 ? [19, 15] : [15, 19],
	});

	b.inGroup(`Stall_${spec.game}_${Math.round(sx)}_${Math.round(sz)}`, () => {
		b.box({
			name: "StallFloor",
			pos: at(0, 0.12, -4),
			size: [18, 0.24, 14],
			rot: [0, yaw, 0],
			color: PAINT.boardwalkDark,
			material: MATERIAL.planks,
		});
		b.box({
			name: "StallBackWall",
			pos: at(0, 6, -9),
			size: [18, 12, 0.8],
			rot: [0, yaw, 0],
			color: shade(PAINT.plum, -0.15),
			material: MATERIAL.wood,
		});
		for (const side of [-1, 1]) {
			b.box({
				name: "StallSideWall",
				pos: at(side * 8.6, 6, -4.5),
				size: [0.8, 12, 9.5],
				rot: [0, yaw, 0],
				color: shade(PAINT.plum, -0.22),
				material: MATERIAL.wood,
			});
		}
		b.box({
			name: "StallCounter",
			pos: at(0, 3.2, 0),
			size: [18, 1.2, 3],
			rot: [0, yaw, 0],
			color: PAINT.boardwalk,
			material: MATERIAL.wood,
		});
		b.box({
			name: "StallCounterFront",
			pos: at(0, 1.5, 1.2),
			size: [18, 3, 0.6],
			rot: [0, yaw, 0],
			color: spec.accent,
			material: MATERIAL.smooth,
		});

		// Striped awning tilted out over the counter.
		const stripes = 9;
		for (let i = 0; i < stripes; i++) {
			const r = -8 + (16 / (stripes - 1)) * i;
			b.box({
				name: "Awning",
				pos: at(r, HEIGHTS.stallRoof - 0.4, 1.8),
				size: [18 / stripes + 0.3, 0.4, 8],
				rot: [-18 * Math.cos(rad), yaw, -18 * Math.sin(rad)],
				color: i % 2 === 0 ? PAINT.canvasRed : PAINT.canvasCream,
				material: MATERIAL.fabric,
				canCollide: false,
			});
		}
		b.box({
			name: "AwningLip",
			pos: at(0, HEIGHTS.stallRoof - 3.1, 5.4),
			size: [18.4, 1.6, 0.4],
			rot: [0, yaw, 0],
			color: spec.accent,
			material: MATERIAL.neon,
			canCollide: false,
			castShadow: false,
		});

		// Sign board above the awning.
		b.box({
			name: "StallSign",
			pos: at(0, HEIGHTS.stallRoof + 3.4, -0.6),
			size: [17, 5, 0.5],
			rot: [0, yaw, 0],
			color: [10, 6, 16],
			material: MATERIAL.smooth,
			sign: { text: spec.name, color: spec.accent, face: "Front", scale: 0.7 },
		});
		// Warm work light under the awning. Coloured light everywhere reads as
		// soup; the neon needs neutral surfaces to be an accent against.
		b.light({ pos: at(0, HEIGHTS.stallRoof - 2, 1), color: [255, 224, 186], range: 40, brightness: 2.6 });
		b.light({ pos: at(0, 7, -7), color: [255, 214, 170], range: 24, brightness: 1.5 });

		// Bulb run along the awning lip.
		for (let i = -3; i <= 3; i++) {
			b.bulb(at(i * 2.6, HEIGHTS.stallRoof - 3.9, 5.4), i % 2 === 0 ? NEON.amber : spec.accent, 0.32, {
				range: 10,
				brightness: 0.8,
				light: i % 3 === 0,
			});
		}

		buildStallGame(b, rng, spec, at, yaw);

		// Prize shelves on the back wall.
		for (let shelf = 0; shelf < 3; shelf++) {
			const y = 4.2 + shelf * 2.6;
			b.box({
				name: "PrizeShelf",
				pos: at(0, y, -8.2),
				size: [16, 0.4, 2],
				rot: [0, yaw, 0],
				color: PAINT.boardwalk,
				material: MATERIAL.wood,
				canCollide: false,
			});
			for (let i = -3; i <= 3; i++) {
				if (rng.bool(0.25)) continue;
				const prizeColor = rng.pick(NEON_ORDER);
				// Cheap plush: a body sphere and a head sphere. Reads perfectly at range.
				b.sphere({
					name: "PlushBody",
					pos: at(i * 2.3, y + 1.1, -8.2),
					size: [1.8, 1.8, 1.8],
					color: prizeColor,
					material: MATERIAL.fabric,
					canCollide: false,
				});
				b.sphere({
					name: "PlushHead",
					pos: at(i * 2.3, y + 2.4, -8.2),
					size: [1.2, 1.2, 1.2],
					color: prizeColor,
					material: MATERIAL.fabric,
					canCollide: false,
				});
			}
		}
	});
}

function buildStallGame(b, rng, spec, at, yaw) {
	switch (spec.game) {
		case "rings": {
			for (let i = -3; i <= 3; i++) {
				b.tube(at(i * 2.4, 3.8, -3), at(i * 2.4, 7.2, -3), 0.4, {
					name: "RingPeg",
					color: PAINT.canvasRed,
					material: MATERIAL.smooth,
					canCollide: false,
				});
				if (rng.bool(0.5)) {
					b.part({
						name: "TossRing",
						shape: "cyl",
						pos: at(i * 2.4, 4.1, -3),
						size: [0.4, 2.4, 2.4],
						rot: [0, 0, 90],
						color: rng.pick(NEON_ORDER),
						material: MATERIAL.neon,
						canCollide: false,
						castShadow: false,
					});
				}
			}
			break;
		}
		case "ducks": {
			b.box({
				name: "DuckTrough",
				pos: at(0, 3.9, -2.4),
				size: [16, 1.4, 3],
				rot: [0, yaw, 0],
				color: PAINT.canvasTeal,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			for (let i = -5; i <= 5; i++) {
				b.sphere({
					name: "Duck",
					pos: at(i * 1.4, 4.8, -2.4),
					size: [1.1, 1, 1.5],
					color: NEON.amber,
					material: MATERIAL.plastic,
					canCollide: false,
				});
			}
			break;
		}
		case "bottles": {
			for (let row = 0; row < 3; row++) {
				const count = 3 - row;
				for (let i = 0; i < count; i++) {
					b.tube(
						at((i - (count - 1) / 2) * 1.8, 4 + row * 2.2, -6),
						at((i - (count - 1) / 2) * 1.8, 6 + row * 2.2, -6),
						1.4,
						{ name: "MilkBottle", color: PAINT.canvasCream, material: MATERIAL.smooth, canCollide: false },
					);
				}
			}
			break;
		}
		case "strength": {
			b.box({
				name: "StrengthTower",
				pos: at(0, 12, -6),
				size: [3, 24, 3],
				rot: [0, yaw, 0],
				color: PAINT.iron,
				material: MATERIAL.metal,
			});
			for (let i = 0; i < 8; i++) {
				b.box({
					name: "StrengthLamp",
					pos: at(0, 3 + i * 2.7, -4.4),
					size: [2.6, 1.6, 0.5],
					rot: [0, yaw, 0],
					color: i > 5 ? NEON.magenta : NEON.lime,
					material: MATERIAL.neon,
					canCollide: false,
					castShadow: false,
				});
			}
			b.sphere({
				name: "StrengthBell",
				pos: at(0, 24.8, -6),
				size: [4, 3.4, 4],
				color: PAINT.brass,
				material: MATERIAL.metal,
			});
			b.beam(at(-2, 1.1, 0.5), at(2.6, 3.4, 0.5), 0.8, 0.8, {
				name: "Mallet",
				color: PAINT.boardwalk,
				material: MATERIAL.wood,
				canCollide: false,
			});
			break;
		}
		case "fortune": {
			// A fortune-teller automaton behind glass.
			b.box({
				name: "FortuneCabinet",
				pos: at(0, 6, -6),
				size: [9, 12, 5],
				rot: [0, yaw, 0],
				color: PAINT.plumDark,
				material: MATERIAL.wood,
			});
			b.box({
				name: "FortuneGlass",
				pos: at(0, 7.5, -3.6),
				size: [7, 8, 0.3],
				rot: [0, yaw, 0],
				color: [150, 190, 200],
				material: MATERIAL.glass,
				transparency: 0.55,
				reflectance: 0.4,
			});
			b.sphere({
				name: "FortuneHead",
				pos: at(0, 9.4, -5),
				size: [2.6, 3, 2.6],
				color: PAINT.canvasCream,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			b.box({
				name: "FortuneTurban",
				pos: at(0, 11, -5),
				size: [3, 1.6, 3],
				rot: [0, yaw, 0],
				color: NEON.violet,
				material: MATERIAL.fabric,
				canCollide: false,
			});
			b.sphere({
				name: "CrystalBall",
				pos: at(0, 6.4, -4.2),
				size: [2.6, 2.6, 2.6],
				color: NEON.cyan,
				material: MATERIAL.neon,
				transparency: 0.25,
				canCollide: false,
			});
			b.light({ pos: at(0, 6.4, -4.2), color: NEON.cyan, range: 20, brightness: 2.2, flicker: 0.25 });
			break;
		}
		case "candy": {
			for (let i = -2; i <= 2; i++) {
				b.sphere({
					name: "CandyFloss",
					pos: at(i * 3, 5.4, -5),
					size: [3.4, 3.4, 3.4],
					color: i % 2 === 0 ? NEON.magenta : [255, 240, 250],
					material: MATERIAL.fabric,
					transparency: 0.2,
					canCollide: false,
				});
				b.tube(at(i * 3, 3.8, -5), at(i * 3, 5.2, -5), 0.3, {
					name: "CandyStick",
					color: PAINT.bone,
					material: MATERIAL.plastic,
					canCollide: false,
				});
			}
			break;
		}
		case "gallery": {
			for (let row = 0; row < 2; row++) {
				for (let i = -4; i <= 4; i++) {
					b.part({
						name: "GalleryTarget",
						shape: "cyl",
						pos: at(i * 1.9, 5 + row * 3, -7.4),
						size: [0.4, 1.8, 1.8],
						rot: [0, yaw + 90, 0],
						color: (i + row) % 2 === 0 ? PAINT.canvasRed : PAINT.canvasCream,
						material: MATERIAL.smooth,
						canCollide: false,
					});
				}
			}
			for (const side of [-1, 1]) {
				b.beam(at(side * 5, 4.2, 0), at(side * 5, 4.6, -2), 1, 0.6, {
					name: "GalleryRifle",
					color: PAINT.iron,
					material: MATERIAL.metal,
					canCollide: false,
				});
			}
			break;
		}
		case "scale": {
			b.part({
				name: "ScalePlatform",
				shape: "cyl",
				pos: at(0, 1, -4),
				size: [2, 8, 8],
				rot: [0, 0, 90],
				color: PAINT.iron,
				material: MATERIAL.diamond,
			});
			b.part({
				name: "ScaleDial",
				shape: "cyl",
				pos: at(0, 9, -6),
				size: [0.6, 7, 7],
				rot: [0, yaw + 90, 0],
				color: PAINT.canvasCream,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			b.box({
				name: "ScaleNeedle",
				pos: at(0, 9.4, -5.6),
				size: [0.4, 2.8, 0.3],
				rot: [0, yaw, 28],
				color: PAINT.canvasRed,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			break;
		}
		default: {
			for (let i = -3; i <= 3; i++) {
				b.box({
					name: "PrizeCrate",
					pos: at(i * 2.4, 4.4, -5),
					size: [2, 2, 2],
					rot: [0, yaw + rng.float(-12, 12), 0],
					color: rng.pick(NEON_ORDER),
					material: MATERIAL.plastic,
					canCollide: false,
				});
			}
		}
	}
}

/** Sagging festoon lighting over both avenues. */
function buildStringLights(b, rng) {
	const { avenue, crossAvenue } = LAYOUT;
	b.inGroup("StringLights", () => {
		const runs = [];
		for (let z = avenue.toZ; z < avenue.fromZ; z += 30) {
			runs.push({ from: [-avenue.halfWidth - 2, HEIGHTS.stringLights, z], to: [avenue.halfWidth + 2, HEIGHTS.stringLights, z] });
		}
		for (let x = crossAvenue.fromX + 20; x < crossAvenue.toX; x += 30) {
			if (Math.abs(x) < LAYOUT.plaza.radius) continue;
			runs.push({ from: [x, HEIGHTS.stringLights, -crossAvenue.halfWidth - 2], to: [x, HEIGHTS.stringLights, crossAvenue.halfWidth + 2] });
		}

		for (const run of runs) {
			const bulbs = 7;
			let prev = run.from;
			for (let i = 1; i <= bulbs + 1; i++) {
				const t = i / (bulbs + 1);
				const sag = Math.sin(t * Math.PI) * 3.2;
				const pt = [
					run.from[0] + (run.to[0] - run.from[0]) * t,
					run.from[1] - sag,
					run.from[2] + (run.to[2] - run.from[2]) * t,
				];
				b.tube(prev, pt, 0.12, {
					name: "FestoonWire",
					color: [16, 14, 20],
					material: MATERIAL.plastic,
					canCollide: false,
					castShadow: false,
				});
				if (i <= bulbs) {
					const dead = rng.bool(0.18);
					const color = dead ? [40, 36, 48] : NEON_ORDER[i % NEON_ORDER.length];
					b.sphere({
						name: "FestoonBulb",
						pos: [pt[0], pt[1] - 0.7, pt[2]],
						size: [0.9, 1.1, 0.9],
						color,
						material: dead ? MATERIAL.glass : MATERIAL.neon,
						canCollide: false,
						castShadow: false,
					});
					if (!dead && i % 2 === 0) {
						b.light({
							pos: [pt[0], pt[1] - 1, pt[2]],
							color,
							range: 16,
							brightness: 1,
							flicker: rng.bool(0.2) ? rng.float(0.1, 0.35) : undefined,
						});
					}
				}
				prev = pt;
			}
		}
	});
}

/** Benches, bins, barrels and the odd abandoned pram. */
function buildStreetFurniture(b, rng) {
	b.inGroup("StreetFurniture", () => {
		const spots = [];
		for (let z = 60; z < 190; z += 26) {
			spots.push([-8, z, 0]);
			spots.push([8, z, 180]);
		}
		for (let x = -170; x <= 170; x += 30) {
			if (Math.abs(x) < 54) continue;
			spots.push([x, 10, 90]);
		}

		for (const [x, z, yaw] of spots) {
			const kind = rng.int(0, 3);
			if (kind === 0) {
				// Bench.
				b.box({
					name: "BenchSeat",
					pos: [x, 2.2, z],
					size: [8, 0.5, 2.4],
					rot: [0, yaw, 0],
					color: PAINT.boardwalk,
					material: MATERIAL.planks,
				});
				b.box({
					name: "BenchBack",
					pos: [x, 3.6, z - 1.1],
					size: [8, 2.4, 0.4],
					rot: [0, yaw, -12],
					color: PAINT.boardwalk,
					material: MATERIAL.planks,
				});
				for (const side of [-3, 3]) {
					b.box({
						name: "BenchLeg",
						pos: [x + side, 1, z],
						size: [0.5, 2, 2.4],
						rot: [0, yaw, 0],
						color: PAINT.iron,
						material: MATERIAL.corroded,
					});
				}
			} else if (kind === 1) {
				// Overflowing bin.
				b.tube([x, 0, z], [x, 4.4, z], 3.4, {
					name: "Bin",
					color: PAINT.iron,
					material: MATERIAL.corroded,
				});
				for (let i = 0; i < 5; i++) {
					b.box({
						name: "BinTrash",
						pos: [x + rng.float(-1.4, 1.4), 4.6 + rng.float(0, 1), z + rng.float(-1.4, 1.4)],
						size: [rng.float(0.6, 1.6), rng.float(0.4, 1.2), rng.float(0.6, 1.6)],
						rot: [rng.float(0, 50), rng.float(0, 180), rng.float(0, 50)],
						color: rng.pick([PAINT.bone, PAINT.canvasCream, PAINT.canvasRed]),
						material: MATERIAL.plastic,
						canCollide: false,
					});
				}
			} else if (kind === 2) {
				// Stacked barrels.
				const n = rng.int(2, 4);
				for (let i = 0; i < n; i++) {
					b.tube(
						[x + rng.float(-2, 2), i * 4.2, z + rng.float(-2, 2)],
						[x + rng.float(-2, 2), i * 4.2 + 4, z + rng.float(-2, 2)],
						3.6,
						{ name: "Barrel", color: rng.bool(0.5) ? PAINT.rust : PAINT.canvasTeal, material: MATERIAL.corroded },
					);
				}
			} else {
				// Crate stack -- cover you can actually break line of sight behind.
				const n = rng.int(3, 6);
				for (let i = 0; i < n; i++) {
					const s = rng.float(3, 5.5);
					b.box({
						name: "Crate",
						pos: [x + rng.float(-4, 4), s / 2 + rng.int(0, 1) * s, z + rng.float(-4, 4)],
						size: [s, s, s],
						rot: [0, rng.float(0, 90), 0],
						color: PAINT.crate,
						material: MATERIAL.wood,
					});
				}
			}
		}
	});
}
