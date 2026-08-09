/**
 * Role maths, expressed once here for the previsualizer and once in
 * src/shared/RoundLogic.luau for the live game. Both read the same
 * GameConfig.json, and tests/rules-parity.test.mjs asserts that the two
 * implementations agree for every player count.
 */

export const Role = {
	Innocent: "Innocent",
	Sheriff: "Sheriff",
	Murderer: "Murderer",
	Hero: "Hero",
	Spectator: "Spectator",
};

export function countMurderers(config, playerCount) {
	const a = config.assignment;
	if (playerCount < config.round.minPlayers) return 0;
	const extra = Math.floor(Math.max(0, playerCount - config.round.minPlayers) / a.murdererPerExtraPlayers);
	return Math.min(a.murdererBaseCount + extra, a.murdererMaxCount);
}

export function countSheriffs(config, playerCount) {
	const a = config.assignment;
	if (playerCount < a.sheriffMinPlayers) return 0;
	const extra = Math.floor(Math.max(0, playerCount - a.sheriffMinPlayers) / a.sheriffPerExtraPlayers);
	return Math.min(a.sheriffBaseCount + extra, a.sheriffMaxCount);
}

/**
 * Weighted draw. Players who held a special role recently sink to the bottom
 * of the pool, which is the difference between "random" and "feels fair".
 */
export function assignRoles(config, players, random) {
	const total = players.length;
	const murderers = countMurderers(config, total);
	const sheriffs = Math.min(countSheriffs(config, total), Math.max(0, total - murderers));

	const pool = players
		.map((player, index) => ({
			player,
			index,
			weight: 1 / (1 + (player.roleCooldown ?? 0)) + random() * 0.001,
		}))
		.sort((a, b) => b.weight - a.weight);

	const assignment = new Map();
	let cursor = 0;
	for (let i = 0; i < murderers && cursor < pool.length; i++, cursor++) {
		assignment.set(pool[cursor].player.id, Role.Murderer);
	}
	for (let i = 0; i < sheriffs && cursor < pool.length; i++, cursor++) {
		assignment.set(pool[cursor].player.id, Role.Sheriff);
	}
	for (; cursor < pool.length; cursor++) {
		assignment.set(pool[cursor].player.id, Role.Innocent);
	}
	return assignment;
}

export const Outcome = {
	None: "None",
	InnocentsWin: "InnocentsWin",
	MurderersWin: "MurderersWin",
	TimeUp: "TimeUp",
};

/**
 * Win check, run after every death and every tick.
 * `states` is a list of { role, alive }.
 */
export function evaluateOutcome(states, secondsLeft) {
	let murderersAlive = 0;
	let othersAlive = 0;
	for (const state of states) {
		if (!state.alive) continue;
		if (state.role === Role.Murderer) murderersAlive++;
		else if (state.role !== Role.Spectator) othersAlive++;
	}
	if (murderersAlive === 0) return Outcome.InnocentsWin;
	if (othersAlive === 0) return Outcome.MurderersWin;
	if (secondsLeft <= 0) return Outcome.TimeUp;
	return Outcome.None;
}

export function payoutFor(config, event) {
	return config.payouts[event] ?? 0;
}

export const Phase = {
	Intermission: "Intermission",
	Grace: "Grace",
	Round: "Round",
	PostRound: "PostRound",
};

export function phaseDuration(config, phase) {
	switch (phase) {
		case Phase.Intermission:
			return config.round.intermissionSeconds;
		case Phase.Grace:
			return config.round.graceSeconds;
		case Phase.Round:
			return config.round.roundSeconds;
		case Phase.PostRound:
			return config.round.postRoundSeconds;
		default:
			return 0;
	}
}

export function nextPhase(phase) {
	switch (phase) {
		case Phase.Intermission:
			return Phase.Grace;
		case Phase.Grace:
			return Phase.Round;
		case Phase.Round:
			return Phase.PostRound;
		default:
			return Phase.Intermission;
	}
}

/** Blackout schedule for a round, derived entirely from config. */
export function blackoutSchedule(config) {
	const b = config.blackout;
	if (!b.enabled) return [];
	const events = [];
	for (let t = b.firstAtRoundSecond; t < config.round.roundSeconds - b.durationSeconds; t += b.intervalSeconds) {
		events.push({ warnAt: t - b.warningSeconds, startAt: t, endAt: t + b.durationSeconds });
	}
	return events;
}
