#!/usr/bin/env node
/* ===========================================================
   LIBERTY DRIVE — Autoplay driver
   -----------------------------------------------------------
   Launches the game in Chromium, injects the bot brain, lets it
   play, and writes a video + screenshots + a session report.

   Usage:
     node bot/autoplay.js [--seconds 75] [--headed] [--out runs/]

   Requires playwright-core. If Chromium isn't on the default
   Playwright path, set CHROME_PATH=/path/to/chrome.
   =========================================================== */
const path = require('path');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright-core')); }
catch (e) {
  try { ({ chromium } = require('playwright')); }
  catch (e2) {
    console.error('Missing dependency. Install one of:\n  npm i -D playwright-core\n  npm i -D playwright');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SECONDS = parseInt(arg('seconds', '75'), 10);
const HEADED = args.includes('--headed');
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'runs')));
const ROOT = path.resolve(__dirname, '..');

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const guesses = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ];
  for (const g of guesses) if (fs.existsSync(g)) return g;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined; // let Playwright resolve its own download
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

  const browser = await chromium.launch({
    executablePath: findChrome(),
    headless: !HEADED,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('▶  loading Liberty Drive …');
  await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('#startBtn');
  await page.waitForTimeout(600);

  console.log('🤖 bot taking the wheel for ' + SECONDS + 's …\n');
  await page.addScriptTag({ path: path.join(__dirname, 'brain.js') });
  await page.evaluate((s) => window.__LDBOT.start(s), SECONDS);

  // play, grabbing a frame every few seconds
  const shotEvery = 5;
  for (let t = 0; t < SECONDS; t++) {
    await page.waitForTimeout(1000);
    if (t % shotEvery === 0) {
      const s = await page.evaluate(() => window.__LDBOT.stats());
      const n = String(t).padStart(3, '0');
      await page.screenshot({ path: path.join(OUT, 'shots', `t${n}.png`) });
      console.log(
        `  ${String(t).padStart(3)}s  ${s.phase.padEnd(8)}` +
        `$${String(s.finalMoney).padEnd(6)} ${'★'.repeat(s.stars) || '–'}`.padEnd(20) +
        `hp:${String(s.health).padStart(3)}  ${s.inCar ? 'driving' : 'on foot'}`
      );
    }
  }

  const stats = await page.evaluate(() => { const s = window.__LDBOT.stats(); window.__LDBOT.stop(); return s; });
  await page.screenshot({ path: path.join(OUT, 'shots', 'final.png') });

  const video = page.video();
  await context.close();           // flushes the video file
  const videoPath = video ? await video.path() : null;
  if (videoPath) {
    const dest = path.join(OUT, 'gameplay.webm');
    fs.renameSync(videoPath, dest);
    console.log('\n🎬 video  → ' + dest);
  }
  await browser.close();

  const report = {
    seconds: SECONDS,
    earned: stats.earned,
    finalMoney: stats.finalMoney,
    deliveries: stats.missions,
    carsStolen: stats.carsStolen,
    shotsFired: stats.shots,
    kills: stats.kills,
    peakWanted: stats.peakStars,
    topSpeedMph: Math.round(stats.maxMph),
    distanceUnits: Math.round(stats.distance),
    deaths: stats.deaths,
    busts: stats.busts,
    survived: stats.alive,
    runtimeErrors: errors.length,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'),
    JSON.stringify({ report, log: stats.log }, null, 2));

  console.log('\n═══════════ SESSION REPORT ═══════════');
  for (const [k, v] of Object.entries(report)) {
    console.log('  ' + k.padEnd(16) + v);
  }
  console.log('══════════════════════════════════════');
  console.log('\nHighlights:');
  stats.log.slice(0, 40).forEach((l) => console.log('  ' + l));
  if (errors.length) { console.log('\nERRORS:'); errors.forEach((e) => console.log('  ' + e)); }

  process.exit(errors.length ? 1 : 0);
})();
