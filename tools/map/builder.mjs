import { MATERIAL, PAINT } from "./palette.mjs";

const DEG = Math.PI / 180;

/**
 * Collects primitives into the MapData document consumed by both the Roblox
 * map builder (Luau) and the browser previsualizer (three.js).
 *
 * Only three primitive shapes exist -- box, cyl, sphere -- because those are
 * the three that have an exact, unambiguous equivalent on both renderers.
 * Ramps, cones and tent roofs are all composed from rotated boxes so the two
 * renderers can never drift apart.
 */
export class MapBuilder {
	constructor() {
		this.parts = [];
		this.lights = [];
		this.animators = [];
		this.spawns = { lobby: [], round: [] };
		this.coinSpots = [];
		this.nav = { nodes: [], edges: [] };
		this.landmarks = [];
		this.groupStack = [];
		/** Footprints the navigation sampler must route around. */
		this.blockers = [];
	}

	get group() {
		return this.groupStack.length > 0 ? this.groupStack[this.groupStack.length - 1] : undefined;
	}

	/** Scope every part created inside `fn` to a named model. */
	inGroup(name, fn) {
		this.groupStack.push(name);
		try {
			fn();
		} finally {
			this.groupStack.pop();
		}
	}

	part(spec) {
		const part = {
			name: spec.name ?? "Part",
			shape: spec.shape ?? "box",
			pos: round3(spec.pos),
			size: round3(spec.size),
			color: spec.color ?? PAINT.plum,
			material: spec.material ?? MATERIAL.smooth,
		};
		if (spec.rot && (spec.rot[0] || spec.rot[1] || spec.rot[2])) part.rot = round3(spec.rot);
		if (spec.transparency) part.transparency = roundTo(spec.transparency, 3);
		if (spec.reflectance) part.reflectance = roundTo(spec.reflectance, 3);
		if (spec.canCollide === false) part.canCollide = false;
		if (spec.castShadow === false) part.castShadow = false;
		if (spec.sign) part.sign = spec.sign;
		if (spec.tags) part.tags = spec.tags;
		const group = spec.group ?? this.group;
		if (group) part.group = group;
		this.parts.push(part);
		return part;
	}

	box(spec) {
		return this.part({ ...spec, shape: "box" });
	}

	sphere(spec) {
		return this.part({ ...spec, shape: "sphere" });
	}

	/**
	 * Cylinder spanning `from` -> `to`. Matches Roblox's cylinder convention,
	 * where the circular cross-section is swept along the part's local X axis.
	 */
	tube(from, to, diameter, spec = {}) {
		const dir = sub(to, from);
		const length = magnitude(dir);
		if (length < 1e-4) return null;
		const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
		const yaw = Math.atan2(-dir[2], dir[0]) / DEG;
		const pitch = Math.asin(clamp(dir[1] / length, -1, 1)) / DEG;
		return this.part({
			...spec,
			shape: "cyl",
			pos: mid,
			size: [length, diameter, diameter],
			rot: [0, yaw, pitch],
		});
	}

	/** A rotated box spanning `from` -> `to`; used for ramps, struts and braces. */
	beam(from, to, width, thickness, spec = {}) {
		const dir = sub(to, from);
		const length = magnitude(dir);
		if (length < 1e-4) return null;
		const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
		const yaw = Math.atan2(-dir[2], dir[0]) / DEG;
		const pitch = Math.asin(clamp(dir[1] / length, -1, 1)) / DEG;
		return this.part({
			...spec,
			shape: "box",
			pos: mid,
			size: [length, thickness, width],
			rot: [0, yaw, pitch],
		});
	}

	light(spec) {
		const light = {
			pos: round3(spec.pos),
			color: spec.color ?? [255, 255, 255],
			range: roundTo(spec.range ?? 24, 2),
			brightness: roundTo(spec.brightness ?? 2, 3),
			kind: spec.kind ?? "point",
		};
		if (spec.shadows) light.shadows = true;
		if (spec.flicker) light.flicker = roundTo(spec.flicker, 3);
		if (spec.survivesBlackout) light.survivesBlackout = true;
		if (spec.group ?? this.group) light.group = spec.group ?? this.group;
		this.lights.push(light);
		return light;
	}

	/** A glowing bulb: emissive sphere plus the point light that sells it. */
	bulb(pos, color, radius = 0.6, opts = {}) {
		this.sphere({
			name: opts.name ?? "Bulb",
			pos,
			size: [radius * 2, radius * 2, radius * 2],
			color,
			material: MATERIAL.neon,
			canCollide: false,
			castShadow: false,
		});
		if (opts.light !== false) {
			this.light({
				pos,
				color,
				range: opts.range ?? 18,
				brightness: opts.brightness ?? 1.4,
				flicker: opts.flicker,
				survivesBlackout: opts.survivesBlackout,
			});
		}
	}

	/** Evenly spaced callback around a circle on the XZ plane. */
	ring(center, radius, count, fn, startDeg = 0) {
		for (let i = 0; i < count; i++) {
			const angle = (startDeg + (360 / count) * i) * DEG;
			const pos = [center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius];
			fn(pos, angle / DEG, i);
		}
	}

	/** A ring of short chords approximating a circular neon hoop. */
	neonHoop(center, radius, diameter, color, segments = 48, opts = {}) {
		const pts = [];
		for (let i = 0; i <= segments; i++) {
			const a = ((Math.PI * 2) / segments) * i;
			pts.push([center[0] + Math.cos(a) * radius, center[1], center[2] + Math.sin(a) * radius]);
		}
		for (let i = 0; i < segments; i++) {
			this.tube(pts[i], pts[i + 1], diameter, {
				name: opts.name ?? "NeonHoop",
				color,
				material: MATERIAL.neon,
				canCollide: false,
				castShadow: false,
			});
		}
	}

	/**
	 * Radial panel cone -- the workhorse for tent roofs and stall awnings.
	 * Alternating colours give the classic big-top stripe.
	 */
	coneRoof(center, baseRadius, height, segments, colors, opts = {}) {
		const apex = [center[0], center[1] + height, center[2]];
		const slantLen = Math.sqrt(baseRadius * baseRadius + height * height);
		const panelWidth = (2 * Math.PI * baseRadius) / segments + (opts.overlap ?? 0.6);
		for (let i = 0; i < segments; i++) {
			const angle = ((Math.PI * 2) / segments) * (i + 0.5);
			const baseP = [center[0] + Math.cos(angle) * baseRadius, center[1], center[2] + Math.sin(angle) * baseRadius];
			const mid = [(baseP[0] + apex[0]) / 2, (baseP[1] + apex[1]) / 2, (baseP[2] + apex[2]) / 2];
			const yaw = -angle / DEG;
			const pitch = Math.atan2(height, baseRadius) / DEG;
			this.part({
				name: opts.name ?? "RoofPanel",
				shape: "box",
				pos: mid,
				size: [slantLen, opts.thickness ?? 0.5, panelWidth],
				rot: [0, yaw, pitch],
				color: colors[i % colors.length],
				material: opts.material ?? MATERIAL.fabric,
				canCollide: opts.canCollide ?? true,
			});
		}
	}

	animator(spec) {
		this.animators.push({
			group: spec.group,
			kind: spec.kind ?? "spin",
			axis: spec.axis ?? [0, 1, 0],
			speed: spec.speed,
			...(spec.pivot ? { pivot: round3(spec.pivot) } : {}),
			...(spec.amplitude ? { amplitude: spec.amplitude } : {}),
			...(spec.phase ? { phase: spec.phase } : {}),
		});
	}

	lobbySpawn(pos, lookAtDeg = 0) {
		this.spawns.lobby.push({ pos: round3(pos), yaw: roundTo(lookAtDeg, 1) });
	}

	roundSpawn(pos, lookAtDeg = 0) {
		this.spawns.round.push({ pos: round3(pos), yaw: roundTo(lookAtDeg, 1) });
	}

	coinSpot(pos) {
		this.coinSpots.push(round3(pos));
	}

	navNode(pos, name) {
		this.nav.nodes.push({ pos: round3(pos), ...(name ? { name } : {}) });
		return this.nav.nodes.length - 1;
	}

	navEdge(a, b) {
		this.nav.edges.push([a, b]);
	}

	landmark(name, pos, blurb) {
		this.landmarks.push({ name, pos: round3(pos), blurb });
	}

	/**
	 * Register a footprint that walkable-space sampling must avoid.
	 * `rect` blocks a whole box, `band` blocks only the shell of one (so the
	 * inside of a tent or pavilion stays walkable), `circle` blocks a disc.
	 */
	blocker(spec) {
		this.blockers.push(spec);
		return spec;
	}

	stats() {
		return {
			parts: this.parts.length,
			lights: this.lights.length,
			coinSpots: this.coinSpots.length,
			roundSpawns: this.spawns.round.length,
			lobbySpawns: this.spawns.lobby.length,
			navNodes: this.nav.nodes.length,
			navEdges: this.nav.edges.length,
		};
	}
}

export function sub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function magnitude(v) {
	return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}

export function distanceXZ(a, b) {
	const dx = a[0] - b[0];
	const dz = a[2] - b[2];
	return Math.sqrt(dx * dx + dz * dz);
}

function roundTo(value, places) {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

function round3(v) {
	return [roundTo(v[0], 3), roundTo(v[1], 3), roundTo(v[2], 3)];
}
