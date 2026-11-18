// Cars: mesh builder, arcade physics (with the smooth U-turn fix) and traffic AI.
import { CAR, WORLD } from './config.js';
import { pick, range } from './random.js';

const THREE = window.THREE;

export const CAR_COLORS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x4361ee, 0xf8f9fa, 0x7209b7, 0xffb703, 0x06d6a0];

export function buildCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a22 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.2),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0xe8e8e8 : 0x222831 }),
  );
  cabin.position.set(0, 1.08, -0.25); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w); wheels.push(w);
  }
  // Headlights + taillights.
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff6c9 }));
  hl.position.set(0, 0.62, 2.21); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  tl.position.set(0, 0.62, -2.21); g.add(tl);
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.45, -0.25); g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    bar2.position.set(0, 1.45, -0.25); bar2.position.x = 0.0; g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.86; g.add(stripe);
  }
  g.userData.wheels = wheels;
  return g;
}

export function createCar(color, x, z, heading, isPolice = false) {
  const mesh = buildCarMesh(color, isPolice);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    mesh, color, isPolice,
    x, z, heading, speed: 0, steer: 0,
    // Traffic AI state.
    ai: null, stuck: 0,
  };
}

// Arcade car step. `drive` in [-1,1] (W/S), `steerIn` in [-1,1] (A/D),
// handbrake sharpens the turn. Returns nothing; mutates the car.
// U-TURN FIX: pressing S at speed brakes to a stop and then reverses, the
// steering sign follows the direction of travel, and below 4 m/s the yaw
// authority is boosted 1.9x so a full-lock U-turn completes smoothly
// instead of pushing wide. The handbrake multiplies yaw 1.7x and bleeds speed.
export function stepCar(car, drive, steerIn, handbrake, dt, colliders) {
  const targetSteer = steerIn * CAR.steerMax;
  car.steer += (targetSteer - car.steer) * Math.min(1, CAR.steerSpeed * dt * 3);

  if (drive > 0) car.speed += CAR.accel * drive * dt;
  else if (drive < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt; // brake first
    else car.speed -= CAR.reverseAccel * dt; // then reverse
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.handbrakeDrag * 22 * dt);

  const spd = Math.abs(car.speed);
  // Arcade steering: the yaw follows the steering input in the same
  // direction whether the car is going forward or reversing, so holding
  // S + steer at full speed brakes, swings the nose around and keeps
  // rotating through the reverse — a smooth U-turn instead of the turn
  // unwinding itself the moment the car starts rolling backwards.
  let yawRate = (Math.abs(car.steer) / CAR.wheelBase) * spd * CAR.grip * 0.22;
  if (spd < CAR.lowSpeedBelow && spd > 0.05) yawRate *= CAR.lowSpeedBoost;
  if (handbrake && spd > 2) yawRate *= CAR.handbrakeYaw;
  car.heading += Math.sign(car.steer) * yawRate * dt;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  // Buildings stop cars: slide along the wall, lose a little speed.
  let blocked = false;
  for (const c of colliders) {
    if (Math.abs(nx - c.x) < c.hw + 1.1 && Math.abs(nz - c.z) < c.hd + 1.1) { blocked = true; break; }
  }
  if (blocked) {
    car.speed *= 0.55;
  } else {
    car.x = nx; car.z = nz;
  }
  const lim = WORLD.half + 12;
  car.x = Math.max(-lim, Math.min(lim, car.x));
  car.z = Math.max(-lim, Math.min(lim, car.z));
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.8;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  return car;
}

export function makeTraffic(rng, scene, colliders, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = Math.floor(range(rng, -3, 4)) * WORLD.roadGap;
    const along = range(rng, -240, 240);
    const x = axis === 'x' ? along : line;
    const z = axis === 'x' ? line : along;
    const heading = axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const car = createCar(pick(rng, CAR_COLORS), x, z, heading, false);
    car.ai = { axis, line, dir: heading, speed: range(rng, 9, 14), turnAt: range(rng, 60, 200) };
    scene.add(car.mesh);
    cars.push(car);
  }
  return cars;
}

// Traffic AI: cruise along a road line, turn at random intersections,
// slow down when another car is close ahead.
export function stepTraffic(car, dt, allCars, rng) {
  const ai = car.ai;
  if (!ai) return;
  let ahead = false;
  for (const o of allCars) {
    if (o === car) continue;
    const dx = o.x - car.x; const dz = o.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 9) {
      const fwd = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
      if (fwd > 0) { ahead = true; break; }
    }
  }
  const target = ahead ? 0 : ai.speed;
  car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 10 * dt);
  ai.turnAt -= Math.abs(car.speed) * dt;
  let steer = 0;
  if (ai.turnAt <= 0) {
    // At an intersection: 50% turn left/right onto the crossing road.
    if (rng() < 0.5) {
      const turn = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      car.heading += turn;
      ai.axis = ai.axis === 'x' ? 'z' : 'x';
      ai.line = ai.axis === 'x' ? car.z : car.x;
      ai.line = Math.round(ai.line / WORLD.roadGap) * WORLD.roadGap;
    }
    ai.turnAt = range(rng, 90, 260);
  }
  // Gentle steering to stay on the road line.
  const off = ai.axis === 'x' ? car.z - ai.line : car.x - ai.line;
  steer = Math.max(-0.4, Math.min(0.4, -off * 0.06));
  const spd = car.speed;
  car.heading += (steer / CAR.wheelBase) * spd * dt * 1.4;
  car.x += Math.sin(car.heading) * spd * dt;
  car.z += Math.cos(car.heading) * spd * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = spd * dt * 2.8;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
}
