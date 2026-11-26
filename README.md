# shooter

A dependency-free, client-side top-down shooter built with the HTML5 canvas.

## Run

Open `index.html` in a browser, or serve this folder with any static server, e.g.:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

There is no build step and no external libraries.

## Controls

- **WASD** (or arrow keys) — move
- **Mouse** — aim the crosshair
- **Left click / hold** — shoot
- **R** — restart after game over

## Structure

- `index.html` — fixed 960x540 canvas that scales to fit the window while keeping its 16:9 aspect ratio
- `game.js` — input handling, game loop, entities, collisions, and rendering

Game coordinates are always in the canvas's 960x540 internal resolution, so movement and drawing are independent of the displayed size.

## Current behaviour

The player is a blue circle; zombies spawn from all four edges and chase the player. Spawn rate, zombie speed, and zombie health increase over time. Points are scored per kill, and the player has five hearts. This is intentionally a small, hackable starting point — add new enemy types, weapons, and waves in `game.js`.
