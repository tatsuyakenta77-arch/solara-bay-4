// Playwright playtest for Meridian Heat (rebuild3). Serves game/ on :8901,
// drives, steals, completes all 6 missions, tests police + combat + pause +
// save/continue, and captures 4 screenshots. Exits non-zero on any failure.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const SHOTS = 'screenshots';
mkdirSync(SHOTS, { recursive: true });
const errors = [];
const log = (...a) => console.log('[playtest]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) { errors.push(msg); console.error('FAIL:', msg); }
  else log('ok:', msg);
};
const st = async (page) => page.evaluate(() => window.__MH.state);

const server = spawn('node', ['serve.ts', '--port', '8901'], { cwd: process.cwd(), stdio: 'pipe' });
await sleep(1500);

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));

try {
  await page.goto('http://localhost:8901/', { waitUntil: 'load', timeout: 20000 });
  await sleep(2500);
  assert(await page.evaluate(() => !!window.__MH), '__MH hook present, game booted');

  // New game.
  await page.click('#btnNew');
  await sleep(1200);
  let s = await st(page);
  assert(s.mode === 'playing', `mode playing (got ${s.mode})`);
  assert(s.mission === 'First Gear', `mission 1 active (got ${s.mission})`);
  await page.screenshot({ path: `${SHOTS}/4-street.jpg`, type: 'jpeg', quality: 82 });

  // Walk forward: position must change (poll: headless rendering dilates game time).
  const p0 = s.player;
  await page.keyboard.down('KeyW');
  let walked = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    walked = Math.hypot((await st(page)).player.x - p0.x, (await st(page)).player.z - p0.z);
    if (walked > 4) break;
  }
  await page.keyboard.up('KeyW');
  s = await st(page);
  assert(walked > 4, `walking moves player (moved ${walked.toFixed(1)}m)`);

  // Mission 1: steal the coupe, drive to Mara.
  await page.evaluate(() => window.__MH.debug.warpToStep());
  await sleep(400);
  await page.keyboard.press('KeyE');
  await sleep(500);
  s = await st(page);
  assert(s.inCar, 'entered mission coupe (E)');
  assert(s.wanted >= 1, `stealing raises wanted (wanted=${s.wanted})`);
  // Drive forward for real, staged on a road so the cover shot reads as a street.
  await page.evaluate(() => { const d = window.__MH.debug; d.teleport(40, 100); d.setCarHeading(0); });
  await sleep(400);
  const c0 = (await st(page)).car;
  await page.keyboard.down('KeyW');
  let driven = 0, topSpeed = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const cur = await st(page);
    driven = Math.hypot(cur.car.x - c0.x, cur.car.z - c0.z);
    topSpeed = Math.max(topSpeed, Math.abs(cur.car.speed));
    if (driven > 8) break;
  }
  await page.keyboard.up('KeyW');
  s = await st(page);
  assert(driven > 8, `driving moves car (moved ${driven.toFixed(1)}m, top speed ${topSpeed.toFixed(1)})`);
  await page.screenshot({ path: `${SHOTS}/1-cover.jpg`, type: 'jpeg', quality: 82 });
  // Finish step 2 by warping the car to Mara.
  await page.evaluate(() => window.__MH.debug.warpToStep());
  await sleep(800);
  s = await st(page);
  assert(s.missionIndex === 1, `mission 1 complete (missionIndex=${s.missionIndex}, cash=$${s.cash})`);
  assert(s.cash >= 650, `payout applied (cash=$${s.cash})`);

  // Police pursuit: wanted 3, cruisers spawn and close in; park and let them come.
  await page.evaluate(() => window.__MH.debug.setWanted(3));
  let close = false;
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    const cur = await st(page);
    if (cur.policeDist !== null && cur.policeDist < 20) { close = true; break; }
  }
  s = await st(page);
  assert(s.police >= 2, `police spawned at wanted 3 (police=${s.police})`);
  assert(close, `a cruiser closed to <20m for the chase shot (policeDist=${s.policeDist})`);
  await page.screenshot({ path: `${SHOTS}/2-chase.jpg`, type: 'jpeg', quality: 82 });
  await page.evaluate(() => window.__MH.debug.setWanted(0));
  await sleep(300);

  // Mission 2 (goto x2): warp to each step.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.__MH.debug.warpToStep());
    await sleep(700);
  }
  s = await st(page);
  assert(s.missionIndex === 2, `mission 2 complete (missionIndex=${s.missionIndex})`);

  // Mission 3: steal Comet, escape to lockup.
  await page.evaluate(() => { const d = window.__MH.debug; d.exitCar(); d.warpToStep(); });
  await sleep(400);
  await page.keyboard.press('KeyE');
  await sleep(500);
  s = await st(page);
  assert(s.inCar, 'stole the Comet for mission 3');
  await page.evaluate(() => window.__MH.debug.warpToStep());
  await sleep(800);
  s = await st(page);
  assert(s.missionIndex === 3, `mission 3 complete (missionIndex=${s.missionIndex})`);

  // Mission 4: fight at the pier — verify real shooting kills, then punch fallback.
  await page.evaluate(() => { const d = window.__MH.debug; d.exitCar(); d.warpToStep(); });
  await sleep(800);
  s = await st(page);
  assert(s.enemiesAlive === 4, `mission 4 spawned 4 enemies (alive=${s.enemiesAlive})`);
  const ammo0 = s.ammo;
  const aimed = await page.evaluate(() => window.__MH.debug.aimAtNearestEnemy());
  assert(aimed, 'aimed at nearest enemy');
  await page.mouse.click(640, 360);
  await sleep(300);
  s = await st(page);
  assert(s.ammo === ammo0 - 1, `shooting consumes ammo (${ammo0} -> ${s.ammo})`);
  // Finish the fight: aim + shoot, heal as needed, punch when close.
  // Mid-fight screenshot once an enemy is close enough to be in frame.
  let shotTaken = false;
  let guard = 0;
  while ((await st(page)).enemiesAlive > 0 && guard++ < 90) {
    const cur = await st(page);
    if (!shotTaken && cur.enemyDist !== null && cur.enemyDist < 9) {
      await page.evaluate(() => window.__MH.debug.aimAtNearestEnemy());
      await page.mouse.click(640, 360);
      await sleep(250);
      await page.screenshot({ path: `${SHOTS}/3-mission.jpg`, type: 'jpeg', quality: 82 });
      shotTaken = true;
    }
    await page.evaluate(() => { const d = window.__MH.debug; d.aimAtNearestEnemy(); d.heal(); });
    await page.mouse.click(640, 360);
    await page.keyboard.press('KeyF');
    await sleep(350);
  }
  assert(shotTaken, 'mission screenshot taken mid-fight with enemy in frame');
  s = await st(page);
  assert(s.enemiesAlive === 0, `mission 4 crew cleared (alive=${s.enemiesAlive}, guard=${guard})`);
  await page.evaluate(() => window.__MH.debug.warpToStep());
  await sleep(800);
  s = await st(page);
  assert(s.missionIndex === 4, `mission 4 complete (missionIndex=${s.missionIndex})`);

  // Mission 5: getaway car + escape with heat.
  await page.evaluate(() => { const d = window.__MH.debug; d.warpToStep(); });
  await sleep(500);
  await page.keyboard.press('KeyE');
  await sleep(500);
  s = await st(page);
  assert(s.inCar, 'entered getaway car (mission 5)');
  await page.evaluate(() => window.__MH.debug.warpToStep());
  await sleep(900);
  s = await st(page);
  assert(s.missionIndex === 5, `mission 5 complete (missionIndex=${s.missionIndex}, wanted was 3)`);
  await page.evaluate(() => window.__MH.debug.setWanted(0));

  // Mission 6: warehouse fight (5) then boss, then plaza.
  await page.evaluate(() => { const d = window.__MH.debug; d.exitCar(); d.warpToStep(); });
  await sleep(800);
  s = await st(page);
  assert(s.enemiesAlive === 5, `mission 6 warehouse spawned 5 (alive=${s.enemiesAlive})`);
  guard = 0;
  while ((await st(page)).enemiesAlive > 0 && guard++ < 120) {
    await page.evaluate(() => { const d = window.__MH.debug; d.aimAtNearestEnemy(); d.heal(); });
    await page.mouse.click(640, 360);
    await page.keyboard.press('KeyF');
    await sleep(320);
  }
  s = await st(page);
  assert(s.stepIndex >= 1 || s.missionIndex === 6, `warehouse cleared, boss step active (step=${s.stepIndex}, mission=${s.missionIndex})`);
  guard = 0;
  while ((await st(page)).stepIndex === 1 && guard++ < 60) {
    await page.evaluate(() => { const d = window.__MH.debug; d.aimAtNearestEnemy(); d.heal(); d.giveAmmo(20); });
    await page.mouse.click(640, 360);
    await page.keyboard.press('KeyF');
    await sleep(320);
  }
  s = await st(page);
  assert(s.stepIndex === 2 || s.missionIndex > 5, `boss Rex Dalton down (step=${s.stepIndex})`);
  await page.evaluate(() => window.__MH.debug.warpToStep());
  await sleep(900);
  s = await st(page);
  assert(s.allDone, `ALL 6 MISSIONS DONE (allDone=${s.allDone}, cash=$${s.cash})`);
  assert(s.mode === 'won', `win screen shown (mode=${s.mode})`);

  // Save/continue: reload, Continue resumes the completed state.
  await page.reload({ waitUntil: 'load' });
  await sleep(2000);
  const contVisible = await page.evaluate(() => {
    const b = document.getElementById('btnContinue');
    return b && b.style.display !== 'none';
  });
  assert(contVisible, 'Continue button visible after reload (save exists)');
  await page.click('#btnContinue');
  await sleep(1000);
  s = await st(page);
  assert(s.mode === 'playing' && s.allDone, `continue resumes completed game (mode=${s.mode}, allDone=${s.allDone})`);

  // Pause menu.
  await page.keyboard.press('Escape');
  await sleep(400);
  const pauseVisible = await page.evaluate(() => !document.getElementById('pauseMenu').hidden);
  assert(pauseVisible, 'pause menu opens on Esc');
  await page.click('#btnResume');
  await sleep(400);
  s = await st(page);
  assert(s.mode === 'playing', 'resume returns to playing');

  // Final error sweep.
  await sleep(1500);
  if (errors.length) console.error('ERRORS:\n' + errors.join('\n'));
  assert(errors.length === 0, `zero console/page errors (found ${errors.length})`);
  if (errors.length) console.error(errors.join('\n'));
} catch (e) {
  errors.push('exception: ' + (e?.message || e));
  console.error('EXCEPTION:', e);
  try { await page.screenshot({ path: '/tmp/mh-failure.png' }); } catch {}
} finally {
  await browser.close();
  server.kill();
}

console.log(errors.length ? `\nPLAYTEST FAILED (${errors.length} issues)` : '\nPLAYTEST PASSED');
process.exit(errors.length ? 1 : 0);
