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

function placePlateaus(m, r, L, count, reserved, sizes, coastal = 0, anchorOk = null) {
  const { w, h } = m;
  let placed = 0, coastPlaced = 0;
  // anchors: cells on level L-1 (for upper levels, inside a lower plateau); coast anchors sit on a shoreline
  const inner = [], coast = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (m.H(x, y) !== L - 1 || (anchorOk && !anchorOk(x, y))) continue;
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

// mask (optional): only cells where mask(x,y) is true may be lowered (annex merges keep old land frozen)
function settle(m, L, mask = null) {
  // drop any level-L cell that breaks the rules or forms a one-row sliver
  for (let pass = 0; pass < 10; pass++) {
    let ch = false;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.H(x, y) !== L || (mask && !mask(x, y))) continue;
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
function placeStairs(m, r, L, mask = null) {
  const plats = components(m, (x, y) => m.H(x, y) >= L);
  for (const p of plats) {
    if (mask && !p.every(([x, y]) => mask(x, y))) continue;
    const cands = stairCands(m, p, L).filter(c => !mask || (mask(c[0], c[1]) && mask(c[0], c[1] + 1) && mask(c[0], c[1] + 2)));
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
// mask (optional): only plateaus inside the mask are checked, given stairs or flattened.
function ensureConnected(m, r, start, mask = null) {
  for (let pass = 0; pass < 40; pass++) {
    m.computeKinds();
    const re = reachable(m, start[0], start[1]);
    let bad = null;
    for (let y = 0; y < m.h && !bad; y++) for (let x = 0; x < m.w && !bad; x++) if (m.ground(x, y) && m.H(x, y) >= 1 && !re[m.i(x, y)] && !m.stairAt(x, y) && (!mask || mask(x, y))) bad = [x, y];
    if (!bad) return;
    const L = m.H(bad[0], bad[1]);
    const comp = components(m, (x, y) => m.H(x, y) >= L).find(c => c.some(([x, y]) => x === bad[0] && y === bad[1]));
    const cands = stairCands(m, comp, L, (x, y) => re[m.i(x, y)] === 1).filter(c => !mask || (mask(c[0], c[1]) && mask(c[0], c[1] + 1)));
    if (cands.length) { putStair(m, r.pick(cands), L); continue; }
    for (const [x, y] of comp) if (m.H(x, y) >= L && (!mask || mask(x, y))) m.height[m.i(x, y)] = L - 1;
    settle(m, L - 1 || 1, mask);
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
export function renderTerrain(m) { return renderTerrainRect(m, 0, 0, m.w, m.h); }

// Renders cells [x0,x0+w) x [y0,y0+h) into a w*T x h*T canvas. Neighbouring cells within
// 2 tiles are drawn too (clipped), so chunks are pixel-identical to a full-map render.
export function renderTerrainRect(m, x0, y0, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w * T; cv.height = h * T;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.translate(-x0 * T, -y0 * T);
  const ax = Math.max(0, x0 - 2), ay = Math.max(0, y0 - 2), bx = Math.min(m.w, x0 + w + 2), by = Math.min(m.h, y0 + h + 2);
  const sheet = lvl => SHEETS['tiles' + m.colors[Math.min(lvl, m.colors.length - 1)]].img;
  const tile = (img, col, row, x, y) => c.drawImage(img, col * T, row * T, T, T, x * T, y * T, T, T);
  // Flat Ground
  const flat = sheet(0);
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
    if (!m.isLand(x, y)) continue;
    const [col, row] = tileFor(m.isLand(x - 1, y), m.isLand(x + 1, y), m.isLand(x, y - 1), m.isLand(x, y + 1));
    tile(flat, col, row, x, y);
  }
  // Shadow + Elevated Ground for each level
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const img = sheet(L);
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) if (m.H(x, y) >= L) drawSprite(c, 'shadow', x * T + 32, y * T + 32 + 64, 0);
    const up = (x, y) => m.H(x, y) >= L;
    const hiConn = (x, y) => up(x, y) || (m.stairAt(x, y) === 1 && m.stairLvl[m.i(x, y)] === L);
    const isCl = (x, y) => m.cliffLevel(x, y) === L;
    const cliffConn = (x, y) => isCl(x, y) || (m.stairAt(x, y) === 2 && m.stairLvl[m.i(x, y)] === L);
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
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

// Terrain split into CHUNK x CHUNK tile canvases (one big canvas would break iOS Safari's
// ~16.7 MP limit on a 96x72 map). Chunks render lazily on first draw; chunks of open sea
// get no canvas at all. invalidate() marks the chunks around changed cells for a redraw.
export const CHUNK = 16;
export class TerrainChunks {
  constructor(m, size = CHUNK) {
    this.m = m; this.size = size;
    this.cols = Math.ceil(m.w / size); this.rows = Math.ceil(m.h / size);
    this.cv = new Array(this.cols * this.rows).fill(undefined); // undefined = not rendered, null = empty sea
    this.renders = 0;
  }
  get width() { return this.m.w * T; }
  get height() { return this.m.h * T; }
  rect(k) {
    const S = this.size, x = (k % this.cols) * S, y = Math.floor(k / this.cols) * S;
    return { x, y, w: Math.min(S, this.m.w - x), h: Math.min(S, this.m.h - y) };
  }
  build(k, m = this.m) {
    const R = this.rect(k);
    let any = false;
    for (let y = Math.max(0, R.y - 2); y < Math.min(m.h, R.y + R.h + 2) && !any; y++) for (let x = Math.max(0, R.x - 2); x < Math.min(m.w, R.x + R.w + 2); x++) if (m.land[m.i(x, y)] || m.cliffLevel(x, y)) { any = true; break; }
    this.renders++;
    return any ? renderTerrainRect(m, R.x, R.y, R.w, R.h) : null;
  }
  // chunk indices touched by cells [x0..x1]x[y0..y1] (inclusive), padded by the 2-tile sprite reach
  keysFor(x0, y0, x1, y1) {
    const S = this.size, out = [];
    const c0 = Math.max(0, Math.floor((x0 - 2) / S)), c1 = Math.min(this.cols - 1, Math.floor((x1 + 2) / S));
    const r0 = Math.max(0, Math.floor((y0 - 2) / S)), r1 = Math.min(this.rows - 1, Math.floor((y1 + 2) / S));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * this.cols + c);
    return out;
  }
  free(k) { const c = this.cv[k]; if (c) { c.width = 0; c.height = 0; } this.cv[k] = undefined; }
  invalidate(x0 = 0, y0 = 0, x1 = this.m.w - 1, y1 = this.m.h - 1) { for (const k of this.keysFor(x0, y0, x1, y1)) this.free(k); }
  // render the given cells' chunks from another map of the same size (e.g. a merge preview), to adopt() later
  prepare(m, x0, y0, x1, y1) { const out = new Map(); for (const k of this.keysFor(x0, y0, x1, y1)) out.set(k, this.build(k, m)); return out; }
  adopt(prepared) { for (const [k, c] of prepared) { this.free(k); this.cv[k] = c; } }
  get(k) { if (this.cv[k] === undefined) this.cv[k] = this.build(k); return this.cv[k]; }
  // Draws the chunks overlapping world rect [wx0,wx1)x[wy0,wy1). Each chunk is placed on whole
  // device pixels so neighbours share exact edges at any zoom (no hairline seams).
  draw(ctx, cam, wx0, wy0, wx1, wy1) {
    const P = this.size * T, z = cam.z;
    const c0 = Math.max(0, Math.floor(wx0 / P)), c1 = Math.min(this.cols - 1, Math.floor(wx1 / P));
    const r0 = Math.max(0, Math.floor(wy0 / P)), r1 = Math.min(this.rows - 1, Math.floor(wy1 / P));
    if (c1 < c0 || r1 < r0) return;
    const tx = Math.round(-cam.x * z), ty = Math.round(-cam.y * z);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const cv = this.get(r * this.cols + c); if (!cv) continue;
      const px = c * P, py = r * P;
      const dx0 = Math.round(px * z) + tx, dy0 = Math.round(py * z) + ty;
      const dx1 = Math.round((px + cv.width) * z) + tx, dy1 = Math.round((py + cv.height) * z) + ty;
      ctx.drawImage(cv, 0, 0, cv.width, cv.height, dx0, dy0, dx1 - dx0, dy1 - dy0);
    }
    ctx.restore();
  }
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

// ---------- map copies (annex merges work on a copy, then swap it in) ----------

export function cloneMap(m) {
  const c = new TerrainMap(m.w, m.h);
  copyTerrain(c, m);
  return c;
}
// copy the terrain (not the live block counts) from src into dst (same size)
export function copyTerrain(dst, src) {
  dst.land.set(src.land); dst.height.set(src.height); dst.stair.set(src.stair);
  dst.stairSide.set(src.stairSide); dst.stairLvl.set(src.stairLvl);
  dst.colors = src.colors.slice();
  dst.decor = src.decor.map(d => ({ ...d }));
  dst.computeKinds();
}
// place map src at (ox,oy) inside a new w x h sea
export function embedMap(src, w, h, ox, oy) {
  const m = new TerrainMap(w, h);
  m.colors = src.colors.slice();
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const a = src.i(x, y), b = m.i(x + ox, y + oy);
    m.land[b] = src.land[a]; m.height[b] = src.height[a]; m.stair[b] = src.stair[a];
    m.stairSide[b] = src.stairSide[a]; m.stairLvl[b] = src.stairLvl[a];
  }
  m.decor = src.decor.map(d => ({ ...d, x: d.x + ox, y: d.y + oy }));
  m.computeKinds();
  return m;
}

// ---------- annexed land ----------
// An annex is a chunk of new land that attaches to the current coastline. Placement
// (annexSlot) finds a rect of open sea beside the coast; mergeAnnex grows chunky land in
// it, bridges and smooths the seam, then re-runs the island rules on the new cells only.
// Old land is never removed and its heights never change, so anything standing on it stays
// on the same ground.

export const ANNEX_DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0], NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1] };
export const ANNEX_SIDES = Object.keys(ANNEX_DIRS);
const EDGE = 4; // annex rects keep this many tiles of open sea to the world edge

function landBox(m) {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.land[m.i(x, y)]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
function rectTouchesLand(m, rx, ry, w, h, pad) {
  for (let y = ry - pad; y < ry + h + pad; y++) for (let x = rx - pad; x < rx + w + pad; x++) if (m.isLand(x, y) || (m.in(x, y) && m.cliffLevel(x, y))) return true;
  return false;
}

// Rect of open sea for a w x h chunk on the given side, `offset` tiles along the coast, or null.
// The rect slides out from the island along one axis until it clears the coast by one tile.
// Corners slide along both axes and keep whichever slot sits closer.
export function annexSlot(m, side, w, h, offset = 0) {
  const d = ANNEX_DIRS[side]; if (!d) return null;
  const B = landBox(m); if (!B) return null;
  const cx = (B.x0 + B.x1 + 1) / 2, cy = (B.y0 + B.y1 + 1) / 2;
  const tries = [];
  if (d[0] && d[1]) {
    // corner: hang half over the bbox corner, then slide out along x or along y
    const hy = (d[1] < 0 ? B.y0 - h / 2 : B.y1 + 1 - h / 2) + offset, hx = (d[0] < 0 ? B.x0 - w / 2 : B.x1 + 1 - w / 2) + offset;
    tries.push({ ax: [d[0], 0], sx: cx - w / 2, sy: hy });
    tries.push({ ax: [0, d[1]], sx: hx, sy: cy - h / 2 });
  } else if (d[0]) tries.push({ ax: d, sx: cx - w / 2, sy: cy - h / 2 + offset });
  else tries.push({ ax: d, sx: cx - w / 2 + offset, sy: cy - h / 2 });
  const kx = d[0] < 0 ? B.x0 : d[0] > 0 ? B.x1 + 1 : cx, ky = d[1] < 0 ? B.y0 : d[1] > 0 ? B.y1 + 1 : cy;
  let best = null;
  for (const t of tries) {
    let rx = Math.round(t.sx), ry = Math.round(t.sy), steps = 0;
    while (rectTouchesLand(m, rx, ry, w, h, 1) && steps < 200) { rx += t.ax[0]; ry += t.ax[1]; steps++; }
    if (rx < EDGE || ry < EDGE || rx + w > m.w - EDGE || ry + h > m.h - EDGE) continue;
    if (!rectTouchesLand(m, rx, ry, w, h, 2)) continue; // must actually sit against the coast
    const score = Math.hypot(rx + w / 2 - kx, ry + h / 2 - ky);
    if (!best || score < best.score) best = { x: rx, y: ry, w, h, score };
  }
  if (!best) return null;
  delete best.score;
  return best;
}

// Chunky land inside a w x h chunk, flush with the sides that face the island.
function chunkLand(w, h, r, face) {
  const L = new Uint8Array(w * h);
  const inL = face[0] < 0 ? 0 : 1, inR = face[0] > 0 ? 0 : 1, inT = face[1] < 0 ? 0 : 1, inB = face[1] > 0 ? 0 : 1;
  const ok = (x, y) => x >= inL && y >= inT && x < w - inR && y < h - inB;
  const fill = (x0, y0, rw, rh) => { for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) if (ok(x, y)) L[y * w + x] = 1; };
  const cw = Math.round(w * (0.55 + r() * 0.2)), ch = Math.round(h * (0.55 + r() * 0.2));
  const cx0 = face[0] < 0 ? 0 : face[0] > 0 ? w - cw : Math.round((w - cw) / 2 + r.int(-1, 1));
  const cy0 = face[1] < 0 ? 0 : face[1] > 0 ? h - ch : Math.round((h - ch) / 2 + r.int(-1, 1));
  fill(cx0, cy0, cw, ch);
  const target = Math.floor(w * h * (0.58 + r() * 0.12));
  const area = () => L.reduce((a, v) => a + v, 0);
  for (let k = 0; k < 200 && area() < target; k++) {
    const rw = r.int(3, Math.max(4, Math.round(w * 0.5))), rh = r.int(3, Math.max(3, Math.round(h * 0.5)));
    let ax = 0, ay = 0, hit = false;
    for (let t = 0; t < 30 && !hit; t++) { ax = r.int(0, w - 1); ay = r.int(0, h - 1); hit = L[ay * w + ax] === 1; }
    if (!hit) continue;
    fill(ax - r.int(0, rw - 1), ay - r.int(0, rh - 1), rw, rh);
  }
  return L;
}

// Fill-only / trim tidy passes in a box. canRemove(x,y) says which land may be trimmed.
function tidyBox(m, box, canRemove) {
  const M = 3;
  const x0 = Math.max(M, box.x0), y0 = Math.max(M, box.y0), x1 = Math.min(m.w - M - 1, box.x1), y1 = Math.min(m.h - M - 1, box.y1);
  let any = false;
  for (let pass = 0; pass < 14; pass++) {
    let ch = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = m.i(x, y), L = m.isLand(x - 1, y), R = m.isLand(x + 1, y), U = m.isLand(x, y - 1), D = m.isLand(x, y + 1);
      const n = L + R + U + D;
      if (!m.land[i]) { if (n >= 3 || (L && R) || (U && D)) { m.land[i] = 1; m.height[i] = 0; ch = true; } }
      else if (canRemove && canRemove(x, y) && (n <= 1 || (!L && !R) || (!U && !D))) { m.land[i] = 0; m.height[i] = 0; ch = true; }
    }
    any = any || ch;
    if (!ch) break;
  }
  return any;
}

// One-tile-wide land (a bridge or a strip) is widened by filling the side with more land next to it.
function thicken(m) {
  let ch = false;
  const small = new Uint8Array(m.w * m.h);
  for (const c of components(m, (x, y) => m.isLand(x, y))) if (c.length <= 4) for (const [x, y] of c) small[m.i(x, y)] = 1;
  for (let y = 3; y < m.h - 3; y++) for (let x = 3; x < m.w - 3; x++) {
    if (!m.isLand(x, y) || small[m.i(x, y)]) continue;
    const L = m.isLand(x - 1, y), R = m.isLand(x + 1, y), U = m.isLand(x, y - 1), D = m.isLand(x, y + 1);
    if (L + R + U + D === 0) continue; // islet
    const put = (a, b) => { if (a >= 3 && b >= 3 && a < m.w - 3 && b < m.h - 3 && !m.land[m.i(a, b)]) { m.land[m.i(a, b)] = 1; m.height[m.i(a, b)] = 0; ch = true; } };
    const around = (a, b) => m.isLand(a - 1, b) + m.isLand(a + 1, b) + m.isLand(a, b - 1) + m.isLand(a, b + 1);
    if (!U && !D) { if (around(x, y + 1) >= around(x, y - 1)) put(x, y + 1); else put(x, y - 1); }
    else if (!L && !R) { if (around(x + 1, y) >= around(x - 1, y)) put(x + 1, y); else put(x - 1, y); }
  }
  return ch;
}

// A cliff that partly meets land and partly water would mix the guide's two cliff rows, and a
// land cliff needs a strip of ground under it: fill the water so the whole run stands on ground.
function fixCliffRuns(m) {
  let any = false;
  for (let pass = 0; pass < 12; pass++) {
    let ch = false;
    for (let y = 1; y < m.h - 1; y++) {
      let x = 0;
      while (x < m.w) {
        const Lp = m.cliffLevel(x, y);
        if (!Lp) { x++; continue; }
        let e = x; while (e + 1 < m.w && m.cliffLevel(e + 1, y) === Lp) e++;
        let land = 0, water = 0;
        for (let k = x; k <= e; k++) if (m.isLand(k, y)) land++; else water++;
        if (land && water) for (let k = x; k <= e; k++) if (!m.isLand(k, y)) { m.land[m.i(k, y)] = 1; m.height[m.i(k, y)] = Lp - 1; ch = true; }
        if (land || water === 0) for (let k = x; k <= e; k++) if (!m.isLand(k, y + 1)) { m.land[m.i(k, y + 1)] = 1; m.height[m.i(k, y + 1)] = 0; ch = true; }
        x = e + 1;
      }
    }
    any = any || ch;
    if (!ch) break;
  }
  return any;
}

// Shortest water path from the chunk to the old coast, widened to 3 tiles (fallback bridge).
function corridor(m, isChunk, isOld) {
  const prev = new Int32Array(m.w * m.h).fill(-2), q = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isChunk(x, y)) { prev[m.i(x, y)] = -1; q.push(m.i(x, y)); }
  let hit = -1;
  for (let h = 0; h < q.length && hit < 0; h++) {
    const i = q[h], x = i % m.w, y = (i / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 3 || ny < 3 || nx >= m.w - 3 || ny >= m.h - 3) continue;
      const ni = m.i(nx, ny);
      if (prev[ni] !== -2) continue;
      prev[ni] = i;
      if (isOld(nx, ny)) { hit = i; break; }
      if (!m.land[ni]) q.push(ni);
    }
  }
  if (hit < 0) return false;
  for (let i = hit; i >= 0 && prev[i] !== -1; i = prev[i]) {
    const x = i % m.w, y = (i / m.w) | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const xx = x + ox, yy = y + oy; if (xx >= 3 && yy >= 3 && xx < m.w - 3 && yy < m.h - 3 && !m.land[m.i(xx, yy)]) { m.land[m.i(xx, yy)] = 1; m.height[m.i(xx, yy)] = 0; } }
  }
  return true;
}

// Merge annex rec {seed, side, size, x, y, w, h} into map m (in place). start = a ground cell
// of the home island (the castle). Returns { cells: [[x,y]] new land inside the rect,
// added: count of all new land cells, box: changed cell bbox, chunk: Uint8Array mask (m.w*m.h) }.
export function mergeAnnex(m, rec, start) {
  const r = rng((rec.seed >>> 0) ^ 0x5eed);
  const { x: rx, y: ry, w, h } = rec;
  const d = ANNEX_DIRS[rec.side] || [1, 0], face = [-d[0], -d[1]];
  const liveBlock = m.block; m.block = new Uint16Array(m.w * m.h); // generation ignores units/buildings
  const old = m.land.slice(), oldH = m.height.slice(), oldS = m.stair.slice();
  const isOld = (x, y) => m.in(x, y) && old[m.i(x, y)] === 1;
  const isNew = (x, y) => m.in(x, y) && m.land[m.i(x, y)] === 1 && !old[m.i(x, y)];
  const inRect = (x, y) => x >= rx && y >= ry && x < rx + w && y < ry + h;
  const set = (x, y) => { if (x >= 3 && y >= 3 && x < m.w - 3 && y < m.h - 3 && !m.land[m.i(x, y)]) { m.land[m.i(x, y)] = 1; m.height[m.i(x, y)] = 0; } };
  // 1. chunk land
  const L = chunkLand(w, h, r, face);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[y * w + x]) set(rx + x, ry + y);
  // 2. bridge the water gap row by row (and column by column) toward the island
  const D = 8;
  if (face[0]) for (let y = ry; y < ry + h; y++) {
    let e = -1;
    for (let k = 0; k < w; k++) { const x = face[0] < 0 ? rx + k : rx + w - 1 - k; if (m.land[m.i(x, y)]) { e = x; break; } }
    if (e < 0) continue;
    for (let s = 1; s <= D; s++) { const x = e + face[0] * s; if (isOld(x, y)) { for (let k = 1; k < s; k++) set(e + face[0] * k, y); break; } }
  }
  if (face[1]) for (let x = rx; x < rx + w; x++) {
    let e = -1;
    for (let k = 0; k < h; k++) { const y = face[1] < 0 ? ry + k : ry + h - 1 - k; if (m.land[m.i(x, y)]) { e = y; break; } }
    if (e < 0) continue;
    for (let s = 1; s <= D; s++) { const y = e + face[1] * s; if (isOld(x, y)) { for (let k = 1; k < s; k++) set(x, e + face[1] * k); break; } }
  }
  // the seam band: the rect plus the bridged gap toward the island
  const band = {
    x0: Math.min(rx, rx + face[0] * D) - 2, y0: Math.min(ry, ry + face[1] * D) - 2,
    x1: Math.max(rx + w - 1, rx + w - 1 + face[0] * D) + 2, y1: Math.max(ry + h - 1, ry + h - 1 + face[1] * D) + 2,
  };
  // 3. morphological closing (radius 2) along the seam fills narrow gaps and notches
  {
    const R = 2, bx0 = Math.max(3, band.x0), by0 = Math.max(3, band.y0), bx1 = Math.min(m.w - 4, band.x1), by1 = Math.min(m.h - 4, band.y1);
    const dil = (x, y) => { for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) if (m.isLand(x + ox, y + oy)) return true; return false; };
    const D2 = new Map();
    const dilAt = (x, y) => { const k = y * m.w + x; let v = D2.get(k); if (v === undefined) { v = dil(x, y); D2.set(k, v); } return v; };
    const add = [];
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (m.land[m.i(x, y)]) continue;
      let all = true;
      for (let oy = -R; oy <= R && all; oy++) for (let ox = -R; ox <= R && all; ox++) if (!dilAt(x + ox, y + oy)) all = false;
      if (all) add.push([x, y]);
    }
    for (const [x, y] of add) set(x, y);
  }
  // 4. tidy the seam (new land may be trimmed, old land never)
  tidyBox(m, band, isNew);
  // 5. make sure the chunk is joined to the island; drop any new land that is not
  const mainComp = () => {
    const lab = new Uint8Array(m.w * m.h), st = [start]; lab[m.i(start[0], start[1])] = 1;
    while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (m.isLand(nx, ny) && !lab[m.i(nx, ny)]) { lab[m.i(nx, ny)] = 1; st.push([nx, ny]); } } }
    return lab;
  };
  let lab = mainComp();
  let joined = false;
  for (let y = ry; y < ry + h && !joined; y++) for (let x = rx; x < rx + w; x++) if (isNew(x, y) && lab[m.i(x, y)]) { joined = true; break; }
  if (!joined) {
    corridor(m, (x, y) => inRect(x, y) && isNew(x, y), (x, y) => lab[m.i(x, y)] === 1);
    tidyBox(m, { x0: 0, y0: 0, x1: m.w, y1: m.h }, null);
    lab = mainComp();
  }
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isNew(x, y) && !lab[m.i(x, y)]) m.land[m.i(x, y)] = 0;
  // 6. fill enclosed water, then settle the cliffs that now meet land; repeat until stable
  const fillLakes = () => {
    for (const c of components(m, (x, y) => !m.isLand(x, y))) if (!c.some(([x, y]) => x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1)) for (const [x, y] of c) { m.land[m.i(x, y)] = 1; m.height[m.i(x, y)] = 0; }
  };
  fillLakes();
  const all = { x0: 0, y0: 0, x1: m.w, y1: m.h };
  for (let k = 0; k < 10; k++) {
    const a = fixCliffRuns(m), b = tidyBox(m, all, null), c = thicken(m);
    if (!a && !b && !c) break;
  }
  fillLakes();
  // 7. plateaus and stairs on the chunk itself, following the island rules
  const inChunk = (x, y) => inRect(x, y) && isNew(x, y);
  const reserved = (x, y) => !m.in(x, y) || old[m.i(x, y)] === 1 || !inRect(x, y) || (m.isLand(x, y) && !isNew(x, y));
  const size = rec.size || 2;
  if (size >= 3) placePlateaus(m, r, 1, 1, reserved, [6, 8, 5, 6], 0, inChunk);
  placePlateaus(m, r, 1, size >= 2 ? 2 : 1, reserved, [3, 6, 2, 4], 1, inChunk);
  settle(m, 1, inChunk);
  if (size >= 3) { placePlateaus(m, r, 2, 1, reserved, [3, 4, 2, 3], 0, inChunk); settle(m, 2, inChunk); settle(m, 1, inChunk); }
  placeStairs(m, r, 2, inChunk);
  settle(m, 2, inChunk);
  placeStairs(m, r, 1, inChunk);
  cleanStairs(m);
  const newMask = (x, y) => isNew(x, y);
  ensureConnected(m, r, start, newMask);
  m.computeKinds();
  // 8. decorations: clear water rocks that are now ashore, scatter new bushes / rocks / water rocks
  m.decor = m.decor.filter(dd => {
    if (dd.type !== 'wrock') return !isNew(dd.x, dd.y) || m.ground(dd.x, dd.y);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.isLand(dd.x + ox, dd.y + oy) || m.isCliff(dd.x + ox, dd.y + oy)) return false;
    return true;
  });
  for (let y = band.y0 - 3; y <= band.y1 + 3; y++) for (let x = band.x0 - 3; x <= band.x1 + 3; x++) {
    if (!m.in(x, y)) continue;
    const k = m.kindAt(x, y);
    if (isNew(x, y) && (k === K_LOW || k === K_HIGH) && !m.isCliff(x, y + 1) && r.chance(0.035)) m.decor.push({ type: r.chance(0.6) ? 'bush' : 'rock', x, y, v: r.int(1, 4), ox: r.int(-12, 12), oy: r.int(-8, 4), t: r() * 5 });
    if (k === K_WATER && !m.isCliff(x, y) && !m.decor.some(dd => dd.x === x && dd.y === y)) {
      let near = false, touching = false;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (isNew(x + ox, y + oy)) near = true;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.isLand(x + ox, y + oy) || m.isCliff(x + ox, y + oy)) touching = true;
      if (near && !touching && r.chance(0.04)) m.decor.push({ type: 'wrock', x, y, v: r.int(1, 4), t: r() * 5 });
    }
  }
  m.block = liveBlock;
  // what changed
  const box = { x0: m.w, y0: m.h, x1: -1, y1: -1 }, cells = [], chunk = new Uint8Array(m.w * m.h);
  let added = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = m.i(x, y);
    if (m.land[i] !== old[i] || m.height[i] !== oldH[i] || m.stair[i] !== oldS[i]) { if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    if (m.land[i] && !old[i]) { added++; if (inRect(x, y)) { chunk[i] = 1; cells.push([x, y]); } }
  }
  return { cells, added, box, chunk };
}

// ---------- rules audit (used by tests / the debug console) ----------
// Returns a list of { rule, x, y } for every broken tilemap rule. start = a home ground cell.
export function auditMap(m, start) {
  const out = [], bad = (rule, x, y) => out.push({ rule, x, y });
  m.computeKinds();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const H = m.H(x, y);
    if (H >= 1 && !plateauOk(m, x, y, H)) bad('plateau', x, y);
    const cl = m.cliffLevel(x, y);
    if (cl && m.isLand(x, y)) {
      if (m.H(x, y) !== cl - 1) bad('cliff-on-cliff', x, y);
      if (m.H(x, y + 1) !== cl - 1 && !m.stairAt(x, y + 1)) bad('cliff-no-ground', x, y);
    }
    if (cl && !m.isLand(x, y) && cl > 1) bad('high-sea-cliff', x, y);
    const s = m.stairAt(x, y);
    if (s === 1) {
      const L = m.stairLvl[m.i(x, y)], px = x + m.stairSide[m.i(x, y)];
      if (!(m.H(px, y) >= L && m.H(x, y) === L - 1 && m.stairAt(x, y + 1) === 2 && m.cliffLevel(px, y + 1) === L)) bad('orphan-stair', x, y);
    }
    if (s === 2 && m.stairAt(x, y - 1) !== 1) bad('orphan-stair', x, y);
  }
  // cliff runs must be all land cliffs or all sea cliffs
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; ) {
    const L = m.cliffLevel(x, y); if (!L) { x++; continue; }
    let e = x, land = 0, water = 0;
    while (e < m.w && m.cliffLevel(e, y) === L) { if (m.isLand(e, y)) land++; else water++; e++; }
    if (land && water) bad('mixed-cliff', x, y);
    x = e;
  }
  if (start) {
    const re = reachable(m, start[0], start[1]);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.ground(x, y) && m.H(x, y) >= 1 && !re[m.i(x, y)] && !m.stairAt(x, y)) bad('unreachable', x, y);
  }
  // jagged coast: one-tile slivers and notches (islets of up to 4 tiles are decoration)
  const small = new Set();
  for (const c of components(m, (x, y) => m.isLand(x, y))) if (c.length <= 4) for (const [x, y] of c) small.add(m.i(x, y));
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if (small.has(m.i(x, y))) continue;
    const L = m.isLand(x - 1, y), R = m.isLand(x + 1, y), U = m.isLand(x, y - 1), D = m.isLand(x, y + 1);
    if (m.isLand(x, y) && ((!L && !R) || (!U && !D))) bad('sliver', x, y);
    if (!m.isLand(x, y) && ((L && R) || (U && D) || L + R + U + D >= 3)) bad('notch', x, y);
  }
  return out;
}
