import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT } from "../layout.mjs";

/** The gate you can never quite remember walking through. */
export function buildEntrance(b, rng) {
	const { entrance } = LAYOUT;
	const [ex, , ez] = entrance.pos;
	const half = entrance.width / 2;

	b.inGroup("Entrance", () => {
		for (const side of [-1, 1]) {
			const px = ex + side * half;

			b.box({
				name: "ArchPylon",
				pos: [px, 15, ez],
				size: [9, 30, 9],
				color: PAINT.plum,
				material: MATERIAL.brick,
			});
			b.box({
				name: "ArchPylonCap",
				pos: [px, 30.8, ez],
				size: [11, 1.6, 11],
				color: PAINT.plumLight,
				material: MATERIAL.slate,
			});

			// Vertical bulb runs up each pylon.
			for (let i = 0; i < 9; i++) {
				const y = 4 + i * 3;
				for (const face of [-1, 1]) {
					b.bulb([px, y, ez + face * 4.8], NEON.amber, 0.42, {
						range: 13,
						brightness: 1.1,
						flicker: rng.bool(0.25) ? rng.float(0.05, 0.25) : undefined,
					});
				}
			}

			b.box({
				name: "TicketWindow",
				pos: [px + side * 8, 5.5, ez],
				size: [8, 11, 12],
				color: PAINT.plumDark,
				material: MATERIAL.wood,
			});
			b.box({
				name: "TicketGlass",
				pos: [px + side * 8, 6.5, ez + 6.1],
				size: [6, 5, 0.3],
				color: [140, 190, 200],
				material: MATERIAL.glass,
				transparency: 0.62,
				reflectance: 0.3,
			});
			b.box({
				name: "TicketAwning",
				pos: [px + side * 8, 11.6, ez + 3],
				size: [9, 0.5, 8],
				rot: [12, 0, 0],
				color: side > 0 ? PAINT.canvasRed : PAINT.canvasTeal,
				material: MATERIAL.fabric,
			});
			b.light({ pos: [px + side * 8, 10.2, ez + 7], color: NEON.amber, range: 22, brightness: 2.1 });
		}

		// The arch itself: a stepped Art Deco crown carrying the park's name.
		b.box({
			name: "ArchSpan",
			pos: [ex, 32, ez],
			size: [entrance.width + 18, 5, 7],
			color: PAINT.plum,
			material: MATERIAL.slate,
		});
		b.box({
			name: "ArchCrown",
			pos: [ex, 36, ez],
			size: [entrance.width + 4, 4, 6],
			color: PAINT.plumLight,
			material: MATERIAL.slate,
		});
		b.box({
			name: "ArchFinial",
			pos: [ex, 39.4, ez],
			size: [12, 3.4, 5],
			color: PAINT.plumLight,
			material: MATERIAL.slate,
		});

		b.box({
			name: "ParkSign",
			pos: [ex, 32.2, ez - 3.7],
			size: [entrance.width + 10, 6.4, 0.4],
			color: [8, 5, 14],
			material: MATERIAL.smooth,
			sign: { text: "HOLLOW CARNIVAL", color: NEON.magenta, face: "Back", scale: 1 },
			canCollide: false,
		});
		b.box({
			name: "ParkSignFront",
			pos: [ex, 32.2, ez + 3.7],
			size: [entrance.width + 10, 6.4, 0.4],
			color: [8, 5, 14],
			material: MATERIAL.smooth,
			sign: { text: "HOLLOW CARNIVAL", color: NEON.magenta, face: "Front", scale: 1 },
			canCollide: false,
		});

		// Neon tube outlining the crown.
		for (const face of [-1, 1]) {
			b.box({
				name: "ArchNeon",
				pos: [ex, 35.4, ez + face * 3.2],
				size: [entrance.width + 12, 0.5, 0.5],
				color: NEON.magenta,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
			b.box({
				name: "ArchNeon",
				pos: [ex, 29.2, ez + face * 3.7],
				size: [entrance.width + 16, 0.5, 0.5],
				color: NEON.cyan,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		}
		b.light({ pos: [ex, 30, ez], color: NEON.magenta, range: 60, brightness: 3, shadows: true });

		// "PLEASE ENJOY YOURSELF" board, hung crooked.
		b.box({
			name: "WelcomeBoard",
			pos: [ex - 34, 13, ez - 12],
			size: [22, 5, 0.6],
			rot: [0, 18, -6],
			color: PAINT.bone,
			material: MATERIAL.wood,
			sign: { text: "PLEASE ENJOY YOURSELF", color: [40, 20, 30], face: "Back", scale: 0.75 },
		});

		// Turnstiles.
		for (let i = -1; i <= 1; i++) {
			const tx = ex + i * 11;
			b.box({
				name: "TurnstileBase",
				pos: [tx, 1.6, ez - 12],
				size: [3, 3.2, 3],
				color: PAINT.iron,
				material: MATERIAL.metal,
			});
			for (let arm = 0; arm < 3; arm++) {
				const a = (arm / 3) * Math.PI * 2 + rng.float(0, 1);
				b.tube(
					[tx, 3.2, ez - 12],
					[tx + Math.cos(a) * 4.2, 3.2, ez - 12 + Math.sin(a) * 4.2],
					0.45,
					{ name: "TurnstileArm", color: PAINT.ironLight, material: MATERIAL.metal },
				);
			}
		}
	});
}

/** The Hollow Hour Clock: stopped at 3:33, ringed in cold neon. */
export function buildClockTower(b, rng) {
	const { clockTower } = LAYOUT;
	const [cx, , cz] = clockTower.pos;
	const h = clockTower.height;

	b.inGroup("ClockTower", () => {
		// Stepped base.
		for (let i = 0; i < 4; i++) {
			const r = clockTower.baseRadius + 9 - i * 2.4;
			b.part({
				name: "TowerStep",
				shape: "cyl",
				pos: [cx, 0.6 + i * 1.2, cz],
				size: [1.2, r * 2, r * 2],
				rot: [0, 0, 90],
				color: i % 2 === 0 ? PAINT.plum : PAINT.plumDark,
				material: MATERIAL.marble,
			});
		}

		// Shaft with tapering segments.
		const segments = 6;
		for (let i = 0; i < segments; i++) {
			const t = i / segments;
			const r = clockTower.baseRadius * (1 - t * 0.35);
			const segH = (h - 18) / segments;
			b.part({
				name: "TowerShaft",
				shape: "cyl",
				pos: [cx, 5 + segH * (i + 0.5), cz],
				size: [segH, r * 2, r * 2],
				rot: [0, 0, 90],
				color: shade(PAINT.plum, -0.12 + t * 0.2),
				material: MATERIAL.concrete,
			});
			// Deco fluting.
			b.ring([cx, 0, cz], r + 0.3, 8, (pos) => {
				b.box({
					name: "TowerFlute",
					pos: [pos[0], 5 + segH * (i + 0.5), pos[2]],
					size: [0.8, segH - 0.6, 0.8],
					color: PAINT.plumLight,
					material: MATERIAL.concrete,
					canCollide: false,
				});
			});
			if (i % 2 === 1) {
				b.neonHoop([cx, 5 + segH * (i + 1), cz], r + 1.1, 0.5, NEON_ORDER[i % NEON_ORDER.length], 28);
			}
		}

		// Clock faces on all four sides, hands frozen at 3:33.
		const faceY = h - 11;
		const dirs = [
			[0, 1],
			[0, -1],
			[1, 0],
			[-1, 0],
		];
		for (const [dx, dz] of dirs) {
			const fx = cx + dx * 7.4;
			const fz = cz + dz * 7.4;
			const yaw = dx !== 0 ? 90 : 0;
			b.part({
				name: "ClockFace",
				shape: "cyl",
				pos: [fx, faceY, fz],
				size: [0.8, 15, 15],
				rot: [0, yaw, 0],
				color: PAINT.bone,
				material: MATERIAL.marble,
			});
			b.part({
				name: "ClockRim",
				shape: "cyl",
				pos: [fx + dx * 0.3, faceY, fz + dz * 0.3],
				size: [0.5, 16.6, 16.6],
				rot: [0, yaw, 0],
				color: NEON.cyan,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
			// Hour ticks.
			for (let i = 0; i < 12; i++) {
				const a = (i / 12) * Math.PI * 2;
				const tickR = 6.2;
				b.box({
					name: "ClockTick",
					pos: [fx + dx * 0.55 + (dz !== 0 ? Math.cos(a) * tickR : 0), faceY + Math.sin(a) * tickR, fz + dz * 0.55 + (dx !== 0 ? Math.cos(a) * tickR : 0)],
					size: dx !== 0 ? [0.3, 1.2, 0.8] : [0.8, 1.2, 0.3],
					rot: [0, 0, (a * 180) / Math.PI],
					color: [30, 20, 40],
					material: MATERIAL.smooth,
					canCollide: false,
				});
			}
			// 3:33 -- hour hand right, minute hand down-left.
			const hands = [
				{ len: 4.2, angleDeg: 0, width: 0.7 },
				{ len: 6.0, angleDeg: -160, width: 0.5 },
			];
			for (const hand of hands) {
				const a = (hand.angleDeg * Math.PI) / 180;
				const mx = (Math.cos(a) * hand.len) / 2;
				const my = (Math.sin(a) * hand.len) / 2;
				b.box({
					name: "ClockHand",
					pos: [fx + dx * 0.7 + (dz !== 0 ? mx : 0), faceY + my, fz + dz * 0.7 + (dx !== 0 ? mx : 0)],
					size: dx !== 0 ? [0.25, hand.width, hand.len] : [hand.len, hand.width, 0.25],
					rot: [0, 0, hand.angleDeg],
					color: [20, 10, 28],
					material: MATERIAL.smooth,
					canCollide: false,
				});
			}
		}

		// Beacon on top -- the one light that never dies.
		b.part({
			name: "TowerCap",
			shape: "cyl",
			pos: [cx, h - 2.5, cz],
			size: [3, 14, 14],
			rot: [0, 0, 90],
			color: PAINT.plumLight,
			material: MATERIAL.slate,
		});
		b.sphere({
			name: "Beacon",
			pos: [cx, h + 2.4, cz],
			size: [6, 6, 6],
			color: NEON.magenta,
			material: MATERIAL.neon,
			castShadow: false,
		});
		b.light({
			pos: [cx, h + 2.4, cz],
			color: NEON.magenta,
			range: 120,
			brightness: 3.4,
			survivesBlackout: true,
			flicker: 0.04,
		});

		// Guy wires strung with bulbs, radiating out to the midway.
		b.ring([cx, 0, cz], 44, 8, (pos, angleDeg) => {
			b.tube([cx, h - 6, cz], [pos[0], 16, pos[2]], 0.22, {
				name: "GuyWire",
				color: PAINT.iron,
				material: MATERIAL.metal,
				canCollide: false,
				castShadow: false,
			});
			const bulbCount = 7;
			for (let i = 1; i <= bulbCount; i++) {
				const t = i / (bulbCount + 1);
				const bx = cx + (pos[0] - cx) * t;
				const bz = cz + (pos[2] - cz) * t;
				const by = h - 6 + (16 - (h - 6)) * t - Math.sin(t * Math.PI) * 2.5;
				b.bulb([bx, by, bz], NEON_ORDER[(i + Math.round(angleDeg)) % NEON_ORDER.length], 0.36, {
					range: 12,
					brightness: 0.9,
					light: i % 2 === 0,
				});
			}
			// Lamp post where the wire lands.
			b.tube([pos[0], 0, pos[2]], [pos[0], 16, pos[2]], 0.9, {
				name: "LampPost",
				color: PAINT.iron,
				material: MATERIAL.corroded,
			});
		});

		b.landmark("The Hollow Hour Clock", [cx, 0, cz], "Stopped at 3:33. Nobody agrees on which 3:33.");
	});
}
