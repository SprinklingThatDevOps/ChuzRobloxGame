#!/usr/bin/env node
/**
 * Renders the previsualizer to a video, one frame at a time.
 *
 * This machine has no GPU, so real-time capture would stutter. Instead the
 * page hands its clock to us (see `?capture=1` in web/src/main.js): we advance
 * the simulation by an exact frame interval, screenshot, and repeat. However
 * slow SwiftShader is, the resulting video is perfectly paced.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value = "true"] = arg.replace(/^--/, "").split("=");
		return [key, value];
	}),
);

const FPS = Number(args.fps ?? 30);
const SECONDS = Number(args.seconds ?? 50);
const WIDTH = Number(args.width ?? 1280);
const HEIGHT = Number(args.height ?? 720);
const SPEED = Number(args.speed ?? 3);
const URL_BASE = args.url ?? "http://localhost:5173";
const OUT = resolve(repoRoot, args.out ?? "artifacts/hollow-carnival-demo.mp4");
const FRAME_DIR = resolve(repoRoot, "artifacts/frames");

async function main() {
	rmSync(FRAME_DIR, { recursive: true, force: true });
	mkdirSync(FRAME_DIR, { recursive: true });
	mkdirSync(dirname(OUT), { recursive: true });

	const browser = await puppeteer.launch({
		executablePath: process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome",
		headless: "new",
		args: [
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--use-gl=angle",
			"--use-angle=swiftshader",
			"--enable-unsafe-swiftshader",
			"--disable-lcd-text",
			`--window-size=${WIDTH},${HEIGHT}`,
		],
		defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
		protocolTimeout: 600000,
	});

	const page = await browser.newPage();
	page.on("console", (message) => {
		if (message.type() === "error") console.error("  page error:", message.text());
	});
	page.on("pageerror", (error) => console.error("  page exception:", error.message));

	const url = `${URL_BASE}/?capture=1&speed=${SPEED}`;
	console.log(`Loading ${url}`);
	await page.goto(url, { waitUntil: "networkidle0", timeout: 180000 });
	await page.waitForFunction("window.__hollow && window.__hollow.ready === true", { timeout: 300000 });
	console.log("Scene ready; rendering frames");

	const totalFrames = Math.round(FPS * SECONDS);
	const dt = 1 / FPS;

	// Warm-up advances the clock without capturing, so recording can start at
	// an interesting moment instead of on an empty lobby.
	const warmup = Number(args.warmup ?? 0);
	for (let i = 0; i < Math.round(warmup * FPS); i++) {
		await page.evaluate((step) => window.__hollow.step(step), dt);
	}
	if (warmup > 0) console.log(`Warmed up ${warmup}s of simulation`);

	const started = Date.now();

	for (let i = 0; i < totalFrames; i++) {
		await page.evaluate((step) => window.__hollow.step(step), dt);
		const buffer = await page.screenshot({ type: "png", optimizeForSpeed: true });
		writeFileSync(resolve(FRAME_DIR, `frame_${String(i).padStart(5, "0")}.png`), buffer);

		if (i % 25 === 0 || i === totalFrames - 1) {
			const elapsed = (Date.now() - started) / 1000;
			const rate = (i + 1) / elapsed;
			const eta = (totalFrames - i - 1) / Math.max(rate, 0.001);
			const state = await page.evaluate(() => window.__hollow.state());
			console.log(
				`  frame ${i + 1}/${totalFrames} · ${rate.toFixed(2)} fps · eta ${eta.toFixed(0)}s · ${state.phase} ${state.shot}`,
			);
		}
	}

	await browser.close();

	console.log("Encoding video");
	const ffmpeg = spawnSync(
		"ffmpeg",
		[
			"-y",
			"-framerate", String(FPS),
			"-i", resolve(FRAME_DIR, "frame_%05d.png"),
			"-c:v", "libx264",
			"-preset", "slow",
			"-crf", "20",
			"-pix_fmt", "yuv420p",
			"-movflags", "+faststart",
			OUT,
		],
		{ stdio: "inherit" },
	);
	if (ffmpeg.status !== 0) throw new Error("ffmpeg failed");
	console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
