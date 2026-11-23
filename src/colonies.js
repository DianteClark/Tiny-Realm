// Colonies (6.0). Wild land, cleared lairs and picked-over ruins can be settled. A colony grows an
// Outpost into a Settlement and a Town, fills its storehouse every hour with what its land gives, and
// needs a trade boat (or your fleet) to carry the stores home. Kingdoms at war with you may raid it;
// soldiers left behind as a garrison stand in the way.
import { XP_LEVELS, levelCap } from './data.js';

export const COLONY_LEVELS = [
  null,
  { name: 'Outpost', rate: 1, store: 6, houses: 1 },
  { name: 'Settlement', rate: 2, store: 8, houses: 2 },
  { name: 'Town', rate: 3.5, store: 12, houses: 3 },
];
// what each kind of land yields per hour at an Outpost
const YIELD = {
  wild: { wood: 150, meat: 150 }, goblin: { meat: 170, gold: 70 }, gnome: { wood: 200, gold: 50 }, badlands: { gold: 170 },
  reef: { meat: 150, gold: 90 }, crypt: { gold: 130, wood: 70 }, ruins: { gold: 110, wood: 110 },
};

export class Colonies {
  constructor(realm) { this.R = realm; this.t = 30; }
  get W() { return this.R.state.world; }
  get C() { const W = this.W; return W.colonies || (W.colonies = {}); }
  list() { const Z = this.R.sea; return Object.keys(this.C).map(id => ({ id, c: this.C[id], is: Z.ocean.islandById(id) })).filter(o => o.is); }
  max() { return Math.max(1, this.R.state.tier); }
  cost() { const n = Object.keys(this.C).length; const m = 1 + n * 0.6; return { wood: Math.round(160 * m), gold: Math.round(120 * m), meat: Math.round(80 * m) }; }
  upCost(c) { const m = c.level === 1 ? 1 : 2.4; return { wood: Math.round(260 * m), gold: Math.round(220 * m), meat: Math.round(120 * m) }; }
  // can this island be settled, and if not, why
  canSettle(is) {
    const S = this.R.state, W = this.W;
    if (!is || this.C[is.id]) return 'Already yours.';
    const land = is.kind === 'wild' || ((is.kind === 'lair' || is.kind === 'ruins') && W.cleared[is.id]);
    if (!land) return is.kind === 'lair' ? 'Clear the monsters first, then settle the land.' : is.kind === 'ruins' ? 'Search the ruins first.' : 'This land cannot be settled.';
    if (S.tier < 2) return 'Grow your hamlet into a Village before you send settlers.';
    if (Object.keys(this.C).length >= this.max()) return `Your realm can hold ${this.max()} colon${this.max() === 1 ? 'y' : 'ies'} at this size. Grow it to settle more.`;
    if (S.pawns < 4) return 'You need at least 4 pawns: 2 of them sail out as settlers.';
    return null;
  }
  yieldOf(is) {
    const base = YIELD[is.kind === 'wild' ? 'wild' : is.kind === 'ruins' ? 'ruins' : is.region] || YIELD.wild, ring = Math.min(4, is.ring || 0);
    const out = {}; for (const k in base) out[k] = Math.round(base[k] * (1 + ring * 0.25)); return out;
  }
  rate(id, base) { const c = this.C[id], is = this.R.sea.ocean.islandById(id); if (!c || !is) return {}; const y = this.yieldOf(is), L = COLONY_LEVELS[c.level], out = {}; for (const k in y) out[k] = Math.round(y[k] * L.rate * (!base && c.sackedUntil > Date.now() ? 0 : 1)); return out; }
  cap(id) { const c = this.C[id], L = COLONY_LEVELS[c.level], y = this.yieldOf(this.R.sea.ocean.islandById(id)), out = {}; for (const k in y) out[k] = Math.round(y[k] * L.rate * L.store); return out; }
  settle(is) {
    const R = this.R, S = R.state, why = this.canSettle(is); if (why) return why;
    if (!R.pay(this.cost())) return 'Not enough wood, gold and meat for the settlers.';
    // two pawns board the fleet as settlers
    const pawns = R.home.units.filter(u => u.kind === 'pawn' && !u.dead).sort((a, b) => (a.job === 'idle' ? -1 : 0) - (b.job === 'idle' ? -1 : 0));
    for (const u of pawns.slice(0, 2)) { R.releaseNode(u); u.dead = true; }
    S.pawns -= 2;
    const J = S.jobs; let over = Object.values(J).reduce((a, b) => a + b, 0) - S.pawns;
    for (const k of ['build', 'meat', 'gold', 'wood']) while (over > 0 && J[k] > 0) { J[k]--; over--; }
    R.assignJobs();
    this.C[is.id] = { level: 1, at: Date.now(), founded: Date.now(), store: {}, garrison: [] };
    S.stats.colonies = (S.stats.colonies || 0) + 1;
    this.dress(is);
    R.log(`Settlers founded an outpost on ${is.name}.`, 'colony');
    R.sfx && R.sfx('build');
    R.save();
    return null;
  }
  upgrade(id) {
    const R = this.R, c = this.C[id]; if (!c) return 'No colony there.';
    if (c.level >= 3) return 'It is already a Town.';
    if (c.level === 2 && R.state.tier < 4) return 'Raise your realm to a Stronghold before a colony can become a Town.';
    if (!R.pay(this.upCost(c))) return 'Not enough wood, gold and meat.';
    this.collect(id); c.level++; this.dress(R.sea.ocean.islandById(id));
    R.log(`${R.sea.ocean.islandById(id).name} grew into a ${COLONY_LEVELS[c.level].name}.`, c.level >= 3 ? 'colony' : null); R.save();
    return null;
  }
  dress(is) { if (!is) return; const c = this.C[is.id]; is.colony = c ? c.level : 0; }
  // bring the storehouse up to date
  collect(id, now = Date.now()) {
    const c = this.C[id]; if (!c) return;
    const from = c.at; c.at = now; if (now <= from) return;
    // no work is done in the hour after a sack
    let ms = now - from; if (c.sackedUntil && c.sackStart) ms -= Math.max(0, Math.min(now, c.sackedUntil) - Math.max(from, c.sackStart));
    const hrs = Math.max(0, ms / 3600000); if (!hrs) return;
    const r = this.rate(id, true), cap = this.cap(id);
    for (const k in r) c.store[k] = Math.min(cap[k] || 0, (c.store[k] || 0) + r[k] * hrs);
  }
  stores(id) { this.collect(id); const s = this.C[id].store, out = {}; for (const k in s) out[k] = Math.floor(s[k]); return out; }
  // take the whole storehouse (by boat or fleet)
  empty(id) { const s = this.stores(id); this.C[id].store = {}; return s; }
  // the garrison: soldiers left behind on the island
  garrison(id) { const S = this.R.state, c = this.C[id]; return c ? c.garrison.map(g => S.soldiers.find(s => s.id === g)).filter(Boolean) : []; }
  leaveGarrison(id, recs) {
    const c = this.C[id]; if (!c) return;
    const Z = this.R.sea;
    for (const r of recs) { if (c.garrison.length >= 4 + c.level * 2) break; Z.W.crew = Z.W.crew.filter(x => x !== r.id); r.status = 'garrison'; r.colony = id; c.garrison.push(r.id); }
  }
  takeGarrison(id, cap) {
    const c = this.C[id]; if (!c) return 0; const Z = this.R.sea; let n = 0;
    for (const r of this.garrison(id)) { if (Z.W.crew.length >= cap) break; r.status = 'away'; r.colony = null; Z.W.crew.push(r.id); c.garrison = c.garrison.filter(x => x !== r.id); n++; }
    return n;
  }
  xp(r, n) { if (r.level >= levelCap(r)) return; r.xp = (r.xp || 0) + n; while (r.level < levelCap(r) && r.xp >= XP_LEVELS[r.level + 1]) r.level++; }
  defence(id) { const c = this.C[id]; return 10 + c.level * 15 + this.garrison(id).reduce((a, r) => a + 8 + r.level * 4 + (r.promoted ? 10 : 0), 0); }
  // ---- the world turns: kingdoms at war look at your colonies
  update(dt) {
    if (!this.R.sea.ocean || !this.W) return;
    this.t -= dt; if (this.t > 0) return; this.t = 30;
    this.threats(30, true);
  }
  threats(secs, live) {
    const K = this.R.kingdoms; if (!K) return;
    for (const { id, c, is } of this.list()) {
      if (c.sackedUntil > Date.now() || Date.now() - c.founded < 2 * 3600000) continue; // a new colony has time to dig in
      const foes = K.islands().filter(k => K.stance(k) === 'war' && K.near(k) && Math.hypot(k.x - is.x, k.y - is.y) < 1400);
      if (!foes.length || Math.random() > secs / 16200 * Math.min(2, foes.length)) continue;
      const f = foes[Math.floor(Math.random() * foes.length)];
      if (live) { K.launch(f, id, K.st(f).power * 0.45); continue; } // a war fleet sets out; it can be met at sea
      this.raid(id, f, K.st(f).power * 0.45, live);
    }
  }
  // a war fleet reaches a colony
  raid(id, f, atk, live) {
    const K = this.R.kingdoms, c = this.C[id], is = this.R.sea.ocean.islandById(id); if (!c || !is) return;
    { const def = this.defence(id);
      if (Math.random() < def / (def + atk)) {
        K.st(f).power = Math.max(K.st(f).power * 0.96, 20);
        for (const r of this.garrison(id)) this.xp(r, 15);
        K.news(`Raiders of ${f.kingdom.name} were beaten back from ${is.name}.`, live);
      } else {
        this.collect(id); c.store = {}; c.sackStart = Date.now(); c.sackedUntil = Date.now() + 3600000;
        K.news(`${f.kingdom.name} sacked ${is.name} and carried off its stores. Work stops there for an hour.`, live, 'colony');
        if (live && this.R.ui) this.R.ui.banner('A colony is sacked', `${f.kingdom.name} raided ${is.name}. Leave a garrison there, or make peace.`, 'red');
      }
    }
  }
  catchUp(secs) { const steps = Math.min(24, Math.floor(secs / 1800)); for (let i = 0; i < steps; i++) this.threats(1800, false); }
}
