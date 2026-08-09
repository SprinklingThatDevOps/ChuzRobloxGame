--!strict
--[[
	Everything the client does to make the park feel wrong.

	The server owns Lighting during a blackout (so every player sees the same
	darkness), but the per-player layer — grade, blur, vignette, camera shake,
	the little lantern that keeps you from being completely blind — lives here
	because it should respond to *your* round, not the server's tick rate.
]]

local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Atmosphere = {}
Atmosphere.__index = Atmosphere

export type Controller = typeof(setmetatable(
	{} :: {
		config: any,
		camera: Camera,
		grade: ColorCorrectionEffect,
		blur: BlurEffect,
		bloom: BloomEffect,
		vignette: Frame,
		vignetteEdges: { Frame },
		lantern: PointLight,
		blackout: number,
		blackoutTarget: number,
		dread: number,
		dreadTarget: number,
		dead: boolean,
		shake: number,
		clock: number,
		connection: RBXScriptConnection?,
	},
	Atmosphere
))

local function ensureEffect<T>(className: string, name: string): T
	local existing = Lighting:FindFirstChild(name)
	if existing then
		return existing :: any
	end
	local effect = Instance.new(className :: any)
	effect.Name = name
	effect.Parent = Lighting
	return effect :: any
end

--[[
	A four-sided gradient vignette. Cheaper than an image, and it scales to
	any aspect ratio without going soft in the corners.
]]
local function buildVignette(parent: Instance): (Frame, { Frame })
	local root = Instance.new("Frame")
	root.Name = "Vignette"
	root.Size = UDim2.fromScale(1, 1)
	root.BackgroundTransparency = 1
	root.Parent = parent

	local edges: { Frame } = {}
	local sides = {
		{ name = "Top", size = UDim2.new(1, 0, 0.34, 0), pos = UDim2.fromScale(0, 0), rotation = 90 },
		{ name = "Bottom", size = UDim2.new(1, 0, 0.34, 0), pos = UDim2.fromScale(0, 0.66), rotation = 270 },
		{ name = "Left", size = UDim2.new(0.26, 0, 1, 0), pos = UDim2.fromScale(0, 0), rotation = 0 },
		{ name = "Right", size = UDim2.new(0.26, 0, 1, 0), pos = UDim2.fromScale(0.74, 0), rotation = 180 },
	}

	for _, side in sides do
		local frame = Instance.new("Frame")
		frame.Name = side.name
		frame.Size = side.size
		frame.Position = side.pos
		frame.BackgroundColor3 = Color3.new(0, 0, 0)
		frame.BackgroundTransparency = 1
		frame.BorderSizePixel = 0
		frame.Parent = root

		local gradient = Instance.new("UIGradient")
		gradient.Rotation = side.rotation
		gradient.Transparency = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 1),
			NumberSequenceKeypoint.new(1, 0),
		})
		gradient.Parent = frame

		table.insert(edges, frame)
	end

	return root, edges
end

function Atmosphere.new(config: any, camera: Camera, guiParent: Instance): Controller
	local gui = Instance.new("ScreenGui")
	gui.Name = "HollowAtmosphere"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = -1
	gui.Parent = guiParent

	local vignette, edges = buildVignette(gui)

	local lantern = Instance.new("PointLight")
	lantern.Name = "HollowLantern"
	lantern.Color = Color3.fromRGB(255, 206, 150)
	lantern.Range = 26
	lantern.Brightness = 0
	lantern.Shadows = false

	local self = setmetatable({
		config = config,
		camera = camera,
		grade = ensureEffect("ColorCorrectionEffect", "CarnivalGrade"),
		blur = ensureEffect("BlurEffect", "CarnivalBlur"),
		bloom = ensureEffect("BloomEffect", "CarnivalBloom"),
		vignette = vignette,
		vignetteEdges = edges,
		lantern = lantern,
		blackout = 0,
		blackoutTarget = 0,
		dread = 0,
		dreadTarget = 0,
		dead = false,
		shake = 0,
		clock = 0,
	}, Atmosphere)

	return self :: any
end

function Atmosphere.attachTo(self: Controller, character: Model)
	local root = character:FindFirstChild("HumanoidRootPart")
	if root then
		self.lantern.Parent = root
	end
end

function Atmosphere.setBlackout(self: Controller, active: boolean)
	self.blackoutTarget = if active then 1 else 0
end

--[[
	Dread ramps with the round clock. It is the difference between the first
	minute (a carnival) and the last thirty seconds (a hunt).
]]
function Atmosphere.setDread(self: Controller, amount: number)
	self.dreadTarget = math.clamp(amount, 0, 1)
end

function Atmosphere.setDead(self: Controller, dead: boolean)
	self.dead = dead
	TweenService:Create(self.grade, TweenInfo.new(1.2), {
		Saturation = if dead then -0.85 else 0.12,
	}):Play()
end

function Atmosphere.kick(self: Controller, strength: number)
	self.shake = math.max(self.shake, strength)
end

function Atmosphere.start(self: Controller)
	self.connection = RunService.RenderStepped:Connect(function(delta)
		self.clock += delta

		-- Exponential approach rather than a tween: state can change again
		-- mid-blend (blackouts overlap sudden death) and this never fights
		-- itself the way overlapping tweens do.
		local blend = 1 - math.exp(-delta * 3.2)
		self.blackout += (self.blackoutTarget - self.blackout) * blend
		self.dread += (self.dreadTarget - self.dread) * (1 - math.exp(-delta * 1.1))

		local pulse = (math.sin(self.clock * (2.2 + self.dread * 2.4)) * 0.5 + 0.5) * self.dread

		self.grade.Brightness = -0.05 * self.blackout
		self.grade.Contrast = 0.16 + 0.22 * self.blackout + 0.08 * self.dread
		self.grade.TintColor = Color3.new(1, 1, 1):Lerp(Color3.fromRGB(196, 214, 255), self.blackout * 0.7)

		self.bloom.Intensity = 1.35 + 0.9 * self.blackout
		self.blur.Size = 2.5 * self.blackout + 1.5 * pulse

		local vignetteStrength = 0.28 + 0.42 * self.blackout + 0.16 * pulse
		if self.dead then
			vignetteStrength = math.max(vignetteStrength, 0.7)
		end
		for _, edge in self.vignetteEdges do
			edge.BackgroundTransparency = 1 - vignetteStrength
		end

		self.lantern.Brightness = 1.6 * self.blackout
		self.lantern.Range = 20 + 10 * self.blackout

		if self.shake > 0.001 then
			self.shake = math.max(0, self.shake - delta * 2.2)
			local magnitude = self.shake * 0.9
			self.camera.CFrame *= CFrame.Angles(
				math.rad((math.random() - 0.5) * magnitude),
				math.rad((math.random() - 0.5) * magnitude),
				math.rad((math.random() - 0.5) * magnitude * 1.6)
			)
		end
	end)
end

function Atmosphere.stop(self: Controller)
	if self.connection then
		self.connection:Disconnect()
		self.connection = nil
	end
end

return Atmosphere
