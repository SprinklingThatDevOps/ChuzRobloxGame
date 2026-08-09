#!/usr/bin/env node
/**
 * Generates build/MapData.json -- the single source of truth for the Hollow
 * Carnival map. The Roblox server builds the place from it at runtime and the
 * browser previsualizer renders the exact same document, so what you demo is
 * what you play.
 *
 * Output is deterministic: same generator, same bytes.
 */
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MapBuilder, distanceXZ } from "./map/builder.mjs";
import { makeRng } from "./map/prng.mjs";
import { LAYOUT } from "./map/layout.mjs";
import { buildGround } from "./map/districts/ground.mjs";
import { buildEntrance, buildClockTower } from "./map/districts/entrance.mjs";
import { buildFerrisWheel, buildCarousel, buildBigTop } from "./map/districts/rides.mjs";
import { buildFunhouse } from "./map/districts/funhouse.mjs";
import { buildMidway } from "./map/districts/midway.mjs";
import { buildBumperCars, buildGeneratorYard, buildPier } from "./map/districts/outskirts.mjs";
import { buildLobby } from "./map/districts/lobby.mjs";

const SEED = 0x484f4c4c; // "HOLL"
const NAV_STEP = 14;
const PLAY_HALF = 196;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function main() {
	const rng = makeRng(SEED);
	const b = new MapBuilder();

	buildGround(b, rng);
	buildClockTower(b, rng);
	buildEntrance(b, rng);
	buildMidway(b, rng);
	buildFerrisWheel(b, rng);
	buildCarousel(b, rng);
	buildBigTop(b, rng);
	const maze = buildFunhouse(b, rng);
	buildBumperCars(b, rng);
	buildGeneratorYard(b, rng);
	buildPier(b, rng);
	buildLobby(b, rng);

	registerStaticBlockers(b);
	buildNavGraph(b, maze);
	placeRoundSpawns(b);
	placeCoinSpots(b, rng);

	const doc = {
		$schema: "./MapData.schema.json",
		name: "Hollow Carnival",
		generator: { seed: SEED, navStep: NAV_STEP },
		bounds: { half: PLAY_HALF, groundY: LAYOUT.ground.y },
		landmarks: b.landmarks,
		spawns: b.spawns,
		coinSpots: b.coinSpots,
		nav: b.nav,
		animators: b.animators,
		lights: b.lights,
		parts: b.parts,
	};

	const outPath = resolve(repoRoot, "build/MapData.json");
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, JSON.stringify(doc));

	// The previsualizer reads the identical documents the Roblox build uses.
	const webPath = resolve(repoRoot, "web/public/MapData.json");
	mkdirSync(dirname(webPath), { recursive: true });
	writeFileSync(webPath, JSON.stringify(doc));
	copyFileSync(resolve(repoRoot, "config/GameConfig.json"), resolve(repoRoot, "web/public/GameConfig.json"));

	const stats = b.stats();
	const bytes = JSON.stringify(doc).length;
	console.log("Hollow Carnival map generated");
	for (const [key, value] of Object.entries(stats)) {
		console.log(`  ${key.padEnd(12)} ${value}`);
	}
	console.log(`  ${"size".padEnd(12)} ${(bytes / 1024).toFixed(0)} KiB`);
	console.log(`  -> ${outPath}`);
	console.log(`  -> ${webPath}`);
}

/** Footprints that come straight off the master layout. */
function registerStaticBlockers(b) {
	const L = LAYOUT;
	b.blocker({ type: "circle", center: [0, 0], radius: 17 }); // clock tower
	b.blocker({ type: "circle", center: [L.carousel.pos[0], L.carousel.pos[2]], radius: L.carousel.radius + 3 });
	b.blocker({
		type: "band",
		center: [L.bigTop.pos[0], L.bigTop.pos[2]],
		outer: L.bigTop.radius + 2,
		inner: L.bigTop.radius - 4,
		gap: [55, 100],
	});
	b.blocker({ type: "circle", center: [L.bigTop.pos[0], L.bigTop.pos[2]], radius: 6 }); // centre pole
	b.blocker({ type: "rect", center: [0, L.ferrisWheel.pos[2] + L.ferrisWheel.radius - 4], size: [32, 18] });
	b.blocker({ type: "rect", center: [20, L.ferrisWheel.pos[2] + L.ferrisWheel.radius - 2], size: [12, 12] });
	b.blocker({
		type: "rectBand",
		center: [L.bumperCars.pos[0], L.bumperCars.pos[2]],
		outer: [L.bumperCars.width + 2, L.bumperCars.depth + 2],
		inner: [L.bumperCars.width - 6, L.bumperCars.depth - 6],
	});
	b.blocker({
		type: "rectBand",
		center: [L.generatorYard.pos[0], L.generatorYard.pos[2]],
		outer: [L.generatorYard.width + 2, L.generatorYard.depth + 2],
		inner: [L.generatorYard.width - 6, L.generatorYard.depth - 6],
		gapRect: { center: [L.generatorYard.pos[0], L.generatorYard.pos[2] + L.generatorYard.depth / 2], size: [22, 12] },
	});
	b.blocker({ type: "rect", center: [L.generatorYard.pos[0] + 12, L.generatorYard.pos[2] - 12], size: [36, 28] });
	b.blocker({
		type: "rect",
		center: [L.pier.pos[0], L.pier.pos[2]],
		size: [L.pier.poolWidth + 6, L.pier.poolDepth + 6],
		exclude: { center: [L.pier.pos[0], L.pier.pos[2]], size: [L.pier.poolWidth - 10, 15] },
	});
	b.blocker({ type: "rect", center: [0, LAYOUT.entrance.pos[2]], size: [26, 14] }); // turnstiles + booths
}

function isBlocked(b, x, z, margin = 3) {
	for (const blk of b.blockers) {
		if (blk.type === "circle") {
			if (Math.hypot(x - blk.center[0], z - blk.center[1]) < blk.radius + margin) return true;
		} else if (blk.type === "rect") {
			const inside =
				Math.abs(x - blk.center[0]) < blk.size[0] / 2 + margin &&
				Math.abs(z - blk.center[1]) < blk.size[1] / 2 + margin;
			if (!inside) continue;
			if (blk.exclude) {
				const spared =
					Math.abs(x - blk.exclude.center[0]) < blk.exclude.size[0] / 2 &&
					Math.abs(z - blk.exclude.center[1]) < blk.exclude.size[1] / 2;
				if (spared) continue;
			}
			return true;
		} else if (blk.type === "band") {
			const d = Math.hypot(x - blk.center[0], z - blk.center[1]);
			if (d > blk.inner - margin && d < blk.outer + margin) {
				const deg = (Math.atan2(z - blk.center[1], x - blk.center[0]) * 180) / Math.PI;
				const norm = (deg + 360) % 360;
				if (!(blk.gap && norm > blk.gap[0] && norm < blk.gap[1])) return true;
			}
		} else if (blk.type === "rectBand") {
			const inOuter =
				Math.abs(x - blk.center[0]) < blk.outer[0] / 2 + margin &&
				Math.abs(z - blk.center[1]) < blk.outer[1] / 2 + margin;
			const inInner =
				Math.abs(x - blk.center[0]) < blk.inner[0] / 2 - margin &&
				Math.abs(z - blk.center[1]) < blk.inner[1] / 2 - margin;
			if (inOuter && !inInner) {
				if (blk.gapRect) {
					const spared =
						Math.abs(x - blk.gapRect.center[0]) < blk.gapRect.size[0] / 2 &&
						Math.abs(z - blk.gapRect.center[1]) < blk.gapRect.size[1] / 2;
					if (spared) continue;
				}
				return true;
			}
		}
	}
	return false;
}

/**
 * Coarse walkable grid over the park, stitched to the funhouse maze through
 * its single doorway. Bots in the previsualizer walk this graph, and it is
 * also what spawn and coin placement sample from.
 */
function buildNavGraph(b, maze) {
	const grid = new Map();
	const key = (ix, iz) => `${ix},${iz}`;
	const span = Math.floor(PLAY_HALF / NAV_STEP);

	for (let ix = -span; ix <= span; ix++) {
		for (let iz = -span; iz <= span; iz++) {
			const x = ix * NAV_STEP;
			const z = iz * NAV_STEP;
			if (isBlocked(b, x, z)) continue;
			const index = b.navNode([x, 2.2, z]);
			grid.set(key(ix, iz), index);
		}
	}
	for (let ix = -span; ix <= span; ix++) {
		for (let iz = -span; iz <= span; iz++) {
			const from = grid.get(key(ix, iz));
			if (from === undefined) continue;
			for (const [dx, dz] of [
				[1, 0],
				[0, 1],
			]) {
				const to = grid.get(key(ix + dx, iz + dz));
				if (to === undefined) continue;
				// Reject edges that clip a corner of a footprint.
				const a = b.nav.nodes[from].pos;
				const c = b.nav.nodes[to].pos;
				if (isBlocked(b, (a[0] + c[0]) / 2, (a[2] + c[2]) / 2, 2)) continue;
				b.navEdge(from, to);
			}
		}
	}

	// Splice in the mirror maze.
	const mazeOffset = b.nav.nodes.length;
	for (const cellPos of maze.cells) {
		b.navNode(cellPos, "maze");
	}
	for (const [i, j] of maze.edges) {
		b.navEdge(mazeOffset + i, mazeOffset + j);
	}
	// Link the maze doorway to the nearest outdoor node.
	const doorCellIndex = nearestIndex(maze.cells, maze.door);
	const outdoor = b.nav.nodes.slice(0, mazeOffset);
	const doorOutdoor = nearestIndex(
		outdoor.map((n) => n.pos),
		maze.door,
	);
	if (doorCellIndex >= 0 && doorOutdoor >= 0) {
		b.navEdge(mazeOffset + doorCellIndex, doorOutdoor);
	}
}

function nearestIndex(points, target) {
	let best = -1;
	let bestDist = Infinity;
	for (let i = 0; i < points.length; i++) {
		const d = distanceXZ(points[i], target);
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return best;
}

/**
 * Farthest-point sampling over the nav graph. Spreading spawns as far apart
 * as possible is what stops a round opening with the murderer already inside
 * knife range of half the lobby.
 */
function placeRoundSpawns(b, count = 26) {
	const candidates = b.nav.nodes.filter((n) => n.name !== "maze" && Math.abs(n.pos[0]) < 185 && Math.abs(n.pos[2]) < 185);
	const chosen = farthestPointSample(candidates.map((n) => n.pos), count, [0, 2.2, 120]);
	for (const pos of chosen) {
		const yaw = (Math.atan2(0 - pos[0], 0 - pos[2]) * 180) / Math.PI;
		b.roundSpawn([pos[0], pos[1] + 1.5, pos[2]], yaw);
	}
}

/** Coins live on the walkable graph, biased away from each other. */
function placeCoinSpots(b, rng, count = 96) {
	const nodes = b.nav.nodes.map((n) => n.pos);
	const picks = farthestPointSample(nodes, count, [0, 2.2, 0]);
	for (const pos of picks) {
		b.coinSpot([pos[0] + rng.float(-3, 3), 3, pos[2] + rng.float(-3, 3)]);
	}

	// A handful of hand-placed coins in places worth the risk of going.
	const risky = [
		[0, 8.5, LAYOUT.ferrisWheel.pos[2] + LAYOUT.ferrisWheel.radius - 4],
		[LAYOUT.carousel.pos[0], 6, LAYOUT.carousel.pos[2]],
		[LAYOUT.bigTop.pos[0], 3, LAYOUT.bigTop.pos[2] - 18],
		[LAYOUT.pier.pos[0], 5, LAYOUT.pier.pos[2]],
		[LAYOUT.pier.pos[0] + 40, 5, LAYOUT.pier.pos[2]],
		[LAYOUT.generatorYard.pos[0] + 12, 3, LAYOUT.generatorYard.pos[2] - 12],
		[0, 3, LAYOUT.entrance.pos[2] - 20],
		[LAYOUT.bumperCars.pos[0], 3, LAYOUT.bumperCars.pos[2]],
	];
	for (const pos of risky) b.coinSpot(pos);
}

function farthestPointSample(points, count, seedPoint) {
	if (points.length === 0) return [];
	const chosen = [];
	const dist = points.map((p) => distanceXZ(p, seedPoint));
	let current = dist.indexOf(Math.max(...dist));
	for (let n = 0; n < Math.min(count, points.length); n++) {
		chosen.push(points[current]);
		let best = -1;
		let bestDist = -1;
		for (let i = 0; i < points.length; i++) {
			dist[i] = Math.min(dist[i], distanceXZ(points[i], points[current]));
			if (dist[i] > bestDist) {
				bestDist = dist[i];
				best = i;
			}
		}
		if (best < 0 || bestDist <= 0) break;
		current = best;
	}
	return chosen;
}

main();
