/**
 * Plays the game, headlessly, many times.
 *
 * The previsualizer's simulation is the closest thing this project has to a
 * playtest without a Roblox client: it uses the shipped rules, the shipped map
 * and the shipped navigation graph. Rounds that never end, murderers that
 * never catch anyone and bots that walk through the hoarding all show up here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NavMesh, distanceXZ } from "../web/src/sim/nav.js";
import { RoundSim } from "../web/src/sim/round.js";
import { Outcome, Phase, Role } from "../web/src/sim/rules.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(repoRoot, "config/GameConfig.json"), "utf8"));
const mapData = JSON.parse(readFileSync(resolve(repoRoot, "build/MapData.json"), "utf8"));

const STEP = 1 / 20;

function seeded(seed) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

/**
 * Runs one round to completion and returns what happened. The step budget is
 * generous but finite: if a round cannot resolve, the test fails rather than
 * hanging the suite.
 */
function playRound(seed, botCount = 12) {
	const random = seeded(seed);
	const nav = new NavMesh(mapData.nav);
	const events = [];
	const sim = new RoundSim({ config, mapData, nav, random, botCount, onEvent: (event) => events.push(event) });

	const trace = { maxOffMesh: 0, outOfBounds: 0, reachedRound: false };
	const budget = Math.ceil(
		(config.round.intermissionSeconds + config.round.graceSeconds + config.round.roundSeconds + 30) / STEP,
	);

	let steps = 0;
	while (steps < budget) {
		sim.update(STEP);
		steps++;

		if (sim.phase === Phase.Round) {
			trace.reachedRound = true;
			for (const bot of sim.bots) {
				if (!bot.alive) continue;
				if (Math.abs(bot.pos[0]) > mapData.bounds.wallHalf || Math.abs(bot.pos[2]) > mapData.bounds.wallHalf) {
					trace.outOfBounds++;
				}
				trace.maxOffMesh = Math.max(trace.maxOffMesh, nav.distanceToGraph(bot.pos[0], bot.pos[2]));
			}
		}

		if (sim.phase === Phase.PostRound) break;
	}

	return { sim, events, steps, budget, trace };
}

test("a round always reaches a decision", () => {
	for (let seed = 1; seed <= 12; seed++) {
		const { sim, steps, budget, trace } = playRound(seed);
		assert.ok(trace.reachedRound, `seed ${seed} never started the round`);
		assert.ok(steps < budget, `seed ${seed} ran out of simulation budget`);
		assert.notEqual(sim.outcome, Outcome.None, `seed ${seed} ended with no outcome`);
		assert.equal(sim.phase, Phase.PostRound, `seed ${seed} ended in ${sim.phase}`);
	}
});

test("both sides can win", () => {
	const seen = new Set();
	for (let seed = 1; seed <= 24; seed++) {
		seen.add(playRound(seed).sim.outcome);
	}
	assert.ok(seen.has(Outcome.InnocentsWin), "the murderer was never caught in 24 rounds");
	assert.ok(seen.has(Outcome.MurderersWin), "the murderer never won in 24 rounds");
});

test("the murderer is a threat but not unstoppable", () => {
	let totalKills = 0;
	let totalBots = 0;
	const rounds = 16;
	for (let seed = 100; seed < 100 + rounds; seed++) {
		const { sim, events } = playRound(seed);
		totalKills += events.filter((event) => event.kind === "kill").length;
		totalBots += sim.bots.length;
	}
	const killRate = totalKills / totalBots;
	assert.ok(killRate > 0.1, `only ${(killRate * 100).toFixed(0)}% of players died; the knife is harmless`);
	assert.ok(killRate < 0.95, `${(killRate * 100).toFixed(0)}% of players died; nobody can survive`);
});

test("bots stay in the park and on the walkable graph", () => {
	for (let seed = 200; seed < 206; seed++) {
		const { trace } = playRound(seed);
		assert.equal(trace.outOfBounds, 0, `seed ${seed} let a bot outside the hoarding`);
		// Bots cut corners between waypoints, so some drift off the graph is
		// expected; walking through a building is not.
		assert.ok(trace.maxOffMesh < 24, `seed ${seed} had a bot ${trace.maxOffMesh.toFixed(1)} studs off the graph`);
	}
});

test("the blackout fires and the lights come back", () => {
	const { events } = playRound(7);
	const starts = events.filter((event) => event.kind === "blackout_start");
	const warnings = events.filter((event) => event.kind === "blackout_warning");
	assert.ok(warnings.length >= starts.length, "a blackout arrived with no warning");
	if (starts.length > 0) {
		const ends = events.filter((event) => event.kind === "blackout_end");
		assert.ok(ends.length >= starts.length - 1, "the lights never came back on");
	}
});

test("coins get collected during a round", () => {
	let collected = 0;
	for (let seed = 300; seed < 306; seed++) {
		collected += playRound(seed).sim.coinsCollected;
	}
	assert.ok(collected > 0, "nobody picked up a single coin across six rounds");
});

test("a dropped revolver can create a hero", () => {
	// Not every round produces one, so this looks across a spread of seeds.
	let heroes = 0;
	for (let seed = 400; seed < 440; seed++) {
		heroes += playRound(seed).events.filter((event) => event.kind === "hero").length;
	}
	assert.ok(heroes > 0, "the revolver was never picked up in 40 rounds; the comeback mechanic is dead");
});

test("shooting an innocent kills the shooter", () => {
	// Drive the rule directly rather than waiting for a bot to misfire.
	const random = seeded(9);
	const nav = new NavMesh(mapData.nav);
	const sim = new RoundSim({ config, mapData, nav, random, botCount: 4 });
	sim.setPhase(Phase.Grace);

	const shooter = sim.bots[0];
	const victim = sim.bots[1];
	shooter.role = Role.Sheriff;
	shooter.alive = true;
	shooter.hasGun = true;
	victim.role = Role.Innocent;
	victim.alive = true;

	sim.killBot(victim, shooter, "revolver");

	assert.equal(victim.alive, false, "the victim survived being shot");
	assert.equal(shooter.alive, false, "the sheriff shot an innocent and lived");
});

test("navigation can path between any two points in the park", () => {
	const nav = new NavMesh(mapData.nav);
	const random = seeded(31);
	for (let attempt = 0; attempt < 200; attempt++) {
		const from = nav.randomNode(random);
		const to = nav.randomNode(random);
		const path = nav.findPath(from, to);
		assert.ok(path.length > 0, `no path from ${from} to ${to}`);
		const end = path[path.length - 1];
		assert.ok(distanceXZ(end, to) < 1, `path ended ${distanceXZ(end, to).toFixed(1)} studs short of the goal`);
	}
});
