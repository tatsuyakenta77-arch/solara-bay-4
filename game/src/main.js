// Meridian Heat — open-world crime game. Original city, characters and story.
// Three.js (vendored) + plain ES modules. No network at runtime.
// Controls: WASD move/drive, E enter car, F punch, click shoot, Space jump/
// handbrake, Shift run, Esc pause, M mute. Mouse drag orbits the camera.

import * as THREE from 'three';
import { CITY, MISSIONS, PARKED_CARS, SAVE_KEY, DIALOGUE } from './config.js';
import { buildCity, makeCar, Particles } from './world.js';
import { SoundBank } from './audio.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const hud = $('hud'), toastEl = $('toast'), crosshair = $('crosshair');
const ui = {
  cash: $('cash'), stars: $('stars'), mission: $('missionName'), objective: $('objective'),
  healthFill: $('healthFill'), healthNum: $('healthNum'), ammoNum: $('ammoNum'),
  weapon: $('weaponName'), carRow: $('carRow'), carHealth: $('carHealth'),
  speed: $('speed'), zone: $('zone'), minimap: $('minimap'), flash: $('damageFlash'),
};

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
$('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 120, 420);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
scene.add(new THREE.AmbientLight(0x8899bb, 0.75));
const sun = new THREE.DirectionalLight(0xffe0b3, 1.6);
sun.position.set(120, 180, 60);
scene.add(sun);
const moon = new THREE.DirectionalLight(0x5a7bd6, 0.35);
moon.position.set(-80, 120, -100);
scene.add(moon);

const { colliders } = buildCity(scene);
const particles = new Particles(scene);
const sound = new SoundBank();

// ---------- Helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Circle vs building colliders + world bounds. Returns corrected position.
function collide(pos, radius) {
  for (const c of colliders) {
    const nx = clamp(pos.x, c.x - c.hx, c.x + c.hx);
    const nz = clamp(pos.z, c.z - c.hz, c.z + c.hz);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        pos.x += radius; // centre inside box: push out along x
      }
    }
  }
  pos.x = clamp(pos.x, -CITY.bound, CITY.bound);
  // Water blocks movement except on the pier corridor (x 57..67).
  const onPier = pos.x > 56 && pos.x < 68 && pos.z < CITY.waterZ + 32;
  if (!onPier) pos.z = clamp(pos.z, -CITY.bound, CITY.waterZ - 2);
  else pos.z = clamp(pos.z, -CITY.bound, CITY.waterZ + 30);
  return pos;
}

// ---------- Game state ----------
const state = {
  mode: 'menu',           // menu | playing | paused | busted | won
  cash: 250, health: 100, ammo: 48, wanted: 0,
  missionIndex: 0, stepIndex: 0, allDone: false,
  inCar: null,            // car object the player drives
  heatTimer: 0,           // seconds since last crime (for cooldown)
  bustedTimer: 0,
  muted: false,
  time: 0,
  enemiesDefeated: 0, carsStolen: 0,
};

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash, health: state.health, ammo: state.ammo,
      missionIndex: state.missionIndex, stepIndex: state.stepIndex, allDone: state.allDone,
    }));
  } catch { /* storage unavailable: game still plays */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ---------- Player ----------
const player = {
  mesh: null, pos: V3(CITY.startPos.x, 0, CITY.startPos.z), heading: Math.PI,
  velY: 0, onGround: true, speed: 0, running: false,
};
function makePerson(shirt, pants) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.28), legMat);
  legL.position.set(-0.18, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.85, 0.42), shirtMat);
  torso.position.y = 1.22; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.92; g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), shirtMat);
  armL.position.set(-0.52, 1.25, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.52; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}
player.mesh = makePerson(0x27324a, 0x1a1a22);
player.mesh.position.copy(player.pos);
scene.add(player.mesh);

// ---------- Cars ----------
const cars = [];      // parked + traffic + police cars the player can interact with
const traffic = [];   // AI traffic cars (subset of cars, flagged)
const police = [];    // active police cars

function addCar(x, z, color, model, opts = {}) {
  const mesh = makeCar(color, model, !!opts.police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = opts.heading ?? rand(0, Math.PI * 2);
  scene.add(mesh);
  const car = {
    mesh, x, z, heading: mesh.rotation.y, speed: 0, health: 100,
    color, model, parked: !!opts.parked, mission: opts.mission ?? null,
    traffic: !!opts.traffic, police: !!opts.police,
    axis: opts.axis ?? 'x', dir: opts.dir ?? 1, cruise: opts.cruise ?? rand(7, 11),
    stolen: false, bustedHold: 0, flashT: 0,
  };
  cars.push(car);
  return car;
}
for (const p of PARKED_CARS) addCar(p.x, p.z, p.color, p.model, { parked: true, mission: p.mission, heading: 0 });
const TRAFFIC_COLORS = [0xd8d8d8, 0x3fa7ff, 0xff8c42, 0x37d67a, 0xc0c0c0, 0xff5a4e, 0x9b59ff, 0x222831];
for (let i = 0; i < 10; i++) {
  const axis = i % 2 === 0 ? 'x' : 'z';
  const road = CITY.roads[1 + (i % 7)];
  const along = rand(-160, 160);
  const car = addCar(axis === 'x' ? along : road, axis === 'x' ? road : along,
    TRAFFIC_COLORS[i % TRAFFIC_COLORS.length], i % 3 === 0 ? 'sport' : 'sedan',
    { traffic: true, axis, dir: i % 4 < 2 ? 1 : -1, heading: axis === 'x' ? (i % 4 < 2 ? Math.PI / 2 : -Math.PI / 2) : (i % 4 < 2 ? 0 : Math.PI) });
  traffic.push(car);
}

// ---------- Pedestrians ----------
const peds = [];
const PED_SHIRTS = [0xe8e8e8, 0xffc93c, 0x3fa7ff, 0xff5a4e, 0x37d67a, 0x9b59ff];
for (let i = 0; i < 14; i++) {
  const mesh = makePerson(PED_SHIRTS[i % PED_SHIRTS.length], 0x222228);
  const x = rand(-170, 170), z = rand(-170, 160);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  peds.push({
    mesh, x, z, heading: rand(0, Math.PI * 2), speed: rand(1.2, 2.2),
    flee: 0, walkPhase: rand(0, 6), alive: true,
  });
}

// ---------- Enemies (rival crew) ----------
const enemies = [];
function spawnEnemy(x, z, boss = false) {
  const mesh = makePerson(boss ? 0x8a1010 : 0x5a1a6b, 0x111111);
  mesh.position.set(x, 0, z);
  // Boss is bigger and wears a gold chain (torus).
  if (boss) {
    mesh.scale.setScalar(1.25);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    chain.position.y = 1.55; chain.rotation.x = Math.PI / 2.4; mesh.add(chain);
  }
  scene.add(mesh);
  const e = { mesh, x, z, health: boss ? 220 : 100, boss, shootT: rand(0.6, 1.6), alive: true, speed: boss ? 2.6 : 3.4 };
  enemies.push(e);
  return e;
}

// ---------- Mission marker ----------
const marker = new THREE.Group();
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(2.2, 2.2, 30, 20, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
);
beacon.position.y = 15;
const arrow = new THREE.Mesh(
  new THREE.ConeGeometry(1.1, 2.4, 4),
  new THREE.MeshBasicMaterial({ color: 0xffd23e }),
);
arrow.rotation.x = Math.PI; arrow.position.y = 7;
const ring = new THREE.Mesh(
  new THREE.RingGeometry(2.4, 3.2, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
);
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1;
marker.add(beacon, arrow, ring);
marker.visible = false;
scene.add(marker);

// ---------- Input ----------
const keys = {};
let camYaw = Math.PI, camPitch = 0.32, dragging = false, lastDragT = -10;
let lastX = 0, lastY = 0;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape' && state.mode === 'playing') pauseGame();
  else if (e.code === 'Escape' && state.mode === 'paused') resumeGame();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyE' && state.mode === 'playing') tryEnterExitCar();
  if (e.code === 'KeyF' && state.mode === 'playing') punch();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (state.mode !== 'playing') return;
  if (e.button === 0) shoot();
  dragging = true; lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.005;
  camPitch = clamp(camPitch + (e.clientY - lastY) * 0.004, 0.05, 1.1);
  lastX = e.clientX; lastY = e.clientY;
  lastDragT = state.time;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Toast / zones ----------
let toastTimer = null;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, ms);
}
function zoneName(x, z) {
  if (z > 150) return 'MARINA';
  if (Math.hypot(x, z) < 30) return 'CENTRAL PLAZA';
  if (z < -140) return 'NORTH DOCKS';
  if (x < -140) return 'WESTSIDE';
  if (x > 140) return 'EASTSIDE';
  if (z > 120) return 'HARBOURFRONT';
  return 'DOWNTOWN';
}

// ---------- Wanted level & police ----------
function raiseWanted(n, reason) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + n, 0, 5);
  state.heatTimer = 0;
  if (state.wanted > before) {
    toast(`WANTED LEVEL ${state.wanted} — ${reason}`);
    sound.siren(state.wanted > 0);
  }
  updateStars();
}
function updateStars() {
  ui.stars.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  ui.stars.classList.toggle('hot', state.wanted > 0);
}
function spawnPolice() {
  const px = state.inCar ? state.inCar.x : player.pos.x;
  const pz = state.inCar ? state.inCar.z : player.pos.z;
  const angle = rand(0, Math.PI * 2);
  const car = addCar(
    clamp(px + Math.cos(angle) * 55, -180, 180),
    clamp(pz + Math.sin(angle) * 55, -180, 160),
    0x1c2733, 'sedan', { police: true },
  );
  police.push(car);
  return car;
}
function removePolice(car) {
  scene.remove(car.mesh);
  cars.splice(cars.indexOf(car), 1);
  police.splice(police.indexOf(car), 1);
}
function updatePolice(dt) {
  // Keep the number of active cruisers matched to the wanted level (max 3).
  const want = Math.min(state.wanted, 3);
  while (police.length < want) spawnPolice();
  while (police.length > want) removePolice(police[police.length - 1]);

  const tx = state.inCar ? state.inCar.x : player.pos.x;
  const tz = state.inCar ? state.inCar.z : player.pos.z;
  const targetSpeed = state.inCar ? Math.abs(state.inCar.speed) : player.speed;
  for (const cop of [...police]) {
    const dx = tx - cop.x, dz = tz - cop.z;
    const d = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - cop.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cop.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
    const cruise = clamp(d * 0.55, 9, 17);
    cop.speed += (cruise - cop.speed) * Math.min(1, dt * 1.4);
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    const copPos = { x: cop.x, z: cop.z };
    collide(copPos, 2.2);
    cop.x = copPos.x; cop.z = copPos.z;
    cop.x = clamp(cop.x, -CITY.bound, CITY.bound);
    cop.z = clamp(cop.z, -CITY.bound, CITY.waterZ - 2);
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    cop.flashT += dt;
    if (cop.mesh.userData.lightBar) {
      cop.mesh.userData.lightBar.material.color.setHex(Math.floor(cop.flashT * 4) % 2 === 0 ? 0xff2a2a : 0x2a6bff);
    }
    // Ram the player: damage + sparks + camera shake feel via particles.
    if (d < 4.4) {
      if (state.inCar) {
        state.inCar.health -= 6 * dt;
        if (Math.random() < dt * 2) {
          particles.spawn(V3(cop.x, 1, cop.z), { r: 1, g: 0.8, b: 0.2 }, 6, 5, 3, 0.5);
          sound.crash();
        }
        // Shove the player's car.
        state.inCar.x += (dx / d) * -0.6 * dt * 10 * 0.1;
        state.inCar.z += (dz / d) * -0.6 * dt * 10 * 0.1;
      } else if (targetSpeed < 1.5) {
        cop.bustedHold += dt;
      }
      if (state.inCar && state.inCar.health <= 0) {
        explodeCar(state.inCar);
        exitCar(true);
      }
    } else {
      cop.bustedHold = Math.max(0, cop.bustedHold - dt);
    }
    if (cop.bustedHold > 2.2) { bustPlayer(); return; }
  }
  // Heat cools off when the player stays out of trouble and unseen.
  if (state.wanted > 0) {
    state.heatTimer += dt;
    const nearestCop = police.length ? Math.min(...police.map((c) => dist2d(c, { x: tx, z: tz }))) : 999;
    if (state.heatTimer > 14 && nearestCop > 55) {
      state.wanted--;
      state.heatTimer = 0;
      updateStars();
      toast(state.wanted === 0 ? 'You lost the heat.' : `Heat cooling… wanted level ${state.wanted}`);
      sound.siren(state.wanted > 0);
    }
  }
}
function explodeCar(car) {
  particles.spawn(V3(car.x, 1.2, car.z), { r: 1, g: 0.5, b: 0.1 }, 40, 12, 8, 1.1);
  particles.spawn(V3(car.x, 1.2, car.z), { r: 0.2, g: 0.2, b: 0.2 }, 24, 5, 6, 1.6);
  sound.explosion();
  car.health = 0;
}
function resetParkedCars() {
  for (const car of cars) {
    if (car.traffic || car.police) continue;
    const spawn = PARKED_CARS.find((p) => p.color === car.color && p.model === car.model);
    if (spawn) {
      car.x = spawn.x; car.z = spawn.z; car.heading = 0; car.speed = 0; car.health = 100;
      car.parked = true; car.stolen = false;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = 0;
    }
  }
}
function bustPlayer() {
  if (state.mode !== 'playing') return;
  state.mode = 'busted';
  const fine = Math.min(state.cash, 150 + state.wanted * 50);
  state.cash -= fine;
  state.wanted = 0;
  updateStars();
  sound.siren(false);
  sound.busted();
  for (const cop of [...police]) removePolice(cop);
  resetParkedCars();
  if (state.inCar) { state.inCar.parked = true; exitCar(false); }
  state.health = Math.max(state.health, 50);
  player.pos.set(CITY.startPos.x, 0, CITY.startPos.z);
  player.mesh.position.copy(player.pos);
  $('bustedText').textContent = `${DIALOGUE.busted} Fine: $${fine}.`;
  $('bustedMenu').hidden = false;
  hud.hidden = true;
  saveGame();
}

// ---------- Combat ----------
function shoot() {
  if (state.mode !== 'playing' || state.inCar) return;
  if (state.ammo <= 0) { toast('Out of ammo — punch (F) or find a car'); return; }
  state.ammo--;
  sound.shoot();
  const origin = V3(player.pos.x, 1.6, player.pos.z);
  const dir = V3(Math.sin(camYaw + Math.PI), 0, Math.cos(camYaw + Math.PI));
  // Muzzle flash + tracer particles along the aim line.
  particles.spawn(origin.clone().add(dir.clone().multiplyScalar(1.2)), { r: 1, g: 0.85, b: 0.3 }, 5, 2, 1, 0.15);
  let best = null, bestD = 60;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - origin.x, dz = e.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > 60) continue;
    const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - (camYaw + Math.PI)), Math.cos(Math.atan2(dx, dz) - (camYaw + Math.PI))));
    if (ang < 0.16 && d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    damageEnemy(best, 34);
    particles.spawn(V3(best.x, 1.4, best.z), { r: 1, g: 0.2, b: 0.2 }, 10, 5, 3, 0.5);
  }
  if (state.wanted === 0) raiseWanted(1, 'shots fired');
  else state.heatTimer = 0;
  updateHUD();
}
function punch() {
  if (state.mode !== 'playing' || state.inCar) return;
  sound.punch();
  let hit = false;
  for (const e of enemies) {
    if (e.alive && dist2d(e, player.pos) < 2.8) { damageEnemy(e, 26); hit = true; }
  }
  for (const p of peds) {
    if (p.alive && dist2d(p, player.pos) < 2.2) {
      p.flee = 5; hit = true;
      raiseWanted(1, 'assault');
    }
  }
  if (hit) particles.spawn(V3(player.pos.x, 1.4, player.pos.z), { r: 1, g: 1, b: 0.4 }, 6, 3, 2, 0.4);
}
function damageEnemy(e, dmg) {
  e.health -= dmg;
  if (e.health <= 0 && e.alive) {
    e.alive = false;
    scene.remove(e.mesh);
    state.enemiesDefeated++;
    particles.spawn(V3(e.x, 1.2, e.z), { r: 1, g: 0.3, b: 0.1 }, 16, 6, 4, 0.7);
    sound.pickup();
    if (e.boss) toast('Rex Dalton is down! Get to the plaza, Jace.');
    checkFightStep();
  }
}
function enemyShootAt(e) {
  const d = dist2d(e, player.pos);
  if (d > 46 || state.mode !== 'playing') return;
  sound.enemyShoot();
  particles.spawn(V3(e.x, 1.5, e.z), { r: 1, g: 0.8, b: 0.2 }, 4, 2, 1, 0.2);
  if (Math.random() < 0.55) hurtPlayer(rand(5, 10));
}
function hurtPlayer(dmg) {
  if (state.mode !== 'playing') return;
  state.health -= dmg;
  ui.flash.style.opacity = clamp(1 - state.health / 100 + 0.25, 0, 1);
  setTimeout(() => { ui.flash.style.opacity = 0; }, 180);
  if (state.health <= 0) {
    state.health = 50;
    state.cash = Math.max(0, state.cash - 100);
    toast('You got knocked out — patched up at the clinic. -$100');
    player.pos.set(CITY.startPos.x, 0, CITY.startPos.z);
    player.mesh.position.copy(player.pos);
    if (state.inCar) exitCar(false);
  }
  updateHUD();
}

// ---------- Missions ----------
function currentMission() { return MISSIONS[state.missionIndex] ?? null; }
function currentStep() {
  const m = currentMission();
  return m ? m.steps[state.stepIndex] ?? null : null;
}
function startStep() {
  const step = currentStep();
  if (!step) { completeMission(); return; }
  marker.visible = true;
  marker.position.set(step.x, 0, step.z);
  ui.mission.textContent = currentMission().name;
  ui.objective.textContent = step.label;
  if (step.kind === 'fight') {
    for (let i = 0; i < step.enemies; i++) {
      spawnEnemy(step.x + rand(-9, 9), step.z + rand(-9, 9), step.boss && i === 0);
    }
    toast(`Rival crew ahead — ${step.enemies} hostile${step.enemies > 1 ? 's' : ''}`);
  }
  if (step.kind === 'escape' && step.wantStars) raiseWanted(step.wantStars, 'the job went loud');
  if (step.kind === 'steal') toast('That car is the target — take it (E).');
}
function checkFightStep() {
  const step = currentStep();
  if (!step || step.kind !== 'fight') return;
  if (enemies.every((e) => !e.alive)) advanceStep();
}
function advanceStep() {
  const step = currentStep();
  if (step && step.kind === 'fight') {
    for (const e of [...enemies]) { if (e.alive) { e.alive = false; scene.remove(e.mesh); } }
  }
  state.stepIndex++;
  sound.pickup();
  if (state.stepIndex >= currentMission().steps.length) completeMission();
  else startStep();
  saveGame();
}
function completeMission() {
  const m = currentMission();
  state.cash += m.payout;
  toast(DIALOGUE.missionDone(m.name, m.payout), 3600);
  sound.missionDone();
  state.missionIndex++;
  state.stepIndex = 0;
  marker.visible = false;
  if (state.missionIndex >= MISSIONS.length) {
    state.allDone = true;
    $('winMenu').hidden = false;
    state.mode = 'won';
    hud.hidden = true;
    toast(DIALOGUE.allDone, 5000);
  } else {
    startStep();
  }
  saveGame();
  updateHUD();
}
function updateMission(dt) {
  const step = currentStep();
  if (!step || state.mode !== 'playing') return;
  const px = state.inCar ? state.inCar.x : player.pos.x;
  const pz = state.inCar ? state.inCar.z : player.pos.z;
  const d = Math.hypot(step.x - px, step.z - pz);
  if (step.kind === 'goto' || step.kind === 'escape') {
    if (d < step.radius && (!step.needCar || state.inCar)) advanceStep();
  } else if (step.kind === 'steal') {
    // Completes when the player drives the marked car.
    if (state.inCar && state.inCar.mission === currentMission().id) advanceStep();
  } else if (step.kind === 'fight') {
    checkFightStep();
  }
  // Marker pulse.
  marker.children[1].position.y = 7 + Math.sin(state.time * 3) * 0.7;
  marker.children[1].rotation.y += dt * 2;
}

// ---------- Cars: enter / exit / drive ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const c of cars) {
    if (c.police) continue;
    const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}
function tryEnterExitCar() {
  if (state.inCar) { exitCar(false); return; }
  const car = nearestCar(4.2);
  if (!car) return;
  state.inCar = car;
  car.parked = false;
  car.stolen = true;
  state.carsStolen++;
  sound.enterCar();
  player.mesh.visible = false;
  crosshair.style.display = 'none';
  if (car.mission === null || car.mission === currentMission()?.id) {
    // Stealing any car draws heat; mission cars count double for drama.
    raiseWanted(1, 'grand theft auto');
  }
  toast(car.mission ? 'Target car secured — go!' : 'Car stolen. Lose the heat!');
  updateHUD();
}
function exitCar(forced) {
  if (!state.inCar) return;
  const car = state.inCar;
  state.inCar = null;
  const side = car.heading + Math.PI / 2;
  player.pos.set(car.x + Math.sin(side) * 2.4, 0, car.z + Math.cos(side) * 2.4);
  collide(player.pos, 0.6);
  player.mesh.visible = true;
  player.mesh.position.copy(player.pos);
  car.speed = 0;
  if (!forced) car.parked = true;
  updateHUD();
}
function updateDriving(dt) {
  const car = state.inCar;
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const steer = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  const topSpeed = car.model === 'sport' ? 34 : 27;
  const accel = fwd > 0 ? 16 : (fwd < 0 ? -12 : 0);
  car.speed += accel * dt;
  if (fwd === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  if (keys.Space) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt); // handbrake
  car.speed = clamp(car.speed, -10, topSpeed);
  const turnRate = steer * clamp(Math.abs(car.speed) / 9, 0, 1) * 1.9 * (car.speed < 0 ? -1 : 1);
  car.heading += turnRate * dt * (keys.Space ? 1.5 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.x, z: car.z };
  car.x = nx; car.z = nz;
  collide(car, 2.1);
  const hitWall = Math.hypot(car.x - before.x, car.z - before.z) < Math.abs(car.speed) * dt * 0.4;
  if (hitWall && Math.abs(car.speed) > 8) {
    car.health -= Math.abs(car.speed) * 0.9;
    particles.spawn(V3(car.x, 1, car.z), { r: 1, g: 0.75, b: 0.2 }, 10, 6, 3, 0.5);
    sound.crash();
    car.speed *= 0.35;
  }
  if (car.health <= 30 && Math.random() < dt * 3) {
    particles.spawn(V3(car.x, 1.4, car.z), { r: 0.15, g: 0.15, b: 0.15 }, 3, 1.5, 3, 1.1);
  }
  if (car.health <= 0) { explodeCar(car); exitCar(true); return; }
  // Bump traffic cars.
  for (const t of traffic) {
    if (t === car) continue;
    const d = Math.hypot(t.x - car.x, t.z - car.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      const ux = (t.x - car.x) / d, uz = (t.z - car.z) / d;
      t.x += ux * push; t.z += uz * push;
      car.x -= ux * push * 0.5; car.z -= uz * push * 0.5;
      if (Math.abs(car.speed) > 6) {
        car.health -= 4; t.health -= 6;
        particles.spawn(V3(car.x, 1, car.z), { r: 1, g: 0.8, b: 0.2 }, 8, 5, 3, 0.5);
        sound.crash();
        raiseWanted(1, 'hit and run');
      }
      car.speed *= 0.6;
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Wheel spin.
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 1.4;
  sound.setEngine(Math.abs(car.speed) / topSpeed, true);
  // Scare pedestrians.
  for (const p of peds) {
    if (p.alive && dist2d(p, car) < 9 && Math.abs(car.speed) > 8) p.flee = 4;
  }
}
function updateOnFoot(dt) {
  const run = keys.ShiftLeft || keys.ShiftRight;
  const speed = run ? 10 : 5.6;
  let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    // Movement is relative to the camera yaw.
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    const wx = mx * cos - mz * sin;
    const wz = -mx * sin - mz * cos;
    player.pos.x += wx * speed * dt;
    player.pos.z += wz * speed * dt;
    player.heading = Math.atan2(wx, wz);
    player.speed = speed;
    player.running = run;
  } else {
    player.speed = 0;
  }
  collide(player.pos, 0.6);
  // Jump / gravity.
  if (keys.Space && player.onGround) { player.velY = 7.5; player.onGround = false; }
  player.velY -= 22 * dt;
  player.pos.y += player.velY * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.velY = 0; player.onGround = true; }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  // Walk-cycle limb swing.
  const swing = player.speed > 0 ? Math.sin(state.time * (run ? 13 : 9)) * 0.55 : 0;
  const u = player.mesh.userData;
  u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
  sound.setEngine(0, false);
}

// ---------- Traffic / pedestrians / enemies ----------
function updateTraffic(dt) {
  for (const t of traffic) {
    if (t === state.inCar) continue;
    // Cruise along its road; wrap around at the city edge.
    const step = t.cruise * t.dir * dt;
    if (t.axis === 'x') {
      t.x += step;
      if (t.x > 185) t.x = -185;
      if (t.x < -185) t.x = 185;
    } else {
      t.z += step;
      if (t.z > 160) t.z = -185;
      if (t.z < -185) t.z = 160;
    }
    // Slow for the car ahead on the same road.
    for (const o of traffic) {
      if (o === t || o.axis !== t.axis) continue;
      const ahead = t.axis === 'x' ? (o.x - t.x) * t.dir : (o.z - t.z) * t.dir;
      const lateral = t.axis === 'x' ? Math.abs(o.z - t.z) : Math.abs(o.x - t.x);
      if (ahead > 0 && ahead < 9 && lateral < 3) { t.cruise = Math.max(2, t.cruise - 6 * dt); break; }
    }
    t.mesh.position.set(t.x, 0, t.z);
    t.mesh.rotation.y = t.heading;
    for (const w of t.mesh.userData.wheels) w.rotation.x += t.cruise * dt * 1.4;
  }
}
function updatePeds(dt) {
  for (const p of peds) {
    if (!p.alive) continue;
    if (p.flee > 0) {
      p.flee -= dt;
      const away = Math.atan2(p.x - player.pos.x, p.z - player.pos.z);
      p.heading = away;
      p.x += Math.sin(away) * 5 * dt;
      p.z += Math.cos(away) * 5 * dt;
    } else {
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      if (Math.random() < dt * 0.08) p.heading = rand(0, Math.PI * 2);
      if (Math.abs(p.x) > 180 || Math.abs(p.z) > 180 || p.z > 164) p.heading += Math.PI;
    }
    const pedPos = { x: p.x, z: p.z };
    collide(pedPos, 0.5);
    p.x = pedPos.x; p.z = pedPos.z;
    p.x = clamp(p.x, -CITY.bound, CITY.bound);
    p.z = clamp(p.z, -CITY.bound, CITY.waterZ - 2);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    p.walkPhase += dt * 7;
    const swing = Math.sin(p.walkPhase) * 0.5;
    const u = p.mesh.userData;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    // Player car hitting a pedestrian: crime + wanted.
    if (state.inCar && dist2d(p, state.inCar) < 2.6 && Math.abs(state.inCar.speed) > 3) {
      p.alive = false;
      p.mesh.visible = false;
      particles.spawn(V3(p.x, 1, p.z), { r: 1, g: 0.3, b: 0.3 }, 10, 5, 3, 0.6);
      raiseWanted(1, 'pedestrian down');
    }
  }
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = dist2d(e, player.pos);
    if (d < 42) {
      // Chase the player, keep a little distance, shoot on a timer.
      const want = Math.atan2(player.pos.x - e.x, player.pos.z - e.z);
      e.x += Math.sin(want) * e.speed * dt * (d > 6 ? 1 : 0.2);
      e.z += Math.cos(want) * e.speed * dt * (d > 6 ? 1 : 0.2);
      e.shootT -= dt;
      if (e.shootT <= 0) { enemyShootAt(e); e.shootT = rand(1.1, 2.0); }
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = Math.atan2(player.pos.x - e.x, player.pos.z - e.z);
  }
}

// ---------- HUD & minimap ----------
function updateHUD() {
  ui.cash.textContent = `$${state.cash}`;
  ui.healthFill.style.width = `${clamp(state.health, 0, 100)}%`;
  ui.healthFill.style.background = state.health < 30 ? '#ff5340' : 'linear-gradient(90deg,#37d67a,#7dff9a)';
  ui.healthNum.textContent = Math.ceil(state.health);
  ui.ammoNum.textContent = state.ammo;
  const px = state.inCar ? state.inCar.x : player.pos.x;
  const pz = state.inCar ? state.inCar.z : player.pos.z;
  ui.zone.textContent = zoneName(px, pz);
  ui.speed.textContent = state.inCar ? `${Math.round(Math.abs(state.inCar.speed) * 3.6)} km/h` : `${Math.round(player.speed * 3.6)} km/h`;
  ui.carRow.hidden = !state.inCar;
  if (state.inCar) ui.carHealth.textContent = Math.max(0, Math.round(state.inCar.health));
  updateStars();
}
const mm = ui.minimap.getContext('2d');
function drawMinimap() {
  const S = 176, C = S / 2, scale = S / 430;
  const toMap = (x, z) => [C + x * scale, C + z * scale];
  mm.clearRect(0, 0, S, S);
  mm.fillStyle = '#0a1424';
  mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.fill();
  mm.save();
  mm.beginPath(); mm.arc(C, C, C - 2, 0, Math.PI * 2); mm.clip();
  // Water + roads.
  mm.fillStyle = '#0e4d6e';
  mm.fillRect(0, C + CITY.waterZ * scale, S, S);
  mm.strokeStyle = '#3a3f4a'; mm.lineWidth = 5;
  for (const r of CITY.roads) {
    const [x1, y1] = toMap(r, -200); const [x2, y2] = toMap(r, 200);
    mm.beginPath(); mm.moveTo(x1, y1); mm.lineTo(x2, y2); mm.stroke();
    const [hx1, hy1] = toMap(-200, r); const [hx2, hy2] = toMap(200, r);
    mm.beginPath(); mm.moveTo(hx1, hy1); mm.lineTo(hx2, hy2); mm.stroke();
  }
  const dot = (x, z, color, r = 3) => {
    const [mx, my] = toMap(x, z);
    mm.fillStyle = color; mm.beginPath(); mm.arc(mx, my, r, 0, Math.PI * 2); mm.fill();
  };
  // Mission marker (pulsing yellow).
  const step = currentStep();
  if (step && marker.visible) dot(step.x, step.z, '#ffd23e', 5 + Math.sin(state.time * 4) * 1.5);
  for (const c of cars) if (!c.police && c !== state.inCar) dot(c.x, c.z, '#9fd8ff', 2.5);
  for (const cop of police) dot(cop.x, cop.z, '#ff5340', 3.5);
  for (const e of enemies) if (e.alive) dot(e.x, e.z, '#ff8c42', 3);
  // Player arrow.
  const px = state.inCar ? state.inCar.x : player.pos.x;
  const pz = state.inCar ? state.inCar.z : player.pos.z;
  const [mx, my] = toMap(px, pz);
  const heading = state.inCar ? state.inCar.heading : player.heading;
  mm.save();
  mm.translate(mx, my); mm.rotate(Math.PI - heading);
  mm.fillStyle = '#ffffff';
  mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
  mm.restore();
  mm.restore();
  // North tick.
  mm.fillStyle = '#ffd23e'; mm.font = 'bold 11px sans-serif'; mm.textAlign = 'center';
  mm.fillText('N', C, 12);
}

// ---------- Camera ----------
function updateCamera(dt) {
  const target = state.inCar
    ? V3(state.inCar.x, 1.4, state.inCar.z)
    : V3(player.pos.x, 1.7, player.pos.z);
  if (state.inCar && state.time - lastDragT > 2.5) {
    // Ease the orbit behind the car's heading while driving.
    let want = state.inCar.heading + Math.PI;
    let dh = want - camYaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    camYaw += dh * Math.min(1, dt * 1.6);
  }
  const dist = state.inCar ? 13 : 8.5;
  const cx = target.x + Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = target.z + Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = target.y + Math.sin(camPitch) * dist + (state.inCar ? 1.6 : 1.2);
  camera.position.lerp(V3(cx, Math.max(cy, 1.6), cz), Math.min(1, dt * 8));
  camera.lookAt(target);
}

// ---------- Menus / flow ----------
function startNewGame() {
  Object.assign(state, {
    cash: 250, health: 100, ammo: 48, wanted: 0,
    missionIndex: 0, stepIndex: 0, allDone: false, inCar: null, mode: 'playing',
  });
  for (const e of [...enemies]) { e.alive = false; scene.remove(e.mesh); }
  enemies.length = 0;
  for (const cop of [...police]) removePolice(cop);
  resetParkedCars();
  player.pos.set(CITY.startPos.x, 0, CITY.startPos.z);
  player.mesh.position.copy(player.pos);
  player.mesh.visible = true;
  sound.ensure();
  $('startMenu').hidden = true;
  $('pauseMenu').hidden = true;
  $('bustedMenu').hidden = true;
  $('winMenu').hidden = true;
  hud.hidden = false;
  crosshair.style.display = 'block';
  updateStars();
  startStep();
  toast(DIALOGUE.start, 4200);
  saveGame();
  updateHUD();
}
function continueGame() {
  const s = loadSave();
  if (s) {
    Object.assign(state, {
      cash: s.cash ?? 250, health: s.health ?? 100, ammo: s.ammo ?? 48,
      missionIndex: s.missionIndex ?? 0, stepIndex: s.stepIndex ?? 0, allDone: !!s.allDone,
    });
  }
  state.mode = 'playing'; state.wanted = 0; state.inCar = null;
  player.pos.set(CITY.startPos.x, 0, CITY.startPos.z);
  player.mesh.position.copy(player.pos);
  player.mesh.visible = true;
  sound.ensure();
  $('startMenu').hidden = true;
  $('pauseMenu').hidden = true;
  hud.hidden = false;
  crosshair.style.display = 'block';
  updateStars();
  if (state.allDone) { ui.mission.textContent = 'FREE ROAM'; ui.objective.textContent = 'The city is yours. Drive, explore, cause trouble.'; marker.visible = false; }
  else startStep();
  updateHUD();
}
function pauseGame() {
  state.mode = 'paused';
  $('pauseMenu').hidden = false;
  sound.siren(false);
}
function resumeGame() {
  state.mode = 'playing';
  $('pauseMenu').hidden = true;
  sound.siren(state.wanted > 0);
}
function toggleMute() {
  state.muted = !state.muted;
  sound.setMuted(state.muted);
  toast(state.muted ? 'Sound muted (M)' : 'Sound on (M)');
}
$('btnNew').addEventListener('click', startNewGame);
$('btnContinue').addEventListener('click', continueGame);
$('btnHow').addEventListener('click', () => { $('howBox').hidden = !$('howBox').hidden; });
$('btnResume').addEventListener('click', resumeGame);
$('btnRestart').addEventListener('click', () => { $('pauseMenu').hidden = true; startNewGame(); });
$('btnQuit').addEventListener('click', () => {
  saveGame();
  state.mode = 'menu';
  $('pauseMenu').hidden = true;
  hud.hidden = true;
  $('startMenu').hidden = false;
  refreshContinueBtn();
});
$('btnBusted').addEventListener('click', () => {
  $('bustedMenu').hidden = true;
  hud.hidden = false;
  state.mode = 'playing';
  saveGame();
});
$('btnFree').addEventListener('click', () => {
  $('winMenu').hidden = true;
  hud.hidden = false;
  state.mode = 'playing';
  ui.mission.textContent = 'FREE ROAM';
  ui.objective.textContent = 'The city is yours. Drive, explore, cause trouble.';
});
function refreshContinueBtn() {
  $('btnContinue').style.display = loadSave() ? '' : 'none';
}
refreshContinueBtn();

// ---------- Debug / test hooks (used by automated playtests) ----------
window.__MH = {
  get state() {
    return {
      mode: state.mode, cash: state.cash, health: state.health, ammo: state.ammo,
      wanted: state.wanted, missionIndex: state.missionIndex, stepIndex: state.stepIndex,
      allDone: state.allDone, inCar: !!state.inCar,
      carsStolen: state.carsStolen, enemiesDefeated: state.enemiesDefeated,
      enemiesAlive: enemies.filter((e) => e.alive).length,
      police: police.length,
      policeDist: police.length ? Math.min(...police.map((c) => Math.hypot(c.x - (state.inCar ? state.inCar.x : player.pos.x), c.z - (state.inCar ? state.inCar.z : player.pos.z)))) : null,
      enemyDist: (() => { let d = 1e9; for (const e of enemies) if (e.alive) d = Math.min(d, dist2d(e, player.pos)); return d === 1e9 ? null : d; })(),
      player: { x: player.pos.x, z: player.pos.z },
      car: state.inCar ? { x: state.inCar.x, z: state.inCar.z, health: state.inCar.health, speed: state.inCar.speed } : null,
      mission: currentMission() ? currentMission().name : null,
      step: currentStep() ? currentStep().label : null,
    };
  },
  debug: {
    setCarHeading(rad) {
      if (state.inCar) { state.inCar.heading = rad; state.inCar.mesh.rotation.y = rad; }
    },
    teleport(x, z) {
      if (state.inCar) { state.inCar.x = x; state.inCar.z = z; state.inCar.speed = 0; }
      else { player.pos.set(x, 0, z); player.mesh.position.copy(player.pos); }
      camera.position.set(x + 10, 12, z + 10);
    },
    warpToStep() {
      const s = currentStep();
      if (s) this.teleport(s.x, s.z);
    },
    setWanted(n) { state.wanted = n; updateStars(); sound.siren(n > 0); },
    giveAmmo(n) { state.ammo += n; updateHUD(); },
    heal() { state.health = 100; updateHUD(); },
    startMission(i) {
      state.missionIndex = i; state.stepIndex = 0;
      for (const e of [...enemies]) { e.alive = false; scene.remove(e.mesh); }
      enemies.length = 0;
      startStep();
    },
    enterNearestCar() { tryEnterExitCar(); },
    exitCar() { exitCar(false); },
    aimAtNearestEnemy() {
      let best = null, bestD = 1e9;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = dist2d(e, player.pos);
        if (d < bestD) { best = e; bestD = d; }
      }
      if (!best) return false;
      camYaw = Math.atan2(-(best.x - player.pos.x), -(best.z - player.pos.z));
      return true;
    },
    nearestEnemyDist() {
      let bestD = 1e9;
      for (const e of enemies) if (e.alive) bestD = Math.min(bestD, dist2d(e, player.pos));
      return bestD === 1e9 ? null : bestD;
    },
  },
};

// ---------- Main loop ----------
const clock = new THREE.Clock();
let hudTick = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  if (state.mode === 'playing') {
    if (state.inCar) updateDriving(dt); else updateOnFoot(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updateEnemies(dt);
    updatePolice(dt);
    updateMission(dt);
    hudTick += dt;
    if (hudTick > 0.25) { hudTick = 0; updateHUD(); drawMinimap(); }
  }
  particles.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}
updateHUD();
drawMinimap();
loop();
