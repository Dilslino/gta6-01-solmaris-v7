// HUD: cash, health, wanted stars, objective, speed, minimap, toasts,
// the searchlight meter and the title / pause / busted / wasted screens.
import { WORLD } from './config.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    cash: $('cash'), healthfill: $('healthfill'), stars: $('stars'),
    objTitle: $('objTitle'), objText: $('objText'), toast: $('toast'),
    speedNum: $('speedNum'), speedUnit: $('speedUnit'), center: $('center'),
    spot: $('spot'), spotfill: $('spotfill'), muteBtn: $('muteBtn'),
    minimap: $('minimap'), crosshair: $('crosshair'), clock: $('clock'),
    status: $('status'),
  };
  const mm = el.minimap.getContext('2d');
  let toastTimer = 0;

  function drawMinimap(state) {
    const W = 190; const H = 190; const half = WORLD.half + 20;
    const sx = (x) => (x + half) / (half * 2) * W;
    const sy = (z) => (z + half) / (half * 2) * H;
    mm.fillStyle = '#0d2b45'; mm.fillRect(0, 0, W, H);
    // Sea + sand.
    mm.fillStyle = '#14425e'; mm.fillRect(0, 0, W, H);
    mm.fillStyle = '#3d7a4a'; mm.fillRect(sx(-WORLD.half), sy(-WORLD.half), (WORLD.size / (half * 2)) * W, (WORLD.size / (half * 2)) * H);
    mm.fillStyle = '#e8c98a'; mm.fillRect(sx(-WORLD.half), sy(-WORLD.half), 14, H);
    // Roads.
    mm.strokeStyle = '#2e2e38'; mm.lineWidth = 4;
    for (let i = -3; i <= 3; i += 1) {
      const c = i * 70;
      mm.beginPath(); mm.moveTo(sx(-WORLD.half), sy(c)); mm.lineTo(sx(WORLD.half), sy(c)); mm.stroke();
      mm.beginPath(); mm.moveTo(sx(c), sy(-WORLD.half)); mm.lineTo(sx(c), sy(WORLD.half)); mm.stroke();
    }
    // Harbor.
    mm.fillStyle = '#6e4f2a'; mm.fillRect(sx(150), sy(190), 60, 34);
    // Mission marker.
    if (state.missionTarget) {
      mm.fillStyle = '#ffd166';
      mm.beginPath(); mm.arc(sx(state.missionTarget.x), sy(state.missionTarget.z), 6, 0, Math.PI * 2); mm.fill();
      mm.strokeStyle = '#ffd166'; mm.lineWidth = 2;
      mm.beginPath(); mm.arc(sx(state.missionTarget.x), sy(state.missionTarget.z), 10, 0, Math.PI * 2); mm.stroke();
    }
    // Traffic.
    mm.fillStyle = '#cfd8ff';
    for (const c of state.traffic) { mm.fillRect(sx(c.x) - 1.5, sy(c.z) - 1.5, 3, 3); }
    // Police.
    mm.fillStyle = '#ff4d4d';
    for (const c of state.police) { mm.beginPath(); mm.arc(sx(c.x), sy(c.z), 3.5, 0, Math.PI * 2); mm.fill(); }
    // Heli.
    if (state.heli) { mm.fillStyle = '#ffe14d'; mm.beginPath(); mm.arc(sx(state.heli.x), sy(state.heli.z), 4, 0, Math.PI * 2); mm.fill(); }
    // Player arrow.
    const px = sx(state.player.x); const py = sy(state.player.z);
    mm.save();
    mm.translate(px, py); mm.rotate(Math.PI - state.player.heading);
    mm.fillStyle = '#7dff9b';
    mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
    mm.restore();
    // North tick.
    mm.fillStyle = '#fff'; mm.font = 'bold 11px system-ui'; mm.fillText('N', 4, 12);
  }

  return {
    setCash(v) { el.cash.textContent = `$${Math.round(v)}`; },
    setHealth(v) { el.healthfill.style.width = `${Math.max(0, Math.min(100, v))}%`; },
    setWanted(n) {
      el.stars.textContent = '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
      el.stars.style.color = n >= 3 ? '#ff5b5b' : '#ffd166';
    },
    setObjective(title, text) { el.objTitle.textContent = title; el.objText.textContent = text; },
    setSpeed(kmh, inCar) {
      el.speedNum.textContent = String(Math.round(kmh));
      el.speedUnit.textContent = inCar ? 'km/h · DRIVING' : 'km/h · ON FOOT';
    },
    setSpot(on, frac) {
      el.spot.style.display = on ? 'block' : 'none';
      el.spotfill.style.width = `${Math.round(frac * 100)}%`;
    },
    setMute(muted) { el.muteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; },
    setCrosshair(on) { el.crosshair.style.display = on ? 'block' : 'none'; },
    setClock(minutes) {
      const h = 18 + Math.floor(minutes / 60);
      const m = Math.floor(minutes % 60);
      el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    toast(msg, seconds = 3) {
      el.toast.textContent = msg;
      toastTimer = seconds;
    },
    tickToast(dt) {
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.textContent = ''; }
    },
    announce(msg) { el.status.textContent = msg; },
    drawMinimap,
    showTitle(hasSave, bestCash) {
      el.center.innerHTML = `
        <h1>SOLMARIS</h1>
        <h2>An open-world sunset city — drive, steal, run missions, outrun the law.</h2>
        <div class="sub">Six missions from Marina Cafe to the harbor. Steal any car with E.
        Wanted stars bring the police — at 3 stars the helicopter searchlight hunts you.
        Break its beam in the garage, the underpass or the plaza alley. All original:
        no Rockstar names, art or audio.</div>
        <div style="margin-top:14px">
          <button id="btnNew">NEW GAME</button>
          ${hasSave ? '<button id="btnContinue">CONTINUE</button>' : ''}
          <button id="btnHow" class="ghost">HOW TO PLAY</button>
        </div>
        <div class="sub" style="margin-top:10px">Best cash banked: $${bestCash} &middot; WASD move &middot; E enter car &middot; F punch &middot; Click shoot &middot; R save &middot; M mute</div>`;
      document.getElementById('btnNew').onclick = () => this._cb && this._cb('new');
      const bc = document.getElementById('btnContinue');
      if (bc) bc.onclick = () => this._cb && this._cb('continue');
      document.getElementById('btnHow').onclick = () => this._cb && this._cb('how');
    },
    showHow() {
      el.center.innerHTML = `
        <h1 style="font-size:40px">HOW TO PLAY</h1>
        <div class="sub" style="text-align:left; max-width:560px">
        <b>WASD / arrows</b> — walk or drive &nbsp;·&nbsp; <b>Shift</b> run &nbsp;·&nbsp; <b>Space</b> jump / handbrake<br>
        <b>E</b> — enter or steal a car, pick up / deliver &nbsp;·&nbsp; <b>F</b> — punch &nbsp;·&nbsp; <b>Click</b> — shoot<br>
        <b>R</b> — save &nbsp;·&nbsp; <b>M</b> — mute &nbsp;·&nbsp; <b>P / Esc</b> — pause &nbsp;·&nbsp; drag mouse — camera<br><br>
        Follow the gold beacon to the mission. Missions pay cash; the minimap shows
        traffic (white), police (red) and the helicopter (yellow). Stealing cars and
        hurting people raises your wanted level. BUSTED costs $200, WASTED costs $100 —
        Continue restores your last checkpoint exactly.</div>
        <div style="margin-top:14px"><button id="btnBack">BACK</button></div>`;
      document.getElementById('btnBack').onclick = () => this._cb && this._cb('back');
    },
    showPause() {
      el.center.innerHTML = `
        <h1 style="font-size:44px">PAUSED</h1>
        <div class="sub">The city waits for you.</div>
        <div style="margin-top:14px">
          <button id="btnResume">RESUME</button>
          <button id="btnSave" class="ghost">SAVE GAME</button>
          <button id="btnQuit" class="ghost">QUIT TO TITLE</button>
        </div>`;
      document.getElementById('btnResume').onclick = () => this._cb && this._cb('resume');
      document.getElementById('btnSave').onclick = () => this._cb && this._cb('save');
      document.getElementById('btnQuit').onclick = () => this._cb && this._cb('quit');
    },
    showOver(kind, penalty, cash) {
      const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
      const cls = kind === 'busted' ? 'busted' : 'wasted';
      el.center.innerHTML = `
        <p id="bigmsg" class="${cls}">${title}</p>
        <div class="sub" style="font-size:17px">You lost $${penalty}. Cash now $${cash}.</div>
        <div style="margin-top:16px"><button id="btnCont">CONTINUE</button>
        <button id="btnTitle2" class="ghost">TITLE SCREEN</button></div>
        <div class="sub">Continue restores your last checkpoint — same mission, same progress.</div>`;
      document.getElementById('btnCont').onclick = () => this._cb && this._cb('continue');
      document.getElementById('btnTitle2').onclick = () => this._cb && this._cb('title');
    },
    showComplete() {
      el.center.innerHTML = `
        <h1 style="font-size:44px">SOLMARIS COMPLETE</h1>
        <h2>All six missions done. The city is yours — free roam continues.</h2>
        <div style="margin-top:14px"><button id="btnFree">KEEP DRIVING</button></div>`;
      document.getElementById('btnFree').onclick = () => this._cb && this._cb('free');
    },
    clearCenter() { el.center.innerHTML = ''; },
    onAction(cb) { this._cb = cb; },
  };
}
