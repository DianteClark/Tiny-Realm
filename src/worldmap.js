// World map renderer (4.0): the endless sea chart. Pure canvas: draw(ctx, cam, fog, opts)
// draws into a context sized in device pixels; cam = { x, y, z } with (x, y) the world point
// at the canvas top-left and z = device pixels per world unit.
//
// Cost control: every island is rendered once per mip size to an offscreen canvas (LRU
// cached); sprites are pre-downscaled in power-of-two steps so they can be blitted with
// smoothing off without shimmering; per-chunk sea details and clouds are generated once;
// only the chunks in view are visited each frame.
import { SHEETS as DEFAULT_SHEETS } from './assets.js';
import { rng } from './terrain.js';
import { CHUNK, FOG_CELL, chunkOf, shapeLand, shapeHigh, ringInfo, ringIndexAtDist } from './ocean.js';
import { drawSigil, drawAllegiance, RELATION_COLORS } from './heraldry.js';

const SEA = '#47aba9';
const FOG_RGB = [36, 82, 98];
const FONT = 'BoldPixels, monospace';

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// tile colours [flat, elevated] per region / kind (tileset numbers 1..5)
const REGION_COLORS = { goblin: [4, 2], gnome: [3, 2], badlands: [4, 1], reef: [5, 3], crypt: [2, 5] };
const TEAM_TILES = { blue: [1, 3], red: [4, 1], yellow: [1, 2], purple: [2, 5], black: [5, 2] };
const CAMP = { goblin: 'goblinHut', gnome: 'gnomeHut', badlands: 'cave', reef: 'fishHut', crypt: 'deadTree' };
const REGION_NAMES = { goblin: 'Goblin', gnome: 'Gnome', badlands: 'Gnoll', reef: 'Shark', crypt: 'Crypt' };

function tileFor(L, R, U, D) {
  const col = L && R ? 1 : (!L && R ? 0 : (L && !R ? 2 : 3));
  const row = U && D ? 1 : (!U && D ? 0 : (U && !D ? 2 : 3));
  return [col, row];
}

export class WorldMapRenderer {
  constructor(ocean, sheets = DEFAULT_SHEETS) {
    this.ocean = ocean;
    this.S = sheets;
    this.mips = new Map();      // "key|frame|level" -> canvas
    this.isles = new Map();     // "id|ts" -> { cv, ... } (LRU)
    this.meta = new Map();      // island id -> anchor info
    this.chunkFx = new Map();   // "cx,cy" -> { flecks, rocks, clouds }
    this.fogMask = null;        // { cv, key }
    this.maxIsles = 160;
    this.fogPixel = 1;          // fog texel size in units of ~4 device px (set to dpr for chunkier fog)
    this.stats = { islands: 0, chunks: 0, renders: 0 };
    this.extra = {};            // canvases made from pack art (e.g. the ruined tower)
  }

  sheet(key) {
    if (this.S[key]) return this.S[key];
    if (key === 'ruin' && !this.extra.ruin) this.extra.ruin = this.makeRuin();
    return this.extra[key];
  }

  // A broken, weathered tower: the pack's blue Tower, desaturated, top knocked off.
  makeRuin() {
    const src = this.S.b_Tower;
    if (!src || !src.img) return null;
    const w = src.img.width, h = src.img.height, cv = mkCanvas(w, h), c = cv.getContext('2d');
    c.drawImage(src.img, 0, 0);
    const img = c.getImageData(0, 0, w, h), d = img.data, R = rng(77);
    // jagged break line: everything above it is cleared
    const cut = [];
    let y = Math.round(h * 0.5);
    for (let x = 0; x < w; x += 4) { y += Math.round((R() - 0.5) * 10); y = Math.max(Math.round(h * 0.38), Math.min(Math.round(h * 0.62), y)); cut.push(y); }
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const k = (py * w + px) * 4;
      if (py < cut[px >> 2]) { d[k + 3] = 0; continue; }
      const g = d[k] * 0.3 + d[k + 1] * 0.55 + d[k + 2] * 0.15;
      d[k] = g * 0.92 + 8; d[k + 1] = g * 0.9 + 6; d[k + 2] = g * 0.82;
    }
    c.putImageData(img, 0, 0);
    return { key: 'ruin', img: cv, fw: w, fh: h, foot: src.foot, cx: w / 2, frames: 1, fps: 1 };
  }

  // ---------- downscaled sprite frames ----------
  // level L = 1/2^L scale, built by halving from the level above with smoothing on.
  mip(key, frame, level, whole = false) {
    const id = key + '|' + (whole ? 'W' : frame) + '|' + level;
    let cv = this.mips.get(id);
    if (cv) return cv;
    const s = this.sheet(key);
    if (!s || !s.img) return null;
    if (level === 0) {
      if (whole) { cv = mkCanvas(s.img.width, s.img.height); cv.getContext('2d').drawImage(s.img, 0, 0); }
      else { cv = mkCanvas(s.fw, s.fh); cv.getContext('2d').drawImage(s.img, (frame % s.frames) * s.fw, 0, s.fw, s.fh, 0, 0, s.fw, s.fh); }
    } else {
      const up = this.mip(key, frame, level - 1, whole);
      cv = mkCanvas(up.width / 2, up.height / 2);
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(up, 0, 0, up.width, up.height, 0, 0, cv.width, cv.height);
    }
    this.mips.set(id, cv);
    return cv;
  }
  // whole tile atlas at 64/2^level px per tile
  atlas(n, level) { return this.mip('tiles' + n, 0, level, true); }

  // Draws a sprite frame with its feet at (x, y) device px, scale = output px per source px.
  sprite(ctx, key, x, y, scale, frame = 0) {
    const s = this.sheet(key);
    if (!s || !s.img || scale <= 0) return;
    const level = Math.max(0, Math.min(6, Math.floor(Math.log2(1 / scale))));
    const cv = this.mip(key, frame % Math.max(1, s.frames), level);
    if (!cv) return;
    const dw = Math.round(s.fw * scale), dh = Math.round(s.fh * scale);
    ctx.drawImage(cv, 0, 0, cv.width, cv.height, Math.round(x - s.cx * scale), Math.round(y - s.foot * scale), dw, dh);
  }

  // ---------- islands ----------
  palette(isl) {
    switch (isl.kind) {
      case 'home': return [1, 3];
      case 'kingdom': return TEAM_TILES[isl.kingdom.color] || [1, 3];
      case 'lair': case 'ruins': return REGION_COLORS[isl.region] || [4, 2];
      case 'abyss': return [5, 5];
      case 'story': return [3, 2];
      case 'port': return [1, 3];
      default: return (isl.seed & 1) ? [3, 1] : [2, 3];
    }
  }

  // where the island's main icon stands (in shape cells), and land cells for decor
  anchor(isl) {
    let m = this.meta.get(isl.id);
    if (m) return m;
    const s = isl.shape, n = s.n;
    let sx = 0, sy = 0, k = 0, hx = 0, hy = 0, hk = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (shapeLand(s, x, y)) { sx += x; sy += y; k++; }
      if (shapeHigh(s, x, y)) { hx += x; hy += y; hk++; }
    }
    // prefer the plateau (icons stand on high ground), else the land centroid
    let cx = hk >= 4 ? hx / hk : sx / k, cy = hk >= 4 ? hy / hk : sy / k;
    // feet a little below the centre, on a land cell with land under it
    let best = null, bd = 1e9;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!shapeLand(s, x, y) || !shapeLand(s, x, y + 1) || !shapeLand(s, x - 1, y) || !shapeLand(s, x + 1, y)) continue;
      if (hk >= 4 && !shapeHigh(s, x, y)) continue;
      const d = (x - cx) ** 2 + (y - (cy + 0.6)) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) best = [Math.floor(n / 2), Math.floor(n / 2)];
    const cell = (2 * isl.r) / n;
    // world position of the feet: bottom part of the chosen cell
    m = { ax: isl.x - isl.r + (best[0] + 0.5) * cell, ay: isl.y - isl.r + (best[1] + 0.8) * cell, cell, cx: best[0], cy: best[1] };
    this.meta.set(isl.id, m);
    if (this.meta.size > 4000) this.meta.delete(this.meta.keys().next().value);
    return m;
  }

  // Renders the island once at ts px per shape cell (ts = 4, 8, 16 or 32).
  islandCanvas(isl, ts) {
    const key = isl.id + '|' + ts;
    let e = this.isles.get(key);
    if (e) { this.isles.delete(key); this.isles.set(key, e); return e; }
    this.stats.renders++;
    const s = isl.shape, n = s.n, level = Math.round(Math.log2(64 / ts));
    const PADX = 1, PADT = 2, PADB = 1;
    const cv = mkCanvas((n + PADX * 2) * ts, (n + PADT + PADB) * ts), c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    const [cFlat, cHigh] = this.palette(isl);
    const flat = this.atlas(cFlat, level), high = this.atlas(cHigh, level);
    const land = (x, y) => shapeLand(s, x, y), up = (x, y) => shapeHigh(s, x, y);
    const X = x => (x + PADX) * ts, Y = y => (y + PADT) * ts;
    const tile = (img, col, row, x, y) => c.drawImage(img, col * ts, row * ts, ts, ts, X(x), Y(y), ts, ts);
    // foam under every coast cell
    const foam = this.mip('foam', 0, level);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!land(x, y)) continue;
      let coast = false;
      for (let j = -1; j <= 1 && !coast; j++) for (let i = -1; i <= 1; i++) if (!land(x + i, y + j)) { coast = true; break; }
      if (coast && foam) c.drawImage(foam, X(x) - ts, Y(y) - ts, ts * 3, ts * 3);
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!land(x, y)) continue;
      const [col, row] = tileFor(land(x - 1, y), land(x + 1, y), land(x, y - 1), land(x, y + 1));
      tile(flat, col, row, x, y);
    }
    // plateau: shadow, elevated top, cliff row under its bottom edge
    const shadow = this.mip('shadow', 0, level);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (up(x, y) && shadow) c.drawImage(shadow, X(x) - ts, Y(y), ts * 3, ts * 3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (up(x, y)) {
        const [col, row] = tileFor(up(x - 1, y), up(x + 1, y), up(x, y - 1), up(x, y + 1));
        tile(high, 5 + col, row, x, y);
      } else if (up(x, y - 1)) {
        const Lc = up(x - 1, y - 1) && !up(x - 1, y), Rc = up(x + 1, y - 1) && !up(x + 1, y);
        const col = Lc && Rc ? 1 : (!Lc && Rc ? 0 : (Lc && !Rc ? 2 : 3));
        tile(high, 5 + col, 4, x, y);
      }
    }
    // decorations, kept away from the icon spot
    const m = this.anchor(isl), R = rng(isl.seed ^ 0xDEC0);
    const decor = [];
    const iconBox = (x, y) => isl.kind !== 'wild' && Math.abs(x - m.cx) <= 2 && y - m.cy >= -3 && y - m.cy <= 1;
    const free = (x, y) => land(x, y) && !iconBox(x, y) && up(x, y) === up(x, y + 1) && land(x, y + 1);
    const cells = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (free(x, y)) cells.push([x, y]);
    const take = k => { const out = []; for (let i = 0; i < k && cells.length; i++) out.push(cells.splice(Math.floor(R() * cells.length), 1)[0]); return out; };
    const kindDecor = {
      wild: [['tree', 3 + (n >> 2)], ['bush', 2], ['rock', 1]],
      home: [['tree', 3], ['bush', 2]],
      kingdom: [['tree', 2], ['bush', 1]],
      lair: isl.region === 'crypt' ? [['bones', 2], ['skull', 1], ['rock', 1]] : isl.region === 'badlands' ? [['rock', 3], ['bones', 1]] : isl.region === 'reef' ? [['rock', 2], ['bush', 1]] : [['tree', 2], ['bush', 2]],
      ruins: [['rock', 3], ['stump', 2], ['bones', 1]],
      port: [['bush', 2], ['tree', 1]],
      story: [['tree', 2], ['rock', 1]],
      abyss: [['bones', 3], ['skull', 2]],
    }[isl.kind] || [];
    for (const [type, k] of kindDecor) for (const [x, y] of take(k)) decor.push({ type, x, y, v: 1 + Math.floor(R() * 4), j: R() });
    decor.sort((a, b) => a.y - b.y);
    const sc = ts / 64;
    for (const d of decor) {
      const fx = X(d.x) + ts / 2 + (d.j - 0.5) * ts * 0.4, fy = Y(d.y) + ts * 0.85;
      const k = d.type === 'tree' ? 'tree' + d.v : d.type === 'bush' ? 'bush' + d.v : d.type === 'rock' ? 'rock' + d.v : d.type === 'stump' ? 'stump' + d.v : d.type === 'skull' ? 'skullSpike' + (1 + (d.v & 1)) : 'bones' + (1 + (d.v % 3));
      const mul = d.type === 'tree' ? 0.62 : d.type === 'bush' ? 0.7 : d.type === 'skull' ? 0.8 : 1;
      this.spriteInto(c, k, fx, fy, sc * mul);
    }
    if (isl.kind === 'abyss') {
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(34,12,48,0.58)'; c.fillRect(0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'source-over';
    }
    e = { cv, padX: PADX, padT: PADT };
    this.isles.set(key, e);
    if (this.isles.size > this.maxIsles) {
      const old = this.isles.keys().next().value; const o = this.isles.get(old);
      o.cv.width = o.cv.height = 0; this.isles.delete(old);
    }
    return e;
  }
  // sprite into an offscreen canvas at a fixed scale (one-off)
  spriteInto(c, key, x, y, scale) {
    const s = this.sheet(key);
    if (!s || !s.img) return;
    const level = Math.max(0, Math.min(6, Math.floor(Math.log2(1 / scale))));
    const cv = this.mip(key, 0, level);
    c.drawImage(cv, 0, 0, cv.width, cv.height, Math.round(x - s.cx * scale), Math.round(y - s.foot * scale), Math.round(s.fw * scale), Math.round(s.fh * scale));
  }

  // ---------- per-chunk sea details ----------
  fx(cx, cy) {
    const key = cx + ',' + cy;
    let f = this.chunkFx.get(key);
    if (f) return f;
    const R = rng((cx * 73856093) ^ (cy * 19349663) ^ (this.ocean.seed * 83492791) ^ 0x5EA);
    const bx = cx * CHUNK - CHUNK / 2, by = cy * CHUNK - CHUNK / 2;
    const isl = this.ocean.chunk(cx, cy).islands;
    const clear = (x, y, pad) => isl.every(s => Math.hypot(s.x - x, s.y - y) > s.r + pad);
    const flecks = [];
    for (let i = 0; i < 26; i++) {
      const x = bx + R() * CHUNK, y = by + R() * CHUNK;
      if (clear(x, y, 14)) flecks.push({ x, y, len: 5 + R() * 9, ph: Math.floor(R() * 4), sp: R() * 6.28 });
    }
    const rocks = [];
    const nr = R() < 0.5 ? 0 : R() < 0.7 ? 1 : 2;
    for (let i = 0; i < nr; i++) {
      const x = bx + 30 + R() * (CHUNK - 60), y = by + 30 + R() * (CHUNK - 60);
      if (clear(x, y, 40)) rocks.push({ x, y, v: 1 + Math.floor(R() * 4), ph: R() * 3 });
    }
    if (R() < 0.006) rocks.push({ x: bx + CHUNK / 2, y: by + CHUNK / 2 + 20, duck: true, ph: 0 });
    const clouds = [];
    for (let i = 0; i < 3; i++) clouds.push({ x: bx + R() * CHUNK, y: by + R() * CHUNK, v: 1 + Math.floor(R() * 8), w: 230 + R() * 140, ph: R() * 6.28, sp: 0.03 + R() * 0.04 });
    f = { flecks, rocks, clouds };
    this.chunkFx.set(key, f);
    if (this.chunkFx.size > 1500) this.chunkFx.delete(this.chunkFx.keys().next().value);
    return f;
  }

  // ---------- visibility ----------
  islandVisible(isl, fog) {
    if (!fog || isl.kind === 'home') return true;
    if (fog.isRevealed(isl.x, isl.y)) return true;
    const k = isl.r * 0.6;
    return fog.isRevealed(isl.x - k, isl.y) || fog.isRevealed(isl.x + k, isl.y) || fog.isRevealed(isl.x, isl.y - k) || fog.isRevealed(isl.x, isl.y + k);
  }

  // ---------- main draw ----------
  draw(ctx, cam, fog = null, opts = {}) {
    const t = opts.t || 0, dpr = opts.dpr || 1, z = cam.z;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const x0 = cam.x, y0 = cam.y, x1 = cam.x + W / z, y1 = cam.y + H / z;
    const SX = wx => Math.round((wx - cam.x) * z), SY = wy => Math.round((wy - cam.y) * z);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = SEA; ctx.fillRect(0, 0, W, H);

    const c0 = chunkOf(x0), c1 = chunkOf(x1), r0 = chunkOf(y0), r1 = chunkOf(y1);
    this.stats.chunks = (c1 - c0 + 1) * (r1 - r0 + 1);
    const islands = [];
    // sea flecks: 4 phase buckets, one fill each
    const fl = Math.max(1, Math.round(1.5 * dpr));
    const buckets = [[], [], [], []];
    const showRocks = z * 64 * 0.45 >= 10;
    const rockList = [];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const F = this.fx(cx, cy);
      for (const f of F.flecks) buckets[f.ph].push(f);
      if (showRocks) for (const r of F.rocks) rockList.push(r);
      for (const s of this.ocean.chunk(cx, cy).islands) {
        if (s.x + s.r * 1.3 < x0 || s.x - s.r * 1.3 > x1 || s.y + s.r * 1.4 < y0 || s.y - s.r * 1.6 > y1) continue;
        islands.push(s);
      }
    }
    for (let b = 0; b < 4; b++) {
      const a = 0.08 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.3 + b * 1.57));
      ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.beginPath();
      for (const f of buckets[b]) {
        const dx = Math.sin(t * 0.6 + f.sp) * 4;
        ctx.rect(SX(f.x + dx), SY(f.y), Math.max(2, Math.round(f.len * z)), fl);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of rockList) {
      if (fog && !fog.isRevealed(r.x, r.y)) continue;
      if (r.duck) this.sprite(ctx, 'duck', SX(r.x), SY(r.y + Math.sin(t * 2) * 2), z * 0.6);
      else this.sprite(ctx, 'wrock' + r.v, SX(r.x), SY(r.y), z * 0.45, Math.floor(t * 6 + r.ph * 5));
    }

    // ring borders under the islands
    this.drawRings(ctx, cam, W, H, dpr, false);

    // islands
    const vis = islands.filter(s => this.islandVisible(s, fog));
    vis.sort((a, b) => a.y - b.y);
    this.stats.islands = vis.length;
    for (const s of vis) {
      const cell = (2 * s.r) / s.shape.n, cellPx = cell * z;
      const ts = cellPx <= 4 ? 4 : cellPx <= 8 ? 8 : cellPx <= 16 ? 16 : 32;
      const e = this.islandCanvas(s, ts);
      const gx = s.x - s.r - e.padX * cell, gy = s.y - s.r - e.padT * cell;
      const dx0 = SX(gx), dy0 = SY(gy), dx1 = SX(gx + (e.cv.width / ts) * cell), dy1 = SY(gy + (e.cv.height / ts) * cell);
      ctx.drawImage(e.cv, 0, 0, e.cv.width, e.cv.height, dx0, dy0, dx1 - dx0, dy1 - dy0);
    }
    // icons, sorted by feet
    for (const s of vis) this.drawIcon(ctx, s, SX, SY, z, t, dpr, opts);

    // fog over everything not yet charted
    if (fog) this.drawFog(ctx, cam, fog, W, H, t, c0, c1, r0, r1);

    // ring names, labels, marks, selection
    this.drawRings(ctx, cam, W, H, dpr, true, vis, opts);
    if (opts.selectedId) {
      const s = vis.find(v => v.id === opts.selectedId);
      if (s) this.drawSelection(ctx, s, SX, SY, z, t, dpr);
    }
    this.drawLabels(ctx, vis, SX, SY, z, dpr, opts);
    if (opts.marks) for (const m of opts.marks) this.drawMark(ctx, m, SX, SY, z, t, dpr);
    ctx.restore();
  }

  drawIcon(ctx, s, SX, SY, z, t, dpr, opts) {
    const m = this.anchor(s), fx = SX(m.ax), fy = SY(m.ay);
    const r = s.r * z;
    const relation = s.kind === 'home' ? 'own' : s.kind === 'kingdom' ? (opts.relations ? opts.relations(s.kingdom.id) : 'enemy') : null;
    switch (s.kind) {
      case 'home': case 'kingdom': {
        const key = s.kind === 'home' || s.kingdom.color === 'blue' ? 'b_Castle' : `b${s.kingdom.color}_Castle`;
        const w = s.r * (s.kind === 'home' ? 1.05 : 1.15) * z, sc = w / 320;
        drawAllegiance(ctx, fx, fy - 2 * sc, w * 0.95, relation, t);
        if (s.kind === 'home' && opts.homeTier != null && opts.homeTier < 3) {
          // before the Castle is raised home is a hall of wooden houses, as on the island itself
          const h = sc * 1.25, put = (k, dx, k2) => this.sprite(ctx, k, Math.round(fx + dx * h), fy, h * k2);
          if (opts.homeTier <= 1) { put('b_House1', -52, 0.75); put('b_House3', 40, 1); }
          else { put('b_House2', -92, 0.9); put('b_House1', 94, 0.9); put('b_House3', 0, 1.1); }
        } else this.sprite(ctx, key, fx, fy, sc);
        if (s.kind === 'kingdom' && r >= 14) {
          const sz = Math.max(12, Math.min(40, Math.round(r * 0.42 / dpr) * dpr));
          drawSigil(ctx, s.kingdom.sigil, Math.round(fx + w * 0.5 + sz * 0.15), Math.round(fy - w * 0.62), sz);
        }
        break;
      }
      case 'lair': {
        const key = CAMP[s.region] || 'goblinHut', S = this.S[key];
        const w = s.r * (s.boss ? 1.0 : 0.85) * z, sc = S && S.fw ? w / S.fw : 0.2;
        this.sprite(ctx, key, fx, fy, sc, S && S.frames > 1 ? Math.floor(t * 8) : 0);
        if (s.boss && r >= 12) this.drawSkullBadge(ctx, fx + w * 0.45, fy - w * 0.9, Math.max(8, Math.round(r * 0.22)));
        break;
      }
      case 'port': {
        const w = s.r * 0.6 * z, sc = w / 128;
        drawAllegiance(ctx, fx, fy - 2 * sc, w * 1.3, 'neutral', t);
        this.sprite(ctx, 'b_Market', fx, fy, sc);
        break;
      }
      case 'ruins': {
        const w = s.r * 0.85 * z, sc = w / 128;
        this.sprite(ctx, 'rock2', fx - 50 * sc, fy - 4 * sc, sc * 1.2);
        this.sprite(ctx, 'ruin', fx, fy, sc);
        this.sprite(ctx, 'rock4', fx + 52 * sc, fy + 8 * sc, sc);
        break;
      }
      case 'abyss': {
        const w = s.r * 1.2 * z, sc = w / 256;
        const bob = Math.round(Math.sin(t * 1.5) * 2 * dpr);
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#12061a';
        ctx.beginPath(); ctx.ellipse(fx, fy - 4 * sc, w * 0.32, w * 0.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        this.sprite(ctx, 'av_skull', fx, fy - w * 0.62 + bob, sc);
        break;
      }
      case 'story': this.drawBanner(ctx, fx, fy, Math.max(10, s.r * 0.75 * z), s.chapter, t, dpr); break;
    }
  }

  drawSkullBadge(ctx, x, y, size) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = '#1b1720'; ctx.beginPath(); ctx.arc(x, y, size / 2 + 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8372d'; ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
    const p = Math.max(1, Math.round(size / 8));
    ctx.fillStyle = '#f2ead2';
    ctx.fillRect(x - 2 * p, y - 2 * p, 4 * p, 3 * p); ctx.fillRect(x - p, y + p, 2 * p, p);
    ctx.fillStyle = '#1b1720'; ctx.fillRect(x - 2 * p + p / 2 | 0, y - p, p, p); ctx.fillRect(x + p / 2 | 0, y - p, p, p);
  }

  // gold swallow-tail banner on a pole with the chapter number; h = pole height px
  drawBanner(ctx, x, y, h, chapter, t, dpr) {
    x = Math.round(x); y = Math.round(y); h = Math.round(h);
    const p = Math.max(1, Math.round(h / 22));
    const pw = Math.max(2, p * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y, pw * 2.5, pw, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1b1720'; ctx.fillRect(x - pw / 2 - p, y - h - p, pw + 2 * p, h + p);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x - pw / 2, y - h, pw, h);
    ctx.fillStyle = '#f2c94c'; ctx.fillRect(x - pw, y - h - 2 * p, pw * 2, 2 * p);
    const bw = Math.round(h * 0.62), bh = Math.round(h * 0.5), bx = x + pw / 2, by = y - h + p * 2;
    const wave = Math.round(Math.sin(t * 3) * p);
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by + wave); ctx.lineTo(bx + bw - bw * 0.22, by + bh / 2 + wave); ctx.lineTo(bx + bw, by + bh + wave); ctx.lineTo(bx, by + bh);
    ctx.closePath();
    ctx.fillStyle = '#1b1720'; ctx.lineWidth = p * 2; ctx.strokeStyle = '#1b1720'; ctx.stroke();
    ctx.fillStyle = '#e8b93a'; ctx.fill();
    ctx.fillStyle = '#c99a2e'; ctx.fillRect(bx, by + bh - p * 2, Math.round(bw * 0.7), p * 2);
    const fs = Math.max(8, Math.round(bh * 0.8));
    ctx.font = `${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5e3c1b'; ctx.fillText(String(chapter), Math.round(bx + bw * 0.4), Math.round(by + bh / 2 + wave / 2) + p);
    ctx.fillStyle = '#fff6d8'; ctx.fillText(String(chapter), Math.round(bx + bw * 0.4), Math.round(by + bh / 2 + wave / 2));
    ctx.textBaseline = 'alphabetic';
  }

  // ---------- rings ----------
  drawRings(ctx, cam, W, H, dpr, labels, vis = [], opts = {}) {
    const z = cam.z, ox = -cam.x * z, oy = -cam.y * z;
    // distance range of the view from the home centre
    const nx = Math.max(cam.x, Math.min(cam.x + W / z, 0)), ny = Math.max(cam.y, Math.min(cam.y + H / z, 0));
    const dMin = Math.hypot(nx, ny);
    let dMax = 0; for (const [px, py] of [[cam.x, cam.y], [cam.x + W / z, cam.y], [cam.x, cam.y + H / z], [cam.x + W / z, cam.y + H / z]]) dMax = Math.max(dMax, Math.hypot(px, py));
    const i0 = ringIndexAtDist(dMin), i1 = ringIndexAtDist(dMax);
    for (let i = Math.max(0, i0 - 1); i <= i1; i++) {
      const R = ringInfo(i), rad = R.r1;
      if (rad < dMin || rad > dMax + 1) continue;
      const pr = rad * z;
      if (!labels) {
        ctx.save();
        ctx.setLineDash([Math.max(4, 10 * dpr), Math.max(4, 8 * dpr)]);
        ctx.lineWidth = Math.max(1, Math.round(2 * dpr));
        ctx.strokeStyle = 'rgba(20,40,50,0.25)';
        ctx.beginPath(); ctx.arc(Math.round(ox), Math.round(oy) + Math.round(dpr), pr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,248,220,0.42)';
        ctx.beginPath(); ctx.arc(Math.round(ox), Math.round(oy), pr, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else {
        // names where the circle crosses the chart, inner ring below the line and outer above; the first
        // spot along the circle that is on screen, clear of the HUD and clear of every island and its label
        const nxt = ringInfo(i + 1), hw = Math.round(64 * dpr), top = (opts.padTop || 0) * dpr, bot = H - (opts.padBottom || 0) * dpr;
        const boxes = vis.filter(v => v.r * z >= 12 * dpr).map(v => { const vx = (v.x - cam.x) * z, vy = (v.y - cam.y) * z, vr = Math.max(v.r * z, 8 * dpr); const lab = vr >= 26 * dpr, hx = lab ? Math.max(vr, 40 * dpr) : vr; return [vx - hx, vy - vr * 1.4, vx + hx, vy + vr + (lab ? 30 * dpr : 0)]; });
        let spot = null;
        for (const deg of [-90, -75, -105, -60, -120, -45, -135, -30, -150, 0, 180, 90, 60, 120]) {
          const a = deg * Math.PI / 180, tx = Math.round(ox + Math.cos(a) * pr), ty = Math.round(oy + Math.sin(a) * pr);
          const r0 = [tx - hw, ty - 20 * dpr, tx + hw, ty + 20 * dpr];
          if (r0[0] < 4 * dpr || r0[2] > W - 4 * dpr || r0[1] < top || r0[3] > bot) continue;
          if (boxes.some(b => b[0] < r0[2] && b[2] > r0[0] && b[1] < r0[3] && b[3] > r0[1])) continue;
          spot = [tx, ty]; break;
        }
        if (!spot) continue;
        const [tx, ty] = spot;
        this.text(ctx, R.name.toUpperCase(), tx, ty + Math.round(16 * dpr), Math.round(10 * dpr), 'rgba(255,248,220,0.75)', dpr);
        this.text(ctx, nxt.name.toUpperCase(), tx, ty - Math.round(7 * dpr), Math.round(10 * dpr), nxt.color, dpr);
      }
    }
  }

  text(ctx, s, x, y, size, color, dpr) {
    ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const o = Math.max(1, Math.round(dpr));
    ctx.fillStyle = 'rgba(20,16,24,0.85)'; ctx.fillText(s, x + o, y + o);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  // ---------- fog ----------
  drawFog(ctx, cam, fog, W, H, t, c0, c1, r0, r1) {
    const z = cam.z, C = FOG_CELL;
    // the mask window snaps to 4-cell steps with a margin, so panning rebuilds it rarely
    const gx0 = Math.floor(Math.floor(cam.x / C) / 4) * 4 - 2, gy0 = Math.floor(Math.floor(cam.y / C) / 4) * 4 - 2;
    const gw = Math.ceil(W / z / C) + 8, gh = Math.ceil(H / z / C) + 8;
    const cellPx = C * z, U = Math.max(1, Math.min(24, Math.round(cellPx / (4 * (this.fogPixel || 1)))));
    const key = `${gx0},${gy0},${gw},${gh},${U},${fog.version}`;
    let fm = this.fogMask;
    if (!fm || fm.key !== key) {
      // revealed field per cell (with a 2-cell apron), blurred twice with a 1-2-1 kernel,
      // upsampled U times and pushed through a smoothstep: round, soft coasts of the unknown
      const P = 2, fw = gw + 2 * P, fh = gh + 2 * P;
      let f = new Float32Array(fw * fh), tmp = new Float32Array(fw * fh);
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) f[j * fw + i] = fog.isCellRevealed(gx0 - P + i, gy0 - P + j) ? 1 : 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { const k = j * fw + i; tmp[k] = (f[k - (i > 0)] + 2 * f[k] + f[k + (i < fw - 1)]) / 4; }
        for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { const k = j * fw + i; f[k] = (tmp[k - (j > 0) * fw] + 2 * tmp[k] + tmp[k + (j < fh - 1) * fw]) / 4; }
      }
      const mw = gw * U, mh = gh * U;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
      if (!fm || fm.cv.width !== mw || fm.cv.height !== mh) fm = { cv: mkCanvas(mw, mh) };
      const c = fm.cv.getContext('2d'), img = c.createImageData(mw, mh), d = img.data;
      for (let y = 0; y < mh; y++) {
        const fy = (y + 0.5) / U - 0.5 + P, j0 = Math.floor(fy), ty = fy - j0;
        for (let x = 0; x < mw; x++) {
          const fx = (x + 0.5) / U - 0.5 + P, i0 = Math.floor(fx), tx = fx - i0, k0 = j0 * fw + i0;
          const v = (f[k0] * (1 - tx) + f[k0 + 1] * tx) * (1 - ty) + (f[k0 + fw] * (1 - tx) + f[k0 + fw + 1] * tx) * ty;
          let a = (0.62 - v) / 0.34; a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a);
          const k = (y * mw + x) * 4;
          d[k] = FOG_RGB[0]; d[k + 1] = FOG_RGB[1]; d[k + 2] = FOG_RGB[2]; d[k + 3] = a * 222;
          if (a > 0) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        }
      }
      c.putImageData(img, 0, 0);
      fm.key = key; fm.U = U; fm.box = bx1 < 0 ? null : [Math.max(0, bx0 - 1), Math.max(0, by0 - 1), Math.min(mw, bx1 + 2), Math.min(mh, by1 + 2)];
      this.fogMask = fm;
    }
    // only the part of the mask that holds any fog (none at all in charted waters); the mask
    // has a few device px per texel, so a plain nearest blit is soft enough and cheap everywhere
    if (fm.box) {
      const [a0, b0, a1, b1] = fm.box, px = C * z / fm.U;
      const dx = (gx0 * C - cam.x) * z, dy = (gy0 * C - cam.y) * z;
      ctx.drawImage(fm.cv, a0, b0, a1 - a0, b1 - b0, dx + a0 * px, dy + b0 * px, (a1 - a0) * px, (b1 - b0) * px);
    }
    // drifting clouds over the unknown, faded out where the sea is charted
    for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
      for (const cl of this.fx(cx, cy).clouds) {
        const x = cl.x + Math.sin(t * cl.sp + cl.ph) * 40, y = cl.y + Math.cos(t * cl.sp * 0.7 + cl.ph) * 12;
        const hw = cl.w * 0.32;
        let k = 0;
        for (const [px, py] of [[x, y], [x - hw, y], [x + hw, y], [x, y - hw * 0.4], [x, y + hw * 0.4]]) if (!fog.isRevealed(px, py)) k++;
        if (k < 3) continue;
        const scale = cl.w * z / 576;
        const sx = (x - cam.x) * z, sy = (y - cam.y) * z;
        if (sx < -cl.w * z || sx > W + cl.w * z || sy < -cl.w * z || sy > H + cl.w * z) continue;
        ctx.globalAlpha = k === 5 ? 0.9 : 0.45;
        this.sprite(ctx, 'cloud' + cl.v, sx, sy, scale);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- labels ----------
  drawLabels(ctx, vis, SX, SY, z, dpr, opts) {
    const fs = Math.round(12 * dpr), small = Math.round(10 * dpr);
    for (const s of vis) {
      const rp = s.r * z;
      if (rp < 26 * dpr) continue;
      const x = SX(s.x), y = SY(s.y + s.r * 0.95) + Math.round(6 * dpr);
      this.text(ctx, s.name, x, y, fs, '#ffffff', dpr);
      if (rp >= 60 * dpr) {
        const sub = this.subtitle(s);
        if (sub) this.text(ctx, sub, x, y + Math.round(12 * dpr), small, s.kind === 'kingdom' ? (RELATION_COLORS[opts.relations ? opts.relations(s.kingdom.id) : 'enemy']) : '#ffe9a8', dpr);
      }
    }
  }
  subtitle(s) {
    switch (s.kind) {
      case 'kingdom': return `${s.kingdom.name}  Lv ${s.level}`;
      case 'lair': return `${REGION_NAMES[s.region] || ''} ${s.boss ? 'stronghold' : 'lair'}  Lv ${s.level}`;
      case 'port': return 'Free port';
      case 'ruins': return `Ruins  Lv ${s.level}`;
      case 'wild': return 'Unclaimed';
      case 'abyss': return 'Endless depths';
      case 'story': return `Chapter ${s.chapter}`;
      case 'home': return 'Your realm';
      default: return '';
    }
  }

  drawSelection(ctx, s, SX, SY, z, t, dpr) {
    const p = 1 + Math.sin(t * 5) * 0.04, r = s.r * z * 1.12 * p;
    ctx.save();
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
    ctx.setLineDash([Math.round(8 * dpr), Math.round(6 * dpr)]); ctx.lineDashOffset = -t * 20 * dpr;
    ctx.strokeStyle = 'rgba(20,16,24,0.6)'; ctx.beginPath(); ctx.arc(SX(s.x), SY(s.y) + Math.round(dpr), r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(SX(s.x), SY(s.y), r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawMark(ctx, m, SX, SY, z, t, dpr) {
    const x = SX(m.x), y = SY(m.y);
    if (m.kind === 'ship') {
      this.sprite(ctx, 'boat', x, y + Math.round(Math.sin(t * 2) * dpr), Math.max(0.12 * dpr, z * 0.35), Math.floor(t * 8));
    } else if (m.kind === 'fleet') { // a kingdom's war fleet: a smaller boat flying its sigil, ringed by its stance toward you
      const sc = Math.max(0.1 * dpr, z * 0.26), bob = Math.round(Math.sin(t * 2 + (m.x % 7)) * dpr);
      drawAllegiance(ctx, x, y + 8 * dpr, Math.max(26 * dpr, z * 70), m.relation || 'enemy', t);
      this.sprite(ctx, 'boat', x, y + bob, sc, Math.floor(t * 8));
      if (m.sigil) drawSigil(ctx, m.sigil, Math.round(x), Math.round(y - Math.max(14 * dpr, z * 52)), Math.max(10 * dpr, Math.round(z * 30)));
    } else if (m.kind === 'target') {
      this.sprite(ctx, 'cursorRing', x, y, Math.max(0.3 * dpr, z * 0.5), Math.floor(t * 10));
    } else {
      const p = Math.max(2, Math.round(2 * dpr)), k = 4 * p;
      ctx.fillStyle = '#1b1720'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-k - 1, -p / 2 - 1, 2 * k + 2, p + 2); ctx.fillRect(-p / 2 - 1, -k - 1, p + 2, 2 * k + 2);
      ctx.fillStyle = '#c8372d'; ctx.fillRect(-k, -p / 2, 2 * k, p); ctx.fillRect(-p / 2, -k, p, 2 * k);
      ctx.restore();
    }
  }

  // island under a canvas point (same pixel space as ctx); fog hides uncharted islands
  hitTest(cam, sx, sy, fog = null) {
    const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z, slack = 14 / cam.z;
    let best = null, bd = Infinity;
    for (const s of this.ocean.islandsIn(wx - slack, wy - slack, wx + slack, wy + slack)) {
      if (fog && !this.islandVisible(s, fog)) continue;
      const d = Math.hypot(s.x - wx, s.y - wy) - s.r;
      if (d <= slack && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // drop cached canvases (e.g. when the map closes)
  release() {
    for (const e of this.isles.values()) e.cv.width = e.cv.height = 0;
    this.isles.clear(); this.mips.clear(); this.fogMask = null;
  }
}
