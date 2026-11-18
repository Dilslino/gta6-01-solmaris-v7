// Save / load. A checkpoint snapshot holds everything needed to restore the
// game exactly: cash, health, mission index + stage + timer, player position
// and heading, whether the player is in a car (and which car), and wanted.
// Continue after BUSTED / WASTED loads the snapshot with the penalty already
// applied, so the run resumes precisely where the checkpoint was taken.
import { SAVE_KEY, BEST_KEY } from './config.js';

export function saveGame(snapshot) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
    return true;
  } catch { return false; }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.cash !== 'number' || typeof s.x !== 'number') return null;
    return s;
  } catch { return null; }
}

export function hasSave() { return loadSave() !== null; }

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function readBestCash() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

export function writeBestCash(v) {
  try { window.localStorage.setItem(BEST_KEY, String(Math.round(v))); } catch { /* ignore */ }
}
