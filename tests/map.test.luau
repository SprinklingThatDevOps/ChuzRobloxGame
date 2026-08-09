--!strict
--[[
	Map validation.

	build/MapData.json is generated, so these tests are aimed at the generator:
	they assert the invariants the Roblox MapBuilder and the previsualizer both
	assume, and they would catch a district builder that quietly walls off half
	the park or drops a spawn inside a tent pole.
]]

local fs = require("@lune/fs")
local serde = require("@lune/serde")

local Roblox = require("./lib/roblox")
local testkit = require("./lib/testkit")

local describe = testkit.describe
local test = testkit.test
local assertEqual = testkit.assertEqual
local assertTrue = testkit.assertTrue

local config = Roblox.config()
local map = serde.decode("json", fs.readFile("build/MapData.json"))

-- Kept in step with MapBuilder.luau: a material it does not know silently
-- becomes SmoothPlastic in-game, which is exactly the kind of bug that only
-- shows up as "why is the tent matte".
local MATERIALS = {
	Neon = true,
	Metal = true,
	CorrodedMetal = true,
	Foil = true,
	DiamondPlate = true,
	Wood = true,
	WoodPlanks = true,
	Concrete = true,
	Slate = true,
	Brick = true,
	Granite = true,
	Pebble = true,
	Sand = true,
	Marble = true,
	Glass = true,
	Fabric = true,
	Plastic = true,
	SmoothPlastic = true,
	Ice = true,
}

local SHAPES = { box = true, cyl = true, sphere = true }
local SIGN_FACES = { Front = true, Back = true, Right = true, Left = true, Top = true }

local function isFinite(value: any): boolean
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function isVector(value: any): boolean
	return type(value) == "table" and #value == 3 and isFinite(value[1]) and isFinite(value[2]) and isFinite(value[3])
end

local function distanceXZ(a: { number }, b: { number }): number
	local dx = a[1] - b[1]
	local dz = a[3] - b[3]
	return math.sqrt(dx * dx + dz * dz)
end

describe("map document", function()
	test("has the sections both runtimes read", function()
		for _, key in { "name", "bounds", "landmarks", "spawns", "coinSpots", "nav", "animators", "lights", "parts" } do
			assertTrue(map[key] ~= nil, `MapData is missing "{key}"`)
		end
	end)

	test("is big enough to be a carnival", function()
		assertTrue(#map.parts > 1500, `only {#map.parts} parts`)
		assertTrue(#map.lights > 150, `only {#map.lights} lights`)
	end)

	test("names the landmarks the HUD points at", function()
		assertTrue(#map.landmarks >= 6, `only {#map.landmarks} landmarks`)
		for _, landmark in map.landmarks do
			assertTrue(#landmark.name > 0, "a landmark has no name")
			assertTrue(isVector(landmark.pos), `landmark "{landmark.name}" has a bad position`)
		end
	end)
end)

describe("parts", function()
	test("every part is well formed", function()
		for index, part in map.parts do
			local where = `part {index} ("{tostring(part.name)}")`
			assertTrue(type(part.name) == "string" and #part.name > 0, `{where} has no name`)
			assertTrue(SHAPES[part.shape] == true, `{where} has unknown shape "{tostring(part.shape)}"`)
			assertTrue(MATERIALS[part.material] == true, `{where} has unknown material "{tostring(part.material)}"`)
			assertTrue(isVector(part.pos), `{where} has a bad position`)
			assertTrue(isVector(part.size), `{where} has a bad size`)
			assertTrue(isVector(part.color), `{where} has a bad colour`)
			if part.rot ~= nil then
				assertTrue(isVector(part.rot), `{where} has a bad rotation`)
			end
		end
	end)

	test("no part is degenerate or absurd", function()
		for index, part in map.parts do
			for axis = 1, 3 do
				local extent = part.size[axis]
				assertTrue(extent > 0.02, `part {index} ("{part.name}") is {extent} studs on axis {axis}`)
				assertTrue(extent < 1200, `part {index} ("{part.name}") is {extent} studs on axis {axis}`)
			end
		end
	end)

	test("colour channels are in byte range", function()
		for index, part in map.parts do
			for channel = 1, 3 do
				local value = part.color[channel]
				assertTrue(value >= 0 and value <= 255, `part {index} colour channel {channel} is {value}`)
			end
		end
	end)

	test("nothing stands off the edge of the world", function()
		-- The lobby is a deliberate skybox island, so it is exempt; everything
		-- else has to have ground under it, including the dead trees that sit
		-- outside the hoarding.
		local limit = map.bounds.groundHalf
		for index, part in map.parts do
			if part.group and part.group:sub(1, 5) == "Lobby" then
				continue
			end
			assertTrue(
				math.abs(part.pos[1]) < limit and math.abs(part.pos[3]) < limit,
				`part {index} ("{part.name}") stands past the edge of the ground`
			)
			assertTrue(part.pos[2] > -80 and part.pos[2] < 400, `part {index} ("{part.name}") is at y={part.pos[2]}`)
		end
	end)

	test("signs carry text and a legible face", function()
		local signs = 0
		for index, part in map.parts do
			if not part.sign then
				continue
			end
			signs += 1
			assertTrue(type(part.sign.text) == "string" and #part.sign.text > 0, `sign on part {index} is blank`)
			assertTrue(isVector(part.sign.color), `sign on part {index} has a bad colour`)
			if part.sign.face ~= nil then
				assertTrue(SIGN_FACES[part.sign.face] == true, `sign on part {index} faces "{part.sign.face}"`)
			end
		end
		assertTrue(signs >= 5, `only {signs} signs in the whole park`)
	end)

	test("the neon that carries the look is actually there", function()
		local neon = 0
		for _, part in map.parts do
			if part.material == "Neon" then
				neon += 1
			end
		end
		assertTrue(neon > 200, `only {neon} neon parts; the carnival will read as grey`)
	end)
end)

describe("lights", function()
	test("every light is well formed", function()
		for index, light in map.lights do
			assertTrue(isVector(light.pos), `light {index} has a bad position`)
			assertTrue(isVector(light.color), `light {index} has a bad colour`)
			assertTrue(isFinite(light.range) and light.range > 0, `light {index} has range {tostring(light.range)}`)
			assertTrue(
				isFinite(light.brightness) and light.brightness > 0,
				`light {index} has brightness {tostring(light.brightness)}`
			)
		end
	end)

	test("some lights survive a blackout so the park is not pitch black", function()
		local survivors = 0
		for _, light in map.lights do
			if light.survivesBlackout then
				survivors += 1
			end
		end
		assertTrue(survivors > 0, "a blackout would leave players with nothing to navigate by")
		assertTrue(survivors < #map.lights / 3, `{survivors} of {#map.lights} lights ignore the blackout`)
	end)

	test("the shadow budget is small enough to ship", function()
		local shadowed = 0
		for _, light in map.lights do
			if light.shadows then
				shadowed += 1
			end
		end
		assertTrue(shadowed <= 24, `{shadowed} lights ask for shadows`)
	end)
end)

describe("animators", function()
	local groups: { [string]: number } = {}
	for _, part in map.parts do
		if part.group then
			groups[part.group] = (groups[part.group] or 0) + 1
		end
	end

	test("every animator drives a group that exists", function()
		for index, animator in map.animators do
			assertTrue(
				(groups[animator.group] or 0) > 0,
				`animator {index} drives "{animator.group}", which owns no parts`
			)
		end
	end)

	test("animators are sane", function()
		for index, animator in map.animators do
			assertTrue(isVector(animator.axis), `animator {index} has a bad axis`)
			assertTrue(isFinite(animator.speed), `animator {index} has a bad speed`)
			assertTrue(
				animator.kind == "spin" or animator.kind == "orbit" or animator.kind == "bob",
				`animator {index} has unknown kind "{animator.kind}"`
			)
			if animator.pivot ~= nil then
				assertTrue(isVector(animator.pivot), `animator {index} has a bad pivot`)
			end
		end
	end)

	test("the big rides move", function()
		assertTrue(#map.animators >= 3, `only {#map.animators} animators; the park is a still life`)
	end)
end)

describe("navigation graph", function()
	local nodes = map.nav.nodes
	local edges = map.nav.edges

	local adjacency: { { number } } = {}
	for index = 1, #nodes do
		adjacency[index] = {}
	end
	for _, edge in edges do
		-- MapData is zero-indexed for the JS side; Luau tables are one-indexed.
		local a, b = edge[1] + 1, edge[2] + 1
		table.insert(adjacency[a], b)
		table.insert(adjacency[b], a)
	end

	test("the graph is big enough to hide in", function()
		assertTrue(#nodes > 120, `only {#nodes} nav nodes`)
		assertTrue(#edges > #nodes, "the graph has fewer edges than nodes; it cannot be well connected")
	end)

	test("every edge points at a real node", function()
		for index, edge in edges do
			local a, b = edge[1] + 1, edge[2] + 1
			assertTrue(nodes[a] ~= nil, `edge {index} starts at missing node {edge[1]}`)
			assertTrue(nodes[b] ~= nil, `edge {index} ends at missing node {edge[2]}`)
			assertTrue(a ~= b, `edge {index} is a self loop`)
		end
	end)

	test("the whole park is reachable from the entrance", function()
		local seen = { [1] = true }
		local queue = { 1 }
		local head = 1
		local reached = 1
		while head <= #queue do
			local current = queue[head]
			head += 1
			for _, neighbour in adjacency[current] do
				if not seen[neighbour] then
					seen[neighbour] = true
					reached += 1
					table.insert(queue, neighbour)
				end
			end
		end
		assertEqual(reached, #nodes, `{#nodes - reached} nav nodes are cut off from the rest of the graph`)
	end)

	test("the mirror maze is wired into the park", function()
		local mazeNodes = 0
		for _, node in nodes do
			if node.name == "maze" then
				mazeNodes += 1
			end
		end
		assertTrue(mazeNodes > 8, `the funhouse maze only has {mazeNodes} cells`)
	end)

	test("no node is stranded with a single dead-end", function()
		local dead = 0
		for index = 1, #nodes do
			if #adjacency[index] <= 1 then
				dead += 1
			end
		end
		assertTrue(dead < #nodes * 0.2, `{dead} of {#nodes} nodes are dead ends`)
	end)
end)

describe("spawns", function()
	test("the lobby can hold a full server", function()
		assertTrue(#map.spawns.lobby >= 12, `only {#map.spawns.lobby} lobby spawns`)
	end)

	test("there are enough round spawns to spread a lobby out", function()
		assertTrue(#map.spawns.round >= 16, `only {#map.spawns.round} round spawns`)
	end)

	test("no two round spawns are within knife range", function()
		local knifeRange = config.weapons.knife.slashRange
		for i = 1, #map.spawns.round do
			for j = i + 1, #map.spawns.round do
				local gap = distanceXZ(map.spawns.round[i].pos, map.spawns.round[j].pos)
				assertTrue(
					gap > knifeRange * 2,
					`spawns {i} and {j} are {string.format("%.1f", gap)} studs apart, inside opening knife range`
				)
			end
		end
	end)

	test("round spawns stand on the nav graph", function()
		for index, spawn in map.spawns.round do
			local nearest = math.huge
			for _, node in map.nav.nodes do
				nearest = math.min(nearest, distanceXZ(spawn.pos, node.pos))
			end
			assertTrue(nearest < 10, `round spawn {index} is {string.format("%.1f", nearest)} studs from any nav node`)
		end
	end)

	test("spawns face into the park and stand above the floor", function()
		for index, spawn in map.spawns.round do
			assertTrue(isVector(spawn.pos), `round spawn {index} has a bad position`)
			assertTrue(isFinite(spawn.yaw), `round spawn {index} has a bad yaw`)
			assertTrue(spawn.pos[2] > map.bounds.groundY, `round spawn {index} is below the ground`)
		end
	end)
end)

describe("coins", function()
	test("there are more spots than coins, so placement varies", function()
		assertTrue(
			#map.coinSpots > config.coins.activeCount,
			`{#map.coinSpots} spots for {config.coins.activeCount} coins leaves no variety`
		)
	end)

	test("coins sit inside the park and above the floor", function()
		local limit = map.bounds.half
		for index, spot in map.coinSpots do
			assertTrue(isVector(spot), `coin spot {index} is malformed`)
			assertTrue(
				math.abs(spot[1]) <= limit and math.abs(spot[3]) <= limit,
				`coin spot {index} is outside the park`
			)
			assertTrue(spot[2] > map.bounds.groundY, `coin spot {index} is buried`)
		end
	end)

	test("coins are spread rather than clumped", function()
		local tooClose = 0
		for i = 1, #map.coinSpots do
			for j = i + 1, #map.coinSpots do
				if distanceXZ(map.coinSpots[i], map.coinSpots[j]) < config.coins.pickupRadius then
					tooClose += 1
				end
			end
		end
		assertTrue(tooClose == 0, `{tooClose} pairs of coins are close enough to collect together`)
	end)
end)

return true
