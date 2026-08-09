import * as THREE from "three";
import { Role } from "../sim/rules.js";
import { distanceXZ } from "../sim/nav.js";

const KILL_ORBIT_RADIUS = 19;

const SHOTS = {
	ESTABLISHING: "ESTABLISHING",
	CHASE: "CHASE",
	KILL: "REACTION",
	CRANE: "CRANE",
	LOBBY: "TICKET HALL",
	FREE: "FREE FLY",
};

/**
 * Camera department. Picks a shot, holds it long enough to read, and cuts to
 * the action when something actually happens.
 */
export class Director {
	constructor(camera, mapData, sim) {
		this.camera = camera;
		this.mapData = mapData;
		this.sim = sim;
		this.shot = SHOTS.ESTABLISHING;
		this.shotTime = 0;
		this.shotDuration = 9;
		this.landmarkIndex = 0;
		this.orbitAngle = 0;
		this.free = false;

		this.desiredPosition = new THREE.Vector3(0, 70, 220);
		this.desiredTarget = new THREE.Vector3(0, 10, 0);
		this.currentTarget = new THREE.Vector3(0, 10, 0);
		this.shakeAmount = 0;

		this.keys = new Set();
		this.freeYaw = 0;
		this.freePitch = -0.2;
		this.dragging = false;
	}

	attachInput(canvas) {
		window.addEventListener("keydown", (e) => this.keys.add(e.code));
		window.addEventListener("keyup", (e) => this.keys.delete(e.code));
		canvas.addEventListener("pointerdown", () => {
			this.dragging = true;
		});
		window.addEventListener("pointerup", () => {
			this.dragging = false;
		});
		window.addEventListener("pointermove", (e) => {
			if (!this.dragging || !this.free) return;
			this.freeYaw -= e.movementX * 0.0032;
			this.freePitch = THREE.MathUtils.clamp(this.freePitch - e.movementY * 0.0032, -1.35, 1.2);
		});
	}

	toggleFree() {
		this.free = !this.free;
		if (this.free) {
			this.freeYaw = Math.atan2(
				this.camera.position.x - this.currentTarget.x,
				this.camera.position.z - this.currentTarget.z,
			);
			this.shot = SHOTS.FREE;
		} else {
			this.shot = SHOTS.ESTABLISHING;
			this.shotTime = this.shotDuration;
		}
	}

	nextShot() {
		this.shotTime = this.shotDuration;
	}

	/**
	 * Puts the camera on its mark with no travel. Used after skipping the
	 * simulation forward, where the usual glide would spend the opening
	 * seconds of a capture crossing the map from wherever the camera was.
	 */
	snap() {
		this.free = false;
		this.chooseShot();
		this.composeShot(0);
		this.camera.position.copy(this.desiredPosition);
		this.currentTarget.copy(this.desiredTarget);
		this.camera.lookAt(this.currentTarget);
	}

	punch(amount = 1) {
		this.shakeAmount = Math.min(2.4, this.shakeAmount + amount);
	}

	/** Cut hard to a killing, wherever it happened. */
	cutToKill(position) {
		this.shot = SHOTS.KILL;
		this.shotTime = 0;
		this.shotDuration = 4.2;
		this.killAnchor = new THREE.Vector3(position[0], position[1], position[2]);
		this.orbitAngle = this.openAngleAround(position, KILL_ORBIT_RADIUS);
		this.punch(1.6);
	}

	/**
	 * Kills happen wherever the chase ended, which is often against a stall
	 * wall or inside the big top. Orbiting from a random bearing puts the
	 * camera inside the scenery about as often as not, so bearings are scored
	 * against the walkable graph and the most open one wins: if the camera can
	 * stand there, it can see out.
	 */
	openAngleAround(position, radius) {
		const nav = this.sim.nav;
		if (!nav) return Math.random() * Math.PI * 2;

		let bestAngle = Math.random() * Math.PI * 2;
		let bestScore = Infinity;
		const offset = Math.random() * Math.PI * 2;
		for (let i = 0; i < 8; i++) {
			const angle = offset + (i / 8) * Math.PI * 2;
			const x = position[0] + Math.cos(angle) * radius;
			const z = position[2] + Math.sin(angle) * radius;
			const score = nav.distanceToGraph(x, z);
			if (score < bestScore) {
				bestScore = score;
				bestAngle = angle;
			}
		}
		return bestAngle;
	}

	update(dt) {
		this.shotTime += dt;
		this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.2);

		if (this.free) {
			this.updateFreeFly(dt);
			return;
		}

		if (this.shotTime >= this.shotDuration) this.chooseShot();
		this.composeShot(dt);

		const smoothing = 1 - Math.exp(-dt * (this.shot === SHOTS.KILL ? 5.5 : 2.1));
		this.camera.position.lerp(this.desiredPosition, smoothing);
		this.currentTarget.lerp(this.desiredTarget, 1 - Math.exp(-dt * 3.4));

		if (this.shakeAmount > 0.001) {
			const t = performance.now() * 0.02;
			this.camera.position.x += Math.sin(t * 1.7) * this.shakeAmount * 0.4;
			this.camera.position.y += Math.cos(t * 2.3) * this.shakeAmount * 0.3;
		}
		this.camera.lookAt(this.currentTarget);
	}

	chooseShot() {
		this.shotTime = 0;
		const sim = this.sim;

		if (sim.phase === "Intermission") {
			this.shot = SHOTS.LOBBY;
			this.shotDuration = 8;
			this.orbitAngle = Math.random() * Math.PI * 2;
			return;
		}

		const murderer = sim.bots.find((bot) => bot.alive && bot.role === Role.Murderer);
		if (murderer) {
			const prey = sim.bots
				.filter((bot) => bot.alive && bot.role !== Role.Murderer)
				.map((bot) => ({ bot, d: distanceXZ(bot.pos, murderer.pos) }))
				.sort((a, b) => a.d - b.d)[0];
			if (prey && prey.d < 65) {
				this.shot = SHOTS.CHASE;
				this.shotDuration = 7;
				this.chaseA = murderer;
				this.chaseB = prey.bot;
				return;
			}
		}

		if (Math.random() < 0.45) {
			this.shot = SHOTS.CRANE;
			this.shotDuration = 8;
			this.craneAnchor = murderer ? murderer.pos.slice() : [0, 3, 0];
			return;
		}

		this.shot = SHOTS.ESTABLISHING;
		this.shotDuration = 9;
		this.landmarkIndex = (this.landmarkIndex + 1) % this.mapData.landmarks.length;
		this.orbitAngle = Math.random() * Math.PI * 2;
	}

	composeShot(dt) {
		switch (this.shot) {
			case SHOTS.LOBBY: {
				const lobby = this.mapData.spawns.lobby[0].pos;
				this.orbitAngle += dt * 0.16;
				const radius = 92;
				this.desiredPosition.set(
					lobby[0] + Math.cos(this.orbitAngle) * radius,
					lobby[1] + 34,
					lobby[2] + Math.sin(this.orbitAngle) * radius,
				);
				this.desiredTarget.set(lobby[0], lobby[1] + 10, lobby[2]);
				break;
			}
			case SHOTS.KILL: {
				this.orbitAngle += dt * 0.4;
				const anchor = this.killAnchor;
				this.desiredPosition.set(
					anchor.x + Math.cos(this.orbitAngle) * KILL_ORBIT_RADIUS,
					anchor.y + 12,
					anchor.z + Math.sin(this.orbitAngle) * KILL_ORBIT_RADIUS,
				);
				this.desiredTarget.copy(anchor).add(new THREE.Vector3(0, 3, 0));
				break;
			}
			case SHOTS.CHASE: {
				const a = this.chaseA;
				const b = this.chaseB;
				if (!a || !a.alive) {
					this.shotTime = this.shotDuration;
					break;
				}
				const midX = b && b.alive ? (a.pos[0] + b.pos[0]) / 2 : a.pos[0];
				const midZ = b && b.alive ? (a.pos[2] + b.pos[2]) / 2 : a.pos[2];
				const behind = a.heading + Math.PI;
				this.desiredPosition.set(
					a.pos[0] + Math.sin(behind) * 26,
					a.pos[1] + 15,
					a.pos[2] + Math.cos(behind) * 26,
				);
				this.desiredTarget.set(midX, 4, midZ);
				break;
			}
			case SHOTS.CRANE: {
				this.orbitAngle += dt * 0.1;
				const anchor = this.craneAnchor ?? [0, 3, 0];
				const radius = 120 - this.shotTime * 5;
				this.desiredPosition.set(
					anchor[0] + Math.cos(this.orbitAngle) * radius,
					62 - this.shotTime * 2.4,
					anchor[2] + Math.sin(this.orbitAngle) * radius,
				);
				this.desiredTarget.set(anchor[0], 12, anchor[2]);
				break;
			}
			default: {
				const landmark = this.mapData.landmarks[this.landmarkIndex];
				this.orbitAngle += dt * 0.11;
				const radius = 105;
				this.desiredPosition.set(
					landmark.pos[0] + Math.cos(this.orbitAngle) * radius,
					landmark.pos[1] + 46,
					landmark.pos[2] + Math.sin(this.orbitAngle) * radius,
				);
				this.desiredTarget.set(landmark.pos[0], landmark.pos[1] + 18, landmark.pos[2]);
			}
		}
	}

	updateFreeFly(dt) {
		const speed = (this.keys.has("ShiftLeft") ? 190 : 65) * dt;
		const forward = new THREE.Vector3(-Math.sin(this.freeYaw), 0, -Math.cos(this.freeYaw));
		const right = new THREE.Vector3(forward.z, 0, -forward.x);
		if (this.keys.has("KeyW")) this.camera.position.addScaledVector(forward, speed);
		if (this.keys.has("KeyS")) this.camera.position.addScaledVector(forward, -speed);
		if (this.keys.has("KeyA")) this.camera.position.addScaledVector(right, -speed);
		if (this.keys.has("KeyD")) this.camera.position.addScaledVector(right, speed);
		if (this.keys.has("KeyE")) this.camera.position.y += speed;
		if (this.keys.has("KeyQ")) this.camera.position.y -= speed;

		const look = new THREE.Vector3(
			this.camera.position.x - Math.sin(this.freeYaw) * 10,
			this.camera.position.y + Math.tan(this.freePitch) * 10,
			this.camera.position.z - Math.cos(this.freeYaw) * 10,
		);
		this.currentTarget.copy(look);
		this.camera.lookAt(look);
	}

	get shotName() {
		return this.shot;
	}
}
