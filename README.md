# Tiny Realm

**Play now: [dianteclark.github.io/Tiny-Realm](https://dianteclark.github.io/Tiny-Realm/)**

A persistent kingdom builder that runs in the browser. Grow a village into a
citadel, send squads of named soldiers on dangerous expeditions (death is
permanent), hold the castle against monster raids, and survive great events
like the Troll Breakout.

## Play

**On your phone (GitHub Pages):** in this repo go to Settings > Pages, set
Source to "Deploy from a branch", pick `main` and `/ (root)`, and save. After a
minute the game is live at `https://dianteclark.github.io/Tiny-Realm/`. On
iPhone, use Share > Add to Home Screen for a full-screen app.

**Locally:** run any static server from the repo root, for example

```
python3 -m http.server 8000
```

then open http://localhost:8000.

Progress saves automatically in the browser. Settings (gear icon) has Export,
Import, and Wipe Realm to start over.

## How the game works

- **Workers**: pawns cut wood, mine gold, herd sheep for meat, and build or
  repair. While you're away they keep working at half pace until storage is
  full, so come back and spend.
- **Build**: houses (room for more people), barracks, archery range,
  monastery, watchtowers. Towers on high ground shoot farther.
- **Castle tiers**: Village, Town, Stronghold, Fortress, Citadel. Each tier
  raises storage, squad size and building limits, and unlocks soldiers. After
  Citadel, Renown ranks go on forever.
- **Army**: every soldier has a name, traits, levels and kills. Soldiers who
  die are gone for good and go into the Hall of the Fallen. The King is the
  exception: he is carried home wounded.
- **Raids**: monsters land by boat every 8 to 14 minutes of play, with a
  45-second warning. Pawns hide in the castle. If the castle falls, a quarter
  of your stores is plundered.
- **Voyage**: expeditions to an endless chain of islands across five regions
  (Goblin Shore, Gnome Woods, Gnoll Badlands, Shark Reef, Skull Crypts). Every
  fifth island has a boss guarding a relic. There's also a daily Bounty Isle
  with double loot.
- **Great events**: The Troll Breakout, The Shark Armada, The Night of Bones,
  The Hex Shaman's Curse (soldiers turned into sheep), The Minotaur's
  Challenge (pick a champion for a one-on-one duel). Each can award a relic.
- **Smaller events**: Gold Rush, a merchant boat, a wandering mercenary, a bee
  swarm in the forest, lambing season, and a rubber duck worth tapping.
- **Chronicle**: a chain of goals with rewards that keeps going after the
  scripted ones run out. There's also a daily tribute with a streak bonus.

Controls: drag to pan, pinch or scroll to zoom. Tap a soldier (or All), then
tap the ground to move or tap a foe to attack. Tap buildings to train and
upgrade.

## Project layout

- `index.html`, `style.css`: page shell and HUD styling
- `src/`: game code (plain ES modules, no build step)
  - `data.js`: units, enemies, buildings, tiers, regions, traits, relics, quests. All balance numbers live here.
  - `assets.js`: sprite manifest and loader
  - `terrain.js`: island generation, auto-tiling (per the Tiny Swords tilemap guide), stairs, pathfinding
  - `world.js`: units, buildings, camps, combat, AI, drawing
  - `game.js`: economy, saving, offline progress, raids, expeditions, quests
  - `events.js`: great and minor realm events
  - `ui.js`: HUD and panels
  - `main.js`: boot, loop, camera, touch input
- `assets/`: Tiny Swords art by Pixel Frog, BoldPixels font
- `tools/build_ui.py`: stitches the pack's UI pieces into 9-slice panels in `assets/ui/`
- `tools/terrain-preview.html`: renders a generated island (`?seed=N`) for checking terrain

## Credits

- Art: [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog (Free Pack, Enemy Pack, Warfare)
- Font: BoldPixels by YukiPixels, CC BY-SA 4.0 (see `assets/font/license.txt`)
