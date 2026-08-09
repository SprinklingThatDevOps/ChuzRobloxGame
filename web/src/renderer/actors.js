import * as THREE from "three";
import { robloxColor } from "./materials.js";

const DEG = Math.PI / 180;

/** R6-proportioned blocky avatars, sized in studs to match the Roblox rig. */
const RIG = {
	torso: [2, 2, 1],
	head: [1.6, 1.4, 1.4],
	limb: [1, 2, 1],
	hipHeight: 3,
};

const SKIN = 0xd8a878;

export class Actor {
	constructor(scene, { name, shirt, accent }) {
		this.name = name;
		this.group = new THREE.Group();
		this.alive = true;
		this.walkPhase = Math.random() * Math.PI * 2;

		const shirtColor = new THREE.Color(shirt);
		const accentColor = robloxColor(accent);

		this.torso = box(RIG.torso, shirtColor);
		this.torso.position.y = RIG.hipHeight + 1;
		this.group.add(this.torso);

		this.head = box(RIG.head, SKIN);
		this.head.position.y = RIG.hipHeight + 2.7;
		this.group.add(this.head);

		// Role halo: the readable, at-a-glance identity in a foggy scene.
		this.halo = new THREE.Mesh(
			new THREE.TorusGeometry(1.1, 0.14, 8, 20),
			new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.95 }),
		);
		this.halo.rotation.x = Math.PI / 2;
		this.halo.position.y = RIG.hipHeight + 4.1;
		this.group.add(this.halo);

		this.glow = new THREE.PointLight(accentColor, 6, 26, 2);
		this.glow.position.y = RIG.hipHeight + 3;
		this.group.add(this.glow);

		// A carried lamp, the counterpart of the client's HollowLantern. It is
		// nearly invisible under the midway neon and is the only thing between
		// a character and total darkness once the generator cuts out.
		this.lantern = new THREE.Mesh(
			new THREE.SphereGeometry(0.34, 10, 8),
			new THREE.MeshBasicMaterial({ color: 0xffce96, transparent: true, opacity: 0.45 }),
		);
		this.lantern.position.set(-1.5, RIG.hipHeight - 0.4, 0.4);
		this.group.add(this.lantern);

		this.limbs = {};
		for (const [key, x, isArm] of [
			["leftArm", -1.5, true],
			["rightArm", 1.5, true],
			["leftLeg", -0.5, false],
			["rightLeg", 0.5, false],
		]) {
			const pivot = new THREE.Group();
			pivot.position.set(x, isArm ? RIG.hipHeight + 2 : RIG.hipHeight, 0);
			const limb = box(RIG.limb, isArm ? SKIN : shirtColor);
			limb.position.y = -1;
			pivot.add(limb);
			this.group.add(pivot);
			this.limbs[key] = pivot;
		}

		this.tool = new THREE.Group();
		this.tool.position.set(0, -1.9, -0.4);
		this.limbs.rightArm.add(this.tool);

		scene.add(this.group);
	}

	setRoleVisual(shirt, accent) {
		this.torso.material.color.set(shirt);
		this.limbs.leftLeg.children[0].material.color.set(shirt);
		this.limbs.rightLeg.children[0].material.color.set(shirt);
		const accentColor = robloxColor(accent);
		this.halo.material.color.copy(accentColor);
		this.glow.color.copy(accentColor);
	}

	giveKnife() {
		this.clearTool();
		const handle = box([0.3, 1, 0.3], 0x2a1a12);
		const blade = box([0.22, 1.6, 0.7], 0xdfe8f0);
		blade.position.y = 1.2;
		blade.material = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, metalness: 0.95, roughness: 0.15 });
		this.tool.add(handle, blade);
		this.tool.rotation.x = -Math.PI / 2;
	}

	giveRevolver() {
		this.clearTool();
		const grip = box([0.3, 0.9, 0.4], 0x3a2418);
		const barrel = box([0.28, 0.35, 1.8], 0x9a9aa4);
		barrel.position.set(0, 0.6, -0.7);
		barrel.material = new THREE.MeshStandardMaterial({ color: 0xb0b0bc, metalness: 0.9, roughness: 0.25 });
		this.tool.add(grip, barrel);
		this.tool.rotation.x = -Math.PI / 2.4;
	}

	clearTool() {
		while (this.tool.children.length > 0) this.tool.remove(this.tool.children[0]);
		this.tool.rotation.set(0, 0, 0);
	}

	/**
	 * In a blackout the park's own lights are gone, so a character's halo and
	 * lamp become the only thing lighting them. Without this the previsualizer
	 * renders nine seconds of empty black every time the generator cuts out.
	 */
	setBlackout(amount) {
		const k = Math.min(Math.max(amount, 0), 1);
		this.lantern.material.opacity = 0.45 + 0.5 * k;
		if (!this.alive) return;
		this.glow.intensity = 6 + 20 * k;
		this.glow.distance = 26 + 14 * k;
	}

	setPosition(x, y, z) {
		this.group.position.set(x, y, z);
	}

	faceTowards(x, z) {
		const dx = x - this.group.position.x;
		const dz = z - this.group.position.z;
		if (dx * dx + dz * dz < 0.0004) return;
		this.group.rotation.y = Math.atan2(dx, dz);
	}

	animate(dt, speed) {
		if (!this.alive) return;
		this.walkPhase += dt * speed * 0.55;
		const swing = Math.min(speed / 16, 1.4) * 42 * DEG;
		const s = Math.sin(this.walkPhase);
		this.limbs.leftLeg.rotation.x = s * swing;
		this.limbs.rightLeg.rotation.x = -s * swing;
		this.limbs.leftArm.rotation.x = -s * swing * 0.8;
		this.limbs.rightArm.rotation.x = s * swing * 0.8;
		this.halo.rotation.z += dt * 1.4;
		this.halo.position.y = RIG.hipHeight + 4.1 + Math.sin(this.walkPhase * 0.5) * 0.12;
	}

	kill() {
		if (!this.alive) return;
		this.alive = false;
		this.group.rotation.x = -Math.PI / 2;
		this.group.position.y -= 2.4;
		for (const limb of Object.values(this.limbs)) {
			limb.rotation.x = (Math.random() - 0.5) * 1.2;
			limb.rotation.z = (Math.random() - 0.5) * 1.2;
		}
		this.halo.material.color.set(0x552233);
		this.halo.material.opacity = 0.45;
		this.glow.intensity = 1.2;
		this.glow.color.set(0x882233);
		this.clearTool();
	}

	revive() {
		this.alive = true;
		this.group.rotation.set(0, 0, 0);
		this.halo.material.opacity = 0.95;
		this.glow.intensity = 6;
		for (const limb of Object.values(this.limbs)) limb.rotation.set(0, 0, 0);
	}

	setVisible(visible) {
		this.group.visible = visible;
	}
}

function box(size, color) {
	const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
	const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04 });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	return mesh;
}

/** A spinning coin pickup. */
export function makeCoin() {
	const group = new THREE.Group();
	const geometry = new THREE.CylinderGeometry(0.85, 0.85, 0.18, 16);
	geometry.rotateZ(Math.PI / 2);
	const material = new THREE.MeshStandardMaterial({
		color: 0xffc23c,
		emissive: 0xff9c1a,
		emissiveIntensity: 1.6,
		metalness: 0.9,
		roughness: 0.25,
	});
	const mesh = new THREE.Mesh(geometry, material);
	group.add(mesh);
	group.userData.mesh = mesh;
	return group;
}
