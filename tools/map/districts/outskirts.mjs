import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT } from "../layout.mjs";

/** Dodgems pavilion: open sightlines up top, a forest of cover down low. */
export function buildBumperCars(b, rng) {
	const { bumperCars } = LAYOUT;
	const [cx, , cz] = bumperCars.pos;
	const halfW = bumperCars.width / 2;
	const halfD = bumperCars.depth / 2;
	const roofY = bumperCars.height;

	b.inGroup("BumperCars", () => {
		b.box({
			name: "DodgemFloor",
			pos: [cx, 0.2, cz],
			size: [bumperCars.width, 0.4, bumperCars.depth],
			color: [46, 44, 52],
			material: MATERIAL.diamond,
			reflectance: 0.25,
		});

		// Guard rail with a padded neon lip.
		const railSpecs = [
			{ pos: [cx, 2, cz - halfD], size: [bumperCars.width, 4, 2] },
			{ pos: [cx, 2, cz + halfD], size: [bumperCars.width, 4, 2] },
			{ pos: [cx - halfW, 2, cz], size: [2, 4, bumperCars.depth] },
			{ pos: [cx + halfW, 2, cz], size: [2, 4, bumperCars.depth] },
		];
		for (const [i, rail] of railSpecs.entries()) {
			b.box({ name: "DodgemRail", pos: rail.pos, size: rail.size, color: PAINT.plum, material: MATERIAL.smooth });
			b.box({
				name: "DodgemRailNeon",
				pos: [rail.pos[0], 4.3, rail.pos[2]],
				size: [rail.size[0] * 0.98, 0.5, rail.size[2] * 0.98],
				color: NEON_ORDER[i % NEON_ORDER.length],
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		}

		// Pillars and the electrified ceiling grid.
		for (const px of [-halfW + 4, 0, halfW - 4]) {
			for (const pz of [-halfD + 4, halfD - 4]) {
				b.box({
					name: "DodgemPillar",
					pos: [cx + px, roofY / 2, cz + pz],
					size: [3, roofY, 3],
					color: PAINT.iron,
					material: MATERIAL.metal,
				});
			}
		}
		b.box({
			name: "DodgemCeiling",
			pos: [cx, roofY + 1, cz],
			size: [bumperCars.width + 6, 1.2, bumperCars.depth + 6],
			color: PAINT.plumDark,
			material: MATERIAL.metal,
		});
		for (let gx = -halfW + 6; gx <= halfW - 6; gx += 8) {
			b.box({
				name: "CeilingMesh",
				pos: [cx + gx, roofY - 0.2, cz],
				size: [0.5, 0.5, bumperCars.depth - 4],
				color: PAINT.ironLight,
				material: MATERIAL.metal,
				canCollide: false,
			});
		}
		for (let gz = -halfD + 6; gz <= halfD - 6; gz += 8) {
			b.box({
				name: "CeilingMesh",
				pos: [cx, roofY - 0.2, cz + gz],
				size: [bumperCars.width - 4, 0.5, 0.5],
				color: PAINT.ironLight,
				material: MATERIAL.metal,
				canCollide: false,
			});
			for (let gx = -halfW + 10; gx <= halfW - 10; gx += 20) {
				const color = NEON_ORDER[(gx + gz) % NEON_ORDER.length];
				b.box({
					name: "CeilingTube",
					pos: [cx + gx, roofY - 1.2, cz + gz],
					size: [14, 0.5, 0.5],
					color,
					material: MATERIAL.neon,
					canCollide: false,
					castShadow: false,
				});
				b.light({ pos: [cx + gx, roofY - 2, cz + gz], color, range: 34, brightness: 1.4 });
			}
		}

		// Sign over the entrance.
		b.box({
			name: "DodgemSign",
			pos: [cx, roofY + 5, cz + halfD + 1],
			size: [44, 7, 0.6],
			color: [10, 6, 16],
			material: MATERIAL.smooth,
			sign: { text: "DODGE ME", color: NEON.cyan, face: "Front", scale: 0.9 },
		});

		// The cars themselves, scattered mid-collision.
		for (let i = 0; i < 15; i++) {
			const x = cx + rng.float(-halfW + 8, halfW - 8);
			const z = cz + rng.float(-halfD + 8, halfD - 8);
			const yaw = rng.float(0, 360);
			const accent = rng.pick(NEON_ORDER);
			b.inGroup(`Dodgem${i}`, () => {
				b.box({
					name: "DodgemBody",
					pos: [x, 2.1, z],
					size: [7, 2.6, 5],
					rot: [0, yaw, 0],
					color: shade(accent, -0.4),
					material: MATERIAL.smooth,
				});
				b.part({
					name: "DodgemBumper",
					shape: "cyl",
					pos: [x, 1.4, z],
					size: [1.6, 9.4, 9.4],
					rot: [0, 0, 90],
					color: accent,
					material: MATERIAL.smooth,
				});
				b.box({
					name: "DodgemSeat",
					pos: [x, 3.6, z],
					size: [3.4, 2.6, 3.2],
					rot: [0, yaw, 0],
					color: PAINT.plumDark,
					material: MATERIAL.fabric,
					canCollide: false,
				});
				b.tube([x, 3.4, z], [x, roofY - 1.6, z], 0.3, {
					name: "DodgemPole",
					color: PAINT.ironLight,
					material: MATERIAL.metal,
					canCollide: false,
				});
				b.bulb([x, 4.4, z], accent, 0.4, { range: 14, brightness: 1.2, light: i % 3 === 0 });
			});
		}
	});

	b.landmark("Dodge Me", bumperCars.pos, "The grid still hums. Nobody dares touch the floor.");
}

/**
 * Maintenance yard. This is where the blackout comes from, so it needs to
 * read as the electrical heart of the park.
 */
export function buildGeneratorYard(b, rng) {
	const { generatorYard } = LAYOUT;
	const [cx, , cz] = generatorYard.pos;
	const halfW = generatorYard.width / 2;
	const halfD = generatorYard.depth / 2;

	b.inGroup("GeneratorYard", () => {
		b.box({
			name: "YardSlab",
			pos: [cx, 0.15, cz],
			size: [generatorYard.width, 0.3, generatorYard.depth],
			color: [38, 36, 42],
			material: MATERIAL.concrete,
		});

		// Chain link fence: posts plus a translucent mesh panel.
		for (let x = -halfW; x <= halfW; x += 10) {
			for (const zs of [-1, 1]) {
				if (zs > 0 && Math.abs(x) < 10) continue; // gate
				b.tube([cx + x, 0, cz + zs * halfD], [cx + x, 12, cz + zs * halfD], 0.6, {
					name: "FencePost",
					color: PAINT.ironLight,
					material: MATERIAL.metal,
				});
			}
		}
		for (const zs of [-1, 1]) {
			b.box({
				name: "FenceMesh",
				pos: [cx, 6, cz + zs * halfD],
				size: [generatorYard.width, 12, 0.2],
				color: [120, 126, 132],
				material: MATERIAL.foil,
				transparency: 0.68,
				canCollide: zs < 0,
				castShadow: false,
			});
		}
		for (let z = -halfD; z <= halfD; z += 10) {
			b.tube([cx - halfW, 0, cz + z], [cx - halfW, 12, cz + z], 0.6, {
				name: "FencePost",
				color: PAINT.ironLight,
				material: MATERIAL.metal,
			});
		}
		b.box({
			name: "FenceMesh",
			pos: [cx - halfW, 6, cz],
			size: [0.2, 12, generatorYard.depth],
			color: [120, 126, 132],
			material: MATERIAL.foil,
			transparency: 0.68,
			castShadow: false,
		});

		// Generator shed.
		const shedX = cx + 12;
		const shedZ = cz - 12;
		b.box({ name: "ShedFloor", pos: [shedX, 0.4, shedZ], size: [34, 0.8, 26], color: PAINT.iron, material: MATERIAL.concrete });
		b.box({ name: "ShedBack", pos: [shedX, 8, shedZ - 13], size: [34, 16, 1], color: PAINT.rust, material: MATERIAL.corroded });
		b.box({ name: "ShedLeft", pos: [shedX - 17, 8, shedZ], size: [1, 16, 26], color: PAINT.rust, material: MATERIAL.corroded });
		b.box({ name: "ShedRight", pos: [shedX + 17, 8, shedZ], size: [1, 16, 26], color: PAINT.rust, material: MATERIAL.corroded });
		b.box({ name: "ShedRoof", pos: [shedX, 16.6, shedZ], size: [36, 1.2, 28], rot: [4, 0, 0], color: PAINT.iron, material: MATERIAL.corroded });

		// The generator: block, flywheel, exhaust stack.
		b.box({ name: "GeneratorBlock", pos: [shedX, 4, shedZ - 4], size: [18, 7, 10], color: PAINT.canvasTeal, material: MATERIAL.metal });
		b.tube([shedX - 10, 5.5, shedZ - 4], [shedX - 12.5, 5.5, shedZ - 4], 8, {
			name: "Flywheel",
			color: PAINT.iron,
			material: MATERIAL.metal,
		});
		b.tube([shedX + 6, 7.5, shedZ - 4], [shedX + 6, 22, shedZ - 4], 2.4, {
			name: "ExhaustStack",
			color: PAINT.iron,
			material: MATERIAL.corroded,
		});
		b.tube([shedX + 6, 22, shedZ - 4], [shedX + 6, 23.4, shedZ - 4], 3.2, {
			name: "StackCap",
			color: PAINT.rust,
			material: MATERIAL.corroded,
		});
		b.light({ pos: [shedX, 8, shedZ - 4], color: [255, 120, 40], range: 30, brightness: 2.2, flicker: 0.5 });

		// Fuse boxes: the lore anchor for every blackout.
		for (let i = 0; i < 3; i++) {
			const fx = shedX - 12 + i * 8;
			b.box({
				name: "FuseBox",
				pos: [fx, 7, shedZ - 12.2],
				size: [6, 8, 2],
				color: PAINT.ironLight,
				material: MATERIAL.metal,
				tags: ["FuseBox"],
			});
			b.box({
				name: "FuseLamp",
				pos: [fx, 10, shedZ - 11],
				size: [1.2, 1.2, 0.6],
				color: i === 1 ? NEON.magenta : NEON.lime,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
			b.light({
				pos: [fx, 10, shedZ - 10],
				color: i === 1 ? NEON.magenta : NEON.lime,
				range: 14,
				brightness: 1.4,
				flicker: i === 1 ? 0.6 : 0.1,
			});
		}

		// Cable runs snaking out of the yard toward the park.
		let prev = [shedX - 16, 0.6, shedZ + 6];
		for (let i = 0; i < 16; i++) {
			const next = [prev[0] - rng.float(6, 11), 0.6, prev[2] + rng.float(-4, 8)];
			b.tube(prev, next, 0.7, {
				name: "PowerCable",
				color: [18, 16, 22],
				material: MATERIAL.plastic,
				canCollide: false,
			});
			prev = next;
		}

		// Spare crates, drums and a lonely floodlight.
		for (let i = 0; i < 22; i++) {
			const x = cx + rng.float(-halfW + 5, halfW - 5);
			const z = cz + rng.float(-halfD + 5, halfD - 5);
			if (Math.abs(x - shedX) < 20 && Math.abs(z - shedZ) < 16) continue;
			if (rng.bool(0.5)) {
				const s = rng.float(3.5, 6);
				b.box({
					name: "YardCrate",
					pos: [x, s / 2, z],
					size: [s, s, s * rng.float(0.8, 1.3)],
					rot: [0, rng.float(0, 90), 0],
					color: PAINT.crate,
					material: MATERIAL.wood,
				});
			} else {
				b.tube([x, 0, z], [x, 4.4, z], 3.4, {
					name: "YardDrum",
					color: rng.bool(0.4) ? NEON.lime : PAINT.rust,
					material: MATERIAL.corroded,
				});
			}
		}
		b.tube([cx - halfW + 6, 0, cz + halfD - 6], [cx - halfW + 6, 20, cz + halfD - 6], 1, {
			name: "FloodPost",
			color: PAINT.iron,
			material: MATERIAL.metal,
		});
		b.box({
			name: "FloodLamp",
			pos: [cx - halfW + 7.5, 19.5, cz + halfD - 6],
			size: [4, 3, 3],
			rot: [0, 0, -20],
			color: PAINT.ironLight,
			material: MATERIAL.metal,
		});
		b.light({
			pos: [cx - halfW + 9, 18.5, cz + halfD - 6],
			color: [255, 240, 200],
			range: 60,
			brightness: 2.4,
			shadows: true,
			flicker: 0.08,
		});

		b.box({
			name: "YardSign",
			pos: [cx, 9, cz + halfD + 0.6],
			size: [22, 5, 0.5],
			color: NEON.amber,
			material: MATERIAL.smooth,
			sign: { text: "STAFF ONLY", color: [30, 16, 8], face: "Front", scale: 0.8 },
		});
	});

	b.landmark("Generator Yard", generatorYard.pos, "Where the lights go to die, once a minute.");
}

/** Black water, a rotting pier, and the Tunnel of Love. */
export function buildPier(b, rng) {
	const { pier } = LAYOUT;
	const [px, , pz] = pier.pos;
	const halfW = pier.poolWidth / 2;
	const halfD = pier.poolDepth / 2;

	b.inGroup("Pier", () => {
		// Sunken basin so the water reads as depth, not a decal.
		b.box({
			name: "PoolBed",
			pos: [px, -5, pz],
			size: [pier.poolWidth, 8, pier.poolDepth],
			color: [16, 14, 20],
			material: MATERIAL.slate,
		});
		b.box({
			name: "BlackWater",
			pos: [px, -1.2, pz],
			size: [pier.poolWidth - 1, 0.4, pier.poolDepth - 1],
			color: PAINT.water,
			material: MATERIAL.glass,
			transparency: 0.18,
			reflectance: 0.72,
			canCollide: false,
		});
		// Coping around the basin edge.
		for (const [ox, oz, sx, sz] of [
			[0, -halfD, pier.poolWidth + 4, 4],
			[0, halfD, pier.poolWidth + 4, 4],
			[-halfW, 0, 4, pier.poolDepth + 4],
			[halfW, 0, 4, pier.poolDepth + 4],
		]) {
			b.box({
				name: "PoolCoping",
				pos: [px + ox, 0.6, pz + oz],
				size: [sx, 1.4, sz],
				color: PAINT.plum,
				material: MATERIAL.concrete,
			});
		}

		// Pier deck on pilings, running out across the water.
		const deckZ = pz;
		for (let i = 0; i < 14; i++) {
			const x = px - halfW + 8 + i * 6;
			b.box({
				name: "PierPlank",
				pos: [x, 2, deckZ],
				size: [5.6, 0.5, 18],
				color: i % 2 === 0 ? PAINT.boardwalk : PAINT.boardwalkDark,
				material: MATERIAL.planks,
			});
			if (i % 2 === 0) {
				for (const zs of [-1, 1]) {
					b.tube([x, -4, deckZ + zs * 8], [x, 2, deckZ + zs * 8], 1.4, {
						name: "Piling",
						color: PAINT.rust,
						material: MATERIAL.wood,
					});
					b.tube([x, 2, deckZ + zs * 8], [x, 6, deckZ + zs * 8], 0.6, {
						name: "PierRailPost",
						color: PAINT.rust,
						material: MATERIAL.wood,
						canCollide: false,
					});
				}
			}
		}
		for (const zs of [-1, 1]) {
			b.tube([px - halfW + 8, 5.6, deckZ + zs * 8], [px + halfW - 8, 5.6, deckZ + zs * 8], 0.5, {
				name: "PierRail",
				color: PAINT.rust,
				material: MATERIAL.wood,
				canCollide: false,
			});
		}
		// Lamps down the pier.
		for (let i = 0; i < 5; i++) {
			const x = px - halfW + 16 + i * 18;
			b.tube([x, 2, deckZ + 8], [x, 14, deckZ + 8], 0.7, {
				name: "PierLampPost",
				color: PAINT.iron,
				material: MATERIAL.corroded,
			});
			b.bulb([x, 14.6, deckZ + 8], NEON.amber, 1, {
				range: 30,
				brightness: 1.8,
				flicker: rng.bool(0.4) ? rng.float(0.1, 0.5) : undefined,
			});
		}

		// Swan boats, adrift and half-swamped.
		for (let i = 0; i < 6; i++) {
			const x = px + rng.float(-halfW + 12, halfW - 12);
			const z = pz + rng.float(-halfD + 10, halfD - 10);
			if (Math.abs(z - deckZ) < 11) continue;
			const yaw = rng.float(0, 360);
			b.inGroup(`SwanBoat${i}`, () => {
				b.box({
					name: "SwanHull",
					pos: [x, -0.6, z],
					size: [11, 3.4, 6],
					rot: [0, yaw, rng.float(-6, 6)],
					color: PAINT.canvasCream,
					material: MATERIAL.smooth,
				});
				const rad = (yaw * Math.PI) / 180;
				const fwd = [Math.cos(rad), 0, -Math.sin(rad)];
				b.tube(
					[x + fwd[0] * 4, 0.6, z + fwd[2] * 4],
					[x + fwd[0] * 5.4, 5, z + fwd[2] * 5.4],
					1.8,
					{ name: "SwanNeck", color: PAINT.canvasCream, material: MATERIAL.smooth, canCollide: false },
				);
				b.sphere({
					name: "SwanHead",
					pos: [x + fwd[0] * 5.8, 5.6, z + fwd[2] * 5.8],
					size: [2.6, 2.2, 2],
					color: PAINT.canvasCream,
					material: MATERIAL.smooth,
					canCollide: false,
				});
				b.box({
					name: "SwanBeak",
					pos: [x + fwd[0] * 7, 5.4, z + fwd[2] * 7],
					size: [1.6, 0.7, 0.7],
					rot: [0, yaw, 0],
					color: NEON.amber,
					material: MATERIAL.smooth,
					canCollide: false,
				});
				b.sphere({
					name: "SwanEye",
					pos: [x + fwd[0] * 6.2 + 0.7, 6, z + fwd[2] * 6.2],
					size: [0.5, 0.5, 0.5],
					color: NEON.magenta,
					material: MATERIAL.neon,
					canCollide: false,
					castShadow: false,
				});
			});
			b.animator({ group: `SwanBoat${i}`, kind: "bob", axis: [0, 1, 0], speed: rng.float(18, 30), amplitude: 0.35, phase: rng.float(0, 360) });
		}

		// Tunnel of Love at the far end.
		const tx = px + halfW - 4;
		const tz = pz - halfD + 18;
		b.box({ name: "TunnelFacade", pos: [tx, 13, tz], size: [8, 26, 34], color: PAINT.plumDark, material: MATERIAL.brick });
		b.box({ name: "TunnelMouth", pos: [tx - 3.6, 7, tz], size: [2, 14, 16], color: [2, 1, 4], material: MATERIAL.smooth, transparency: 0.1 });
		// Neon heart around the mouth, drawn as two arcs and a V.
		const heartPts = [];
		for (let i = 0; i <= 24; i++) {
			const t = (i / 24) * Math.PI * 2;
			const hx = 16 * Math.sin(t) ** 3;
			const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
			heartPts.push([tx - 4.4, 12 + hy * 0.75, tz + hx * 0.75]);
		}
		for (let i = 0; i < heartPts.length - 1; i++) {
			b.tube(heartPts[i], heartPts[i + 1], 0.7, {
				name: "HeartNeon",
				color: NEON.magenta,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		}
		b.light({ pos: [tx - 8, 12, tz], color: NEON.magenta, range: 50, brightness: 2.8 });
		b.box({
			name: "TunnelSign",
			pos: [tx - 4.6, 24, tz],
			size: [0.6, 6, 30],
			color: [8, 5, 14],
			material: MATERIAL.smooth,
			sign: { text: "TUNNEL OF LOVE", color: NEON.magenta, face: "Left", scale: 0.85 },
		});
	});

	b.landmark("Tunnel of Love", [px, 0, pz], "Two go in. The ledger only ever recorded one coming out.");
}
