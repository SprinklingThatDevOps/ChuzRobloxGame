--!strict
--[[
	Coins on the midway.

	Coins exist to pull innocents away from safety. They spawn in the open,
	they respawn somewhere else, and picking one up in the dark is exactly the
	kind of decision this game is about.
]]

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local CoinService = {}
CoinService.__index = CoinService

export type Service = typeof(setmetatable(
	{} :: {
		config: any,
		spots: { { number } },
		coins: { any },
		folder: Folder,
		connection: RBXScriptConnection?,
		clock: number,
		onCollect: ((player: Player, total: number) -> ())?,
		canCollect: ((player: Player) -> boolean)?,
	},
	CoinService
))

function CoinService.new(config: any, mapData: any): Service
	local folder = Instance.new("Folder")
	folder.Name = "Coins"
	folder.Parent = workspace

	return setmetatable({
		config = config,
		spots = mapData.coinSpots,
		coins = {},
		folder = folder,
		connection = nil,
		clock = 0,
		onCollect = nil,
		canCollect = nil,
	}, CoinService) :: any
end

local function makeCoin(): BasePart
	local coin = Instance.new("Part")
	coin.Name = "Coin"
	coin.Shape = Enum.PartType.Cylinder
	coin.Size = Vector3.new(0.22, 1.7, 1.7)
	coin.Color = Color3.fromRGB(255, 194, 60)
	coin.Material = Enum.Material.Neon
	coin.Anchored = true
	coin.CanCollide = false
	coin.CanQuery = false
	coin.CanTouch = false
	coin.CastShadow = false

	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 168, 40)
	light.Range = 9
	light.Brightness = 1.4
	light.Shadows = false
	light.Parent = coin

	return coin
end

function CoinService.start(self: Service)
	CoinService.respawnAll(self)
	self.connection = RunService.Heartbeat:Connect(function(delta)
		CoinService.step(self, delta)
	end)
end

function CoinService.respawnAll(self: Service)
	for _, coin in self.coins do
		coin.part:Destroy()
	end
	self.coins = {}

	local order = {}
	for index = 1, #self.spots do
		table.insert(order, index)
	end
	for i = #order, 2, -1 do
		local j = math.random(i)
		order[i], order[j] = order[j], order[i]
	end

	local wanted = math.min(self.config.coins.activeCount, #order)
	for i = 1, wanted do
		local spot = self.spots[order[i]]
		local part = makeCoin()
		part.Position = Vector3.new(spot[1], spot[2], spot[3])
		part.Parent = self.folder
		table.insert(self.coins, {
			part = part,
			home = part.Position,
			active = true,
			respawnIn = 0,
			phase = math.random() * math.pi * 2,
		})
	end
end

function CoinService.clear(self: Service)
	for _, coin in self.coins do
		coin.part:Destroy()
	end
	self.coins = {}
end

function CoinService.step(self: Service, delta: number)
	self.clock += delta
	local coinConfig = self.config.coins
	local radiusSquared = coinConfig.pickupRadius * coinConfig.pickupRadius

	local roots: { { player: Player, position: Vector3 } } = {}
	for _, player in Players:GetPlayers() do
		if self.canCollect and not self.canCollect(player) then
			continue
		end
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if root and root:IsA("BasePart") then
			table.insert(roots, { player = player, position = root.Position })
		end
	end

	for _, coin in self.coins do
		if not coin.active then
			coin.respawnIn -= delta
			if coin.respawnIn <= 0 then
				local spot = self.spots[math.random(#self.spots)]
				coin.home = Vector3.new(spot[1], spot[2], spot[3])
				coin.active = true
				coin.part.Parent = self.folder
			end
			continue
		end

		local bob = math.sin(self.clock * coinConfig.bobSpeed + coin.phase) * coinConfig.bobHeight
		coin.part.CFrame = CFrame.new(coin.home + Vector3.new(0, bob, 0))
			* CFrame.Angles(0, math.rad(self.clock * coinConfig.spinSpeed), math.rad(90))

		for _, entry in roots do
			-- Broad phase against the coin's anchor point, which never moves,
			-- so the bobbing coin only gets an exact test when someone is
			-- plausibly close.
			local toHome = entry.position - coin.home
			if toHome:Dot(toHome) > radiusSquared * 4 then
				continue
			end
			local toCoin = entry.position - coin.part.Position
			if toCoin:Dot(toCoin) <= radiusSquared then
				coin.active = false
				coin.respawnIn = coinConfig.respawnSeconds
				coin.part.Parent = nil
				if self.onCollect then
					self.onCollect(entry.player, coinConfig.value)
				end
				break
			end
		end
	end
end

function CoinService.destroy(self: Service)
	if self.connection then
		self.connection:Disconnect()
		self.connection = nil
	end
	CoinService.clear(self)
	self.folder:Destroy()
end

return CoinService
