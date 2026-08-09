#!/usr/bin/env node
/**
 * Renders a set of fixed viewpoints of the carnival to PNG.
 * Used for iterating on the look, and for the README stills.
 */
import { mkdirSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

export const SHOTS = [
	{ name: "entrance", pos: [0, 30, 118], target: [0, 34, 194], caption: "The gate on the south side of the park" },
	{ name: "midway", pos: [0, 22, 176], target: [0, 14, 60], caption: "Stall row on the main avenue" },
	{ name: "clocktower", pos: [66, 30, 68], target: [0, 44, 0], caption: "The Hollow Hour Clock, stopped at 3:33" },
	{ name: "ferriswheel", pos: [26, 40, -22], target: [0, 66, -156], caption: "The Wheel of Hollow Hours" },
	{ name: "carousel", pos: [128, 24, 34], target: [128, 18, -46], caption: "Carousel of Borrowed Faces" },
	{ name: "bigtop", pos: [-136, 48, 108], target: [-136, 32, -40], caption: "The Big Top" },
	{ name: "funhouse", pos: [-118, 26, 208], target: [-118, 26, 156], fov: 72, caption: "Hall of Borrowed Faces" },
	{ name: "pier", pos: [-74, 24, -160], target: [-152, 8, -160], caption: "The pier and the Tunnel of Love" },
	{ name: "dodgems", pos: [124, 26, 188], target: [124, 12, 116], caption: "Dodge Me" },
	{ name: "generator", pos: [150, 22, -66], target: [156, 8, -146], caption: "The generator yard" },
	{ name: "lobby", pos: [0, 292, 1308], target: [0, 272, 1200], caption: "The Ticket Hall" },
	{ name: "aerial", pos: [128, 118, 208], target: [-24, 26, -52], caption: "The whole park" },
];

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value = "true"] = arg.replace(/^--/, "").split("=");
		return [key, value];
	}),
);

const WIDTH = Number(args.width ?? 1280);
const HEIGHT = Number(args.height ?? 720);
const URL_BASE = args.url ?? "http://localhost:5173";
const OUT_DIR = resolve(repoRoot, args.out ?? "artifacts/shots");
const ONLY = args.only ? args.only.split(",") : null;

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });

	const browser = await puppeteer.launch({
		executablePath: process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome",
		headless: "new",
		args: [
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--use-gl=angle",
			"--use-angle=swiftshader",
			"--enable-unsafe-swiftshader",
			`--window-size=${WIDTH},${HEIGHT}`,
		],
		defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
		protocolTimeout: 600000,
	});

	const page = await browser.newPage();
	page.on("pageerror", (error) => console.error("  page exception:", error.message));
	await page.goto(`${URL_BASE}/?capture=1&speed=1`, { waitUntil: "networkidle0", timeout: 180000 });
	await page.waitForFunction("window.__hollow && window.__hollow.ready === true", { timeout: 300000 });

	const shots = ONLY ? SHOTS.filter((s) => ONLY.includes(s.name)) : SHOTS;
	for (const shot of shots) {
		await page.evaluate((s) => {
			window.__hollow.setCamera({ pos: s.pos, target: s.target, fov: s.fov ?? 58 });
			window.__hollow.setHudVisible(false);
		}, shot);
		// A few steps let the fog, bloom and animators settle on the new view.
		for (let i = 0; i < 6; i++) await page.evaluate(() => window.__hollow.step(1 / 30));
		const buffer = await page.screenshot({ type: "png" });
		writeFileSync(resolve(OUT_DIR, `${shot.name}.png`), buffer);
		console.log(`  ${shot.name} -> ${resolve(OUT_DIR, `${shot.name}.png`)}`);
	}

	await browser.close();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
