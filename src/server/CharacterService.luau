--!strict
--[[
	Spawning, appearance and the physical state of a player's body.

	Everyone wears the same carnival-goer outfit with a randomised jacket
	colour, so nobody can be identified by silhouette. The only reliable tell
	is what somebody is holding.
]]

local Players = game:GetService("Players")

local CharacterService = {}
CharacterService.__index = CharacterService

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
		onDeath: ((player: Player, character: Model) -> ())?,
	},
	CharacterService
))

function CharacterService.new(config: any): Service
	return setmetatable({ config = config, onDeath = nil }, CharacterService) :: any
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

--[[
	Puts a player on the ground at `spawnSpec`, loading a fresh body if needed.
	Returns the character once its parts actually exist.
]]
function CharacterService.spawnAt(self: Service, player: Player, spawnSpec: any): Model?
	local character = player.Character
	if not character or not character.Parent then
		player:LoadCharacter()
		character = player.Character or player.CharacterAdded:Wait()
	end
	if not character then
		return nil
	end

	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not humanoid or not root then
		return nil
	end

	if humanoid.Health <= 0 then
		player:LoadCharacter()
		character = player.Character or player.CharacterAdded:Wait()
		if not character then
			return nil
		end
		humanoid = character:FindFirstChildOfClass("Humanoid")
		root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if not humanoid or not root then
			return nil
		end
	end

	applyOutfit(character, player.UserId)

	local position = Vector3.new(spawnSpec.pos[1], spawnSpec.pos[2] + 3, spawnSpec.pos[3])
	root.CFrame = CFrame.new(position) * CFrame.Angles(0, math.rad(spawnSpec.yaw or 0), 0)
	root.AssemblyLinearVelocity = Vector3.zero

	humanoid.WalkSpeed = self.config.movement.walkSpeed
	humanoid.JumpPower = self.config.movement.jumpPower
	humanoid.UseJumpPower = true
	humanoid.Health = humanoid.MaxHealth

	return character
end

function CharacterService.setSpeed(_self: Service, player: Player, speed: number)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = speed
	end
end

function CharacterService.setTransparency(_self: Service, player: Player, transparency: number)
	local character = player.Character
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

function CharacterService.freeze(_self: Service, player: Player, frozen: boolean)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = if frozen then 0 else humanoid.WalkSpeed
		humanoid.AutoRotate = not frozen
	end
end

--[[
	Kills a character and leaves a body behind. The corpse is what turns a
	murder into information for everyone still alive.
]]
function CharacterService.eliminate(_self: Service, player: Player, cause: string)
	local character = player.Character
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
			character.Name = `Corpse_{player.Name}`
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
end

function CharacterService.clearCorpses(_self: Service)
	for _, instance in workspace:GetChildren() do
		if instance:IsA("Model") and string.sub(instance.Name, 1, 7) == "Corpse_" then
			instance:Destroy()
		end
	end
end

function CharacterService.rootOf(_self: Service, player: Player): BasePart?
	local character = player.Character
	if not character then
		return nil
	end
	return character:FindFirstChild("HumanoidRootPart") :: BasePart?
end

function CharacterService.isAlive(_self: Service, player: Player): boolean
	local character = player.Character
	if not character then
		return false
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	return humanoid ~= nil and humanoid.Health > 0
end

function CharacterService.eachPlayer(_self: Service, callback: (Player) -> ())
	for _, player in Players:GetPlayers() do
		callback(player)
	end
end

return CharacterService
