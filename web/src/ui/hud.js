import { Phase } from "../sim/rules.js";

const FEED_LIMIT = 7;

/** Thin wrapper over the DOM overlay; the sim stays unaware it exists. */
export class Hud {
	constructor(config) {
		this.config = config;
		this.el = {
			hud: document.getElementById("hud"),
			phaseName: document.getElementById("phase-name"),
			phaseTimer: document.getElementById("phase-timer"),
			innocent: document.getElementById("count-innocent"),
			sheriff: document.getElementById("count-sheriff"),
			murderer: document.getElementById("count-murderer"),
			dead: document.getElementById("count-dead"),
			feed: document.getElementById("feed"),
			coins: document.getElementById("coin-count"),
			shot: document.getElementById("shot-label"),
			banner: document.getElementById("banner"),
			bannerTitle: document.getElementById("banner-title"),
			bannerSub: document.getElementById("banner-sub"),
			brandSub: document.getElementById("brand-sub"),
			loading: document.getElementById("loading"),
			loadingFill: document.getElementById("loading-fill"),
			loadingStatus: document.getElementById("loading-status"),
			controls: document.getElementById("controls"),
		};
		this.el.brandSub.textContent = config.identity.tagline;

		this.flash = document.createElement("div");
		this.flash.className = "blackout-flash";
		document.body.appendChild(this.flash);
	}

	setProgress(fraction, status) {
		this.el.loadingFill.style.width = `${Math.round(fraction * 100)}%`;
		if (status) this.el.loadingStatus.textContent = status;
	}

	ready() {
		this.el.loading.classList.add("done");
		this.el.hud.hidden = false;
	}

	pushEvent(event) {
		const classes = {
			kill: "kill",
			blackout_start: "blackout",
			blackout_end: "blackout",
			blackout_warning: "blackout",
			hero: "hero",
			phase: "phase",
			roles: "phase",
		};
		if (!event.message) return;
		const item = document.createElement("div");
		item.className = `feed-item ${classes[event.kind] ?? ""}`;
		item.textContent = event.message;
		this.el.feed.appendChild(item);
		while (this.el.feed.children.length > FEED_LIMIT) this.el.feed.removeChild(this.el.feed.firstChild);
	}

	showBanner(title, subtitle) {
		this.el.bannerTitle.textContent = title;
		this.el.bannerSub.textContent = subtitle;
		this.el.banner.hidden = false;
	}

	hideBanner() {
		this.el.banner.hidden = true;
	}

	pulseFlash(strength) {
		this.flash.style.opacity = String(strength);
	}

	update(sim, shotName, speed, paused) {
		const counts = sim.aliveCounts;
		this.el.innocent.textContent = counts.innocent;
		this.el.sheriff.textContent = counts.sheriff;
		this.el.murderer.textContent = counts.murderer;
		this.el.dead.textContent = counts.dead;
		this.el.coins.textContent = sim.coinsCollected;
		this.el.shot.textContent = paused ? "PAUSED" : shotName;

		const label = {
			[Phase.Intermission]: "INTERMISSION",
			[Phase.Grace]: "GRACE PERIOD",
			[Phase.Round]: "ROUND LIVE",
			[Phase.PostRound]: "ROUND OVER",
		};
		this.el.phaseName.textContent = label[sim.phase] ?? sim.phase;

		const seconds = Math.ceil(sim.timeLeft);
		this.el.phaseTimer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
		const urgent = sim.phase === Phase.Round && seconds <= this.config.round.suddenDeathAtSecondsLeft;
		this.el.phaseTimer.classList.toggle("urgent", urgent);

		const speedLabel = speed === 1 ? "" : ` · ${speed}× speed`;
		this.el.controls.innerHTML =
			`<kbd>Space</kbd> pause · <kbd>C</kbd> camera · <kbd>F</kbd> free-fly · <kbd>1-4</kbd> speed · <kbd>R</kbd> restart round${speedLabel}`;
	}
}
