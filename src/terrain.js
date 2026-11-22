// Island generation, auto-tiling and terrain rendering, built on the rules
// of the Tiny Swords tilemap guide:
//  - Flat Ground is the lowest land next to the water (16-piece autotile).
//  - Elevated Ground uses the same 16 pieces for its grass top, plus a cliff
//    row under its bottom edge: pieces 17-20 when the cliff stands on ground,
//    21-24 when it drops into water.
//  - A land cliff always has a visible strip of ground under it; an upper
//    level's cliff always stands on the level below, never on another cliff.
//  - Stairs are 2 tiles tall beside a plateau's bottom edge. The plateau
//    tile next to the stair top and the cliff tile next to the stair bottom
//    are drawn as connected pieces.
//  - Layers: BG color, water foam, flat ground, then shadow + elevated ground
//    repeated for every level, each level in its own tileset colour.
import { SHEETS, drawSprite } from './assets.js';

export const T = 64;
export const MAX_LEVEL = 2;

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  return r;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Cell kinds used by pathing. K_LOW = ground at level 0, K_HIGH = ground at level 1+.
export const K_WATER = 0, K_LOW = 1, K_HIGH = 2, K_CLIFF = 3, K_STOP = 4, K_SBOT = 5;

export class TerrainMap {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.land = new Uint8Array(w * h);
    this.height = new Uint8Array(w * h);  // 0 flat, 1..MAX_LEVEL elevated
    this.stair = new Uint8Array(w * h);   // 0 none, 1 top, 2 bottom
    this.stairSide = new Int8Array(w * h); // +1 plateau to the right, -1 to the left
    this.stairLvl = new Uint8Array(w * h); // level the stair climbs up to
    this.block = new Uint16Array(w * h);
    this.kind = new Uint8Array(w * h);
    this.colors = [1, 3, 2];
    this.decor = [];
  }
  i(x, y) { return y * this.w + x; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isLand(x, y) { return this.in(x, y) && this.land[this.i(x, y)] === 1; }
  H(x, y) { return this.isLand(x, y) ? this.height[this.i(x, y)] : -1; } // -1 = water
  isHigh(x, y) { return this.H(x, y) >= 1; }
  stairAt(x, y) { return this.in(x, y) ? this.stair[this.i(x, y)] : 0; }
  // A cliff cell sits right under a plateau's bottom edge
  cliffLevel(x, y) {
    if (!this.in(x, y) || this.stairAt(x, y)) return 0;
    const up = this.H(x, y - 1);
    return up >= 1 && up > this.H(x, y) ? up : 0;
  }
  isCliff(x, y) { return this.cliffLevel(x, y) > 0; }
  computeKinds() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.i(x, y);
      let k = K_WATER;
      if (this.stair[i] === 1) k = K_STOP;
      else if (this.stair[i] === 2) k = K_SBOT;
      else if (this.isCliff(x, y)) k = K_CLIFF;
      else if (this.land[i]) k = this.height[i] ? K_HIGH : K_LOW;
      this.kind[i] = k;
    }
  }
  kindAt(x, y) { return this.in(x, y) ? this.kind[this.i(x, y)] : K_WATER; }
  walkable(x, y) {
    const k = this.kindAt(x, y);
    return k !== K_WATER && k !== K_CLIFF && this.block[this.i(x, y)] === 0;
  }
  ground(x, y) { const k = this.kindAt(x, y); return k !== K_WATER && k !== K_CLIFF; }
  level(x, y) {
    if (!this.in(x, y)) return 0;
    const k = this.kindAt(x, y), i = this.i(x, y);
    if (k === K_STOP) return this.stairLvl[i];
    if (k === K_SBOT) return this.stairLvl[i] - 1;
    return this.land[i] ? this.height[i] : 0;
  }
  canStep(ax, ay, bx, by) {
    if (!this.walkable(bx, by)) return false;
    const a = this.kindAt(ax, ay), b = this.kindAt(bx, by);
    const la = this.level(ax, ay), lb = this.level(bx, by);
    const grd = k => k === K_LOW || k === K_HIGH;
    const dx = bx - ax, dy = by - ay;
    if (dx !== 0 && dy !== 0) {
      if (!grd(a) || !grd(b) || la !== lb) return false;
      return this.walkable(ax + dx, ay) && this.walkable(ax, ay + dy) &&
        grd(this.kindAt(ax + dx, ay)) && grd(this.kindAt(ax, ay + dy)) &&
        this.level(ax + dx, ay) === la && this.level(ax, ay + dy) === la;
    }
    if (grd(a) && grd(b)) return la === lb;
    if ((a === K_STOP && grd(b)) || (b === K_STOP && grd(a))) return la === lb;
    if ((a === K_SBOT && grd(b)) || (b === K_SBOT && grd(a))) return la === lb;
    if ((a === K_STOP && b === K_SBOT) || (a === K_SBOT && b === K_STOP)) return dx === 0 && this.stairLvl[this.i(ax, ay)] === this.stairLvl[this.i(bx, by)];
    return false;
  }
}

// ---------- generation ----------

function components(m, pred) {
  const lab = new Int32Array(m.w * m.h).fill(-1);
  const comps = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = m.i(x, y);
    if (lab[i] >= 0 || !pred(x, y)) continue;
    const c = []; const st = [[x, y]]; lab[i] = comps.length;
    while (st.length) {
      const [cx, cy] = st.pop(); c.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!m.in(nx, ny)) continue;
        const ni = m.i(nx, ny);
        if (lab[ni] < 0 && pred(nx, ny)) { lab[ni] = comps.length; st.push([nx, ny]); }
      }
    }
    comps.push(c);
  }
  return comps;
}

// Chunky island made of overlapping rectangles, like the pack's sample maps.
function buildLand(m, r, opts) {
  const { w, h } = m, M = 3;
  const fill = (x0, y0, rw, rh, v = 1) => { for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) if (x >= M && y >= M && x < w - M && y < h - M) m.land[m.i(x, y)] = v; };
  const core = opts.reserve || { x: (w >> 1) - 4, y: (h >> 1) - 3, w: 8, h: 6 };
  fill(core.x - 3, core.y - 3, core.w + 6, core.h + 6);
  const target = Math.floor((w - 2 * M) * (h - 2 * M) * (opts.landFrac || 0.55));
  let area = () => m.land.reduce((a, v) => a + v, 0);
  for (let k = 0; k < 400 && area() < target; k++) {
    // anchor on an existing land cell near the edge of the island
    const rw = r.int(4, 11), rh = r.int(3, 8);
    let ax, ay;
    for (let t = 0; t < 30; t++) { ax = r.int(M, w - M - 1); ay = r.int(M, h - M - 1); if (m.land[m.i(ax, ay)]) break; }
    if (!m.land[m.i(ax, ay)]) continue;
    const x0 = ax - r.int(0, rw - 1) + r.int(-3, 3), y0 = ay - r.int(0, rh - 1) + r.int(-2, 2);
    fill(x0, y0, rw, rh);
  }
  // tidy: fill notches and one-wide channels, trim spurs and one-wide fingers
  for (let pass = 0; pass < 8; pass++) {
    let ch = false;
    for (let y = M; y < h - M; y++) for (let x = M; x < w - M; x++) {
      const i = m.i(x, y), L = m.isLand(x - 1, y), R = m.isLand(x + 1, y), U = m.isLand(x, y - 1), D = m.isLand(x, y + 1);
      const n = L + R + U + D;
      if (!m.land[i] && (n >= 3 || (L && R) || (U && D))) { m.land[i] = 1; ch = true; }
      else if (m.land[i] && n <= 1) { m.land[i] = 0; ch = true; }
    }
    if (!ch) break;
  }
  // keep one island, fill lakes
  const lands = components(m, (x, y) => m.isLand(x, y)).sort((a, b) => b.length - a.length);
  m.land.fill(0);
  for (const [x, y] of lands[0]) m.land[m.i(x, y)] = 1;
  for (const c of components(m, (x, y) => !m.isLand(x, y))) if (!c.some(([x, y]) => x === 0 || y === 0 || x === w - 1 || y === h - 1)) for (const [x, y] of c) m.land[m.i(x, y)] = 1;
  // a few decorative islets just off the coast
  const islets = [];
  for (let k = 0; k < 60 && islets.length < (opts.islets ?? 3); k++) {
    const iw = r.int(1, 2), ih = r.int(1, 2), x0 = r.int(1, w - 3), y0 = r.int(1, h - 3);
    let ok = true, near = false;
    for (let y = y0 - 2; y < y0 + ih + 2; y++) for (let x = x0 - 2; x < x0 + iw + 2; x++) if (m.isLand(x, y)) ok = false;
    for (let y = y0 - 4; y < y0 + ih + 4; y++) for (let x = x0 - 4; x < x0 + iw + 4; x++) if (m.isLand(x, y)) near = true;
    if (ok && near && x0 > 0 && y0 > 0 && x0 + iw < w - 1 && y0 + ih < h - 1) { islets.push([x0, y0, iw, ih]); for (let y = y0; y < y0 + ih; y++) for (let x = x0; x < x0 + iw; x++) m.land[m.i(x, y)] = 1; }
  }
}

// Is the plateau cell at (x,y) of level L sitting legally?
function plateauOk(m, x, y, L) {
  // grass edges (sides and top) must rest on the level below
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
    const hh = m.H(x + dx, y + dy);
    if (hh < L - 1) return false;
  }
  if (m.H(x, y + 1) >= L) return true; // not a bottom edge
  // bottom edge: the cliff below drops onto level L-1 with a strip of ground under it, or into water (level 1 only)
  const c = m.H(x, y + 1);
  if (c === -1) return L === 1;
  if (c !== L - 1) return false;
  return m.H(x, y + 2) === L - 1;
}

function placePlateaus(m, r, L, count, reserved, sizes, coastal = 0) {
  const { w, h } = m;
  let placed = 0, coastPlaced = 0;
  // anchors: cells on level L-1 (for upper levels, inside a lower plateau); coast anchors sit on a shoreline
  const inner = [], coast = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (m.H(x, y) !== L - 1) continue;
    inner.push([x, y]);
    if (L === 1 && m.H(x, y + 1) === -1 && m.H(x - 1, y + 1) === -1 && m.H(x + 1, y + 1) === -1) coast.push([x, y]);
  }
  if (!inner.length) return 0;
  for (let tries = 0; tries < 900 && placed < count; tries++) {
    const pw = r.int(sizes[0], sizes[1]), ph = r.int(sizes[2], sizes[3]);
    let px, py;
    if (coastPlaced < coastal && coast.length && tries % 2 === 0) {
      const [ax, ay] = r.pick(coast); px = ax - r.int(0, pw - 1); py = ay - ph + 1;
    } else {
      const [ax, ay] = r.pick(inner); px = ax - r.int(0, pw - 1); py = ay - r.int(0, ph - 1);
    }
    if (px < 2 || py < 2 || px + pw > w - 2 || py + ph > h - 3) continue;
    let ok = true;
    for (let y = py - 1; y <= py + ph + 2 && ok; y++) for (let x = px - 1; x <= px + pw && ok; x++) if (reserved(x, y)) ok = false;
    for (let y = py; y < py + ph && ok; y++) for (let x = px; x < px + pw && ok; x++) if (m.H(x, y) !== L - 1) ok = false;
    if (!ok) continue;
    // the whole cliff row is uniform: all water, or all ground with ground below
    const cl = [];
    for (let x = px; x < px + pw; x++) cl.push(m.H(x, py + ph));
    const allWater = cl.every(v => v === -1), allGround = cl.every(v => v === L - 1);
    if (!(allWater && L === 1) && !allGround) continue;
    const save = [];
    for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) { save.push(m.i(x, y)); m.height[m.i(x, y)] = L; }
    let good = true;
    for (let y = py - 1; y <= py + ph + 2 && good; y++) for (let x = px - 1; x <= px + pw && good; x++) {
      if (m.H(x, y) >= L && !plateauOk(m, x, y, L)) good = false;
      // the level below must keep its own cliffs legal too
      if (L > 1 && m.H(x, y) === L - 1 && !plateauOk(m, x, y, L - 1)) good = false;
    }
    if (!good) { for (const i of save) m.height[i] = L - 1; continue; }
    placed++; if (allWater) coastPlaced++;
  }
  return placed;
}

function settle(m, L) {
  // drop any level-L cell that breaks the rules or forms a one-row sliver
  for (let pass = 0; pass < 10; pass++) {
    let ch = false;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.H(x, y) !== L) continue;
      const sliver = (m.H(x, y - 1) < L && m.H(x, y + 1) < L) || (m.H(x - 1, y) < L && m.H(x + 1, y) < L);
      if (sliver || !plateauOk(m, x, y, L)) { m.height[m.i(x, y)] = L - 1; ch = true; }
    }
    if (!ch) break;
  }
}

function stairCands(m, cells, L, okLanding) {
  const cands = [];
  for (const [x, y] of cells) {
    if (m.H(x, y + 1) >= L || m.H(x, y) !== L) continue; // bottom edge cells only
    for (const side of [-1, 1]) {
      const sx = x + side;
      const lowOpen = (cx, cy) => m.H(cx, cy) === L - 1 && m.H(cx, cy - 1) <= L - 1 && !m.stairAt(cx, cy);
      if (m.H(sx, y) >= L) continue;
      if (!lowOpen(sx, y)) continue;                                // stair top
      if (m.H(sx, y + 1) !== L - 1 || m.stairAt(sx, y + 1)) continue; // stair bottom
      if (!lowOpen(sx, y + 2)) continue;                            // landing below
      if (m.stairAt(sx - 1, y) || m.stairAt(sx + 1, y) || m.stairAt(sx, y - 1) || m.stairAt(sx, y + 2) || m.stairAt(sx - 1, y + 1) || m.stairAt(sx + 1, y + 1)) continue;
      if (!lowOpen(sx - side, y + 2) && !lowOpen(sx, y + 3) && !lowOpen(sx + side, y + 2)) continue;
      if (okLanding && !okLanding(sx, y + 2)) continue;
      cands.push([sx, y, -side]);
    }
  }
  return cands;
}
function putStair(m, [sx, sy, side], L) {
  for (const [yy, v] of [[sy, 1], [sy + 1, 2]]) { const i = m.i(sx, yy); m.stair[i] = v; m.stairSide[i] = side; m.stairLvl[i] = L; }
}
function placeStairs(m, r, L) {
  const plats = components(m, (x, y) => m.H(x, y) >= L);
  for (const p of plats) {
    const cands = stairCands(m, p, L);
    if (!cands.length) { for (const [x, y] of p) if (m.H(x, y) >= L) m.height[m.i(x, y)] = L - 1; continue; }
    const n = Math.min(cands.length, p.length > 16 ? 2 : 1);
    const used = [];
    for (let k = 0; k < n; k++) {
      let best = null, bd = -1;
      for (const c of cands) {
        const d = used.length ? Math.min(...used.map(u => Math.abs(u[0] - c[0]) + Math.abs(u[1] - c[1]))) : r() * 10;
        if (d > bd) { bd = d; best = c; }
      }
      if (!best || (used.length && bd < 5)) break;
      used.push(best); putStair(m, best, L);
    }
  }
}
function cleanStairs(m) {
  for (let pass = 0; pass < 3; pass++) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = m.i(x, y);
    if (m.stair[i] !== 1) continue;
    const L = m.stairLvl[i], px = x + m.stairSide[i];
    const ok = m.H(px, y) >= L && m.H(x, y) === L - 1 && m.H(x, y + 1) === L - 1 && m.cliffLevel(px, y + 1) === L;
    if (!ok) for (const yy of [y, y + 1]) { const j = m.i(x, yy); m.stair[j] = 0; m.stairSide[j] = 0; m.stairLvl[j] = 0; }
  }
}
// Every plateau must be reachable from the start cell: add a stair that lands on reachable ground, or flatten it.
function ensureConnected(m, r, start) {
  for (let pass = 0; pass < 40; pass++) {
    m.computeKinds();
    const re = reachable(m, start[0], start[1]);
    let bad = null;
    for (let y = 0; y < m.h && !bad; y++) for (let x = 0; x < m.w && !bad; x++) if (m.ground(x, y) && m.H(x, y) >= 1 && !re[m.i(x, y)] && !m.stairAt(x, y)) bad = [x, y];
    if (!bad) return;
    const L = m.H(bad[0], bad[1]);
    const comp = components(m, (x, y) => m.H(x, y) >= L).find(c => c.some(([x, y]) => x === bad[0] && y === bad[1]));
    const cands = stairCands(m, comp, L, (x, y) => re[m.i(x, y)] === 1);
    if (cands.length) { putStair(m, r.pick(cands), L); continue; }
    for (const [x, y] of comp) if (m.H(x, y) >= L) m.height[m.i(x, y)] = L - 1;
    settle(m, L - 1 || 1);
    cleanStairs(m);
  }
}

// opts: {w,h,seed,plateaus,highs,reserve:{x,y,w,h},extraReserves,colors:[flat,l1,l2],landFrac,islets}
export function generateIsland(opts) {
  const { w, h, seed } = opts;
  const r = rng(seed);
  const m = new TerrainMap(w, h);
  if (opts.colors) m.colors = opts.colors;
  else m.colors = [opts.flatColor || 1, opts.highColor || 3, opts.topColor || 2];
  buildLand(m, r, opts);
  const reserved = (x, y) => {
    for (const R of [opts.reserve, ...(opts.extraReserves || [])]) if (R && x >= R.x - 1 && x < R.x + R.w + 1 && y >= R.y - 1 && y < R.y + R.h + 2) return true;
    return false;
  };
  // a couple of big plateaus that can carry a second level, then smaller ones, some on the coast
  placePlateaus(m, r, 1, Math.min(2, opts.highs ?? 2), reserved, [7, 11, 6, 8]);
  placePlateaus(m, r, 1, opts.plateaus ?? 5, reserved, [3, 8, 2, 5], 2);
  settle(m, 1);
  placePlateaus(m, r, 2, opts.highs ?? 2, reserved, [3, 6, 2, 3]);
  settle(m, 2); settle(m, 1);
  placeStairs(m, r, 2);
  settle(m, 2);
  placeStairs(m, r, 1);
  cleanStairs(m);
  const start = opts.start || (opts.reserve ? [opts.reserve.x + (opts.reserve.w >> 1), opts.reserve.y + (opts.reserve.h >> 1)] : null) || centralGround(m);
  ensureConnected(m, r, start);
  m.computeKinds();
  // decorations
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = m.kindAt(x, y);
    if ((k === K_LOW || k === K_HIGH) && !reserved(x, y) && !m.isCliff(x, y + 1) && r.chance(0.035)) m.decor.push({ type: r.chance(0.6) ? 'bush' : 'rock', x, y, v: r.int(1, 4), ox: r.int(-12, 12), oy: r.int(-8, 4), t: r() * 5 });
    if (k === K_WATER && !m.isCliff(x, y)) {
      let near = false, touching = false;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (m.isLand(x + ox, y + oy)) near = true;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.isLand(x + ox, y + oy) || m.isCliff(x + ox, y + oy)) touching = true;
      if (near && !touching && r.chance(0.05)) m.decor.push({ type: 'wrock', x, y, v: r.int(1, 4), t: r() * 5 });
    }
  }
  return m;
}

function centralGround(m) {
  let best = null, bd = 1e9;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.H(x, y) === 0) { const d = Math.hypot(x - m.w / 2, y - m.h / 2); if (d < bd) { bd = d; best = [x, y]; } }
  return best;
}

// Water cells where a boat can float clear of the coast (no part of the hull over land)
export function boatSpots(m, reach) {
  const out = [];
  for (let y = 2; y < m.h - 2; y++) for (let x = 2; x < m.w - 2; x++) {
    if (m.kindAt(x, y) !== K_LOW || (reach && !reach[m.i(x, y)])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bx = x + dx * 2, by = y + dy * 2;
      let clear = m.in(bx, by);
      for (let oy = -1; oy <= 1 && clear; oy++) for (let ox = -1; ox <= 1 && clear; ox++) if (m.isLand(bx + ox, by + oy) || m.isCliff(bx + ox, by + oy)) clear = false;
      if (clear && !m.isLand(x + dx, y + dy) && !m.isCliff(x + dx, y + dy)) { out.push({ wx: bx, wy: by, lx: x, ly: y, dx, dy }); break; }
    }
  }
  return out;
}

// ---------- rendering ----------

function tileFor(L, R, U, D) {
  const col = L && R ? 1 : (!L && R ? 0 : (L && !R ? 2 : 3));
  const row = U && D ? 1 : (!U && D ? 0 : (U && !D ? 2 : 3));
  return [col, row];
}

// Static terrain to an offscreen canvas, layer by layer as the guide describes.
export function renderTerrain(m) {
  const cv = document.createElement('canvas');
  cv.width = m.w * T; cv.height = m.h * T;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const sheet = lvl => SHEETS['tiles' + m.colors[Math.min(lvl, m.colors.length - 1)]].img;
  const tile = (img, col, row, x, y) => c.drawImage(img, col * T, row * T, T, T, x * T, y * T, T, T);
  // Flat Ground
  const flat = sheet(0);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!m.isLand(x, y)) continue;
    const [col, row] = tileFor(m.isLand(x - 1, y), m.isLand(x + 1, y), m.isLand(x, y - 1), m.isLand(x, y + 1));
    tile(flat, col, row, x, y);
  }
  // Shadow + Elevated Ground for each level
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const img = sheet(L);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.H(x, y) >= L) drawSprite(c, 'shadow', x * T + 32, y * T + 32 + 64, 0);
    const up = (x, y) => m.H(x, y) >= L;
    const hiConn = (x, y) => up(x, y) || (m.stairAt(x, y) === 1 && m.stairLvl[m.i(x, y)] === L);
    const isCl = (x, y) => m.cliffLevel(x, y) === L;
    const cliffConn = (x, y) => isCl(x, y) || (m.stairAt(x, y) === 2 && m.stairLvl[m.i(x, y)] === L);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (up(x, y)) {
        const [col, row] = tileFor(hiConn(x - 1, y), hiConn(x + 1, y), up(x, y - 1), up(x, y + 1));
        tile(img, 5 + col, row, x, y);
      } else if (isCl(x, y)) {
        const Lc = cliffConn(x - 1, y), Rc = cliffConn(x + 1, y);
        const col = Lc && Rc ? 1 : (!Lc && Rc ? 0 : (Lc && !Rc ? 2 : 3));
        tile(img, 5 + col, m.isLand(x, y) ? 4 : 5, x, y);
      }
      if (m.stairAt(x, y) && m.stairLvl[m.i(x, y)] === L) {
        const col = m.stairSide[m.i(x, y)] > 0 ? 0 : 3;
        tile(img, col, m.stairAt(x, y) === 1 ? 4 : 5, x, y);
      }
    }
  }
  return cv;
}

// Water Foam goes under every tile that touches the water, including water cliffs.
export function foamCells(m, r) {
  const out = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const land = m.isLand(x, y);
    const waterCliff = !land && m.isCliff(x, y);
    if (!land && !waterCliff) continue;
    let touches = waterCliff;
    for (let oy = -1; oy <= 1 && !touches; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy) && !m.isCliff(x + ox, y + oy)) touches = true;
    if (touches) out.push({ x, y, t: r() * 1.6 });
  }
  return out;
}

// ---------- pathfinding ----------

class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

// A* from (sx,sy) to any cell satisfying goal(x,y). heuristic toward (tx,ty).
export function findPath(m, sx, sy, tx, ty, goal, maxNodes = 4000) {
  goal = goal || ((x, y) => x === tx && y === ty);
  const W = m.w;
  const g = new Float32Array(m.w * m.h).fill(Infinity);
  const from = new Int32Array(m.w * m.h).fill(-1);
  const closed = new Uint8Array(m.w * m.h);
  const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  const open = new Heap();
  const si = sy * W + sx; g[si] = 0; open.push({ i: si, f: h(sx, sy) });
  let best = si, bestH = h(sx, sy), n = 0;
  while (open.size && n++ < maxNodes) {
    const { i } = open.pop();
    if (closed[i]) continue; closed[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (goal(x, y)) return rebuild(from, i, W);
    const hh = h(x, y); if (hh < bestH) { bestH = hh; best = i; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!m.in(nx, ny)) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      if (!m.canStep(x, y, nx, ny)) {
        // allow stepping onto the goal cell even if it is blocked (e.g. attacking a building)
        continue;
      }
      const ng = g[i] + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = i; open.push({ i: ni, f: ng + h(nx, ny) }); }
    }
  }
  return null;
}
function rebuild(from, i, W) {
  const p = [];
  while (i >= 0) { p.push([i % W, (i / W) | 0]); i = from[i]; }
  p.reverse(); p.shift();
  return p;
}

// Flood fill of reachable cells from a start (used to validate spawns)
export function reachable(m, sx, sy) {
  const seen = new Uint8Array(m.w * m.h); const st = [[sx, sy]]; seen[m.i(sx, sy)] = 1;
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (m.in(nx, ny) && !seen[m.i(nx, ny)] && m.canStep(x, y, nx, ny)) { seen[m.i(nx, ny)] = 1; st.push([nx, ny]); }
    }
  }
  return seen;
}
