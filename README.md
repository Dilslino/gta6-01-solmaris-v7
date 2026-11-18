# Solmaris — an open-world sunset city game

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v7/rank.svg)
![reward](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v7/reward.svg)

Built for the [gta6-01 bounty — Make GTA 6](https://make.fun/bounty/gta6-01?ref=5548afh3) on make.fun.

**Solmaris** is an original open-world crime game set in a coastal island city
at sunset. Everything — the city, the characters, the vehicles, the story, the
art and the sound — is original; no Rockstar names, logos, characters, maps or
assets are used anywhere.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request at runtime. Desktop browser, keyboard +
mouse. three.js r152 is vendored under `game/vendor/three.min.js`.

## What is in the game

- **A city on foot and by car** — a road grid of procedural buildings with lit
  windows, palms, a beach, a central plaza with a fountain, a parking garage,
  an underpass, a harbor with piers, crates, moored boats and a lighthouse.
- **Steal any car** — walk up to traffic or a parked car and press **E**.
  Stealing in sight of the police or a pedestrian raises your wanted level.
- **6 story missions** — Sunset Pickup (cash $250 → $550), Tail the Courier,
  Borrowed Wheels, Pier Run (on foot, no car needed), Harbor Cargo, and the
  Solmaris Finale against a helicopter searchlight.
- **Wanted system + police** — 5 stars, police cars that chase and ram, police
  who shoot on foot at 2+ stars, and a **helicopter at 3 stars whose
  searchlight tracks you**. Its SPOTTED meter fills in the open beam; break
  line of sight in the parking garage, the underpass or the plaza alley to
  lose it, or shoot the helicopter 5 times to drive it off.
- **Combat** — punch (**F**), jump (**Space**), aim and shoot (mouse click).
- **Economy** — missions pay cash; **BUSTED** costs $200 and **WASTED** costs
  $100. **Continue** restores your last checkpoint exactly: same mission,
  same stage, same position, same car.
- **Sound** — fully synthesized WebAudio: engine hum that follows speed,
  two-tone police siren, gunshots, pickups and mission jingles, plus sea
  ambience. **M** or the SOUND button mutes.
- **HUD with minimap** — cash, health, wanted stars, mission objective with
  timer, speedometer, and a live minimap (traffic white, police red,
  helicopter yellow, mission gold).
- **Start and save** — title screen with New Game / Continue, pause menu,
  manual save (**R**) and autosave checkpoints.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Shift | Run |
| Space | Jump (on foot) / handbrake (in car) |
| E | Enter / steal car, pick up / deliver |
| F | Punch |
| Mouse click | Shoot |
| Drag mouse | Orbit camera |
| R | Save game |
| M | Mute |
| P / Esc | Pause |

## Screenshots

1. Title screen over the plaza at sunset.
2. A wanted-level-3 police chase with the helicopter searchlight.
3. Mission 5 — Harbor Cargo at the harbor.
4. WASTED — and the Continue that restores the checkpoint.

## Tech notes

- `game/index.html` + `game/src/*.js` — the game, plain ES modules.
- `game/vendor/three.min.js` — three.js r152 (vendored, unmodified).
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/`
  to `/output` and writes `/output/dossier.json` with
  `vendor/makefun-game.ts`.
- `shots.json` — the four screenshot scenes (`?shot=start|play|mission|end`).

## License

MIT — see [LICENSE](LICENSE).
