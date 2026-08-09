--!strict
--[[
	Knives, revolvers and the rule that makes the Sheriff's job hard:
	shoot an innocent and you die instead.

	Every hit is decided on the server. Clients only ever ask.
]]

local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local RoundLogic = require(game:GetService("ReplicatedStorage").Shared.RoundLogic)

local WeaponService = {}
WeaponService.__index = WeaponService

export type Hooks = {
	getRole: (player: Player) -> string,
	isAlive: (player: Player) -> boolean,
	onKill: (victim: Player, killer: Player, weapon: string) -> (),
	onGunDropped: (position: Vector3, ammo: number) -> (),
	announce: (player: Player, message: string) -> (),
}

export type Service = typeof(setmetatable(
	{} :: {
		config: any,
		hooks: Hooks,
		state: { [Player]: any },
		projectiles: { any },
		connection: RBXScriptConnection?,
	},
	WeaponService
))

function WeaponService.new(config: any, hooks: Hooks): Service
	local self = setmetatable({
		config = config,
		hooks = hooks,
		state = {},
		projectiles = {},
		connection = nil,
	}, WeaponService)
	self.connection = RunService.Heartbeat:Connect(function(delta)
		WeaponService.stepProjectiles(self :: any, delta)
	end)
	return self :: any
end

local function makeHandle(name: string, size: Vector3, color: Color3, material: Enum.Material): BasePart
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.Color = color
	part.Material = material
	part.CanCollide = false
	part.CanQuery = false
	part.Massless = true
	return part
end

local function buildKnife(): Model
	local model = Instance.new("Model")
	model.Name = "CarnivalKnife"
	local grip = makeHandle("Handle", Vector3.new(0.3, 1, 0.3), Color3.fromRGB(42, 26, 18), Enum.Material.Wood)
	grip.Parent = model
	local blade = makeHandle("Blade", Vector3.new(0.22, 1.7, 0.7), Color3.fromRGB(223, 232, 240), Enum.Material.Metal)
	blade.Parent = model
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = grip
	weld.Part1 = blade
	weld.Parent = grip
	blade.CFrame = grip.CFrame * CFrame.new(0, 1.3, 0)
	model.PrimaryPart = grip
	return model
end

local function buildRevolver(): Model
	local model = Instance.new("Model")
	model.Name = "TicketTakerRevolver"
	local grip = makeHandle("Handle", Vector3.new(0.32, 0.95, 0.42), Color3.fromRGB(58, 36, 24), Enum.Material.Wood)
	grip.Parent = model
	local barrel = makeHandle("Barrel", Vector3.new(0.3, 0.36, 1.9), Color3.fromRGB(176, 176, 188), Enum.Material.Metal)
	barrel.Parent = model
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = grip
	weld.Part1 = barrel
	weld.Parent = grip
	barrel.CFrame = grip.CFrame * CFrame.new(0, 0.6, -0.7)
	model.PrimaryPart = grip
	return model
end

local function attachToHand(model: Model, character: Model)
	local hand = character:FindFirstChild("RightHand") or character:FindFirstChild("Right Arm")
	local primary = model.PrimaryPart
	if not (hand and hand:IsA("BasePart") and primary) then
		return
	end
	model:PivotTo(hand.CFrame * CFrame.new(0, -0.8, -0.4) * CFrame.Angles(math.rad(-90), 0, 0))
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = hand
	weld.Part1 = primary
	weld.Parent = primary
	for _, part in model:GetDescendants() do
		if part:IsA("BasePart") and part ~= primary then
			local extra = Instance.new("WeldConstraint")
			extra.Part0 = primary
			extra.Part1 = part
			extra.Parent = primary
		end
	end
	model.Parent = character
end

function WeaponService.reset(self: Service)
	for player in self.state do
		WeaponService.clear(self, player)
	end
	self.state = {}
	for _, projectile in self.projectiles do
		if projectile.part.Parent then
			projectile.part:Destroy()
		end
	end
	self.projectiles = {}
end

function WeaponService.clear(_self: Service, player: Player)
	local character = player.Character
	if not character then
		return
	end
	for _, child in character:GetChildren() do
		if child:IsA("Model") and (child.Name == "CarnivalKnife" or child.Name == "TicketTakerRevolver") then
			child:Destroy()
		end
	end
end

function WeaponService.giveKnife(self: Service, player: Player)
	local character = player.Character
	if not character then
		return
	end
	WeaponService.clear(self, player)
	attachToHand(buildKnife(), character)
	self.state[player] = {
		weapon = "knife",
		nextSlash = 0,
		nextThrow = 0,
		ammo = 0,
	}
end

function WeaponService.giveRevolver(self: Service, player: Player, ammo: number?)
	local character = player.Character
	if not character then
		return
	end
	WeaponService.clear(self, player)
	attachToHand(buildRevolver(), character)
	self.state[player] = {
		weapon = "revolver",
		nextShot = 0,
		ammo = ammo or self.config.weapons.revolver.magazine,
		reloading = false,
	}
end

function WeaponService.hasWeapon(self: Service, player: Player, weapon: string): boolean
	local state = self.state[player]
	return state ~= nil and state.weapon == weapon
end

function WeaponService.ammoOf(self: Service, player: Player): number
	local state = self.state[player]
	return if state then state.ammo else 0
end

local function characterOf(instance: Instance?): (Player?, Model?)
	local cursor = instance
	while cursor and cursor ~= workspace do
		if cursor:IsA("Model") then
			local player = Players:GetPlayerFromCharacter(cursor)
			if player then
				return player, cursor
			end
		end
		cursor = cursor.Parent
	end
	return nil, nil
end

--[[
	Knife swing: everything alive inside a cone in front of the murderer.
	The arc is generous because chasing someone around a tent pole with a
	pixel-perfect hitbox is miserable.
]]
function WeaponService.slash(self: Service, player: Player): boolean
	local state = self.state[player]
	if not state or state.weapon ~= "knife" then
		return false
	end
	local now = os.clock()
	if now < state.nextSlash then
		return false
	end

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return false
	end
	state.nextSlash = now + self.config.weapons.knife.slashCooldown

	local knife = self.config.weapons.knife
	local cosLimit = math.cos(math.rad(knife.slashArcDegrees / 2))
	local origin = root.Position
	local facing = root.CFrame.LookVector

	local hitSomething = false
	for _, other in Players:GetPlayers() do
		if other == player or not self.hooks.isAlive(other) then
			continue
		end
		if self.hooks.getRole(other) == RoundLogic.Role.Murderer then
			continue
		end
		local otherRoot = other.Character and other.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
		if not otherRoot then
			continue
		end
		local offset = otherRoot.Position - origin
		if offset.Magnitude > knife.slashRange then
			continue
		end
		if offset.Unit:Dot(facing) < cosLimit then
			continue
		end
		self.hooks.onKill(other, player, "knife")
		hitSomething = true
	end
	return hitSomething
end

--[[
	Thrown knife: a real projectile the victim can dodge, stepped by hand so
	the flight path is identical for everyone on the server.
]]
function WeaponService.throwKnife(self: Service, player: Player, direction: Vector3): boolean
	local state = self.state[player]
	if not state or state.weapon ~= "knife" then
		return false
	end
	local now = os.clock()
	if now < state.nextThrow then
		return false
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return false
	end
	local knife = self.config.weapons.knife
	state.nextThrow = now + knife.throwCooldown

	local part = makeHandle("ThrownKnife", Vector3.new(0.25, 0.4, 2), Color3.fromRGB(223, 232, 240), Enum.Material.Metal)
	part.CFrame = CFrame.new(root.Position + direction.Unit * 3, root.Position + direction.Unit * 6)
	part.Anchored = true
	part.CanQuery = false
	part.Parent = workspace

	table.insert(self.projectiles, {
		part = part,
		owner = player,
		velocity = direction.Unit * knife.throwSpeed,
		life = knife.throwLifetime,
		gravity = workspace.Gravity * knife.throwGravityScale,
	})
	return true
end

function WeaponService.stepProjectiles(self: Service, delta: number)
	if #self.projectiles == 0 then
		return
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude

	for index = #self.projectiles, 1, -1 do
		local projectile = self.projectiles[index]
		projectile.life -= delta
		if projectile.life <= 0 or not projectile.part.Parent then
			if projectile.part.Parent then
				Debris:AddItem(projectile.part, 6)
				projectile.part.Anchored = false
			end
			table.remove(self.projectiles, index)
			continue
		end

		projectile.velocity -= Vector3.new(0, projectile.gravity * delta, 0)
		local from = projectile.part.Position
		local step = projectile.velocity * delta

		local ownerCharacter = projectile.owner.Character
		params.FilterDescendantsInstances = if ownerCharacter then { ownerCharacter, projectile.part } else { projectile.part }
		local result = workspace:Raycast(from, step, params)

		if result then
			local victim = characterOf(result.Instance)
			if victim and self.hooks.isAlive(victim) and self.hooks.getRole(victim) ~= RoundLogic.Role.Murderer then
				self.hooks.onKill(victim, projectile.owner, "knife")
			end
			projectile.part.Position = result.Position
			projectile.part.Anchored = false
			Debris:AddItem(projectile.part, 8)
			table.remove(self.projectiles, index)
		else
			projectile.part.CFrame = CFrame.new(from + step, from + step * 2)
		end
	end
end

--[[
	Revolver. A hit on the murderer ends the round; a hit on anyone else ends
	the shooter. That single rule is what makes an armed player think.
]]
function WeaponService.shoot(self: Service, player: Player, direction: Vector3): boolean
	local state = self.state[player]
	if not state or state.weapon ~= "revolver" then
		return false
	end
	local now = os.clock()
	if now < state.nextShot or state.ammo <= 0 then
		return false
	end

	local character = player.Character
	local head = character and character:FindFirstChild("Head") :: BasePart?
	if not head then
		return false
	end

	local revolver = self.config.weapons.revolver
	state.ammo -= 1
	state.nextShot = now + revolver.fireCooldown
	if state.ammo <= 0 then
		state.nextShot = now + revolver.reloadSeconds
		state.ammo = revolver.magazine
		self.hooks.announce(player, "Reloading")
	end

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character :: Instance }
	local result = workspace:Raycast(head.Position, direction.Unit * revolver.range, params)

	WeaponService.drawTracer(self, head.Position, if result then result.Position else head.Position + direction.Unit * revolver.range)

	if not result then
		return true
	end
	local victim = characterOf(result.Instance)
	if not victim or not self.hooks.isAlive(victim) then
		return true
	end

	self.hooks.onKill(victim, player, "revolver")
	return true
end

function WeaponService.drawTracer(_self: Service, from: Vector3, to: Vector3)
	local delta = to - from
	local tracer = Instance.new("Part")
	tracer.Name = "Tracer"
	tracer.Anchored = true
	tracer.CanCollide = false
	tracer.CanQuery = false
	tracer.CastShadow = false
	tracer.Material = Enum.Material.Neon
	tracer.Color = Color3.fromRGB(255, 214, 96)
	tracer.Size = Vector3.new(0.12, 0.12, math.max(delta.Magnitude, 0.1))
	tracer.CFrame = CFrame.new(from + delta / 2, to)
	tracer.Parent = workspace
	Debris:AddItem(tracer, 0.12)
end

--[[
	When an armed player dies their revolver hits the floor, and whoever picks
	it up becomes the Hero. This is the comeback mechanic.
]]
function WeaponService.dropRevolver(self: Service, player: Player)
	local state = self.state[player]
	if not state or state.weapon ~= "revolver" then
		return
	end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	self.state[player] = nil
	WeaponService.clear(self, player)
	if not root then
		return
	end
	self.hooks.onGunDropped(root.Position + Vector3.new(0, 1, 0), state.ammo)
end

function WeaponService.destroy(self: Service)
	if self.connection then
		self.connection:Disconnect()
		self.connection = nil
	end
	WeaponService.reset(self)
end

return WeaponService
