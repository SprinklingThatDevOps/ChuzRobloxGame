--!strict
--[[
	Client entry point.

	The client is a view plus an input forwarder. It keeps its own copy of the
	phase clock so the countdown is smooth between the server's phase
	messages, but it never decides anything a cheater would want to decide.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Net = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Net"))

local Hud = require(script:WaitForChild("Hud"))
local RoleReveal = require(script:WaitForChild("RoleReveal"))
local Atmosphere = require(script:WaitForChild("Atmosphere"))
local Input = require(script:WaitForChild("Input"))

local config = require(ReplicatedStorage:WaitForChild("GameConfig")) :: any

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local camera = workspace.CurrentCamera

local hud = Hud.new(config, playerGui)
local reveal = RoleReveal.new(playerGui)
local atmosphere = Atmosphere.new(config, camera, playerGui)
atmosphere:start()

local state = {
	phase = "Intermission",
	endsAt = os.clock(),
	role = "Spectator",
	alive = false,
	shroudReadyAt = 0,
}

local WEAPON_FOR_ROLE = {
	Murderer = "knife",
	Sheriff = "revolver",
	Hero = "revolver",
}

local function timeLeft(): number
	return math.max(0, state.endsAt - os.clock())
end

local input = Input.new(camera, {
	attack = function()
		Net.event("RequestAttack"):FireServer()
	end,
	shoot = function(direction: Vector3)
		Net.event("RequestShoot"):FireServer(direction)
		atmosphere:kick(1.6)
	end,
	throw = function(direction: Vector3)
		Net.event("RequestThrow"):FireServer(direction)
	end,
	sprint = function(wants: boolean)
		Net.event("RequestSprint"):FireServer(wants)
	end,
	ability = function(name: string)
		if state.role ~= "Murderer" or os.clock() < state.shroudReadyAt then
			return
		end
		Net.event("RequestAbility"):FireServer(name)
	end,
})
input:bind()

local function applyRole(role: string, info: any)
	state.role = role
	state.alive = role ~= "Spectator"
	hud:setRole(role, info)

	local weapon = WEAPON_FOR_ROLE[role] or "none"
	input:setWeapon(weapon)
	hud:setCrosshair(weapon == "revolver")
	atmosphere:setDead(false)

	if role == "Murderer" then
		hud:setAbility("[E] Shroud — ready")
	elseif weapon == "revolver" then
		hud:setAbility("[LMB] Fire — one wrong shot kills you")
	else
		hud:setAbility("[Shift] Run")
	end
end

Net.event("PhaseChanged").OnClientEvent:Connect(function(phase: string, duration: number)
	state.phase = phase
	state.endsAt = os.clock() + duration
	hud:setPhase(phase)

	if phase == "Intermission" then
		applyRole("Spectator", config.roles.spectator)
		hud:setCoins(0)
		atmosphere:setDread(0)
		atmosphere:setBlackout(false)
	elseif phase == "Grace" then
		hud:toastMessage("Find a corner. The knife is already out there.")
	elseif phase == "Round" then
		hud:toastMessage("")
	end
end)

Net.event("RoleAssigned").OnClientEvent:Connect(function(role: string, info: any)
	applyRole(role, info)
	reveal:play(role, info)
end)

Net.event("BlackoutChanged").OnClientEvent:Connect(function(active: boolean)
	atmosphere:setBlackout(active)
	if active then
		atmosphere:kick(2.2)
		hud:toastMessage("The lights are gone.")
	end
end)

Net.event("Announce").OnClientEvent:Connect(function(message: string)
	hud:pushFeed(message)
end)

Net.event("KillFeed").OnClientEvent:Connect(function(entry: any)
	hud:pushFeed(entry.message, Color3.fromRGB(255, 120, 132))
	if entry.victim == player.DisplayName then
		state.alive = false
		input:setWeapon("none")
		hud:setCrosshair(false)
		atmosphere:setDead(true)
		atmosphere:kick(4)
	end
end)

Net.event("CoinCollected").OnClientEvent:Connect(function(total: number)
	hud:setCoins(total)
end)

Net.event("StaminaChanged").OnClientEvent:Connect(function(fraction: number)
	hud:setStamina(fraction)
end)

Net.event("AbilityState").OnClientEvent:Connect(function(name: string, duration: number, cooldown: number)
	if name ~= "shroud" then
		return
	end
	state.shroudReadyAt = os.clock() + cooldown
	hud:setAbility(`Shroud active — {string.format("%.1f", duration)}s`)
end)

Net.event("RoundSummary").OnClientEvent:Connect(function(summary: any)
	hud:toastMessage(`+{summary.earned} tickets · {summary.coins} coins · {summary.tickets} total`)
	atmosphere:setDread(0)
end)

player.CharacterAdded:Connect(function(character)
	atmosphere:attachTo(character)
end)
if player.Character then
	atmosphere:attachTo(player.Character)
end

--[[
	One frame loop drives the countdown, the shroud cooldown readout and the
	dread ramp, so they can never disagree about what time it is.
]]
RunService.RenderStepped:Connect(function()
	local remaining = timeLeft()
	hud:setTimer(remaining)

	if state.phase == "Round" then
		local total = config.round.roundSeconds
		local elapsed = math.clamp((total - remaining) / math.max(total, 1), 0, 1)
		local urgency = if remaining <= config.round.suddenDeathAtSecondsLeft then 1 else elapsed * 0.55
		atmosphere:setDread(urgency)
	end

	if state.role == "Murderer" then
		local cooldown = state.shroudReadyAt - os.clock()
		if cooldown > 0 then
			hud:setAbility(`[E] Shroud — {math.ceil(cooldown)}s`)
		else
			hud:setAbility("[E] Shroud — ready")
		end
	end
end)

-- Roblox's default loading screen fights the mood; the carnival should be
-- the first thing you see.
task.defer(function()
	local ok, snapshot = pcall(function()
		return Net.fn("GetSnapshot"):InvokeServer()
	end)
	if not ok or type(snapshot) ~= "table" then
		return
	end
	state.phase = snapshot.phase
	state.endsAt = os.clock() + snapshot.timeLeft
	hud:setPhase(snapshot.phase)
	hud:setCoins(snapshot.coins)
	applyRole(snapshot.role, config.roles[string.lower(snapshot.role)])
	atmosphere:setBlackout(snapshot.blackout)
end)
