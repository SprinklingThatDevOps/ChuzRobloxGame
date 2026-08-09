--!strict
--[[
	Shared type vocabulary for Hollow Carnival.
]]

export type Role = "Innocent" | "Sheriff" | "Murderer" | "Hero" | "Spectator"

export type Phase = "Intermission" | "Grace" | "Round" | "PostRound"

export type Outcome = "None" | "InnocentsWin" | "MurderersWin" | "TimeUp"

export type PlayerSeed = {
	id: number,
	roleCooldown: number,
}

export type PlayerState = {
	role: Role,
	alive: boolean,
}

export type Vector3Array = { number }

export type MapPart = {
	name: string,
	shape: string,
	pos: Vector3Array,
	size: Vector3Array,
	color: Vector3Array,
	material: string,
	rot: Vector3Array?,
	transparency: number?,
	reflectance: number?,
	canCollide: boolean?,
	castShadow: boolean?,
	group: string?,
	tags: { string }?,
	sign: {
		text: string,
		color: Vector3Array,
		face: string?,
		scale: number?,
	}?,
}

export type MapLight = {
	pos: Vector3Array,
	color: Vector3Array,
	range: number,
	brightness: number,
	kind: string,
	shadows: boolean?,
	flicker: number?,
	survivesBlackout: boolean?,
	group: string?,
}

export type MapAnimator = {
	group: string,
	kind: string,
	axis: Vector3Array,
	speed: number,
	pivot: Vector3Array?,
	amplitude: number?,
	phase: number?,
}

export type MapSpawn = {
	pos: Vector3Array,
	yaw: number,
}

export type MapData = {
	name: string,
	bounds: { half: number, groundY: number },
	landmarks: { { name: string, pos: Vector3Array, blurb: string } },
	spawns: { lobby: { MapSpawn }, round: { MapSpawn } },
	coinSpots: { Vector3Array },
	nav: { nodes: { { pos: Vector3Array, name: string? } }, edges: { { number } } },
	animators: { MapAnimator },
	lights: { MapLight },
	parts: { MapPart },
}

return {}
