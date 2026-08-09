/**
 * Spawn points have to be standable.
 *
 * This exists because of a bug that made the game unplayable and was invisible
 * everywhere except in Studio: the lobby's "invisible barrier" was authored as
 * a solid cylinder rather than a wall, so all twelve lobby spawns were inside
 * it. Roblox ejects a character embedded in an anchored part, which threw
 * players off the floating platform, and with no ground under the lobby they
 * fell until FallenPartsDestroyHeight deleted them. Every player, every join.
 *
 * The map tests validated bounds, reachability and light budgets, and passed
 * throughout. None of them asked whether a body fits where a player appears.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bodyObstructions, collidableParts, containsPoint, groundBelow } from "../tools/map/collision.mjs";
import { spawnProblems } from "../tools/check-spawns.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mapData = JSON.parse(readFileSync(resolve(repoRoot, "build/MapData.json"), "utf8"));

test("no spawn is buried in the scenery or hanging over a drop", () => {
	const problems = spawnProblems(mapData);
	assert.deepEqual(problems, [], `\n  ${problems.join("\n  ")}\n`);
});

test("every spawn stands on ground close enough to walk off", () => {
	const solids = collidableParts(mapData.parts);
	for (const kind of ["lobby", "round"]) {
		for (const spawn of mapData.spawns[kind]) {
			const support = groundBelow(spawn.pos, solids);
			assert.ok(support, `${kind} spawn ${JSON.stringify(spawn.pos)} has no floor under it`);
			assert.ok(
				support.drop <= 6,
				`${kind} spawn ${JSON.stringify(spawn.pos)} is ${support.drop.toFixed(1)} studs up; players would spend the drop falling`,
			);
		}
	}
});

test("the lobby barrier walls the rim without filling the floor", () => {
	const barrier = mapData.parts.filter((part) => part.name === "LobbyBarrier");
	assert.ok(barrier.length > 0, "the lobby has no barrier; players can walk into the void");

	const lobby = mapData.spawns.lobby;
	const centre = [
		lobby.reduce((sum, s) => sum + s.pos[0], 0) / lobby.length,
		lobby[0].pos[1],
		lobby.reduce((sum, s) => sum + s.pos[2], 0) / lobby.length,
	];

	// Standing in the middle of the hall must be legal, and walking off the
	// edge must not be. A solid cylinder passes the second test and fails the
	// first, which is exactly the bug this guards.
	for (const part of barrier) {
		assert.ok(
			!containsPoint([centre[0], centre[1] + 1, centre[2]], part),
			"the barrier is a solid volume, not a wall: the middle of the lobby is inside it",
		);
	}

	const beyondEdge = [centre[0] + 52, centre[1] + 1, centre[2]];
	assert.ok(
		barrier.some((part) => containsPoint(beyondEdge, part)),
		"nothing blocks the lobby rim; a player can run straight off the platform",
	);
});

test("nothing solid overlaps a lobby spawn pad", () => {
	const solids = collidableParts(mapData.parts);
	for (const spawn of mapData.spawns.lobby) {
		const hits = bodyObstructions(spawn.pos, solids);
		assert.deepEqual(
			hits.map((p) => p.name),
			[],
			`lobby spawn ${JSON.stringify(spawn.pos)} is inside scenery`,
		);
	}
});
