import * as THREE from "three";
import { Stage } from "./renderer/scene.js";
import { buildMap } from "./renderer/mapMesh.js";
import { Actor, makeCoin } from "./renderer/actors.js";
import { NavMesh } from "./sim/nav.js";
import { RoundSim } from "./sim/round.js";
import { Phase, Role } from "./sim/rules.js";
import { Director } from "./ui/director.js";
import { Hud } from "./ui/hud.js";

const ROLE_LOOK = {
	[Role.Innocent]: { shirt: 0x2f4f78, accent: [126, 200, 255] },
	[Role.Sheriff]: { shirt: 0x6b4a12, accent: [255, 214, 96] },
	[Role.Murderer]: { shirt: 0x3a0d16, accent: [255, 74, 92] },
	[Role.Hero]: { shirt: 0x1d5237, accent: [156, 255, 186] },
	[Role.Spectator]: { shirt: 0x35353d, accent: [170, 170, 180] },
};

const FIXED_STEP = 1 / 60;

async function boot() {
	const [config, mapData] = await Promise.all([
		fetch("./GameConfig.json").then((r) => r.json()),
		fetch("./MapData.json").then((r) => r.json()),
	]);

	const hud = new Hud(config);
	hud.setProgress(0.15, "Unfolding the midway…");
	await nextFrame();

	const stage = new Stage(document.getElementById("stage"), config);
	hud.setProgress(0.3, "Baking 290 lamps into the fog…");
	await nextFrame();

	const built = buildMap(mapData, stage.uniforms, (fraction, status) => hud.setProgress(0.3 + fraction * 0.5, status));
	stage.setMap(mapData, built);
	hud.setProgress(0.88, "Handing out the knives…");
	await nextFrame();

	const nav = new NavMesh(mapData.nav);
	const random = mulberry32(0xc0ffee);

	const sim = new RoundSim({
		config,
		mapData,
		nav,
		random,
		botCount: 12,
		onEvent: (event) => handleEvent(event),
	});

	const actors = sim.bots.map(
		(bot) => new Actor(stage.scene, { name: bot.name, shirt: ROLE_LOOK[Role.Innocent].shirt, accent: ROLE_LOOK[Role.Innocent].accent }),
	);

	// Coin pool, sized to the largest number the config can ask for.
	const coinPool = [];
	for (let i = 0; i < config.coins.activeCount + 4; i++) {
		const coin = makeCoin();
		coin.visible = false;
		stage.scene.add(coin);
		coinPool.push(coin);
	}

	const gunDrops = [];
	for (let i = 0; i < 4; i++) {
		const drop = new THREE.Mesh(
			new THREE.BoxGeometry(1.6, 0.5, 2.6),
			new THREE.MeshStandardMaterial({ color: 0xb0b0bc, emissive: 0xffd460, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.25 }),
		);
		drop.visible = false;
		stage.scene.add(drop);
		gunDrops.push(drop);
	}

	const director = new Director(stage.camera, mapData, sim);
	director.attachInput(stage.renderer.domElement);

	const params = new URLSearchParams(location.search);
	// Capture mode hands the clock to an external driver so the demo video can
	// be rendered frame-by-frame at a perfect cadence on a machine with no GPU.
	const capture = params.has("capture");
	let speed = Number(params.get("speed") ?? 2);
	let paused = false;
	let bannerTimer = 0;

	function handleEvent(event) {
		hud.pushEvent(event);
		if (event.kind === "kill") {
			const victim = sim.bots.find((bot) => bot.name === event.victim);
			if (victim) director.cutToKill(victim.pos);
		} else if (event.kind === "blackout_start") {
			director.punch(1.2);
		} else if (event.kind === "phase" && event.phase === Phase.PostRound) {
			hud.showBanner(bannerTitleFor(sim.outcome), event.message);
			bannerTimer = config.round.postRoundSeconds * 0.7;
		} else if (event.kind === "roles") {
			hud.hideBanner();
		}
	}

	window.addEventListener("keydown", (e) => {
		if (e.code === "Space") {
			paused = !paused;
			e.preventDefault();
		} else if (e.code === "KeyC") {
			director.nextShot();
		} else if (e.code === "KeyF") {
			director.toggleFree();
		} else if (e.code === "KeyR") {
			sim.reset();
			sim.setPhase(Phase.Grace);
		} else if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) {
			speed = [1, 2, 4, 8][Number(e.code.slice(5)) - 1];
		}
	});

	hud.setProgress(1, "Ready");
	await nextFrame();
	hud.ready();

	let accumulator = 0;
	let clock = 0;

	function tick(wall) {
		clock += wall;
		if (!paused) {
			accumulator += wall * speed;
			let guard = 0;
			while (accumulator >= FIXED_STEP && guard++ < 40) {
				sim.update(FIXED_STEP);
				accumulator -= FIXED_STEP;
			}
		}

		syncActors(sim, actors, wall);
		syncCoins(sim, coinPool, clock * 1000);
		syncGuns(sim, gunDrops);

		stage.setBlackout(sim.blackoutAmount);
		stage.update(wall);
		director.update(wall);

		if (bannerTimer > 0) {
			bannerTimer -= wall * speed;
			if (bannerTimer <= 0) hud.hideBanner();
		}
		hud.pulseFlash(sim.blackoutAmount > 0.15 && sim.blackoutAmount < 0.6 ? 0.25 : 0);
		hud.update(sim, director.shotName, speed, paused);
		stage.render();
	}

	if (capture) {
		document.getElementById("loading").style.display = "none";
		window.__hollow = {
			ready: true,
			step: (dt) => tick(dt),
			// Advances the simulation without drawing it. Rendering is the
			// expensive half on a machine with no GPU, so skipping ahead to an
			// interesting round costs seconds instead of minutes.
			fastForward: (seconds) => {
				let remaining = seconds;
				while (remaining > 1e-6) {
					const step = Math.min(FIXED_STEP, remaining);
					sim.update(step);
					remaining -= step;
				}
				hud.clearEvents();
				hud.hideBanner();
				bannerTimer = 0;
				director.snap();
			},
			state: () => ({ phase: sim.phase, timeLeft: sim.timeLeft, outcome: sim.outcome, shot: director.shotName }),
			setShot: (name) => {
				director.shot = name;
				director.shotTime = 0;
			},
			skipTo: (phase) => {
				sim.setPhase(phase);
			},
			setCamera: ({ pos, target, fov }) => {
				director.free = true;
				director.shot = "POSTER";
				stage.camera.position.set(pos[0], pos[1], pos[2]);
				stage.camera.lookAt(target[0], target[1], target[2]);
				if (fov) {
					stage.camera.fov = fov;
					stage.camera.updateProjectionMatrix();
				}
				director.updateFreeFly = () => {};
			},
			setHudVisible: (visible) => {
				document.getElementById("hud").hidden = !visible;
			},
		};
		tick(0.0001);
		return;
	}

	let last = performance.now();
	function frame(now) {
		const wall = Math.min((now - last) / 1000, 0.1);
		last = now;
		tick(wall);
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

function syncActors(sim, actors, dt) {
	for (let i = 0; i < sim.bots.length; i++) {
		const bot = sim.bots[i];
		const actor = actors[i];
		const look = ROLE_LOOK[bot.role] ?? ROLE_LOOK[Role.Innocent];

		if (actor.roleKey !== bot.role) {
			actor.roleKey = bot.role;
			actor.setRoleVisual(look.shirt, look.accent);
			if (bot.role === Role.Murderer) actor.giveKnife();
			else if (bot.hasGun) actor.giveRevolver();
			else actor.clearTool();
		}
		if (bot.hasGun && actor.toolKind !== "gun") {
			actor.giveRevolver();
			actor.toolKind = "gun";
		} else if (!bot.hasGun && bot.role !== Role.Murderer && actor.toolKind === "gun") {
			actor.clearTool();
			actor.toolKind = null;
		}

		actor.setBlackout(sim.blackoutAmount);
		if (bot.alive && !actor.alive) actor.revive();
		if (!bot.alive && actor.alive) {
			actor.setPosition(bot.pos[0], bot.pos[1], bot.pos[2]);
			actor.kill();
			continue;
		}
		if (!bot.alive) continue;

		actor.setPosition(bot.pos[0], bot.pos[1], bot.pos[2]);
		actor.group.rotation.y = bot.heading;
		actor.animate(dt, bot.speed);
	}
}

function syncCoins(sim, pool, now) {
	const spin = now * 0.0025;
	let index = 0;
	for (const coin of sim.coins) {
		if (index >= pool.length) break;
		const mesh = pool[index++];
		mesh.visible = coin.active && sim.phase !== Phase.Intermission;
		if (!mesh.visible) continue;
		mesh.position.set(coin.pos[0], coin.pos[1] + Math.sin(spin * 2 + coin.index) * 0.5, coin.pos[2]);
		mesh.rotation.y = spin * 2;
	}
	for (; index < pool.length; index++) pool[index].visible = false;
}

function syncGuns(sim, drops) {
	for (let i = 0; i < drops.length; i++) {
		const gun = sim.droppedGuns[i];
		drops[i].visible = Boolean(gun) && !gun.taken;
		if (gun && !gun.taken) drops[i].position.set(gun.pos[0], gun.pos[1], gun.pos[2]);
	}
}

function bannerTitleFor(outcome) {
	switch (outcome) {
		case "InnocentsWin":
			return "INNOCENTS WIN";
		case "MurderersWin":
			return "MURDERER WINS";
		case "TimeUp":
			return "SURVIVORS WIN";
		default:
			return "ROUND OVER";
	}
}

function nextFrame() {
	return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function mulberry32(seed) {
	let a = seed >>> 0;
	return function random() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

boot();
