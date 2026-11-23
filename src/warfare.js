// Armies, generals and sea battles (7.0).
// Generals: veterans appointed to lead. Every soldier fighting beside a general gains from their doctrine,
// and a general's command grows with each victory. The ship: guns, sails and hull, refitted at home.
// Sea battles: kingdoms at war send fleets against your colonies and your island; meet them at sea.
import { XP_LEVELS, levelCap } from './data.js';
import { rivalRoster } from './data.js';

export const DOCTRINES = {
  vanguard: { name: 'Vanguard', desc: 'Leads the charge: +12% damage and +8% speed for all who fight beside them.', dmg: 0.12, speed: 0.08 },
  bulwark: { name: 'Bulwark', desc: 'Holds the line: +16% health and +5% armour for all who fight beside them.', hp: 0.16, armor: 0.05 },
  marksman: { name: 'Marksman', desc: 'Calls the volleys: +18% damage for archers and other ranged soldiers.', rangedDmg: 0.18 },
  warden: { name: 'Warden', desc: 'Tends the wounded: +6% health, and soldiers near them mend during battle.', hp: 0.06, mend: 0.015 },
};
export const RANKS = ['Captain', 'Commander', 'Marshal'];
export const SHIP = {
  guns: { name: 'Cannons', desc: 'More guns: +15% strength in sea battles per level.', max: 5 },
  sails: { name: 'Sails', desc: 'Better canvas: the fleet sails 8% faster per level.', max: 5 },
  hull: { name: 'Hull', desc: 'Thicker oak: +10% strength in sea battles, and fewer crew hurt when you lose.', max: 5 },
};

export class Warfare {
  constructor(realm) { this.R = realm; this.mendT = 0; }
  get S() { return this.R.state; }
  // ---- generals
  maxGenerals() { return 1 + Math.floor(this.S.tier / 2); }
  generals() { return this.S.soldiers.filter(r => r.general); }
  rank(rec) { const w = rec.command || 0; return w >= 15 ? 2 : w >= 5 ? 1 : 0; }
  rankName(rec) { return RANKS[this.rank(rec)]; }
  power(rec) { return [1, 1.4, 1.8][this.rank(rec)]; }
  appointCost() { return { gold: 250 + this.generals().length * 250 }; }
  canAppoint(rec) {
    if (rec.general) return 'Already a general.';
    if (rec.type === 'king') return 'The King commands already.';
    if (rec.level < 6) return `Generals are chosen from veterans of level 6 or more. Level ${rec.level} now.`;
    if (this.generals().length >= this.maxGenerals()) return `Your realm can keep ${this.maxGenerals()} general${this.maxGenerals() > 1 ? 's' : ''} at this size.`;
    return null;
  }
  appoint(rec, doctrine) {
    const why = this.canAppoint(rec); if (why) return why;
    if (!DOCTRINES[doctrine]) return 'Choose a doctrine.';
    if (!this.R.pay(this.appointCost())) return 'Not enough gold.';
    rec.general = doctrine; rec.command = rec.command || 0;
    this.R.log(`${rec.name} was made a general, of the ${DOCTRINES[doctrine].name} school.`);
    this.restat(); this.R.save(); return null;
  }
  dismiss(rec) { rec.general = null; this.restat(); this.R.save(); }
  restat() { for (const sc of [this.R.home, this.R.exp]) if (sc) for (const u of sc.units) if (u.rec && u.alive) { const f = u.hp / u.maxHp; u.applyStats(); u.hp = Math.max(1, u.maxHp * f); } }
  // the summed doctrine bonuses of every living general in a scene, for a soldier's stats
  aura(scene, rec, ranged) {
    const out = { hp: 0, dmg: 0, speed: 0, armor: 0 };
    if (!scene) return out;
    const gens = new Set();
    for (const u of scene.units || []) if (u.rec && u.rec.general && !u.dead && u.team === 0) gens.add(u.rec);
    if (rec.general && (scene.units || []).some(u => u.rec === rec)) gens.add(rec);
    for (const g of gens) {
      const D = DOCTRINES[g.general]; if (!D) continue; const p = this.power(g);
      out.hp += (D.hp || 0) * p; out.dmg += ((D.dmg || 0) + (ranged ? D.rangedDmg || 0 : 0)) * p; out.speed += (D.speed || 0) * p; out.armor += (D.armor || 0) * p;
    }
    return out;
  }
  // wardens mend soldiers around them during a fight
  update(dt) {
    this.mendT -= dt; if (this.mendT > 0) return; this.mendT = 1;
    // when the generals on a field change, everyone's stats are worked out again
    for (const sc of [this.R.home, this.R.exp]) {
      if (!sc) continue;
      const sig = sc.units.filter(u => u.rec && u.rec.general && !u.dead).map(u => u.rec.id + u.rec.general + this.rank(u.rec)).join(',');
      if (sc._genSig !== sig) { sc._genSig = sig; for (const u of sc.units) if (u.rec && u.alive) { const f = u.hp / u.maxHp; u.applyStats(); u.hp = Math.max(1, u.maxHp * f); } }
    }
    for (const sc of [this.R.home, this.R.exp]) {
      if (!sc) continue;
      const fight = sc === this.R.exp || (this.R.raid && this.R.raid.active); if (!fight) continue;
      for (const g of sc.units) {
        if (!g.rec || g.dead || g.rec.general !== 'warden') continue;
        const m = DOCTRINES.warden.mend * this.power(g.rec);
        for (const u of sc.units) if (u.team === 0 && u.rec && !u.dead && u.hp < u.maxHp && Math.hypot(u.x - g.x, u.y - g.y) < 260) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * m);
      }
    }
  }
  // a battle won: every general who fought gains command
  victory(scene) {
    for (const u of (scene && scene.units) || []) if (u.rec && u.rec.general && !u.dead) {
      const before = this.rank(u.rec); u.rec.command = (u.rec.command || 0) + 1;
      if (this.rank(u.rec) > before) this.R.ui.toast(`${u.rec.name} is now a ${this.rankName(u.rec)}. Their doctrine grows stronger.`, 'gold');
    }
  }
  // ---- the ship
  ship() { const W = this.S.world; return W.ship || (W.ship = { guns: 0, sails: 0, hull: 0 }); }
  shipCost(k) { const l = this.ship()[k] + 1; return { wood: Math.round(180 * l ** 1.6), gold: Math.round(140 * l ** 1.6) }; }
  refit(k) {
    const sh = this.ship(); if (!SHIP[k]) return 'No such refit.';
    if (sh[k] >= SHIP[k].max) return 'Already as good as it gets.';
    if (!this.R.sea.atHome()) return 'The fleet must be at home to be refitted.';
    if (!this.R.pay(this.shipCost(k))) return 'Not enough wood and gold.';
    sh[k]++; this.R.save(); return null;
  }
  speedMul() { return 1 + this.ship().sails * 0.08; }
  // ---- sea battles
  crewPower() {
    const crew = this.R.sea.crewRecs(); if (!crew.length) return 0;
    const sh = this.ship();
    let p = crew.reduce((a, r) => a + 6 + r.level * 4 + (r.promoted ? 10 : 0) + (r.hero ? 6 : 0), 0);
    let g = 0; for (const r of crew) if (r.general) g += 0.12 * this.power(r);
    return Math.round(p * (1 + g) * (1 + sh.guns * 0.15 + sh.hull * 0.1));
  }
  odds(f) { const me = this.crewPower(); return me / (me + f.power); }
  oddsWord(f) { const o = this.odds(f); return o > 0.75 ? 'They are no match for you' : o > 0.55 ? 'The odds favour you' : o > 0.42 ? 'An even fight' : o > 0.25 ? 'They outgun you' : 'They would crush you'; }
  // fight a fleet that the crew has caught up with
  engage(f) {
    const R = this.R, Z = R.sea, W = Z.W, K = R.kingdoms, crew = Z.crewRecs();
    if (!crew.length) return null;
    const a = Z.ocean.islandById(f.from), name = a ? a.kingdom.name : 'the enemy';
    const odds = this.odds(f), win = Math.random() < odds;
    // five volleys, told in order; the winner lands most of them
    let rounds; do { rounds = Array.from({ length: 5 }, () => Math.random() < odds); } while (rounds.filter(Boolean).length >= 3 !== win);
    const res = { win, name, rounds, hurt: [], loot: 0 };
    if (win) {
      W.fleets.splice(W.fleets.indexOf(f), 1);
      if (a) { const k = K.st(a); k.power = Math.max(20, k.power - f.power * 0.5); }
      res.loot = R.addRes('gold', Math.round(40 + f.power * 1.5));
      for (const r of crew) this.recXp(r, 30);
      for (const r of crew) if (r.general) r.command = (r.command || 0) + 1;
      this.S.stats.seaWins = (this.S.stats.seaWins || 0) + 1;
      K.news(`Your fleet sank a war fleet of ${name} at sea.`);
    } else {
      const n = Math.max(1, Math.min(crew.length - 1, Math.round(crew.length * (0.4 - this.ship().hull * 0.06))));
      const pool = crew.filter(r => r.type !== 'king').sort(() => Math.random() - 0.5).slice(0, n);
      for (const r of pool) { r.status = 'wounded'; r.woundedUntil = Date.now() + 15 * 60000; r.hp = undefined; W.crew = W.crew.filter(id => id !== r.id); res.hurt.push(r.name); }
      f.power *= 0.8;
      const fx = W.fleet; W.dest = null; fx.x -= (f.x - fx.x) * 0.5; fx.y -= (f.y - fx.y) * 0.5; // driven off
      K.news(`A war fleet of ${name} beat your fleet at sea.`);
    }
    W.chase = null; R.save();
    return res;
  }
  recXp(r, n) { if (r.level >= levelCap(r)) return; r.xp = (r.xp || 0) + n; while (r.level < levelCap(r) && r.xp >= XP_LEVELS[r.level + 1]) r.level++; }
  // an enemy fleet reaches your island: they come ashore
  landAtHome(f) {
    const R = this.R, a = R.sea.ocean.islandById(f.from); if (!a) return true;
    if (R.exp || (R.raid && R.raid.active) || R.pendingRaid || R.events.blocking) return false; // they wait offshore
    const region = { key: 'rival', name: a.kingdom.name, kingdomIsle: a.id, enemies: rivalRoster(a.kingdom.color, Math.max(1, Math.round(a.level * 0.8))) };
    const plan = R.planRaid('raid', { region, budget: 3 + f.power / 12 });
    const keep = R.state.timers.raid;
    R.startRaid(plan, { title: 'Invasion', text: `The war fleet of ${a.kingdom.name} has reached your shore. Their soldiers land now.` });
    R.state.timers.raid = keep;
    return true;
  }
}
