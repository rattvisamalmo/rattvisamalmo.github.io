import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { chromium } from "playwright-core";

const root = process.cwd();
const args = process.argv.slice(2);

function readArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const inputSvg = resolve(root, readArg("input", "assets/brand/torso-loader-animated.svg"));
const outputDir = resolve(root, readArg("outdir", "downloads/torso-export"));
const fps = toInt(readArg("fps", "24"), 24);
const durationSec = toInt(readArg("duration", "3"), 3);
const height = toInt(readArg("height", "1200"), 1200);
const width = Math.round((100 / 240) * height);
const padding = toInt(readArg("padding", "64"), 64);
const keepFrames = hasFlag("keep-frames");

const frameDir = join(outputDir, "frames");
const webmPath = join(outputDir, "torso-loader-transparent.webm");
const gifPath = join(outputDir, "torso-loader-transparent.gif");
const whiteGifPath = join(outputDir, "torso-loader-transparent-white.gif");

function fail(message) {
  console.error(`\n[torso-export] ${message}`);
  process.exit(1);
}

function runOrFail(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    fail(`Command failed: ${command}`);
  }
}

function detectBrowserPath() {
  const envPath = process.env.BROWSER_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const candidates = [
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

async function captureFrames() {
  const browserPath = detectBrowserPath();
  if (!browserPath) {
    fail("Could not find Edge or Chrome. Install one, or set BROWSER_PATH to your browser executable.");
  }

  const svgMarkup = readFileSync(inputSvg, "utf8");
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath,
    args: ["--disable-gpu", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1
  });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
      }
      .stage {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: ${padding}px;
        display: grid;
        place-items: center;
        background: transparent;
      }
      .stage svg {
        width: 100%;
        height: 100%;
        display: block;
        overflow: visible;
      }
    </style>
  </head>
  <body>
    <div class="stage">${svgMarkup}</div>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => {
    const svg = document.querySelector("svg");
    if (svg && typeof svg.pauseAnimations === "function") {
      svg.pauseAnimations();
      svg.setCurrentTime(0);
    }

    for (const anim of document.getAnimations()) {
      anim.pause();
      anim.currentTime = 0;
    }
  });

  const frameCount = Math.max(1, Math.round(durationSec * fps));
  for (let i = 0; i < frameCount; i += 1) {
    const timeMs = (i / fps) * 1000;
    await page.evaluate((ms) => {
      const svg = document.querySelector("svg");
      if (svg && typeof svg.setCurrentTime === "function") {
        svg.setCurrentTime(ms / 1000);
      }

      for (const anim of document.getAnimations()) {
        anim.currentTime = ms;
      }
    }, timeMs);

    const fileName = `frame_${String(i).padStart(4, "0")}.png`;
    await page.screenshot({
      path: join(frameDir, fileName),
      omitBackground: true,
      type: "png"
    });
  }

  await browser.close();
}

async function main() {
  if (!existsSync(inputSvg)) {
    fail(`Input SVG not found: ${inputSvg}`);
  }

  mkdirSync(outputDir, { recursive: true });
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  console.log("[torso-export] Rendering transparent PNG frames...");
  await captureFrames();

  const ffmpegPath = ffmpegInstaller.path;
  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    fail("Bundled ffmpeg binary is missing.");
  }

  console.log("[torso-export] Encoding transparent WebM...");
  runOrFail(
    ffmpegPath,
    [
      "-y",
      "-loglevel", "error",
      "-framerate", String(fps),
      "-i", "frame_%04d.png",
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuva420p",
      "-auto-alt-ref", "0",
      "-b:v", "0",
      "-crf", "30",
      "-an",
      webmPath
    ],
    frameDir
  );

  console.log("[torso-export] Encoding transparent GIF...");
  runOrFail(
    ffmpegPath,
    [
      "-y",
      "-loglevel", "error",
      "-framerate", String(fps),
      "-i", "frame_%04d.png",
      "-filter_complex",
      "[0:v]format=rgba,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128",
      "-loop", "0",
      gifPath
    ],
    frameDir
  );

  console.log("[torso-export] Encoding transparent white GIF...");
  runOrFail(
    ffmpegPath,
    [
      "-y",
      "-loglevel", "error",
      "-framerate", String(fps),
      "-i", "frame_%04d.png",
      "-filter_complex",
      "[0:v]format=rgba,lutrgb=r=255:g=255:b=255,split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128",
      "-loop", "0",
      whiteGifPath
    ],
    frameDir
  );

  if (!keepFrames) {
    rmSync(frameDir, { recursive: true, force: true });
  }

  console.log("\n[torso-export] Done.");
  console.log(`[torso-export] WebM: ${webmPath}`);
  console.log(`[torso-export] GIF:  ${gifPath}`);
  console.log(`[torso-export] White GIF: ${whiteGifPath}`);
  if (keepFrames) {
    console.log(`[torso-export] Frames: ${frameDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
