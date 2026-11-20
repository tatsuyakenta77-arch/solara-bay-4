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
