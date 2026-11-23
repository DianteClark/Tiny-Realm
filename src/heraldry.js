// Heraldry (4.0): many rival kingdoms share the pack's 5 team colours, so each one also
// carries a sigil (a small heater shield) and an allegiance ring under its units/buildings.
// makeKingdom is pure; the draw functions need a 2D context (offscreen canvas for sigils).

export const TEAM_COLORS = ['blue', 'red', 'yellow', 'purple', 'black'];
export const TEMPERS = ['warlike', 'greedy', 'cautious', 'pious'];
export const DIVISIONS = ['plain', 'per pale', 'per fess', 'chevron'];

// Tinctures: metals (light) and colours (dark). A charge is a metal on a colour or a colour on a metal.
const METALS = ['#f2c94c', '#ecebe4'];                 // or, argent
const COLOURS = ['#c8372d', '#2f5fa8', '#2f7d3a', '#6a3d8f', '#26232a', '#8a5a2b', '#2b8a8a']; // gules, azure, vert, purpure, sable, tenne, teal
const SHADE = { '#f2c94c': '#c99a2e', '#ecebe4': '#b9b7ad', '#c8372d': '#8f2219', '#2f5fa8': '#1f3f74', '#2f7d3a': '#1e5426', '#6a3d8f': '#472760', '#26232a': '#4a4550', '#8a5a2b': '#5e3c1b', '#2b8a8a': '#1c5e5e' };

// 8x8 pixel charges ('#' = charge colour). Read top to bottom.
export const CHARGES = {
  tower: ['#.#..#.#', '########', '.######.', '.##..##.', '.######.', '.##..##.', '.######.', '########'],
  crown: ['........', '#..##..#', '#..##..#', '##.##.##', '########', '########', '#.#..#.#', '########'],
  star: ['...##...', '...##...', '########', '.######.', '..####..', '.######.', '.##..##.', '##....##'],
  moon: ['..####..', '.##.....', '##......', '##......', '##......', '##......', '.##.....', '..####..'],
  fish: ['........', '.####..#', '######.#', '#.######', '########', '######.#', '.####..#', '........'],
  tree: ['...##...', '..####..', '.######.', '..####..', '.######.', '########', '...##...', '..####..'],
  sword: ['...##...', '...##...', '...##...', '...##...', '...##...', '########', '...##...', '...##...'],
  key: ['.###....', '##.##...', '.###....', '..#.....', '..#.....', '..####..', '..#.....', '..###...'],
  boar: ['........', '.#......', '#######.', '########', '#######.', '.######.', '.#.#..#.', '.#.#..#.'],
  wave: ['........', '.##..##.', '#..##..#', '........', '.##..##.', '#..##..#', '........', '........'],
  anchor: ['..###...', '...#....', '.#####..', '...#....', '...#....', '#..#..#.', '##.#.##.', '.#####..'],
  rose: ['..#..#..', '.######.', '##.##.##', '########', '##.##.##', '.######.', '..#..#..', '........'],
};
export const CHARGE_KEYS = Object.keys(CHARGES);

const HOUSE_A = ['Thorn', 'Ash', 'Gale', 'Black', 'Wren', 'Holl', 'Mar', 'Sten', 'Brack', 'Oak', 'Salt', 'Raven', 'Dun', 'Hart', 'Fen', 'Grey', 'Kes', 'Mor', 'Wel', 'Cor', 'Ald', 'Bel', 'Tarn', 'Vel'];
const HOUSE_B = ['wick', 'more', 'ford', 'hollow', 'wood', 'bury', 'ridge', 'mere', 'stone', 'vale', 'helm', 'gard', 'wyn', 'croft', 'shaw', 'dale', 'brook', 'well'];
const SEAT_A = ['Salt', 'Storm', 'Iron', 'High', 'Gull', 'Amber', 'Mist', 'Dawn', 'Rook', 'Tide', 'Bright', 'Frost', 'Wolf', 'Elder', 'Copper', 'Silver', 'Gold', 'Shiver'];
const SEAT_B = ['holm', 'haven', 'keep', 'mouth', 'march', 'reach', 'hold', 'gate', 'crown', 'fast', 'spire', 'watch', 'wall', 'mark'];
const REALM_FORMS = ['the Marches of %', 'the Kingdom of %', 'the Free Holds of %', 'the Principality of %', 'the Isles of %', 'the Duchy of %', 'the Sea-Realm of %', 'the Crown of %'];
const RULER_TITLES = { warlike: ['Warlord', 'King', 'Queen'], greedy: ['Merchant Prince', 'Lord', 'Lady'], cautious: ['Regent', 'Duke', 'Duchess'], pious: ['High Abbot', 'Prior', 'Abbess'] };
const RULER_NAMES = ['Aldric', 'Brannagh', 'Cedric', 'Dagny', 'Edda', 'Fenwick', 'Garrick', 'Hilde', 'Isolde', 'Jory', 'Leofric', 'Maude', 'Osric', 'Ragna', 'Sigrid', 'Tobin', 'Ulric', 'Vesna', 'Wynn', 'Yara'];
const MOTTOS = {
  warlike: ['Steel answers.', 'We take the shore.', 'No quarter, no retreat.', 'The tide bows to us.'],
  greedy: ['Gold buys every war.', 'All ships pay toll.', 'Count twice, strike once.', 'The sea is a ledger.'],
  cautious: ['We wait. We win.', 'Walls before glory.', 'Patience is a blade.', 'Watch the horizon.'],
  pious: ['The light keeps us.', 'Faith outlasts stone.', 'Bells over the water.', 'Mercy, then judgement.'],
};

const pk = (r, a) => a[Math.floor(r() * a.length)];

// A kingdom from an rng (call with an rng that is itself deterministic per island).
// ring biases temper: farther seas are harsher.
export function makeKingdom(r, ring = 0) {
  const name = 'House ' + pk(r, HOUSE_A) + pk(r, HOUSE_B);
  const seat = pk(r, SEAT_A) + pk(r, SEAT_B);
  const realm = pk(r, REALM_FORMS).replace('%', seat);
  const color = pk(r, TEAM_COLORS);
  const warBias = Math.min(0.5, 0.1 * ring);
  const temper = r() < warBias ? 'warlike' : pk(r, TEMPERS);
  const metalOnColour = r() < 0.6;
  const field = metalOnColour ? pk(r, COLOURS) : pk(r, METALS);
  const chargeColor = metalOnColour ? pk(r, METALS) : pk(r, COLOURS);
  const division = pk(r, ['plain', 'plain', 'per pale', 'per fess', 'chevron']);
  const sigil = { field, charge: pk(r, CHARGE_KEYS), chargeColor, division };
  const ruler = pk(r, RULER_TITLES[temper]) + ' ' + pk(r, RULER_NAMES);
  return { id: null, name, realm, seat, color, sigil, temper, ruler, motto: pk(r, MOTTOS[temper]) };
}

// ---------- sigil drawing ----------
const OUTLINE = '#1b1720';
const sigilCache = new Map();
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Renders a heater shield of height `size` px pixel by pixel into a small canvas.
function renderSigil(sigil, size) {
  const H = Math.max(10, Math.round(size)), W = Math.round(H * 0.84) | 0;
  const cv = makeCanvas(W, H), c = cv.getContext('2d');
  const img = c.createImageData(W, H), d = img.data;
  const ow = H >= 32 ? 2 : 1; // outline width
  const y0 = H * 0.5;
  const inside = (x, y) => {
    if (y < 0 || y >= H || x < 0 || x >= W) return false;
    const px = x + 0.5 - W / 2, py = y + 0.5;
    let hw = W / 2;
    if (py > y0) { const t = (py - y0) / (H - y0); hw = (W / 2) * Math.sqrt(Math.max(0, 1 - t * t * t * 0.95 - t * 0.05)); }
    return Math.abs(px) <= hw;
  };
  const inner = (x, y) => { for (let j = -ow; j <= ow; j++) for (let i = -ow; i <= ow; i++) if (!inside(x + i, y + j)) return false; return true; };
  const f1 = hexRgb(sigil.field), f2 = hexRgb(SHADE[sigil.field] || sigil.field), ol = hexRgb(OUTLINE), ch = hexRgb(sigil.chargeColor);
  const second = (x, y) => {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    switch (sigil.division) {
      case 'per pale': return u >= 0.5;
      case 'per fess': return v >= 0.45;
      case 'chevron': return v > 0.62 - Math.abs(u - 0.5) * 0.9;
      default: return false;
    }
  };
  const put = (x, y, rgb, a = 255) => { const k = (y * W + x) * 4; d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = a; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    if (!inner(x, y)) { put(x, y, ol); continue; }
    put(x, y, second(x, y) ? f2 : f1);
  }
  // charge: 8x8 pattern at an integer scale, centred a little above the middle
  const P = CHARGES[sigil.charge] || CHARGES.star;
  const s = Math.max(1, Math.floor((H * 0.56) / 8));
  const cw = 8 * s, ox = Math.round((W - cw) / 2), oy = Math.round(H * 0.42 - cw / 2);
  // dark rim around the charge for legibility at large sizes
  const on = (i, j) => j >= 0 && j < 8 && i >= 0 && i < 8 && P[j][i] === '#';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    if (!on(i, j)) continue;
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
      const x = ox + i * s + xx, y = oy + j * s + yy;
      if (x >= 0 && y >= 0 && x < W && y < H && inner(x, y)) put(x, y, ch);
    }
  }
  // highlight: one light column along the left inside edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inner(x, y) && !inner(x - 1, y) && y < H * 0.7) { const k = (y * W + x) * 4; d[k] = Math.min(255, d[k] + 45); d[k + 1] = Math.min(255, d[k + 1] + 45); d[k + 2] = Math.min(255, d[k + 2] + 45); }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

export function sigilCanvas(sigil, size) {
  const key = `${sigil.field}|${sigil.charge}|${sigil.chargeColor}|${sigil.division}|${Math.round(size)}`;
  let cv = sigilCache.get(key);
  if (!cv) {
    cv = renderSigil(sigil, size);
    if (sigilCache.size > 400) sigilCache.delete(sigilCache.keys().next().value);
    sigilCache.set(key, cv);
  }
  return cv;
}

// Shield `size` px tall, centred on (x, y) in ctx's current coordinates.
export function drawSigil(ctx, sigil, x, y, size) {
  const cv = sigilCanvas(sigil, size);
  ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(y - cv.height / 2));
}

// ---------- allegiance ring ----------
export const RELATION_COLORS = { enemy: '#ff5a4e', neutral: '#e8b93a', ally: '#6dbb5b', own: '#4a90c0' };
// Ellipse on the ground centred at (x, y), w px wide. t (seconds) pulses the enemy ring.
export function drawAllegiance(ctx, x, y, w, relation = 'neutral', t = 0) {
  const col = RELATION_COLORS[relation] || RELATION_COLORS.neutral;
  const rx = w / 2, ry = Math.max(2, w * 0.2);
  let a = relation === 'own' ? 0.45 : 0.85, fill = relation === 'own' ? 0.08 : 0.16;
  if (relation === 'enemy') { const p = 0.5 + 0.5 * Math.sin(t * 4); a = 0.65 + 0.35 * p; fill = 0.12 + 0.1 * p; }
  const lw = Math.max(1, Math.round(w / 40));
  ctx.save();
  ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.globalAlpha = fill; ctx.fillStyle = col; ctx.fill();
  ctx.globalAlpha = a * 0.6; ctx.lineWidth = lw + 2; ctx.strokeStyle = '#1b1720'; ctx.stroke();
  ctx.globalAlpha = a; ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
  ctx.restore();
}
