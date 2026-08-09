--!strict
--[[
	Bodies to fill an empty server.

	A murder mystery needs a crowd, and testing one alone in Studio is
	otherwise impossible: the round loop will not start, and if it did there
	would be nobody to hide from. BotService tops the lobby up to
	`bots.fillTo` participants so a single developer gets a real round.

	Bots are Types.Combatant like everyone else, so they draw roles from the
	same RoundLogic call, hold the same weapons, die to the same rules and
	count towards the same win conditions. Only two things differ: nothing
	fires a remote at them, and this file decides where they walk.

	Navigation reuses MapData's graph rather than PathfindingService. The graph
	is generated with the map, is asserted connected by the test suite, and is
	the same one the browser previsualizer plays on -- so bot behaviour here
	and bot behaviour in the demo cannot silently diverge.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local RoundLogic = require(ReplicatedStorage.Shared.RoundLogic)
local Types = require(ReplicatedStorage.Shared.Types)

local BotService = {}
BotService.__index = BotService

local NAMES = {
	"Bex", "Cass", "Halloway", "Juno", "Marlow", "Nadia",
	"Odile", "Pippa", "Renner", "Sable", "Tuck", "Grimes",
	"Vero", "Wren", "Ash", "Colm", "Dita", "Emory",
}

local SKIN = Color3.fromRGB(214, 178, 140)
local CLOTH = Color3.fromRGB(52, 62, 92)

type BotBrain = {
	combatant: Types.Combatant,
	path: { Vector3 },
	pathIndex: number,
	goalNode: number?,
	nextDecision: number,
	nextAttack: number,
}

export type Hooks = {
	getRole: (combatant: Types.Combatant) -> string,
	isAlive: (combatant: Types.Combatant) -> boolean,
	combatants: () -> { Types.Combatant },
	phase: () -> string,
	blackout: () -> boolean,
}

export type Service = typeof(setmetatable(
	{} :: {
		config: any,
		mapData: any,
		hooks: Hooks,
		characters: any,
		weapons: any,
		brains: { BotBrain },
		nodes: { Vector3 },
		adjacency: { { number } },
		folder: Folder,
		connection: RBXScriptConnection?,
		nextId: number,
	},
	BotService
))

--[[
	A blocky R6 rig. Built by hand rather than loaded from an asset so the
	place file has no external dependencies and works offline in Studio.

	These have no Animate script, so they glide rather than walk. That is a
	deliberate trade: animations need uploaded assets, and a sliding test
	dummy still exercises every rule the round cares about.
]]
local function buildRig(name: string): Model
	local model = Instance.new("Model")
	model.Name = name

	local function makePart(partName: string, size: Vector3, color: Color3): BasePart
		local part = Instance.new("Part")
		part.Name = partName
		part.Size = size
		part.Color = color
		part.Material = Enum.Material.Fabric
		part.TopSurface = Enum.SurfaceType.Smooth
		part.BottomSurface = Enum.SurfaceType.Smooth
		part.Parent = model
		return part
	end

	local root = makePart("HumanoidRootPart", Vector3.new(2, 2, 1), CLOTH)
	root.Transparency = 1
	root.CanCollide = false

	local torso = makePart("Torso", Vector3.new(2, 2, 1), CLOTH)
	local head = makePart("Head", Vector3.new(2, 1, 1), SKIN)
	local leftArm = makePart("Left Arm", Vector3.new(1, 2, 1), SKIN)
	local rightArm = makePart("Right Arm", Vector3.new(1, 2, 1), SKIN)
	local leftLeg = makePart("Left Leg", Vector3.new(1, 2, 1), CLOTH)
	local rightLeg = makePart("Right Leg", Vector3.new(1, 2, 1), CLOTH)

	local function joint(jointName: string, part0: BasePart, part1: BasePart, c0: CFrame, c1: CFrame)
		local motor = Instance.new("Motor6D")
		motor.Name = jointName
		motor.Part0 = part0
		motor.Part1 = part1
		motor.C0 = c0
		motor.C1 = c1
		motor.Parent = part0
	end

	joint("RootJoint", root, torso, CFrame.new(), CFrame.new())
	joint("Neck", torso, head, CFrame.new(0, 1, 0), CFrame.new(0, -0.5, 0))
	joint("Right Shoulder", torso, rightArm, CFrame.new(1.5, 0.5, 0), CFrame.new(0, 0.5, 0))
	joint("Left Shoulder", torso, leftArm, CFrame.new(-1.5, 0.5, 0), CFrame.new(0, 0.5, 0))
	joint("Right Hip", torso, rightLeg, CFrame.new(0.5, -1, 0), CFrame.new(0, 1, 0))
	joint("Left Hip", torso, leftLeg, CFrame.new(-0.5, -1, 0), CFrame.new(0, 1, 0))

	local humanoid = Instance.new("Humanoid")
	humanoid.RigType = Enum.HumanoidRigType.R6
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.Subject
	humanoid.NameDisplayDistance = 90
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	humanoid.Parent = model

	model.PrimaryPart = root
	return model
end

local function distanceXZ(a: Vector3, b: Vector3): number
	local dx = a.X - b.X
	local dz = a.Z - b.Z
	return math.sqrt(dx * dx + dz * dz)
end

function BotService.new(config: any, mapData: any, characters: any, weapons: any, hooks: Hooks): Service
	local folder = Instance.new("Folder")
	folder.Name = "HollowBots"
	folder.Parent = workspace

	local nodes: { Vector3 } = {}
	for _, node in mapData.nav.nodes do
		table.insert(nodes, Vector3.new(node.pos[1], node.pos[2], node.pos[3]))
	end

	local adjacency: { { number } } = {}
	for index = 1, #nodes do
		adjacency[index] = {}
	end
	for _, edge in mapData.nav.edges do
		-- MapData edges are zero-based, Luau arrays are not.
		local a, b = edge[1] + 1, edge[2] + 1
		if adjacency[a] and adjacency[b] then
			table.insert(adjacency[a], b)
			table.insert(adjacency[b], a)
		end
	end

	local self = setmetatable({
		config = config,
		mapData = mapData,
		hooks = hooks,
		characters = characters,
		weapons = weapons,
		brains = {},
		nodes = nodes,
		adjacency = adjacency,
		folder = folder,
		connection = nil,
		nextId = 1,
	}, BotService)

	return self :: any
end

function BotService.combatants(self: Service): { Types.Combatant }
	local list = {}
	for _, brain in self.brains do
		table.insert(list, brain.combatant)
	end
	return list
end

function BotService.count(self: Service): number
	return #self.brains
end

--[[
	Tops the population up to `fillTo`, counting the humans already present.
	Called every intermission, so a bot leaves room the moment a real player
	takes the slot.
]]
function BotService.fill(self: Service, humanCount: number)
	local target = math.max(0, self.config.bots.fillTo - humanCount)
	if not self.config.bots.enabled then
		target = 0
	end

	while #self.brains > target do
		local brain = table.remove(self.brains)
		if brain and brain.combatant.character then
			brain.combatant.character:Destroy()
		end
	end

	while #self.brains < target do
		local id = self.nextId
		self.nextId += 1
		local combatant: Types.Combatant = {
			id = 100000 + id,
			name = NAMES[((id - 1) % #NAMES) + 1],
			player = nil,
			character = nil,
			isBot = true,
		}
		table.insert(self.brains, {
			combatant = combatant,
			path = {},
			pathIndex = 1,
			goalNode = nil,
			nextDecision = 0,
			nextAttack = 0,
		})
	end
end

--[[
	Gives a bot a fresh body. Bots have no Player to LoadCharacter, so the rig
	is built here and CharacterService only has to place it.
]]
function BotService.spawnBody(self: Service, combatant: Types.Combatant)
	if combatant.character and combatant.character.Parent then
		combatant.character:Destroy()
	end
	local rig = buildRig(combatant.name)
	rig.Parent = self.folder
	combatant.character = rig
end

function BotService.despawnAll(self: Service)
	for _, brain in self.brains do
		local character = brain.combatant.character
		if character and character.Parent then
			character:Destroy()
		end
		brain.combatant.character = nil
		brain.path = {}
		brain.goalNode = nil
	end
end

function BotService.nearestNode(self: Service, position: Vector3): number?
	local best: number? = nil
	local bestDistance = math.huge
	for index, node in self.nodes do
		local d = distanceXZ(node, position)
		if d < bestDistance then
			bestDistance = d
			best = index
		end
	end
	return best
end

--[[
	A* over the nav graph. The graph is small (a few hundred nodes) and bots
	only re-plan every `decisionInterval`, so a plain binary-search-free
	open list is cheaper than the bookkeeping to avoid it.
]]
function BotService.findPath(self: Service, from: Vector3, to: Vector3): { Vector3 }
	local startNode = BotService.nearestNode(self, from)
	local goalNode = BotService.nearestNode(self, to)
	if not startNode or not goalNode then
		return {}
	end
	if startNode == goalNode then
		return { self.nodes[goalNode] }
	end

	local cameFrom: { [number]: number } = {}
	local costSoFar: { [number]: number } = { [startNode] = 0 }
	local open: { number } = { startNode }
	local closed: { [number]: boolean } = {}

	while #open > 0 do
		local bestIndex = 1
		local bestScore = math.huge
		for i, node in open do
			local score = (costSoFar[node] or math.huge) + distanceXZ(self.nodes[node], self.nodes[goalNode])
			if score < bestScore then
				bestScore = score
				bestIndex = i
			end
		end

		local current = table.remove(open, bestIndex) :: number
		if current == goalNode then
			break
		end
		if closed[current] then
			continue
		end
		closed[current] = true

		for _, neighbour in self.adjacency[current] do
			local step = distanceXZ(self.nodes[current], self.nodes[neighbour])
			local candidate = (costSoFar[current] or math.huge) + step
			if candidate < (costSoFar[neighbour] or math.huge) then
				costSoFar[neighbour] = candidate
				cameFrom[neighbour] = current
				if not closed[neighbour] then
					table.insert(open, neighbour)
				end
			end
		end
	end

	if not cameFrom[goalNode] and goalNode ~= startNode then
		return {}
	end

	local reversed: { Vector3 } = {}
	local cursor: number? = goalNode
	while cursor do
		table.insert(reversed, self.nodes[cursor])
		if cursor == startNode then
			break
		end
		cursor = cameFrom[cursor]
	end

	local path: { Vector3 } = {}
	for i = #reversed, 1, -1 do
		table.insert(path, reversed[i])
	end
	return path
end

function BotService.randomNode(self: Service): Vector3
	return self.nodes[math.random(#self.nodes)]
end

function BotService.livingOthers(self: Service, me: Types.Combatant): { Types.Combatant }
	local list = {}
	for _, other in self.hooks.combatants() do
		if other ~= me and self.hooks.isAlive(other) then
			table.insert(list, other)
		end
	end
	return list
end

--[[
	One bot's decision. Deliberately legible rather than clever: hunt, defend,
	or wander. The interesting behaviour in this game comes from the round
	rules, not from the AI.
]]
function BotService.think(self: Service, brain: BotBrain, now: number)
	local me = brain.combatant
	local role = self.hooks.getRole(me)
	local root = self.characters:rootOf(me)
	if not root then
		return
	end

	local awareness = self.config.bots
	local vision = if self.hooks.blackout() then awareness.blackoutVisionRange else awareness.visionRange
	local position = root.Position

	local nearestPrey: Types.Combatant? = nil
	local nearestPreyDistance = math.huge
	local nearestThreat: Types.Combatant? = nil
	local nearestThreatDistance = math.huge

	for _, other in BotService.livingOthers(self, me) do
		local otherRoot = self.characters:rootOf(other)
		if not otherRoot then
			continue
		end
		local d = distanceXZ(position, otherRoot.Position)
		if d > vision then
			continue
		end
		local otherRole = self.hooks.getRole(other)
		if otherRole == RoundLogic.Role.Murderer then
			if d < nearestThreatDistance then
				nearestThreatDistance = d
				nearestThreat = other
			end
		elseif d < nearestPreyDistance then
			nearestPreyDistance = d
			nearestPrey = other
		end
	end

	if role == RoundLogic.Role.Murderer then
		if nearestPrey then
			local preyRoot = self.characters:rootOf(nearestPrey)
			if preyRoot then
				BotService.walkTo(self, brain, preyRoot.Position)
				if nearestPreyDistance <= self.config.weapons.knife.slashRange - 1 and now >= brain.nextAttack then
					brain.nextAttack = now + 0.25
					local look = (preyRoot.Position - position)
					if look.Magnitude > 0.01 then
						root.CFrame = CFrame.lookAt(position, Vector3.new(preyRoot.Position.X, position.Y, preyRoot.Position.Z))
					end
					self.weapons:slash(me)
				end
				return
			end
		end
		BotService.wander(self, brain)
		return
	end

	if role == RoundLogic.Role.Sheriff or role == RoundLogic.Role.Hero then
		if nearestThreat then
			local threatRoot = self.characters:rootOf(nearestThreat)
			if threatRoot then
				if nearestThreatDistance <= awareness.fireRange and now >= brain.nextAttack then
					brain.nextAttack = now + 0.6
					local body = self.characters:characterOf(me)
					local head = body and body:FindFirstChild("Head") :: BasePart?
					local origin = if head then head.Position else position
					self.weapons:shoot(me, (threatRoot.Position - origin).Unit)
				else
					BotService.walkTo(self, brain, threatRoot.Position)
				end
				return
			end
		end
		BotService.wander(self, brain)
		return
	end

	-- Innocents: run from anyone they have identified as the murderer,
	-- otherwise drift around the park picking up coins by walking over them.
	if nearestThreat and nearestThreatDistance < awareness.recogniseRange * 2 then
		local threatRoot = self.characters:rootOf(nearestThreat)
		if threatRoot then
			local away = position + (position - threatRoot.Position).Unit * 60
			BotService.walkTo(self, brain, away)
			return
		end
	end
	BotService.wander(self, brain)
end

function BotService.wander(self: Service, brain: BotBrain)
	if #brain.path > 0 and brain.pathIndex <= #brain.path then
		return
	end
	BotService.walkTo(self, brain, BotService.randomNode(self))
end

function BotService.walkTo(self: Service, brain: BotBrain, destination: Vector3)
	local root = self.characters:rootOf(brain.combatant)
	if not root then
		return
	end
	brain.path = BotService.findPath(self, root.Position, destination)
	brain.pathIndex = 1
end

function BotService.step(self: Service, _delta: number)
	if self.hooks.phase() ~= RoundLogic.Phase.Round and self.hooks.phase() ~= RoundLogic.Phase.Grace then
		return
	end
	local now = os.clock()

	for _, brain in self.brains do
		local me = brain.combatant
		if not self.hooks.isAlive(me) then
			continue
		end
		local humanoid = self.characters:humanoidOf(me)
		local root = self.characters:rootOf(me)
		if not humanoid or not root then
			continue
		end

		if now >= brain.nextDecision then
			brain.nextDecision = now + self.config.bots.decisionInterval
			BotService.think(self, brain, now)
		end

		local waypoint = brain.path[brain.pathIndex]
		if waypoint then
			if distanceXZ(root.Position, waypoint) < 6 then
				brain.pathIndex += 1
				waypoint = brain.path[brain.pathIndex]
			end
			if waypoint then
				humanoid:MoveTo(waypoint)
			end
		end
	end
end

function BotService.start(self: Service)
	self.connection = RunService.Heartbeat:Connect(function(delta)
		BotService.step(self :: any, delta)
	end)
end

function BotService.destroy(self: Service)
	if self.connection then
		self.connection:Disconnect()
		self.connection = nil
	end
	BotService.despawnAll(self)
	self.folder:Destroy()
end

return BotService
