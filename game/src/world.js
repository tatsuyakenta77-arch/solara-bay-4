// Meridian Heat — world construction: grid city, towers with lit windows,
// marina and pier, beach, plaza, street props and the particle pool.
// All geometry is procedural boxes/cylinders; window glow is a canvas
// texture generated at runtime (no external images).

import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeWindowTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  const rnd = seededRand(base.length * 7919 + Math.floor(litRatio * 1000));
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 10) {
      const lit = rnd() < litRatio;
      g.fillStyle = lit ? (rnd() < 0.7 ? '#ffd98a' : '#9fd8ff') : '#141a26';
      g.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const TOWER_COLORS = ['#5a6b8c', '#7a6a8c', '#4e7a6b', '#8c6a4e', '#3f4a63', '#6b4e5e', '#51617d'];

export function buildCity(scene) {
  const colliders = []; // {x, z, hx, hz} axis-aligned boxes the player/cars cannot pass
  const rnd = seededRand(20261120);

  // Ground: big land slab, then road strips, plaza disc, sand + water south.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.bound * 2 + 60, CITY.bound * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  for (const r of CITY.roads) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadHalf * 2, CITY.bound * 2 + 40), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(r, 0.02, 0); scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY.bound * 2 + 40, CITY.roadHalf * 2), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.02, r); scene.add(h);
  }
  // Centre line dashes
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  for (const r of CITY.roads) {
    for (let d = -180; d <= 180; d += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(r, 0.03, d); scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), dashMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(d, 0.03, r); scene.add(dash2);
    }
  }

  // Central plaza
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(CITY.plaza.r, 40),
    new THREE.MeshLambertMaterial({ color: PALETTE.plaza }),
  );
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.04, 0); scene.add(plaza);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(5, 6, 1.2, 20),
    new THREE.MeshLambertMaterial({ color: 0x7fb3d5 }),
  );
  fountain.position.set(0, 0.6, 0); scene.add(fountain);
  colliders.push({ x: 0, z: 0, hx: 6, hz: 6 });

  // Towers on blocks (skip plaza centre, marina, roads)
  const towerMats = TOWER_COLORS.map((col) => new THREE.MeshLambertMaterial({
    map: makeWindowTexture(col, 0.42), emissive: 0xffffff, emissiveMap: makeWindowTexture(col, 0.42), emissiveIntensity: 0.55,
  }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let gx = 0; gx < CITY.roads.length - 1; gx++) {
    for (let gz = 0; gz < CITY.roads.length - 1; gz++) {
      const cx = (CITY.roads[gx] + CITY.roads[gx + 1]) / 2;
      const cz = (CITY.roads[gz] + CITY.roads[gz + 1]) / 2;
      if (Math.hypot(cx, cz) < 34) continue;         // plaza
      if (cz > 150) continue;                        // marina
      if (rnd() < 0.22) continue;                    // parks / empty lots
      const w = 14 + rnd() * 10, d = 14 + rnd() * 10, h = 14 + rnd() * 46;
      const tower = new THREE.Mesh(boxGeo, towerMats[Math.floor(rnd() * towerMats.length)]);
      tower.scale.set(w, h, d);
      tower.position.set(cx, h / 2, cz);
      scene.add(tower);
      colliders.push({ x: cx, z: cz, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
      // Rooftop beacon on the tallest towers
      if (h > 46) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.8, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff4040 }),
        );
        beacon.position.set(cx, h + 1, cz); scene.add(beacon);
      }
    }
  }

  // Street lamps along roads
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const r of CITY.roads) {
    for (let d = -160; d <= 160; d += 40) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), lampMat);
      pole.position.set(r + 6.5, 3.5, d); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), bulbMat);
      bulb.position.set(r + 6.5, 7.1, d); scene.add(bulb);
    }
  }

  // Marina: water plane, pier, boats, lighthouse
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 90),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, CITY.waterZ + 42);
  scene.add(water);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 14),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.03, CITY.waterZ - 6);
  scene.add(sand);
  // Pier
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 34),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  pier.position.set(62, 0.5, CITY.waterZ + 14); scene.add(pier);
  colliders.push({ x: 62, z: CITY.waterZ + 14, hx: 5, hz: 17 });
  // Boats (simple hull + mast)
  const boatPositions = [[30, 190], [95, 196], [-40, 192], [130, 188], [-95, 196]];
  for (const [bx, bz] of boatPositions) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 3), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    hull.position.set(bx, 0.8, bz); scene.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), lampMat);
    mast.position.set(bx, 5, bz); scene.add(mast);
  }
  // Lighthouse at the pier end
  const light = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3, 22, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
  );
  light.position.set(62, 11, CITY.waterZ + 30); scene.add(light);
  const lampTop = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 10), bulbMat);
  lampTop.position.set(62, 22.6, CITY.waterZ + 30); scene.add(lampTop);

  // Palm trees near the beach
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  for (let i = 0; i < 16; i++) {
    const px = -180 + i * 24 + rnd() * 8;
    const pz = CITY.waterZ - 12 + rnd() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 6, 6), trunkMat);
    trunk.position.set(px, 3, pz); scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 8), leafMat);
    leaves.position.set(px, 7.4, pz); scene.add(leaves);
  }

  return { colliders };
}

// Build one arcade car from boxes: body, cabin, wheels, headlights.
export function makeCar(color, model = 'sedan', isPolice = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? PALETTE.police : color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x11131a });
  const len = model === 'sport' ? 4.6 : 4.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, len), bodyMat);
  body.position.y = 0.62; group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, len * 0.45), darkMat);
  cabin.position.set(0, 1.28, -len * 0.06); group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  const wheels = [];
  for (const [wx, wz] of [[-1.0, len / 2 - 0.8], [1.0, len / 2 - 0.8], [-1.0, -len / 2 + 0.8], [1.0, -len / 2 + 0.8]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), lightMat);
    hl.position.set(sx, 0.66, len / 2 + 0.02); group.add(hl);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bar.position.set(0, 1.68, -0.2); group.add(bar);
    group.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, len * 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62; group.add(stripe);
  }
  group.userData.wheels = wheels;
  group.userData.length = len;
  return group;
}

// Simple billboard-free particle pool: sparks, smoke puffs, muzzle flashes.
export class Particles {
  constructor(scene, max = 320) {
    this.max = max;
    this.items = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }

  spawn(pos, color, count, speed = 6, up = 4, life = 0.7) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.positions[i * 3] = pos.x; this.positions[i * 3 + 1] = pos.y; this.positions[i * 3 + 2] = pos.z;
      this.colors[i * 3] = color.r; this.colors[i * 3 + 1] = color.g; this.colors[i * 3 + 2] = color.b;
      this.items[i] = {
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * up, vz: (Math.random() - 0.5) * speed,
        life, maxLife: life,
      };
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (!p) { this.positions[i * 3 + 1] = -999; continue; }
      p.life -= dt;
      if (p.life <= 0) { this.items[i] = null; this.positions[i * 3 + 1] = -999; continue; }
      this.positions[i * 3] += p.vx * dt;
      this.positions[i * 3 + 1] += p.vy * dt;
      this.positions[i * 3 + 2] += p.vz * dt;
      p.vy -= 9 * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
