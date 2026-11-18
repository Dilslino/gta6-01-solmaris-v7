// People and police: the on-foot player, pedestrians, police cars and the
// helicopter with its interactive searchlight.
import { PLAYER, POLICE } from './config.js';
import { createCar, stepCar, buildCarMesh } from './vehicles.js';
import { resolveCollision, inCoverZone } from './world.js';
import { pick, range } from './random.js';

const THREE = window.THREE;

export function buildPersonMesh(shirt, pants, skin = 0xc98a5e) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), legMat);
  legL.position.set(-0.16, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.75, 0.4), shirtMat);
  torso.position.y = 1.18; g.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), shirtMat);
  armL.position.set(-0.48, 1.2, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.48; g.add(armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.78; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
  hair.position.y = 1.82; g.add(hair);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPlayer(x, z) {
  const mesh = buildPersonMesh(0xffd166, 0x2b3a67);
  mesh.position.set(x, 0, z);
  return {
    mesh, x, z, heading: 0, vy: 0, grounded: true,
    health: 100, speed: 0, walkPhase: 0, inCar: null,
  };
}

export function stepPlayer(player, axis, run, jump, dt, colliders, audio) {
  const maxSpeed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const tx = axis.x * maxSpeed;
  const tz = axis.y * maxSpeed;
  // Movement is camera-relative: the caller passes axis already rotated.
  const px = player.x; const pz = player.z;
  const dx = tx * dt; const dz = tz * dt;
  const solved = resolveCollision(px + dx, pz + dz, PLAYER.radius, colliders);
  player.x = solved.x; player.z = solved.z;
  const moved = Math.hypot(player.x - px, player.z - pz);
  player.speed = moved / Math.max(dt, 1e-6);
  if (moved > 0.01) {
    player.heading = Math.atan2(tx, tz);
    player.walkPhase += dt * player.speed * 1.6;
    if (Math.sin(player.walkPhase) > 0.96 && audio) audio.step();
  }
  // Jump / gravity.
  if (jump && player.grounded) { player.vy = PLAYER.jumpSpeed; player.grounded = false; }
  if (!player.grounded) {
    player.vy -= PLAYER.gravity * dt;
    player.mesh.position.y += player.vy * dt;
    if (player.mesh.position.y <= 0) { player.mesh.position.y = 0; player.vy = 0; player.grounded = true; }
  }
  player.mesh.position.set(player.x, player.mesh.position.y, player.z);
  player.mesh.rotation.y = player.heading;
  const s = Math.sin(player.walkPhase);
  player.mesh.userData.legL.rotation.x = s * 0.7;
  player.mesh.userData.legR.rotation.x = -s * 0.7;
  player.mesh.userData.armL.rotation.x = -s * 0.5;
  player.mesh.userData.armR.rotation.x = s * 0.5;
}

export function makePeds(rng, scene, count) {
  const shirts = [0xe63946, 0x2a9d8f, 0xf4a261, 0x4361ee, 0xf8f9fa, 0x7209b7, 0xffb703, 0x06d6a0, 0xef476f, 0x118ab2];
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = buildPersonMesh(pick(rng, shirts), pick(rng, [0x2b3a67, 0x333333, 0x6b4f2a, 0x1f4d2e]));
    const x = range(rng, -240, 240);
    const z = range(rng, -240, 240);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z, heading: range(rng, 0, Math.PI * 2),
      tx: x, tz: z, speed: range(rng, 1.2, 2.2), fleeing: 0, phase: range(rng, 0, 6),
    });
  }
  return peds;
}

export function stepPeds(peds, dt, playerPos, gunshotPos, colliders, rng) {
  for (const p of peds) {
    if (gunshotPos) {
      const d = Math.hypot(p.x - gunshotPos.x, p.z - gunshotPos.z);
      if (d < 40) p.fleeing = 3;
    }
    if (playerPos && p.fleeing <= 0) {
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d < 3 && playerPos.inCar) p.fleeing = 1.5;
    }
    let speed = p.speed;
    if (p.fleeing > 0) {
      p.fleeing -= dt; speed = 5.5;
      // Run away from the player.
      const dx = p.x - (playerPos ? playerPos.x : 0);
      const dz = p.z - (playerPos ? playerPos.z : 0);
      const len = Math.hypot(dx, dz) || 1;
      p.tx = p.x + (dx / len) * 30;
      p.tz = p.z + (dz / len) * 30;
    } else if (Math.hypot(p.tx - p.x, p.tz - p.z) < 2) {
      p.tx = range(rng, -250, 250);
      p.tz = range(rng, -250, 250);
    }
    const dx = p.tx - p.x; const dz = p.tz - p.z;
    const len = Math.hypot(dx, dz) || 1;
    p.heading = Math.atan2(dx, dz);
    const solved = resolveCollision(p.x + (dx / len) * speed * dt, p.z + (dz / len) * speed * dt, 0.6, colliders);
    p.x = solved.x; p.z = solved.z;
    p.phase += dt * speed * 2;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    const s = Math.sin(p.phase);
    p.mesh.userData.legL.rotation.x = s * 0.6;
    p.mesh.userData.legR.rotation.x = -s * 0.6;
  }
}

// ---- Police ----

export function createPoliceFleet(scene) {
  return { cars: [], heli: null, bustTimer: 0 };
}

export function ensurePoliceCount(fleet, scene, wanted, playerPos, rng) {
  const want = Math.min(POLICE.maxCars, wanted);
  while (fleet.cars.length < want) {
    const a = range(rng, 0, Math.PI * 2);
    const car = createCar(0x111111, playerPos.x + Math.sin(a) * 55, playerPos.z + Math.cos(a) * 55, a, true);
    scene.add(car.mesh);
    fleet.cars.push(car);
  }
  while (fleet.cars.length > want) {
    const car = fleet.cars.pop();
    scene.remove(car.mesh);
  }
}

export function stepPolice(fleet, dt, playerPos, colliders, rng) {
  for (const car of fleet.cars) {
    const dx = playerPos.x - car.x; const dz = playerPos.z - car.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 1.6));
    const drive = dist > 6 ? 1 : 0.2;
    stepCar(car, drive, steer, false, dt, colliders);
    // Ram damage when a police car hits the player on foot.
    if (!playerPos.inCar && dist < 2.6) playerPos.touchDamage = (playerPos.touchDamage || 0) + POLICE.ramDamage * dt;
  }
}

// ---- Helicopter with interactive searchlight ----
// At wanted >= 3 the heli hovers over the player and its spotlight tracks
// them. A SPOTTED meter fills while the beam holds the player in the open;
// ducking into a cover zone (garage, underpass, alley) breaks the beam and
// drains the meter. Shooting the heli 5 times drives it off (wanted -1).
export function createHeli(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
  g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 5), new THREE.MeshLambertMaterial({ color: 0x1a1a22 }));
  tail.position.set(0, 0.3, -5); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.8), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  rotor.position.y = 1.1; g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  tailRotor.position.set(0, 0.4, -7.2); g.add(tailRotor);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.8), new THREE.MeshLambertMaterial({ color: 0x9fd8ff }));
  glass.position.set(0, 0.3, 2.2); g.add(glass);
  // Visible light cone + spotlight that does the real lighting.
  const coneGeo = new THREE.ConeGeometry(7, 34, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = -17; // apex at the heli, widening down to the ground
  g.add(cone);
  const spot = new THREE.SpotLight(0xfff2a8, 3.2, 90, 0.32, 0.45, 1.2);
  spot.position.set(0, -1, 0);
  g.add(spot);
  const spotTarget = new THREE.Object3D();
  scene.add(spotTarget);
  spot.target = spotTarget;
  g.userData = { rotor, cone, spot, spotTarget };
  scene.add(g);
  return { group: g, rotor, cone, spot, spotTarget, spotted: 0, hits: 0, active: false, searchAngle: 0 };
}

export function stepHeli(heli, dt, playerPos, coverZones, wanted) {
  const shouldBeActive = wanted >= POLICE.heliAtWanted;
  heli.active = shouldBeActive;
  heli.group.visible = shouldBeActive;
  if (!shouldBeActive) { heli.spotted = Math.max(0, heli.spotted - dt * 0.5); return 0; }
  // Hover above the player with a lagging offset, circling slowly.
  heli.searchAngle += dt * 0.35;
  const hx = playerPos.x + Math.sin(heli.searchAngle) * 14;
  const hz = playerPos.z + Math.cos(heli.searchAngle) * 14;
  heli.group.position.set(hx, 42, hz);
  heli.group.rotation.y = Math.atan2(playerPos.x - hx, playerPos.z - hz);
  heli.rotor.rotation.y += dt * 22;
  // Spotlight tracks the player; the cone hangs straight below the heli.
  heli.spotTarget.position.set(playerPos.x, 0, playerPos.z);
  const cover = inCoverZone(playerPos.x, playerPos.z, coverZones);
  const inBeam = !cover && !playerPos.inCar;
  // In a car the beam still tracks, but the roof blocks it: half rate.
  const rate = cover ? -0.55 : (playerPos.inCar ? 0.14 : 0.34);
  heli.spotted = Math.max(0, Math.min(1, heli.spotted + rate * dt));
  heli.cone.material.opacity = cover ? 0.05 : 0.22;
  return heli.spotted;
}
