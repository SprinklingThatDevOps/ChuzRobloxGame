import * as THREE from "three";

/**
 * Roblox material names mapped onto physically-based parameters.
 * Neon is handled separately -- it becomes unlit geometry that feeds bloom,
 * which is exactly how it reads in Roblox's Future lighting.
 */
const SURFACE = {
	Neon: { neon: true },
	Metal: { roughness: 0.32, metalness: 0.92 },
	Foil: { roughness: 0.16, metalness: 0.95 },
	DiamondPlate: { roughness: 0.42, metalness: 0.85 },
	CorrodedMetal: { roughness: 0.82, metalness: 0.65 },
	Wood: { roughness: 0.88, metalness: 0.02 },
	WoodPlanks: { roughness: 0.92, metalness: 0.02 },
	Concrete: { roughness: 0.97, metalness: 0.0 },
	Slate: { roughness: 0.86, metalness: 0.04 },
	Brick: { roughness: 0.95, metalness: 0.0 },
	Granite: { roughness: 0.8, metalness: 0.05 },
	Pebble: { roughness: 0.95, metalness: 0.0 },
	Sand: { roughness: 1.0, metalness: 0.0 },
	Marble: { roughness: 0.28, metalness: 0.08 },
	Glass: { roughness: 0.08, metalness: 0.1 },
	Fabric: { roughness: 1.0, metalness: 0.0 },
	Plastic: { roughness: 0.55, metalness: 0.0 },
	SmoothPlastic: { roughness: 0.32, metalness: 0.0 },
	Ice: { roughness: 0.12, metalness: 0.05 },
};

export function surfaceOf(materialName) {
	return SURFACE[materialName] ?? SURFACE.SmoothPlastic;
}

export function isNeon(materialName) {
	return surfaceOf(materialName).neon === true;
}

/** Group key: parts sharing one of these can be merged into a single draw call. */
export function bucketKey(part) {
	const transparency = part.transparency ?? 0;
	const reflectance = part.reflectance ?? 0;
	return [
		part.material,
		transparency > 0.001 ? transparency.toFixed(2) : "0",
		reflectance > 0.001 ? reflectance.toFixed(1) : "0",
	].join("|");
}

/**
 * Standard material with two extra vertex channels bolted on:
 *   - vColor    : the part's own colour
 *   - baked     : irradiance precomputed from every light in the map
 *
 * Baking is what lets the scene appear lit by 290 lamps while the GPU only
 * ever evaluates a handful of real ones.
 */
export function makeLitMaterial(part, uniforms) {
	const surface = surfaceOf(part.material);
	const transparency = part.transparency ?? 0;
	const reflectance = part.reflectance ?? 0;

	const material = new THREE.MeshStandardMaterial({
		vertexColors: true,
		roughness: Math.max(0.03, surface.roughness * (1 - reflectance * 0.75)),
		metalness: Math.min(1, surface.metalness + reflectance * 0.55),
		transparent: transparency > 0.001,
		opacity: 1 - transparency,
		side: transparency > 0.001 ? THREE.DoubleSide : THREE.FrontSide,
		envMapIntensity: 0.45 + reflectance,
	});

	material.onBeforeCompile = (shader) => {
		shader.uniforms.uBakeScale = uniforms.bakeScale;
		shader.uniforms.uBakeTint = uniforms.bakeTint;
		shader.vertexShader = shader.vertexShader
			.replace("#include <common>", "#include <common>\nattribute vec3 baked;\nvarying vec3 vBaked;")
			.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvBaked = baked;");
		shader.fragmentShader = shader.fragmentShader
			.replace(
				"#include <common>",
				"#include <common>\nuniform float uBakeScale;\nuniform vec3 uBakeTint;\nvarying vec3 vBaked;",
			)
			.replace(
				"#include <emissivemap_fragment>",
				"#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vBaked * uBakeTint * uBakeScale * diffuseColor.rgb;",
			);
	};
	material.customProgramCacheKey = () => "hollow-baked";
	return material;
}

/** Neon: unlit, slightly over-driven so the bloom pass has something to catch. */
export function makeNeonMaterial(part, uniforms) {
	const transparency = part.transparency ?? 0;
	const material = new THREE.MeshBasicMaterial({
		vertexColors: true,
		transparent: transparency > 0.001,
		opacity: 1 - transparency,
		side: transparency > 0.001 ? THREE.DoubleSide : THREE.FrontSide,
		toneMapped: true,
	});
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uNeonScale = uniforms.neonScale;
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", "#include <common>\nuniform float uNeonScale;")
			.replace(
				"#include <dithering_fragment>",
				"gl_FragColor.rgb *= uNeonScale;\n\t#include <dithering_fragment>",
			);
	};
	material.customProgramCacheKey = () => "hollow-neon";
	return material;
}

export function robloxColor(rgb) {
	const color = new THREE.Color();
	color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
	return color;
}
