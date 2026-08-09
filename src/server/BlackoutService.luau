--!strict
--[[
	The generator failures that define a round of Hollow Carnival.

	Every ~50 seconds the park loses power for nine seconds: fog closes to arm's
	length, the neon dies, and the murderer gets faster. The schedule is
	published in GameConfig so players learn to count.
]]

local RunService = game:GetService("RunService")

local MapBuilder = require(script.Parent.MapBuilder)

local BlackoutService = {}
BlackoutService.__index = BlackoutService

export type Service = typeof(setmetatable(
	{} :: {
		config: any,
		schedule: { any },
		blend: number,
		target: number,
		active: boolean,
		connection: RBXScriptConnection?,
		lights: { PointLight },
		clock: number,
		onChanged: ((active: boolean, blend: number) -> ())?,
		onWarning: (() -> ())?,
	},
	BlackoutService
))

function BlackoutService.new(config: any): Service
	return setmetatable({
		config = config,
		schedule = {},
		blend = 0,
		target = 0,
		active = false,
		connection = nil,
		lights = {},
		clock = 0,
		onChanged = nil,
		onWarning = nil,
	}, BlackoutService) :: any
end

function BlackoutService.collectLights(self: Service, root: Instance)
	self.lights = {}
	for _, instance in root:GetDescendants() do
		if instance:IsA("PointLight") then
			table.insert(self.lights, instance)
		end
	end
end

function BlackoutService.beginRound(self: Service, schedule: { any })
	self.schedule = {}
	for _, event in schedule do
		table.insert(self.schedule, {
			warnAt = event.warnAt,
			startAt = event.startAt,
			endAt = event.endAt,
			warned = false,
			started = false,
			ended = false,
		})
	end
	self.clock = 0
	self.active = false
	self.target = 0
end

function BlackoutService.endRound(self: Service)
	self.schedule = {}
	self.active = false
	self.target = 0
end

function BlackoutService.start(self: Service)
	self.connection = RunService.Heartbeat:Connect(function(delta)
		BlackoutService.step(self, delta)
	end)
	MapBuilder.applyLighting(self.config, 0)
end

function BlackoutService.tickSchedule(self: Service, delta: number)
	self.clock += delta
	for _, event in self.schedule do
		if not event.warned and self.clock >= event.warnAt then
			event.warned = true
			if self.onWarning then
				self.onWarning()
			end
		end
		if not event.started and self.clock >= event.startAt then
			event.started = true
			self.active = true
			self.target = 1
			if self.onChanged then
				self.onChanged(true, 1)
			end
		end
		if event.started and not event.ended and self.clock >= event.endAt then
			event.ended = true
			self.active = false
			self.target = 0
			if self.onChanged then
				self.onChanged(false, 0)
			end
		end
	end
end

function BlackoutService.step(self: Service, delta: number)
	local transition = self.config.lighting.transitionSeconds
	if self.blend ~= self.target then
		local step = delta / transition
		if self.blend < self.target then
			self.blend = math.min(self.target, self.blend + step)
		else
			self.blend = math.max(self.target, self.blend - step)
		end
		MapBuilder.applyLighting(self.config, self.blend)
		BlackoutService.applyToLights(self)
	end

	-- Flicker runs even at full power; a carnival this old is never steady.
	BlackoutService.flicker(self, delta)
end

function BlackoutService.applyToLights(self: Service)
	for _, light in self.lights do
		if light:GetAttribute("SurvivesBlackout") == true then
			continue
		end
		local base = light:GetAttribute("BaseBrightness")
		if typeof(base) ~= "number" then
			base = light.Brightness
		end
		light.Brightness = (base :: number) * (1 - self.blend * 0.96)
	end
end

function BlackoutService.flicker(self: Service, delta: number)
	self.clock += 0
	for index, light in self.lights do
		local amount = light:GetAttribute("Flicker")
		if typeof(amount) ~= "number" or amount <= 0 then
			continue
		end
		local base = light:GetAttribute("BaseBrightness")
		if typeof(base) ~= "number" then
			continue
		end
		local wave = 0.5 + 0.5 * math.sin(os.clock() * (7 + index % 5) + index)
		local scale = 1 - (amount :: number) * wave
		light.Brightness = (base :: number) * scale * (1 - self.blend * 0.96)
	end
end

function BlackoutService.isActive(self: Service): boolean
	return self.active
end

function BlackoutService.destroy(self: Service)
	if self.connection then
		self.connection:Disconnect()
		self.connection = nil
	end
end

return BlackoutService
