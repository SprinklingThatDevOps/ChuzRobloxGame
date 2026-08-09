#!/usr/bin/env node
/**
 * Answers a question no other check could: if a player materialises at a spawn
 * point, do they land on something, and is there room for them to stand?
 *
 * Both failures are fatal in Roblox and neither is visible in Studio until it
 * happens to you. A spawn with nothing underneath drops the character past
 * FallenPartsDestroyHeight. A spawn inside a solid part gets the character
 * ejected by the physics solver, which off a floating platform amounts to the
 * same thing.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bodyObstructions, collidableParts, groundBelow } from "./map/collision.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A spawn point is where the soles go. CharacterService lifts the root three
// studs above it, and the root rides three studs above the feet.
export function auditSpawns(mapData) {
	const solids = collidableParts(mapData.parts);
	const results = [];

	for (const [kind, list] of [
		["lobby", mapData.spawns.lobby],
		["round", mapData.spawns.round],
	]) {
		list.forEach((spawn, index) => {
			results.push({
				kind,
				index,
				pos: spawn.pos,
				support: groundBelow(spawn.pos, solids),
				obstructions: bodyObstructions(spawn.pos, solids),
			});
		});
	}
	return results;
}

export function spawnProblems(mapData, { maxDrop = 10 } = {}) {
	const problems = [];
	for (const result of auditSpawns(mapData)) {
		const where = `${result.kind}[${result.index}] at ${JSON.stringify(result.pos)}`;
		if (!result.support) {
			problems.push(`${where} has nothing underneath it — the character falls out of the world`);
		} else if (result.support.drop > maxDrop) {
			problems.push(`${where} is ${result.support.drop.toFixed(1)} studs above ${result.support.part.name}`);
		}
		if (result.obstructions.length > 0) {
			const names = [...new Set(result.obstructions.map((p) => p.name))].join(", ");
			problems.push(`${where} starts inside ${names}`);
		}
	}
	return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const mapData = JSON.parse(readFileSync(resolve(repoRoot, "build/MapData.json"), "utf8"));
	const results = auditSpawns(mapData);
	const problems = spawnProblems(mapData);

	console.log(
		`${results.length} spawns checked (${mapData.spawns.lobby.length} lobby, ${mapData.spawns.round.length} round)`,
	);

	const drops = results.filter((r) => r.support).map((r) => r.support.drop).sort((a, b) => a - b);
	if (drops.length > 0) {
		console.log(
			`drop to ground: min ${drops[0].toFixed(2)}  median ${drops[Math.floor(drops.length / 2)].toFixed(2)}  max ${drops[drops.length - 1].toFixed(2)}`,
		);
	}
	console.log("");

	if (problems.length === 0) {
		console.log("  every spawn is clear and has ground beneath it");
	} else {
		for (const problem of problems) console.log(`  PROBLEM  ${problem}`);
		process.exitCode = 1;
	}
}
