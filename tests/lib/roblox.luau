--!strict
--[[
	Just enough Roblox to run the pure modules under Lune.

	src/shared/*.luau is written for Roblox — it says `require(script.Parent.X)`
	and reaches for `game:GetService`. Rewriting it for tests would mean testing
	a different file than the one that ships, so instead we hand the real file a
	fake `script` and a fake `game` and let it run unchanged.

	The tree is walked eagerly at startup because Lune's `fs` calls yield, and
	a yield inside the `__index` that resolves `script.Parent.Types` is not
	allowed. Reading a few directory listings up front is cheaper than the
	alternative anyway.

	Deliberately not a Roblox emulator: it resolves modules and decodes JSON.
	Anything that needs Instances, physics or replication belongs in Studio.
]]

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local serde = require("@lune/serde")

local Roblox = {}

type Node = any

local moduleCache: { [string]: any } = {}

local nodeMethods = {}

function nodeMethods.FindFirstChild(self: Node, name: string): Node?
	return self.__children[name]
end

function nodeMethods.WaitForChild(self: Node, name: string, _timeout: number?): Node
	local child = self.__children[name]
	assert(child, `WaitForChild("{name}") found nothing under {self.__path}`)
	return child
end

function nodeMethods.GetChildren(self: Node): { Node }
	local children = {}
	for _, child in self.__children do
		table.insert(children, child)
	end
	table.sort(children, function(a, b)
		return a.Name < b.Name
	end)
	return children
end

function nodeMethods.IsA(self: Node, className: string): boolean
	return self.ClassName == className
end

local nodeMeta = {
	__index = function(self: Node, key: string): any
		local method = (nodeMethods :: any)[key]
		if method then
			return method
		end
		return self.__children[key]
	end,
	__tostring = function(self: Node): string
		return `Node({self.__path})`
	end,
}

local function stripExtension(entry: string): string
	local base = entry:match("^(.*)%.luau$") or entry:match("^(.*)%.lua$") or entry:match("^(.*)%.json$")
	return base or entry
end

--[[
	Mirrors the subset of Rojo's file-to-instance rules this project uses:
	a directory becomes a Folder (or a Script when it holds an init file) and
	`.luau` / `.json` files become modules named after the file.
]]
local buildNode: (path: string, name: string, parent: Node?) -> Node

function buildNode(path: string, name: string, parent: Node?): Node
	local isDir = fs.isDir(path)
	local node = {
		Name = name,
		Parent = parent,
		ClassName = if isDir then "Folder" else "ModuleScript",
		__path = path,
		__children = {} :: { [string]: Node },
	}
	setmetatable(node, nodeMeta)

	if isDir then
		for _, entry in fs.readDir(path) do
			local childName = stripExtension(entry)
			-- An init file *is* the directory, not a child of it.
			if childName == "init" or childName == "init.server" or childName == "init.client" then
				continue
			end
			node.__children[childName] = buildNode(`{path}/{entry}`, childName, node)
		end
	end

	return node
end

local requireNode: (node: Node) -> any

--[[
	The services the shipped code actually asks for. Adding one here is a
	deliberate act: if a "pure" module suddenly needs Workspace, the test
	should fail loudly rather than quietly grow a mock.
]]
local function buildGame(): any
	local replicatedStorage = {
		Name = "ReplicatedStorage",
		ClassName = "ReplicatedStorage",
		__path = "<ReplicatedStorage>",
		__children = {
			Shared = buildNode("src/shared", "Shared", nil),
			GameConfig = buildNode("config/GameConfig.json", "GameConfig", nil),
		} :: { [string]: Node },
	}
	if fs.isFile("build/MapData.json") then
		replicatedStorage.__children.MapData = buildNode("build/MapData.json", "MapData", nil)
	end
	setmetatable(replicatedStorage, nodeMeta)

	local services: { [string]: Node } = {
		ReplicatedStorage = replicatedStorage :: any,
	}

	return {
		GetService = function(_self, name: string): Node
			local service = services[name]
			assert(service, `The test shim does not provide game:GetService("{name}")`)
			return service
		end,
	}
end

local gameStub = buildGame()

local function initFileFor(path: string): string?
	for _, initName in { "init.luau", "init.lua", "init.server.luau", "init.client.luau" } do
		local candidate = `{path}/{initName}`
		if fs.isFile(candidate) then
			return candidate
		end
	end
	return nil
end

function requireNode(node: Node): any
	local path = node.__path

	if fs.isDir(path) then
		local initPath = initFileFor(path)
		assert(initPath, `Tried to require directory "{path}", which has no init file`)
		path = initPath
	end

	local cached = moduleCache[path]
	if cached ~= nil then
		return cached
	end

	if path:match("%.json$") then
		local value = serde.decode("json", fs.readFile(path))
		moduleCache[path] = value
		return value
	end

	local chunk = luau.load(fs.readFile(path), {
		debugName = path,
		environment = {
			script = node,
			game = gameStub,
			require = requireNode,
		},
	})

	local value = chunk()
	moduleCache[path] = value
	return value
end

--[[
	Load a module the way the game would, given a repo-relative path.
]]
function Roblox.import(path: string): any
	assert(fs.isFile(path) or fs.isDir(path), `No module at "{path}"`)
	local parentPath = path:match("^(.*)/[^/]+$")
	local parent = if parentPath
		then buildNode(parentPath, parentPath:match("([^/]+)$") or parentPath, nil)
		else nil
	local name = stripExtension(path:match("([^/]+)$") or path)
	local node = if parent then parent.__children[name] else buildNode(path, name, nil)
	assert(node, `No module named "{name}" under "{tostring(parentPath)}"`)
	return requireNode(node)
end

--[[
	Compile without running. Used to syntax-check the files that cannot be
	executed outside Studio (anything touching Instances or RunService).
]]
function Roblox.compile(path: string)
	luau.load(fs.readFile(path), { debugName = path })
end

function Roblox.config(): any
	return serde.decode("json", fs.readFile("config/GameConfig.json"))
end

function Roblox.mapData(): any
	return serde.decode("json", fs.readFile("build/MapData.json"))
end

return Roblox
