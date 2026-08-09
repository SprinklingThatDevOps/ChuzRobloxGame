--!strict
--[[
	Input binding.

	The client never decides whether an attack lands — it only decides what
	the player meant and forwards a direction. Every rule is re-checked on the
	server, so a modified client gains nothing but the ability to spam.
]]

local ContextActionService = game:GetService("ContextActionService")
local UserInputService = game:GetService("UserInputService")

local Input = {}
Input.__index = Input

export type Handlers = {
	attack: () -> (),
	shoot: (direction: Vector3) -> (),
	throw: (direction: Vector3) -> (),
	sprint: (wants: boolean) -> (),
	ability: (name: string) -> (),
}

export type Controller = typeof(setmetatable(
	{} :: {
		camera: Camera,
		handlers: Handlers,
		armed: string,
		enabled: boolean,
	},
	Input
))

local ACTION_PRIMARY = "HollowPrimary"
local ACTION_SECONDARY = "HollowSecondary"
local ACTION_SPRINT = "HollowSprint"
local ACTION_ABILITY = "HollowAbility"

--[[
	Aim ray. Mouse and touch both go through the viewport so the crosshair is
	the truth on every device; gamepad falls back to camera-forward.
]]
local function aimDirection(camera: Camera): Vector3
	if UserInputService.MouseEnabled or UserInputService.TouchEnabled then
		local location = UserInputService:GetMouseLocation()
		local ray = camera:ViewportPointToRay(location.X, location.Y)
		return ray.Direction.Unit
	end
	return camera.CFrame.LookVector
end

function Input.new(camera: Camera, handlers: Handlers): Controller
	return setmetatable({
		camera = camera,
		handlers = handlers,
		armed = "none",
		enabled = false,
	}, Input) :: any
end

--[[
	`weapon` is "knife", "revolver" or "none". It only changes which request
	the primary button sends; the server still verifies you hold that weapon.
]]
function Input.setWeapon(self: Controller, weapon: string)
	self.armed = weapon
end

function Input.bind(self: Controller)
	if self.enabled then
		return
	end
	self.enabled = true

	ContextActionService:BindAction(ACTION_PRIMARY, function(_, state: Enum.UserInputState)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		if self.armed == "revolver" then
			self.handlers.shoot(aimDirection(self.camera))
		else
			self.handlers.attack()
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.UserInputType.MouseButton1, Enum.KeyCode.ButtonR2)
	ContextActionService:SetTitle(ACTION_PRIMARY, "Attack")

	ContextActionService:BindAction(ACTION_SECONDARY, function(_, state: Enum.UserInputState)
		if state ~= Enum.UserInputState.Begin then
			return Enum.ContextActionResult.Pass
		end
		if self.armed == "knife" then
			self.handlers.throw(aimDirection(self.camera))
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.KeyCode.Q, Enum.KeyCode.ButtonL2)
	ContextActionService:SetTitle(ACTION_SECONDARY, "Throw")

	ContextActionService:BindAction(ACTION_SPRINT, function(_, state: Enum.UserInputState)
		if state == Enum.UserInputState.Begin then
			self.handlers.sprint(true)
		elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
			self.handlers.sprint(false)
		end
		return Enum.ContextActionResult.Pass
	end, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL3)
	ContextActionService:SetTitle(ACTION_SPRINT, "Run")

	ContextActionService:BindAction(ACTION_ABILITY, function(_, state: Enum.UserInputState)
		if state == Enum.UserInputState.Begin then
			self.handlers.ability("shroud")
		end
		return Enum.ContextActionResult.Pass
	end, true, Enum.KeyCode.E, Enum.KeyCode.ButtonX)
	ContextActionService:SetTitle(ACTION_ABILITY, "Shroud")
end

function Input.unbind(self: Controller)
	if not self.enabled then
		return
	end
	self.enabled = false
	for _, action in { ACTION_PRIMARY, ACTION_SECONDARY, ACTION_SPRINT, ACTION_ABILITY } do
		ContextActionService:UnbindAction(action)
	end
end

return Input
