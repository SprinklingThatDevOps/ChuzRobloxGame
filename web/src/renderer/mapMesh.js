import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bucketKey, isNeon, makeLitMaterial, makeNeonMaterial, robloxColor } from "./materials.js";
import { makeSignMesh } from "./signs.js";

const DEG = Math.PI / 180;
const MAX_SEGMENTS = 40;

/**
 * Turns MapData into a handful of merged meshes.
 *
 * Everything static collapses into one mesh per material bucket; only groups
 * that an animator drives stay separate. 4,000+ parts end up as roughly 40
 * draw calls, which is what makes this run at 60fps with the fog and bloom on.
 */
export function buildMap(mapData, uniforms, onProgress = () => {}) {
	const root = new THREE.Group();
	root.name = "HollowCarnival";

	const animatedGroups = new Set(mapData.animators.map((a) => a.group));
	const lightIndex = buildLightIndex(mapData.lights);

	const staticBuckets = new Map();
	const dynamicBuckets = new Map();

	for (const part of mapData.parts) {
		const dynamic = part.group && animatedGroups.has(part.group);
		const target = dynamic ? dynamicBuckets : staticBuckets;
		const key = dynamic ? `${part.group}::${bucketKey(part)}` : bucketKey(part);
		let bucket = target.get(key);
		if (!bucket) {
			bucket = { part, group: dynamic ? part.group : null, geometries: [] };
			target.set(key, bucket);
		}
		bucket.geometries.push(makePartGeometry(part, lightIndex));
	}

	onProgress(0.55, "Wiring the neon…");

	const signGroup = new THREE.Group();
	signGroup.name = "Signs";
	for (const part of mapData.parts) {
		if (!part.sign) continue;
		const mesh = makeSignMesh(part, uniforms);
		if (mesh) signGroup.add(mesh);
	}
	root.add(signGroup);

	const staticGroup = new THREE.Group();
	staticGroup.name = "Static";
	for (const bucket of staticBuckets.values()) {
		const mesh = mergeBucket(bucket, uniforms);
		if (mesh) staticGroup.add(mesh);
	}
	root.add(staticGroup);

	onProgress(0.8, "Starting the machinery…");

	// Animated groups: pivot outside, counter-rotatable object inside.
	const dynamicByGroup = new Map();
	for (const bucket of dynamicBuckets.values()) {
		let entry = dynamicByGroup.get(bucket.group);
		if (!entry) {
			entry = { name: bucket.group, meshes: [], bounds: new THREE.Box3() };
			dynamicByGroup.set(bucket.group, entry);
		}
		const mesh = mergeBucket(bucket, uniforms);
		if (!mesh) continue;
		mesh.geometry.computeBoundingBox();
		entry.bounds.union(mesh.geometry.boundingBox);
		entry.meshes.push(mesh);
	}

	const dynamics = [];
	for (const [name, entry] of dynamicByGroup) {
		const animators = mapData.animators.filter((a) => a.group === name);
		const pivotSpec = animators.find((a) => a.pivot)?.pivot;
		const centroid = entry.bounds.getCenter(new THREE.Vector3());
		const pivot = pivotSpec ? new THREE.Vector3(pivotSpec[0], pivotSpec[1], pivotSpec[2]) : centroid.clone();

		const outer = new THREE.Group();
		outer.position.copy(pivot);
		const inner = new THREE.Group();
		inner.position.copy(centroid).sub(pivot);
		for (const mesh of entry.meshes) {
			mesh.geometry.translate(-centroid.x, -centroid.y, -centroid.z);
			inner.add(mesh);
		}
		outer.add(inner);
		root.add(outer);

		dynamics.push({ name, outer, inner, animators, basePosition: inner.position.clone() });
	}

	return { root, dynamics };
}

function mergeBucket(bucket, uniforms) {
	const geometries = bucket.geometries.filter(Boolean);
	if (geometries.length === 0) return null;
	const merged = mergeGeometries(geometries, false);
	if (!merged) return null;
	for (const geometry of geometries) geometry.dispose();

	const neon = isNeon(bucket.part.material);
	const material = neon ? makeNeonMaterial(bucket.part, uniforms) : makeLitMaterial(bucket.part, uniforms);
	const mesh = new THREE.Mesh(merged, material);
	mesh.castShadow = !neon;
	mesh.receiveShadow = !neon;
	mesh.frustumCulled = true;
	return mesh;
}

const boxCache = new Map();
const cylCache = new Map();
let sphereBase = null;

function makePartGeometry(part, lightIndex) {
	const [sx, sy, sz] = part.size;
	let geometry;

	if (part.shape === "sphere") {
		if (!sphereBase) sphereBase = new THREE.SphereGeometry(0.5, 14, 10);
		geometry = sphereBase.clone();
		geometry.scale(sx, sy, sz);
	} else if (part.shape === "cyl") {
		// Roblox cylinders are swept along local X.
		const heightSegments = clampInt(Math.round(sx / 12), 1, 8);
		const key = `${heightSegments}`;
		let base = cylCache.get(key);
		if (!base) {
			base = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, heightSegments, false);
			base.rotateZ(-Math.PI / 2);
			cylCache.set(key, base);
		}
		geometry = base.clone();
		geometry.scale(sx, sy, sz);
	} else {
		const segX = clampInt(Math.round(sx / 9), 1, MAX_SEGMENTS);
		const segY = clampInt(Math.round(sy / 9), 1, MAX_SEGMENTS);
		const segZ = clampInt(Math.round(sz / 9), 1, MAX_SEGMENTS);
		const key = `${segX},${segY},${segZ}`;
		let base = boxCache.get(key);
		if (!base) {
			base = new THREE.BoxGeometry(1, 1, 1, segX, segY, segZ);
			boxCache.set(key, base);
		}
		geometry = base.clone();
		geometry.scale(sx, sy, sz);
	}

	if (part.rot) {
		geometry.rotateX(part.rot[0] * DEG);
		geometry.rotateY(part.rot[1] * DEG);
		geometry.rotateZ(part.rot[2] * DEG);
	}
	geometry.translate(part.pos[0], part.pos[1], part.pos[2]);

	applyVertexChannels(geometry, part, lightIndex);
	return geometry;
}

/** Writes the per-vertex colour and the baked irradiance channel. */
function applyVertexChannels(geometry, part, lightIndex) {
	const position = geometry.attributes.position;
	const normal = geometry.attributes.normal;
	const count = position.count;
	const colors = new Float32Array(count * 3);
	const baked = new Float32Array(count * 3);

	const base = robloxColor(part.color);
	const neon = isNeon(part.material);
	const boost = neon ? 1.9 : 1;

	for (let i = 0; i < count; i++) {
		colors[i * 3] = base.r * boost;
		colors[i * 3 + 1] = base.g * boost;
		colors[i * 3 + 2] = base.b * boost;
	}

	if (!neon) {
		const px = new THREE.Vector3();
		const nx = new THREE.Vector3();
		for (let i = 0; i < count; i++) {
			px.fromBufferAttribute(position, i);
			nx.fromBufferAttribute(normal, i);
			const irradiance = lightIndex.sample(px, nx);
			baked[i * 3] = irradiance[0];
			baked[i * 3 + 1] = irradiance[1];
			baked[i * 3 + 2] = irradiance[2];
		}
	}

	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	geometry.setAttribute("baked", new THREE.BufferAttribute(baked, 3));
	geometry.deleteAttribute("uv");
}

/**
 * Uniform-grid light lookup. Each light is stamped into every cell its range
 * touches, so a vertex only has to consider the lights that could reach it.
 */
function buildLightIndex(lights) {
	const CELL = 32;
	const cells = new Map();
	const prepared = lights.map((light) => ({
		pos: new THREE.Vector3(light.pos[0], light.pos[1], light.pos[2]),
		color: robloxColor(light.color),
		brightness: light.brightness,
		range: light.range,
	}));

	const key = (ix, iy, iz) => `${ix},${iy},${iz}`;
	for (let i = 0; i < prepared.length; i++) {
		const light = prepared[i];
		const r = light.range;
		const minX = Math.floor((light.pos.x - r) / CELL);
		const maxX = Math.floor((light.pos.x + r) / CELL);
		const minY = Math.floor((light.pos.y - r) / CELL);
		const maxY = Math.floor((light.pos.y + r) / CELL);
		const minZ = Math.floor((light.pos.z - r) / CELL);
		const maxZ = Math.floor((light.pos.z + r) / CELL);
		for (let ix = minX; ix <= maxX; ix++) {
			for (let iy = minY; iy <= maxY; iy++) {
				for (let iz = minZ; iz <= maxZ; iz++) {
					const k = key(ix, iy, iz);
					let list = cells.get(k);
					if (!list) {
						list = [];
						cells.set(k, list);
					}
					list.push(i);
				}
			}
		}
	}

	const out = [0, 0, 0];
	const toLight = new THREE.Vector3();
	return {
		sample(point, normalVec) {
			out[0] = 0;
			out[1] = 0;
			out[2] = 0;
			const list = cells.get(key(Math.floor(point.x / CELL), Math.floor(point.y / CELL), Math.floor(point.z / CELL)));
			if (!list) return out;
			for (const index of list) {
				const light = prepared[index];
				toLight.copy(light.pos).sub(point);
				const distance = toLight.length();
				if (distance > light.range) continue;
				const falloff = (1 - distance / light.range) ** 2;
				toLight.divideScalar(Math.max(distance, 0.001));
				// Wrapped lambert: keeps back faces from going pitch black.
				const lambert = Math.max(0, normalVec.dot(toLight)) * 0.82 + 0.18;
				const energy = falloff * lambert * light.brightness * 0.42;
				// Pull each bounce a little toward white: fully saturated
				// bounce light turns every surface into a coloured smear.
				out[0] += (light.color.r * 0.72 + 0.28) * energy;
				out[1] += (light.color.g * 0.72 + 0.28) * energy;
				out[2] += (light.color.b * 0.72 + 0.28) * energy;
			}
			out[0] = Math.min(out[0], 3);
			out[1] = Math.min(out[1], 3);
			out[2] = Math.min(out[2], 3);
			return out;
		},
	};
}

function clampInt(value, min, max) {
	return Math.max(min, Math.min(max, value | 0));
}
