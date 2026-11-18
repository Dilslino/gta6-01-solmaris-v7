// Screenshot scenes. Each shot is the real game staged deterministically:
// an autopilot drives the car toward the mission waypoint for the play shot,
// the other shots place the player, police and helicopter directly and let
// the normal update code run, so every frame is what the game really looks
// like. main.js calls stageShotName() and paints twice, then sets
// window.__shotReady for the screenshot.
export function autopilotDrive(px, pz, heading, tx, tz) {
  const dx = tx - px; const dz = tz - pz;
  const targetHeading = Math.atan2(dx, dz);
  let dh = targetHeading - heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dh * 1.8));
  return { drive: 1, steer };
}

export const SHOT_NAMES = ['start', 'play', 'mission', 'end'];
