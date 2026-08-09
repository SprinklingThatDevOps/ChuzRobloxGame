--!strict
--[[
	The round loop.

	Intermission -> Grace -> Round -> PostRound, forever. All of the rules it
	enforces live in ReplicatedStorage.Shared.RoundLogic, which is pure and
	covered by tests; this file is the part that has to talk to players.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local RoundLogic = require(ReplicatedStorage.Shared.RoundLogic)
local Net = require(ReplicatedStorage.Shared.Net)
local Types = require(ReplicatedStorage.Shared.Types)

local CharacterService = require(script.Parent.CharacterService)
local WeaponService = require(script.Parent.WeaponService)
local CoinService = require(script.Parent.CoinService)
local BlackoutService = require(script.Parent.BlackoutService)
local BotService = require(script.Parent.BotService)

local GameService = {}
GameService.__index = GameService

type Record = {
	role: string,
	alive: boolean,
	coins: number,
	kills: number,
	killedMurderer: boolean,
	roleCooldown: number,
	sprinting: boolean,
	stamina: number,
	staminaIdle: number,
	shroudUntil: number,
	shroudReadyAt: number,
}

export type Service = typeof(setmetatable(
	{} :: {
		config: any,
		mapData: any,
		characters: CharacterService.Service,
		weapons: WeaponService.Service,
		coins: CoinService.Service,
		blackout: BlackoutService.Service,
		bots: BotService.Service,
		records: { [Types.Combatant]: Record },
		combatants: { Types.Combatant },
		byPlayer: { [Player]: Types.Combatant },
		byCharacter: { [Model]: Types.Combatant },
		phase: string,
		phaseEndsAt: number,
		outcome: string,
		droppedGuns: { any },
		running: boolean,
	},
	GameService
))

local function now(): number
	return os.clock()
end

function GameService.new(config: any, mapData: any, mapHandle: any): Service
	local self = setmetatable({
		config = config,
		mapData = mapData,
		characters = CharacterService.new(config),
		coins = CoinService.new(config, mapData),
		blackout = BlackoutService.new(config),
		records = {},
		combatants = {},
		byPlayer = {},
		byCharacter = {},
		phase = RoundLogic.Phase.Intermission,
		phaseEndsAt = 0,
		outcome = RoundLogic.Outcome.None,
		droppedGuns = {},
		running = false,
	}, GameService)

	local function roleOf(combatant: Types.Combatant): string
		local record = self.records[combatant]
		return if record then record.role else RoundLogic.Role.Spectator
	end
	local function aliveOf(combatant: Types.Combatant): boolean
		local record = self.records[combatant]
		return record ~= nil and record.alive
	end

	self.weapons = WeaponService.new(config, {
		getRole = roleOf,
		isAlive = aliveOf,
		onKill = function(victim: Types.Combatant, killer: Types.Combatant, weapon: string)
			GameService.handleKill(self :: any, victim, killer, weapon)
		end,
		onGunDropped = function(position: Vector3, ammo: number)
			GameService.spawnGunPickup(self :: any, position, ammo)
		end,
		announce = function(combatant: Types.Combatant, message: string)
			if combatant.player then
				Net.event("Announce"):FireClient(combatant.player, message)
			end
		end,
		combatants = function(): { Types.Combatant }
			return self.combatants
		end,
		fromCharacter = function(character: Model): Types.Combatant?
			return self.byCharacter[character]
		end,
		characterOf = function(combatant: Types.Combatant): Model?
			return self.characters:characterOf(combatant)
		end,
	})

	self.bots = BotService.new(config, mapData, self.characters, self.weapons, {
		getRole = roleOf,
		isAlive = aliveOf,
		combatants = function(): { Types.Combatant }
			return self.combatants
		end,
		phase = function(): string
			return self.phase
		end,
		blackout = function(): boolean
			return self.blackout:isActive()
		end,
	})

	self.blackout:collectLights(mapHandle.root)
	self.blackout.onChanged = function(active: boolean, blend: number)
		Net.event("BlackoutChanged"):FireAllClients(active, blend)
		GameService.refreshSpeeds(self :: any)
		GameService.announceAll(self :: any, if active then "BLACKOUT — the midway goes dark" else "Power restored")
	end
	self.blackout.onWarning = function()
		GameService.announceAll(self :: any, "The generator is coughing…")
	end

	self.coins.canCollect = function(player: Player): boolean
		local record = self.records[self.byPlayer[player]]
		return record ~= nil and record.alive and record.role ~= RoundLogic.Role.Murderer and self.phase == RoundLogic.Phase.Round
	end
	self.coins.onCollect = function(player: Player, value: number)
		local record = self.records[self.byPlayer[player]]
		if not record then
			return
		end
		record.coins += value
		Net.event("CoinCollected"):FireClient(player, record.coins)
	end

	return self :: any
end

function GameService.blankRecord(): Record
	return {
		role = RoundLogic.Role.Spectator,
		alive = false,
		coins = 0,
		kills = 0,
		killedMurderer = false,
		roleCooldown = 0,
		sprinting = false,
		stamina = 100,
		staminaIdle = 0,
		shroudUntil = 0,
		shroudReadyAt = 0,
	}
end

--[[
	Registration. Players and bots both arrive here; the registry is what lets
	a bullet fired at a character find the record behind it.
]]
function GameService.register(self: Service, combatant: Types.Combatant)
	local record = GameService.blankRecord()
	record.stamina = self.config.movement.staminaMax
	self.records[combatant] = record
	table.insert(self.combatants, combatant)
end

function GameService.unregister(self: Service, combatant: Types.Combatant)
	self.records[combatant] = nil
	local index = table.find(self.combatants, combatant)
	if index then
		table.remove(self.combatants, index)
	end
	if combatant.character then
		self.byCharacter[combatant.character] = nil
	end
end

function GameService.trackCharacter(self: Service, combatant: Types.Combatant)
	local character = self.characters:characterOf(combatant)
	if character then
		self.byCharacter[character] = combatant
		combatant.character = character
	end
end

--[[
	Forgets the body a combatant is currently wearing. Called before handing a
	bot a fresh rig, so the registry cannot accumulate entries pointing at
	destroyed models.
]]
function GameService.untrackCharacter(self: Service, combatant: Types.Combatant)
	if combatant.character then
		self.byCharacter[combatant.character] = nil
	end
end

function GameService.addPlayer(self: Service, player: Player)
	local combatant: Types.Combatant = {
		id = player.UserId,
		name = player.DisplayName,
		player = player,
		character = nil,
		isBot = false,
	}
	self.byPlayer[player] = combatant
	GameService.register(self, combatant)

	local spawnList = self.mapData.spawns.lobby
	local spawnSpec = spawnList[(math.abs(player.UserId) % #spawnList) + 1]
	self.characters:spawnAt(combatant, spawnSpec)
	GameService.trackCharacter(self, combatant)
	Net.event("PhaseChanged"):FireClient(player, self.phase, math.max(0, self.phaseEndsAt - now()))
end

function GameService.removePlayer(self: Service, player: Player)
	local combatant = self.byPlayer[player]
	if combatant then
		GameService.unregister(self, combatant)
	end
	self.byPlayer[player] = nil
end

function GameService.humanCount(self: Service): number
	local count = 0
	for _, combatant in self.combatants do
		if not combatant.isBot then
			count += 1
		end
	end
	return count
end

--[[
	Bots are re-established every intermission so the population tracks the
	number of humans present. Their records live alongside the players'.
]]
function GameService.refreshBots(self: Service)
	for _, combatant in self.bots:combatants() do
		GameService.unregister(self, combatant)
	end
	self.bots:despawnAll()
	self.bots:fill(GameService.humanCount(self))
	for _, combatant in self.bots:combatants() do
		GameService.register(self, combatant)
	end
end

function GameService.announceAll(_self: Service, message: string)
	Net.event("Announce"):FireAllClients(message)
end

function GameService.eligible(self: Service): { Types.Combatant }
	local list = {}
	for _, combatant in self.combatants do
		if self.records[combatant] then
			table.insert(list, combatant)
		end
	end
	return list
end

function GameService.statesForOutcome(self: Service): { { role: string, alive: boolean } }
	local states = {}
	for _, record in self.records do
		table.insert(states, { role = record.role, alive = record.alive })
	end
	return states
end

--[[
	Movement speed is recomputed whenever anything that affects it changes:
	role, sprint, blackout or the murderer's Shroud.
]]
function GameService.refreshSpeeds(self: Service)
	local movement = self.config.movement
	for combatant, record in self.records do
		if not record.alive then
			continue
		end
		local speed = if record.sprinting and record.stamina > 0 then movement.sprintSpeed else movement.walkSpeed
		if record.role == RoundLogic.Role.Murderer then
			speed += movement.murdererSpeedBonus
			if self.blackout:isActive() then
				speed *= self.config.blackout.murdererSpeedMultiplier
			end
			if now() < record.shroudUntil then
				speed *= self.config.abilities.shroud.speedMultiplier
			end
		end
		self.characters:setSpeed(combatant, speed)
	end
end

function GameService.setPhase(self: Service, phase: string)
	self.phase = phase
	self.phaseEndsAt = now() + RoundLogic.phaseDuration(self.config, phase)
	Net.event("PhaseChanged"):FireAllClients(phase, RoundLogic.phaseDuration(self.config, phase))
end

function GameService.startRound(self: Service)
	local roster = GameService.eligible(self)
	local seeds = {}
	for index, combatant in roster do
		local record = self.records[combatant]
		table.insert(seeds, { id = index, roleCooldown = record.roleCooldown })
	end

	local assignment = RoundLogic.assignRoles(self.config, seeds)

	local spawns = self.mapData.spawns.round
	local order = {}
	for index = 1, #spawns do
		table.insert(order, index)
	end
	for i = #order, 2, -1 do
		local j = math.random(i)
		order[i], order[j] = order[j], order[i]
	end

	self.characters:clearCorpses()
	self.weapons:reset()
	GameService.clearGunPickups(self)
	self.coins:respawnAll()

	for index, combatant in roster do
		local record = self.records[combatant]
		record.role = assignment[index] or RoundLogic.Role.Innocent
		record.alive = true
		record.coins = 0
		record.kills = 0
		record.killedMurderer = false
		record.stamina = self.config.movement.staminaMax
		record.shroudUntil = 0
		record.shroudReadyAt = 0

		if record.role == RoundLogic.Role.Innocent then
			record.roleCooldown = math.max(0, record.roleCooldown - 1)
		else
			record.roleCooldown = self.config.assignment.recentRoleCooldownRounds
		end

		local spawnSpec = spawns[order[((index - 1) % #order) + 1]]
		if combatant.isBot then
			GameService.untrackCharacter(self, combatant)
			self.bots:spawnBody(combatant)
		end
		self.characters:spawnAt(combatant, spawnSpec)
		GameService.trackCharacter(self, combatant)

		if record.role == RoundLogic.Role.Murderer then
			self.weapons:giveKnife(combatant)
		elseif record.role == RoundLogic.Role.Sheriff then
			self.weapons:giveRevolver(combatant)
		end

		local roleInfo = self.config.roles[string.lower(record.role)]
		if combatant.player then
			Net.event("RoleAssigned"):FireClient(combatant.player, record.role, roleInfo)
		end
	end

	self.outcome = RoundLogic.Outcome.None
	self.blackout:beginRound(RoundLogic.blackoutSchedule(self.config))
	GameService.refreshSpeeds(self)
end

function GameService.handleKill(self: Service, victim: Types.Combatant, killer: Types.Combatant, weapon: string)
	local victimRecord = self.records[victim]
	local killerRecord = self.records[killer]
	if not victimRecord or not killerRecord or not victimRecord.alive then
		return
	end

	-- Shooting an innocent is fatal to the shooter. It is the whole reason
	-- being handed the revolver is a burden and not a win button.
	local misfire = weapon == "revolver" and victimRecord.role ~= RoundLogic.Role.Murderer

	victimRecord.alive = false
	local victimBody = self.characters:characterOf(victim)
	self.weapons:dropRevolver(victim)
	self.characters:eliminate(victim, weapon)
	if victimBody then
		self.byCharacter[victimBody] = nil
	end

	if misfire then
		killerRecord.alive = false
		local killerBody = self.characters:characterOf(killer)
		self.weapons:dropRevolver(killer)
		self.characters:eliminate(killer, "misfire")
		if killerBody then
			self.byCharacter[killerBody] = nil
		end
		Net.event("KillFeed"):FireAllClients({
			victim = victim.name,
			killer = killer.name,
			weapon = weapon,
			message = `{killer.name} shot an innocent and paid for it`,
		})
	else
		killerRecord.kills += 1
		if victimRecord.role == RoundLogic.Role.Murderer then
			killerRecord.killedMurderer = true
		end
		Net.event("KillFeed"):FireAllClients({
			victim = victim.name,
			killer = if weapon == "revolver" then killer.name else nil,
			weapon = weapon,
			message = if weapon == "revolver"
				then `{killer.name} put down the murderer`
				else `{victim.name} was found dead`,
		})
	end

	GameService.checkOutcome(self)
end

function GameService.checkOutcome(self: Service)
	if self.phase ~= RoundLogic.Phase.Round then
		return
	end
	local secondsLeft = math.max(0, self.phaseEndsAt - now())
	local outcome = RoundLogic.evaluateOutcome(GameService.statesForOutcome(self), secondsLeft)
	if outcome ~= RoundLogic.Outcome.None then
		self.outcome = outcome
		self.phaseEndsAt = now()
	end
end

--[[
	A dropped revolver waiting on the ground. First innocent to touch it
	becomes the Hero.
]]
function GameService.spawnGunPickup(self: Service, position: Vector3, ammo: number)
	local part = Instance.new("Part")
	part.Name = "DroppedRevolver"
	part.Size = Vector3.new(1.6, 0.5, 2.6)
	part.Position = position
	part.Color = Color3.fromRGB(176, 176, 188)
	part.Material = Enum.Material.Metal
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false

	local glow = Instance.new("PointLight")
	glow.Color = Color3.fromRGB(255, 214, 96)
	glow.Range = 16
	glow.Brightness = 2
	glow.Parent = part

	part.Parent = workspace
	table.insert(self.droppedGuns, { part = part, ammo = ammo, taken = false })
end

function GameService.clearGunPickups(self: Service)
	for _, drop in self.droppedGuns do
		if drop.part.Parent then
			drop.part:Destroy()
		end
	end
	self.droppedGuns = {}
end

function GameService.stepGunPickups(self: Service)
	if #self.droppedGuns == 0 then
		return
	end
	for _, drop in self.droppedGuns do
		if drop.taken then
			continue
		end
		for combatant, record in self.records do
			if not record.alive or record.role == RoundLogic.Role.Murderer then
				continue
			end
			if self.weapons:hasWeapon(combatant, "revolver") then
				continue
			end
			local root = self.characters:rootOf(combatant)
			if not root or (root.Position - drop.part.Position).Magnitude > 6 then
				continue
			end
			drop.taken = true
			drop.part:Destroy()
			record.role = RoundLogic.Role.Hero
			self.weapons:giveRevolver(combatant, drop.ammo)
			if combatant.player then
				Net.event("RoleAssigned"):FireClient(combatant.player, record.role, self.config.roles.hero)
			end
			GameService.announceAll(self, `{combatant.name} picked up the revolver`)
			break
		end
	end
end

function GameService.stepStamina(self: Service, delta: number)
	local movement = self.config.movement
	for combatant, record in self.records do
		if not record.alive or combatant.isBot then
			continue
		end
		local before = record.stamina
		if record.sprinting and record.stamina > 0 then
			record.stamina = math.max(0, record.stamina - movement.staminaDrainPerSecond * delta)
			record.staminaIdle = 0
			if record.stamina == 0 then
				record.sprinting = false
				GameService.refreshSpeeds(self)
			end
		else
			record.staminaIdle += delta
			if record.staminaIdle >= movement.staminaRegenDelay then
				record.stamina = math.min(movement.staminaMax, record.stamina + movement.staminaRegenPerSecond * delta)
			end
		end
		if math.abs(record.stamina - before) > 0.5 and combatant.player then
			Net.event("StaminaChanged"):FireClient(combatant.player, record.stamina / movement.staminaMax)
		end
	end
end

function GameService.stepShroud(self: Service)
	for combatant, record in self.records do
		if record.role ~= RoundLogic.Role.Murderer or not record.alive then
			continue
		end
		if record.shroudUntil > 0 and now() >= record.shroudUntil then
			record.shroudUntil = 0
			self.characters:setTransparency(combatant, 0)
			GameService.refreshSpeeds(self)
		end
	end
end

function GameService.bindRemotes(self: Service)
	Net.event("RequestAttack").OnServerEvent:Connect(function(player: Player)
		local combatant = self.byPlayer[player]
		local record = combatant and self.records[combatant]
		if not combatant or not record or not record.alive or self.phase ~= RoundLogic.Phase.Round then
			return
		end
		self.weapons:slash(combatant)
	end)

	Net.event("RequestThrow").OnServerEvent:Connect(function(player: Player, direction: any)
		local combatant = self.byPlayer[player]
		local record = combatant and self.records[combatant]
		if not combatant or not record or not record.alive or self.phase ~= RoundLogic.Phase.Round then
			return
		end
		if typeof(direction) ~= "Vector3" or direction.Magnitude < 0.01 then
			return
		end
		self.weapons:throwKnife(combatant, direction)
	end)

	Net.event("RequestShoot").OnServerEvent:Connect(function(player: Player, direction: any)
		local combatant = self.byPlayer[player]
		local record = combatant and self.records[combatant]
		if not combatant or not record or not record.alive or self.phase ~= RoundLogic.Phase.Round then
			return
		end
		if typeof(direction) ~= "Vector3" or direction.Magnitude < 0.01 then
			return
		end
		self.weapons:shoot(combatant, direction)
	end)

	Net.event("RequestSprint").OnServerEvent:Connect(function(player: Player, wants: any)
		local record = self.records[self.byPlayer[player]]
		if not record or not record.alive then
			return
		end
		record.sprinting = wants == true and record.stamina > 1
		GameService.refreshSpeeds(self)
	end)

	Net.event("RequestAbility").OnServerEvent:Connect(function(player: Player, ability: any)
		local combatant = self.byPlayer[player]
		local record = combatant and self.records[combatant]
		if not combatant or not record or not record.alive or ability ~= "shroud" then
			return
		end
		if record.role ~= RoundLogic.Role.Murderer or now() < record.shroudReadyAt then
			return
		end
		local shroud = self.config.abilities.shroud
		record.shroudUntil = now() + shroud.duration
		record.shroudReadyAt = now() + shroud.cooldown
		self.characters:setTransparency(combatant, shroud.transparency)
		GameService.refreshSpeeds(self)
		Net.event("AbilityState"):FireClient(player, "shroud", shroud.duration, shroud.cooldown)
	end)

	Net.fn("GetSnapshot").OnServerInvoke = function(player: Player)
		local record = self.records[self.byPlayer[player]]
		return {
			phase = self.phase,
			timeLeft = math.max(0, self.phaseEndsAt - now()),
			role = if record then record.role else RoundLogic.Role.Spectator,
			coins = if record then record.coins else 0,
			blackout = self.blackout:isActive(),
		}
	end
end

function GameService.awardPayouts(self: Service)
	local innocentsWon = self.outcome == RoundLogic.Outcome.InnocentsWin or self.outcome == RoundLogic.Outcome.TimeUp
	for combatant, record in self.records do
		if not combatant.player then
			continue
		end
		local player = combatant.player
		local teamWon = if record.role == RoundLogic.Role.Murderer then not innocentsWon else innocentsWon
		local amount = RoundLogic.payout(self.config, {
			role = record.role,
			survived = record.alive,
			coins = record.coins,
			kills = record.kills,
			killedMurderer = record.killedMurderer,
			teamWon = teamWon,
		})
		local total = (player:GetAttribute("Tickets") or 0) :: number
		player:SetAttribute("Tickets", total + amount)
		Net.event("RoundSummary"):FireClient(player, {
			outcome = self.outcome,
			role = record.role,
			coins = record.coins,
			earned = amount,
			tickets = total + amount,
		})
	end
end

--[[
	The loop itself. Each phase is a bounded wait, so a stuck round is
	impossible: even a total logic failure ends when the clock runs out.
]]
function GameService.run(self: Service)
	self.running = true
	GameService.bindRemotes(self)
	self.coins:start()
	self.blackout:start()
	self.bots:start()

	RunService.Heartbeat:Connect(function(delta)
		if self.phase == RoundLogic.Phase.Round then
			self.blackout:tickSchedule(delta)
			GameService.stepGunPickups(self)
			GameService.stepShroud(self)
			GameService.checkOutcome(self)
		end
		GameService.stepStamina(self, delta)
	end)

	task.spawn(function()
		while self.running do
			GameService.setPhase(self, RoundLogic.Phase.Intermission)
			self.characters:clearCorpses()
			self.weapons:reset()
			GameService.clearGunPickups(self)
			self.blackout:endRound()

			-- Bots are rebuilt here, before the headcount is taken, so the
			-- filler shrinks as real players arrive.
			GameService.refreshBots(self)

			-- Bots wait out the intermission on a pad like everyone else. It
			-- costs a rig each, and it is the difference between a lobby that
			-- looks populated and one that looks broken.
			local spawns = self.mapData.spawns.lobby
			local slot = 0
			for combatant, record in self.records do
				record.role = RoundLogic.Role.Spectator
				record.alive = false
				if combatant.isBot then
					GameService.untrackCharacter(self, combatant)
					self.bots:spawnBody(combatant)
				end
				self.characters:spawnAt(combatant, spawns[(slot % #spawns) + 1])
				GameService.trackCharacter(self, combatant)
				slot += 1
			end

			while now() < self.phaseEndsAt do
				task.wait(0.25)
			end

			if #GameService.eligible(self) < self.config.round.minPlayers then
				GameService.announceAll(self, "Waiting for more players…")
				task.wait(2)
				continue
			end

			GameService.setPhase(self, RoundLogic.Phase.Grace)
			GameService.startRound(self)
			while now() < self.phaseEndsAt do
				task.wait(0.1)
			end

			GameService.setPhase(self, RoundLogic.Phase.Round)
			while now() < self.phaseEndsAt and self.outcome == RoundLogic.Outcome.None do
				task.wait(0.1)
			end
			if self.outcome == RoundLogic.Outcome.None then
				self.outcome = RoundLogic.Outcome.TimeUp
			end

			GameService.setPhase(self, RoundLogic.Phase.PostRound)
			GameService.awardPayouts(self)
			GameService.announceAll(self, GameService.describeOutcome(self.outcome))
			while now() < self.phaseEndsAt do
				task.wait(0.25)
			end
		end
	end)
end

function GameService.describeOutcome(_outcome: string): string
	if _outcome == RoundLogic.Outcome.InnocentsWin then
		return "The murderer is down — innocents win"
	elseif _outcome == RoundLogic.Outcome.MurderersWin then
		return "Nobody left to scream — murderer wins"
	elseif _outcome == RoundLogic.Outcome.TimeUp then
		return "Dawn breaks — survivors win"
	end
	return "Round over"
end

return GameService
