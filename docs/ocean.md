# The world ocean (4.0 "A World of Your Own")

Three new modules, no edits to existing files. Preview: `tools/ocean-preview.html?seed=SALT-RAVEN-4821`
(drag to pan, wheel/pinch to zoom, tap an island for its data, shift-click to reveal fog,
`&fog=0` starts fully revealed, `&x=&y=&z=` start camera, `?sheet=1` shows all sigils and allegiance rings).

## Units and coordinates
- World units; the home island centre is (0,0); +x east, +y south (screen order).
- Chunks are `CHUNK = 512` units, centred on multiples of 512: chunk (cx,cy) covers
  `[cx*512-256, cx*512+256)`. `chunkOf(v) = floor((v+256)/512)`. Chunk (0,0) holds only the home island.
- Every island lies fully inside its chunk with at least `GAP/2 = 60` units to the chunk border, so islands
  are always >= `GAP = 120` apart, across chunk borders too. No island edge comes within 450 of (0,0).
- Fog cells are `FOG_CELL = 64` units, `gx = floor(x/64)`.
- Renderer camera: `cam = { x, y, z }`: (x,y) = world point at the canvas top-left, z = device px per world unit.

## src/ocean.js (pure data, no DOM)
- `wordsFromSeed(n) -> "SALT-RAVEN-4821"`; `parseSeedWords(str) -> int | null` (exact, any case, any separators);
  `seedFromWords(str) -> int` (exact for valid words; any other text hashes to a stable seed);
  `normalizeSeedWords(str)`, `randomSeedWords()`, `SEED_SPACE = 40,960,000`.
  Encoding: `seed = (word1 * 64 + word2) * 10000 + number`, so the words ARE the seed and round-trip exactly.
  Seeds outside the space are taken modulo `SEED_SPACE` by `wordsFromSeed`.
- `ringOf(x, y) -> { index, name, level, color, r0, r1 }`, `ringInfo(index)`, `ringIndexAtDist(d)`, `levelAtDist(d)`.
  Rings: 0 Home Waters (<900, Lv 1-3), 1 The Wild Sea (<2200, Lv 4-8), 2 The Deep (<4000, Lv 9-15),
  3 The Far Reaches (<6500, Lv 16-24), then "The Uncharted I, II, ..." every 3000 units; beyond 6500 the
  level is `25 + floor((d - 6500) / 260)`.
- `class Ocean(seedInt)`: `.seed`, `.words`, `.home`,
  `chunk(cx, cy) -> { cx, cy, islands }` (cached, deterministic, 0-3 islands + a landmark if the chunk holds one),
  `islandsIn(x0, y0, x1, y1)`, `islandAt(x, y, slack = 0)`, `islandById(id)`, `landmarkIslands()`,
  `storyIsland(chapter)`, `abyssIsland()`, `ringOf(x, y)`.
- `makeShape(seed, r)`, `shapeLand(shape, x, y)`, `shapeHigh(shape, x, y)`.
- `class Fog(saved?)`: `reveal(x, y, radius) -> changed`, `isRevealed(x, y)`, `isCellRevealed(gx, gy)`,
  `serialize()`, `.version` (bumps on every change; the renderer caches on it).

### Island object
```
{ id: "cx,cy,i" | "home", x, y, r,            // world units, r 40-110 (home 120)
  kind: 'home'|'kingdom'|'lair'|'ruins'|'port'|'wild'|'abyss'|'story',
  name, level, ring, seed,                      // seed: int to generate its playable island later
  shape: { n, rows: [n bitmasks], high: [n bitmasks] },  // n = 7..12 cells across, cell = 2r/n units,
                                                // grid centred on (x,y); high = elevated plateau
  region: 'goblin'|'gnome'|'badlands'|'reef'|'crypt'|null,   // lairs, ruins, story, abyss ('crypt')
  boss: bool,                                   // lairs only (~18%, +1 level)
  kingdom: null | { id: "k"+island id, name: "House Thornwick", realm: "the Marches of Saltholm",
                    seat, color: 'blue'|'red'|'yellow'|'purple'|'black', temper: 'warlike'|'greedy'|'cautious'|'pious',
                    sigil: { field, charge, chargeColor, division }, ruler, motto, level },
  chapter?: 1..8 (story), starter?: true (the guaranteed early lairs and port) }
```
For kingdoms `name === kingdom.seat`.

### Landmarks (deterministic per seed, placed first in their chunk)
- 2 starter lairs (goblin or gnome) and 1 starter port at 560-820 from home (always within 900).
- Story chapters 1-8 at distances 640-860, 1000-1450, 1450-2050, 1700-2100, 2350-3100, 3000-3850,
  3400-3900, 4400-6000 (chapter 1 in ring 0, 2-4 ring 1, 5-7 ring 2, 8 ring 3).
- The Abyss: one island in ring 1 (1250-2050).

### Kind frequencies
Per ring (chunk centre): ring 0 lair 46 / wild 36 / port 6 / ruins 4 / kingdom 8 (kingdoms only beyond 700);
ring 1 40/25/kingdom 23/4/4; ring 2+ about lair 40, kingdom 27, wild 21, ruins 5-6, port 3.
Regions follow REGIONS order by ring: ring 0 goblin/gnome, ring 1 up to badlands, ring 2 gnome-reef,
ring 3+ badlands-crypt.

## Fog save format
`fog.serialize() -> { v: 1, c: { "bx,by": "<11 base64 chars>" | "*" } }` where a block is 8x8 fog cells
(512x512 units, block = floor(gx/8)), one byte per row, bit x = cell revealed; "*" = all 64 revealed;
empty blocks are omitted. Restore with `new Fog(saved)`. About 17 bytes per explored chunk:
200 explored chunks = 3.3 KB JSON.

## src/heraldry.js
- `makeKingdom(rng, ring)` (rng from terrain.js `rng()`; pure).
- `drawSigil(ctx, sigil, x, y, size)`: heater shield `size` px tall centred on (x,y); cached per sigil+size.
  `sigilCanvas(sigil, size)` gives the cached canvas. Charges (`CHARGE_KEYS`): tower, crown, star, moon,
  fish, tree, sword, key, boar, wave, anchor, rose. Divisions: plain, per pale, per fess, chevron.
- `drawAllegiance(ctx, x, y, w, relation, t)`: ground ellipse w px wide centred at (x,y);
  enemy #ff5a4e (pulses with t), neutral #e8b93a, ally #6dbb5b, own #4a90c0 (faint). `RELATION_COLORS`.
- `TEAM_COLORS`, `TEMPERS`, `DIVISIONS`, `CHARGES` (8x8 patterns).

## src/worldmap.js
- `new WorldMapRenderer(ocean, SHEETS)`
- `draw(ctx, cam, fog, opts)`: fog may be null (all revealed). opts: `t` seconds, `dpr` (label/line scale,
  default 1), `relations(kingdomId) -> 'enemy'|'neutral'|'ally'` (default enemy),
  `marks: [{ x, y, kind: 'ship'|'target'|other }]` (other = red X), `selectedId`.
  Draws in device pixels with an identity transform; restores ctx state.
- `hitTest(cam, sx, sy, fog?) -> island | null` (sx,sy in canvas pixels; 14 px slack; fogged islands skipped if fog given).
- `release()` frees cached canvases; `stats` = { chunks, islands, renders }.
- An island counts as charted when its centre or a point 0.6r from it is revealed.
- Icons: home `b_Castle` + own ring; kingdom `b_Castle` / `b{color}_Castle` + sigil + allegiance ring;
  lair: region camp (`goblinHut`, `gnomeHut`, `cave`, `fishHut`, `deadTree`), boss lairs get a red skull badge;
  port `b_Market` (the yellow house) + neutral ring; ruins: the blue `b_Tower` desaturated with its top
  broken off (made at runtime) + rocks; abyss `av_skull` over a darkened island; story: canvas gold banner
  with the chapter number. Decor baked into island canvases: trees, bushes, rocks, stumps, bones, skull spikes.

## Assumptions
- Uses only sprite keys already in assets.js; nothing new needs registering.
- Islands are cached per (id, mip size 4/8/16/32 px per cell), LRU 160; sprites are pre-downscaled in
  power-of-two steps so every blit runs with smoothing off.
- The BoldPixels font must be loaded by the page (the game does this; the preview declares it).
