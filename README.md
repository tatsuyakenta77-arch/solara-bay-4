[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tatsuyakenta77-arch/solara-bay-4/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tatsuyakenta77-arch/solara-bay-4/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Meridian Heat

An original open-world crime game set in **Port Meridian** — a neon harbour city of grid streets, a marina, a central plaza and a skyline you can drive through. Built for the [make.fun **gta6-01** competition](https://make.fun/bounty/gta6-01) ("Make GTA 6").

You are **Jace Marlowe**, a driver pulled back for one last run by fixer **Mara Quinn**. Steal cars, outrun the Port Meridian PD, settle scores at the docks, and finish all six story missions to own the city.

## Features

- **Open world on foot and by car** — a full grid city with traffic, pedestrians, a marina with pier, boats and a lighthouse, plus a beach
- **Cars to steal and drive** — arcade handling, handbrake, damage smoke, carjacking from traffic, 8 parked cars including a starter coupe
- **Wanted level (1–5 stars)** — police cars spawn, chase, ram and try to bust you; break line of sight and the heat cools off
- **6 story missions** — First Gear, The Pickup, Hot Wheels, Dockside Trouble, The Getaway, Meridian Heat (finale vs Viper boss Rex Dalton)
- **Combat** — pistol shooting, melee punches, rival crew fights with a boss
- **HUD with minimap** — cash, health, ammo, speed, wanted stars, mission objective, live circular top-down map
- **Start screen, pause menu, save** — progress autosaves to localStorage, Continue resumes it
- **Sound** — fully synthesized WebAudio: engine hum, sirens, gunshots, pickup chimes, a bass loop (no audio files)
- **Effects** — crash sparks, exhaust smoke, muzzle flashes, explosions, low-health vignette
- **Keyboard + mouse** — WASD move/drive, E enter car, F punch, click shoot, Space jump/handbrake, Shift run, Esc pause, M mute

## How to run

```bash
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. No build step, no network — every file the game loads lives under `game/`.

## Tech

- Three.js (vendored as `game/vendor/three.module.min.js`)
- Plain static files under `game/` — ES modules, game logic in `game/src/main.js`, world building in `game/src/world.js`, mission data in `game/src/config.js`, synthesized sound in `game/src/audio.js`
- `main.ts` (Node 22 stdlib only) copies `game/` and `screenshots/` into the output directory and writes `dossier.json`

## License

MIT — see `LICENSE`.
