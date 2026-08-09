--!strict
--[[
	Spawning, appearance and the physical state of a body.

	Everyone wears the same carnival-goer outfit with a randomised jacket
	colour, so nobody can be identified by silhouette. The only reliable tell
	is what somebody is holding.

	This works on Types.Combatant rather than Player: a bot's body has to be
	spawned, dressed, slowed, hidden and killed by exactly the same code, or
	the two drift apart and only one of them gets tested.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Types = require(ReplicatedStorage.Shared.Types)

local CharacterService = {}
CharacterService.__index = CharacterService

-- A HumanoidRootPart sits this far above the soles on the default R6 rig, so
-- a spawn point (which is where the feet go) has to be lifted by it.
local ROOT_OFFSET = 3

local JACKET_COLOURS = {
	Color3.fromRGB(52, 62, 92),
	Color3.fromRGB(74, 48, 62),
	Color3.fromRGB(46, 70, 66),
	Color3.fromRGB(84, 66, 44),
	Color3.fromRGB(60, 52, 78),
	Color3.fromRGB(38, 56, 48),
	Color3.fromRGB(78, 58, 52),
	Color3.fromRGB(48, 48, 58),
}

export type Service = typeof(setmetatable(
	{} :: {
		config: any,
	},
	CharacterService
))

function CharacterService.new(config: any): Service
	return setmetatable({ config = config }, CharacterService) :: any
end

local function applyOutfit(character: Model, seed: number)
	local jacket = JACKET_COLOURS[(seed % #JACKET_COLOURS) + 1]
	for _, part in character:GetChildren() do
		if part:IsA("BasePart") and part.Name ~= "Head" then
			part.Color = jacket
			part.Material = Enum.Material.Fabric
		end
	end
	local head = character:FindFirstChild("Head")
	if head and head:IsA("BasePart") then
		head.Color = Color3.fromRGB(214, 178, 140)
	end
end

function CharacterService.characterOf(_self: Service, combatant: Types.Combatant): Model?
	if combatant.player then
		return combatant.player.Character
	end
	return combatant.character
end

--[[
	Puts a body on the ground at `spawnSpec`, loading a fresh one if needed.

	A spawn point is where the soles go. The whole rig is moved with PivotTo,
	and the position is re-asserted a frame later: Roblox finishes its own
	spawn placement after LoadCharacter returns and will otherwise drag the
	character back to wherever it thinks the spawn is.
]]
function CharacterService.spawnAt(self: Service, combatant: Types.Combatant, spawnSpec: any): Model?
	local player = combatant.player
	local character = CharacterService.characterOf(self, combatant)

	if player then
		if not character or not character.Parent then
			player:LoadCharacter()
			character = player.Character or player.CharacterAdded:Wait()
		end
	end
	if not character or not character.Parent then
		return nil
	end
	combatant.character = character

	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not humanoid or not root then
		return nil
	end

	if humanoid.Health <= 0 then
		if not player then
			return nil
		end
		player:LoadCharacter()
		character = player.Character or player.CharacterAdded:Wait()
		if not character then
			return nil
		end
		combatant.character = character
		humanoid = character:FindFirstChildOfClass("Humanoid")
		root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if not humanoid or not root then
			return nil
		end
	end

	applyOutfit(character, if player then player.UserId else combatant.id * 7)

	local target = CFrame.new(Vector3.new(spawnSpec.pos[1], spawnSpec.pos[2] + ROOT_OFFSET, spawnSpec.pos[3]))
		* CFrame.Angles(0, math.rad(spawnSpec.yaw or 0), 0)

	character:PivotTo(target)
	root.AssemblyLinearVelocity = Vector3.zero
	root.AssemblyAngularVelocity = Vector3.zero

	local settled = root
	task.defer(function()
		if character.Parent and settled.Parent and (settled.Position - target.Position).Magnitude > 1 then
			character:PivotTo(target)
			settled.AssemblyLinearVelocity = Vector3.zero
		end
	end)

	humanoid.WalkSpeed = self.config.movement.walkSpeed
	humanoid.JumpPower = self.config.movement.jumpPower
	humanoid.UseJumpPower = true
	humanoid.Health = humanoid.MaxHealth

	return character
end

function CharacterService.humanoidOf(self: Service, combatant: Types.Combatant): Humanoid?
	local character = CharacterService.characterOf(self, combatant)
	if not character then
		return nil
	end
	return character:FindFirstChildOfClass("Humanoid")
end

function CharacterService.setSpeed(self: Service, combatant: Types.Combatant, speed: number)
	local humanoid = CharacterService.humanoidOf(self, combatant)
	if humanoid then
		humanoid.WalkSpeed = speed
	end
end

function CharacterService.setTransparency(self: Service, combatant: Types.Combatant, transparency: number)
	local character = CharacterService.characterOf(self, combatant)
	if not character then
		return
	end
	for _, part in character:GetDescendants() do
		if part:IsA("BasePart") and part.Name ~= "HumanoidRootPart" then
			part.LocalTransparencyModifier = transparency
			part.Transparency = transparency
		elseif part:IsA("Decal") then
			part.Transparency = transparency
		end
	end
end

--[[
	Kills a body and leaves it behind. The corpse is what turns a murder into
	information for everyone still alive.
]]
function CharacterService.eliminate(self: Service, combatant: Types.Combatant, cause: string)
	local character = CharacterService.characterOf(self, combatant)
	if not character then
		return
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end

	character:SetAttribute("Cause", cause)
	humanoid.BreakJointsOnDeath = true
	humanoid.Health = 0

	-- Detach the corpse so respawn logic cannot sweep the evidence away.
	task.defer(function()
		if character.Parent then
			character.Name = `Corpse_{combatant.name}`
			for _, part in character:GetDescendants() do
				if part:IsA("BasePart") then
					part.CanCollide = false
				end
			end
			task.delay(45, function()
				if character.Parent then
					character:Destroy()
				end
			end)
		end
	end)

	if combatant.isBot then
		combatant.character = nil
	end
end

function CharacterService.clearCorpses(_self: Service)
	for _, instance in workspace:GetChildren() do
		if instance:IsA("Model") and string.sub(instance.Name, 1, 7) == "Corpse_" then
			instance:Destroy()
		end
	end
end

function CharacterService.rootOf(self: Service, combatant: Types.Combatant): BasePart?
	local character = CharacterService.characterOf(self, combatant)
	if not character then
		return nil
	end
	return character:FindFirstChild("HumanoidRootPart") :: BasePart?
end

function CharacterService.isAlive(self: Service, combatant: Types.Combatant): boolean
	local humanoid = CharacterService.humanoidOf(self, combatant)
	return humanoid ~= nil and humanoid.Health > 0
end

return CharacterService
