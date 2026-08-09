/**
 * Parity between the two copies of the rulebook.
 *
 * src/shared/RoundLogic.luau is what players actually experience;
 * web/src/sim/rules.js is what the previsualizer demos. If they drift, the
 * demo stops being evidence about the game — so this test runs the Luau
 * implementation through Lune and asserts the JavaScript one agrees on every
 * lobby size, every cooldown pattern and every end-of-round state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	assignRoles,
	blackoutSchedule,
	countMurderers,
	countSheriffs,
	evaluateOutcome,
	nextPhase,
	phaseDuration,
} from "../web/src/sim/rules.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(repoRoot, "config/GameConfig.json"), "utf8"));

/** Must match the generator in tests/tools/dump-rules.luau exactly. */
function seeded(seed) {
	let value = seed;
	return () => {
		value = (value * 1103515245 + 12345) % 2147483648;
		return value / 2147483648;
	};
}

function luauResults() {
	const stdout = execFileSync("lune", ["run", "tests/tools/dump-rules"], {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	return JSON.parse(stdout);
}

const luau = luauResults();

test("role counts agree for every lobby size", () => {
	for (const row of luau.counts) {
		assert.equal(countMurderers(config, row.players), row.murderers, `murderers at ${row.players} players`);
		assert.equal(countSheriffs(config, row.players), row.sheriffs, `sheriffs at ${row.players} players`);
	}
});

test("role draws agree, cooldown weighting included", () => {
	for (const row of luau.assignments) {
		const players = [];
		for (let index = 1; index <= row.players; index++) {
			let cooldown = 0;
			if (row.pattern === "alternating") cooldown = index % 3;
			else if (row.pattern === "mostly-cooling") cooldown = index <= row.players - 2 ? 2 : 0;
			players.push({ id: index, roleCooldown: cooldown });
		}

		const assignment = assignRoles(config, players, seeded(row.players * 31 + row.pattern.length));
		const roles = players.map((player) => assignment.get(player.id));
		assert.deepEqual(roles, row.roles, `${row.players} players, ${row.pattern}`);
	}
});

test("win conditions agree for every combination of two players", () => {
	for (const row of luau.outcomes) {
		const actual = evaluateOutcome(row.states, row.secondsLeft);
		assert.equal(
			actual,
			row.outcome,
			`${row.states.map((s) => `${s.role}:${s.alive ? "alive" : "dead"}`).join(" ")} @${row.secondsLeft}s`,
		);
	}
});

test("phase durations and ordering agree", () => {
	for (const row of luau.phases) {
		assert.equal(phaseDuration(config, row.phase), row.duration, `${row.phase} duration`);
		assert.equal(nextPhase(row.phase), row.next, `${row.phase} successor`);
	}
});

test("blackout timetables agree to the second", () => {
	const js = blackoutSchedule(config);
	assert.equal(js.length, luau.blackout.length, "different number of blackouts");
	for (const [index, event] of js.entries()) {
		assert.equal(event.warnAt, luau.blackout[index].warnAt, `blackout ${index} warning`);
		assert.equal(event.startAt, luau.blackout[index].startAt, `blackout ${index} start`);
		assert.equal(event.endAt, luau.blackout[index].endAt, `blackout ${index} end`);
	}
});
