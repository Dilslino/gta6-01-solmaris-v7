// Every tuning number for Solmaris in one place.
export const STEP = 1 / 60;
export const WORLD = { size: 560, half: 280, roadGap: 70, roadWidth: 14 };
export const SAVE_KEY = 'solmaris.save.v7';
export const MUTE_KEY = 'solmaris.muted.v7';
export const BEST_KEY = 'solmaris.best.v7';

export const PLAYER = {
  walkSpeed: 6, runSpeed: 10.5, accel: 40, jumpSpeed: 8.5, gravity: 24,
  radius: 0.7, height: 1.8, punchRange: 2.2, punchDamage: 34, shootDamage: 45,
};

export const CAR = {
  accel: 16, brake: 34, reverseAccel: 11, maxSpeed: 38, maxReverse: 13,
  steerMax: 0.55, steerSpeed: 3.2, grip: 2.6, wheelBase: 2.9,
  // U-turn fix: at low speed the yaw authority is boosted so a full-lock
  // turn completes instead of wallowing; Space (handbrake) sharpens it more.
  lowSpeedBoost: 1.9, lowSpeedBelow: 4, handbrakeYaw: 1.7, handbrakeDrag: 0.55,
};

export const POLICE = {
  maxCars: 5, chaseSpeed: 36, ramDamage: 12, shootRange: 26, bustDistance: 2.4,
  bustTime: 2.2, decaySeconds: 26, heliAtWanted: 3,
};

export const ECONOMY = { startCash: 250, bustedPenalty: 200, wastedPenalty: 100 };

export const MISSIONS = [
  { id: 1, name: 'Sunset Pickup', reward: 300, time: 300,
    brief: 'Pick up the parcel at Marina Cafe, then deliver it across town. Cash 250 goes to 550.' },
  { id: 2, name: 'Tail the Courier', reward: 350, time: 240,
    brief: 'Follow the courier van — stay 10 to 40 metres back until the drop is made.' },
  { id: 3, name: 'Borrowed Wheels', reward: 400, time: 240,
    brief: 'Steal the red coupe by the plaza, lose the heat, deliver it to the garage.' },
  { id: 4, name: 'Pier Run', reward: 250, time: 180,
    brief: 'On foot along the pier: carry the parcel to the lighthouse kiosk. No car needed.' },
  { id: 5, name: 'Harbor Cargo', reward: 500, time: 300,
    brief: 'Collect the crate at the harbor warehouse and deliver it north. Watch the patrols.' },
  { id: 6, name: 'Solmaris Finale', reward: 800, time: 360,
    brief: 'Grab the case, survive wanted level 3 and the searchlight, reach the hideout.' },
];

export const PALETTE = {
  skyTop: 0x2b1a5e, skyHorizon: 0xff7e3d, sun: 0xffb347, sea: 0x14425e,
  sand: 0xe8c98a, grass: 0x3d7a4a, road: 0x2e2e38, sidewalk: 0x8a8a92,
  buildingA: 0xffd9a0, buildingB: 0xc9a2ff, buildingC: 0x9fd8ff, buildingD: 0xff9fb0,
  roof: 0x3a2b4d, windowLit: 0xffd166, windowDark: 0x1c2440,
};
