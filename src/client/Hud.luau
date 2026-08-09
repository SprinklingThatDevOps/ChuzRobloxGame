--!strict
--[[
	The player-facing HUD.

	Built in code rather than as a .rbxmx so it stays reviewable in a diff and
	can pull its colours straight from GameConfig.
]]

local TweenService = game:GetService("TweenService")

local Hud = {}
Hud.__index = Hud

local MAGENTA = Color3.fromRGB(255, 60, 168)
local CYAN = Color3.fromRGB(53, 232, 255)
local PAPER = Color3.fromRGB(244, 236, 255)
local INK = Color3.fromRGB(11, 6, 18)

export type Controller = typeof(setmetatable(
	{} :: {
		config: any,
		gui: ScreenGui,
		phaseLabel: TextLabel,
		timerLabel: TextLabel,
		roleLabel: TextLabel,
		roleBlurb: TextLabel,
		coinLabel: TextLabel,
		staminaFill: Frame,
		feed: Frame,
		toast: TextLabel,
		abilityLabel: TextLabel,
		crosshair: Frame,
		feedItems: { TextLabel },
	},
	Hud
))

local function label(parent: Instance, props: { [string]: any }): TextLabel
	local text = Instance.new("TextLabel")
	text.BackgroundTransparency = 1
	text.Font = Enum.Font.GothamBold
	text.TextColor3 = PAPER
	text.TextXAlignment = Enum.TextXAlignment.Left
	for key, value in props do
		(text :: any)[key] = value
	end
	text.Parent = parent
	return text
end

function Hud.new(config: any, parent: Instance): Controller
	local gui = Instance.new("ScreenGui")
	gui.Name = "HollowHud"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

	-- Top bar
	local top = Instance.new("Frame")
	top.Name = "Top"
	top.Size = UDim2.new(1, 0, 0, 108)
	top.BackgroundColor3 = INK
	top.BackgroundTransparency = 0.25
	top.BorderSizePixel = 0
	top.Parent = gui

	local topGradient = Instance.new("UIGradient")
	topGradient.Rotation = 90
	topGradient.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.15),
		NumberSequenceKeypoint.new(1, 1),
	})
	topGradient.Parent = top

	label(top, {
		Name = "Brand",
		Position = UDim2.fromOffset(28, 18),
		Size = UDim2.fromOffset(360, 30),
		Text = config.identity.title,
		TextSize = 26,
		TextColor3 = MAGENTA,
		Font = Enum.Font.GothamBlack,
	})
	label(top, {
		Name = "Tagline",
		Position = UDim2.fromOffset(28, 50),
		Size = UDim2.fromOffset(420, 18),
		Text = config.identity.tagline,
		TextSize = 12,
		TextTransparency = 0.45,
		Font = Enum.Font.Gotham,
	})

	local phaseLabel = label(top, {
		Name = "Phase",
		Position = UDim2.new(0.5, -140, 0, 14),
		Size = UDim2.fromOffset(280, 18),
		Text = "INTERMISSION",
		TextSize = 14,
		TextColor3 = CYAN,
		TextXAlignment = Enum.TextXAlignment.Center,
	})
	local timerLabel = label(top, {
		Name = "Timer",
		Position = UDim2.new(0.5, -140, 0, 32),
		Size = UDim2.fromOffset(280, 52),
		Text = "0:00",
		TextSize = 46,
		Font = Enum.Font.GothamBlack,
		TextXAlignment = Enum.TextXAlignment.Center,
	})

	-- Role card
	local roleCard = Instance.new("Frame")
	roleCard.Name = "RoleCard"
	roleCard.AnchorPoint = Vector2.new(1, 0)
	roleCard.Position = UDim2.new(1, -28, 0, 18)
	roleCard.Size = UDim2.fromOffset(260, 62)
	roleCard.BackgroundColor3 = INK
	roleCard.BackgroundTransparency = 0.35
	roleCard.BorderSizePixel = 0
	roleCard.Parent = gui

	local roleStroke = Instance.new("UIStroke")
	roleStroke.Color = CYAN
	roleStroke.Transparency = 0.55
	roleStroke.Parent = roleCard

	local roleLabel = label(roleCard, {
		Name = "Role",
		Position = UDim2.fromOffset(14, 8),
		Size = UDim2.fromOffset(232, 24),
		Text = "SPECTATOR",
		TextSize = 20,
		Font = Enum.Font.GothamBlack,
	})
	local roleBlurb = label(roleCard, {
		Name = "Blurb",
		Position = UDim2.fromOffset(14, 32),
		Size = UDim2.fromOffset(232, 22),
		Text = "Watching from the dark.",
		TextSize = 12,
		TextTransparency = 0.35,
		Font = Enum.Font.Gotham,
		TextWrapped = true,
	})

	-- Bottom bar: coins, stamina, ability
	local bottom = Instance.new("Frame")
	bottom.Name = "Bottom"
	bottom.AnchorPoint = Vector2.new(0, 1)
	bottom.Position = UDim2.new(0, 0, 1, 0)
	bottom.Size = UDim2.new(1, 0, 0, 92)
	bottom.BackgroundTransparency = 1
	bottom.Parent = gui

	local coinLabel = label(bottom, {
		Name = "Coins",
		Position = UDim2.fromOffset(28, 28),
		Size = UDim2.fromOffset(240, 30),
		Text = "0 coins",
		TextSize = 22,
		TextColor3 = Color3.fromRGB(255, 180, 60),
		Font = Enum.Font.GothamBlack,
	})

	local staminaTrack = Instance.new("Frame")
	staminaTrack.Name = "StaminaTrack"
	staminaTrack.AnchorPoint = Vector2.new(0.5, 1)
	staminaTrack.Position = UDim2.new(0.5, 0, 1, -26)
	staminaTrack.Size = UDim2.fromOffset(280, 5)
	staminaTrack.BackgroundColor3 = Color3.fromRGB(40, 34, 52)
	staminaTrack.BorderSizePixel = 0
	staminaTrack.Parent = bottom

	local staminaFill = Instance.new("Frame")
	staminaFill.Name = "Fill"
	staminaFill.Size = UDim2.fromScale(1, 1)
	staminaFill.BackgroundColor3 = CYAN
	staminaFill.BorderSizePixel = 0
	staminaFill.Parent = staminaTrack

	local abilityLabel = label(bottom, {
		Name = "Ability",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -28, 0, 28),
		Size = UDim2.fromOffset(300, 24),
		Text = "",
		TextSize = 14,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextTransparency = 0.2,
		Font = Enum.Font.Gotham,
	})

	-- Kill feed
	local feed = Instance.new("Frame")
	feed.Name = "Feed"
	feed.AnchorPoint = Vector2.new(0, 1)
	feed.Position = UDim2.new(0, 28, 1, -110)
	feed.Size = UDim2.fromOffset(420, 170)
	feed.BackgroundTransparency = 1
	feed.Parent = gui

	local feedLayout = Instance.new("UIListLayout")
	feedLayout.SortOrder = Enum.SortOrder.LayoutOrder
	feedLayout.VerticalAlignment = Enum.VerticalAlignment.Bottom
	feedLayout.Padding = UDim.new(0, 5)
	feedLayout.Parent = feed

	-- Only shown while holding the revolver; the knife is close enough that a
	-- crosshair would just be noise.
	local crosshair = Instance.new("Frame")
	crosshair.Name = "Crosshair"
	crosshair.AnchorPoint = Vector2.new(0.5, 0.5)
	crosshair.Position = UDim2.fromScale(0.5, 0.5)
	crosshair.Size = UDim2.fromOffset(22, 22)
	crosshair.BackgroundTransparency = 1
	crosshair.Visible = false
	crosshair.Parent = gui

	for _, spec in
		{
			{ size = UDim2.fromOffset(2, 8), pos = UDim2.new(0.5, -1, 0, 0) },
			{ size = UDim2.fromOffset(2, 8), pos = UDim2.new(0.5, -1, 1, -8) },
			{ size = UDim2.fromOffset(8, 2), pos = UDim2.new(0, 0, 0.5, -1) },
			{ size = UDim2.fromOffset(8, 2), pos = UDim2.new(1, -8, 0.5, -1) },
		}
	do
		local tick = Instance.new("Frame")
		tick.Size = spec.size
		tick.Position = spec.pos
		tick.BackgroundColor3 = Color3.fromRGB(255, 214, 96)
		tick.BackgroundTransparency = 0.25
		tick.BorderSizePixel = 0
		tick.Parent = crosshair
	end

	local toast = label(gui, {
		Name = "Toast",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 128),
		Size = UDim2.fromOffset(720, 30),
		Text = "",
		TextSize = 18,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextTransparency = 1,
		Font = Enum.Font.GothamBold,
	})

	gui.Parent = parent

	return setmetatable({
		config = config,
		gui = gui,
		phaseLabel = phaseLabel,
		timerLabel = timerLabel,
		roleLabel = roleLabel,
		roleBlurb = roleBlurb,
		coinLabel = coinLabel,
		staminaFill = staminaFill,
		feed = feed,
		toast = toast,
		abilityLabel = abilityLabel,
		crosshair = crosshair,
		feedItems = {},
	}, Hud) :: any
end

local PHASE_TEXT = {
	Intermission = "INTERMISSION",
	Grace = "GRACE PERIOD",
	Round = "ROUND LIVE",
	PostRound = "ROUND OVER",
}

function Hud.setPhase(self: Controller, phase: string)
	self.phaseLabel.Text = PHASE_TEXT[phase] or string.upper(phase)
end

function Hud.setTimer(self: Controller, seconds: number)
	local whole = math.max(0, math.ceil(seconds))
	self.timerLabel.Text = string.format("%d:%02d", whole // 60, whole % 60)
	local urgent = whole <= self.config.round.suddenDeathAtSecondsLeft
	self.timerLabel.TextColor3 = if urgent then MAGENTA else PAPER
end

function Hud.setRole(self: Controller, role: string, info: any)
	self.roleLabel.Text = string.upper(if info and info.displayName then info.displayName else role)
	self.roleBlurb.Text = if info and info.blurb then info.blurb else ""
	if info and info.color then
		local colour = Color3.fromRGB(info.color[1], info.color[2], info.color[3])
		self.roleLabel.TextColor3 = colour
		local stroke = self.roleLabel.Parent :: Frame
		local uiStroke = stroke:FindFirstChildOfClass("UIStroke")
		if uiStroke then
			uiStroke.Color = colour
		end
	end
end

function Hud.setCoins(self: Controller, coins: number)
	self.coinLabel.Text = `{coins} coins`
end

function Hud.setStamina(self: Controller, fraction: number)
	self.staminaFill.Size = UDim2.fromScale(math.clamp(fraction, 0, 1), 1)
	self.staminaFill.BackgroundColor3 = if fraction < 0.25 then MAGENTA else CYAN
end

function Hud.setAbility(self: Controller, text: string)
	self.abilityLabel.Text = text
end

function Hud.setCrosshair(self: Controller, visible: boolean)
	self.crosshair.Visible = visible
end

function Hud.pushFeed(self: Controller, message: string, colour: Color3?)
	local item = Instance.new("TextLabel")
	item.BackgroundColor3 = INK
	item.BackgroundTransparency = 0.3
	item.BorderSizePixel = 0
	item.Size = UDim2.new(1, 0, 0, 24)
	item.Font = Enum.Font.Gotham
	item.TextSize = 13
	item.TextColor3 = colour or PAPER
	item.TextXAlignment = Enum.TextXAlignment.Left
	item.Text = `  {message}`
	item.LayoutOrder = os.time() * 1000 + #self.feedItems
	item.Parent = self.feed

	table.insert(self.feedItems, item)
	while #self.feedItems > 6 do
		local oldest = table.remove(self.feedItems, 1)
		if oldest then
			oldest:Destroy()
		end
	end

	task.delay(14, function()
		if item.Parent then
			local index = table.find(self.feedItems, item)
			if index then
				table.remove(self.feedItems, index)
			end
			item:Destroy()
		end
	end)
end

function Hud.toastMessage(self: Controller, message: string)
	self.toast.Text = message
	self.toast.TextTransparency = 0
	TweenService:Create(self.toast, TweenInfo.new(0.4), { TextTransparency = 0 }):Play()
	task.delay(3.2, function()
		TweenService:Create(self.toast, TweenInfo.new(0.8), { TextTransparency = 1 }):Play()
	end)
end

return Hud
