--!strict
--[[
	Rules tests.

	These run the exact file the Roblox server requires, via the shim in
	lib/roblox.luau — no copy, no reimplementation.
]]

local Roblox = require("./lib/roblox")
local testkit = require("./lib/testkit")

local describe = testkit.describe
local test = testkit.test
local assertEqual = testkit.assertEqual
local assertTrue = testkit.assertTrue

local RoundLogic = Roblox.import("src/shared/RoundLogic.luau")
local config = Roblox.config()

local Role = RoundLogic.Role
local Phase = RoundLogic.Phase
local Outcome = RoundLogic.Outcome

-- A fixed generator so a failure is always reproducible.
local function seeded(seed: number): () -> number
	local value = seed
	return function(): number
		value = (value * 1103515245 + 12345) % 2147483648
		return value / 2147483648
	end
end

local function seeds(count: number, cooldown: number?): { any }
	local list = {}
	for index = 1, count do
		table.insert(list, { id = index, roleCooldown = cooldown or 0 })
	end
	return list
end

local function tally(assignment: { [number]: string }): { [string]: number }
	local counts = { Murderer = 0, Sheriff = 0, Innocent = 0 }
	for _, role in assignment do
		counts[role] = (counts[role] or 0) + 1
	end
	return counts
end

describe("role counts", function()
	test("nobody is the murderer below the player minimum", function()
		assertEqual(RoundLogic.countMurderers(config, 0), 0)
		assertEqual(RoundLogic.countMurderers(config, config.round.minPlayers - 1), 0)
	end)

	test("exactly one murderer at the minimum player count", function()
		assertEqual(RoundLogic.countMurderers(config, config.round.minPlayers), 1)
	end)

	test("murderer count grows with the lobby but stays capped", function()
		local previous = 0
		for count = config.round.minPlayers, 60 do
			local murderers = RoundLogic.countMurderers(config, count)
			assertTrue(murderers >= previous, `murderer count went down at {count} players`)
			assertTrue(murderers <= config.assignment.murdererMaxCount, `cap exceeded at {count} players`)
			previous = murderers
		end
		assertEqual(RoundLogic.countMurderers(config, 60), config.assignment.murdererMaxCount)
	end)

	test("the sheriff needs a bigger lobby than the murderer", function()
		assertEqual(RoundLogic.countSheriffs(config, config.assignment.sheriffMinPlayers - 1), 0)
		assertEqual(RoundLogic.countSheriffs(config, config.assignment.sheriffMinPlayers), 1)
	end)

	test("a murderer always outnumbers nobody: roles never exceed the lobby", function()
		for count = 1, 60 do
			local total = RoundLogic.countMurderers(config, count) + RoundLogic.countSheriffs(config, count)
			assertTrue(total <= count, `assigned {total} special roles to {count} players`)
		end
	end)
end)

describe("role assignment", function()
	test("every player gets exactly one role", function()
		for count = config.round.minPlayers, 24 do
			local assignment = RoundLogic.assignRoles(config, seeds(count), seeded(count * 7))
			local assigned = 0
			for id = 1, count do
				assertTrue(assignment[id] ~= nil, `player {id} of {count} got no role`)
				assigned += 1
			end
			assertEqual(assigned, count)
		end
	end)

	test("the counts match the config", function()
		for count = config.round.minPlayers, 24 do
			local assignment = RoundLogic.assignRoles(config, seeds(count), seeded(count))
			local counts = tally(assignment)
			assertEqual(counts.Murderer, RoundLogic.countMurderers(config, count), `murderers at {count} players`)
			assertEqual(counts.Sheriff, RoundLogic.countSheriffs(config, count), `sheriffs at {count} players`)
		end
	end)

	test("players who were special recently drop to the back of the queue", function()
		local count = 12
		local needed = RoundLogic.countMurderers(config, count) + RoundLogic.countSheriffs(config, count)
		local firstEligible = count - needed + 1

		local players = {}
		for index = 1, count do
			-- Exactly enough fresh players to fill every special role; the
			-- rest just held one and should be passed over.
			table.insert(players, { id = index, roleCooldown = if index >= firstEligible then 0 else 2 })
		end

		local assignment = RoundLogic.assignRoles(config, players, seeded(99))
		for id, role in assignment do
			if role ~= Role.Innocent then
				assertTrue(id >= firstEligible, `player {id} was on cooldown but drew {role}`)
			end
		end
	end)

	test("assignment is deterministic for a given generator", function()
		local first = RoundLogic.assignRoles(config, seeds(9), seeded(4))
		local second = RoundLogic.assignRoles(config, seeds(9), seeded(4))
		testkit.assertDeepEqual(first, second)
	end)
end)

describe("win conditions", function()
	local function state(role: string, alive: boolean)
		return { role = role, alive = alive }
	end

	test("killing the last murderer ends it", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, false),
			state(Role.Innocent, true),
			state(Role.Sheriff, true),
		}, 60)
		assertEqual(outcome, Outcome.InnocentsWin)
	end)

	test("a second murderer keeps the round alive", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, false),
			state(Role.Murderer, true),
			state(Role.Innocent, true),
		}, 60)
		assertEqual(outcome, Outcome.None)
	end)

	test("an empty midway is a murderer win", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, true),
			state(Role.Innocent, false),
			state(Role.Sheriff, false),
		}, 60)
		assertEqual(outcome, Outcome.MurderersWin)
	end)

	test("spectators do not keep a lost round going", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, true),
			state(Role.Innocent, false),
			state(Role.Spectator, true),
		}, 60)
		assertEqual(outcome, Outcome.MurderersWin)
	end)

	test("the hero counts as a survivor", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, true),
			state(Role.Hero, true),
		}, 60)
		assertEqual(outcome, Outcome.None)
	end)

	test("running out the clock is a survivor win", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, true),
			state(Role.Innocent, true),
		}, 0)
		assertEqual(outcome, Outcome.TimeUp)
	end)

	test("a dead lobby resolves rather than hanging", function()
		local outcome = RoundLogic.evaluateOutcome({
			state(Role.Murderer, false),
			state(Role.Innocent, false),
		}, 10)
		assertEqual(outcome, Outcome.InnocentsWin)
	end)
end)

describe("phases", function()
	test("every phase has a positive duration", function()
		for _, phase in { Phase.Intermission, Phase.Grace, Phase.Round, Phase.PostRound } do
			assertTrue(RoundLogic.phaseDuration(config, phase) > 0, `{phase} has no duration`)
		end
	end)

	test("the phase cycle closes", function()
		local phase = Phase.Intermission
		for _ = 1, 4 do
			phase = RoundLogic.nextPhase(phase)
		end
		assertEqual(phase, Phase.Intermission)
	end)

	test("grace is short enough to matter and long enough to hide", function()
		assertTrue(config.round.graceSeconds >= 3, "grace is too short to find cover")
		assertTrue(config.round.graceSeconds < config.round.roundSeconds / 4, "grace eats the round")
	end)
end)

describe("blackout schedule", function()
	local schedule = RoundLogic.blackoutSchedule(config)

	test("the round blacks out at least once", function()
		assertTrue(#schedule > 0, "no blackouts scheduled")
	end)

	test("every blackout finishes before the round does", function()
		for index, event in schedule do
			assertTrue(event.endAt <= config.round.roundSeconds, `blackout {index} runs past the round`)
			assertTrue(event.warnAt < event.startAt, `blackout {index} warns after it starts`)
			assertTrue(event.startAt < event.endAt, `blackout {index} ends before it starts`)
		end
	end)

	test("blackouts never overlap", function()
		for index = 2, #schedule do
			assertTrue(
				schedule[index].warnAt > schedule[index - 1].endAt,
				`blackout {index} begins warning before {index - 1} is over`
			)
		end
	end)

	test("nobody spawns into the dark", function()
		assertTrue(schedule[1].startAt > config.round.graceSeconds, "the first blackout lands during grace")
	end)
end)

describe("payouts", function()
	local function payout(summary: any): number
		return RoundLogic.payout(config, summary)
	end

	test("a quiet surviving innocent still earns", function()
		local amount = payout({
			role = Role.Innocent,
			survived = true,
			coins = 0,
			kills = 0,
			killedMurderer = false,
			teamWon = true,
		})
		assertEqual(amount, config.payouts.survive + config.payouts.innocentWin)
	end)

	test("coins are worth collecting", function()
		local without = payout({
			role = Role.Innocent,
			survived = true,
			coins = 0,
			kills = 0,
			killedMurderer = false,
			teamWon = true,
		})
		local with = payout({
			role = Role.Innocent,
			survived = true,
			coins = 20,
			kills = 0,
			killedMurderer = false,
			teamWon = true,
		})
		assertEqual(with - without, 20 * config.payouts.perCoin)
	end)

	test("the hero is paid better than the sheriff for the same shot", function()
		local base = {
			survived = true,
			coins = 0,
			kills = 0,
			killedMurderer = true,
			teamWon = true,
		}
		local sheriff = payout({
			role = Role.Sheriff,
			survived = base.survived,
			coins = base.coins,
			kills = base.kills,
			killedMurderer = base.killedMurderer,
			teamWon = base.teamWon,
		})
		local hero = payout({
			role = Role.Hero,
			survived = base.survived,
			coins = base.coins,
			kills = base.kills,
			killedMurderer = base.killedMurderer,
			teamWon = base.teamWon,
		})
		assertTrue(hero > sheriff, "picking up a dead sheriff's gun should pay a premium")
	end)

	test("a murderer is paid per kill", function()
		local one = payout({
			role = Role.Murderer,
			survived = true,
			coins = 0,
			kills = 1,
			killedMurderer = false,
			teamWon = true,
		})
		local three = payout({
			role = Role.Murderer,
			survived = true,
			coins = 0,
			kills = 3,
			killedMurderer = false,
			teamWon = true,
		})
		assertEqual(three - one, 2 * config.payouts.murdererKill)
	end)

	test("losing pays less than winning for the same round", function()
		local won = payout({
			role = Role.Innocent,
			survived = true,
			coins = 5,
			kills = 0,
			killedMurderer = false,
			teamWon = true,
		})
		local lost = payout({
			role = Role.Innocent,
			survived = true,
			coins = 5,
			kills = 0,
			killedMurderer = false,
			teamWon = false,
		})
		assertTrue(won > lost, "winning has to be worth something")
	end)

	test("nothing pays negative", function()
		local amount = payout({
			role = Role.Spectator,
			survived = false,
			coins = 0,
			kills = 0,
			killedMurderer = false,
			teamWon = false,
		})
		assertEqual(amount, 0)
	end)
end)

return true
