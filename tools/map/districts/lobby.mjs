import { MATERIAL, NEON, NEON_ORDER, PAINT, shade } from "../palette.mjs";
import { LAYOUT } from "../layout.mjs";

/**
 * The Ticket Hall: an island in the void where players wait out intermission.
 * Kept far from the map so nobody can peek at the midway before a round.
 */
export function buildLobby(b, rng) {
	const { lobby } = LAYOUT;
	const [lx, ly, lz] = lobby.pos;
	const R = lobby.radius;

	b.inGroup("Lobby", () => {
		// Stepped octagonal plinth.
		for (let i = 0; i < 3; i++) {
			const r = R - i * 4;
			b.part({
				name: "LobbyPlinth",
				shape: "cyl",
				pos: [lx, ly - 1.5 - i * 2, lz],
				size: [2, r * 2, r * 2],
				rot: [0, 0, 90],
				color: i % 2 === 0 ? PAINT.plum : PAINT.plumDark,
				material: MATERIAL.marble,
			});
		}
		b.part({
			name: "LobbyFloor",
			shape: "cyl",
			pos: [lx, ly - 0.4, lz],
			size: [0.8, R * 2 - 4, R * 2 - 4],
			rot: [0, 0, 90],
			color: [30, 24, 42],
			material: MATERIAL.marble,
			reflectance: 0.4,
		});
		b.neonHoop([lx, ly + 0.2, lz], R - 3, 0.8, NEON.cyan, 56);

		// Inlaid compass star pointing at the carnival.
		for (let i = 0; i < 8; i++) {
			const a = (Math.PI / 4) * i;
			b.box({
				name: "FloorInlay",
				pos: [lx + (Math.cos(a) * (R - 12)) / 2, ly - 0.1, lz + (Math.sin(a) * (R - 12)) / 2],
				size: [R - 12, 0.3, i % 2 === 0 ? 1.6 : 0.7],
				rot: [0, (-a * 180) / Math.PI, 0],
				color: i % 2 === 0 ? NEON.violet : shade(PAINT.plumLight, 0.1),
				material: i % 2 === 0 ? MATERIAL.neon : MATERIAL.marble,
				canCollide: false,
				castShadow: false,
			});
		}

		// Central kiosk carrying the title.
		b.part({
			name: "KioskBase",
			shape: "cyl",
			pos: [lx, ly + 2, lz],
			size: [4, 22, 22],
			rot: [0, 0, 90],
			color: PAINT.plumDark,
			material: MATERIAL.marble,
		});
		b.tube([lx, ly + 4, lz], [lx, ly + 26, lz], 3, {
			name: "KioskMast",
			color: PAINT.brass,
			material: MATERIAL.metal,
		});
		b.coneRoof([lx, ly + 22, lz], 15, 8, 16, [PAINT.canvasRed, PAINT.canvasCream], { name: "KioskCanopy" });
		b.neonHoop([lx, ly + 21.6, lz], 15.2, 0.6, NEON.magenta, 40);
		for (const face of [0, 90, 180, 270]) {
			const rad = (face * Math.PI) / 180;
			b.box({
				name: "LobbyTitleSign",
				pos: [lx + Math.sin(rad) * 6.4, ly + 12, lz + Math.cos(rad) * 6.4],
				size: [12, 8, 0.5],
				rot: [0, face, 0],
				color: [8, 5, 14],
				material: MATERIAL.smooth,
				sign: { text: "HOLLOW\nCARNIVAL", color: NEON.magenta, face: "Front", scale: 0.9 },
				canCollide: false,
			});
		}
		b.light({ pos: [lx, ly + 18, lz], color: NEON.magenta, range: 90, brightness: 3, survivesBlackout: true });

		// Ring of spawn pads, each with its own lamp.
		const padCount = 12;
		for (let i = 0; i < padCount; i++) {
			const a = ((Math.PI * 2) / padCount) * i;
			const px = lx + Math.cos(a) * (R - 16);
			const pz = lz + Math.sin(a) * (R - 16);
			const yawToCentre = (Math.atan2(lx - px, lz - pz) * 180) / Math.PI;
			const color = NEON_ORDER[i % NEON_ORDER.length];
			b.part({
				name: "SpawnPad",
				shape: "cyl",
				pos: [px, ly + 0.3, pz],
				size: [0.6, 7, 7],
				rot: [0, 0, 90],
				color,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
			b.light({ pos: [px, ly + 2, pz], color, range: 16, brightness: 1.4, survivesBlackout: true });
			b.lobbySpawn([px, ly + 3, pz], yawToCentre);

			// Rope stanchions between pads.
			b.tube([px, ly, pz], [px, ly + 3.4, pz], 0.5, {
				name: "Stanchion",
				color: PAINT.brass,
				material: MATERIAL.metal,
				canCollide: false,
			});
		}

		// Perimeter railing so nobody walks into the void by accident.
		b.ring([lx, 0, lz], R - 2, 40, (pos) => {
			b.tube([pos[0], ly, pos[2]], [pos[0], ly + 4, pos[2]], 0.4, {
				name: "LobbyRailPost",
				color: PAINT.brass,
				material: MATERIAL.metal,
			});
		});
		b.neonHoop([lx, ly + 4.2, lz], R - 2, 0.5, NEON.violet, 56);
		b.part({
			name: "LobbyBarrier",
			shape: "cyl",
			pos: [lx, ly + 14, lz],
			size: [28, R * 2 - 2, R * 2 - 2],
			rot: [0, 0, 90],
			color: [255, 255, 255],
			material: MATERIAL.smooth,
			transparency: 1,
			castShadow: false,
			tags: ["Barrier"],
		});

		// Benches facing the middle.
		b.ring([lx, 0, lz], R - 30, 6, (pos, deg) => {
			b.box({
				name: "LobbyBench",
				pos: [pos[0], ly + 1.6, pos[2]],
				size: [9, 0.6, 2.6],
				rot: [0, -deg + 90, 0],
				color: PAINT.boardwalk,
				material: MATERIAL.planks,
			});
			b.box({
				name: "LobbyBenchBack",
				pos: [pos[0] + Math.cos((deg * Math.PI) / 180) * 1.2, ly + 3, pos[2] + Math.sin((deg * Math.PI) / 180) * 1.2],
				size: [9, 2.6, 0.4],
				rot: [0, -deg + 90, -10],
				color: PAINT.boardwalk,
				material: MATERIAL.planks,
			});
		});

		// Distant silhouette of the park, floating in the fog.
		const farZ = lz - 620;
		b.inGroup("LobbyVista", () => {
			const wheelY = ly + 40;
			const segs = 28;
			for (let i = 0; i < segs; i++) {
				const a0 = ((Math.PI * 2) / segs) * i;
				const a1 = ((Math.PI * 2) / segs) * (i + 1);
				b.tube(
					[lx + Math.cos(a0) * 70, wheelY + Math.sin(a0) * 70, farZ],
					[lx + Math.cos(a1) * 70, wheelY + Math.sin(a1) * 70, farZ],
					1.6,
					{
						name: "VistaWheel",
						color: NEON_ORDER[i % NEON_ORDER.length],
						material: MATERIAL.neon,
						transparency: 0.45,
						canCollide: false,
						castShadow: false,
					},
				);
			}
			for (let i = 0; i < 14; i++) {
				const a = ((Math.PI * 2) / 14) * i;
				b.tube([lx, wheelY, farZ], [lx + Math.cos(a) * 70, wheelY + Math.sin(a) * 70, farZ], 0.6, {
					name: "VistaSpoke",
					color: PAINT.plumLight,
					material: MATERIAL.neon,
					transparency: 0.7,
					canCollide: false,
					castShadow: false,
				});
			}
			b.coneRoof([lx - 150, ly - 10, farZ + 40], 60, 70, 18, [shade(PAINT.canvasRed, -0.5), shade(PAINT.canvasCream, -0.6)], {
				name: "VistaTent",
				canCollide: false,
			});
		});
	});

	b.landmark("The Ticket Hall", lobby.pos, "Where you wait, and are counted.");
}
