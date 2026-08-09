--!strict
--[[
	The between-rounds role card.

	It is deliberately slow: the murderer needs a beat to register that it is
	them, and everyone else needs a beat to start suspecting the person who
	just went quiet.
]]

local TweenService = game:GetService("TweenService")

local RoleReveal = {}
RoleReveal.__index = RoleReveal

local INK = Color3.fromRGB(11, 6, 18)
local PAPER = Color3.fromRGB(244, 236, 255)

export type Controller = typeof(setmetatable(
	{} :: {
		gui: ScreenGui,
		backdrop: Frame,
		card: Frame,
		stroke: UIStroke,
		title: TextLabel,
		blurb: TextLabel,
		kicker: TextLabel,
		glow: ImageLabel,
		token: number,
	},
	RoleReveal
))

function RoleReveal.new(parent: Instance): Controller
	local gui = Instance.new("ScreenGui")
	gui.Name = "HollowRoleReveal"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 5

	local backdrop = Instance.new("Frame")
	backdrop.Name = "Backdrop"
	backdrop.Size = UDim2.fromScale(1, 1)
	backdrop.BackgroundColor3 = INK
	backdrop.BackgroundTransparency = 1
	backdrop.BorderSizePixel = 0
	backdrop.Visible = false
	backdrop.Parent = gui

	local card = Instance.new("Frame")
	card.Name = "Card"
	card.AnchorPoint = Vector2.new(0.5, 0.5)
	card.Position = UDim2.fromScale(0.5, 0.5)
	card.Size = UDim2.fromOffset(560, 200)
	card.BackgroundColor3 = INK
	card.BackgroundTransparency = 1
	card.BorderSizePixel = 0
	card.Parent = backdrop

	-- A soft radial behind the card so the reveal reads as lit from within
	-- rather than as a rectangle pasted over the map.
	local glow = Instance.new("ImageLabel")
	glow.Name = "Glow"
	glow.AnchorPoint = Vector2.new(0.5, 0.5)
	glow.Position = UDim2.fromScale(0.5, 0.5)
	glow.Size = UDim2.fromScale(2.4, 3.6)
	glow.BackgroundTransparency = 1
	glow.Image = "rbxassetid://5028857084"
	glow.ImageTransparency = 1
	glow.ZIndex = 0
	glow.Parent = card

	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Transparency = 1
	stroke.Parent = card

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.BackgroundTransparency = 1
	title.Position = UDim2.fromOffset(0, 46)
	title.Size = UDim2.new(1, 0, 0, 72)
	title.Font = Enum.Font.GothamBlack
	title.TextSize = 64
	title.TextColor3 = PAPER
	title.TextTransparency = 1
	title.Text = "INNOCENT"
	title.ZIndex = 2
	title.Parent = card

	local kicker = Instance.new("TextLabel")
	kicker.Name = "Kicker"
	kicker.BackgroundTransparency = 1
	kicker.Position = UDim2.fromOffset(0, 22)
	kicker.Size = UDim2.new(1, 0, 0, 20)
	kicker.Font = Enum.Font.Gotham
	kicker.TextSize = 13
	kicker.TextColor3 = PAPER
	kicker.TextTransparency = 1
	kicker.Text = "TONIGHT YOU ARE"
	kicker.ZIndex = 2
	kicker.Parent = card

	local blurb = Instance.new("TextLabel")
	blurb.Name = "Blurb"
	blurb.BackgroundTransparency = 1
	blurb.Position = UDim2.fromOffset(0, 126)
	blurb.Size = UDim2.new(1, 0, 0, 28)
	blurb.Font = Enum.Font.GothamMedium
	blurb.TextSize = 18
	blurb.TextColor3 = PAPER
	blurb.TextTransparency = 1
	blurb.Text = ""
	blurb.ZIndex = 2
	blurb.Parent = card

	gui.Parent = parent

	return setmetatable({
		gui = gui,
		backdrop = backdrop,
		card = card,
		stroke = stroke,
		title = title,
		blurb = blurb,
		kicker = kicker,
		glow = glow,
		token = 0,
	}, RoleReveal) :: any
end

local function tween(instance: Instance, seconds: number, style: Enum.EasingStyle, props: { [string]: any })
	TweenService:Create(instance, TweenInfo.new(seconds, style, Enum.EasingDirection.Out), props):Play()
end

--[[
	`info` is the role table straight out of GameConfig, so adding a role to
	the config is enough to make it reveal correctly.
]]
function RoleReveal.play(self: Controller, role: string, info: any)
	self.token += 1
	local token = self.token

	local colour = if info and info.color
		then Color3.fromRGB(info.color[1], info.color[2], info.color[3])
		else PAPER

	self.title.Text = string.upper(if info and info.displayName then info.displayName else role)
	self.title.TextColor3 = colour
	self.blurb.Text = if info and info.blurb then info.blurb else ""
	self.stroke.Color = colour
	self.glow.ImageColor3 = colour

	self.kicker.Text = if role == "Hero" then "THE REVOLVER CHOOSES" else "TONIGHT YOU ARE"

	-- Reset, then animate in. Starting slightly large and settling makes the
	-- card feel stamped on rather than faded in.
	self.backdrop.Visible = true
	self.backdrop.BackgroundTransparency = 1
	self.card.Size = UDim2.fromOffset(620, 220)
	self.card.BackgroundTransparency = 1
	self.stroke.Transparency = 1
	self.title.TextTransparency = 1
	self.blurb.TextTransparency = 1
	self.kicker.TextTransparency = 1
	self.glow.ImageTransparency = 1

	tween(self.backdrop, 0.35, Enum.EasingStyle.Quad, { BackgroundTransparency = 0.35 })
	tween(self.card, 0.45, Enum.EasingStyle.Back, { Size = UDim2.fromOffset(560, 200), BackgroundTransparency = 0.25 })
	tween(self.stroke, 0.45, Enum.EasingStyle.Quad, { Transparency = 0.25 })
	tween(self.glow, 0.6, Enum.EasingStyle.Quad, { ImageTransparency = 0.55 })
	tween(self.kicker, 0.5, Enum.EasingStyle.Quad, { TextTransparency = 0.4 })
	tween(self.title, 0.5, Enum.EasingStyle.Quad, { TextTransparency = 0 })

	task.delay(0.35, function()
		if self.token ~= token then
			return
		end
		tween(self.blurb, 0.5, Enum.EasingStyle.Quad, { TextTransparency = 0.15 })
	end)

	task.delay(3.1, function()
		if self.token ~= token then
			return
		end
		tween(self.backdrop, 0.7, Enum.EasingStyle.Quad, { BackgroundTransparency = 1 })
		tween(self.card, 0.7, Enum.EasingStyle.Quad, { BackgroundTransparency = 1 })
		tween(self.stroke, 0.7, Enum.EasingStyle.Quad, { Transparency = 1 })
		tween(self.glow, 0.7, Enum.EasingStyle.Quad, { ImageTransparency = 1 })
		tween(self.title, 0.7, Enum.EasingStyle.Quad, { TextTransparency = 1 })
		tween(self.blurb, 0.7, Enum.EasingStyle.Quad, { TextTransparency = 1 })
		tween(self.kicker, 0.7, Enum.EasingStyle.Quad, { TextTransparency = 1 })
		task.delay(0.75, function()
			if self.token == token then
				self.backdrop.Visible = false
			end
		end)
	end)
end

return RoleReveal
