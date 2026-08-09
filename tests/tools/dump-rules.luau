--!strict
--[[
	Prints the Luau rules engine's answers as JSON.

	tests/rules-parity.test.mjs runs this and checks the browser
	previsualizer's copy of the same rules produces byte-identical results.
	Two implementations of one rulebook is a compromise (the previsualizer
	cannot run Luau, the game cannot run JavaScript); this is the tripwire that
	keeps the compromise honest.
]]

local serde = require("@lune/serde")
local stdio = require("@lune/stdio")

local Roblox = require("../lib/roblox")

local RoundLogic = Roblox.import("src/shared/RoundLogic.luau")
local config = Roblox.config()

-- Must match the generator in tests/rules-parity.test.mjs exactly.
local function seeded(seed: number): () -> number
	local value = seed
	return function(): number
		value = (value * 1103515245 + 12345) % 2147483648
		return value / 2147483648
	end
end

local MAX_PLAYERS = 48

local counts = {}
for playerCount = 0, MAX_PLAYERS do
	table.insert(counts, {
		players = playerCount,
		murderers = RoundLogic.countMurderers(config, playerCount),
		sheriffs = RoundLogic.countSheriffs(config, playerCount),
	})
end

--[[
	Role draws over a spread of lobby sizes and cooldown patterns. The pattern
	matters: cooldown is the only input that biases the draw, so a divergence
	in how it is weighted would only show up here.
]]
local assignments = {}
for playerCount = 2, 24 do
	for _, pattern in { "fresh", "alternating", "mostly-cooling" } do
		local players = {}
		for index = 1, playerCount do
			local cooldown = 0
			if pattern == "alternating" then
				cooldown = index % 3
			elseif pattern == "mostly-cooling" then
				cooldown = if index <= playerCount - 2 then 2 else 0
			end
			table.insert(players, { id = index, roleCooldown = cooldown })
		end

		local assignment = RoundLogic.assignRoles(config, players, seeded(playerCount * 31 + #pattern))
		local roles = {}
		for index = 1, playerCount do
			table.insert(roles, assignment[index])
		end
		table.insert(assignments, { players = playerCount, pattern = pattern, roles = roles })
	end
end

-- Every reachable shape of a round ending, including the ones that only turn
-- up when a lobby empties out mid-round.
local outcomeCases = {}
local roleOptions = { "Innocent", "Sheriff", "Murderer", "Hero", "Spectator" }
for _, first in roleOptions do
	for _, second in roleOptions do
		for _, firstAlive in { true, false } do
			for _, secondAlive in { true, false } do
				for _, secondsLeft in { 0, 30 } do
					local states = {
						{ role = first, alive = firstAlive },
						{ role = second, alive = secondAlive },
					}
					table.insert(outcomeCases, {
						states = states,
						secondsLeft = secondsLeft,
						outcome = RoundLogic.evaluateOutcome(states, secondsLeft),
					})
				end
			end
		end
	end
end

local phases = {}
for _, phase in { "Intermission", "Grace", "Round", "PostRound" } do
	table.insert(phases, {
		phase = phase,
		duration = RoundLogic.phaseDuration(config, phase),
		next = RoundLogic.nextPhase(phase),
	})
end

stdio.write(serde.encode("json", {
	counts = counts,
	assignments = assignments,
	outcomes = outcomeCases,
	phases = phases,
	blackout = RoundLogic.blackoutSchedule(config),
}))
