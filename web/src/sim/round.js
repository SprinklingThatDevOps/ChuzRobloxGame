import { Phase, Role, Outcome, assignRoles, blackoutSchedule, evaluateOutcome, nextPhase, phaseDuration } from "./rules.js";
import { distanceXZ } from "./nav.js";

const BOT_NAMES = [
	"Marlow", "Pippa", "Cass", "Odile", "Renner", "Juno", "Halloway", "Bex",
	"Sable", "Tuck", "Nadia", "Grimes", "Wren", "Otto", "Delphine", "Kip",
];

/**
 * Headless simulation of a full Hollow Carnival round.
 *
 * It contains no rendering code at all, so the same file runs under Node in
 * tests/sim-smoke.test.mjs to prove rounds always terminate with a winner.
 *
 * The bots model the one thing a murder mystery lives or dies on: nobody knows
 * who the murderer is. A bot only identifies the killer up close, or after
 * watching them kill someone. Give the armed bots perfect knowledge instead and
 * the sheriff wins essentially every round from across the park -- which is
 * both a boring demo and a lie about how the game plays.
 */
export class RoundSim {
	constructor({ config, mapData, nav, random, botCount = 12, onEvent = () => {} }) {
		this.config = config;
		this.awareness = config.bots;
		this.mapData = mapData;
		this.nav = nav;
		this.random = random;
		this.botCount = Math.min(botCount, BOT_NAMES.length);
		this.onEvent = onEvent;
		this.roundNumber = 0;

		this.bots = [];
		for (let i = 0; i < this.botCount; i++) {
			this.bots.push({
				id: i,
				name: BOT_NAMES[i],
				role: Role.Innocent,
				alive: true,
				pos: [0, 3, 0],
				heading: 0,
				speed: 0,
				path: [],
				goal: undefined,
				pathIndex: 0,
				coins: 0,
				roleCooldown: 0,
				attackCooldown: 0,
				shootCooldown: 0,
				ammo: 0,
				hasGun: false,
				exposedUntil: 0,
				decisionTimer: this.random() * config.bots.decisionInterval,
				intent: "idle",
				targetId: null,
			});
		}

		this.reset();
	}

	reset() {
		this.phase = Phase.Intermission;
		this.phaseTime = 0;
		this.blackoutAmount = 0;
		this.blackoutActive = false;
		this.blackoutWarned = false;
		this.outcome = Outcome.None;
		this.droppedGuns = [];
		this.coinsCollected = 0;
		this.schedule = [];
		this.events = [];

		for (const bot of this.bots) {
			bot.role = Role.Innocent;
			bot.alive = true;
			bot.coins = 0;
			bot.hasGun = false;
			bot.ammo = 0;
			bot.path = [];
			bot.goal = undefined;
			bot.exposedUntil = 0;
			bot.intent = "waiting";
		}
		this.spawnAll(this.mapData.spawns.lobby);
		this.resetCoins();
		this.emit("phase", { phase: this.phase, message: "Waiting for the next show" });
	}

	emit(kind, payload) {
		const event = { kind, at: this.phaseTime, ...payload };
		this.events.push(event);
		this.onEvent(event);
	}

	get timeLeft() {
		return Math.max(0, phaseDuration(this.config, this.phase) - this.phaseTime);
	}

	get aliveCounts() {
		const counts = { innocent: 0, sheriff: 0, murderer: 0, dead: 0 };
		for (const bot of this.bots) {
			if (!bot.alive) {
				counts.dead++;
			} else if (bot.role === Role.Murderer) counts.murderer++;
			else if (bot.role === Role.Sheriff || bot.role === Role.Hero) counts.sheriff++;
			else counts.innocent++;
		}
		return counts;
	}

	spawnAll(spawnList) {
		const shuffled = spawnList.slice();
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(this.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		this.bots.forEach((bot, index) => {
			const spawn = shuffled[index % shuffled.length];
			bot.pos = [spawn.pos[0], spawn.pos[1], spawn.pos[2]];
			bot.heading = (spawn.yaw * Math.PI) / 180;
			bot.path = [];
			bot.goal = undefined;
			bot.speed = 0;
		});
	}

	resetCoins() {
		const spots = this.mapData.coinSpots;
		const wanted = Math.min(this.config.coins.activeCount, spots.length);
		const indices = new Set();
		while (indices.size < wanted) indices.add(Math.floor(this.random() * spots.length));
		this.coins = [...indices].map((index) => ({ index, pos: spots[index], active: true, respawnIn: 0 }));
	}

	startRound() {
		this.roundNumber++;
		const assignment = assignRoles(this.config, this.bots, this.random);
		for (const bot of this.bots) {
			const role = assignment.get(bot.id) ?? Role.Innocent;
			bot.role = role;
			bot.alive = true;
			bot.coins = 0;
			bot.hasGun = role === Role.Sheriff;
			bot.ammo = role === Role.Sheriff ? this.config.weapons.revolver.magazine : 0;
			bot.roleCooldown = role === Role.Innocent ? Math.max(0, bot.roleCooldown - 1) : this.config.assignment.recentRoleCooldownRounds;
			bot.path = [];
			bot.goal = undefined;
			bot.exposedUntil = 0;
			bot.intent = "roaming";
		}
		this.spawnAll(this.mapData.spawns.round);
		this.resetCoins();
		this.droppedGuns = [];
		this.coinsCollected = 0;
		this.schedule = blackoutSchedule(this.config).map((event) => ({ ...event, fired: false, ended: false, warned: false }));

		const murderer = this.bots.find((bot) => bot.role === Role.Murderer);
		const sheriff = this.bots.find((bot) => bot.role === Role.Sheriff);
		this.emit("roles", {
			message: `Roles dealt · ${murderer ? murderer.name : "nobody"} has the knife`,
			murderer: murderer?.name,
			sheriff: sheriff?.name,
		});
	}

	setPhase(phase) {
		this.phase = phase;
		this.phaseTime = 0;
		if (phase === Phase.Grace) {
			this.startRound();
			this.emit("phase", { phase, message: "Lights up — find your ground" });
		} else if (phase === Phase.Round) {
			this.emit("phase", { phase, message: "The carnival is open" });
		} else if (phase === Phase.PostRound) {
			this.emit("phase", { phase, message: describeOutcome(this.outcome) });
		} else if (phase === Phase.Intermission) {
			this.outcome = Outcome.None;
			this.blackoutActive = false;
			for (const bot of this.bots) {
				bot.alive = true;
				bot.role = Role.Innocent;
				bot.hasGun = false;
			}
			this.spawnAll(this.mapData.spawns.lobby);
			this.emit("phase", { phase, message: "Back to the Ticket Hall" });
		}
	}

	update(dt) {
		this.phaseTime += dt;

		if (this.phase === Phase.Round) {
			this.updateBlackout(dt);
			this.updateCoins(dt);
			this.updateBots(dt);
			this.outcome = evaluateOutcome(this.bots, this.timeLeft);
			if (this.outcome !== Outcome.None) {
				this.setPhase(Phase.PostRound);
				return;
			}
		} else if (this.phase === Phase.Grace) {
			this.updateBots(dt);
		} else {
			this.updateLobby(dt);
		}

		this.blackoutAmount = approach(this.blackoutAmount, this.blackoutActive ? 1 : 0, dt / this.config.lighting.transitionSeconds);

		if (this.timeLeft <= 0) {
			this.setPhase(nextPhase(this.phase));
		}
	}

	updateBlackout(dt) {
		for (const event of this.schedule) {
			if (!event.warned && this.phaseTime >= event.warnAt) {
				event.warned = true;
				this.emit("blackout_warning", { message: "The generator is coughing…" });
			}
			if (!event.fired && this.phaseTime >= event.startAt) {
				event.fired = true;
				this.blackoutActive = true;
				this.emit("blackout_start", { message: "BLACKOUT — the midway goes dark" });
			}
			if (event.fired && !event.ended && this.phaseTime >= event.endAt) {
				event.ended = true;
				this.blackoutActive = false;
				this.emit("blackout_end", { message: "Power restored" });
			}
		}
	}

	updateCoins(dt) {
		for (const coin of this.coins) {
			if (coin.active) continue;
			coin.respawnIn -= dt;
			if (coin.respawnIn <= 0) {
				const spots = this.mapData.coinSpots;
				coin.index = Math.floor(this.random() * spots.length);
				coin.pos = spots[coin.index];
				coin.active = true;
			}
		}
	}

	updateLobby(dt) {
		for (const bot of this.bots) {
			bot.speed = 0;
			bot.heading += dt * 0.35 * ((bot.id % 3) - 1);
		}
	}

	visionRange() {
		return this.blackoutActive ? this.awareness.blackoutVisionRange : this.awareness.visionRange;
	}

	canSee(from, to) {
		const range = this.visionRange();
		if (distanceXZ(from.pos, to.pos) > range) return false;
		return this.nav.hasLineOfSight(from.pos, to.pos, range);
	}

	/**
	 * Whether `bot` currently knows a particular murderer for what they are.
	 * Seeing someone is not the same as recognising the knife: that takes
	 * getting close, or watching them use it.
	 */
	identifyThreat(bot) {
		const murderer = this.nearestVisible(bot, (other) => other.role === Role.Murderer);
		if (!murderer) return null;
		if (this.phaseTime < murderer.exposedUntil) return murderer;
		if (distanceXZ(bot.pos, murderer.pos) <= this.awareness.recogniseRange) return murderer;
		return null;
	}

	updateBots(dt) {
		const movement = this.config.movement;

		for (const bot of this.bots) {
			if (!bot.alive) continue;
			bot.attackCooldown = Math.max(0, bot.attackCooldown - dt);
			bot.shootCooldown = Math.max(0, bot.shootCooldown - dt);
			bot.decisionTimer -= dt;
			if (bot.decisionTimer <= 0) {
				bot.decisionTimer = this.awareness.decisionInterval;
				this.decide(bot);
			}

			const sprinting =
				bot.intent === "flee" || bot.intent === "hunt" || bot.intent === "chase" || bot.intent === "evade";
			let speed = sprinting ? movement.sprintSpeed : movement.walkSpeed;
			if (bot.role === Role.Murderer) {
				speed += movement.murdererSpeedBonus;
				if (this.blackoutActive) speed *= this.config.blackout.murdererSpeedMultiplier;
			}
			this.advance(bot, dt, speed);
		}

		// Nobody can be hurt during the grace period, same as the live server.
		if (this.phase === Phase.Round) {
			this.resolveInteractions();
		}
	}

	decide(bot) {
		if (this.phase === Phase.Grace) {
			if (bot.path.length === 0) this.pathTo(bot, this.nav.randomNode(this.random));
			bot.intent = "roaming";
			return;
		}

		if (bot.role === Role.Murderer) {
			// Guns are visible in someone's hand, so the murderer knows who is
			// armed even though nobody knows who the murderer is. Walking into
			// a revolver is how a murderer loses; backing off and finding
			// someone alone is how they win.
			const hunter = this.nearestVisible(bot, (other) => other.hasGun);
			if (hunter) {
				const gap = distanceXZ(bot.pos, hunter.pos);
				const canStrike = gap <= this.config.weapons.knife.slashRange * 2;
				const outgunned = gap <= this.awareness.fireRange;
				if (!canStrike && (outgunned || this.phaseTime < bot.exposedUntil)) {
					bot.intent = "evade";
					this.pathTo(bot, this.fleeTarget(bot, hunter));
					return;
				}
			}

			const prey = this.nearestVisible(bot, (other) => other.role !== Role.Murderer);
			if (prey) {
				bot.intent = "chase";
				bot.targetId = prey.id;
				this.pathTo(bot, prey.pos, true);
				return;
			}
			// No line of sight: drift toward the densest cluster of the living.
			const cluster = this.densestCluster(bot);
			bot.intent = "stalk";
			if (cluster) this.pathTo(bot, cluster);
			else if (bot.path.length === 0) this.pathTo(bot, this.nav.randomNode(this.random));
			return;
		}

		const murderer = this.identifyThreat(bot);
		const armed = bot.role === Role.Sheriff || bot.role === Role.Hero;

		if (murderer && armed) {
			bot.intent = "hunt";
			bot.targetId = murderer.id;
			const gap = distanceXZ(bot.pos, murderer.pos);
			// Hold at a distance the knife can't close before the next shot.
			if (gap > 26) {
				this.pathTo(bot, murderer.pos, true);
			} else {
				bot.path = [];
				bot.goal = undefined;
			}
			return;
		}
		if (murderer) {
			bot.intent = "flee";
			bot.targetId = murderer.id;
			this.pathTo(bot, this.fleeTarget(bot, murderer));
			return;
		}

		if (armed) {
			bot.intent = "patrol";
			if (bot.path.length === 0) this.pathTo(bot, this.nav.randomNode(this.random));
			return;
		}

		// A revolver lying on the ground is worth more than any coin.
		const gun = this.nearestDroppedGun(bot);
		if (gun) {
			bot.intent = "arm";
			this.pathTo(bot, gun.pos);
			return;
		}

		const coin = this.nearestCoin(bot);
		if (coin) {
			bot.intent = "collect";
			this.pathTo(bot, coin.pos);
		} else if (bot.path.length === 0) {
			bot.intent = "roaming";
			this.pathTo(bot, this.nav.randomNode(this.random));
		}
	}

	nearestVisible(bot, predicate) {
		let best = null;
		let bestDist = Infinity;
		for (const other of this.bots) {
			if (other === bot || !other.alive || !predicate(other)) continue;
			const d = distanceXZ(bot.pos, other.pos);
			if (d >= bestDist) continue;
			if (!this.canSee(bot, other)) continue;
			best = other;
			bestDist = d;
		}
		return best;
	}

	densestCluster(bot) {
		const living = this.bots.filter((other) => other.alive && other.role !== Role.Murderer);
		if (living.length === 0) return null;
		let best = null;
		let bestScore = -Infinity;
		for (const candidate of living) {
			let score = 0;
			for (const other of living) {
				if (distanceXZ(candidate.pos, other.pos) < 60) score++;
			}
			score -= distanceXZ(bot.pos, candidate.pos) / 90;
			if (score > bestScore) {
				bestScore = score;
				best = candidate;
			}
		}
		return best ? best.pos : null;
	}

	fleeTarget(bot, threat) {
		const away = [bot.pos[0] - threat.pos[0], 0, bot.pos[2] - threat.pos[2]];
		const length = Math.hypot(away[0], away[2]) || 1;
		const target = [
			clamp(bot.pos[0] + (away[0] / length) * 70, -185, 185),
			2.2,
			clamp(bot.pos[2] + (away[2] / length) * 70, -185, 185),
		];
		return target;
	}

	nearestDroppedGun(bot) {
		// A dropped revolver glows on the ground, so bots go for it from
		// anywhere in the park rather than having to stumble across it.
		let best = null;
		let bestDist = Infinity;
		for (const gun of this.droppedGuns) {
			if (gun.taken) continue;
			const d = distanceXZ(bot.pos, gun.pos);
			if (d < bestDist) {
				bestDist = d;
				best = gun;
			}
		}
		return best;
	}

	nearestCoin(bot) {
		let best = null;
		let bestDist = Infinity;
		for (const coin of this.coins) {
			if (!coin.active) continue;
			const d = distanceXZ(bot.pos, coin.pos);
			if (d < bestDist) {
				bestDist = d;
				best = coin;
			}
		}
		return best;
	}

	/**
	 * Bots re-decide several times a second, but re-planning every time is
	 * what makes them shuffle on the spot: a fresh path always starts at the
	 * nearest graph node, which is usually the one directly behind them. So
	 * an existing plan is kept until the destination actually moves.
	 */
	pathTo(bot, target, direct = false) {
		const stillHeadingThere =
			bot.goal !== undefined && bot.pathIndex < bot.path.length && distanceXZ(bot.goal, target) < 6;
		if (stillHeadingThere) return;

		bot.goal = [target[0], target[1], target[2]];

		if (direct && this.nav.hasLineOfSight(bot.pos, target)) {
			bot.path = [target];
			bot.pathIndex = 0;
			return;
		}
		const path = this.nav.findPath(bot.pos, target);
		bot.path = path.length > 0 ? path : [target];
		// findPath lands on the nearest graph node, which can be several studs
		// off the thing the bot was actually walking to — close enough to look
		// right, not close enough to pick up a coin or a dropped revolver. Only
		// worth doing for targets that sit on walkable ground; a flee heading
		// can point straight into a tent, and following it literally would
		// march the bot through the canvas.
		const last = bot.path[bot.path.length - 1];
		const reachable = this.nav.distanceToGraph(target[0], target[2]) <= 8;
		if (reachable && distanceXZ(last, target) > 1) bot.path.push(target);
		bot.pathIndex = 0;
	}

	advance(bot, dt, speed) {
		if (bot.pathIndex >= bot.path.length) {
			bot.speed = approach(bot.speed, 0, dt * 40);
			return;
		}
		const waypoint = bot.path[bot.pathIndex];
		const dx = waypoint[0] - bot.pos[0];
		const dz = waypoint[2] - bot.pos[2];
		const length = Math.hypot(dx, dz);
		if (length < 2.2) {
			bot.pathIndex++;
			if (bot.pathIndex >= bot.path.length) {
				bot.path = [];
				bot.goal = undefined;
			}
			return;
		}
		const step = Math.min(speed * dt, length);
		bot.pos[0] += (dx / length) * step;
		bot.pos[2] += (dz / length) * step;
		bot.pos[1] = waypoint[1] ?? bot.pos[1];
		bot.heading = Math.atan2(dx, dz);
		bot.speed = speed;
	}

	resolveInteractions() {
		const knife = this.config.weapons.knife;
		const revolver = this.config.weapons.revolver;

		// Murderers strike.
		for (const bot of this.bots) {
			if (!bot.alive || bot.role !== Role.Murderer || bot.attackCooldown > 0) continue;
			for (const victim of this.bots) {
				if (victim === bot || !victim.alive || victim.role === Role.Murderer) continue;
				if (distanceXZ(bot.pos, victim.pos) > knife.slashRange) continue;
				this.killBot(victim, bot, "knife");
				bot.attackCooldown = knife.slashCooldown;
				break;
			}
		}

		// Armed players return fire — but only at someone they have actually
		// identified, and only once they are close enough to be sure.
		for (const bot of this.bots) {
			if (!bot.alive || !bot.hasGun || bot.shootCooldown > 0 || bot.ammo <= 0) continue;
			const target = this.identifyThreat(bot);
			if (!target) continue;
			const gap = distanceXZ(bot.pos, target.pos);
			if (gap > this.awareness.fireRange) continue;

			bot.shootCooldown = revolver.fireCooldown;
			bot.ammo--;
			// Accuracy falls off with range and collapses in the dark.
			const accuracy = clamp(1 - gap / this.awareness.fireRange, 0.15, 0.95) * (this.blackoutActive ? 0.45 : 1);
			const hit = this.random() < accuracy;
			this.emit("shot", { by: bot.name, hit, message: hit ? `${bot.name} fires — hit` : `${bot.name} fires — miss` });
			if (hit) {
				this.killBot(target, bot, "revolver");
			}
			if (bot.ammo <= 0) {
				bot.ammo = revolver.magazine;
				bot.shootCooldown = revolver.reloadSeconds;
			}
		}

		// Coins.
		for (const bot of this.bots) {
			if (!bot.alive || bot.role === Role.Murderer) continue;
			for (const coin of this.coins) {
				if (!coin.active) continue;
				if (distanceXZ(bot.pos, coin.pos) > this.config.coins.pickupRadius) continue;
				coin.active = false;
				coin.respawnIn = this.config.coins.respawnSeconds;
				bot.coins += this.config.coins.value;
				this.coinsCollected += this.config.coins.value;
			}
		}

		// A dropped revolver turns the next innocent to reach it into a Hero.
		for (const gun of this.droppedGuns) {
			if (gun.taken) continue;
			for (const bot of this.bots) {
				if (!bot.alive || bot.hasGun || bot.role === Role.Murderer) continue;
				if (distanceXZ(bot.pos, gun.pos) > 6) continue;
				gun.taken = true;
				bot.hasGun = true;
				bot.ammo = gun.ammo > 0 ? gun.ammo : this.config.weapons.revolver.magazine;
				bot.role = Role.Hero;
				this.emit("hero", { name: bot.name, message: `${bot.name} picked up the revolver` });
				break;
			}
		}
	}

	/** Is anyone still alive close enough, and with a clear enough view, to see this? */
	witnessed(where, actor) {
		for (const bot of this.bots) {
			if (bot === actor || !bot.alive || bot.role === Role.Murderer) continue;
			if (distanceXZ(bot.pos, where) > Math.min(this.awareness.witnessRange, this.visionRange())) continue;
			if (this.nav.hasLineOfSight(bot.pos, where)) return true;
		}
		return false;
	}

	killBot(victim, killer, weapon) {
		victim.alive = false;
		victim.path = [];
		victim.goal = undefined;
		const wasArmed = victim.hasGun;
		victim.hasGun = false;

		// A kill in the open gives the killer away; one in a quiet corner does
		// not. This is the whole tension of playing the murderer.
		if (killer.role === Role.Murderer && this.witnessed(victim.pos, killer)) {
			killer.exposedUntil = this.phaseTime + this.awareness.exposureSeconds;
			this.emit("spotted", { name: killer.name, message: `Someone saw ${killer.name} do it` });
		}

		if (weapon === "revolver" && victim.role !== Role.Murderer) {
			// Shooting the innocent costs the shooter their own life.
			killer.alive = false;
			killer.hasGun = false;
			this.emit("kill", {
				victim: victim.name,
				killer: killer.name,
				weapon,
				message: `${killer.name} shot an innocent and paid for it`,
			});
		} else {
			this.emit("kill", {
				victim: victim.name,
				killer: killer.name,
				weapon,
				message:
					weapon === "revolver"
						? `${killer.name} put down the murderer`
						: `${victim.name} was cut down by ${killer.name}`,
			});
		}

		if (wasArmed && this.config.weapons.revolver.dropOnDeath) {
			this.droppedGuns.push({ pos: [victim.pos[0], 1.4, victim.pos[2]], ammo: victim.ammo, taken: false });
			this.emit("gun_dropped", { message: "The revolver is on the ground" });
		}
	}
}

function describeOutcome(outcome) {
	switch (outcome) {
		case Outcome.InnocentsWin:
			return "The murderer is down — innocents win";
		case Outcome.MurderersWin:
			return "Nobody left to scream — murderer wins";
		case Outcome.TimeUp:
			return "Dawn breaks — survivors win";
		default:
			return "Round over";
	}
}

function approach(current, target, delta) {
	if (current < target) return Math.min(target, current + delta);
	return Math.max(target, current - delta);
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
