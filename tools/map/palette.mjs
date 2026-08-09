/**
 * The Hollow Carnival colour script.
 *
 * Structures are near-black plum so that every saturated hue in the scene
 * reads as an emissive light source rather than a painted surface. Neon is
 * restricted to five hues so the midway stays legible in heavy fog.
 */

const hex = (value) => [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

export const NEON = {
	magenta: hex(0xff3ca8),
	cyan: hex(0x35e8ff),
	amber: hex(0xffb43c),
	violet: hex(0x9b5cff),
	lime: hex(0x6bff8f),
};

export const NEON_ORDER = [NEON.magenta, NEON.cyan, NEON.amber, NEON.violet, NEON.lime];

export const PAINT = {
	plum: hex(0x2a1740),
	plumDark: hex(0x1a0e2a),
	plumLight: hex(0x3d2359),
	asphalt: hex(0x2b2633),
	boardwalk: hex(0x4a3728),
	boardwalkDark: hex(0x33251b),
	rust: hex(0x6b4a3a),
	iron: hex(0x2e2b33),
	ironLight: hex(0x4a464f),
	bone: hex(0xe8e0d0),
	canvasRed: hex(0xb3243a),
	canvasCream: hex(0xe8dcc0),
	canvasTeal: hex(0x1f6b6b),
	brass: hex(0xb08d3f),
	water: hex(0x0b1a24),
	tarp: hex(0x2b3a34),
	crate: hex(0x5c4630),
};

export const MATERIAL = {
	neon: "Neon",
	metal: "Metal",
	corroded: "CorrodedMetal",
	wood: "Wood",
	planks: "WoodPlanks",
	concrete: "Concrete",
	slate: "Slate",
	fabric: "Fabric",
	glass: "Glass",
	plastic: "Plastic",
	smooth: "SmoothPlastic",
	foil: "Foil",
	brick: "Brick",
	sand: "Sand",
	marble: "Marble",
	granite: "Granite",
	pebble: "Pebble",
	diamond: "DiamondPlate",
};

/** Lerp between two 0-255 colour triples. */
export function mixColor(a, b, t) {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t),
	];
}

export function shade(color, amount) {
	const target = amount < 0 ? [0, 0, 0] : [255, 255, 255];
	return mixColor(color, target, Math.abs(amount));
}
