--!strict
--[[
	Builds the carnival from MapData.json.

	The same document drives the browser previsualizer, so anything that looks
	right in the demo looks right here. Parts are created once at boot and
	never touched again, except for the handful of models an animator drives.

	Face convention: MapData uses +Z as "Front" (three.js). Roblox's
	NormalId.Front is -Z, so the sign faces are deliberately swapped below.
]]

local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")

local MapBuilder = {}

local MATERIALS: { [string]: Enum.Material } = {
	Neon = Enum.Material.Neon,
	Metal = Enum.Material.Metal,
	CorrodedMetal = Enum.Material.CorrodedMetal,
	Foil = Enum.Material.Foil,
	DiamondPlate = Enum.Material.DiamondPlate,
	Wood = Enum.Material.Wood,
	WoodPlanks = Enum.Material.WoodPlanks,
	Concrete = Enum.Material.Concrete,
	Slate = Enum.Material.Slate,
	Brick = Enum.Material.Brick,
	Granite = Enum.Material.Granite,
	Pebble = Enum.Material.Pebble,
	Sand = Enum.Material.Sand,
	Marble = Enum.Material.Marble,
	Glass = Enum.Material.Glass,
	Fabric = Enum.Material.Fabric,
	Plastic = Enum.Material.Plastic,
	SmoothPlastic = Enum.Material.SmoothPlastic,
	Ice = Enum.Material.Ice,
}

local SHAPES: { [string]: Enum.PartType } = {
	box = Enum.PartType.Block,
	cyl = Enum.PartType.Cylinder,
	sphere = Enum.PartType.Ball,
}

local SIGN_FACES: { [string]: Enum.NormalId } = {
	Front = Enum.NormalId.Back,
	Back = Enum.NormalId.Front,
	Right = Enum.NormalId.Right,
	Left = Enum.NormalId.Left,
	Top = Enum.NormalId.Top,
}

-- Roblox renders every light in range; a few hundred of them will melt a
-- phone. Keep the brightest and widest, drop the rest, and let the emissive
-- Neon parts carry the look on their own.
local MAX_LIGHTS = 240
local MAX_SHADOW_LIGHTS = 6

local function toVector3(array: { number }): Vector3
	return Vector3.new(array[1], array[2], array[3])
end

local function toColor3(array: { number }): Color3
	return Color3.fromRGB(array[1], array[2], array[3])
end

local function cframeFor(part: any): CFrame
	local position = CFrame.new(toVector3(part.pos))
	if part.rot then
		return position
			* CFrame.Angles(math.rad(part.rot[1]), math.rad(part.rot[2]), math.rad(part.rot[3]))
	end
	return position
end

local function buildSign(part: BasePart, spec: any)
	local surface = Instance.new("SurfaceGui")
	surface.Name = "Sign"
	surface.Face = SIGN_FACES[spec.face or "Front"] or Enum.NormalId.Back
	surface.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	surface.PixelsPerStud = 36
	surface.LightInfluence = 0
	surface.AlwaysOnTop = false

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextWrapped = true
	label.Text = spec.text
	label.TextColor3 = toColor3(spec.color)
	label.RichText = false
	label.Parent = surface

	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2
	stroke.Color = toColor3(spec.color)
	stroke.Transparency = 0.45
	stroke.Parent = label

	surface.Parent = part
end

--[[
	Creates every part. Returns the container plus the models that animators
	will drive, already grouped and pivoted.
]]
function MapBuilder.build(mapData: any): { root: Folder, groups: { [string]: Model }, partCount: number }
	local root = Instance.new("Folder")
	root.Name = "HollowCarnival"

	local scenery = Instance.new("Folder")
	scenery.Name = "Scenery"
	scenery.Parent = root

	local animatedGroups: { [string]: boolean } = {}
	for _, animator in mapData.animators do
		animatedGroups[animator.group] = true
	end

	local groups: { [string]: Model } = {}
	local groupFolders: { [string]: Instance } = {}

	local function containerFor(groupName: string?): Instance
		if groupName == nil then
			return scenery
		end
		local existing = groupFolders[groupName]
		if existing then
			return existing
		end
		local container: Instance
		if animatedGroups[groupName] then
			local model = Instance.new("Model")
			model.Name = groupName
			model.Parent = root
			groups[groupName] = model
			container = model
		else
			local folder = Instance.new("Folder")
			folder.Name = groupName
			folder.Parent = scenery
			container = folder
		end
		groupFolders[groupName] = container
		return container
	end

	for _, spec in mapData.parts do
		local part = Instance.new("Part")
		part.Name = spec.name
		part.Shape = SHAPES[spec.shape] or Enum.PartType.Block
		part.Size = toVector3(spec.size)
		part.CFrame = cframeFor(spec)
		part.Color = toColor3(spec.color)
		part.Material = MATERIALS[spec.material] or Enum.Material.SmoothPlastic
		part.Anchored = true
		part.CanCollide = spec.canCollide ~= false
		part.CanTouch = false
		part.CanQuery = spec.canCollide ~= false
		part.CastShadow = spec.castShadow ~= false
		part.Transparency = spec.transparency or 0
		part.Reflectance = spec.reflectance or 0
		part.TopSurface = Enum.SurfaceType.Smooth
		part.BottomSurface = Enum.SurfaceType.Smooth

		if spec.sign then
			buildSign(part, spec.sign)
		end
		if spec.tags then
			for _, tag in spec.tags do
				part:AddTag(tag)
			end
		end

		part.Parent = containerFor(spec.group)
	end

	MapBuilder.buildLights(mapData, root)

	root.Parent = workspace
	return { root = root, groups = groups, partCount = #mapData.parts }
end

function MapBuilder.buildLights(mapData: any, root: Folder)
	local holder = Instance.new("Folder")
	holder.Name = "Lights"
	holder.Parent = root

	local ranked = table.clone(mapData.lights)
	table.sort(ranked, function(a, b)
		return a.brightness * a.range > b.brightness * b.range
	end)

	local shadowsUsed = 0
	for index, spec in ranked do
		if index > MAX_LIGHTS then
			break
		end
		local anchor = Instance.new("Part")
		anchor.Name = "LightAnchor"
		anchor.Size = Vector3.new(0.2, 0.2, 0.2)
		anchor.Position = toVector3(spec.pos)
		anchor.Anchored = true
		anchor.CanCollide = false
		anchor.CanQuery = false
		anchor.CanTouch = false
		anchor.CastShadow = false
		anchor.Transparency = 1

		local light = Instance.new("PointLight")
		light.Color = toColor3(spec.color)
		light.Range = math.min(spec.range, 60)
		light.Brightness = spec.brightness
		light.Shadows = false
		if spec.shadows and shadowsUsed < MAX_SHADOW_LIGHTS then
			light.Shadows = true
			shadowsUsed += 1
		end
		light:SetAttribute("Flicker", spec.flicker or 0)
		light:SetAttribute("BaseBrightness", spec.brightness)
		light:SetAttribute("SurvivesBlackout", spec.survivesBlackout == true)
		light.Parent = anchor

		anchor.Parent = holder
	end
end

--[[
	Drives the wheel, the carousel and the drifting swan boats.

	Each animated group is one Model, so a frame update is a handful of
	PivotTo calls rather than thousands of individual CFrame writes.
]]
function MapBuilder.startAnimators(mapData: any, groups: { [string]: Model }): RBXScriptConnection
	type Driver = {
		model: Model,
		base: CFrame,
		spin: any?,
		orbit: any?,
		bob: any?,
	}

	local drivers: { Driver } = {}
	local byGroup: { [string]: Driver } = {}

	for _, animator in mapData.animators do
		local model = groups[animator.group]
		if not model then
			continue
		end
		local driver = byGroup[animator.group]
		if not driver then
			driver = { model = model, base = model:GetPivot() }
			byGroup[animator.group] = driver
			table.insert(drivers, driver)
		end
		if animator.kind == "spin" then
			driver.spin = animator
		elseif animator.kind == "orbit" then
			driver.orbit = animator
		elseif animator.kind == "bob" then
			driver.bob = animator
		end
	end

	local clock = 0
	return RunService.Heartbeat:Connect(function(delta: number)
		clock += delta
		for _, driver in drivers do
			local cframe = driver.base

			local rotator = driver.spin or driver.orbit
			if rotator then
				local axis = toVector3(rotator.axis)
				local pivot = if rotator.pivot then toVector3(rotator.pivot) else driver.base.Position
				local angle = math.rad(clock * rotator.speed)
				local rotation = CFrame.fromAxisAngle(axis, angle)
				if driver.spin then
					cframe = CFrame.new(pivot) * rotation * CFrame.new(-pivot) * cframe
				else
					-- Orbit: the car travels round the hub but stays upright.
					local offset = driver.base.Position - pivot
					cframe = CFrame.new(pivot + rotation:VectorToWorldSpace(offset))
						* (driver.base - driver.base.Position)
				end
			end

			if driver.bob then
				local amplitude = driver.bob.amplitude or 1
				local phase = math.rad(driver.bob.phase or 0)
				local offset = math.sin(clock * math.rad(driver.bob.speed) * 60 + phase) * amplitude
				cframe = cframe + Vector3.new(0, offset, 0)
			end

			driver.model:PivotTo(cframe)
		end
	end)
end

--[[
	Applies one of the lighting presets from GameConfig. `blend` of 0 is full
	power and 1 is a total blackout; the caller tweens it.
]]
function MapBuilder.applyLighting(config: any, blend: number)
	local normal = config.lighting.normal
	local dark = config.lighting.blackout
	local function mixColor(a: { number }, b: { number }): Color3
		return toColor3(a):Lerp(toColor3(b), blend)
	end
	local function mix(a: number, b: number): number
		return a + (b - a) * blend
	end

	Lighting.Ambient = mixColor(normal.ambient, dark.ambient)
	Lighting.OutdoorAmbient = mixColor(normal.outdoorAmbient, dark.outdoorAmbient)
	Lighting.Brightness = mix(normal.brightness, dark.brightness)
	Lighting.ClockTime = mix(normal.clockTime, dark.clockTime)
	Lighting.FogColor = mixColor(normal.fogColor, dark.fogColor)
	Lighting.FogStart = mix(normal.fogStart, dark.fogStart)
	Lighting.FogEnd = mix(normal.fogEnd, dark.fogEnd)
	Lighting.ExposureCompensation = mix(normal.exposure, dark.exposure)

	local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
	if atmosphere then
		atmosphere.Density = mix(0.42, 0.62)
		atmosphere.Haze = mix(2.4, 4.2)
	end
end

return MapBuilder
