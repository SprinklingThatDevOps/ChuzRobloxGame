--!strict
--[[
	Guards for the files that cannot run outside Studio.

	Most of src/server and src/client touches Instances, so it can't be
	executed here — but it can be *compiled*, which catches the class of
	mistake that would otherwise only surface as a red line in the Studio
	output window after a full sync.
]]

local fs = require("@lune/fs")

local Roblox = require("./lib/roblox")
local testkit = require("./lib/testkit")

local describe = testkit.describe
local test = testkit.test
local assertEqual = testkit.assertEqual
local assertTrue = testkit.assertTrue

local function collect(dir: string, out: { string }): { string }
	for _, entry in fs.readDir(dir) do
		local path = `{dir}/{entry}`
		if fs.isDir(path) then
			collect(path, out)
		elseif path:match("%.luau?$") then
			table.insert(out, path)
		end
	end
	return out
end

local sources = collect("src", {})

describe("sources", function()
	test("there is something to compile", function()
		assertTrue(#sources >= 10, `only found {#sources} Luau files under src/`)
	end)

	for _, path in sources do
		test(`{path} compiles`, function()
			Roblox.compile(path)
		end)
	end

	test("every file opts into strict mode", function()
		for _, path in sources do
			local firstLine = fs.readFile(path):match("^([^\n]*)")
			assertEqual(firstLine, "--!strict", `{path} is missing the --!strict header`)
		end
	end)
end)

describe("config", function()
	local config = Roblox.config()

	test("sprinting is faster than walking", function()
		assertTrue(config.movement.sprintSpeed > config.movement.walkSpeed, "sprint is not a sprint")
	end)

	test("stamina runs out but comes back", function()
		assertTrue(config.movement.staminaDrainPerSecond > 0, "sprint is free")
		assertTrue(config.movement.staminaRegenPerSecond > 0, "stamina never returns")
		assertTrue(
			config.movement.staminaDrainPerSecond > config.movement.staminaRegenPerSecond,
			"you could sprint forever"
		)
	end)

	test("the murderer is faster than the people running away", function()
		assertTrue(config.movement.murdererSpeedBonus > 0, "the murderer cannot catch anyone")
		assertTrue(
			config.movement.walkSpeed + config.movement.murdererSpeedBonus < config.movement.sprintSpeed,
			"sprinting must outrun a walking murderer, or there is no chase"
		)
	end)

	test("the shroud is an opening, not a disguise", function()
		local shroud = config.abilities.shroud
		assertTrue(shroud.duration > 0 and shroud.duration < 6, "shroud duration is out of band")
		assertTrue(shroud.cooldown > shroud.duration * 4, "shroud comes back too fast")
		assertTrue(shroud.transparency < 1, "a fully invisible murderer is not a game")
	end)

	test("every role has a name, a colour and a line of flavour", function()
		for name, role in config.roles do
			assertTrue(type(role.displayName) == "string" and #role.displayName > 0, `{name} has no display name`)
			assertTrue(#role.color == 3, `{name} has a malformed colour`)
			for _, channel in role.color do
				assertTrue(channel >= 0 and channel <= 255, `{name} has a colour channel out of range`)
			end
			assertTrue(type(role.blurb) == "string" and #role.blurb > 0, `{name} has no blurb`)
		end
	end)

	test("the revolver stays a liability", function()
		assertEqual(config.weapons.revolver.innocentKillPenalty, "shooter_dies")
		assertTrue(config.weapons.revolver.dropOnDeath, "the hero mechanic needs a dropped gun")
	end)

	test("the bot filler can start a round on its own", function()
		local bots = config.bots
		assertTrue(bots.fillTo >= config.round.minPlayers, "a solo player would still be stuck in intermission")
		assertTrue(
			bots.fillTo <= #Roblox.mapData().spawns.round,
			"more bodies than round spawns; two would share a spawn point"
		)
		assertTrue(bots.decisionInterval > 0, "bots would re-plan every frame")
	end)

	test("a blackout is survivable", function()
		assertTrue(config.blackout.durationSeconds < 15, "the blackout outstays its welcome")
		assertTrue(config.blackout.warningSeconds > 0, "the blackout arrives with no warning")
		assertTrue(config.blackout.intervalSeconds > config.blackout.durationSeconds, "the lights never come back")
	end)

	test("blackout lighting is darker than normal lighting", function()
		local normal = config.lighting.normal
		local dark = config.lighting.blackout
		assertTrue(dark.brightness < normal.brightness, "the blackout is brighter than the lights")
		assertTrue(dark.fogEnd < normal.fogEnd, "the blackout does not close the fog in")
		for index = 1, 3 do
			assertTrue(dark.ambient[index] <= normal.ambient[index], "blackout ambient is not darker")
		end
	end)
end)

return true
