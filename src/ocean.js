// The world ocean (4.0 "A World of Your Own"): an endless, deterministic, seeded sea of
// islands around the home island at (0,0). Pure data, no DOM.
//
// Units: world units, home island centre at (0,0), +x east, +y south (screen order).
// Chunks are CHUNK x CHUNK world units and are centred on multiples of CHUNK, so chunk
// (0,0) spans [-256,256) on both axes and holds only the home island.
// Every island lies fully inside its chunk with at least GAP/2 of open sea to the chunk
// border, so islands in neighbouring chunks can never touch (gap >= GAP).
import { rng, hashStr } from './terrain.js';
import { makeKingdom } from './heraldry.js';

export const CHUNK = 512;
export const GAP = 120;          // minimum open sea between two island edges
export const HOME_CLEAR = 450;   // no island edge closer than this to the home centre
export const FOG_CELL = 64;      // fog-of-war cell size in world units

// ---------- readable seeds ----------
const WA = ['SALT', 'STORM', 'IRON', 'AMBER', 'ASH', 'BRINE', 'CORAL', 'DUSK', 'EMBER', 'FROST', 'GALE', 'GOLD', 'GREY', 'HOLLOW', 'IVORY', 'JADE',
  'KELP', 'LANTERN', 'MIST', 'MOON', 'NORTH', 'OAK', 'PEARL', 'QUIET', 'RED', 'RIME', 'ROSE', 'RUST', 'SABLE', 'SCARLET', 'SHADOW', 'SILVER',
  'SMOKE', 'STAR', 'STONE', 'SUN', 'SWIFT', 'THORN', 'TIDE', 'VELVET', 'WILD', 'WINTER', 'WRECK', 'AZURE', 'BRASS', 'COPPER', 'CROWN', 'DEEP',
  'DRIFT', 'ELDER', 'FAR', 'GHOST', 'GREEN', 'HARBOR', 'HIGH', 'LONG', 'MERRY', 'OLD', 'OPAL', 'PALE', 'SEA', 'SILENT', 'SKY', 'WHITE'];
const WB = ['RAVEN', 'ANCHOR', 'GULL', 'KRAKEN', 'WHALE', 'SERPENT', 'CROW', 'HERON', 'OTTER', 'SEAL', 'SHARK', 'TURTLE', 'FOX', 'WOLF', 'BEAR', 'STAG',
  'BOAR', 'OWL', 'HAWK', 'FALCON', 'DRAGON', 'GRIFFIN', 'MERMAID', 'SIREN', 'PIRATE', 'CAPTAIN', 'KNIGHT', 'KING', 'QUEEN', 'BARD', 'MONK', 'WITCH',
  'COMPASS', 'CHART', 'SAIL', 'MAST', 'HELM', 'KEEL', 'OAR', 'ROPE', 'BELL', 'BEACON', 'TOWER', 'KEEP', 'HAVEN', 'COVE', 'REEF', 'SHOAL',
  'ISLE', 'BAY', 'CLIFF', 'FJORD', 'HARP', 'BLADE', 'SHIELD', 'SPEAR', 'TORCH', 'CHEST', 'COIN', 'RELIC', 'GOBLET', 'SKULL', 'THRONE', 'BANNER'];
export const SEED_SPACE = WA.length * WB.length * 10000; // 40,960,000 realm seeds

// seed = (word1 * 64 + word2) * 10000 + number, so the words ARE the seed.
export function wordsFromSeed(n) {
  n = (n >>> 0) % SEED_SPACE;
  const num = n % 10000, w = Math.floor(n / 10000);
  return `${WA[Math.floor(w / WB.length)]}-${WB[w % WB.length]}-${String(num).padStart(4, '0')}`;
}
// Exact parse of "SALT-RAVEN-4821" (any case, spaces/dashes/commas as separators). null if not valid.
export function parseSeedWords(str) {
  const p = String(str || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (p.length !== 3) return null;
  const a = WA.indexOf(p[0]), b = WB.indexOf(p[1]);
  if (a < 0 || b < 0 || !/^\d{1,4}$/.test(p[2])) return null;
  return (a * WB.length + b) * 10000 + Number(p[2]);
}
// Like parseSeedWords, but any other text still yields a (stable) seed in the same space.
export function seedFromWords(str) {
  const s = parseSeedWords(str);
  return s != null ? s : hashStr(String(str || '').trim().toUpperCase()) % SEED_SPACE;
}
export function normalizeSeedWords(str) { return wordsFromSeed(seedFromWords(str)); }
export function randomSeedWords() {
  const r = (globalThis.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
  return wordsFromSeed(r % SEED_SPACE);
}

// ---------- rings: the difficulty dial ----------
const RINGS = [
  { name: 'Home Waters', r0: 0, r1: 900, lv: [1, 3], color: '#8fd3c9' },
  { name: 'The Wild Sea', r0: 900, r1: 2200, lv: [4, 8], color: '#e8d27a' },
  { name: 'The Deep', r0: 2200, r1: 4000, lv: [9, 15], color: '#e89a4e' },
  { name: 'The Far Reaches', r0: 4000, r1: 6500, lv: [16, 24], color: '#d8604e' },
];
export const UNCHARTED_W = 3000; // each Uncharted ring beyond 6500 is this wide
const ROMAN = n => { let s = ''; for (const [v, k] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += k; n -= v; } return s; };

export function levelAtDist(d) {
  for (const R of RINGS) if (d < R.r1) return R.lv[0] + Math.floor((d - R.r0) / (R.r1 - R.r0) * (R.lv[1] - R.lv[0] + 1));
  return 25 + Math.floor((d - 6500) / 260);
}
export function ringInfo(index) {
  if (index < RINGS.length) { const R = RINGS[index]; return { index, name: R.name, r0: R.r0, r1: R.r1, color: R.color }; }
  const k = index - RINGS.length; // 0,1,2...
  return { index, name: 'The Uncharted ' + ROMAN(k + 1), r0: 6500 + k * UNCHARTED_W, r1: 6500 + (k + 1) * UNCHARTED_W, color: '#a05a8c' };
}
export function ringIndexAtDist(d) {
  for (let i = 0; i < RINGS.length; i++) if (d < RINGS[i].r1) return i;
  return RINGS.length + Math.floor((d - 6500) / UNCHARTED_W);
}
// { index, name, level, color } for a world point
export function ringOf(x, y) {
  const d = Math.hypot(x, y), index = ringIndexAtDist(d), R = ringInfo(index);
  return { index, name: R.name, level: levelAtDist(d), color: R.color, r0: R.r0, r1: R.r1 };
}

// ---------- names ----------
const PRE = ['Grim', 'Mossy', 'Salt', 'Thorn', 'Ember', 'Gloom', 'Rattle', 'Crooked', 'Hollow', 'Wasp', 'Briar', 'Cinder', 'Ash', 'Bramble', 'Fang', 'Murk', 'Rust', 'Pebble', 'Squall', 'Raven',
  'Gull', 'Kelp', 'Brine', 'Wreck', 'Storm', 'Mist', 'Coral', 'Drift', 'Heron', 'Skull', 'Black', 'Amber', 'Fox', 'Otter', 'Bleak', 'Shingle', 'Tangle', 'Whale', 'Barnacle', 'Shiver'];
const SUF = ['holm', 'reach', 'isle', 'crag', 'hollow', 'point', 'fen', 'skerry', 'rock', 'cove', 'bluff', 'mire', 'shoal', 'spire', 'drift', 'haven', 'key', 'mouth', 'stack', 'tor', 'watch', 'wick'];
const ABYSS_NAME = 'The Abyss';
const STORY_NAMES = ['Wrecker\'s Rest', 'Bellbuoy Isle', 'The Weeping Rocks', 'Lantern Key', 'Crownfall', 'The Drowned Steps', 'Tidegrave', 'The Sunken Throne'];
function islandName(r) { return r.pick(PRE) + r.pick(SUF); }

// ---------- island kinds ----------
export const KINDS = ['home', 'kingdom', 'lair', 'ruins', 'port', 'wild', 'abyss', 'story'];
// [kind, weight] per ring index (last row repeats for every ring beyond)
const KIND_W = [
  [['lair', 46], ['wild', 36], ['port', 6], ['ruins', 4], ['kingdom', 8]],
  [['lair', 40], ['wild', 25], ['kingdom', 23], ['port', 4], ['ruins', 4]],
  [['lair', 40], ['wild', 22], ['kingdom', 27], ['port', 3], ['ruins', 5]],
  [['lair', 42], ['wild', 20], ['kingdom', 27], ['port', 3], ['ruins', 6]],
];
const SIZE = { kingdom: [66, 110], lair: [40, 80], wild: [44, 110], port: [50, 72], ruins: [40, 62] };
const pickW = (r, list) => { let t = 0; for (const [, w] of list) t += w; let v = r() * t; for (const [k, w] of list) { if ((v -= w) < 0) return k; } return list[0][0]; };
const REGION_KEYS = ['goblin', 'gnome', 'badlands', 'reef', 'crypt']; // easiest to hardest, as in data.js REGIONS
function regionFor(r, ring) {
  const lo = Math.max(0, Math.min(2, ring - 1)), hi = Math.min(4, ring + 1);
  // lean towards the hardest region allowed in the ring
  const i = lo + Math.floor(Math.pow(r(), 0.8) * (hi - lo + 1));
  return REGION_KEYS[Math.min(hi, i)];
}

// 32-bit mixing for per-chunk / per-island seeds
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
  return h >>> 0;
}
function mix(a, b, c = 0) { return fmix((a >>> 0) ^ fmix(((b >>> 0) + 0x9E3779B9) ^ fmix((c >>> 0) + 0x7F4A7C15))); }

export const chunkOf = v => Math.floor((v + CHUNK / 2) / CHUNK);

// ---------- island outlines ----------
// shape = { n, rows: [n row bitmasks, bit x set = land], high: [n row bitmasks, elevated plateau] }
// Cell size in world units is 2r/n; the grid is centred on the island centre.
export function makeShape(seed, r, opts = {}) {
  const R = rng(seed ^ 0x51ED);
  const n = Math.max(7, Math.min(12, Math.round(r / 8.5)));
  const g = new Uint8Array(n * n);
  // low-res value noise (4x4 lattice) bilinearly sampled
  const L = 4, lat = []; for (let i = 0; i < L * L; i++) lat.push(R());
  const noise = (u, v) => {
    const x = u * (L - 1), y = v * (L - 1), x0 = Math.min(L - 2, Math.floor(x)), y0 = Math.min(L - 2, Math.floor(y)), fx = x - x0, fy = y - y0;
    const a = lat[y0 * L + x0], b = lat[y0 * L + x0 + 1], c = lat[(y0 + 1) * L + x0], d = lat[(y0 + 1) * L + x0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  const sx = 0.88 + R() * 0.24, sy = 0.88 + R() * 0.24;
  const c = (n - 1) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x - c) / (c + 0.5) / sx, dy = (y - c) / (c + 0.5) / sy;
    const d = Math.hypot(dx, dy);
    const v = 1 - d + (noise(x / (n - 1), y / (n - 1)) - 0.5) * 0.55;
    g[y * n + x] = v > 0.1 ? 1 : 0;
  }
  // smooth: fill one-cell notches and drop one-cell spurs, a few passes
  const at = (a, x, y) => x >= 0 && y >= 0 && x < n && y < n ? a[y * n + x] : 0;
  const g2 = new Uint8Array(g);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = at(g2, x - 1, y) + at(g2, x + 1, y) + at(g2, x, y - 1) + at(g2, x, y + 1);
      if (!g2[y * n + x] && k >= 3) g2[y * n + x] = 1;
      else if (g2[y * n + x] && k <= 1) g2[y * n + x] = 0;
    }
  }
  g2[Math.floor(c) * n + Math.floor(c)] = 1;
  // largest component (4-connected)
  const lab = new Int16Array(n * n).fill(-1); let best = -1, bestN = 0;
  for (let i = 0; i < n * n; i++) {
    if (!g2[i] || lab[i] >= 0) continue;
    const st = [i]; lab[i] = i; let cnt = 0;
    while (st.length) {
      const p = st.pop(); cnt++;
      const x = p % n, y = (p - x) / n;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const q = ny * n + nx; if (g2[q] && lab[q] < 0) { lab[q] = i; st.push(q); }
      }
    }
    if (cnt > bestN) { bestN = cnt; best = i; }
  }
  for (let i = 0; i < n * n; i++) g2[i] = lab[i] === best ? 1 : 0;
  // fill enclosed water
  const out = new Uint8Array(n * n), st = [];
  for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) if (!g2[y * n + x] && !out[y * n + x]) { out[y * n + x] = 1; st.push(y * n + x); }
  while (st.length) {
    const p = st.pop(), x = p % n, y = (p - x) / n;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const q = ny * n + nx; if (!g2[q] && !out[q]) { out[q] = 1; st.push(q); }
    }
  }
  for (let i = 0; i < n * n; i++) if (!out[i]) g2[i] = 1;
  // elevated plateau: land eroded by one, with two rows of land under it (cliff + ground strip)
  const hi = new Uint8Array(n * n);
  if (opts.plateau !== false && n >= 8 && R() < (opts.plateauChance ?? 0.7)) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let ok = at(g2, x, y);
      for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1 && ok; i++) if (!at(g2, x + i, y + j)) ok = 0;
      if (ok && !at(g2, x, y + 2)) ok = 0;
      hi[y * n + x] = ok;
    }
    // drop thin bits: a plateau cell needs a 2x2 block of plateau around it
    const h2 = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!hi[y * n + x]) continue;
      for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (at(hi, x + a, y + b) && at(hi, x + a + 1, y + b) && at(hi, x + a, y + b + 1) && at(hi, x + a + 1, y + b + 1)) { h2[y * n + x] = 1; break; }
    }
    hi.set(h2);
  }
  const rows = [], high = [];
  for (let y = 0; y < n; y++) { let a = 0, b = 0; for (let x = 0; x < n; x++) { if (g2[y * n + x]) a |= 1 << x; if (hi[y * n + x]) b |= 1 << x; } rows.push(a); high.push(b); }
  return { n, rows, high };
}
export const shapeLand = (s, x, y) => x >= 0 && y >= 0 && x < s.n && y < s.n && ((s.rows[y] >> x) & 1) === 1;
export const shapeHigh = (s, x, y) => x >= 0 && y >= 0 && x < s.n && y < s.n && ((s.high[y] >> x) & 1) === 1;

// ---------- landmarks ----------
// Guaranteed islands placed deterministically per seed, one per chunk, before the
// chunk's random islands. dist = [min,max] distance of the island centre from home.
const LANDMARKS = [
  { kind: 'lair', starter: true, dist: [560, 820], r: [46, 60] },
  { kind: 'lair', starter: true, dist: [560, 820], r: [46, 60] },
  { kind: 'port', starter: true, dist: [560, 820], r: [50, 62] },
  { kind: 'story', chapter: 1, dist: [640, 860], r: [60, 72] },
  { kind: 'story', chapter: 2, dist: [1000, 1450], r: [62, 78] },
  { kind: 'story', chapter: 3, dist: [1450, 2050], r: [62, 80] },
  { kind: 'abyss', dist: [1250, 2050], r: [92, 104] },
  { kind: 'story', chapter: 4, dist: [1700, 2100], r: [64, 82] },
  { kind: 'story', chapter: 5, dist: [2350, 3100], r: [66, 84] },
  { kind: 'story', chapter: 6, dist: [3000, 3850], r: [68, 86] },
  { kind: 'story', chapter: 7, dist: [3400, 3900], r: [70, 90] },
  { kind: 'story', chapter: 8, dist: [4400, 6000], r: [84, 100] },
];

export class Ocean {
  constructor(seedInt) {
    this.seed = seedInt >>> 0;
    this.words = wordsFromSeed(this.seed);
    this.cache = new Map();
    this.home = { id: 'home', x: 0, y: 0, r: 120, kind: 'home', name: 'Home', level: 1, ring: 0, seed: mix(this.seed, 0, 0), shape: makeShape(mix(this.seed, 0, 0), 120, { plateauChance: 1 }), region: null, boss: false, kingdom: null };
    this.landmarks = new Map(); // "cx,cy" -> landmark spec with x,y,r
    const R = rng(mix(this.seed, 0x1A4D, 0x3A2C));
    for (const L of LANDMARKS) {
      for (let tries = 0; tries < 400; tries++) {
        const a = R() * Math.PI * 2, d = L.dist[0] + R() * (L.dist[1] - L.dist[0]);
        const r = Math.round(L.r[0] + R() * (L.r[1] - L.r[0]));
        let x = Math.cos(a) * d, y = Math.sin(a) * d;
        const cx = chunkOf(x), cy = chunkOf(y), key = cx + ',' + cy;
        if ((cx === 0 && cy === 0) || this.landmarks.has(key)) continue;
        const m = r + GAP / 2, bx = cx * CHUNK - CHUNK / 2, by = cy * CHUNK - CHUNK / 2;
        x = Math.round(Math.max(bx + m, Math.min(bx + CHUNK - m, x)));
        y = Math.round(Math.max(by + m, Math.min(by + CHUNK - m, y)));
        const dd = Math.hypot(x, y);
        if (dd < L.dist[0] - 40 || dd > L.dist[1] + 40 || dd - r < HOME_CLEAR) continue;
        if (L.dist[1] < 900 && dd >= 900 - 10) continue; // starters stay in Home Waters
        this.landmarks.set(key, { ...L, x, y, r });
        break;
      }
    }
  }

  ringOf(x, y) { return ringOf(x, y); }

  chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.cache.get(key);
    if (c) return c;
    c = this._gen(cx, cy);
    if (this.cache.size > 4096) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, c);
    return c;
  }

  _gen(cx, cy) {
    const out = { cx, cy, islands: [] };
    if (cx === 0 && cy === 0) { out.islands.push(this.home); return out; }
    const R = rng(mix(this.seed, cx | 0, cy | 0));
    const bx = cx * CHUNK - CHUNK / 2, by = cy * CHUNK - CHUNK / 2;
    const placed = [];
    const fits = (x, y, r) => {
      if (Math.hypot(x, y) - r < HOME_CLEAR) return false;
      for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < p.r + r + GAP) return false;
      return true;
    };
    const lm = this.landmarks.get(cx + ',' + cy);
    if (lm) placed.push({ x: lm.x, y: lm.y, r: lm.r, lm });
    // 0..3 islands: kind first (by the ring at the chunk centre), size by kind, then a free spot
    const want = pickW(R, [[0, 5], [1, 25], [2, 42], [3, 28]]) + (lm ? 1 : 0);
    const ring = ringIndexAtDist(Math.hypot(cx * CHUNK, cy * CHUNK));
    for (let t = 0; t < 30 && placed.length < Math.min(3, want); t++) {
      let kind = pickW(R, KIND_W[Math.min(ring, KIND_W.length - 1)]);
      const [ra, rb] = SIZE[kind];
      const r = Math.round(ra + Math.pow(R(), 1.3) * (rb - ra));
      const m = r + GAP / 2;
      const x = Math.round(bx + m + R() * (CHUNK - 2 * m)), y = Math.round(by + m + R() * (CHUNK - 2 * m));
      if (kind === 'kingdom' && Math.hypot(x, y) < 700) kind = 'lair';
      if (fits(x, y, r)) placed.push({ x, y, r, kind });
    }
    placed.forEach((p, i) => out.islands.push(this._island(cx, cy, i, p)));
    return out;
  }

  _island(cx, cy, i, p) {
    const id = `${cx},${cy},${i}`;
    const seed = mix(this.seed, hashStr(id), 0xB0A7);
    const R = rng(seed);
    const d = Math.hypot(p.x, p.y), ring = ringIndexAtDist(d);
    const lm = p.lm;
    const kind = lm ? lm.kind : p.kind;
    const isl = { id, x: p.x, y: p.y, r: p.r, kind, name: islandName(R), level: levelAtDist(d), ring, seed, shape: null, kingdom: null, region: null, boss: false };
    if (lm && lm.starter) isl.starter = true;
    if (kind === 'lair') {
      isl.region = lm && lm.starter ? R.pick(['goblin', 'gnome']) : regionFor(R, ring);
      isl.boss = !(lm && lm.starter) && R() < 0.18;
      if (isl.boss) isl.level += 1;
    } else if (kind === 'kingdom') {
      isl.kingdom = makeKingdom(R, ring);
      isl.kingdom.id = 'k' + id;
      isl.kingdom.level = isl.level;
      isl.name = isl.kingdom.seat;
    } else if (kind === 'ruins') {
      isl.region = regionFor(R, ring);
    } else if (kind === 'abyss') {
      isl.name = ABYSS_NAME; isl.region = 'crypt';
    } else if (kind === 'story') {
      isl.chapter = lm.chapter; isl.name = STORY_NAMES[lm.chapter - 1]; isl.region = REGION_KEYS[Math.min(4, Math.floor((lm.chapter - 1) / 2))];
    }
    isl.shape = makeShape(seed, isl.r, { plateauChance: kind === 'kingdom' || kind === 'story' ? 0.95 : kind === 'abyss' ? 0 : 0.6 });
    return isl;
  }

  // islands whose disc overlaps the rectangle [x0,x1]x[y0,y1]
  islandsIn(x0, y0, x1, y1) {
    const out = [];
    const c0 = chunkOf(x0), c1 = chunkOf(x1), r0 = chunkOf(y0), r1 = chunkOf(y1);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      for (const s of this.chunk(cx, cy).islands) {
        const nx = Math.max(x0, Math.min(x1, s.x)), ny = Math.max(y0, Math.min(y1, s.y));
        if ((nx - s.x) ** 2 + (ny - s.y) ** 2 <= s.r * s.r) out.push(s);
      }
    }
    return out;
  }

  islandAt(x, y, slack = 0) {
    for (const s of this.chunk(chunkOf(x), chunkOf(y)).islands) if (Math.hypot(s.x - x, s.y - y) <= s.r + slack) return s;
    return null;
  }

  islandById(id) {
    if (id === 'home') return this.home;
    const [cx, cy, i] = String(id).split(',').map(Number);
    if (!Number.isFinite(i)) return null;
    return this.chunk(cx, cy).islands[i] || null;
  }

  // every landmark island (story chapters, the Abyss, starter lairs and port)
  landmarkIslands() {
    const out = [];
    for (const key of this.landmarks.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      out.push(this.chunk(cx, cy).islands[0]);
    }
    return out;
  }
  storyIsland(chapter) { return this.landmarkIslands().find(s => s.kind === 'story' && s.chapter === chapter) || null; }
  abyssIsland() { return this.landmarkIslands().find(s => s.kind === 'abyss') || null; }
}

// ---------- fog of war ----------
// Revealed cells (FOG_CELL world units) kept per 8x8-cell block as 8 bytes (one per row).
// Saved form: { v: 1, c: { "bx,by": base64(8 bytes) | "*" (all revealed) } }.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function enc8(b) {
  let s = '';
  for (let i = 0; i < 9; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < 8 ? B64[(n >> 6) & 63] : '') + (i + 2 < 8 ? B64[n & 63] : '');
  }
  return s; // 11 chars
}
function dec8(s) {
  const b = new Uint8Array(8); let bits = 0, acc = 0, k = 0;
  for (const ch of s) { const v = B64.indexOf(ch); if (v < 0) continue; acc = (acc << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; if (k < 8) b[k++] = (acc >> bits) & 255; } }
  return b;
}
export class Fog {
  constructor(saved) {
    this.blocks = new Map();
    this.version = 0;
    if (saved && saved.c) for (const [k, v] of Object.entries(saved.c)) this.blocks.set(k, v === '*' ? new Uint8Array(8).fill(255) : dec8(v));
  }
  _cell(gx, gy) {
    const b = this.blocks.get((gx >> 3) + ',' + (gy >> 3));
    return !!b && ((b[gy & 7] >> (gx & 7)) & 1) === 1;
  }
  isCellRevealed(gx, gy) { return this._cell(gx, gy); }
  isRevealed(x, y) { return this._cell(Math.floor(x / FOG_CELL), Math.floor(y / FOG_CELL)); }
  // reveals every cell whose centre lies within radius of (x,y), plus the cell holding the point
  reveal(x, y, radius) {
    const C = FOG_CELL, g0 = Math.floor((x - radius) / C), g1 = Math.floor((x + radius) / C), h0 = Math.floor((y - radius) / C), h1 = Math.floor((y + radius) / C);
    let changed = false;
    const set = (gx, gy) => {
      const k = (gx >> 3) + ',' + (gy >> 3);
      let b = this.blocks.get(k); if (!b) { b = new Uint8Array(8); this.blocks.set(k, b); }
      const m = 1 << (gx & 7);
      if (!(b[gy & 7] & m)) { b[gy & 7] |= m; changed = true; }
    };
    for (let gy = h0; gy <= h1; gy++) for (let gx = g0; gx <= g1; gx++) {
      const dx = (gx + 0.5) * C - x, dy = (gy + 0.5) * C - y;
      if (dx * dx + dy * dy <= radius * radius) set(gx, gy);
    }
    set(Math.floor(x / C), Math.floor(y / C));
    if (changed) this.version++;
    return changed;
  }
  serialize() {
    const c = {};
    for (const [k, b] of this.blocks) {
      if (b.every(v => v === 255)) c[k] = '*';
      else if (b.some(v => v)) c[k] = enc8(b);
    }
    return { v: 1, c };
  }
}
