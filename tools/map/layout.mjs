/**
 * Master plan of the Hollow Carnival.
 *
 * +Z is the south entrance, -Z is the back of the park where the wheel sits.
 * Everything is authored in Roblox studs with y=0 as the midway surface.
 */
export const LAYOUT = {
	ground: { size: 440, y: 0, thickness: 4 },
	wall: { half: 214, height: 26, segment: 20 },

	entrance: { pos: [0, 0, 196], width: 46, archHeight: 40 },
	avenue: { halfWidth: 19, fromZ: 194, toZ: 46 },
	crossAvenue: { halfWidth: 17, fromX: -196, toX: 196 },

	plaza: { pos: [0, 0, 0], radius: 48 },
	clockTower: { pos: [0, 0, 0], baseRadius: 9, height: 74 },

	ferrisWheel: { pos: [0, 0, -156], radius: 58, hubHeight: 70, gondolas: 14 },
	carousel: { pos: [128, 0, -46], radius: 34, height: 26, horses: 12 },
	bigTop: { pos: [-136, 0, -40], radius: 56, height: 62 },
	funhouse: { pos: [-118, 0, 118], width: 96, depth: 76, height: 30 },
	bumperCars: { pos: [124, 0, 116], width: 88, depth: 66, height: 22 },
	pier: { pos: [-152, 0, -160], poolWidth: 120, poolDepth: 86 },
	generatorYard: { pos: [150, 0, -150], width: 90, depth: 80 },

	lobby: { pos: [0, 260, 1200], radius: 54 },
};

export const HEIGHTS = {
	eyeLevel: 5,
	stallRoof: 12,
	stringLights: 17,
};
