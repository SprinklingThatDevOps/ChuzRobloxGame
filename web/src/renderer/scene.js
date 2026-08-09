import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { robloxColor } from "./materials.js";

const DEG = Math.PI / 180;
const POOL_SIZE = 12;

/**
 * Renderer, atmosphere and the small pool of real-time lights.
 *
 * The map's ~290 lamps are baked into vertices at load; this pool re-creates
 * the nearest dozen as actual point lights so surfaces near the camera still
 * get specular highlights and react when the power dies.
 */
export class Stage {
	constructor(canvas, config) {
		this.config = config;
		this.uniforms = {
			bakeScale: { value: 1 },
			bakeTint: { value: new THREE.Vector3(1, 1, 1) },
			neonScale: { value: 1 },
		};

		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.12;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.6, 2600);
		this.camera.position.set(0, 60, 240);

		const normal = config.lighting.normal;
		this.fogColorNormal = robloxColor(normal.fogColor);
		this.fogColorBlackout = robloxColor(config.lighting.blackout.fogColor);
		this.scene.fog = new THREE.Fog(this.fogColorNormal.clone(), normal.fogStart, normal.fogEnd);
		this.scene.background = this.fogColorNormal.clone();

		// Ambient is deliberately weak: the carnival should be lit by its own
		// signage, with everything between the lamps falling into real darkness.
		this.ambient = new THREE.AmbientLight(robloxColor(normal.outdoorAmbient), 0.55);
		this.scene.add(this.ambient);

		this.hemisphere = new THREE.HemisphereLight(robloxColor([56, 44, 82]), robloxColor([8, 6, 14]), 0.35);
		this.scene.add(this.hemisphere);

		// Moonlight: the only shadow-caster, angled to rake across the midway.
		this.moon = new THREE.DirectionalLight(0x8fa8ff, 0.62);
		this.moon.position.set(-220, 320, 180);
		this.moon.castShadow = true;
		this.moon.shadow.mapSize.set(2048, 2048);
		this.moon.shadow.camera.near = 40;
		this.moon.shadow.camera.far = 900;
		const extent = 300;
		Object.assign(this.moon.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent });
		this.moon.shadow.bias = -0.0012;
		this.scene.add(this.moon);
		this.scene.add(this.moon.target);

		this.pool = [];
		for (let i = 0; i < POOL_SIZE; i++) {
			const light = new THREE.PointLight(0xffffff, 0, 40, 2);
			this.scene.add(light);
			this.pool.push(light);
		}

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloom = new UnrealBloomPass(
			new THREE.Vector2(window.innerWidth, window.innerHeight),
			0.72,
			0.48,
			0.75,
		);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());

		this.blackout = 0;
		this.time = 0;
		this.mapLights = [];
		this.dynamics = [];

		window.addEventListener("resize", () => this.resize());
	}

	resize() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h);
		this.composer.setSize(w, h);
		this.bloom.setSize(w, h);
	}

	setMap(mapData, built) {
		this.scene.add(built.root);
		this.dynamics = built.dynamics;
		this.mapLights = mapData.lights.map((light) => ({
			position: new THREE.Vector3(light.pos[0], light.pos[1], light.pos[2]),
			color: robloxColor(light.color),
			brightness: light.brightness,
			range: light.range,
			flicker: light.flicker ?? 0,
			survivesBlackout: light.survivesBlackout === true,
			score: 0,
		}));
		this.moon.target.position.set(0, 0, 0);
	}

	/** 0 = full power, 1 = total blackout. */
	setBlackout(amount) {
		this.blackout = THREE.MathUtils.clamp(amount, 0, 1);
	}

	update(dt) {
		this.time += dt;
		const k = this.blackout;
		const normal = this.config.lighting.normal;
		const dark = this.config.lighting.blackout;

		this.uniforms.bakeScale.value = THREE.MathUtils.lerp(1.0, 0.05, k);
		this.uniforms.neonScale.value = THREE.MathUtils.lerp(1, 0.14, k);
		this.ambient.intensity = THREE.MathUtils.lerp(0.55, 0.07, k);
		this.hemisphere.intensity = THREE.MathUtils.lerp(0.35, 0.05, k);
		this.moon.intensity = THREE.MathUtils.lerp(0.62, 0.2, k);
		this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.12, 0.8, k);
		this.bloom.strength = THREE.MathUtils.lerp(0.72, 1.15, k);

		this.scene.fog.near = THREE.MathUtils.lerp(normal.fogStart, dark.fogStart, k);
		this.scene.fog.far = THREE.MathUtils.lerp(normal.fogEnd, dark.fogEnd, k);
		this.scene.fog.color.copy(this.fogColorNormal).lerp(this.fogColorBlackout, k);
		this.scene.background.copy(this.scene.fog.color);

		this.updateAnimators();
		this.updateLightPool();
	}

	updateAnimators() {
		for (const dynamic of this.dynamics) {
			let spinAngle = 0;
			let bobOffset = 0;
			let axis = null;

			for (const animator of dynamic.animators) {
				if (animator.kind === "spin" || animator.kind === "orbit") {
					spinAngle = this.time * animator.speed * DEG;
					axis = animator.axis;
					if (animator.kind === "orbit") {
						dynamic.inner.setRotationFromAxisAngle(
							new THREE.Vector3(axis[0], axis[1], axis[2]),
							-spinAngle,
						);
					}
				} else if (animator.kind === "bob") {
					bobOffset =
						Math.sin(this.time * animator.speed * DEG + (animator.phase ?? 0) * DEG) *
						(animator.amplitude ?? 1);
				}
			}

			if (axis) {
				dynamic.outer.setRotationFromAxisAngle(new THREE.Vector3(axis[0], axis[1], axis[2]), spinAngle);
			}
			dynamic.inner.position.copy(dynamic.basePosition);
			dynamic.inner.position.y += bobOffset;
		}
	}

	/** Re-point the pooled lights at whatever matters most from here. */
	updateLightPool() {
		const camera = this.camera.position;
		for (const light of this.mapLights) {
			const distance = light.position.distanceTo(camera);
			light.score = (light.brightness * light.range * light.range) / (distance * distance + 400);
		}
		const chosen = this.mapLights
			.slice()
			.sort((a, b) => b.score - a.score)
			.slice(0, POOL_SIZE);

		for (let i = 0; i < this.pool.length; i++) {
			const target = chosen[i];
			const light = this.pool[i];
			if (!target) {
				light.intensity = 0;
				continue;
			}
			const flicker =
				target.flicker > 0
					? 1 - target.flicker * (0.5 + 0.5 * Math.sin(this.time * 21 + target.position.x))
					: 1;
			const dim = target.survivesBlackout ? 1 : 1 - this.blackout * 0.94;
			light.position.copy(target.position);
			light.color.copy(target.color);
			light.distance = target.range;
			light.intensity = target.brightness * flicker * dim * 11;
		}
	}

	render() {
		this.composer.render();
	}
}
