// The city of Solmaris: a sunset coastal island. Roads on a grid, procedural
// buildings with lit windows, palms, a beach, a pier, a harbor with crates and
// a lighthouse, plus the cover zones the police helicopter cannot see into
// (the underpass, the parking garage and the plaza alley).
import { WORLD, PALETTE } from './config.js';
import { pick, range } from './random.js';

const THREE = window.THREE;

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function windowTexture(litRatio, rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#20263a'; g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 8; x < 56; x += 14) {
      g.fillStyle = rng() < litRatio ? '#ffd166' : '#141a2e';
      g.fillRect(x, y, 9, 11);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(rng) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyTop);
  scene.fog = new THREE.Fog(0xdd6a3d, 180, 620);

  const sun = new THREE.DirectionalLight(0xffb37a, 1.5);
  sun.position.set(-160, 90, -120);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8a6bbf, 0.85));
  const hemi = new THREE.HemisphereLight(0xff9a5c, 0x2a4a6a, 0.7);
  scene.add(hemi);

  // Sunset sky dome: big gradient sphere, backside.
  const skyGeo = new THREE.SphereGeometry(700, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(PALETTE.skyTop) }, mid: { value: new THREE.Color(0xff7e3d) }, bot: { value: new THREE.Color(0x3d1a4d) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(mid, bot, smoothstep(0.12, -0.08, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Sun disc low on the horizon, west.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sunDisc.position.set(-420, 62, -260);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);

  // Sea ring around the island.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6;
  scene.add(sea);

  // Island ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size + 40, WORLD.size + 40),
    new THREE.MeshLambertMaterial({ color: 0x4a7a52 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0;
  scene.add(ground);

  // Harbor water: the south-east corner is open water, not grass — two
  // strips kept clear of the piers and the crate yard.
  const harborWaterMat = new THREE.MeshLambertMaterial({ color: 0x1a5a7a });
  const harborWaterA = new THREE.Mesh(new THREE.PlaneGeometry(56, 115), harborWaterMat);
  harborWaterA.rotation.x = -Math.PI / 2;
  harborWaterA.position.set(272, 0.1, 242);
  scene.add(harborWaterA);
  const harborWaterB = new THREE.Mesh(new THREE.PlaneGeometry(160, 25), harborWaterMat);
  harborWaterB.rotation.x = -Math.PI / 2;
  harborWaterB.position.set(220, 0.1, 287.5);
  scene.add(harborWaterB);

  // Beach strip on the west edge.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(46, WORLD.size + 40),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-WORLD.half + 8, 0.05, 0);
  scene.add(beach);

  const colliders = []; // {x, z, hw, hd} axis-aligned building colliders
  const coverZones = []; // {x, z, hw, hd, name} heli searchlight cannot see inside
  const roadLines = []; // road centre lines for traffic AI

  // Roads: grid every 70 units.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  for (let i = -3; i <= 3; i += 1) {
    const c = i * WORLD.roadGap;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.roadWidth), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.06, c); scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.size), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.06, 0); scene.add(v);
    roadLines.push({ axis: 'x', at: c });
    roadLines.push({ axis: 'z', at: c });
    // Centre dashes.
    for (let d = -WORLD.half + 20; d < WORLD.half - 10; d += 24) {
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), lineMat);
      dashH.rotation.x = -Math.PI / 2; dashH.position.set(d, 0.09, c); scene.add(dashH);
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 10), lineMat);
      dashV.rotation.x = -Math.PI / 2; dashV.position.set(c, 0.09, d); scene.add(dashV);
    }
  }

  // Buildings: one per block between roads, skipping the plaza, harbor and beach.
  const palette = [PALETTE.buildingA, PALETTE.buildingB, PALETTE.buildingC, PALETTE.buildingD];
  const winTex = windowTexture(0.55, rng);
  for (let gx = -3; gx < 3; gx += 1) {
    for (let gz = -3; gz < 3; gz += 1) {
      const cx = gx * WORLD.roadGap + WORLD.roadGap / 2;
      const cz = gz * WORLD.roadGap + WORLD.roadGap / 2;
      if (cx < -WORLD.half + 60) continue; // beach side stays open
      if (gx === 2 && gz === 2) continue; // harbor yard
      if (gx === 0 && gz === 0) continue; // central plaza
      if (gx === 2 && gz === -2) continue; // parking garage block (built below)
      const w = range(rng, 22, 34);
      const d = range(rng, 22, 34);
      const h = range(rng, 14, 46);
      const col = pick(rng, palette);
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: col, map: winTex }),
      );
      // NOTE: emissive set below via material tweak (kept simple, no glow map).
      b.material.emissive = new THREE.Color(0x332200);
      b.material.emissiveIntensity = 0.35;
      b.position.set(cx, h / 2, cz);
      scene.add(b);
      const roof = box(w + 1, 1.2, d + 1, PALETTE.roof, cx, h + 0.6, cz);
      scene.add(roof);
      colliders.push({ x: cx, z: cz, hw: w / 2 + 0.6, hd: d / 2 + 0.6 });
    }
  }

  // Central plaza (spawn): fountain + benches, no collider in the middle.
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x7ec8e3 }),
  );
  fountain.position.set(35, 0.7, 35); scene.add(fountain);
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 52),
    new THREE.MeshLambertMaterial({ color: 0xb9a06a }),
  );
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(35, 0.07, 35); scene.add(plaza);

  // Parking garage (cover zone 1): flat roof on pillars at the NE block.
  // Its block is (175, -105) — the building loop skips exactly that cell.
  const garageRoof = box(40, 1.5, 40, 0x5a5f6e, 175, 7.5, -105);
  scene.add(garageRoof);
  for (const [px, pz] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) {
    scene.add(box(2, 7.5, 2, 0x6a6f7e, 175 + px, 3.75, -105 + pz));
  }
  coverZones.push({ x: 175, z: -105, hw: 19, hd: 19, name: 'Parking Garage' });

  // Underpass (cover zone 2): road bridge over the south road at x = 0.
  const bridge = box(60, 2, 18, 0x7a7f8e, 0, 6.5, 210);
  scene.add(bridge);
  for (const px of [-28, 28]) scene.add(box(2, 6.5, 16, 0x6a6f7e, px, 3.25, 210));
  coverZones.push({ x: 0, z: 210, hw: 28, hd: 8, name: 'Underpass' });

  // Plaza alley (cover zone 3): two tall towers with a gap between them.
  const t1 = box(16, 52, 16, PALETTE.buildingB, 8, 26, -8); scene.add(t1);
  const t2 = box(16, 48, 16, PALETTE.buildingC, 8, 24, 26); scene.add(t2);
  colliders.push({ x: 8, z: -8, hw: 8.6, hd: 8.6 });
  colliders.push({ x: 8, z: 26, hw: 8.6, hd: 8.6 });
  coverZones.push({ x: 8, z: 9, hw: 6, hd: 10, name: 'Plaza Alley' });

  // Palms along the beach and plaza.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2e });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 8), trunkMat);
    trunk.position.y = 3.5; g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let z = -260; z <= 260; z += 40) { palm(-252, z); palm(-228, z + 20); }
  for (let i = 0; i < 8; i += 1) palm(range(rng, 10, 60), range(rng, 10, 60));

  // Harbor (south-east): piers, crates, containers, lighthouse.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6e4f2a });
  const pier = new THREE.Mesh(new THREE.PlaneGeometry(26, 90), pierMat);
  pier.rotation.x = -Math.PI / 2; pier.position.set(210, 0.12, 235); scene.add(pier);
  const pier2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 70), pierMat);
  pier2.rotation.x = -Math.PI / 2; pier2.position.set(160, 0.12, 245); scene.add(pier2);
  const crateCols = [0xd97b29, 0x2a9d8f, 0xe9c46a, 0x4a6fa5];
  for (let i = 0; i < 16; i += 1) {
    const s = range(rng, 2.5, 4.5);
    const crate = box(s, s, s, pick(rng, crateCols), range(rng, 150, 240), s / 2, range(rng, 190, 260));
    scene.add(crate);
    colliders.push({ x: crate.position.x, z: crate.position.z, hw: s / 2 + 0.4, hd: s / 2 + 0.4 });
  }
  // Moored boats (simple hulls) in the harbor water.
  for (const [bx, bz, bc] of [[250, 250, 0xf4f1de], [285, 215, 0xe07a5f], [225, 285, 0x81b29a]]) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 14), new THREE.MeshLambertMaterial({ color: bc }));
    hull.position.set(bx, -0.1, bz); hull.rotation.y = range(rng, -0.4, 0.4); scene.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    mast.position.set(bx, 4, bz); scene.add(mast);
  }
  // Lighthouse at the pier end.
  const light = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 12), new THREE.MeshLambertMaterial({ color: 0xf4f1de }));
  light.position.set(210, 13, 272); scene.add(light);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
  lamp.position.set(210, 27, 272); scene.add(lamp);
  const beacon = new THREE.PointLight(0xffe14d, 1.4, 90);
  beacon.position.set(210, 27, 272); scene.add(beacon);

  // Streetlights along roads (visual only).
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343e });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  for (let i = -3; i <= 3; i += 1) {
    for (let d = -210; d <= 210; d += 70) {
      const c = i * WORLD.roadGap;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), poleMat);
      pole.position.set(c + 8, 3.5, d); scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      bulb.position.set(c + 8, 7.1, d); scene.add(bulb);
    }
  }

  return { scene, colliders, coverZones, roadLines, beacon };
}

export function resolveCollision(x, z, radius, colliders) {
  let nx = x; let nz = z;
  for (const c of colliders) {
    const dx = nx - c.x; const dz = nz - c.z;
    const ox = c.hw + radius - Math.abs(dx);
    const oz = c.hd + radius - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) nx = c.x + Math.sign(dx || 1) * (c.hw + radius);
      else nz = c.z + Math.sign(dz || 1) * (c.hd + radius);
    }
  }
  const lim = WORLD.half;
  nx = Math.max(-lim, Math.min(lim, nx));
  nz = Math.max(-lim, Math.min(lim, nz));
  return { x: nx, z: nz };
}

export function inCoverZone(x, z, coverZones) {
  for (const zn of coverZones) {
    if (Math.abs(x - zn.x) < zn.hw && Math.abs(z - zn.z) < zn.hd) return zn;
  }
  return null;
}

export function onRoad(x, z) {
  for (let i = -3; i <= 3; i += 1) {
    const c = i * WORLD.roadGap;
    if (Math.abs(z - c) < WORLD.roadWidth / 2 + 2) return true;
    if (Math.abs(x - c) < WORLD.roadWidth / 2 + 2) return true;
  }
  return false;
}
