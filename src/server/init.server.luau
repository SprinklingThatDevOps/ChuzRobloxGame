--!strict
--[[
	Server entry point.

	Order matters: remotes exist before any client can ask for them, the map is
	built before anyone spawns into it, and the round loop starts last.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = require(ReplicatedStorage.Shared.Net)
local MapBuilder = require(script.MapBuilder)
local GameService = require(script.GameService)

local config = require(ReplicatedStorage:WaitForChild("GameConfig")) :: any
local mapData = require(ReplicatedStorage:WaitForChild("MapData")) :: any

Net.build()

local startedAt = os.clock()
local mapHandle = MapBuilder.build(mapData)
MapBuilder.startAnimators(mapData, mapHandle.groups)
MapBuilder.applyLighting(config, 0)

print(
	string.format(
		"[HollowCarnival] built %d parts and %d lights in %.2fs",
		mapHandle.partCount,
		#mapData.lights,
		os.clock() - startedAt
	)
)

local game_ = GameService.new(config, mapData, mapHandle)

Players.PlayerAdded:Connect(function(player)
	game_:addPlayer(player)
end)
Players.PlayerRemoving:Connect(function(player)
	game_:removePlayer(player)
end)
for _, player in Players:GetPlayers() do
	game_:addPlayer(player)
end

game_:run()
