// Annexed land: new chunks of island that slam into the home coast.
//
// ---------------------------------------------------------------- API (on Realm)
//   realm.canAnnex(opts?)    -> true when a chunk can be added right now: the home map has a free
//                               slot and no slam is running. opts as for planAnnex.
//   realm.planAnnex(opts?)   -> preview or null. Nothing changes. The preview is
//                               { side, size, seed, region, x, y, w, h, cells, added, center:{x,y} },
//                               where x,y,w,h is the chunk rect in tiles, cells is how many new land
//                               tiles fall inside it, added counts all new land including the seam
//                               fill, and center is the rect centre in world pixels.
//   realm.annex(opts?)       -> the stored record, or null if there is no room. Plays the slam
//                               (about 2.8 s) and then merges the land. opts.instant merges at
//                               once with no animation. opts.onDone(rec) runs after the merge.
//   realm.debugAnnex(opts?)  -> annex() with a random side and seed (for testing from the console).
//   opts: { side: 'N'|'E'|'S'|'W'|'NE'|'SE'|'SW'|'NW'|'auto', size: 1|2|3 (12x9, 16x12, 20x14),
//           seed, region (free-form label, e.g. the conquered island's region key), plan (a preview
//           from planAnnex(), to annex exactly that slot) }
//   While the player is away on an expedition, annex() (without opts.instant) is queued in
//   state.annexPending and slams in once the home island is on screen again; it returns { pending: true }.
//   realm.slam               -> the running slam, or null. While it runs, canPlace() refuses and
//                               annex() returns null.
//   realm.cameraTarget       -> {x, y, z} world point/zoom that main.js glides the camera to (or null).
//
// ---------------------------------------------------------------- state
//   state.annexed = [{ id, seed, side, size, region, x, y, w, h, at }] in merge order. The home map
//   is rebuilt as: starting island (from state.seed) embedded in the middle of the sea, then
//   mergeAnnex() for each record in order. That rebuild is deterministic, so a reload matches the
//   live merge. state.trees entries carry cx,cy, so tree state is matched by position, and the tree
//   layout (realm.homeTreeSpots) depends only on terrain + buildings, so live and reload agree.
//   state.annexPending = [opts] waiting for the player to come home (see above).
//
// Testing: auditMap(map, start) in terrain.js lists broken tilemap rules (empty = all good), e.g.
//   import('/src/terrain.js').then(T => T.auditMap(realm.home.map, [47, 34]))
//   tools/terrain-preview.html?seed=5&annex=10 renders a home sea with 10 annexes.
//
// Integration: call realm.annex({ region, size }) when an island is conquered (and check
// canAnnex() first, if the reward should depend on it).
import {
  T, rng, hashStr, reachable, boatSpots, foamCells, generateIsland, embedMap, cloneMap, copyTerrain,
  mergeAnnex, annexSlot, renderTerrainRect, TerrainMap, ANNEX_SIDES, ANNEX_DIRS, K_LOW, K_WATER,
} from './terrain.js';

export const ANNEX_SIZES = { 1: [12, 9], 2: [16, 12], 3: [20, 14] };
const center = c => c * T + T / 2;
const cellOf = v => Math.floor(v / T);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Slam timeline (seconds): camera pans, the chunk slides in, impact, settle
const PAN = 0.45, SLIDE = 1.55, AFTER = 0.85, TRAVEL = 18; // TRAVEL in tiles

// ---------------------------------------------------------------- home map
// cfg: { w, h, baseW, baseH, ox, oy, castle:{x,y,w,h} } (world coordinates; the base island is
// generated at baseW x baseH and placed at ox,oy). Returns { map, parts:[{ rec, cells }] }.
export function buildHomeMap(cfg, seed, annexed = []) {
  const C = cfg.castle;
  const base = generateIsland({
    w: cfg.baseW, h: cfg.baseH, seed, plateaus: 6, highs: 2, colors: [1, 3, 2], landFrac: 0.6,
    reserve: { x: C.x - cfg.ox - 1, y: C.y - cfg.oy - 1, w: C.w + 2, h: C.h + 4 },
  });
  const map = embedMap(base, cfg.w, cfg.h, cfg.ox, cfg.oy);
  const parts = [];
  for (const rec of annexed) { const res = mergeAnnex(map, rec, castleCell(cfg)); parts.push({ rec, cells: res.cells }); }
  map.computeKinds();
  return { map, parts };
}
export const castleCell = cfg => [cfg.castle.x + (cfg.castle.w >> 1), cfg.castle.y + (cfg.castle.h >> 1)];

// ---------------------------------------------------------------- resource helpers
// A cell where a tree / gold stone may stand. blocks=false ignores units/buildings (stable layouts).
export function freeCell(map, x, y, pad = 0, blocks = true) {
  for (let oy = -pad; oy <= pad; oy++) for (let ox = -pad; ox <= pad; ox++) {
    const k = map.kindAt(x + ox, y + oy);
    if (k === K_WATER || (blocks && map.block[map.i(x + ox, y + oy)]) || map.stairAt(x + ox, y + oy)) return false;
  }
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (map.stairAt(x + ox, y + oy)) return false;
  return map.ground(x, y) && !map.isCliff(x, y + 1);
}
// Forests: pick up to n centres with pickCentre(), grow perForest() trees around each.
export function forestSpots(map, r, n, pickCentre, perForest, ok) {
  const spots = [], forests = [], taken = new Set();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 50; k++) {
      const c = pickCentre(); if (!c) continue;
      const [fx, fy] = c;
      if (map.isLand(fx, fy) && forests.every(f => dist(f[0], f[1], fx, fy) > 8)) { forests.push([fx, fy]); break; }
    }
  }
  for (const [fx, fy] of forests) {
    const n = perForest(); let got = 0;
    for (let k = 0; k < n * 4 && got < n; k++) {
      const x = fx + r.int(-3, 3), y = fy + r.int(-3, 3);
      if (!taken.has(x + ',' + y) && freeCell(map, x, y, 0, false) && (!ok || ok(x, y))) { taken.add(x + ',' + y); spots.push({ x, y, f: fx }); got++; }
    }
  }
  return spots;
}
// Drop trees / stones (in place, spots [{x,y}]) that would seal walkable ground off from the door. Blocks stay as on entry.
export function unsealTrees(map, door, spots) {
  for (const t of spots) map.block[map.i(t.x, t.y)]++;
  for (let pass = 0; pass < 4; pass++) {
    const re = reachable(map, door[0], door[1]);
    const sealed = (x, y) => map.walkable(x, y) && !re[map.i(x, y)];
    const keep = []; let removed = 0;
    for (const t of spots) {
      let bad = false;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (sealed(t.x + ox, t.y + oy)) bad = true;
      if (bad) { map.block[map.i(t.x, t.y)]--; removed++; } else keep.push(t);
    }
    spots.length = 0; spots.push(...keep);
    if (!removed) break;
  }
  for (const t of spots) map.block[map.i(t.x, t.y)]--;
  return spots;
}
// Scene-wide: remove trees / gold stones next to ground that only they cut off from the door
// (ground that terrain or buildings leave unreachable, like decorative islets, is ignored).
// golds=false leaves gold stones alone (on load: saved stones stay where the player had them).
export function unsealScene(h, door, golds = true) {
  const m = h.map, blk = m.block;
  // "open": reachable with only buildings standing (pockets walled in by buildings are not the trees' fault)
  m.block = new Uint16Array(blk.length);
  for (const b of h.buildings) for (const [x, y] of b.cells()) if (m.in(x, y)) m.block[m.i(x, y)]++;
  const open = reachable(m, door[0], door[1]); m.block = blk;
  for (let pass = 0; pass < 10; pass++) {
    const re = reachable(m, door[0], door[1]);
    const sealed = (x, y) => m.in(x, y) && m.walkable(x, y) && open[m.i(x, y)] && !re[m.i(x, y)];
    const near = o => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (sealed(o.cx + ox, o.cy + oy)) return true; return false; };
    // stones first, then trees: a reload (stones from the save, trees regenerated) then ends the same
    let bad = golds ? h.golds.filter(near) : [];
    if (!bad.length) bad = h.trees.filter(near);
    if (!bad.length) return;
    for (const o of bad) { h.trees = h.trees.filter(t => t !== o); h.golds = h.golds.filter(g => g !== o); h.placeBlock([[o.cx, o.cy]], -1); }
  }
}

// Trees, gold and a pasture for one annexed chunk. Trees and pasture ignore blocks so they come
// out the same on every rebuild; gold (saved with the game) avoids whatever stands there now.
export function annexTreeSpots(map, part) {
  const { rec, cells } = part;
  if (!cells.length) return [];
  const r = rng((rec.seed >>> 0) + 4242);
  const inside = new Set(cells.map(([x, y]) => x + ',' + y));
  const pick = () => r.pick(cells);
  return forestSpots(map, r, rec.size >= 3 ? 3 : rec.size >= 2 ? 2 : 1, pick, () => r.int(6, 10), (x, y) => inside.has(x + ',' + y));
}
export function annexPasture(map, part) {
  const r = rng((part.rec.seed >>> 0) + 777);
  const low = part.cells.filter(([x, y]) => map.kindAt(x, y) === K_LOW && freeCell(map, x, y, 1, false));
  return low.length ? r.pick(low) : null;
}
export function annexGoldSpots(map, part) {
  const r = rng((part.rec.seed >>> 0) + 9191), out = [];
  const want = (part.rec.size || 2) + (r.chance(0.4) ? 1 : 0);
  for (let k = 0; k < 200 && out.length < want && part.cells.length; k++) {
    const [x, y] = r.pick(part.cells);
    if (freeCell(map, x, y, 1, true) && !out.some(g => dist(g[0], g[1], x, y) < 2)) { out.push([x, y]); map.block[map.i(x, y)]++; }
  }
  for (const [x, y] of out) map.block[map.i(x, y)]--;
  return out;
}

// ---------------------------------------------------------------- planning
function homeStart(R) { return castleCell(R.homeCfg()); }

function sizesFor(opts) { return opts.size ? [Math.max(1, Math.min(3, opts.size | 0))] : [2, 1]; }

export function planAnnex(R, opts = {}) {
  if (!R.home || !R.state) return null;
  const S = R.state, m = R.home.map;
  const seed = (opts.seed ?? hashStr('annex:' + S.seed + ':' + (S.annexed || []).length)) >>> 0;
  const r = rng(seed);
  let sides = opts.side && opts.side !== 'auto' ? [opts.side] : ANNEX_SIDES.slice();
  if (sides.length > 1) for (let i = sides.length - 1; i > 0; i--) { const j = r.int(0, i); [sides[i], sides[j]] = [sides[j], sides[i]]; }
  const offs = [0, 3, -3, 6, -6, 9, -9, 12, -12].sort((a, b) => Math.abs(a) - Math.abs(b) || r() - 0.5);
  for (const size of sizesFor(opts)) {
    const [w, h] = ANNEX_SIZES[size];
    for (const side of sides) for (const off of offs) {
      const slot = annexSlot(m, side, w, h, off);
      if (!slot) continue;
      const rec = { seed, side, size, region: opts.region || 'wilds', ...slot };
      const res = mergeAnnex(cloneMap(m), rec, homeStart(R));
      if (res.cells.length < w * h * 0.35) continue;
      return { ...rec, cells: res.cells.length, added: res.added, center: { x: (slot.x + w / 2) * T, y: (slot.y + h / 2) * T } };
    }
  }
  return null;
}

export function canAnnex(R, opts = {}) {
  if (!R.home || R.slam) return false;
  for (const size of sizesFor(opts)) {
    const [w, h] = ANNEX_SIZES[size];
    for (const side of (opts.side && opts.side !== 'auto' ? [opts.side] : ANNEX_SIDES)) for (const off of [0, 3, -3, 6, -6, 9, -9]) if (annexSlot(R.home.map, side, w, h, off)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- annexing
export function annex(R, opts = {}) {
  if (!R.home || R.slam) return null;
  const S = R.state;
  if (!Array.isArray(S.annexed)) S.annexed = [];
  const plan = opts.plan || planAnnex(R, opts);
  if (!plan) return null;
  const id = S.annexed.reduce((a, o) => Math.max(a, o.id || 0), 0) + 1;
  const rec = { id, seed: plan.seed >>> 0, side: plan.side, size: plan.size, region: plan.region || opts.region || 'wilds', x: plan.x, y: plan.y, w: plan.w, h: plan.h, at: Date.now() };
  const merged = cloneMap(R.home.map);
  const res = mergeAnnex(merged, rec, homeStart(R));
  const job = { rec, merged, res, onDone: opts.onDone };
  if (opts.instant || R.scene !== R.home || typeof document === 'undefined') { commitAnnex(R, job); return rec; }
  startSlam(R, job);
  return rec;
}

// Swap the merged terrain in, re-render the touched chunks, fix up everything that caches map data.
function commitAnnex(R, job) {
  const S = R.state, h = R.home, m = h.map, { rec, merged, res } = job;
  S.annexed.push(rec);
  copyTerrain(m, merged);
  if (job.prepared && job.pending && !job.pending.length) h.terrain.adopt(job.prepared);
  else h.terrain.invalidate(res.box.x0, res.box.y0, res.box.x1, res.box.y1);
  h.foam = foamCells(m, rng(S.seed + 99 + S.annexed.length));
  keepEverythingAshore(R);
  // fresh resources on the new land
  const part = { rec, cells: res.cells };
  const door = R.door;
  // the whole tree layout is recomputed the way a reload builds it; standing trees keep their state
  R.annexParts = R.annexParts || [];
  R.annexParts.push(part);
  const want = R.homeTreeSpots ? R.homeTreeSpots(m, R.annexParts) : annexTreeSpots(m, part);
  const wantSet = new Set(want.map(t => t.x + ',' + t.y)), have = new Set(h.trees.map(t => t.cx + ',' + t.cy));
  for (const t of [...h.trees]) if (!wantSet.has(t.cx + ',' + t.cy)) { h.trees = h.trees.filter(o => o !== t); h.placeBlock([[t.cx, t.cy]], -1); }
  for (const t of want) if (!have.has(t.x + ',' + t.y) && m.block[m.i(t.x, t.y)] === 0) h.addTree(t.x, t.y, { v: 1 + ((t.x * 7 + t.y * 13) % 4) });
  const golds = annexGoldSpots(m, part).map(([x, y]) => ({ x, y }));
  unsealTrees(m, door, golds); // gold stones must not seal ground off either
  for (const { x, y } of golds) { h.addGold(x, y, { amount: 120 }); R.goldZones.push([x, y]); }
  const past = annexPasture(m, part);
  if (past) {
    R.pastures = R.pastures || [R.pasture];
    R.pastures.push(past);
    for (let i = 0; i < 3; i++) {
      const c = h.nearestWalkable(past[0] + i - 1, past[1], 3, (x, y) => m.kindAt(x, y) === K_LOW);
      if (c) { const s = h.addSheep(center(c[0]), center(c[1]) + 10); s.hx = center(past[0]); s.hy = center(past[1]); }
    }
  }
  unsealScene(h, door);
  for (const u of h.units) if (u.node && !h.trees.includes(u.node) && !h.golds.includes(u.node)) { if (R.releaseNode) R.releaseNode(u); u.task = null; u.working = false; }
  R.reach = reachable(m, door[0], door[1]);
  R.shore = boatSpots(m, R.reach);
  if (R.log) R.log(`New land joined the realm (${rec.side}).`);
  if (R.save) R.save();
  if (job.onDone) job.onDone(rec);
}

// After a merge nothing may stand in water or on a cliff (merges never remove old land or change
// its height, so that part is defensive), and nothing that floats may end up on the new land.
function keepEverythingAshore(R) {
  const h = R.home, m = h.map;
  for (const t of [...h.trees]) if (!m.ground(t.cx, t.cy) || m.stairAt(t.cx, t.cy)) { h.trees = h.trees.filter(o => o !== t); h.placeBlock([[t.cx, t.cy]], -1); }
  for (const g of [...h.golds]) if (!m.ground(g.cx, g.cy) || m.stairAt(g.cx, g.cy)) { h.golds = h.golds.filter(o => o !== g); h.placeBlock([[g.cx, g.cy]], -1); }
  for (const b of [...h.buildings]) {
    if (b.type === 'castle' || b.cells().every(([x, y]) => m.ground(x, y))) continue;
    h.removeBuilding(b);
    let spot = null;
    for (let rr = 0; rr < 18 && !spot; rr++) for (let dy = -rr; dy <= rr && !spot; dy++) for (let dx = -rr; dx <= rr && !spot; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === rr && R.canPlace(b.type, b.cx + dx, b.cy + dy)) spot = [b.cx + dx, b.cy + dy];
    }
    if (spot) { const nb = h.addBuilding(b.type, spot[0], spot[1], { hp: b.hp, maxHp: b.maxHp, buildEnd: b.buildEnd, buildTotal: b.buildTotal, variant: b.variant, queue: b.queue }); nb.level = b.level; nb.upEnd = b.upEnd; nb.upTotal = b.upTotal; }
  }
  for (const u of h.units) if (!u.flying && !m.walkable(cellOf(u.x), cellOf(u.y))) { const c = h.nearestWalkable(cellOf(u.x), cellOf(u.y)); if (c) { u.x = center(c[0]); u.y = center(c[1]) + 8; if (u.stop) u.stop(); } }
  // boats, landing spots and the rubber duck float in open water: move them off any new land
  const wet = (x, y) => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.isLand(x + ox, y + oy) || m.isCliff(x + ox, y + oy)) return false; return m.in(x, y); };
  const shore = boatSpots(m, R.reach || reachable(m, R.door[0], R.door[1]));
  const nearestSpot = (x, y) => shore.reduce((b, s) => (!b || dist(s.wx, s.wy, x, y) < dist(b.wx, b.wy, x, y) ? s : b), null);
  const plans = [R.raid, R.pendingRaid, R.events && R.events.pending && R.events.pending.plan].filter(Boolean);
  for (const P of plans) for (const sp of P.spawns || []) if (!sp.ground && !wet(sp.wx, sp.wy)) { const n = nearestSpot(sp.wx, sp.wy); if (n) Object.assign(sp, { wx: n.wx, wy: n.wy, lx: n.lx, ly: n.ly, dx: n.dx, dy: n.dy }); }
  for (const b of h.boats) {
    const off = b.key === 'seahorse' ? 30 : 46, wx = cellOf(b.x), wy = cellOf(b.y - off);
    if (!wet(wx, wy)) { const n = nearestSpot(wx, wy); if (n) { b.x = center(n.wx); b.y = center(n.wy) + off; b.flip = n.wx > n.lx; } }
  }
  if (h.duck && !wet(cellOf(h.duck.x), cellOf(h.duck.y - 20))) { const n = nearestSpot(cellOf(h.duck.x), cellOf(h.duck.y)); if (n) { h.duck.x = center(n.wx); h.duck.y = center(n.wy) + 20; } }
  for (const s of h.sheep) if (!m.walkable(cellOf(s.x), cellOf(s.y))) { const c = h.nearestWalkable(cellOf(s.x), cellOf(s.y)); if (c) { s.x = s.tx = center(c[0]); s.y = s.ty = center(c[1]) + 10; } }
}

// ---------------------------------------------------------------- the slam
function chunkSprite(merged, res, rec) {
  const P = 2, tm = new TerrainMap(rec.w + P * 2, rec.h + P * 2);
  tm.colors = merged.colors.slice();
  for (let y = 0; y < rec.h; y++) for (let x = 0; x < rec.w; x++) {
    const a = merged.i(rec.x + x, rec.y + y);
    if (!res.chunk[a]) continue;
    const b = tm.i(x + P, y + P);
    tm.land[b] = 1; tm.height[b] = merged.height[a];
    if (merged.stair[a]) { tm.stair[b] = merged.stair[a]; tm.stairSide[b] = merged.stairSide[a]; tm.stairLvl[b] = merged.stairLvl[a]; }
  }
  // stairs whose pieces got split off from their plateau are dropped
  for (let i = 0; i < tm.stair.length; i++) if (tm.stair[i] && !tm.land[i]) tm.stair[i] = 0;
  tm.computeKinds();
  return { cv: renderTerrainRect(tm, 0, 0, tm.w, tm.h), foam: foamCells(tm, rng(rec.seed + 3)), ox: (rec.x - P) * T, oy: (rec.y - P) * T, map: tm };
}

function startSlam(R, job) {
  const h = R.home, { rec, merged, res } = job;
  const spr = chunkSprite(merged, res, rec);
  const d = ANNEX_DIRS[rec.side] || [1, 0];
  const len = Math.hypot(d[0], d[1]);
  job.dir = [d[0] / len, d[1] / len];
  job.spr = spr;
  // re-render the merged chunks a little at a time while the land is on its way
  job.prepared = new Map();
  job.pending = h.terrain.keysFor(res.box.x0, res.box.y0, res.box.x1, res.box.y1);
  job.t = 0; job.impact = false; job.wake = 0; job.waves = []; job.riders = [];
  // seam: new land outside the chunk sprite, plus chunk land touching land outside the chunk
  const seam = [];
  const outside = (x, y) => merged.isLand(x, y) && !res.chunk[merged.i(x, y)];
  for (let y = res.box.y0; y <= res.box.y1; y++) for (let x = res.box.x0; x <= res.box.x1; x++) {
    const i = merged.i(x, y);
    if (!merged.land[i]) continue;
    if (!h.map.land[i] && !res.chunk[i]) seam.push([x, y]);
    else if (res.chunk[i] && (outside(x + 1, y) || outside(x - 1, y) || outside(x, y + 1) || outside(x, y - 1))) seam.push([x, y]);
  }
  job.seam = seam;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280, vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
  const z = Math.max(0.42, Math.min(1, vw / ((rec.w + 12) * T), vh / ((rec.h + 9) * T)));
  const cx = (rec.x + rec.w / 2 - job.dir[0] * 3) * T, cy = (rec.y + rec.h / 2 - job.dir[1] * 3) * T;
  R.cameraTarget = { x: cx, y: cy, z };
  R.slam = job;
  h.slam = { cv: spr.cv, foam: spr.foam, x: spr.ox + job.dir[0] * TRAVEL * T, y: spr.oy + job.dir[1] * TRAVEL * T };
  R.sfx('sail');
}

export function updateSlam(R, dt) {
  const job = R.slam; if (!job) return;
  const h = R.home, { rec, spr } = job;
  job.t += dt;
  // pre-render one merged chunk per frame
  if (job.pending.length && !job.impact) { const k = job.pending.shift(); job.prepared.set(k, h.terrain.build(k, job.merged)); }
  const t = job.t, p = Math.max(0, Math.min(1, (t - PAN) / SLIDE));
  if (!job.impact) {
    const e = 0.4 * p + 0.6 * p * p * p;            // keeps moving, then rushes in
    const left = (1 - e) * TRAVEL * T;
    const bob = Math.sin(t * 7.5) * 7 * (1 - p) + Math.sin(t * 3.1) * 3 * (1 - p);
    h.slam.x = spr.ox + job.dir[0] * left + (job.dir[1] ? Math.sin(t * 5) * 3 * (1 - p) : 0);
    h.slam.y = spr.oy + job.dir[1] * left + bob;
    // bow wave riding on the leading edge, wake left behind on the water
    for (const f of job.riders) { f.x = h.slam.x + f.ox; f.y = h.slam.y + f.oy; }
    job.wake -= dt;
    if (t > PAN && job.wake <= 0) {
      job.wake = 0.06 + Math.random() * 0.05;
      const [lx, ly] = pickEdge(spr.map, job.dir, 1);
      const f = { ox: center(lx) - job.dir[0] * 44, oy: center(ly) + 26 - job.dir[1] * 44 };
      f.x = h.slam.x + f.ox; f.y = h.slam.y + f.oy;
      job.riders.push(f); if (job.riders.length > 24) job.riders.shift();
      h.fxAt('splash', f.x, f.y, { scale: 0.55 + Math.random() * 0.5, follow: f });
      if (Math.random() < 0.6) { const [tx, ty] = pickEdge(spr.map, job.dir, -1); h.fxAt('splash', h.slam.x + center(tx) + job.dir[0] * 40, h.slam.y + center(ty) + 26 + job.dir[1] * 40, { scale: 0.5 + Math.random() * 0.4 }); }
    }
    if (p >= 1) impact(R, job);
  } else {
    while (job.waves.length && job.waves[0].at <= t) { const w = job.waves.shift(); h.fxAt(w.key, w.x, w.y, { scale: w.scale }); }
    if (t >= PAN + SLIDE + AFTER) { R.slam = null; R.cameraTarget = null; }
  }
}

// a random chunk-sprite cell on the leading side (facing the island, which=1) or the trailing side (which=-1)
function pickEdge(tm, dir, which) {
  const sx = Math.sign(Math.round(dir[0] * 10)) * which, sy = Math.sign(Math.round(dir[1] * 10)) * which, cells = [];
  for (let y = 0; y < tm.h; y++) for (let x = 0; x < tm.w; x++) {
    if (tm.isLand(x, y) && ((sx && !tm.isLand(x - sx, y)) || (sy && !tm.isLand(x, y - sy)))) cells.push([x, y]);
  }
  return cells.length ? cells[Math.floor(Math.random() * cells.length)] : [tm.w >> 1, tm.h >> 1];
}

function impact(R, job) {
  const h = R.home;
  job.impact = true;
  for (const f of h.fx) if (f.follow && job.riders.includes(f.follow)) f.follow = null;
  while (job.pending.length) { const k = job.pending.shift(); job.prepared.set(k, h.terrain.build(k, job.merged)); }
  h.slam = null;
  commitAnnex(R, job);
  R.shake(14); R.sfx('explosion'); R.sfx('thud');
  // a line of dust and spray along the seam, then two smaller waves
  const seam = job.seam.slice().sort((a, b) => (a[0] * job.dir[1] - a[1] * job.dir[0]) - (b[0] * job.dir[1] - b[1] * job.dir[0]));
  const n = Math.min(16, seam.length), m = h.map;
  for (let k = 0; k < n; k++) {
    const [x, y] = seam[Math.floor((k + 0.5) * seam.length / n)];
    const wx = center(x) + (Math.random() - 0.5) * 30, wy = center(y) + 20 + (Math.random() - 0.5) * 20;
    h.fxAt('dust2', wx, wy, { scale: 1.6 + Math.random() * 0.8 });
    let wet = false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy)) wet = true;
    if (wet || k % 3 === 0) h.fxAt('splash', wx + (Math.random() - 0.5) * 50, wy + 10, { scale: 1 + Math.random() * 0.4 });
    job.waves.push({ at: job.t + 0.12 + Math.random() * 0.1, key: 'dust2', x: wx + (Math.random() - 0.5) * 60, y: wy + (Math.random() - 0.5) * 30, scale: 1 + Math.random() * 0.5 });
  }
  // spray around the chunk's outer coast, as the sea sloshes back
  const coast = job.res.cells.filter(([x, y]) => !m.isLand(x + 1, y) || !m.isLand(x - 1, y) || !m.isLand(x, y + 1) || !m.isLand(x, y - 1));
  for (let k = 0; k < Math.min(10, coast.length); k++) {
    const [x, y] = coast[Math.floor(Math.random() * coast.length)];
    job.waves.push({ at: job.t + 0.2 + Math.random() * 0.35, key: 'splash', x: center(x), y: center(y) + 30, scale: 0.8 + Math.random() * 0.5 });
  }
  job.waves.sort((a, b) => a.at - b.at);
}

