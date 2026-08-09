--!strict
--[[
	Remote plumbing.

	The server creates every remote up front; clients only ever look them up.
	Doing it in one place means a typo is a missing-key error at boot rather
	than a silent no-op in the middle of a round.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Net = {}

local EVENTS = {
	-- Server -> client
	"PhaseChanged",
	"RoleAssigned",
	"RoundSummary",
	"BlackoutChanged",
	"Announce",
	"KillFeed",
	"CoinCollected",
	"StaminaChanged",
	"AbilityState",
	-- Client -> server
	"RequestAttack",
	"RequestThrow",
	"RequestShoot",
	"RequestAbility",
	"RequestSprint",
}

local FUNCTIONS = {
	"GetSnapshot",
}

local folderName = "HollowNet"

function Net.build(): Folder
	local folder = Instance.new("Folder")
	folder.Name = folderName

	for _, name in EVENTS do
		local remote = Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = folder
	end
	for _, name in FUNCTIONS do
		local remote = Instance.new("RemoteFunction")
		remote.Name = name
		remote.Parent = folder
	end

	folder.Parent = ReplicatedStorage
	return folder
end

local cachedFolder: Folder? = nil

local function getFolder(): Folder
	if cachedFolder and cachedFolder.Parent then
		return cachedFolder
	end
	if RunService:IsServer() then
		cachedFolder = ReplicatedStorage:FindFirstChild(folderName) :: Folder? or Net.build()
	else
		cachedFolder = ReplicatedStorage:WaitForChild(folderName, 30) :: Folder
	end
	assert(cachedFolder, "HollowNet folder never appeared")
	return cachedFolder
end

function Net.event(name: string): RemoteEvent
	local remote = getFolder():FindFirstChild(name)
	assert(remote and remote:IsA("RemoteEvent"), `Unknown remote event "{name}"`)
	return remote
end

function Net.fn(name: string): RemoteFunction
	local remote = getFolder():FindFirstChild(name)
	assert(remote and remote:IsA("RemoteFunction"), `Unknown remote function "{name}"`)
	return remote
end

return Net
