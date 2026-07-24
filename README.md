# 🌆 LIBERTY DRIVE

A **GTA-style open-world sandbox game** that runs entirely in your browser. Steal
cars, tear through a living city, rack up a wanted level, outrun the cops, and pull
paid delivery jobs — all rendered in real-time 3D with **Three.js**.

No installs, no build step, no external downloads at runtime. Just open
`index.html` and play.

![Liberty Drive gameplay](docs/screenshot.png)

---

## ▶️ How to play

Open the game in a browser:

```bash
# from the project root, start any static server, e.g.:
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or simply double-click **`index.html`** (opening via a local server is recommended
so the browser doesn't restrict local file access).

Click **ENTER THE CITY**, then click the screen to lock the mouse and go.

### Controls

| On foot | | In a vehicle | |
|---|---|---|---|
| **WASD** | Move | **W / S** | Gas / Brake–Reverse |
| **Mouse** | Look around | **A / D** | Steer |
| **Shift** | Sprint | **Space** | Handbrake |
| **Space** | Jump | **F** | Exit vehicle |
| **F** | Enter / steal a vehicle | **Mouse** | Look around |
| **Left Click** | Punch / Shoot | | |
| **1 / 2** | Fists / Pistol | | |
| **M** | Pause / menu | **Esc** | Release mouse |

---

## 🎮 Features

- **Procedural open-world city** — a full road grid with intersections, sidewalks,
  parks, and hundreds of windowed skyscrapers, generated fresh each session.
- **Drive-anywhere vehicles** — sedans, sports cars, trucks and police cruisers,
  each with distinct arcade handling. Enter, exit, and **jack any car** on the street.
- **A living city** — AI traffic that follows the roads and brakes for you, plus
  crowds of pedestrians that wander, panic, and flee from gunfire.
- **Wanted system** — commit crimes to raise your ⭐ level (1–5). Cops chase on foot
  and in cruisers, open fire, and try to bust you. Lose them and the heat cools off.
- **Combat** — fists and a pistol with hitscan shooting, muzzle flashes, tracers,
  blood and spark effects, and exploding vehicles.
- **WASTED / BUSTED** — die or get arrested and respawn at the hospital/police
  station for a fee, GTA-style.
- **Missions & economy** — hit yellow markers for timed delivery jobs that pay cash.
- **Full HUD** — health & armor bars, wanted stars, money, weapon/ammo, an in-car
  speedometer, and a **live rotating minimap** showing roads, cars, cops and objectives.
- **Day/night cycle** — the sun arcs across the sky, dusk glows orange, and at night
  every window and street lamp lights up.
- **Synthesized audio** — engine, gunshots, punches, crashes, cash, and a police
  siren, all generated live with the Web Audio API (no sound files).

---

## 🧱 Tech & assets

- **Engine:** [Three.js](https://threejs.org/) r128 (MIT), vendored locally in
  `lib/three.min.js` so the game is fully self-contained and works offline.
- **Assets:** Everything you see and hear is **generated procedurally in code** —
  geometry (boxes/cylinders/icosahedrons), canvas-drawn window & lane-line textures,
  and Web Audio synthesis. This freely-recreates the GTA look and feel without
  shipping any copyrighted art, models, or audio.
- **No dependencies** beyond Three.js. Pure vanilla JavaScript.

### Project structure

```
index.html          Entry point, HUD markup, script loading
css/style.css       HUD, menus, and overlay styling
lib/three.min.js    Vendored Three.js (MIT)
js/
  utils.js          Math helpers, palettes
  input.js          Keyboard + pointer-lock mouse look
  audio.js          Web Audio synthesized SFX (engine, siren, guns…)
  world.js          City generation, road graph, collision, day/night
  player.js         Low-poly human factory + on-foot player & camera
  vehicles.js       Car factory, arcade physics, chase camera
  traffic.js        AI traffic + pedestrians
  weapons.js        Effects (fx) + fists/pistol combat
  police.js         Wanted level + cop AI (foot & cruisers)
  missions.js       Delivery job system + world markers
  hud.js            HUD updates + minimap rendering
  game.js           Renderer, main loop, state, crime/respawn logic
```

---

## ⚖️ A note on "GTA"

*Grand Theft Auto* is a trademark of Rockstar Games. This is an original,
independent homage inspired by the **genre** and mechanics of open-world crime
sandboxes. It ships **no assets from any GTA title** — all art and audio are
generated procedurally in this repository.

---

## 💡 Tips

- Steal a fast **sports car** and see how high you can push the speedometer.
- Fire your pistol in a crowd to instantly draw a wanted level, then try to escape.
- Kill a cop for extra ammo — but the heat spikes to 3 stars.
- Break line of sight and wait: your wanted level cools down over time.
- Chain delivery jobs for a steady income between the chaos.

Have fun out there. 🚗💨
