// Island generation, auto-tiling (following the Tiny Swords tilemap guide),
// terrain rendering and grid pathfinding.
import { SHEETS, drawSprite } from './assets.js';

export const T = 64;

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

// Cell kinds used by pathing
export const K_WATER = 0, K_LOW = 1, K_HIGH = 2, K_CLIFF = 3, K_STOP = 4, K_SBOT = 5;

export class TerrainMap {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.land = new Uint8Array(w * h);
    this.high = new Uint8Array(w * h);
    this.stair = new Uint8Array(w * h);   // 0 none, 1 top, 2 bottom
    this.stairSide = new Int8Array(w * h); // -1 plateau on the left, +1 plateau on the right
    this.block = new Uint16Array(w * h);   // reference count of blocking objects (buildings, trees, stones)
    this.kind = new Uint8Array(w * h);
    this.flatColor = 1; this.highColor = 3;
    this.decor = [];      // {type:'bush'|'rock'|'wrock', x, y, v}
  }
  i(x, y) { return y * this.w + x; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isLand(x, y) { return this.in(x, y) && this.land[this.i(x, y)] === 1; }
  isHigh(x, y) { return this.in(x, y) && this.high[this.i(x, y)] === 1; }
  stairAt(x, y) { return this.in(x, y) ? this.stair[this.i(x, y)] : 0; }
  isCliff(x, y) {
    if (!this.in(x, y)) return false;
    return !this.isHigh(x, y) && this.isHigh(x, y - 1) && !this.stairAt(x, y);
  }
  computeKinds() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = this.i(x, y);
      let k = K_WATER;
      if (this.stair[i] === 1) k = K_STOP;
      else if (this.stair[i] === 2) k = K_SBOT;
      else if (this.isCliff(x, y)) k = K_CLIFF;
      else if (this.high[i]) k = K_HIGH;
      else if (this.land[i]) k = K_LOW;
      this.kind[i] = k;
    }
  }
  kindAt(x, y) { return this.in(x, y) ? this.kind[this.i(x, y)] : K_WATER; }
  walkable(x, y) {
    const k = this.kindAt(x, y);
    return k !== K_WATER && k !== K_CLIFF && this.block[this.i(x, y)] === 0;
  }
  // Is the terrain walkable ignoring blocking objects (for placement checks)
  ground(x, y) { const k = this.kindAt(x, y); return k !== K_WATER && k !== K_CLIFF; }
  level(x, y) { const k = this.kindAt(x, y); return (k === K_HIGH || k === K_STOP) ? 1 : 0; }

  canStep(ax, ay, bx, by) {
    if (!this.walkable(bx, by)) return false;
    const a = this.kindAt(ax, ay), b = this.kindAt(bx, by);
    const dx = bx - ax, dy = by - ay;
    if (dx !== 0 && dy !== 0) {
      // diagonals only across uniform open ground
      if (a !== b || (a !== K_LOW && a !== K_HIGH)) return false;
      return this.walkable(ax + dx, ay) && this.walkable(ax, ay + dy) &&
        this.kindAt(ax + dx, ay) === a && this.kindAt(ax, ay + dy) === a;
    }
    if (a === b && (a === K_LOW || a === K_HIGH)) return true;
    const pair = (p, q) => (a === p && b === q) || (a === q && b === p);
    if (pair(K_STOP, K_HIGH)) return true;
    if (pair(K_STOP, K_SBOT)) return dx === 0;
    if (pair(K_SBOT, K_LOW)) return true;
    return false;
  }
}

// ---------- generation ----------

function valueNoise(r, w, h, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = sm(fx - ix), ty = sm(fy - iy);
    const v00 = g[iy * gw + ix], v10 = g[iy * gw + ix + 1], v01 = g[(iy + 1) * gw + ix], v11 = g[(iy + 1) * gw + ix + 1];
    out[y * w + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  }
  return out;
}

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

// opts: {w,h,seed,plateaus,reserve:{x,y,w,h},fill(land fraction bias)}
export function generateIsland(opts) {
  const { w, h, seed } = opts;
  const r = rng(seed);
  const m = new TerrainMap(w, h);
  m.flatColor = opts.flatColor || 1; m.highColor = opts.highColor || 3;
  const n1 = valueNoise(r, w, h, 7), n2 = valueNoise(r, w, h, 3);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / (w / 2 - 3), dy = (y - cy) / (h / 2 - 3);
    const d = Math.sqrt(dx * dx + dy * dy);
    const v = (1 - d) * 1.25 + (n1[m.i(x, y)] - 0.5) * 0.9 + (n2[m.i(x, y)] - 0.5) * 0.3 + (opts.bias || 0);
    m.land[m.i(x, y)] = (v > 0.32 && x > 2 && y > 2 && x < w - 3 && y < h - 3) ? 1 : 0;
  }
  // keep the reserved core solid land
  if (opts.reserve) {
    const R = opts.reserve;
    for (let y = R.y - 1; y <= R.y + R.h; y++) for (let x = R.x - 1; x <= R.x + R.w; x++) if (m.in(x, y)) m.land[m.i(x, y)] = 1;
  }
  // smoothing
  for (let pass = 0; pass < 3; pass++) {
    const nl = m.land.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let c = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (ox || oy) c += m.land[m.i(x + ox, y + oy)];
      if (c >= 5) nl[m.i(x, y)] = 1; else if (c <= 3) nl[m.i(x, y)] = 0;
    }
    m.land = nl;
  }
  // keep largest island, fill lakes
  const lands = components(m, (x, y) => m.land[m.i(x, y)] === 1).sort((a, b) => b.length - a.length);
  m.land.fill(0);
  for (const [x, y] of lands[0]) m.land[m.i(x, y)] = 1;
  const waters = components(m, (x, y) => m.land[m.i(x, y)] === 0);
  for (const c of waters) if (!c.some(([x, y]) => x === 0 || y === 0 || x === w - 1 || y === h - 1)) for (const [x, y] of c) m.land[m.i(x, y)] = 1;
  // trim spurs (cells with <=1 orthogonal land neighbour)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!m.land[m.i(x, y)]) continue;
      const c = m.land[m.i(x - 1, y)] + m.land[m.i(x + 1, y)] + m.land[m.i(x, y - 1)] + m.land[m.i(x, y + 1)];
      if (c <= 1) { m.land[m.i(x, y)] = 0; changed = true; }
    }
    if (!changed) break;
  }

  // plateaus
  const reserved = (x, y) => {
    for (const R of [opts.reserve, ...(opts.extraReserves || [])]) {
      if (R && x >= R.x - 2 && x < R.x + R.w + 2 && y >= R.y - 2 && y < R.y + R.h + 3) return true;
    }
    return false;
  };
  const allLandAround = (x, y) => {
    for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy)) return false;
    return true;
  };
  let placed = 0, tries = 0;
  const target = opts.plateaus ?? 4;
  while (placed < target && tries++ < 400) {
    const pw = r.int(3, 7), ph = r.int(2, 4);
    const px = r.int(3, w - pw - 4), py = r.int(3, h - ph - 5);
    let ok = true;
    for (let y = py - 1; y <= py + ph + 1 && ok; y++) for (let x = px - 1; x <= px + pw && ok; x++) {
      if (reserved(x, y)) ok = false;
      else if (y < py + ph && !allLandAround(x, y)) ok = false;
    }
    // keep a one-row gap below so the new cliff never lands on another plateau's top edge
    for (let x = px - 1; x <= px + pw && ok; x++) if (m.isHigh(x, py + ph + 1) || m.isHigh(x, py + ph)) ok = false;
    if (!ok) continue;
    for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) m.high[m.i(x, y)] = 1;
    placed++;
  }
  // remove high cells that would make a cliff cell whose own column is surrounded oddly (1-row tall slivers)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (m.isHigh(x, y) && !m.isHigh(x, y - 1) && !m.isHigh(x, y + 1)) m.high[m.i(x, y)] = 0;
  }
  // stairs
  const plats = components(m, (x, y) => m.isHigh(x, y));
  for (const p of plats) {
    const cands = [];
    for (const [x, y] of p) {
      if (m.isHigh(x, y + 1)) continue; // need bottom edge
      for (const side of [-1, 1]) {
        const sx = x + side;
        const lowOpen = (cx, cy) => m.isLand(cx, cy) && !m.isHigh(cx, cy) && !m.isHigh(cx, cy - 1);
        if (m.isHigh(sx, y)) continue;               // x must be the edge cell in this row
        if (!lowOpen(sx, y)) continue;                // stair top: land, not plateau, not a cliff
        if (!m.isLand(sx, y + 1) || m.isHigh(sx, y + 1)) continue; // stair bottom
        if (!lowOpen(sx, y + 2)) continue;            // exit cell below the stairs
        if (!lowOpen(sx - side, y + 2) && !lowOpen(sx - side, y + 1)) continue;
        if (m.stairAt(sx - 1, y) || m.stairAt(sx + 1, y) || m.stairAt(sx, y - 1) || m.stairAt(sx, y + 2)) continue;
        cands.push([sx, y, -side]);
      }
    }
    if (!cands.length) {
      // no valid stairs: flatten this plateau
      for (const [x, y] of p) m.high[m.i(x, y)] = 0;
      continue;
    }
    const nStairs = Math.min(cands.length, p.length > 14 ? 2 : 1);
    const used = [];
    for (let k = 0; k < nStairs; k++) {
      let best = null, bd = -1;
      for (const c of cands) {
        const d = used.length ? Math.min(...used.map(u => Math.abs(u[0] - c[0]) + Math.abs(u[1] - c[1]))) : r() * 10;
        if (d > bd) { bd = d; best = c; }
      }
      if (!best || (used.length && bd < 4)) break;
      used.push(best);
      const [sx, sy, plateauSide] = best;
      m.stair[m.i(sx, sy)] = 1; m.stair[m.i(sx, sy + 1)] = 2;
      m.stairSide[m.i(sx, sy)] = m.stairSide[m.i(sx, sy + 1)] = plateauSide;
    }
  }
  m.computeKinds();

  // decorations
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = m.kindAt(x, y);
    if ((k === K_LOW || k === K_HIGH) && !reserved(x, y) && r.chance(0.035)) m.decor.push({ type: r.chance(0.6) ? 'bush' : 'rock', x, y, v: r.int(1, 4), ox: r.int(-12, 12), oy: r.int(-8, 8), t: r() * 5 });
    if (k === K_WATER) {
      let near = false;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (m.isLand(x + ox, y + oy)) near = true;
      if (near && !m.isLand(x, y - 1) && !m.isLand(x, y + 1) && !m.isLand(x - 1, y) && !m.isLand(x + 1, y) && r.chance(0.04)) m.decor.push({ type: 'wrock', x, y, v: r.int(1, 4), t: r() * 5 });
    }
  }
  return m;
}

// ---------- rendering ----------

function tileFor(L, R, U, D) {
  const col = L && R ? 1 : (!L && R ? 0 : (L && !R ? 2 : 3));
  const row = U && D ? 1 : (!U && D ? 0 : (U && !D ? 2 : 3));
  return [col, row];
}

// Static terrain (land, shadows, plateaus, cliffs, stairs) to an offscreen canvas.
export function renderTerrain(m) {
  const cv = document.createElement('canvas');
  cv.width = m.w * T; cv.height = m.h * T;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const flat = SHEETS['tiles' + m.flatColor].img, hi = SHEETS['tiles' + m.highColor].img;
  const tile = (img, col, row, x, y) => c.drawImage(img, col * T, row * T, T, T, x * T, y * T, T, T);
  // flat ground
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!m.isLand(x, y)) continue;
    const [col, row] = tileFor(m.isLand(x - 1, y), m.isLand(x + 1, y), m.isLand(x, y - 1), m.isLand(x, y + 1));
    tile(flat, col, row, x, y);
  }
  // shadows under elevated ground, shifted one tile down
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (m.isHigh(x, y)) drawSprite(c, 'shadow', x * T + 32, y * T + 32 + 64, 0);
  }
  // elevated ground: stair tops count as connected for the grass edges
  const hiConn = (x, y) => m.isHigh(x, y) || m.stairAt(x, y) === 1;
  const cliffConn = (x, y) => m.isCliff(x, y) || m.stairAt(x, y) === 2;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (m.isHigh(x, y)) {
      const [col, row] = tileFor(hiConn(x - 1, y), hiConn(x + 1, y), m.isHigh(x, y - 1), m.isHigh(x, y + 1));
      tile(hi, 5 + col, row, x, y);
    } else if (m.isCliff(x, y)) {
      const L = cliffConn(x - 1, y), R = cliffConn(x + 1, y);
      const col = L && R ? 1 : (!L && R ? 0 : (L && !R ? 2 : 3));
      tile(hi, 5 + col, m.isLand(x, y) ? 4 : 5, x, y);
    }
    const s = m.stairAt(x, y);
    if (s) {
      // plateau to the right of the stair uses the left-hand stair art (column 0), plateau to the left uses column 3
      const col = m.stairSide[m.i(x, y)] > 0 ? 0 : 3;
      tile(hi, col, s === 1 ? 4 : 5, x, y);
    }
  }
  return cv;
}

// Cells that get animated foam drawn under them (land touching water, water cliffs)
export function foamCells(m, r) {
  const out = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const land = m.isLand(x, y);
    const waterCliff = !land && m.isCliff(x, y);
    if (!land && !waterCliff) continue;
    let touches = false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy) && !(m.isCliff(x + ox, y + oy) && ox === 0 && oy === 0)) touches = true;
    if (touches || waterCliff) out.push({ x, y, t: r() * 1.6 });
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
