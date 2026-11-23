// Dynasty, court and nemesis (8.0).
// The throne: a ruler who ages (a year every four hours), marries, has heirs, and dies; the heir succeeds.
// The council: four seats filled with courtiers who draw wages and give the realm their skill.
// The nemesis: one enemy captain who remembers you, leads raids in person, flees to return stronger,
// and is only gone for good when you cut him down.
import { FIRST_NAMES, EPITHETS, RIVALS, rivalRoster, ENEMIES } from './data.js';

export const YEAR = 4 * 3600000;
export const RULER_TRAITS = {
  warlord: { name: 'Warlord', desc: '+8% soldier damage', fx: { dmg: 0.08 } },
  stalwart: { name: 'Stalwart', desc: '+8% soldier health', fx: { hp: 0.08 } },
  steward: { name: 'Thrifty', desc: '+8% gathering', fx: { gather: 0.08 } },
  merchant: { name: 'Merchant', desc: 'Trade boats carry 12% more', fx: { trade: 0.12 } },
  diplomat: { name: 'Silver-tongued', desc: 'Gifts win half again as much regard', fx: { regard: 0.5 } },
  scholar: { name: 'Learned', desc: '+10% experience', fx: { xp: 0.1 } },
  architect: { name: 'Builder', desc: '+15% tower damage', fx: { towerDmg: 0.15 } },
  pious: { name: 'Pious', desc: '+5% health and +5% gathering', fx: { hp: 0.05, gather: 0.05 } },
};
const TRAIT_KEYS = Object.keys(RULER_TRAITS);
export const SEATS = {
  steward: { name: 'Steward', desc: s => `+${s * 3}% gathering`, fx: s => ({ gather: s * 0.03 }) },
  marshal: { name: 'Marshal', desc: s => `+${s * 2}% soldier health and damage`, fx: s => ({ hp: s * 0.02, dmg: s * 0.02 }) },
  chancellor: { name: 'Chancellor', desc: s => `Gifts win ${s * 15}% more regard; trade boats carry ${s * 3}% more`, fx: s => ({ regard: s * 0.15, trade: s * 0.03 }) },
  spymaster: { name: 'Spymaster', desc: s => `Raiding parties ${s * 4}% smaller`, fx: s => ({ raidSize: -s * 0.04 }) },
};
const HOUSES = ['Ashford', 'Blackwood', 'Greymoor', 'Oakhart', 'Rivenmere', 'Thornbury', 'Highcrest', 'Saltmarsh', 'Wyvernhall', 'Stonebridge', 'Larkspur', 'Emberfell'];
const EPI = ['the Scarred', 'Twice-Scarred', 'the Unbroken', 'the Undying', 'the Dread'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const avatar = () => 'av_h' + (1 + Math.floor(Math.random() * 25));
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export class Court {
  constructor(realm) { this.R = realm; this.t = 5; this._b = null; this._bT = 0; }
  get S() { return this.R.state; }
  // ---------------------------------------------------------------- dynasty
  get D() {
    const S = this.S;
    if (!S.dynasty) {
      const f = S.soldiers.find(s => s.hero && s.title === 'Founder') || S.soldiers[0];
      const first = f ? f.name.split(' ')[0] : pick(FIRST_NAMES);
      const sur = f ? f.name.split(' ').slice(1).join(' ') : '';
      S.dynasty = { house: 'House ' + (sur && !/^the /.test(sur) ? sur : pick(HOUSES)), gen: 1, ruler: this.person(first, 30, 2), heir: null, spouse: null, past: [], names: {} };
      S.dynasty.names[first] = 1;
    }
    return S.dynasty;
  }
  person(name, age, nTraits = 2, from = []) {
    const tr = new Set(from.filter(Boolean).slice(0, 1)); while (tr.size < nTraits) tr.add(pick(TRAIT_KEYS));
    return { name, born: Date.now() - age * YEAR, dies: 58 + Math.floor(Math.random() * 15), traits: [...tr], avatar: avatar() };
  }
  age(p) { return Math.floor((Date.now() - p.born) / YEAR); }
  regnal(p) { const n = this.D.names[p.name] || 1; return n > 1 ? `${p.name} ${ROMAN[n] || n}` : p.name; }
  title() { const S = this.S; return S.tier >= 5 ? 'King' : S.tier >= 3 ? 'Lord' : 'Chief'; }
  marryCost() { return { gold: 300 + this.S.tier * 150 }; }
  // a match with a kingdom you are at peace or allied with: their regard rises, and an heir may follow
  suitors() {
    const K = this.R.kingdoms; if (!K || !this.R.sea.ocean) return [];
    return K.known().filter(is => !K.houseKey(is) && ['peace', 'ally'].includes(K.stance(is)) && !K.st(is).owner).slice(0, 4);
  }
  marry(id) {
    const D = this.D, K = this.R.kingdoms, is = this.R.sea.ocean.islandById(id);
    if (D.spouse) return 'The ruler is already wed.';
    if (!is || !this.suitors().includes(is)) return 'That court will not offer a match.';
    if (K.st(is).rel < 20) return `${is.kingdom.name} does not think well enough of you yet. Their regard must be friendly.`;
    if (!this.R.pay(this.marryCost())) return 'A wedding needs gold for the feast and the dowry.';
    D.spouse = { name: pick(FIRST_NAMES), from: id, house: is.kingdom.name, avatar: avatar(), trait: pick(TRAIT_KEYS) };
    const k = K.st(is); k.rel = Math.min(100, k.rel + 30); if (k.stance === 'peace' && k.rel >= 50) k.stance = 'ally';
    D.childAt = Date.now() + (0.5 + Math.random()) * YEAR;
    this.R.log(`${this.regnal(D.ruler)} wed ${D.spouse.name} of ${is.kingdom.name}.`);
    K.news(`Your ruler wed ${D.spouse.name} of ${is.kingdom.name}. The two houses are bound.`);
    this.R.save(); return null;
  }
  // the old ruler dies; the heir (or, with none, a cousin) takes the throne
  succeed(cause) {
    const D = this.D, S = this.S, old = D.ruler, K = this.R.kingdoms;
    D.past.unshift({ name: this.regnal(old), avatar: old.avatar, traits: old.traits, from: old.crowned || old.born + 30 * YEAR, to: Date.now(), age: this.age(old), cause });
    D.past.length = Math.min(D.past.length, 30);
    let heir = D.heir, crisis = false;
    if (!heir) { crisis = true; heir = this.person(pick(FIRST_NAMES), 24 + Math.floor(Math.random() * 10), 2); }
    D.names[heir.name] = (D.names[heir.name] || 0) + 1;
    heir.crowned = Date.now(); D.ruler = heir; D.heir = null; D.spouse = null; D.gen++; D.childAt = 0;
    const who = this.regnal(heir);
    if (crisis) {
      S.renown = Math.max(0, S.renown - 1);
      if (K) for (const id of Object.keys(S.world.conquered || {})) { const is = this.R.sea.ocean.islandById(id); if (is) K.st(is).loyalty -= 30; }
      this.R.ui.banner('A succession crisis', `${this.regnal(old)} died with no heir. A cousin, ${who}, takes the throne, but the vassals grumble and some renown is lost.`, 'red');
    } else this.R.ui.banner('The ruler is dead. Long live the ruler', `${this.regnal(old)} has died (${cause}). ${who} takes the throne.`, 'gold');
    this.R.log(`${this.regnal(old)} died, ${cause}. ${who} rules now.`);
    // the crowned soldier's name follows the throne
    const king = S.soldiers.find(s => s.type === 'king'); if (king) king.name = 'King ' + who;
    this._b = null; this.R.save();
  }
  // ---------------------------------------------------------------- council
  get C() { const S = this.S; return S.council || (S.council = { seats: {}, pool: [], poolAt: 0 }); }
  candidates() {
    const C = this.C;
    if (Date.now() > C.poolAt || !C.pool.length) {
      const top = Math.min(5, 1 + Math.floor(this.S.tier * 0.9));
      C.pool = [0, 1, 2].map(() => { const skill = 1 + Math.floor(Math.random() * top); return { id: Math.floor(Math.random() * 1e9), name: pick(FIRST_NAMES) + ' ' + pick(EPITHETS), skill, avatar: avatar(), loyalty: 60 + Math.floor(Math.random() * 30) }; });
      C.poolAt = Date.now() + 2 * 3600000;
    }
    return C.pool;
  }
  hireCost(c) { return { gold: 80 * c.skill * c.skill + 60 }; }
  wage(c) { return 10 + c.skill * 12; } // gold per hour
  hire(cid, seat) {
    const C = this.C, c = C.pool.find(x => x.id === cid); if (!c || !SEATS[seat]) return 'They have gone.';
    if (!this.R.pay(this.hireCost(c))) return 'Not enough gold.';
    if (C.seats[seat]) this.R.log(`${C.seats[seat].name} left the council.`);
    C.seats[seat] = { ...c, paidAt: Date.now() }; C.pool = C.pool.filter(x => x !== c);
    this._b = null; this.R.save(); return null;
  }
  dismiss(seat) { const C = this.C; if (C.seats[seat]) { this.R.log(`${C.seats[seat].name} was dismissed from the council.`); delete C.seats[seat]; this._b = null; this.R.save(); } }
  payWages() {
    const C = this.C, now = Date.now();
    for (const [seat, c] of Object.entries(C.seats)) {
      const hrs = Math.floor((now - c.paidAt) / 3600000); if (hrs < 1) continue;
      c.paidAt += hrs * 3600000;
      const owe = this.wage(c) * Math.min(hrs, 24);
      if (this.S.res.gold >= owe) { this.S.res.gold -= owe; c.loyalty = Math.min(100, c.loyalty + 2 * hrs); }
      else { c.loyalty -= 15 * Math.min(hrs, 4); this.R.ui.toast(`${c.name} was not paid and grows unhappy.`, 'red'); }
      if (c.loyalty <= 0) { delete C.seats[seat]; this._b = null; this.R.ui.banner('A councillor leaves', `${c.name}, your ${SEATS[seat].name}, has left the court unpaid.`, 'red'); }
    }
  }
  // ---------------------------------------------------------------- bonuses (cached)
  bonus() {
    if (this._b && Date.now() - this._bT < 5000) return this._b;
    const out = {}, add = fx => { for (const k in fx) out[k] = (out[k] || 0) + fx[k]; };
    if (this.S.dynasty || this.S.soldiers) { const D = this.D; for (const t of D.ruler.traits) add(RULER_TRAITS[t].fx); if (D.spouse) add(RULER_TRAITS[D.spouse.trait].fx); }
    for (const [seat, c] of Object.entries(this.C.seats)) add(SEATS[seat].fx(c.skill));
    this._b = out; this._bT = Date.now(); return out;
  }
  fx(k) { return this.bonus()[k] || 0; }
  // ---------------------------------------------------------------- nemesis
  get N() { return this.S.nemesis || null; }
  nemesisName(n = this.N) { return n ? `${n.name} ${n.epithet}` : ''; }
  // a captain who survived your blades swears revenge
  maybeNemesis(region) {
    const S = this.S; if (this.N && this.N.status === 'active') return;
    if (this.N && Date.now() - (this.N.endAt || 0) < 2 * 86400000) return;
    if (S.tier < 2 || !region || region.key !== 'rival' || Math.random() > 0.4) return;
    const key = region.rival || null, is = region.kingdomIsle ? this.R.sea.ocean.islandById(region.kingdomIsle) : null;
    const color = key || (is && is.kingdom.color) || 'red', house = key ? RIVALS.find(r => r.key === key).name : is ? is.kingdom.name : 'a rival house';
    S.nemesis = { name: pick(FIRST_NAMES), epithet: pick(['the Grim', 'Blackhand', 'the Cruel', 'Ironjaw', 'the Wolf', 'Redaxe']), color, rival: key, isle: region.kingdomIsle || null, house, level: 1, scars: 0, met: 1, wins: 0, status: 'active', since: Date.now() };
    const N = S.nemesis;
    this.R.ui.banner('A nemesis rises', `${this.nemesisName(N)}, a captain of ${house}, escaped the field and swore to return. He will lead their raids himself, and grow stronger each time he gets away.`, 'red');
    this.R.log(`${this.nemesisName(N)} of ${house} swore vengeance on your realm.`);
  }
  // does this raid belong to him? if so he leads it
  nemesisRegion() {
    const N = this.N; if (!N || N.status !== 'active') return null;
    const is = N.isle ? this.R.sea.ocean.islandById(N.isle) : null;
    const lvl = N.rival ? this.R.rivalLevel(N.rival) : is ? Math.max(1, Math.round(is.level * 0.8)) : 3;
    return { key: 'rival', name: N.house, rival: N.rival || undefined, kingdomIsle: N.isle || undefined, enemies: rivalRoster(N.color, lvl), nemesis: true };
  }
  leads(region) { const N = this.N; return N && N.status === 'active' && region && region.key === 'rival' && ((N.rival && region.rival === N.rival) || (N.isle && region.kingdomIsle === N.isle)); }
  nemesisUnit() { const N = this.N, pool = rivalRoster(N.color, 99).filter(k => ENEMIES[k]); return pool.includes(`${N.color}_swordsman`) ? `${N.color}_swordsman` : pool.includes(`${N.color}_warrior`) ? `${N.color}_warrior` : pool[0]; }
  // he is spawned: make him a match for the realm
  empower(u) {
    const N = this.N; u.nemesis = true; u.nemName = this.nemesisName(N);
    u.maxHp = Math.round(u.maxHp * (3 + N.level * 0.5)); u.hp = u.maxHp; u.dmg *= 1.5 + N.level * 0.15; u.armor = Math.min(0.5, (u.armor || 0) + 0.1);
    N.met++;
    this.R.ui.banner(`${u.nemName} is here`, `Your nemesis leads this raid in person. Bring him down before he can flee.`, 'red');
  }
  // every frame of a raid: he flees when badly hurt; afterwards we learn whether he died or got away
  update(dt) {
    this.t -= dt; if (this.t <= 0) { this.t = 20; this.tick(); }
    const R = this.R.raid; if (!R || !R.units) return;
    for (const u of R.units) {
      if (!u.nemesis || u.nemDone) continue;
      if (u.alive && !u.leaving && u.hp < u.maxHp * 0.25) { u.leaving = true; u.target = null; this.R.ui.toast(`${u.nemName} is fleeing for his boat. Cut him down!`, 'red'); }
      if (!u.alive || u.dead) { u.nemDone = true; if (u.hp <= 0) this.nemesisSlain(); else this.nemesisEscaped(); }
    }
  }
  nemesisSlain() {
    const N = this.N; if (!N) return;
    N.status = 'slain'; N.endAt = Date.now(); this.S.stats.nemeses = (this.S.stats.nemeses || 0) + 1;
    const gold = this.R.addRes('gold', 300 + N.level * 150);
    this.R.dropGear && this.R.dropGear(4 + N.level * 2, { from: this.nemesisName(N) });
    this.R.ui.banner('Your nemesis is slain', `${this.nemesisName(N)} will trouble you no more. His war chest held ${gold} gold.`, 'gold');
    this.R.log(`${this.nemesisName(N)}, your nemesis, was slain after ${N.met} meetings.`);
    this.R.kingdoms && this.R.kingdoms.news(`${this.nemesisName(N)} of ${N.house} fell in battle against your realm.`);
  }
  nemesisEscaped() {
    const N = this.N; if (!N) return;
    N.level++; N.scars++; N.epithet = EPI[Math.min(EPI.length - 1, N.scars - 1)];
    this.R.ui.banner('He got away', `${N.name} escaped to his boat. He will be back as ${this.nemesisName(N)}, stronger than before.`, 'red');
    this.R.log(`${N.name} escaped, and is now called ${this.nemesisName(N)}.`);
  }
  onRaidLost(region) { const N = this.N; if (this.leads(region)) { N.level++; N.wins++; this.R.log(`${this.nemesisName(N)} grows bolder after beating you.`); } }
  // ---------------------------------------------------------------- the slow clock
  tick() {
    const D = this.D, now = Date.now();
    const king = this.S.soldiers.find(s => s.type === 'king'); if (king && king.name !== 'King ' + this.regnal(D.ruler)) king.name = 'King ' + this.regnal(D.ruler);
    this.payWages();
    if (D.spouse && !D.heir && D.childAt && now > D.childAt) {
      D.heir = this.person(pick(FIRST_NAMES), 0, 2, [pick(D.ruler.traits), D.spouse.trait]); D.childAt = 0;
      this.R.ui.banner('An heir is born', `${D.spouse.name} has given birth to ${D.heir.name}, heir to the throne.`, 'gold');
      this.R.log(`${D.heir.name} was born, heir to ${D.house}.`); this.R.save();
    }
    if (this.age(D.ruler) >= D.ruler.dies && !this.R.exp && !(this.R.raid && this.R.raid.active)) this.succeed('of old age');
  }
  catchUp() { this.tick(); }
}
