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
- **Rival kingdoms**: four houses in the pack's other team colours (Ember,
  Sunhold, Duskmere, Ashgrave) raid you with full human armies. Conquer their
  capitals from the sea chart to make them vassals that pay tribute.
- **Walls and gates**: drag out fence lines; gates close when foes come near;
  raiders hack through walls when they cannot get around.
- **Hero abilities and formations**: every soldier type has an ability on a
  cooldown (Shield Wall, Volley, Charge, Blessing, Whirlwind, Bloodrage,
  Trample, Firestone, Rally); squads march Loose, Line, Wedge or Column.
- **Seasons, weather, day and night**: seasons follow the real calendar (winter is December to February), weather
  changes range and sight, nights glow with torchlight.
- **Hero gear**: weapons, armour and trinkets in four rarities drop from
  voyages, bosses, great events, raids and the Night Market. Gear comes home
  with a soldier who falls at home, and sinks with one who falls at sea.
- **Challenges**: a daily challenge with a twist and a bigger weekly one. A
  daily streak pays rare gear, an epic piece every third day and a legendary
  piece every seventh.
- **Villager needs**: Tavern, Market and Chapel (the pack's red and yellow
  buildings) keep people happy. Happy realms gather faster and attract
  newcomers. The Tavern hires a daily hero, the Market exchanges goods, the
  Chapel heals and blesses holy days.
- **The Drowned Crown**: an eight chapter story campaign along the bottom of
  the sea chart, ending with the Troll King.
- **Sieges**: rival capitals sit behind a palisade with a gate and corner
  towers. Break in to reach the castle.
- **Trade routes**: Market boats sail to Lantern Bay, your provinces and your
  vassals, and return with cargo. Pirates sometimes follow them home.
- **Promotions**: level 10 soldiers can be promoted (Warrior to Swordsman or
  Berserker, Lancer to Horseman, others to Elite) and grow to level 15.
- **The Abyss**: an endless descent of monster floors with a boss every fifth
  floor. After each floor, press on with your survivors or go home.
- **Royal decrees**: each week, pick one of three laws, each with a cost.
- **Seasonal events**: the Harvest Fair, the Long Night, the Turtle Tide and the
  Midsummer War follow the real seasons, with tasks, a weekly boss and a shop.
- **New Game+ (Legacy)**: from Stronghold, found a new realm. Legacy points
  give every future realm lasting bonuses, and one hero comes along.
- **Town planning**: move any building with its level and queue intact, drag
  buildings and wall lines into place, undo, decorations from the pack, and
  neighbourhood bonuses for placing things well.
- **Squads and districts**: named squads with banners and stances (Hold,
  Defend, Chase) guard the district around their banner; raid landings are
  marked and the right squads march to meet them; send a squad on a voyage in
  one tap.
- **Battle clarity**: red brackets on what your troops attack, dashed order
  lines, a pennant where they are headed, and a minimap.
- **Holy days and the moon**: Advent, Christmas, Epiphany, Palm Sunday, Good
  Friday, Easter, Ascension and Pentecost on the real calendar with verses;
  a full-moon Moonlit Hunt and a Night Market after dark.
- **Feats and tutorial**: 49 achievements, and a guided first session.

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
  - `env.js`: seasons, weather, day and night
  - `tutorial.js`: guided tutorial and Feats
  - `gear.js`, `challenges.js`, `needs.js`, `campaign.js`, `trade.js`: the 3.4 systems
  - `decrees.js`, `seasonal.js`, `legacy.js`: the 3.5 systems
  - `squads.js`, `minimap.js`: the 3.6 systems
  - `calendar.js`: holy days, festivals and moon phases
  - `orders.js`: Day and Night Orders
  - `audio.js`: synthesized sound effects and procedural music
  - `ui.js`: HUD and panels
  - `main.js`: boot, loop, camera, touch input
- `assets/`: Tiny Swords art by Pixel Frog, BoldPixels font
- `tools/build_ui.py`: stitches the pack's UI pieces into 9-slice panels in `assets/ui/`
- `tools/terrain-preview.html`: renders a generated island (`?seed=N`) for checking terrain

## Credits

- Art: [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog (Free Pack, Enemy Pack, Warfare)
- Font: BoldPixels by YukiPixels, CC BY-SA 4.0 (see `assets/font/license.txt`)
