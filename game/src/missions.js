// Six story missions for Solmaris. Each mission is a list of stages; a stage
// is an objective with a target point (and optional radius, timer and mode).
// Mission 4 is deliberately walkable: a 150 m pier stroll on foot with a
// generous 180 s timer — no car is required or even useful on the pier.
import { MISSIONS } from './config.js';

const THREE = window.THREE;

export const MISSION_SPOTS = {
  marinaCafe: { x: -205, z: -40, label: 'Marina Cafe' },
  dropoffNorth: { x: 0, z: -210, label: 'North Drop-off' },
  courierRoute: { x: 0, z: -140, label: 'Courier Van' },
  plazaCoupe: { x: 52, z: 18, label: 'Red Coupe' },
  garage: { x: 175, z: -105, label: 'Parking Garage' },
  pierStart: { x: 198, z: 205, label: 'Pier Entrance' },
  lighthouseKiosk: { x: 210, z: 268, label: 'Lighthouse Kiosk' },
  harborWarehouse: { x: 195, z: 215, label: 'Harbor Warehouse' },
  northWarehouse: { x: -35, z: -245, label: 'North Warehouse' },
  hideout: { x: 8, z: 9, label: 'Hideout (Plaza Alley)' },
  casePickup: { x: -140, z: 140, label: 'The Case' },
};

function stage(kind, target, text, extra = {}) {
  return { kind, target, text, ...extra };
}

export function missionStages(index) {
  const S = MISSION_SPOTS;
  switch (index) {
    case 0: return [
      stage('goto', S.marinaCafe, 'Go to Marina Cafe and pick up the parcel (E).', { radius: 4 }),
      stage('pickup', S.marinaCafe, 'Pick up the parcel (E).', { radius: 4 }),
      stage('goto', S.dropoffNorth, 'Deliver the parcel to the North Drop-off.', { radius: 6 }),
      stage('deliver', S.dropoffNorth, 'Deliver the parcel (E).', { radius: 6 }),
    ];
    case 1: return [
      stage('tail', S.courierRoute, 'Tail the courier van: stay 10–40 m back. Do not get spotted close.', { radius: 40, tailTime: 20 }),
      stage('pickup', S.courierRoute, 'The courier dropped the parcel — pick it up (E).', { radius: 4 }),
      stage('goto', S.garage, 'Deliver the parcel to the garage.', { radius: 6 }),
      stage('deliver', S.garage, 'Deliver the parcel (E).', { radius: 6 }),
    ];
    case 2: return [
      stage('steal', S.plazaCoupe, 'Steal the red coupe by the plaza (E near the car).', { radius: 5, car: 'coupe' }),
      stage('loseheat', S.plazaCoupe, 'Lose the heat: get wanted down to 0 stars.', { radius: 999 }),
      stage('goto', S.garage, 'Deliver the coupe to the garage.', { radius: 8, needCar: true }),
      stage('deliver', S.garage, 'Park in the garage (E).', { radius: 8, needCar: true }),
    ];
    case 3: return [
      stage('goto', S.pierStart, 'Walk to the pier entrance. On foot is fine — it is close.', { radius: 5 }),
      stage('pickup', S.pierStart, 'Take the parcel (E).', { radius: 4 }),
      stage('goto', S.lighthouseKiosk, 'Walk the pier to the Lighthouse Kiosk. No car needed.', { radius: 5 }),
      stage('deliver', S.lighthouseKiosk, 'Hand over the parcel (E).', { radius: 5 }),
    ];
    case 4: return [
      stage('goto', S.harborWarehouse, 'Go to the Harbor Warehouse and collect the crate.', { radius: 6 }),
      stage('pickup', S.harborWarehouse, 'Load the crate (E).', { radius: 6 }),
      stage('goto', S.northWarehouse, 'Deliver the crate to the North Warehouse. Avoid patrols.', { radius: 7 }),
      stage('deliver', S.northWarehouse, 'Unload the crate (E).', { radius: 7 }),
    ];
    case 5: return [
      stage('goto', S.casePickup, 'Pick up the case at the south block.', { radius: 4 }),
      stage('pickup', S.casePickup, 'Take the case (E). The heat is coming.', { radius: 4 }),
      stage('escape', S.hideout, 'WANTED 3 — break the searchlight in a cover zone, then reach the hideout.', { radius: 8 }),
      stage('deliver', S.hideout, 'Deliver the case (E).', { radius: 8 }),
    ];
    default: return [];
  }
}

export function createMissionManager(scene) {
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  const marker = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 4), markerMat);
  marker.rotation.x = Math.PI;
  marker.visible = false;
  scene.add(marker);
  return {
    scene, beacon, marker,
    index: 0, stage: 0, stages: [], timeLeft: 0, active: false,
    tailProgress: 0, carrying: false, completed: 0,
    start(index) {
      this.index = index;
      this.stages = missionStages(index);
      this.stage = 0;
      this.timeLeft = MISSIONS[index].time;
      this.active = true;
      this.tailProgress = 0;
      this.carrying = false;
      this.beacon.visible = true;
      this.marker.visible = true;
    },
    current() { return this.stages[this.stage] || null; },
    advance() {
      this.stage += 1;
      this.tailProgress = 0;
      if (this.stage >= this.stages.length) {
        this.active = false;
        this.beacon.visible = false;
        this.marker.visible = false;
        this.completed += 1;
        return true; // mission complete
      }
      return false;
    },
    fail() {
      this.active = false;
      this.beacon.visible = false;
      this.marker.visible = false;
    },
    update(dt, playerPos) {
      if (!this.active) return null;
      this.timeLeft -= dt;
      const st = this.current();
      if (!st) return null;
      const t = st.target;
      this.beacon.position.set(t.x, 30, t.z);
      this.marker.position.set(t.x, 8 + Math.sin(performance.now() / 300) * 0.8, t.z);
      this.marker.rotation.y += dt * 2;
      if (this.timeLeft <= 0) return 'timeout';
      return null;
    },
  };
}
