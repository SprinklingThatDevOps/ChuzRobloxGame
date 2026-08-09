#!/usr/bin/env node
/**
 * Plays the shipped rules against the shipped map, headlessly.
 *
 * Two modes:
 *   (default)    sample many seeds and report how rounds tend to end. This is
 *                the balance dial: if one side wins every time, the numbers in
 *                GameConfig.json are wrong.
 *   --timeline   replay the exact seed the previsualizer uses and print when
 *                each beat lands, so the demo capture can be sized to contain
 *                a whole round rather than cutting away mid-chase.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NavMesh } from "../web/src/sim/nav.js";
import { RoundSim } from "../web/src/sim/round.js";
import { Phase } from "../web/src/sim/rules.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(repoRoot, "config/GameConfig.json"), "utf8"));
const mapData = JSON.parse(readFileSync(resolve(repoRoot, "build/MapData.json"), "utf8"));

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value = "true"] = arg.replace(/^--/, "").split("=");
		return [key, value];
	}),
);

// Matches web/src/main.js so a timeline replay is frame-accurate.
const PREVIZ_SEED = 0xc0ffee;
const PREVIZ_STEP = 1 / 60;
const PREVIZ_BOTS = 12;

function mulberry32(seed) {
	let a = seed >>> 0;
	return function random() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function lcg(seed) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

function makeSim(random, botCount, onEvent) {
	return new RoundSim({
		config,
		mapData,
		nav: new NavMesh(mapData.nav),
		random,
		botCount,
		onEvent,
	});
}

function budgetSeconds() {
	const { intermissionSeconds, graceSeconds, roundSeconds, postRoundSeconds } = config.round;
	return intermissionSeconds + graceSeconds + roundSeconds + postRoundSeconds + 20;
}

function timeline() {
	const beats = [];
	let elapsed = 0;
	const sim = makeSim(mulberry32(PREVIZ_SEED), PREVIZ_BOTS, (event) => {
		beats.push({ at: elapsed, event });
	});

	let roundStartedAt = null;
	let postRoundAt = null;
	const budget = budgetSeconds();

	while (elapsed < budget) {
		sim.update(PREVIZ_STEP);
		elapsed += PREVIZ_STEP;
		if (roundStartedAt === null && sim.phase === Phase.Round) roundStartedAt = elapsed;
		if (postRoundAt === null && sim.phase === Phase.PostRound) postRoundAt = elapsed;
	}

	const speed = Number(args.speed ?? 3);
	console.log(`previsualizer seed 0x${PREVIZ_SEED.toString(16)}, ${PREVIZ_BOTS} bots`);
	console.log("");
	for (const beat of beats) {
		const { at, event } = beat;
		const label = event.kind === "phase" ? `phase ${event.phase}` : event.kind;
		const detail = event.message ?? [event.killer, event.victim].filter(Boolean).join(" -> ");
		console.log(`  ${at.toFixed(1).padStart(6)}s sim  ${(at / speed).toFixed(1).padStart(5)}s video  ${label}  ${detail}`);
	}
	console.log("");
	console.log(`round begins   ${roundStartedAt?.toFixed(1)}s sim`);
	console.log(`round resolves ${postRoundAt?.toFixed(1) ?? "never"}s sim  (${sim.outcome})`);
	if (postRoundAt !== null) {
		const end = postRoundAt + config.round.postRoundSeconds;
		console.log("");
		console.log(`at speed ${speed}, a capture covering the whole round needs:`);
		console.log(`  --warmup=0 --seconds=${Math.ceil(end / speed)}`);
		console.log(`  or, skipping most of the intermission,`);
		console.log(
			`  --warmup=${(Math.max(0, roundStartedAt - 6) / speed).toFixed(1)} --seconds=${Math.ceil((end - Math.max(0, roundStartedAt - 6)) / speed)}`,
		);
	}
}

function distribution() {
	const botCount = Number(args.bots ?? 12);
	const samples = Number(args.samples ?? 40);
	const step = 1 / 20;
	const rows = [];

	for (let seed = 1; seed <= samples; seed++) {
		const sim = makeSim(lcg(seed), botCount);
		let elapsed = 0;
		let roundStartedAt = null;
		let endedAt = null;
		const budget = budgetSeconds();

		while (elapsed < budget) {
			sim.update(step);
			elapsed += step;
			if (roundStartedAt === null && sim.phase === Phase.Round) roundStartedAt = elapsed;
			if (sim.phase === Phase.PostRound) {
				endedAt = elapsed;
				break;
			}
		}
		rows.push({
			seed,
			length: endedAt === null ? Infinity : endedAt - roundStartedAt,
			outcome: endedAt === null ? "unresolved" : sim.outcome,
		});
	}

	const lengths = rows.map((row) => row.length).sort((a, b) => a - b);
	const at = (q) => lengths[Math.min(lengths.length - 1, Math.floor(q * lengths.length))];
	const outcomes = {};
	for (const row of rows) outcomes[row.outcome] = (outcomes[row.outcome] ?? 0) + 1;

	console.log(`${samples} rounds, ${botCount} bots each`);
	console.log(`round length  p10 ${at(0.1).toFixed(0)}s   median ${at(0.5).toFixed(0)}s   p90 ${at(0.9).toFixed(0)}s`);
	for (const [outcome, count] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${outcome.padEnd(14)} ${String(count).padStart(3)}  ${((count / samples) * 100).toFixed(0)}%`);
	}
}

if (args.timeline) timeline();
else distribution();
