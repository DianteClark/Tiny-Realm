// Trade routes (3.4). Each Market level gives a trade boat. A boat on a route sails to its port,
// comes back with cargo, and sets out again. Pirates sometimes follow a boat home: beat them and
// the cargo lands with a bonus; lose and it is gone.
import { RIVALS, provinceOf, levelEffects } from './data.js';
import { T } from './terrain.js';

const CARGO = { // per province region
  goblin: { meat: 1, gold: 0.4 }, gnome: { wood: 1, gold: 0.3 }, badlands: { gold: 1 },
  reef: { meat: 0.7, gold: 0.6 }, crypt: { gold: 0.9, wood: 0.4 }, rival: { gold: 0.7, wood: 0.7 },
};

export function ports(R) {
  const S = R.state, t = S.tier, out = [];
  out.push({ key: 'free', name: 'Lantern Bay', sub: 'A free port that trades with anyone', mins: 6, risk: 0.08, cargo: { gold: 50 + t * 35, wood: 40 + t * 20 } });
  const seen = new Set();
  for (const a of S.annexed || []) {
    if (seen.has(a.region)) continue; seen.add(a.region);
    const p = provinceOf(a.region), mix = CARGO[a.region] || CARGO.rival, base = 90 + t * 55;
    const cargo = {}; for (const k in mix) cargo[k] = Math.round(base * mix[k]);
    out.push({ key: 'prov:' + a.region, name: `${p.name} docks`, sub: 'Your own province', mins: 10, risk: 0.12, cargo });
  }
  // free ports your fleet has visited on the open sea (4.0)
  const Z = R.sea, W = S.world;
  if (Z && Z.ocean && W) for (const id of Object.keys(W.seen || {})) {
    const is = Z.ocean.islandById(id); if (!is || is.kind !== 'port') continue;
    const d = Math.hypot(is.x, is.y), base = 60 + is.level * 22;
    out.push({ key: 'wport:' + id, name: `${is.name} port`, sub: `A free port out at sea, ${Math.round(d)} leagues away`, mins: Math.max(5, Math.round(4 + d / 400)), risk: Math.min(0.3, 0.06 + is.level * 0.012), cargo: { gold: base + t * 25, wood: Math.round(base * 0.7), meat: Math.round(base * 0.5) } });
  }
  for (const r of RIVALS) {
    const st = S.rivals[r.key]; if (!st || !st.subjugated) continue;
    const rate = R.tributeRate(r.key);
    out.push({ key: 'vassal:' + r.key, name: `${r.name} harbour`, sub: `Your vassal, ${r.ruler}`, mins: 15, risk: 0.15, cargo: { gold: Math.round(rate.gold * 1.3), wood: Math.round(rate.wood * 1.3), meat: 40 + t * 25 } });
  }
  return out;
}

export class Trade {
  constructor(realm) { this.R = realm; }
  get st() { const S = this.R.state; return S.trade || (S.trade = { slots: [] }); }
  boats() { let n = 0; for (const b of this.R.home.buildings) if (b.type === 'market' && b.done && !b.ruined) n += levelEffects('market', b.level).boats; return n; }
  port(key) { return ports(this.R).find(p => p.key === key); }
  dock() {
    const R = this.R; if (this._dock && this._dockFor === R.home.map) return this._dock;
    let best = null, bd = 1e9;
    for (const s of R.shore || []) { const d = Math.hypot(s.lx - R.door[0], s.ly - R.door[1]); if (d < bd) { bd = d; best = s; } }
    this._dock = best; this._dockFor = R.home.map; return best;
  }
  send(key) {
    const C = this.st, n = this.boats();
    while (C.slots.length < n) C.slots.push({ port: null });
    const p = this.port(key); if (!p) return 'That port is not open to you.';
    const slot = C.slots.slice(0, n).find(s => !s.port);
    if (!slot) return n ? 'Every boat already has a route. Upgrade the Market for more boats.' : 'Build a Market first.';
    slot.port = key; this.depart(slot);
    this.R.sfx('sail');
  }
  stop(i) { const s = this.st.slots[i]; if (s) { s.stopAfter = true; if (!s.back) s.port = null; } }
  depart(slot, at = Date.now()) {
    const p = this.port(slot.port); if (!p || slot.stopAfter) { slot.port = null; slot.back = 0; slot.stopAfter = false; return; }
    const fast = this.R.home.buildings.some(b => b.type === 'market' && b.done && this.R.hasBonus(b, 'Harbour market'));
    slot.leave = at; slot.back = at + p.mins * 60000 * (fast ? 0.8 : 1); slot.cargo = { ...p.cargo };
  }
  deliver(slot, mult = 1, quiet) {
    const R = this.R, got = {};
    for (const k in slot.cargo) got[k] = R.addRes(k, Math.round(slot.cargo[k] * mult * (1 + R.decrees.fx('trade'))));
    R.state.stats.tradeTrips = (R.state.stats.tradeTrips || 0) + 1;
    if (!quiet) {
      const p = this.port(slot.port), any = Object.values(got).some(v => v > 0);
      R.ui.toast(any ? `A trade boat is back from ${p ? p.name : 'sea'}: ${Object.entries(got).filter(([, v]) => v > 0).map(([k, v]) => v + ' ' + k).join(', ')}.` : `A trade boat is back from ${p ? p.name : 'sea'}, but the stores are full.`, any ? 'gold' : '');
      R.sfx('coin');
    }
    return got;
  }
  // offline: trips that finished while away land safely
  catchUp() {
    const now = Date.now(), cap = now - 12 * 3600000, got = { gold: 0, wood: 0, meat: 0 };
    for (const s of this.st.slots) {
      let guard = 0;
      while (s.port && s.back && s.back <= now && guard++ < 200) {
        if (s.back < cap) { s.back = now; break; }
        const g = this.deliver(s, 1, true); for (const k in g) got[k] += g[k];
        this.depart(s, s.back);
      }
    }
    return got;
  }
  update() {
    const R = this.R, C = this.st, now = Date.now(), n = this.boats();
    while (C.slots.length < n) C.slots.push({ port: null });
    C.slots.forEach((s, i) => {
      if (i >= n && s.port && !s.back) s.port = null; // a Market was lost
      if (!s.port || !s.back || now < s.back || s.waiting) return;
      const p = this.port(s.port);
      const calm = !R.exp && !(R.raid && R.raid.active) && !R.events.blocking && !R.slam;
      if (!calm) return; // the boat waits offshore until things settle
      if (p && Math.random() < p.risk) return this.ambush(s, p);
      this.deliver(s); this.depart(s);
    });
    this.visuals(now);
  }
  ambush(slot, p) {
    const R = this.R, d = this.dock(); if (!d) { this.deliver(slot); this.depart(slot); return; }
    const t = R.state.tier, units = ['paddleshark', 'harpoonshark', 'paddleshark'];
    for (let i = 0; i < t; i++) units.push(i % 2 ? 'harpoonshark' : 'bombfish');
    const plan = R.planRaid('pirates', { units, region: { key: 'reef', name: 'Pirates', enemies: units } });
    plan.spawns = [d];
    slot.waiting = true;
    const keep = R.state.timers.raid;
    R.startRaid(plan, {
      title: 'Pirate Ambush', text: `Pirates followed your boat home from ${p.name}. Beat them to save the cargo.`,
      onEnd: won => {
        slot.waiting = false;
        if (won) { this.deliver(slot, 1.25); R.ui.toast('The cargo is saved, with a share of the pirates\' loot.', 'gold'); }
        else R.ui.toast('The pirates made off with the cargo.', 'red');
        this.depart(slot);
      },
    });
    R.state.timers.raid = keep; // an ambush does not reset the usual raid clock
  }
  // boats are seen leaving and arriving near the dock
  visuals(now) {
    const R = this.R, d = this.dock(), list = [];
    if (d && !R.exp) for (const s of this.st.slots) {
      if (!s.port || !s.back) continue;
      const out = (now - s.leave) / 1000, inn = (s.back - now) / 1000, L = Math.hypot(d.wx - d.lx, d.wy - d.ly) || 1, dx = (d.wx - d.lx) / L, dy = (d.wy - d.ly) / L;
      let k = -1; if (out < 18) k = out / 18; else if (inn < 18 && inn > 0) k = inn / 18; else if (s.waiting || inn <= 0) k = 0.05;
      if (k < 0) continue;
      const x = (d.wx + 0.5) * T + dx * k * 700, y = (d.wy + 0.5) * T + 46 + dy * k * 700;
      list.push({ key: 'boat', x, y, t: now / 1000, flip: dx === 0 ? false : (out < 18) ? dx < 0 : dx > 0, alpha: 1 - Math.max(0, k - 0.75) * 4 });
    }
    R.home.traders = list;
  }
}
