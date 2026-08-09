--!strict
--[[
	Pure round rules: how many killers, who gets what, and who has won.

	Nothing in here touches a Roblox service, so the whole file runs unchanged
	under Lune in tests/. The browser previsualizer carries a line-for-line
	twin at web/src/sim/rules.js, and tests/rules-parity.test.mjs asserts the
	two never drift.
]]

local Types = require(script.Parent.Types)

type Role = Types.Role
type Phase = Types.Phase
type Outcome = Types.Outcome

local RoundLogic = {}

RoundLogic.Role = {
	Innocent = "Innocent" :: Role,
	Sheriff = "Sheriff" :: Role,
	Murderer = "Murderer" :: Role,
	Hero = "Hero" :: Role,
	Spectator = "Spectator" :: Role,
}

RoundLogic.Phase = {
	Intermission = "Intermission" :: Phase,
	Grace = "Grace" :: Phase,
	Round = "Round" :: Phase,
	PostRound = "PostRound" :: Phase,
}

RoundLogic.Outcome = {
	None = "None" :: Outcome,
	InnocentsWin = "InnocentsWin" :: Outcome,
	MurderersWin = "MurderersWin" :: Outcome,
	TimeUp = "TimeUp" :: Outcome,
}

function RoundLogic.countMurderers(config: any, playerCount: number): number
	local assignment = config.assignment
	if playerCount < config.round.minPlayers then
		return 0
	end
	local extra = math.floor(math.max(0, playerCount - config.round.minPlayers) / assignment.murdererPerExtraPlayers)
	return math.min(assignment.murdererBaseCount + extra, assignment.murdererMaxCount)
end

function RoundLogic.countSheriffs(config: any, playerCount: number): number
	local assignment = config.assignment
	if playerCount < assignment.sheriffMinPlayers then
		return 0
	end
	local extra = math.floor(math.max(0, playerCount - assignment.sheriffMinPlayers) / assignment.sheriffPerExtraPlayers)
	return math.min(assignment.sheriffBaseCount + extra, assignment.sheriffMaxCount)
end

--[[
	Weighted draw. Anyone who held a special role in the last couple of rounds
	sinks down the pool, so the knife moves around the lobby instead of
	landing on the same unlucky player three rounds running.

	`players` is an array of { id, roleCooldown }. Returns id -> Role.
]]
function RoundLogic.assignRoles(config: any, players: { Types.PlayerSeed }, random: (() -> number)?): { [number]: Role }
	local rng = random or math.random
	local total = #players
	local murderers = RoundLogic.countMurderers(config, total)
	local sheriffs = math.min(RoundLogic.countSheriffs(config, total), math.max(0, total - murderers))

	local pool = table.create(total)
	for index, player in players do
		table.insert(pool, {
			id = player.id,
			order = index,
			weight = 1 / (1 + (player.roleCooldown or 0)) + rng() * 0.001,
		})
	end
	table.sort(pool, function(a, b)
		if a.weight == b.weight then
			return a.order < b.order
		end
		return a.weight > b.weight
	end)

	local assignment: { [number]: Role } = {}
	local cursor = 1
	for _ = 1, murderers do
		if cursor > #pool then
			break
		end
		assignment[pool[cursor].id] = RoundLogic.Role.Murderer
		cursor += 1
	end
	for _ = 1, sheriffs do
		if cursor > #pool then
			break
		end
		assignment[pool[cursor].id] = RoundLogic.Role.Sheriff
		cursor += 1
	end
	while cursor <= #pool do
		assignment[pool[cursor].id] = RoundLogic.Role.Innocent
		cursor += 1
	end
	return assignment
end

--[[
	Win check. Run it after every death and once per tick; it is cheap and
	getting it wrong strands players in a round nobody can end.
]]
function RoundLogic.evaluateOutcome(states: { Types.PlayerState }, secondsLeft: number): Outcome
	local murderersAlive = 0
	local othersAlive = 0
	for _, state in states do
		if not state.alive then
			continue
		end
		if state.role == RoundLogic.Role.Murderer then
			murderersAlive += 1
		elseif state.role ~= RoundLogic.Role.Spectator then
			othersAlive += 1
		end
	end

	if murderersAlive == 0 then
		return RoundLogic.Outcome.InnocentsWin
	end
	if othersAlive == 0 then
		return RoundLogic.Outcome.MurderersWin
	end
	if secondsLeft <= 0 then
		return RoundLogic.Outcome.TimeUp
	end
	return RoundLogic.Outcome.None
end

function RoundLogic.phaseDuration(config: any, phase: Phase): number
	if phase == RoundLogic.Phase.Intermission then
		return config.round.intermissionSeconds
	elseif phase == RoundLogic.Phase.Grace then
		return config.round.graceSeconds
	elseif phase == RoundLogic.Phase.Round then
		return config.round.roundSeconds
	elseif phase == RoundLogic.Phase.PostRound then
		return config.round.postRoundSeconds
	end
	return 0
end

function RoundLogic.nextPhase(phase: Phase): Phase
	if phase == RoundLogic.Phase.Intermission then
		return RoundLogic.Phase.Grace
	elseif phase == RoundLogic.Phase.Grace then
		return RoundLogic.Phase.Round
	elseif phase == RoundLogic.Phase.Round then
		return RoundLogic.Phase.PostRound
	end
	return RoundLogic.Phase.Intermission
end

--[[
	Blackout timetable for one round, derived entirely from config so the
	previsualizer and the live game black out at exactly the same seconds.
]]
function RoundLogic.blackoutSchedule(config: any): { { warnAt: number, startAt: number, endAt: number } }
	local blackout = config.blackout
	local events = {}
	if not blackout.enabled then
		return events
	end
	local t = blackout.firstAtRoundSecond
	while t < config.round.roundSeconds - blackout.durationSeconds do
		table.insert(events, {
			warnAt = t - blackout.warningSeconds,
			startAt = t,
			endAt = t + blackout.durationSeconds,
		})
		t += blackout.intervalSeconds
	end
	return events
end

--[[
	End-of-round payout for one player. Kept as a pure function so the economy
	can be reasoned about (and tested) without spinning up a round.
]]
function RoundLogic.payout(config: any, summary: {
	role: Role,
	survived: boolean,
	coins: number,
	kills: number,
	killedMurderer: boolean,
	teamWon: boolean,
}): number
	local payouts = config.payouts
	local total = summary.coins * payouts.perCoin

	if summary.survived then
		total += payouts.survive
	end
	if summary.teamWon then
		if summary.role == RoundLogic.Role.Murderer then
			total += payouts.murdererWin
		else
			total += payouts.innocentWin
		end
	end
	if summary.role == RoundLogic.Role.Murderer then
		total += summary.kills * payouts.murdererKill
	end
	if summary.killedMurderer then
		if summary.role == RoundLogic.Role.Hero then
			total += payouts.heroKillsMurderer
		else
			total += payouts.sheriffKillsMurderer
		end
	end
	return total
end

return RoundLogic
