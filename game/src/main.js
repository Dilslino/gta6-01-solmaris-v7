// Solmaris — an original open-world sunset city game (three.js r152 vendored).
// Boot, screens, loop, camera, combat, wanted system, missions, checkpoints.
// ?seed=N fixes the world. ?shot=start|play|mission|end stages a screenshot
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { STEP, WORLD, ECONOMY, MISSIONS, POLICE, PLAYER } from './config.js';
import { createRandom, pick, range } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_SAVE, createInput } from './input.js';
import { createWorld, resolveCollision, inCoverZone } from './world.js';
import { createCar, stepCar, makeTraffic, stepTraffic, CAR_COLORS } from './vehicles.js';
import { createPlayer, stepPlayer, makePeds, stepPeds, createPoliceFleet, ensurePoliceCount, stepPolice, createHeli, stepHeli } from './entities.js';
import { createMissionManager, missionStages, MISSION_SPOTS } from './missions.js';
import { createHud } from './hud.js';
import { saveGame, loadSave, hasSave, readBestCash, writeBestCash } from './save.js';
import { autopilotDrive } from './shots.js';

const THREE = window.THREE;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener('resize', resize);
resize();

const rng = createRandom(seed);
const world = createWorld(rng);
const scene = world.scene;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();
const missionMgr = createMissionManager(scene);
const policeFleet = createPoliceFleet(scene);
const heli = createHeli(scene);

const SPAWN = { x: 20, z: 62 };

const game = {
  screen: 'title',
  cash: ECONOMY.startCash,
  health: 100,
  wanted: 0,
  wantedQuiet: 0,
  crimeCooldown: 0,
  missionIndex: 0,
  time: 0,
  clockMinutes: 0,
  player: createPlayer(SPAWN.x, SPAWN.z),
  traffic: [],
  parked: [],
  peds: [],
  courier: null,
  coupe: null,
  playerCar: null,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  cameraDist: 9,
  camPos: new THREE.Vector3(SPAWN.x, 6, SPAWN.z + 10),
  gunshotPos: null,
  fireCooldown: 0,
  punchCooldown: 0,
  heliCooldown: 0,
  brokeBeam: false,
  bustedTimer: 0,
  autoSaveTimer: 0,
  missionToastTimer: 0,
  storyDone: false,
};
scene.add(game.player.mesh);
game.traffic = makeTraffic(rng, scene, world.colliders, 11);
game.peds = makePeds(rng, scene, 14);

// Parked cars near the plaza, stealable from the start.
for (const [px, pz, col] of [[28, 78, 0xe63946], [44, 78, 0x2a9d8f], [60, 62, 0xf4a261]]) {
  const c = createCar(col, px, pz, Math.PI / 2, false);
  scene.add(c.mesh);
  game.parked.push(c);
}
// The red coupe for Mission 3, parked by the plaza.
game.coupe = createCar(0xe63946, 52, 18, Math.PI, false);
scene.add(game.coupe.mesh);
game.parked.push(game.coupe);
// Courier van for Mission 2 (hidden until the mission starts).
game.courier = createCar(0xf4d35e, 0, -140, 0, false);
game.courier.mesh.visible = false;
scene.add(game.courier.mesh);

// ---------- helpers ----------

function announce(msg) { hud.announce(msg); }

function addWanted(n, reason) {
  if (game.crimeCooldown > 0 && n > 0) return;
  game.wanted = Math.max(0, Math.min(5, game.wanted + n));
  game.wantedQuiet = 0;
  if (n > 0) game.crimeCooldown = 2.5;
  if (n > 0) hud.toast(`${reason} — wanted level ${game.wanted}`, 2.5);
}

function playerPos() {
  const p = game.player;
  const inCar = !!game.playerCar;
  return { x: inCar ? game.playerCar.x : p.x, z: inCar ? game.playerCar.z : p.z, inCar, heading: inCar ? game.playerCar.heading : p.heading };
}

function nearestCar(maxDist) {
  const pos = playerPos();
  let best = null; let bestD = maxDist;
  for (const c of [...game.traffic, ...game.parked]) {
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  const wasTraffic = game.traffic.includes(car);
  if (wasTraffic) game.traffic.splice(game.traffic.indexOf(car), 1);
  const pi = game.parked.indexOf(car);
  if (pi >= 0) game.parked.splice(pi, 1);
  game.playerCar = car;
  game.player.inCar = car;
  game.player.mesh.visible = false;
  const pos = playerPos();
  const policeNear = policeFleet.cars.some((pc) => Math.hypot(pc.x - car.x, pc.z - car.z) < 42);
  const pedNear = game.peds.some((pd) => Math.hypot(pd.x - car.x, pd.z - car.z) < 14);
  if ((policeNear || pedNear) && car !== game.coupe) addWanted(1, 'Car stolen in plain sight');
  if (car === game.coupe && missionMgr.active && missionMgr.index === 2 && missionMgr.current() && missionMgr.current().kind === 'steal') {
    addWanted(1, 'Coupe stolen');
    advanceMission();
  }
  audio.pickup();
  checkpoint();
}

function exitCar() {
  const car = game.playerCar;
  if (!car) return;
  const p = game.player;
  p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.2;
  p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.2;
  const solved = resolveCollision(p.x, p.z, PLAYER.radius, world.colliders);
  p.x = solved.x; p.z = solved.z;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.visible = true;
  p.inCar = null;
  game.playerCar = null;
  game.parked.push(car);
  checkpoint();
}

function checkpoint() {
  const pos = playerPos();
  const mm = missionMgr;
  const snap = {
    cash: game.cash, health: 100, wanted: 0,
    missionIndex: game.missionIndex, missionStage: mm.active ? mm.stage : 0,
    missionTimeLeft: mm.active ? mm.timeLeft : (MISSIONS[game.missionIndex] ? MISSIONS[game.missionIndex].time : 0),
    carrying: mm.carrying, tailProgress: mm.tailProgress,
    x: pos.x, z: pos.z, heading: pos.heading,
    inCar: !!game.playerCar, carColor: game.playerCar ? game.playerCar.color : null,
    storyDone: game.storyDone,
  };
  saveGame(snap);
}

function restoreSnapshot(snap) {
  game.cash = snap.cash;
  game.health = 100;
  game.wanted = 0;
  game.wantedQuiet = 0;
  game.missionIndex = snap.missionIndex;
  game.storyDone = !!snap.storyDone;
  const p = game.player;
  p.x = snap.x; p.z = snap.z; p.heading = snap.heading || 0;
  p.health = 100;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.visible = !snap.inCar;
  if (game.playerCar) { game.parked.push(game.playerCar); game.playerCar = null; p.inCar = null; }
  if (snap.inCar) {
    const car = createCar(snap.carColor ?? 0xe63946, snap.x, snap.z, snap.heading || 0, false);
    scene.add(car.mesh);
    game.playerCar = car;
    p.inCar = car;
  }
  // Mission: restart the saved mission at the saved stage.
  if (game.missionIndex < MISSIONS.length) {
    missionMgr.start(game.missionIndex);
    missionMgr.stage = Math.min(snap.missionStage || 0, missionMgr.stages.length - 1);
    missionMgr.timeLeft = snap.missionTimeLeft || MISSIONS[game.missionIndex].time;
    missionMgr.carrying = !!snap.carrying;
    missionMgr.tailProgress = snap.tailProgress || 0;
    if (game.missionIndex === 1) showCourier(true);
    if (game.missionIndex === 2) { /* coupe stays parked unless stolen */ }
  } else {
    missionMgr.active = false;
    missionMgr.beacon.visible = false;
    missionMgr.marker.visible = false;
  }
  policeFleet.cars.forEach((c) => scene.remove(c.mesh));
  policeFleet.cars.length = 0;
  heli.spotted = 0; heli.hits = 0;
  game.bustedTimer = 0;
  game.screen = 'play';
  hud.clearCenter();
  updateObjectiveHud();
  hud.toast('Checkpoint restored.', 2.5);
}

function showCourier(on) {
  game.courier.mesh.visible = on;
  if (on) { game.courier.x = 0; game.courier.z = -140; game.courier.heading = 0; game.courier.speed = 11; }
}

function startMission(index) {
  game.missionIndex = index;
  missionMgr.start(index);
  if (index === 1) showCourier(true);
  const m = MISSIONS[index];
  hud.toast(`MISSION ${index + 1}: ${m.name} — ${m.brief}`, 5);
  announce(`Mission ${index + 1}: ${m.name}. ${m.brief}`);
  updateObjectiveHud();
  checkpoint();
}

function advanceMission() {
  const done = missionMgr.advance();
  audio.pickup();
  if (done) {
    const m = MISSIONS[game.missionIndex];
    game.cash += m.reward;
    if (game.missionIndex === 1) showCourier(false);
    audio.missionDone();
    hud.toast(`MISSION COMPLETE: ${m.name} +$${m.reward} — cash $${game.cash}`, 4.5);
    announce(`Mission complete: ${m.name}. Earned $${m.reward}.`);
    const best = readBestCash();
    if (game.cash > best) writeBestCash(game.cash);
    game.missionIndex += 1;
    if (game.missionIndex >= MISSIONS.length) {
      game.storyDone = true;
      missionMgr.active = false;
      game.screen = 'complete';
      hud.showComplete();
      checkpoint();
      return;
    }
    startMission(game.missionIndex);
  } else {
    updateObjectiveHud();
    checkpoint();
  }
}

function updateObjectiveHud() {
  if (!missionMgr.active) {
    hud.setObjective('SOLMARIS — FREE ROAM', game.storyDone ? 'All missions complete. The city is yours.' : 'Press ENTER on the title screen to start Mission 1.');
    return;
  }
  const m = MISSIONS[missionMgr.index];
  const st = missionMgr.current();
  hud.setObjective(`MISSION ${missionMgr.index + 1}: ${m.name}  ·  $${m.reward}  ·  ${Math.ceil(missionMgr.timeLeft)}s`,
    st ? st.text : '');
}

function failMission(reason) {
  missionMgr.fail();
  if (game.missionIndex === 1) showCourier(false);
  hud.toast(`${reason} — mission failed. Restarting ${MISSIONS[game.missionIndex].name}…`, 4);
  startMission(game.missionIndex);
}

function endRun(kind) {
  const penalty = kind === 'busted' ? ECONOMY.bustedPenalty : ECONOMY.wastedPenalty;
  game.cash = Math.max(0, game.cash - penalty);
  game.health = 100;
  game.wanted = 0;
  if (game.playerCar) { game.parked.push(game.playerCar); game.playerCar = null; game.player.inCar = null; game.player.mesh.visible = true; }
  game.player.mesh.position.set(game.player.x, 0, game.player.z);
  policeFleet.cars.forEach((c) => scene.remove(c.mesh));
  policeFleet.cars.length = 0;
  heli.spotted = 0;
  // The checkpoint snapshot is re-saved with the penalty applied, so
  // Continue resumes the exact checkpoint state minus the fine.
  const pos = playerPos();
  const mm = missionMgr;
  saveGame({
    cash: game.cash, health: 100, wanted: 0,
    missionIndex: game.missionIndex, missionStage: mm.active ? mm.stage : 0,
    missionTimeLeft: mm.active ? mm.timeLeft : (MISSIONS[game.missionIndex] ? MISSIONS[game.missionIndex].time : 0),
    carrying: mm.carrying, tailProgress: mm.tailProgress,
    x: pos.x, z: pos.z, heading: pos.heading, inCar: false, carColor: null,
    storyDone: game.storyDone,
  });
  game.screen = kind;
  if (kind === 'busted') audio.busted(); else audio.wasted();
  hud.showOver(kind, penalty, game.cash);
  announce(kind === 'busted' ? `Busted. Lost $${penalty}.` : `Wasted. Lost $${penalty}.`);
}

// ---------- combat ----------

const raycaster = new THREE.Raycaster();
function shoot() {
  if (game.fireCooldown > 0) return;
  game.fireCooldown = 0.28;
  audio.gunshot();
  addWanted(1, 'Shots fired');
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  for (const c of policeFleet.cars) targets.push(c.mesh);
  if (heli.active) targets.push(heli.group);
  for (const c of game.traffic) targets.push(c.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== scene) obj = obj.parent;
    if (obj === heli.group) {
      heli.hits += 1;
      hud.toast(`Hit the helicopter! (${heli.hits}/5)`, 1.5);
      if (heli.hits >= 5) {
        game.heliCooldown = 25;
        game.wanted = Math.max(0, game.wanted - 1);
        heli.hits = 0;
        hud.toast('Helicopter driven off! Wanted down.', 3);
      }
    }
  }
  game.gunshotPos = playerPos();
  setTimeout(() => { game.gunshotPos = null; }, 120);
}

function punch() {
  if (game.punchCooldown > 0) return;
  game.punchCooldown = 0.5;
  audio.punch();
  const pos = playerPos();
  for (const pd of game.peds) {
    const d = Math.hypot(pd.x - pos.x, pd.z - pos.z);
    if (d < PLAYER.punchRange + 0.6) {
      pd.fleeing = 4;
      addWanted(1, 'Assault');
      hud.toast('You punched a pedestrian!', 2);
      break;
    }
  }
}

// ---------- camera ----------

function updateCamera(dt) {
  const drag = input.takeDrag();
  game.cameraYaw -= drag.x * 0.005;
  game.cameraPitch = Math.max(0.08, Math.min(0.9, game.cameraPitch + drag.y * 0.003));
  const pos = playerPos();
  const inCar = !!game.playerCar;
  const speed = inCar ? Math.abs(game.playerCar.speed) : game.player.speed;
  const dist = inCar ? 11 + speed * 0.06 : 8;
  const height = inCar ? 4.2 : 3.4;
  // Chase cam: yaw follows the player's heading, drag orbits around it.
  const followYaw = pos.heading + Math.PI;
  let dy = followYaw - game.cameraYaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  game.cameraYaw += dy * Math.min(1, dt * (inCar ? 2.2 : 3.2));
  const cx = pos.x + Math.sin(game.cameraYaw) * dist;
  const cz = pos.z + Math.cos(game.cameraYaw) * dist;
  const target = new THREE.Vector3(cx, height, cz);
  game.camPos.lerp(target, Math.min(1, dt * 6));
  camera.position.copy(game.camPos);
  camera.lookAt(pos.x - Math.sin(pos.heading) * 3, 1.6, pos.z - Math.cos(pos.heading) * 3);
}

// ---------- main update ----------

function step(dt) {
  game.time += dt;
  game.clockMinutes += dt * 0.35;
  if (game.crimeCooldown > 0) game.crimeCooldown -= dt;
  if (game.fireCooldown > 0) game.fireCooldown -= dt;
  if (game.punchCooldown > 0) game.punchCooldown -= dt;
  if (game.heliCooldown > 0) game.heliCooldown -= dt;
  game.autoSaveTimer += dt;
  if (game.autoSaveTimer > 20) { game.autoSaveTimer = 0; if (game.screen === 'play') checkpoint(); }

  const axis = input.axis();
  const pos = playerPos();

  // Player / car movement.
  if (game.playerCar) {
    const drive = axis.y;
    const steer = -axis.x;
    stepCar(game.playerCar, drive, steer, input.handbrake, dt, world.colliders);
    if (input.handbrake && Math.abs(game.playerCar.speed) > 12 && Math.random() < dt * 2) audio.skid();
    audio.updateEngine(game.playerCar.speed, true, game.wanted);
  } else {
    const camYaw = game.cameraYaw;
    // Camera-relative movement: forward is away from the camera.
    const fx = -Math.sin(camYaw); const fz = -Math.cos(camYaw);
    const rx = -Math.cos(camYaw); const rz = Math.sin(camYaw);
    const mx = fx * axis.y + rx * axis.x;
    const mz = fz * axis.y + rz * axis.x;
    const len = Math.hypot(mx, mz) || 1;
    const norm = Math.hypot(axis.x, axis.y) > 0 ? { x: mx / len, y: mz / len } : { x: 0, y: 0 };
    stepPlayer(game.player, norm, input.run, input.jump, dt, world.colliders, audio);
    audio.updateEngine(0, false, game.wanted);
  }

  // Enter / exit car (E) — edge-triggered via keydown count: poll keys directly.
  if (input.keys.has('KeyE') && !step._eDown) {
    step._eDown = true;
    if (game.playerCar) exitCar();
    else {
      const car = nearestCar(3.4);
      if (car) enterCar(car);
      else if (missionMgr.active) {
        const st = missionMgr.current();
        if (st && (st.kind === 'pickup' || st.kind === 'deliver')) {
          const p2 = playerPos();
          const d = Math.hypot(st.target.x - p2.x, st.target.z - p2.z);
          if (d < (st.radius || 5)) {
            if (st.kind === 'pickup') { missionMgr.carrying = true; audio.pickup(); }
            if (st.kind === 'deliver') { missionMgr.carrying = false; audio.coin(); }
            advanceMission();
          }
        }
      }
    }
  }
  if (!input.keys.has('KeyE')) step._eDown = false;

  // Combat.
  if (input.takeClick() && !game.playerCar && game.screen === 'play') shoot();
  if (input.punch && !game.playerCar) punch();
  hud.setCrosshair(!game.playerCar && game.screen === 'play');

  // Traffic + peds.
  for (const c of game.traffic) stepTraffic(c, dt, [...game.traffic, ...(game.playerCar ? [game.playerCar] : [])], rng);
  stepPeds(game.peds, dt, pos, game.gunshotPos, world.colliders, rng);

  // Courier van (Mission 2) loops the block.
  if (game.courier.mesh.visible) {
    const cv = game.courier;
    const wp = [[0, -140], [140, -140], [140, 0], [0, 0], [0, -140]];
    const target = wp[cv._wp || 0];
    const dx = target[0] - cv.x; const dz = target[1] - cv.z;
    if (Math.hypot(dx, dz) < 8) cv._wp = ((cv._wp || 0) + 1) % wp.length;
    const th = Math.atan2(dx, dz);
    let dh = th - cv.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    cv.heading += Math.max(-1.4 * dt, Math.min(1.4 * dt, dh));
    cv.x += Math.sin(cv.heading) * 11 * dt;
    cv.z += Math.cos(cv.heading) * 11 * dt;
    cv.mesh.position.set(cv.x, 0, cv.z);
    cv.mesh.rotation.y = cv.heading;
  }

  // Wanted: police + heli.
  ensurePoliceCount(policeFleet, scene, game.heliCooldown > 0 ? Math.min(game.wanted, 2) : game.wanted, pos, rng);
  stepPolice(policeFleet, dt, { ...pos, touchDamage: 0 }, world.colliders, rng);
  const spotted = stepHeli(heli, dt, pos, world.coverZones, game.heliCooldown > 0 ? 0 : game.wanted);
  if (spotted >= 1 && game.wanted < 5) {
    game.wanted = Math.min(5, game.wanted + 1);
    heli.spotted = 0.4;
    hud.toast('SPOTTED by the searchlight! Wanted up.', 3);
  }
  if (spotted > 0.5) game.brokeBeam = false;
  if (heli.active && spotted < 0.15 && game.brokeBeam === false && inCoverZone(pos.x, pos.z, world.coverZones)) {
    game.brokeBeam = true;
    hud.toast('Searchlight lost you — stay hidden!', 2.5);
  }
  hud.setSpot(heli.active, heli.spotted);

  // Police shooting when wanted >= 2 and player on foot.
  if (game.wanted >= 2 && !game.playerCar) {
    for (const pc of policeFleet.cars) {
      const d = Math.hypot(pc.x - pos.x, pc.z - pos.z);
      if (d < POLICE.shootRange) {
        game.health -= 7 * dt;
        if (Math.random() < dt * 0.5) audio.gunshot();
      }
    }
  }
  // Busted: police car sits on the player on foot.
  if (!game.playerCar && game.wanted > 0) {
    const near = policeFleet.cars.some((pc) => Math.hypot(pc.x - pos.x, pc.z - pos.z) < POLICE.bustDistance);
    if (near) {
      game.bustedTimer += dt;
      if (game.bustedTimer > POLICE.bustTime) { endRun('busted'); return; }
    } else game.bustedTimer = Math.max(0, game.bustedTimer - dt * 2);
  }
  // Car hits a pedestrian: wanted + flee.
  if (game.playerCar) {
    for (const pd of game.peds) {
      const d = Math.hypot(pd.x - game.playerCar.x, pd.z - game.playerCar.z);
      if (d < 2.2 && Math.abs(game.playerCar.speed) > 4) {
        pd.fleeing = 4;
        addWanted(1, 'Pedestrian hit');
      }
    }
  }

  // Wanted decay when quiet and unseen.
  if (game.wanted > 0) {
    const policeNear = policeFleet.cars.some((pc) => Math.hypot(pc.x - pos.x, pc.z - pos.z) < 28);
    if (!policeNear) {
      game.wantedQuiet += dt;
      if (game.wantedQuiet > POLICE.decaySeconds) {
        game.wanted -= 1;
        game.wantedQuiet = 0;
        hud.toast(`Heat cooling off — wanted level ${game.wanted}`, 2);
      }
    } else game.wantedQuiet = 0;
  }

  // Missions.
  if (missionMgr.active) {
    const res = missionMgr.update(dt, pos);
    if (res === 'timeout') { failMission('Time up'); return; }
    const st = missionMgr.current();
    if (st) {
      const p2 = playerPos();
      const d = Math.hypot(st.target.x - p2.x, st.target.z - p2.z);
      if (st.kind === 'goto' && d < (st.radius || 5)) advanceMission();
      else if (st.kind === 'tail' && game.courier.mesh.visible) {
        const cd = Math.hypot(game.courier.x - p2.x, game.courier.z - p2.z);
        if (cd >= 10 && cd <= 42) {
          missionMgr.tailProgress += dt;
          if (missionMgr.tailProgress >= (st.tailTime || 20)) {
            missionMgr.tailProgress = 0;
            // The parcel drops where the courier is right now.
            const next = missionMgr.stages[missionMgr.stage + 1];
            if (next) next.target = { x: game.courier.x, z: game.courier.z, label: 'Dropped Parcel' };
            advanceMission();
            showCourier(false);
          }
        } else missionMgr.tailProgress = Math.max(0, missionMgr.tailProgress - dt * 2);
      } else if (st.kind === 'loseheat' && game.wanted === 0) advanceMission();
      else if (st.kind === 'escape' && d < (st.radius || 8) && (!heli.active || heli.spotted < 0.6)) advanceMission();
      else if ((st.kind === 'pickup' || st.kind === 'deliver') && st.needCar && game.playerCar && d < (st.radius || 8)) {
        // Parked delivery while in the car: E still confirms.
      }
    }
    // Mission 6: grabbing the case triggers wanted 3 + heli.
    if (missionMgr.index === 5 && missionMgr.stage === 2 && game.wanted < 3) {
      game.wanted = 3;
      hud.toast('WANTED 3 — the helicopter is up!', 3);
    }
  }

  // Wasted.
  if (game.health <= 0) { game.health = 0; endRun('wasted'); return; }

  // HUD.
  hud.setCash(game.cash);
  hud.setHealth(game.health);
  hud.setWanted(game.wanted);
  const kmh = game.playerCar ? Math.abs(game.playerCar.speed) * 3.6 : game.player.speed * 3.6;
  hud.setSpeed(kmh, !!game.playerCar);
  hud.setClock(game.clockMinutes);
  hud.tickToast(dt);
  updateObjectiveHud();
  hud.drawMinimap({
    player: pos,
    traffic: game.traffic,
    police: policeFleet.cars,
    heli: heli.active ? { x: heli.group.position.x, z: heli.group.position.z } : null,
    missionTarget: missionMgr.active && missionMgr.current() ? missionMgr.current().target : null,
  });
  updateCamera(dt);
}

// ---------- screens ----------

function newGame() {
  game.cash = ECONOMY.startCash;
  game.health = 100;
  game.wanted = 0;
  game.missionIndex = 0;
  game.storyDone = false;
  game.player.x = SPAWN.x; game.player.z = SPAWN.z;
  game.player.mesh.position.set(SPAWN.x, 0, SPAWN.z);
  game.player.mesh.visible = true;
  if (game.playerCar) { game.parked.push(game.playerCar); game.playerCar = null; game.player.inCar = null; }
  game.screen = 'play';
  hud.clearCenter();
  audio.unlock();
  audio.click();
  startMission(0);
  hud.toast('Welcome to Solmaris. Mission 1: Sunset Pickup.', 4);
}

function continueGame() {
  const snap = loadSave();
  if (!snap) { newGame(); return; }
  audio.unlock();
  audio.click();
  restoreSnapshot(snap);
}

hud.onAction((action) => {
  if (action === 'new') newGame();
  else if (action === 'continue') continueGame();
  else if (action === 'how') hud.showHow();
  else if (action === 'back') hud.showTitle(hasSave(), readBestCash());
  else if (action === 'resume') { game.screen = 'play'; hud.clearCenter(); }
  else if (action === 'save') { checkpoint(); hud.toast('Game saved.', 2); }
  else if (action === 'quit') { game.screen = 'title'; hud.showTitle(hasSave(), readBestCash()); }
  else if (action === 'title') { game.screen = 'title'; hud.showTitle(hasSave(), readBestCash()); }
  else if (action === 'free') { game.screen = 'play'; hud.clearCenter(); }
});

document.getElementById('muteBtn').addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  hud.setMute(audio.muted);
});
hud.setMute(audio.muted);

function handleActions() {
  const a = input.takeActions();
  if (a & ACTION_MUTE) { audio.unlock(); audio.setMuted(!audio.muted); hud.setMute(audio.muted); }
  if (a & ACTION_SAVE && game.screen === 'play') { checkpoint(); hud.toast('Game saved.', 2); }
  if (a & ACTION_CONFIRM && game.screen === 'title') newGame();
  else if (a & ACTION_PAUSE && game.screen === 'play') { game.screen = 'paused'; hud.showPause(); }
  else if (a & ACTION_PAUSE && game.screen === 'paused') { game.screen = 'play'; hud.clearCenter(); }
}

let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, 0.25);
  last = now;
  handleActions();
  if (game.screen === 'play') {
    while (accumulator >= STEP && game.screen === 'play') { step(STEP); accumulator -= STEP; }
  } else accumulator = 0;
  if (game.screen === 'title') {
    // Slow cinematic orbit over the plaza at sunset, high enough to clear
    // the rooftops.
    const t = now / 1000;
    camera.position.set(35 + Math.sin(t * 0.08) * 70, 40, 35 + Math.cos(t * 0.08) * 70);
    camera.lookAt(35, 4, 35);
    hud.drawMinimap({ player: playerPos(), traffic: game.traffic, police: [], heli: null, missionTarget: MISSION_SPOTS.marinaCafe });
  }
  renderer.render(scene, camera);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play') { game.screen = 'paused'; hud.showPause(); }
});

// ---------- screenshot staging ----------

function runShot(name) {
  hud.setMute(audio.muted);
  if (name === 'start') {
    game.screen = 'title';
    hud.showTitle(false, readBestCash());
    // High view over the rooftops toward the plaza and the sunset.
    camera.position.set(125, 58, 155);
    camera.lookAt(35, 6, 35);
    hud.setCash(game.cash); hud.setHealth(game.health); hud.setWanted(0);
    hud.setSpeed(0, false);
    hud.drawMinimap({ player: playerPos(), traffic: game.traffic, police: [], heli: null, missionTarget: MISSION_SPOTS.marinaCafe });
  } else if (name === 'play') {
    newGame();
    // Stage a chase on the x=0 road: the player driving south, three police
    // cars behind, the helicopter overhead with its searchlight on. The
    // composition is placed, not driven, so no wall ever fills the frame.
    const car = game.parked[0];
    game.player.x = car.x; game.player.z = car.z;
    enterCar(car);
    game.playerCar.x = 0; game.playerCar.z = -60; game.playerCar.heading = 0;
    game.playerCar.speed = 24;
    game.playerCar.mesh.position.set(0, 0, -60);
    game.playerCar.mesh.rotation.y = 0;
    game.wanted = 3;
    game.cameraYaw = Math.PI;
    // Keep traffic out of the chase corridor.
    for (const c of game.traffic) {
      if (Math.abs(c.x) < 18 && c.z > -130 && c.z < 20) { c.x += 70; c.mesh.position.x = c.x; }
    }
    ensurePoliceCount(policeFleet, scene, 3, playerPos(), rng);
    const slots = [[0, -88], [6.5, -104], [-6.5, -98]];
    policeFleet.cars.forEach((pc, i) => {
      pc.x = slots[i][0]; pc.z = slots[i][1]; pc.heading = 0; pc.speed = 22;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = 0;
    });
    stepHeli(heli, STEP, playerPos(), world.coverZones, 3);
    heli.group.position.set(-8, 30, -72);
    // Camera ahead-right of the player, looking back down the road: the
    // player's car faces the camera and the three police cars stack up
    // behind it in the frame, helicopter above them.
    camera.position.set(12, 5.5, -28);
    camera.lookAt(0, 2, -78);
    game.camPos.set(12, 5.5, -28);
    game.screen = 'play';
    hud.setCash(game.cash); hud.setHealth(game.health); hud.setWanted(3);
    hud.setSpeed(86, true);
    hud.setObjective('MISSION 1: Sunset Pickup  ·  $300  ·  212s', 'Deliver the parcel to the North Drop-off.');
    hud.toast('Police chase — wanted level 3!', 3);
    hud.drawMinimap({ player: playerPos(), traffic: game.traffic, police: policeFleet.cars, heli: { x: heli.group.position.x, z: heli.group.position.z }, missionTarget: MISSION_SPOTS.dropoffNorth });
  } else if (name === 'mission') {
    newGame();
    // Jump straight to the harbor mission scene.
    game.missionIndex = 4;
    missionMgr.start(4);
    missionMgr.stage = 1;
    game.player.x = 198; game.player.z = 210;
    game.player.mesh.position.set(198, 0, 210);
    game.player.heading = Math.PI;
    game.cameraYaw = 0;
    game.camPos.set(196, 4.5, 192);
    camera.position.set(196, 4.5, 192);
    camera.lookAt(208, 3, 252);
    updateObjectiveHud();
    hud.setCash(800); hud.setHealth(100); hud.setWanted(1);
    hud.setSpeed(0, false);
    hud.toast('Harbor Cargo — collect the crate.', 3);
    hud.drawMinimap({ player: playerPos(), traffic: game.traffic, police: [], heli: null, missionTarget: MISSION_SPOTS.harborWarehouse });
  } else { // end — WASTED screen over the city
    newGame();
    game.cash = 350;
    game.health = 0;
    game.player.x = 35; game.player.z = 60;
    game.player.mesh.position.set(35, 0, 60);
    game.wanted = 2;
    ensurePoliceCount(policeFleet, scene, 2, playerPos(), rng);
    // Street-level view across the plaza: palms, fountain and sunset
    // buildings carry the shot; the tower at the left edge is the plaza
    // alley in shadow.
    camera.position.set(35, 7, 82);
    camera.lookAt(35, 1.5, 60);
    hud.setCash(350); hud.setHealth(0); hud.setWanted(2);
    hud.setSpeed(0, false);
    hud.toast('', 0.1);
    hud.showOver('wasted', ECONOMY.wastedPenalty, 250);
    hud.drawMinimap({ player: playerPos(), traffic: game.traffic, police: policeFleet.cars, heli: null, missionTarget: null });
  }
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else {
  hud.showTitle(hasSave(), readBestCash());
  hud.setCash(game.cash);
  hud.setHealth(game.health);
  hud.setWanted(0);
  hud.setObjective('SOLMARIS', 'Press ENTER or NEW GAME to start Mission 1.');
  announce('Solmaris. Press Enter or New Game to start.');
  requestAnimationFrame(frame);
}

// Debug / automation handle (used by the local play-test): the live game
// state, read-only for inspection from the console.
window.__solmaris = { game, missionMgr, heli, policeFleet, world };
