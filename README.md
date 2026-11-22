# Tiny Realm

A persistent kingdom builder that runs in the browser. Grow a village into a
citadel, send squads of named soldiers on dangerous expeditions (death is
permanent), hold the walls against monster raids, and survive major events
like the Troll Breakout.

## Play

Open `index.html` through any static web server, for example:

```
python3 -m http.server 8000
```

then visit http://localhost:8000. It also runs on GitHub Pages with no build
step. Progress saves automatically in the browser (localStorage). Settings has
Export, Import and Wipe Realm.

## Project layout

- `index.html`, `style.css` - page shell and HUD styling
- `src/` - game code (plain ES modules, no build step)
  - `data.js` - units, enemies, buildings, tiers, events, quests (all balance numbers live here)
  - `assets.js` - sprite manifest and loader
  - `terrain.js` - island generation, auto-tiling, pathing grid
  - `world.js` - entities, AI, combat
  - `game.js` - economy, saving, offline progress, raids, expeditions
  - `events.js` - major and minor realm events
  - `ui.js` - HUD and panels
  - `main.js` - boot, loop, input, camera
- `assets/` - Tiny Swords art by Pixel Frog, BoldPixels font
- `tools/build_ui.py` - stitches the pack's UI pieces into 9-slice panels in `assets/ui/`

## Credits

- Art: [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog (Free Pack, Enemy Pack, Warfare)
- Font: BoldPixels by YukiPixels, CC BY-SA 4.0 (see `assets/font/license.txt`)
