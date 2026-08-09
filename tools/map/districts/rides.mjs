import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT } from "../layout.mjs";

/**
 * The Wheel of Hollow Hours.
 *
 * The rim and spokes spin as one body; each gondola is its own group that
 * orbits the hub without rotating, so the cars stay upright the whole way
 * round exactly like the real thing.
 */
export function buildFerrisWheel(b, rng) {
	const { ferrisWheel } = LAYOUT;
	const [cx, , cz] = ferrisWheel.pos;
	const hubY = ferrisWheel.hubHeight;
	const R = ferrisWheel.radius;
	const hub = [cx, hubY, cz];

	b.inGroup("FerrisWheelFrame", () => {
		// Concrete pad.
		b.part({
			name: "WheelPad",
			shape: "cyl",
			pos: [cx, 0.15, cz],
			size: [0.3, R * 2 + 24, R * 2 + 24],
			rot: [0, 0, 90],
			color: PAINT.plumDark,
			material: MATERIAL.concrete,
		});

		// Two A-frames straddling the hub.
		for (const zOff of [-11, 11]) {
			for (const xSign of [-1, 1]) {
				b.beam([cx + xSign * 40, 0, cz + zOff], [cx, hubY, cz + zOff], 3.4, 3.4, {
					name: "WheelLeg",
					color: PAINT.iron,
					material: MATERIAL.corroded,
				});
				// Lattice bracing.
				for (let i = 1; i < 8; i++) {
					const t0 = i / 8;
					const t1 = (i + 1) / 8;
					const p0 = [cx + xSign * 40 * (1 - t0), hubY * t0, cz + zOff];
					const p1 = [cx + xSign * 40 * (1 - t1), hubY * t1, cz + zOff];
					b.beam([p0[0], p0[1], p0[2] - zOff * 0.0], [p1[0], p1[1], p1[2]], 0.7, 0.7, {
						name: "WheelBrace",
						color: PAINT.ironLight,
						material: MATERIAL.metal,
						canCollide: false,
					});
					if (i % 2 === 1) {
						b.bulb(p0, NEON.amber, 0.45, { range: 22, brightness: 1.3, light: i % 4 === 1 });
					}
				}
			}
			b.beam([cx - 40, 6, cz + zOff], [cx + 40, 6, cz + zOff], 1.2, 1.2, {
				name: "WheelTie",
				color: PAINT.iron,
				material: MATERIAL.corroded,
			});
		}
		// Cross ties between the two frames.
		for (let i = 1; i <= 5; i++) {
			const y = (hubY / 6) * i;
			const x = 40 * (1 - i / 6);
			for (const xSign of [-1, 1]) {
				b.beam([cx + xSign * x, y, cz - 11], [cx + xSign * x, y, cz + 11], 0.8, 0.8, {
					name: "WheelCrossTie",
					color: PAINT.ironLight,
					material: MATERIAL.metal,
					canCollide: false,
				});
			}
		}

		// Hub bearing.
		b.tube([cx, hubY, cz - 13], [cx, hubY, cz + 13], 5, {
			name: "WheelAxle",
			color: PAINT.brass,
			material: MATERIAL.metal,
		});

		// Boarding platform.
		b.box({
			name: "BoardingDeck",
			pos: [cx, 3, cz + R - 4],
			size: [30, 6, 16],
			color: PAINT.boardwalkDark,
			material: MATERIAL.planks,
		});
		for (let i = 0; i < 6; i++) {
			b.box({
				name: "BoardingStep",
				pos: [cx, 0.5 + i * 0.9, cz + R + 5 + i * 1.4],
				size: [16, 1, 1.6],
				color: PAINT.boardwalk,
				material: MATERIAL.planks,
			});
		}
		b.box({
			name: "OperatorBooth",
			pos: [cx + 20, 5, cz + R - 2],
			size: [10, 10, 10],
			color: PAINT.plum,
			material: MATERIAL.wood,
		});
		b.light({ pos: [cx + 20, 9, cz + R - 2], color: NEON.amber, range: 26, brightness: 1.8, flicker: 0.15 });
	});

	// Spinning body: rim, spokes and the neon that traces them.
	b.inGroup("FerrisWheelBody", () => {
		const segments = 36;
		for (const zOff of [-9, 9]) {
			const pts = [];
			for (let i = 0; i <= segments; i++) {
				const a = ((Math.PI * 2) / segments) * i;
				pts.push([cx + Math.cos(a) * R, hubY + Math.sin(a) * R, cz + zOff]);
			}
			for (let i = 0; i < segments; i++) {
				b.tube(pts[i], pts[i + 1], 1.5, {
					name: "WheelRim",
					color: PAINT.ironLight,
					material: MATERIAL.metal,
				});
				// Neon trim rides just outside the structural rim; tucking it
				// inside would hide it completely.
				const outboard = zOff < 0 ? -1.4 : 1.4;
				b.tube(
					[pts[i][0], pts[i][1], pts[i][2] + outboard],
					[pts[i + 1][0], pts[i + 1][1], pts[i + 1][2] + outboard],
					1,
					{
						name: "WheelRimNeon",
						color: NEON_ORDER[Math.floor(i / 3) % NEON_ORDER.length],
						material: MATERIAL.neon,
						canCollide: false,
						castShadow: false,
					},
				);
			}
			// Inner tension ring.
			const innerR = R * 0.42;
			for (let i = 0; i < segments; i += 2) {
				const a0 = ((Math.PI * 2) / segments) * i;
				const a1 = ((Math.PI * 2) / segments) * (i + 2);
				b.tube(
					[cx + Math.cos(a0) * innerR, hubY + Math.sin(a0) * innerR, cz + zOff],
					[cx + Math.cos(a1) * innerR, hubY + Math.sin(a1) * innerR, cz + zOff],
					0.6,
					{ name: "WheelInnerRing", color: PAINT.iron, material: MATERIAL.metal, canCollide: false },
				);
			}
		}

		const spokeCount = ferrisWheel.gondolas * 2;
		for (let i = 0; i < spokeCount; i++) {
			const a = ((Math.PI * 2) / spokeCount) * i;
			const rimPt = [cx + Math.cos(a) * R, hubY + Math.sin(a) * R, cz];
			for (const zOff of [-9, 9]) {
				b.tube([cx, hubY, cz + zOff], [rimPt[0], rimPt[1], cz + zOff], 0.55, {
					name: "WheelSpoke",
					color: PAINT.ironLight,
					material: MATERIAL.metal,
					canCollide: false,
				});
			}
			if (i % 3 === 0) {
				b.bulb([cx + Math.cos(a) * R * 0.62, hubY + Math.sin(a) * R * 0.62, cz], NEON.cyan, 0.5, {
					range: 16,
					brightness: 1.2,
				});
			}
		}

		b.tube([cx, hubY, cz - 10], [cx, hubY, cz + 10], 8, {
			name: "WheelHub",
			color: PAINT.plumLight,
			material: MATERIAL.metal,
		});
		b.part({
			name: "HubNeon",
			shape: "cyl",
			pos: [cx, hubY, cz],
			size: [21, 9, 9],
			rot: [0, 90, 0],
			color: NEON.magenta,
			material: MATERIAL.neon,
			canCollide: false,
			castShadow: false,
		});
	});

	b.animator({ group: "FerrisWheelBody", kind: "spin", axis: [0, 0, 1], speed: 4.5, pivot: hub });

	// Gondolas: separate orbiting groups so they never tip over.
	for (let i = 0; i < ferrisWheel.gondolas; i++) {
		const a = ((Math.PI * 2) / ferrisWheel.gondolas) * i;
		const anchor = [cx + Math.cos(a) * (R - 2), hubY + Math.sin(a) * (R - 2), cz];
		const groupName = `FerrisGondola${i}`;
		const accent = NEON_ORDER[i % NEON_ORDER.length];
		b.inGroup(groupName, () => {
			const carY = anchor[1] - 7;
			b.tube([anchor[0], anchor[1], cz - 9], [anchor[0], anchor[1], cz + 9], 0.5, {
				name: "GondolaBar",
				color: PAINT.iron,
				material: MATERIAL.metal,
				canCollide: false,
			});
			for (const zOff of [-6, 6]) {
				b.tube([anchor[0], anchor[1], cz + zOff], [anchor[0], carY + 2.4, cz + zOff], 0.4, {
					name: "GondolaHanger",
					color: PAINT.iron,
					material: MATERIAL.metal,
					canCollide: false,
				});
			}
			b.box({
				name: "GondolaTub",
				pos: [anchor[0], carY, cz],
				size: [11, 5, 13],
				color: shade(accent, -0.55),
				material: MATERIAL.metal,
			});
			b.box({
				name: "GondolaFloor",
				pos: [anchor[0], carY - 2.2, cz],
				size: [11.4, 0.6, 13.4],
				color: PAINT.plumDark,
				material: MATERIAL.metal,
			});
			b.box({
				name: "GondolaRoof",
				pos: [anchor[0], carY + 3.4, cz],
				size: [12.5, 0.7, 14.5],
				color: accent,
				material: MATERIAL.smooth,
			});
			b.box({
				name: "GondolaRoofNeon",
				pos: [anchor[0], carY + 3.9, cz],
				size: [12.9, 0.35, 14.9],
				color: accent,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
			b.light({ pos: [anchor[0], carY + 1.5, cz], color: accent, range: 20, brightness: 1.5 });
		});
		b.animator({ group: groupName, kind: "orbit", axis: [0, 0, 1], speed: 4.5, pivot: hub });
	}

	b.landmark("The Wheel of Hollow Hours", ferrisWheel.pos, "Fourteen cars. Some nights, fifteen come back down.");
}

/** The Carousel of Borrowed Faces. */
export function buildCarousel(b, rng) {
	const { carousel } = LAYOUT;
	const [cx, , cz] = carousel.pos;
	const R = carousel.radius;
	const deckY = 3.2;
	const roofY = carousel.height;

	b.inGroup("CarouselFrame", () => {
		b.part({
			name: "CarouselPad",
			shape: "cyl",
			pos: [cx, 0.15, cz],
			size: [0.3, (R + 10) * 2, (R + 10) * 2],
			rot: [0, 0, 90],
			color: PAINT.plumDark,
			material: MATERIAL.concrete,
		});
		// Entry ramps at four compass points.
		b.ring([cx, 0, cz], R + 6, 4, (pos, deg) => {
			b.beam([pos[0], 0.2, pos[2]], [cx + (pos[0] - cx) * 0.82, deckY, cz + (pos[2] - cz) * 0.82], 10, 0.6, {
				name: "CarouselRamp",
				color: PAINT.boardwalk,
				material: MATERIAL.planks,
			});
		}, 45);
		b.tube([cx, 0, cz], [cx, roofY + 8, cz], 4.5, {
			name: "CarouselMast",
			color: PAINT.brass,
			material: MATERIAL.metal,
		});
	});

	b.inGroup("CarouselBody", () => {
		b.part({
			name: "CarouselDeck",
			shape: "cyl",
			pos: [cx, deckY - 0.5, cz],
			size: [1.6, R * 2, R * 2],
			rot: [0, 0, 90],
			color: PAINT.boardwalk,
			material: MATERIAL.planks,
		});
		b.part({
			name: "DeckSkirt",
			shape: "cyl",
			pos: [cx, deckY - 2, cz],
			size: [2.6, R * 2 - 1, R * 2 - 1],
			rot: [0, 0, 90],
			color: PAINT.canvasRed,
			material: MATERIAL.smooth,
		});
		b.neonHoop([cx, deckY - 3.2, cz], R - 0.4, 0.5, NEON.amber, 40);

		// Mirrored inner drum with painted panels.
		b.part({
			name: "CarouselDrum",
			shape: "cyl",
			pos: [cx, deckY + 9, cz],
			size: [18, 15, 15],
			rot: [0, 0, 90],
			color: PAINT.canvasCream,
			material: MATERIAL.smooth,
		});
		b.ring([cx, 0, cz], 7.6, 10, (pos, deg, i) => {
			b.box({
				name: "DrumPanel",
				pos: [pos[0], deckY + 9, pos[2]],
				size: [0.4, 11, 4.4],
				rot: [0, -deg, 0],
				color: i % 2 === 0 ? PAINT.canvasRed : PAINT.canvasTeal,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			b.box({
				name: "DrumMirror",
				pos: [pos[0] * 1.01, deckY + 9, pos[2] * 1.01],
				size: [0.2, 7, 2.4],
				rot: [0, -deg, 0],
				color: [190, 210, 220],
				material: MATERIAL.foil,
				reflectance: 0.8,
				canCollide: false,
			});
		});

		// Canopy.
		b.coneRoof([cx, roofY, cz], R + 2, 12, 20, [PAINT.canvasRed, PAINT.canvasCream], {
			name: "CarouselCanopy",
			thickness: 0.6,
		});
		b.neonHoop([cx, roofY - 0.3, cz], R + 2.2, 0.7, NEON.magenta, 44);
		b.ring([cx, 0, cz], R + 1.6, 24, (pos, deg, i) => {
			b.bulb([pos[0], roofY - 1.4, pos[2]], i % 2 === 0 ? NEON.amber : NEON.cyan, 0.4, {
				range: 14,
				brightness: 1.1,
				light: i % 3 === 0,
			});
		});

		// Ceiling ribs.
		b.ring([cx, 0, cz], R + 1, 20, (pos) => {
			b.tube([cx, roofY + 11, cz], [pos[0], roofY, pos[2]], 0.4, {
				name: "CanopyRib",
				color: PAINT.brass,
				material: MATERIAL.metal,
				canCollide: false,
			});
		});
		b.light({ pos: [cx, roofY - 4, cz], color: NEON.amber, range: 70, brightness: 2.6, shadows: true });
	});

	b.animator({ group: "CarouselBody", kind: "spin", axis: [0, 1, 0], speed: 7, pivot: [cx, 0, cz] });

	// Horses: each is its own group so it can rise and fall while it turns.
	for (let i = 0; i < carousel.horses; i++) {
		const a = ((Math.PI * 2) / carousel.horses) * i;
		const ring = i % 2 === 0 ? R - 7 : R - 17;
		const hx = cx + Math.cos(a) * ring;
		const hz = cz + Math.sin(a) * ring;
		const groupName = `CarouselHorse${i}`;
		const accent = NEON_ORDER[i % NEON_ORDER.length];
		const yawDeg = (-a * 180) / Math.PI + 90;
		b.inGroup(groupName, () => {
			const baseY = deckY + 5.5;
			b.tube([hx, deckY, hz], [hx, roofY - 1, hz], 0.5, {
				name: "HorsePole",
				color: PAINT.brass,
				material: MATERIAL.metal,
				canCollide: false,
			});
			// Body.
			b.box({
				name: "HorseBody",
				pos: [hx, baseY, hz],
				size: [7, 3.4, 2.4],
				rot: [0, yawDeg, 0],
				color: PAINT.canvasCream,
				material: MATERIAL.smooth,
			});
			// Head and neck.
			const fwd = [Math.cos((yawDeg * Math.PI) / 180), 0, -Math.sin((yawDeg * Math.PI) / 180)];
			b.box({
				name: "HorseNeck",
				pos: [hx + fwd[0] * 3.2, baseY + 1.9, hz + fwd[2] * 3.2],
				size: [2.4, 3.6, 1.8],
				rot: [0, yawDeg, 28],
				color: PAINT.canvasCream,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			b.box({
				name: "HorseHead",
				pos: [hx + fwd[0] * 4.6, baseY + 3.4, hz + fwd[2] * 4.6],
				size: [3, 1.6, 1.4],
				rot: [0, yawDeg, 8],
				color: PAINT.canvasCream,
				material: MATERIAL.smooth,
				canCollide: false,
			});
			// Legs.
			for (const lx of [-2, 2]) {
				for (const lz of [-0.9, 0.9]) {
					const ox = fwd[0] * lx - fwd[2] * lz;
					const oz = fwd[2] * lx + fwd[0] * lz;
					b.box({
						name: "HorseLeg",
						pos: [hx + ox, baseY - 2.6, hz + oz],
						size: [1, 3.2, 0.9],
						rot: [0, yawDeg, lx > 0 ? 12 : -12],
						color: PAINT.canvasCream,
						material: MATERIAL.smooth,
						canCollide: false,
					});
				}
			}
			// Saddle in the horse's own neon.
			b.box({
				name: "HorseSaddle",
				pos: [hx, baseY + 2, hz],
				size: [3.4, 0.9, 2.7],
				rot: [0, yawDeg, 0],
				color: accent,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		});
		b.animator({ group: groupName, kind: "spin", axis: [0, 1, 0], speed: 7, pivot: [cx, 0, cz] });
		b.animator({ group: groupName, kind: "bob", axis: [0, 1, 0], speed: 42, amplitude: 2.1, phase: i * 30 });
	}

	b.landmark("Carousel of Borrowed Faces", carousel.pos, "Twelve horses. Count them twice and you get thirteen.");
}

/** The big top: a cathedral of canvas with the lights still rigged. */
export function buildBigTop(b, rng) {
	const { bigTop } = LAYOUT;
	const [cx, , cz] = bigTop.pos;
	const R = bigTop.radius;
	const H = bigTop.height;

	b.inGroup("BigTop", () => {
		// Sawdust floor and the performance ring.
		b.part({
			name: "SawdustFloor",
			shape: "cyl",
			pos: [cx, 0.12, cz],
			size: [0.24, R * 2, R * 2],
			rot: [0, 0, 90],
			color: [92, 76, 52],
			material: MATERIAL.sand,
		});
		b.neonHoop([cx, 0.9, cz], 22, 1.6, PAINT.canvasRed, 40, { name: "RingCurb" });

		// Canvas walls with a gap for the entrance.
		const wallSegments = 32;
		for (let i = 0; i < wallSegments; i++) {
			const a0 = ((Math.PI * 2) / wallSegments) * i;
			const a1 = ((Math.PI * 2) / wallSegments) * (i + 1);
			// Leave the south-east arc open as the entrance.
			const deg = (a0 * 180) / Math.PI;
			if (deg > 55 && deg < 100) continue;
			const p0 = [cx + Math.cos(a0) * R, 0, cz + Math.sin(a0) * R];
			const p1 = [cx + Math.cos(a1) * R, 0, cz + Math.sin(a1) * R];
			const mid = [(p0[0] + p1[0]) / 2, 13, (p0[2] + p1[2]) / 2];
			b.box({
				name: "TentWall",
				pos: mid,
				size: [Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) + 0.5, 26, 0.7],
				rot: [0, (-(a0 + a1) / 2 / Math.PI) * 180 + 90, 0],
				color: i % 2 === 0 ? PAINT.canvasRed : PAINT.canvasCream,
				material: MATERIAL.fabric,
			});
		}

		// Roof: two tiers of striped panels plus the crown.
		b.coneRoof([cx, 26, cz], R + 3, H - 26, 26, [PAINT.canvasRed, PAINT.canvasCream], {
			name: "TentRoof",
			thickness: 0.7,
			rings: 4,
		});
		b.coneRoof([cx, H - 4, cz], 12, 12, 16, [PAINT.canvasRed, PAINT.canvasCream], {
			name: "TentCrown",
			thickness: 0.5,
		});

		// Neon piping down every other roof seam, plus floods on the ground
		// aimed up the canvas. Without these the tent is a black hole at night.
		const seams = 7;
		for (let i = 0; i < seams; i++) {
			const a = ((Math.PI * 2) / seams) * i;
			const baseP = [cx + Math.cos(a) * (R + 3.4), 26.4, cz + Math.sin(a) * (R + 3.4)];
			const apex = [cx, H - 4, cz];
			b.tube(baseP, apex, 0.5, {
				name: "RoofPiping",
				color: NEON.amber,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		}
		b.neonHoop([cx, 26.6, cz], R + 3.2, 1.1, NEON.amber, 48, { name: "EaveNeon" });

		b.ring([cx, 0, cz], R + 20, 8, (pos, deg, i) => {
			b.box({
				name: "TentFloodBase",
				pos: [pos[0], 1.6, pos[2]],
				size: [3.4, 3.2, 3.4],
				rot: [0, -deg, 0],
				color: PAINT.iron,
				material: MATERIAL.metal,
			});
			b.light({
				pos: [pos[0] + (cx - pos[0]) * 0.28, 16, pos[2] + (cz - pos[2]) * 0.28],
				color: i % 3 === 0 ? [255, 216, 176] : [255, 236, 214],
				range: 78,
				brightness: 2.1,
				flicker: i === 5 ? 0.25 : undefined,
			});
		});

		// Centre pole and rigging.
		b.tube([cx, 0, cz], [cx, H + 12, cz], 3, {
			name: "CentrePole",
			color: PAINT.wood ?? PAINT.rust,
			material: MATERIAL.wood,
		});
		for (const flagI of [0, 1, 2]) {
			b.box({
				name: "Pennant",
				pos: [cx + 4 + flagI * 0.2, H + 9 - flagI * 2.4, cz],
				size: [8, 2.2, 0.2],
				rot: [0, 0, -6 + flagI * 4],
				color: NEON_ORDER[flagI % NEON_ORDER.length],
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		}

		// Guy ropes.
		b.ring([cx, 0, cz], R + 14, 10, (pos) => {
			b.tube([cx, H - 12, cz], [pos[0], 0.4, pos[2]], 0.3, {
				name: "GuyRope",
				color: [58, 46, 36],
				material: MATERIAL.fabric,
				canCollide: false,
				castShadow: false,
			});
			b.box({
				name: "TentStake",
				pos: [pos[0], 0.8, pos[2]],
				size: [0.7, 1.8, 0.7],
				color: PAINT.iron,
				material: MATERIAL.metal,
				canCollide: false,
			});
		});

		// Rigging: trapeze, safety net, spotlights.
		b.tube([cx - 26, 44, cz], [cx + 26, 44, cz], 0.6, {
			name: "TrapezeRail",
			color: PAINT.iron,
			material: MATERIAL.metal,
			canCollide: false,
		});
		for (const tx of [-14, 14]) {
			b.tube([cx + tx, 44, cz], [cx + tx, 34, cz], 0.25, {
				name: "TrapezeRope",
				color: [70, 60, 48],
				material: MATERIAL.fabric,
				canCollide: false,
			});
			b.box({
				name: "TrapezeBar",
				pos: [cx + tx, 33.6, cz],
				size: [5, 0.4, 0.4],
				color: PAINT.brass,
				material: MATERIAL.metal,
				canCollide: false,
			});
		}
		for (let gx = -20; gx <= 20; gx += 5) {
			b.tube([cx + gx, 30, cz - 20], [cx + gx, 30, cz + 20], 0.12, {
				name: "SafetyNet",
				color: [78, 70, 58],
				material: MATERIAL.fabric,
				canCollide: false,
				castShadow: false,
				transparency: 0.55,
			});
		}
		b.ring([cx, 0, cz], 30, 6, (pos, deg, i) => {
			b.box({
				name: "RigSpotlight",
				pos: [pos[0], 40, pos[2]],
				size: [3, 3, 3],
				color: PAINT.iron,
				material: MATERIAL.metal,
				canCollide: false,
			});
			b.light({
				pos: [pos[0], 38, pos[2]],
				color: i % 2 === 0 ? NEON.amber : [255, 255, 255],
				range: 55,
				brightness: 1.6,
				flicker: i === 3 ? 0.3 : undefined,
			});
		});

		// Bleachers around the back arc.
		for (let tier = 0; tier < 6; tier++) {
			const rr = 30 + tier * 3.4;
			const yy = 1.5 + tier * 2.1;
			const segs = 26;
			for (let i = 0; i < segs; i++) {
				const a = Math.PI * 0.55 + (Math.PI * 1.35 * i) / segs;
				const p = [cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr];
				b.box({
					name: "BleacherPlank",
					pos: p,
					size: [4.6, 1.6, 3.4],
					rot: [0, (-a * 180) / Math.PI, 0],
					color: tier % 2 === 0 ? PAINT.boardwalk : PAINT.boardwalkDark,
					material: MATERIAL.planks,
				});
			}
		}

		// Entrance flaps and marquee.
		const entA = (78 * Math.PI) / 180;
		const ex = cx + Math.cos(entA) * R;
		const ez = cz + Math.sin(entA) * R;
		b.box({
			name: "TentMarquee",
			pos: [ex + 1, 24, ez + 1],
			size: [30, 8, 1],
			rot: [0, -78 + 90, 0],
			color: [10, 6, 16],
			material: MATERIAL.smooth,
			sign: { text: "THE LAST SHOW", color: NEON.amber, face: "Front", scale: 0.9 },
		});
		b.light({ pos: [ex + 4, 20, ez + 4], color: NEON.amber, range: 40, brightness: 2.4 });

		b.landmark("The Big Top", bigTop.pos, "The last show never let out.");
	});
}
