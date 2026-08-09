import * as THREE from "three";
import { robloxColor } from "./materials.js";

const DEG = Math.PI / 180;
const textureCache = new Map();

/** Local-space outward normal and in-plane axes for each supported face. */
const FACES = {
	Front: { normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], axis: ["x", "y", "z"] },
	Back: { normal: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0], axis: ["x", "y", "z"] },
	Right: { normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], axis: ["z", "y", "x"] },
	Left: { normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0], axis: ["z", "y", "x"] },
	Top: { normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1], axis: ["x", "z", "y"] },
};

/**
 * Painted signage, rendered as an unlit quad hovering a hair off the board.
 * Mirrors the SurfaceGui the Roblox builder attaches to the same face.
 */
export function makeSignMesh(part, uniforms) {
	const spec = part.sign;
	const face = FACES[spec.face ?? "Front"] ?? FACES.Front;

	const [sx, sy, sz] = part.size;
	const dims = { x: sx, y: sy, z: sz };
	const width = dims[face.axis[0]] * 0.94;
	const height = dims[face.axis[1]] * 0.86;
	const depth = dims[face.axis[2]];
	if (width <= 0.1 || height <= 0.1) return null;

	const texture = getTexture(spec.text, spec.color, width / height);
	const material = new THREE.MeshBasicMaterial({
		map: texture,
		transparent: true,
		depthWrite: false,
		toneMapped: true,
	});
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uNeonScale = uniforms.neonScale;
		shader.fragmentShader = shader.fragmentShader
			.replace("#include <common>", "#include <common>\nuniform float uNeonScale;")
			.replace(
				"#include <dithering_fragment>",
				"gl_FragColor.rgb *= max(uNeonScale, 0.12);\n\t#include <dithering_fragment>",
			);
	};
	material.customProgramCacheKey = () => "hollow-sign";

	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
	mesh.renderOrder = 2;

	// Orient the quad to the chosen face, then push it out past the surface.
	const normal = new THREE.Vector3(...face.normal);
	const up = new THREE.Vector3(...face.up);
	const quaternion = new THREE.Quaternion().setFromRotationMatrix(
		new THREE.Matrix4().lookAt(new THREE.Vector3(), normal, up),
	);
	mesh.quaternion.copy(quaternion);
	mesh.position.copy(normal).multiplyScalar(depth / 2 + 0.06);

	if (part.rot) {
		const partRotation = new THREE.Euler(part.rot[0] * DEG, part.rot[1] * DEG, part.rot[2] * DEG, "XYZ");
		mesh.position.applyEuler(partRotation);
		mesh.quaternion.premultiply(new THREE.Quaternion().setFromEuler(partRotation));
	}
	mesh.position.add(new THREE.Vector3(part.pos[0], part.pos[1], part.pos[2]));
	return mesh;
}

function getTexture(text, colorRgb, aspect) {
	const key = `${text}|${colorRgb.join(",")}|${aspect.toFixed(2)}`;
	const cached = textureCache.get(key);
	if (cached) return cached;

	const width = 1024;
	const height = Math.max(128, Math.round(width / Math.max(aspect, 0.2)));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");

	const color = robloxColor(colorRgb);
	const css = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
	const lines = String(text).split("\n");

	ctx.clearRect(0, 0, width, height);
	const lineHeight = height / lines.length;
	let fontSize = Math.floor(lineHeight * 0.72);
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Shrink to fit the widest line.
	for (;;) {
		ctx.font = `700 ${fontSize}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
		const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
		if (widest <= width * 0.9 || fontSize <= 12) break;
		fontSize -= 4;
	}

	lines.forEach((line, i) => {
		const y = lineHeight * (i + 0.5);
		ctx.shadowColor = css;
		ctx.shadowBlur = fontSize * 0.55;
		ctx.fillStyle = css;
		ctx.fillText(line, width / 2, y);
		// Second pass to build up a hot core inside the glow.
		ctx.shadowBlur = fontSize * 0.2;
		ctx.fillStyle = "#fff8ff";
		ctx.fillText(line, width / 2, y);
	});

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	textureCache.set(key, texture);
	return texture;
}
