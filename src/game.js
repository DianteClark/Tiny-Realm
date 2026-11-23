// The Realm: persistent state, economy, pawn work, raids, expeditions, quests, saving.
import { T, generateIsland, rng, hashStr, reachable, boatSpots, K_LOW, K_WATER } from './terrain.js';
import * as Annex from './annex.js';
import { Scene, Unit, Building, cellOf } from './world.js';
import {
  UNITS, ENEMIES, BUILDINGS, TIERS, TRAITS, COMMON_TRAITS, XP_LEVELS, MAX_LEVEL, RELICS, REGIONS, levelCap, PROMOTIONS, PROMO_COST,
  islandInfo, FIRST_NAMES, EPITHETS, QUESTS, endlessQuest, renownCost, RENOWN_BONUS,
  maxBuildingLevel, upgradeCost, upgradeTime, levelHp, levelEffects, castlePop,
  RIVALS, rivalDef, rivalRoster, CAMP_STRUCTS, PROVINCES, provinceOf, NIGHT_CREATURES,
} from './data.js';
import { EventDirector } from './events.js';
import * as Gear from './gear.js';
import { Challenges } from './challenges.js';
import { Needs, EXCHANGE } from './needs.js';
import { CHAPTERS, chapterState } from './campaign.js';
import { Trade } from './trade.js';
import { Decrees, DECREES } from './decrees.js';
import { Seasonal } from './seasonal.js';
import * as Legacy from './legacy.js';
import { Squads, districtAt, DISTRICTS } from './squads.js';
import { Sea } from './sea.js';
import { Kingdoms } from './kingdoms.js';
import { Colonies } from './colonies.js';
import { Warfare } from './warfare.js';
import { Court } from './court.js';
import { Saga } from './saga.js';
import { seedFromWords, randomSeedWords } from './ocean.js';
import { SHEETS } from './assets.js';
import { audio } from './audio.js';
import { Environment } from './env.js';
import { Orders } from './orders.js';
import { holidayFor, moonPhase } from './calendar.js';

const SAVE_KEY = 'tinyrealm.save.v4'; // 4.0: a new age; older saves are not carried over
const OLD_KEYS = ['tinyrealm.save.v1'];
// The home map is a big sea; the starting island (BASE_W x BASE_H) sits in the middle at BASE_X,BASE_Y
// and annexed land (src/annex.js) grows out from it.
const HOME_W = 96, HOME_H = 72;
const BASE_W = 46, BASE_H = 34, BASE_X = (HOME_W - BASE_W) >> 1, BASE_Y = (HOME_H - BASE_H) >> 1;
const MAP_VERSION = 3; // bump when island generation changes so saves get migrated (3: island moved into the 96x72 sea)
const CASTLE = { x: 20 + BASE_X, y: 14 + BASE_Y, w: 5, h: 2 };
const HOME_CFG = { w: HOME_W, h: HOME_H, baseW: BASE_W, baseH: BASE_H, ox: BASE_X, oy: BASE_Y, castle: CASTLE };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const center = c => c * T + T / 2;
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function freshState() {
  const seed = (Math.random() * 1e9) >>> 0;
  return {
    v: 1, seed, created: Date.now(), lastSeen: Date.now(),
    res: { gold: 60, wood: 120, meat: 80 },
    tier: 1, renown: 0, pawns: 3,
    jobs: { wood: 2, gold: 1, meat: 0, build: 0 },
    buildings: null, upgradeEnd: 0, upgradeTotal: 0,
    trees: null, golds: null, goldRespawns: [], sheep: 9,
    soldiers: [], fallen: [], nextId: 1,
    relics: {}, frontier: 1, cleared: 0,
    stats: { raidsSurvived: 0, raidsLost: 0, trollsSlain: 0, kills: 0, eventsSurvived: 0, wood: 0, gold: 0, meat: 0 },
    questIdx: 0,
    timers: { raid: 480, minor: 150, major: 1500 },
    daily: { last: '', streak: 0, bounty: '' },
    log: [], introSeen: false,
    gear: [], nextGear: 0,
  };
}

export class Realm {
  constructor(ui) {
    this.ui = ui;
    this.state = null;
    this.home = null; this.exp = null; this.scene = null;
    this.raid = null; this.saveT = 0; this.questT = 0; this.regenT = 0;
    this.events = new EventDirector(this);
    this.env = new Environment(this);
    this.orders = new Orders(this);
    this.chal = new Challenges(this);
    this.needs = new Needs(this);
    this.trade = new Trade(this);
    this.decrees = new Decrees(this);
    this.seasonal = new Seasonal(this);
    this.squads = new Squads(this);
    this.sea = new Sea(this);
    this.kingdoms = new Kingdoms(this);
    this.colonies = new Colonies(this);
    this.war = new Warfare(this);
    this.court = new Court(this);
    this.saga = new Saga(this);
  }

  // ------------------------------------------------------------ persistence
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    const fresh = !s;
    let newAge = false;
    if (fresh) for (const k of OLD_KEYS) if (localStorage.getItem(k)) { newAge = true; localStorage.removeItem(k); }
    if (newAge) { const L = Legacy.loadLegacy(); L.points = 0; L.founder = null; Legacy.saveLegacy(L); } // the old age's history stays in the Hall of Realms
    this.state = Object.assign(freshState(), s || {});
    this.state.stats = Object.assign(freshState().stats, this.state.stats || {});
    this.state.timers = Object.assign(freshState().timers, this.state.timers || {});
    for (const r of [...(this.state.soldiers || []), ...(this.state.fallen || [])]) if (r.avatar === 'av_horseman') r.avatar = 'av_horseman1';
    for (const r of this.state.soldiers || []) if (/ undefined$/.test(r.name)) r.name = r.name.replace(/ undefined$/, ' ' + EPITHETS[r.id % EPITHETS.length]);
    this.state.daily = Object.assign(freshState().daily, this.state.daily || {});
    this.state.rivals = this.state.rivals || {};
    for (const r of RIVALS) this.state.rivals[r.key] = Object.assign({ subjugated: false, defeats: 0, raids: 0, tributeAt: 0, met: false }, this.state.rivals[r.key] || {});
    // a voyage interrupted by closing the app counts as a retreat
    const aboard = (this.state.world && this.state.world.crew) || [];
    for (const rec of this.state.soldiers) if (rec.status === 'away' && !aboard.includes(rec.id)) { rec.status = 'home'; rec.post = null; }
    if (this.state.timers.raid < 60) this.state.timers.raid = 60;
    if (fresh) { // a world of your own: the seed is a pair of words and a number, or one you chose
      let words = null; try { words = localStorage.getItem('tinyrealm.nextSeed'); localStorage.removeItem('tinyrealm.nextSeed'); } catch (e) { /* ignore */ }
      this.state.seed = seedFromWords(words || randomSeedWords());
    }
    const inherit = fresh ? Legacy.applyToFresh(this.state) : null;
    if (fresh) this.foundHamlet();
    this.buildHome();
    this.sea.init();
    if (fresh) this.hamletHouse();
    const away = fresh ? 0 : this.applyOffline();
    this.scene = this.home;
    this.checkDaily();
    // closing the app does not make raiders go away: they are still on the beach
    if (!fresh && this.state.raidAshore) { this.state.raidAshore = false; this.state.timers.raid = 3; this.raidWarned = true; this.pendingRaid = this.planRaid(); this.resumedRaid = true; }
    // a battle cut short by closing the app is abandoned; the crew is back aboard
    const abandoned = !fresh && this.state.battleAt; if (abandoned) { this.log(`The landing at ${this.state.battleAt} was abandoned.`); this.state.battleAt = null; }
    // a trade boat that was fighting pirates when the app closed lands its cargo now
    for (const sl of (this.state.trade && this.state.trade.slots) || []) if (sl.waiting) { sl.waiting = false; sl.back = Date.now() - 1; }
    return { fresh, away, inherit, newAge, abandoned };
  }
  save() {
    if (!this.state) return;
    this.syncState();
    this.state.raidAshore = !!(this.raid && this.raid.active && this.raid.kind !== 'pirates');
    this.state.battleAt = this.exp && !this.exp.ended ? this.exp.islandName : null;
    this.state.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { console.error(e); }
  }
  exportSave() { this.save(); return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); }
  importSave(str) {
    const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (!s || !s.seed || !s.res) throw new Error('Not a Tiny Realm save');
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  }
  wipe() { localStorage.removeItem(SAVE_KEY); this.state = null; }

  syncState() {
    const S = this.state, h = this.home;
    if (!h) return;
    const lifted = this.ui && this.ui.place && this.ui.place.move ? [this.ui.place.move] : [];
    S.buildings = [...h.buildings, ...lifted].map(b => ({ type: b.type, cx: b.cx, cy: b.cy, hp: Math.round(b.hp), maxHp: b.maxHp, buildEnd: b.buildEnd, buildTotal: b.buildTotal, variant: b.variant, queue: b.queue, level: b.level, upEnd: b.upEnd, upTotal: b.upTotal }));
    S.trees = h.trees.map(t => ({ cx: t.cx, cy: t.cy, wood: t.wood, regrow: t.regrow })); // cx,cy: matched by position on load (annex.js)
    S.golds = h.golds.map(g => ({ cx: g.cx, cy: g.cy, amount: Math.round(g.amount) }));
    S.sheep = h.sheep.filter(s => !s.caught).length;
    for (const u of h.units) if (u.rec && u.alive) { u.rec.hp = Math.round(u.hp); u.rec.post = { x: Math.round(u.home.x), y: Math.round(u.home.y) }; }
  }

  // ------------------------------------------------------------ feedback
  sfx(name, pos, scene) { if (scene && scene !== this.scene) return; audio.play(name, pos); }
  shake(n, scene) { if (scene && scene !== this.scene) return; if (document.documentElement.classList.contains('calm')) return; this.shakeAmt = Math.min(14, Math.max(this.shakeAmt || 0, n)); }

  // ------------------------------------------------------------ bonuses
  provinceBonus() {
    const out = {};
    for (const a of this.state.annexed || []) { const b = provinceOf(a.region).bonus; for (const k in b) out[k] = (out[k] || 0) + b[k]; }
    return out;
  }
  bonus() {
    const R = this.state.relics, rn = this.state.renown, P = this.provinceBonus();
    const b = {
      hp: (R.minotaurhorn ? 0.1 : 0) + (R.seacrown ? 0.1 : 0) + rn * RENOWN_BONUS.power,
      dmg: rn * RENOWN_BONUS.power + (R.seacrown ? 0.1 : 0) + (R.sunstone ? 0.08 : 0),
      meleeDmg: R.trolltusk ? 0.1 : 0,
      rangedDmg: R.sharktooth ? 0.1 : 0,
      atkSpeed: R.pandabelt ? 0.05 : 0,
      towerDmg: (R.boneidol ? 0.25 : 0) + (R.frostheart ? 0.2 : 0),
      gather: (R.harvestsickle ? 0.08 : 0) + rn * RENOWN_BONUS.gather + (R.rubberduck ? 0.05 : 0) + (R.seacrown ? 0.1 : 0) + (this.needs && this.home ? this.needs.gatherBonus() : 0),
      gold: R.goldenacorn ? 0.1 : 0,
      wood: R.bearpelt ? 0.1 : 0,
      castleHp: R.turtleshell ? 0.2 : 0,
    };
    for (const k in P) b[k] = (b[k] || 0) + P[k];
    if (this.state.legacyRank) { const L = Legacy.rankBonus(this.state.legacyRank); for (const k of ['hp', 'dmg', 'gather', 'xp']) b[k] = (b[k] || 0) + L[k]; }
    if (this.decrees) { const a = this.decrees.active(); if (a) for (const k of ['dmg', 'gather', 'towerDmg', 'xp']) if (a.fx[k]) b[k] = (b[k] || 0) + a.fx[k]; }
    if (this.court && this.state.soldiers) { const c = this.court.bonus(); for (const k of ['hp', 'dmg', 'gather', 'towerDmg', 'xp']) if (c[k]) b[k] = (b[k] || 0) + c[k]; }
    return b;
  }
  get tierDef() { return TIERS[this.state.tier]; }
  seatName() { return this.state && this.state.tier >= 3 ? 'castle' : 'hall'; } // what the realm's seat is called in text
  // ---- 3.4 village services
  tavernHero() { // today's wandering hero, the same all day
    const S = this.state, day = new Date().toDateString();
    if (!S.tavern || S.tavern.day !== day || /undefined/.test(S.tavern.name)) {
      const types = Object.keys(UNITS).filter(k => k !== 'pawn' && !UNITS[k].unique && UNITS[k].tier <= Math.min(5, S.tier + 1));
      let h = 0; for (const c of day + S.seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const type = types[h % types.length];
      S.tavern = { day, type, name: FIRST_NAMES[h % FIRST_NAMES.length] + ' ' + EPITHETS[(h >>> 5) % EPITHETS.length], level: 2 + S.tier, hired: false };
    }
    return S.tavern;
  }
  tavernCost() { const t = this.tavernHero(); return { gold: (UNITS[t.type].cost.gold || 30) * 2 + 60 * this.state.tier, meat: 40 * this.state.tier }; }
  hireHero() {
    const S = this.state, t = this.tavernHero();
    if (!this.countOf('tavern')) return 'Build a Tavern first.';
    if (t.hired) return 'Today\'s hero has already joined you.';
    if (this.popUsed() + UNITS[t.type].pop > this.popCap()) return 'No room. Build more Houses.';
    if (!this.pay(this.tavernCost())) return 'Not enough to pay.';
    t.hired = true;
    const rec = this.newSoldier(t.type); rec.name = t.name; rec.level = t.level; rec.xp = XP_LEVELS[rec.level];
    const extra = COMMON_TRAITS.filter(k => !rec.traits.includes(k)); rec.traits.push(extra[Math.floor(Math.random() * extra.length)]);
    const it = this.dropGear(t.level + 2, { min: 1, quiet: true, from: 'the Tavern' });
    Gear.equip(this, rec, it.id);
    this.spawnSoldier(rec, false, { x: this.castle.x, y: this.castle.y + 40 });
    this.ui.toast(`${rec.name} joins your realm, bringing ${it.name}.`, 'gold'); this.sfx('ready');
    this.log(`${rec.name} was hired at the Tavern.`);
  }
  exchange(id) {
    if (!this.countOf('market')) return 'Build a Market first.';
    const x = EXCHANGE.find(e => e.id === id); if (!x) return;
    if (!this.pay(x.give)) return 'Not enough to trade.';
    this.addAll(x.get); this.sfx('coin');
  }
  promoteBlock(rec, to) {
    if (!rec || rec.promoted) return 'Already promoted.';
    if (rec.type === 'king' || rec.type === 'pawn') return 'The King needs no promotion.';
    if (rec.level < 10) return 'Reach level 10 first.';
    if (rec.status !== 'home') return 'They must be at home.';
    if (to && !(PROMOTIONS[rec.type] || []).some(p => p.to === to)) return 'That path is not open to them.';
    if (to && UNITS[to].pop > UNITS[rec.type].pop && this.popUsed() + UNITS[to].pop - UNITS[rec.type].pop > this.popCap()) return 'No room for a mount. Build more Houses.';
    if (!this.canAfford(PROMO_COST)) return 'Not enough to pay.';
    return null;
  }
  promote(rec, to) {
    const err = this.promoteBlock(rec, to); if (err) return err;
    this.pay(PROMO_COST);
    const S = this.state, path = to && (PROMOTIONS[rec.type] || []).find(p => p.to === to);
    rec.promoted = true; rec.title = path ? path.title : 'Elite';
    const old = this.home.units.find(u => u.rec === rec && u.alive);
    if (path) {
      rec.type = to;
      const av = UNITS[to].avatar; rec.avatar = /^h\d+$/.test(av) ? 'av_' + av : `av_${av}1`;
    }
    // a rare trait to mark the occasion
    const rare = ['champion', 'trollbane'].filter(t => !rec.traits.includes(t));
    if (rare.length && rec.traits.length < 5) rec.traits.push(rare[0]);
    rec.hp = undefined;
    let at = null;
    if (old) { at = { x: old.x, y: old.y }; old.dead = true; old.hp = 0; this.home.selected.delete(old); }
    const u = this.spawnSoldier(rec, true, at || undefined);
    if (u) { u.hp = u.maxHp; u.home = at ? { ...at } : u.home; this.home.fxAt('healFx', u.x, u.y, { scale: 1.6 }); this.home.floatText(rec.title, u.x, u.y - 100, '#f2c14e', 18); }
    S.stats.promotions = (S.stats.promotions || 0) + 1;
    this.sfx('fanfare'); this.shake(3);
    this.ui.banner('A soldier is promoted', `${rec.name} is now ${path ? 'a ' + UNITS[to].name : 'an Elite ' + UNITS[rec.type].name}. +20% health and damage, and they can now grow to level 15.`, 'gold');
    this.log(`${rec.name} was promoted to ${rec.title}.`, 'minor');
    this.save();
    return null;
  }
  gearMods(rec) { return this.state && this.state.gear ? Gear.mods(this.state, rec) : {}; }
  dropGear(level, opts = {}) { return Gear.grant(this, Gear.rollItem(this.state, level, opts), opts.quiet); }
  storage() { return this.tierDef.storage + this.state.renown * 2000; }
  popCap() { let n = castlePop(this.state.tier); for (const b of this.home.buildings) if (b.type === 'house' && b.done && !b.ruined) n += levelEffects('house', b.level).pop; return n; }
  popUsed() {
    let n = this.state.pawns;
    for (const s of this.state.soldiers) n += UNITS[s.type].pop;
    for (const b of this.home.buildings) for (const q of b.queue) n += UNITS[q.unit].pop;
    return n;
  }
  addRes(r, n, x, y) {
    const cap = this.storage();
    const before = this.state.res[r];
    this.state.res[r] = Math.max(before, Math.min(cap, before + n));
    const got = this.state.res[r] - before;
    if (got > 0) this.state.stats[r] = (this.state.stats[r] || 0) + got;
    return got;
  }
  addAll(obj, mult = 1) { for (const k in obj) if (k in this.state.res) this.addRes(k, Math.round(obj[k] * mult)); }
  canAfford(cost) { for (const k in cost) if ((this.state.res[k] || 0) < cost[k]) return false; return true; }
  pay(cost) { if (!this.canAfford(cost)) return false; for (const k in cost) this.state.res[k] -= cost[k]; return true; }
  log(text, saga) { if (saga && this.saga) this.saga.add(saga, text); this.state.log.unshift({ t: Date.now(), text }); this.state.log.length = Math.min(this.state.log.length, 60); }

  // ------------------------------------------------------------ home island
  buildHome() {
    const S = this.state;
    const ver = S.mapVer || 0;
    const migrate = S.buildings && ver !== MAP_VERSION;
    if (!Array.isArray(S.annexed)) S.annexed = [];
    if (migrate && ver < 2) { S.trees = null; S.golds = null; S.goldRespawns = []; for (const rec of S.soldiers) rec.post = null; }
    if (migrate && ver < 3) {
      // v3: the 46x34 island now sits at BASE_X,BASE_Y in a bigger sea. Same island, same layout: shift every stored coordinate.
      for (const b of S.buildings) { b.cx += BASE_X; b.cy += BASE_Y; }
      for (const g of S.golds || []) { g.cx += BASE_X; g.cy += BASE_Y; }
      for (const g of S.goldRespawns || []) { g.cx += BASE_X; g.cy += BASE_Y; }
      for (const rec of S.soldiers) if (rec.post) { rec.post.x += BASE_X * T; rec.post.y += BASE_Y * T; }
      S.trees = null; S.annexed = [];
    }
    const { map, parts } = Annex.buildHomeMap(HOME_CFG, S.seed, S.annexed);
    const h = new Scene(this, 'home', map, S.seed);
    this.home = h;
    const r = rng(S.seed + 1234);
    // castle and buildings
    if (!S.buildings) {
      S.buildings = [{ type: 'castle', cx: CASTLE.x, cy: CASTLE.y, hp: TIERS[1].castleHp }];
    }
    for (const b of S.buildings) {
      const lvl = b.level || 1;
      const maxHp = b.type === 'castle' ? Math.round(TIERS[S.tier].castleHp * (1 + this.bonus().castleHp)) : levelHp(b.type, lvl);
      const nb = h.addBuilding(b.type, b.cx, b.cy, { hp: Math.min(b.hp ?? maxHp, maxHp), maxHp, buildEnd: b.buildEnd || 0, buildTotal: b.buildTotal || 0, variant: b.variant, queue: b.queue || [] });
      nb.level = lvl; nb.upEnd = b.upEnd || 0; nb.upTotal = b.upTotal || 0;
    }
    this.castle = h.buildings.find(b => b.type === 'castle');
    // buildings from an older map layout that no longer sit on valid ground get moved later
    const stranded = [];
    for (const b of [...h.buildings]) {
      if (b.type === 'castle') continue;
      let ok = true, lvl = null;
      for (const [x, y] of b.cells()) {
        if (!map.ground(x, y) || map.stairAt(x, y) || map.block[map.i(x, y)] > 1) ok = false;
        const l = map.level(x, y); if (lvl === null) lvl = l; else if (l !== lvl) ok = false;
      }
      if (!ok) { stranded.push(b); h.removeBuilding(b); }
    }
    // resources (deterministic layout from the seed, then saved state applied)
    const free = (x, y, pad = 0) => Annex.freeCell(map, x, y, pad, true);
    const nearCastle = (x, y, d) => Math.abs(x - (CASTLE.x + 2)) < d + 2 && Math.abs(y - (CASTLE.y + 1)) < d;
    const inBase = () => [r.int(BASE_X + 4, BASE_X + BASE_W - 5), r.int(BASE_Y + 4, BASE_Y + BASE_H - 5)];
    this.annexParts = parts;
    const spots = this.homeTreeSpots(map, parts, r);
    const savedTree = new Map();
    for (const t of S.trees || []) if (t && t.cx != null) savedTree.set(t.cx + ',' + t.cy, t);
    const stones = new Set((S.golds || []).map(g => g.cx + ',' + g.cy)); // a saved stone keeps its cell
    for (const t of spots) {
      if (stones.has(t.x + ',' + t.y)) continue;
      const saved = savedTree.get(t.x + ',' + t.y);
      h.addTree(t.x, t.y, { v: 1 + ((t.x * 7 + t.y * 13) % 4), wood: saved ? saved.wood : 25, regrow: saved ? saved.regrow : 0 });
    }
    if (S.golds) { for (const g of S.golds) if (map.ground(g.cx, g.cy)) h.addGold(g.cx, g.cy, { amount: g.amount }); }
    else {
      let placedG = 0;
      const gs = [], put = (x, y) => { gs.push({ x, y }); map.block[map.i(x, y)]++; };
      for (let k = 0; k < 300 && placedG < 7; k++) {
        const [x, y] = inBase();
        if (free(x, y, 1) && !nearCastle(x, y, 5)) { put(x, y); placedG++; if (free(x + 1, y, 0) && placedG < 7) { put(x + 1, y); placedG++; } }
      }
      for (const p of parts) for (const [x, y] of Annex.annexGoldSpots(map, p)) put(x, y);
      for (const g of gs) map.block[map.i(g.x, g.y)]--;
      Annex.unsealTrees(map, h.nearestWalkable(CASTLE.x + 2, CASTLE.y + 2), gs); // stones must not wall off a nook either
      for (const g of gs) h.addGold(g.x, g.y, { amount: 120 });
    }
    Annex.unsealScene(h, h.nearestWalkable(CASTLE.x + 2, CASTLE.y + 2), !S.golds); // trees (and fresh gold) get the same final pass as a live merge
    this.goldZones = h.golds.map(g => [g.cx, g.cy]);
    // pasture for sheep (plus one per annexed chunk)
    this.pasture = null;
    for (let k = 0; k < 200 && !this.pasture; k++) {
      const x = r.int(BASE_X + 5, BASE_X + BASE_W - 6), y = r.int(BASE_Y + 5, BASE_Y + BASE_H - 6);
      if (map.kindAt(x, y) === K_LOW && free(x, y, 1) && !nearCastle(x, y, 4) && dist(x, y, CASTLE.x, CASTLE.y) < 14) this.pasture = [x, y];
    }
    if (!this.pasture) this.pasture = [CASTLE.x + 2, CASTLE.y + 5];
    this.pastures = [this.pasture];
    for (const p of parts) { const pp = Annex.annexPasture(map, p); if (pp) this.pastures.push(pp); }
    for (let i = 0; i < S.sheep; i++) this.spawnSheep();
    // reachability from the castle door (for raids and placement)
    this.door = h.nearestWalkable(CASTLE.x + 2, CASTLE.y + 2);
    this.reach = reachable(map, this.door[0], this.door[1]);
    // re-home stranded buildings at the nearest valid spot (refund if there is none)
    for (const b of stranded) {
      let spot = null;
      for (let rr = 0; rr < 18 && !spot; rr++) for (let dy = -rr; dy <= rr && !spot; dy++) for (let dx = -rr; dx <= rr && !spot; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        if (this.canPlace(b.type, b.cx + dx, b.cy + dy)) spot = [b.cx + dx, b.cy + dy];
      }
      if (spot) {
        const nb = h.addBuilding(b.type, spot[0], spot[1], { hp: b.hp, maxHp: b.maxHp, buildEnd: b.buildEnd, buildTotal: b.buildTotal, variant: b.variant, queue: b.queue });
        nb.level = b.level; nb.upEnd = b.upEnd; nb.upTotal = b.upTotal;
      } else this.addAll(BUILDINGS[b.type].cost);
      this.reach = reachable(map, this.door[0], this.door[1]);
    }
    if (migrate && ver < 2) this.migrated = true; // (v3 only shifted coordinates: nothing moved for the player)
    S.mapVer = MAP_VERSION;
    this.shore = boatSpots(map, this.reach);
    // people
    for (let i = 0; i < S.pawns; i++) this.spawnPawn(true);
    for (const rec of S.soldiers) if (rec.status === 'home') this.spawnSoldier(rec, true);
  }
  spawnSheep(x, y) {
    const [px, py] = (this.pastures && this.pastures[Math.floor(Math.random() * this.pastures.length)]) || this.pasture; // annexed land adds pastures
    for (let k = 0; k < 20; k++) {
      const cx = (x != null ? cellOf(x) : px) + Math.floor(Math.random() * 5) - 2, cy = (y != null ? cellOf(y) : py) + Math.floor(Math.random() * 4) - 2;
      if (this.home.map.walkable(cx, cy) && this.home.map.kindAt(cx, cy) === K_LOW) {
        const s = this.home.addSheep(center(cx), center(cy) + 10); s.hx = center(px); s.hy = center(py); return s;
      }
    }
  }
  spawnPawn(initial) {
    const h = this.home;
    const c = h.nearestWalkable(this.door[0] + Math.floor(Math.random() * 3) - 1, this.door[1] + (initial ? Math.floor(Math.random() * 3) : 0));
    const u = h.addUnit('pawn', 0, center(c[0]), center(c[1]) + 8);
    if (this.raid) { u.hidden = true; }
    this.assignJobs();
    return u;
  }
  postFor(rec) {
    const sq = this.squads && this.home && this.squads.of(rec) ? this.squads.postFor(rec) : null;
    if (sq) return sq;
    if (rec.post) return rec.post;
    const idx = this.state.soldiers.indexOf(rec);
    const row = Math.floor(idx / 6), col = idx % 6;
    const m = this.home.map, lvl = m.level(this.door[0], this.door[1]);
    const c = this.home.nearestWalkable(CASTLE.x - 1 + col, CASTLE.y + 3 + row, 10, (x, y) => this.reach[m.i(x, y)] && m.level(x, y) === lvl) || this.door;
    return { x: center(c[0]), y: center(c[1]) + 8 };
  }
  spawnSoldier(rec, initial, at) {
    const h = this.home;
    let p = at || this.postFor(rec);
    const cx = cellOf(p.x), cy = cellOf(p.y);
    if (!h.map.walkable(cx, cy)) { const c = h.nearestWalkable(cx, cy); p = { x: center(c[0]), y: center(c[1]) + 8 }; }
    const u = h.addUnit(rec.type, 0, p.x, p.y, { rec, hp: rec.hp });
    u.home = at ? this.postFor(rec) : { ...p };
    if (at) u.setPath(u.home.x, u.home.y);
    return u;
  }
  newSoldier(type) {
    const S = this.state, r = Math.random;
    const name = type === 'king' ? 'King ' + FIRST_NAMES[Math.floor(r() * FIRST_NAMES.length)] :
      FIRST_NAMES[Math.floor(r() * FIRST_NAMES.length)] + ' ' + EPITHETS[Math.floor(r() * EPITHETS.length)];
    const avKind = UNITS[type].avatar;
    const avatar = /^h\d+$/.test(avKind) ? 'av_' + avKind : `av_${avKind}1`;
    const traits = [COMMON_TRAITS[Math.floor(r() * COMMON_TRAITS.length)]];
    const rec = { id: S.nextId++, name, type, level: 1, xp: 0, traits, kills: 0, avatar, status: 'home', joined: Date.now() };
    S.soldiers.push(rec);
    return rec;
  }

  // ------------------------------------------------------------ jobs and pawn AI
  assignJobs() {
    const pawns = this.home.units.filter(u => u.kind === 'pawn').sort((a, b) => a.id - b.id);
    const J = this.state.jobs; let i = 0;
    const order = ['wood', 'gold', 'meat', 'build'];
    for (const j of order) for (let k = 0; k < J[j] && i < pawns.length; k++) this.setJob(pawns[i++], j);
    while (i < pawns.length) this.setJob(pawns[i++], 'idle');
  }
  setJob(u, job) {
    if (u.job === job) return;
    this.releaseNode(u);
    u.job = job; u.task = null; u.working = false; u.stop();
    u.tool = { wood: 'Axe', gold: 'Pickaxe', meat: 'Knife', build: 'Hammer' }[job] || null;
  }
  setJobCount(job, n) {
    const J = this.state.jobs;
    const others = Object.keys(J).filter(k => k !== job).reduce((a, k) => a + J[k], 0);
    J[job] = Math.max(0, Math.min(n, this.state.pawns - others));
    this.assignJobs();
  }
  releaseNode(u) {
    const n = u.node; if (!n) return;
    if (Array.isArray(n.res)) n.res = n.res.filter(id => id !== u.id); else if (n.res === u.id) n.res = null;
    u.node = null;
  }
  dropoffs() { return this.home.buildings.filter(b => b.done && !b.ruined && (b.type === 'castle' || b.type === 'house')); }

  pawnAI(scene, u, dt) {
    const m = scene.map;
    // hide during raids
    if (this.raid && this.raid.active) {
      if (u.hidden) return;
      this.releaseNode(u); u.working = false;
      if (u.task !== 'hide') { u.task = 'hide'; u.setPath(this.castle.x, this.castle.y, scene.adjacentGoal(this.castle.cells())); }
      if (u.stepPath(dt)) { u.hidden = true; u.task = null; u.carry = null; }
      return;
    }
    if (u.hidden && u.sleeping && this.env.isNight && (u.job === 'idle' || !u.job)) return;
    if (u.hidden) { u.hidden = false; u.sleeping = false; const c = scene.nearestWalkable(this.door[0], this.door[1]); u.x = center(c[0]) + (Math.random() - 0.5) * 30; u.y = center(c[1]) + 8; u.stop(); }
    if (u.stung > 0) { u.stung -= dt; }
    const gb = this.bonus();
    // carrying: walk to the nearest drop-off
    if (u.carry) {
      if (u.task !== 'drop') {
        u.task = 'drop'; u.working = false;
        let best = null, bd = 1e9;
        for (const b of this.dropoffs()) { const d = dist(u.x, u.y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
        if (!best || !u.setPath(best.x, best.y, scene.adjacentGoal(best.cells()))) { u.carry = null; u.task = null; return; }
      }
      if (u.stepPath(dt)) {
        const r = u.carry.toLowerCase();
        const got = this.addRes(r, u.carryN);
        if (got > 0) { scene.floatText('+' + got, u.x, u.y - 70, r === 'gold' ? '#ffe066' : r === 'wood' ? '#e6b98a' : '#f4a0a0'); if (r === 'gold') this.sfx('coin', u, scene); }
        else scene.floatText('Full', u.x, u.y - 70, '#ffffff');
        u.carry = null; u.task = null;
      }
      return;
    }
    const job = u.job;
    if (job === 'wood' && u.stung > 0) return this.idleWander(scene, u, dt);
    if (job === 'wood' || job === 'gold') {
      const list = job === 'wood' ? scene.trees : scene.golds;
      const cap = job === 'wood' ? 1 : 2;
      const avail = n => (job === 'wood' ? n.wood > 0 && !n.res : n.amount > 0 && n.res.length < cap);
      if (!u.node || (job === 'wood' ? u.node.wood <= 0 : u.node.amount <= 0)) {
        this.releaseNode(u);
        let best = null, bd = 1e9;
        for (const n of list) if (avail(n)) { const d = dist(u.x, u.y, center(n.cx), center(n.cy)) + (n.tried === u.id ? 400 : 0); if (d < bd) { bd = d; best = n; } }
        if (!best) return this.idleWander(scene, u, dt);
        if (!u.setPath(center(best.cx), center(best.cy), scene.adjacentGoal([[best.cx, best.cy]]))) { best.tried = u.id; return; }
        u.node = best; if (job === 'wood') best.res = u.id; else best.res.push(u.id);
        u.task = 'go'; u.working = false;
      }
      if (!u.task) {
        // stand beside the node, not above or diagonal to it, so the swing lines up
        const ncx = u.node.cx, ncy = u.node.cy;
        const side = (x, y) => y === ncy && Math.abs(x - ncx) === 1;
        if (!u.setPath(center(ncx), center(ncy), side) && !u.setPath(center(ncx), center(ncy), scene.adjacentGoal([[ncx, ncy]]))) { u.node.tried = u.id; this.releaseNode(u); return; }
        u.task = 'go';
      }
      if (u.task === 'go') { if (u.stepPath(dt)) { u.task = 'work'; u.workT = (job === 'wood' ? 3.2 : 3.6) * this.nightPace(u); } return; }
      if (u.task === 'work') {
        u.working = true; u.flip = center(u.node.cx) < u.x;
        { // ease in to striking distance: beside the trunk or rock, level with its base
          const nx = center(u.node.cx), ny = center(u.node.cy);
          const dx = u.x < nx ? -1 : 1;
          const tx = nx + dx * (job === 'wood' ? 36 : 40), ty = ny + (job === 'wood' ? 24 : 6);
          const k = Math.min(1, dt * 6); u.x += (tx - u.x) * k; u.y += (ty - u.y) * k;
        }
        if (job === 'wood' && Math.random() < dt * 2) u.node.shake = 0.2;
        u.sndT = (u.sndT || 0) - dt;
        if (u.sndT <= 0) { u.sndT = 0.6; this.sfx(job === 'wood' ? 'chop' : 'mine', u, scene); }
        u.workT -= dt;
        if (u.workT <= 0) {
          u.working = false;
          const take = job === 'wood' ? Math.min(5, u.node.wood) : Math.min(5, u.node.amount);
          const hol = this.holiday();
          let n = take * (1 + gb.gather + (job === 'gold' ? gb.gold : gb.wood) + this.env.gather(job) + ((hol && hol.gather) || 0));
          if (job === 'gold' && scene.goldRush > 0) n *= 2;
          if (job === 'wood') { u.node.wood -= take; if (u.node.wood <= 0) { u.node.regrow = Date.now() + 180000; this.releaseNode(u); } }
          else {
            u.node.amount -= take;
            if (u.node.amount <= 0) { const g = u.node; this.releaseNode(u); this.depleteGold(g); }
          }
          u.carry = job === 'wood' ? 'Wood' : 'Gold'; u.carryN = Math.round(n); u.task = null;
        }
      }
      return;
    }
    if (job === 'meat') {
      if (!u.node || u.node.caught) {
        this.releaseNode(u);
        let best = null, bd = 1e9;
        for (const s of scene.sheep) if (!s.caught && !s.res) { const d = dist(u.x, u.y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
        if (!best) return this.idleWander(scene, u, dt);
        best.res = u.id; u.node = best; u.task = 'go'; u.pathT = 0;
      }
      const s = u.node;
      if (u.task === 'go') {
        if (dist(u.x, u.y, s.x, s.y) < 36) { u.task = 'work'; u.workT = 1.6; s.grazing = 3; return; }
        u.pathT -= dt;
        if (u.pathT <= 0 || !u.path || !u.path.length) { u.pathT = 1; if (!u.setPath(s.x, s.y)) { this.releaseNode(u); return; } }
        u.stepPath(dt);
        return;
      }
      if (u.task === 'work') {
        u.working = true; u.flip = s.x < u.x; u.workT -= dt;
        if (u.workT <= 0) {
          u.working = false; s.caught = true; scene.fxAt('dust1', s.x, s.y); this.sfx('baa', s, scene);
          scene.sheep = scene.sheep.filter(o => o !== s);
          this.releaseNode(u);
          const holm = this.holiday();
          u.carry = 'Meat'; u.carryN = Math.round(8 * (1 + gb.gather + (gb.meat || 0) + this.env.gather('meat') + ((holm && (holm.meat || holm.gather)) || 0))); u.task = null;
        }
      }
      return;
    }
    if (job === 'build') {
      const needs = b => (!b.done) || !!b.upEnd || (b.hp < b.maxHp && !(this.raid && this.raid.active));
      if (!u.node || !needs(u.node) || !scene.buildings.includes(u.node)) {
        u.node = null;
        let best = null, bd = 1e9;
        for (const b of scene.buildings) if (needs(b)) { const d = dist(u.x, u.y, b.x, b.y) - (b.done ? 0 : 400); if (d < bd) { bd = d; best = b; } }
        if (!best) return this.idleWander(scene, u, dt);
        if (!u.setPath(best.x, best.y, scene.adjacentGoal(best.cells()))) return this.idleWander(scene, u, dt);
        u.node = best; u.task = 'go';
      }
      if (u.task === 'go') { if (u.stepPath(dt)) u.task = 'work'; return; }
      const b = u.node; u.working = true; u.flip = b.x < u.x;
      u.sndT = (u.sndT || 0) - dt; if (u.sndT <= 0) { u.sndT = 0.55; this.sfx('hammer', u, scene); }
      if (!b.done) { b.buildEnd -= dt * 1000; if (Math.random() < dt) scene.fxAt('dust1', b.x + (Math.random() - 0.5) * 60, b.y - 4); }
      else if (b.upEnd && b.hp >= b.maxHp) { b.upEnd -= dt * 1000; if (Math.random() < dt) scene.fxAt('dust1', b.x + (Math.random() - 0.5) * 60, b.y - 4); }
      else {
        const add = Math.min(b.maxHp - b.hp, 30 * dt);
        u.repairDebt = (u.repairDebt || 0) + add / 25;
        if (u.repairDebt >= 1) { if (this.state.res.wood >= 1) { this.state.res.wood -= 1; u.repairDebt -= 1; } else { u.working = false; return; } }
        b.hp += add;
      }
      return;
    }
    this.idleWander(scene, u, dt);
  }
  // after dark, pawns far from a lit lantern work at a sleepy pace
  nightPace(u) {
    if (!this.env.isNight) return 1;
    for (const b of this.home.buildings) if (b.def.lantern && b.done && !b.ruined && Math.hypot(b.x - u.x, b.y - u.y) < 5 * T) return 1;
    return 1.6;
  }
  idleWander(scene, u, dt) {
    u.working = false;
    // idle pawns go to bed at night
    if (this.env.isNight && scene === this.home) {
      if (u.task !== 'sleep') { u.task = 'sleep'; const homes = this.dropoffs(); let best = this.castle, bd = 1e9; for (const b of homes) { const d = dist(u.x, u.y, b.x, b.y); if (d < bd) { bd = d; best = b; } } u.bed = best; u.setPath(best.x, best.y, scene.adjacentGoal(best.cells())); }
      if (u.stepPath(dt)) { u.hidden = true; u.sleeping = true; }
      return;
    }
    if (u.task === 'sleep') u.task = null;
    if (u.path && u.path.length) { u.stepPath(dt); return; }
    u.moving = false;
    u.wanderT = (u.wanderT || Math.random() * 4) - dt;
    if (u.wanderT <= 0) {
      u.wanderT = 3 + Math.random() * 5;
      const c = scene.nearestWalkable(this.door[0] + Math.floor(Math.random() * 7) - 3, this.door[1] + Math.floor(Math.random() * 3));
      if (c) u.setPath(center(c[0]), center(c[1]));
    }
  }
  depleteGold(g) {
    const h = this.home;
    h.golds = h.golds.filter(o => o !== g); h.placeBlock([[g.cx, g.cy]], -1);
    this.state.goldRespawns.push({ at: Date.now() + 240000, cx: g.cx, cy: g.cy });
  }

  // ------------------------------------------------------------ building, training, upgrades
  limitFor(type) {
    if (BUILDINGS[type] && BUILDINGS[type].decor) return 8 + this.state.tier * 8;
    if (type === 'lantern') return 4 + this.state.tier * 4;
    if (type === 'wall') return 30 + this.state.tier * 30;
    if (type === 'gate') return 1 + this.state.tier;
    return this.tierDef.limits[type] ?? 99;
  }
  // ---- walls and gates (3.0)
  canPlaceWall(x, y, type = 'wall') { // also used for lantern posts and decorations
    const m = this.home.map, h = this.home;
    if (BUILDINGS[type] && BUILDINGS[type].decor) return this.canPlaceDecor(x, y);
    if (type === 'gate') { const w = h.wallAt(x, y); if (w && w.type === 'wall') return true; }
    if (type === 'lantern' && h.buildings.some(b => b.def.lantern && Math.abs(b.cx - x) + Math.abs(b.cy - y) < 3)) return false;
    if (!m.ground(x, y) || m.stairAt(x, y) || m.block[m.i(x, y)]) return false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy)) return false; // coasts stay free for new land
    if (h.units.some(u => u.alive && !u.hidden && cellOf(u.x) === x && cellOf(u.y) === y && u.kind !== 'pawn' && u.team === 1)) return false;
    return true;
  }
  wallLine(a, b) {
    const cells = [];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dx) >= Math.abs(dy)) { const s = Math.sign(dx) || 1; for (let x = a[0]; x !== b[0] + s; x += s) cells.push([x, a[1]]); }
    else { const s = Math.sign(dy) || 1; for (let y = a[1]; y !== b[1] + s; y += s) cells.push([a[0], y]); }
    return cells.slice(0, 40);
  }
  placeWalls(type, cells) {
    const d = BUILDINGS[type];
    let n = 0, blocked = 0;
    for (const [x, y] of cells) {
      if (this.countOf(type) >= this.limitFor(type)) { this.ui.toast('Your realm must grow before you can build more of these.', 'red'); break; }
      if (!this.canPlaceWall(x, y, type)) { blocked++; continue; }
      if (!this.canAfford(d.cost)) { this.ui.toast('Ran out of wood.', 'red'); break; }
      this.pay(d.cost);
      const old = this.home.wallAt(x, y);
      if (old) this.home.removeBuilding(old);
      const b = this.home.addBuilding(type, x, y, { buildEnd: Date.now() + d.time * 1000, buildTotal: d.time });
      b.pop = 1; n++;
    }
    this.home.wallMap = null;
    // never fence anyone in: if the new line seals people or buildings off, turn one of its pieces into a gate
    let gateNote = '';
    if (n && type === 'wall' && this.sealedOff()) {
      const fresh = cells.map(([x, y]) => this.home.wallAt(x, y)).filter(b => b && b.type === 'wall' && !b.done);
      let fixed = false;
      if (this.countOf('gate') < this.limitFor('gate')) {
        for (const w of fresh.slice(1, -1).concat(fresh)) {
          this.home.removeBuilding(w);
          const g = this.home.addBuilding('gate', w.cx, w.cy, { buildEnd: w.buildEnd, buildTotal: w.buildTotal });
          this.home.wallMap = null;
          if (!this.sealedOff()) { fixed = true; break; }
          this.home.removeBuilding(g); this.home.addBuilding('wall', w.cx, w.cy, { buildEnd: w.buildEnd, buildTotal: w.buildTotal }); this.home.wallMap = null;
        }
      }
      if (fixed) gateNote = 'A gate was added so your people are not fenced in.';
      else { // undo the whole line and refund it
        for (const w of cells.map(([x, y]) => this.home.wallAt(x, y)).filter(b => b && !b.done)) { this.home.removeBuilding(w); this.addAll(d.cost); }
        this.home.wallMap = null;
        this.reach = reachable(this.home.map, this.door[0], this.door[1]);
        return 'That fence would trap your people. Leave a gap, or grow the realm for another gate.';
      }
    }
    this.reach = reachable(this.home.map, this.door[0], this.door[1]);
    this.rescueTrapped();
    if (gateNote) this.ui.toast(gateNote, 'gold');
    if (n) { this.sfx('place'); this.home.fxAt('dust2', center(cells[0][0]), center(cells[0][1]) + 20); }
    this.save();
    return n ? null : (blocked ? 'That spot is blocked.' : 'Nothing was built.');
  }
  // reachability from the castle door for your own people: gates count as open
  friendlyReach() {
    const h = this.home, m = h.map, shut = h.buildings.filter(b => b.def.gate && !b.open);
    for (const g of shut) h.placeBlock([[g.cx, g.cy]], -1);
    const re = reachable(m, this.door[0], this.door[1]);
    for (const g of shut) h.placeBlock([[g.cx, g.cy]], 1);
    return re;
  }
  // would the current walls cut a building or one of your people off from the castle?
  sealedOff() {
    const h = this.home, m = h.map, re = this.friendlyReach();
    for (const b of h.buildings) {
      if (b.def.wall || b.type === 'castle') continue;
      let ok = false;
      for (let x = b.cx - 1; x <= b.cx + b.fw && !ok; x++) for (let y = b.cy - 1; y <= b.cy + b.fh && !ok; y++) if (m.in(x, y) && re[m.i(x, y)]) ok = true;
      if (!ok) return true;
    }
    for (const u of h.units) {
      if (u.team !== 0 || !u.alive || u.hidden) continue;
      const cx = cellOf(u.x), cy = cellOf(u.y);
      if (m.in(cx, cy) && !re[m.i(cx, cy)] && !m.block[m.i(cx, cy)]) return true;
    }
    return false;
  }
  // anyone already stuck behind a fence (or standing on one) hops back to open ground
  rescueTrapped() {
    const h = this.home, m = h.map; if (!h.buildings.some(b => b.def.wall)) return 0;
    const re = this.friendlyReach(); let n = 0;
    for (const u of h.units) {
      if (u.team !== 0 || !u.alive || u.hidden || u.flying) continue;
      const cx = cellOf(u.x), cy = cellOf(u.y);
      if (m.in(cx, cy) && re[m.i(cx, cy)]) continue;
      const c = h.nearestWalkable(cx, cy, 14, (x, y) => re[m.i(x, y)]);
      if (!c) continue;
      h.fxAt('dust1', u.x, u.y);
      u.x = center(c[0]); u.y = center(c[1]) + 8; u.stop && u.stop(); u.path = null; u.task = null;
      if (u.rec) u.home = { x: u.x, y: u.y };
      if (u.kind === 'pawn') this.releaseNode(u);
      n++;
    }
    return n;
  }
  breachTarget(scene, u) {
    let best = null, bd = 1e9;
    for (const w of scene.walls().values()) { if (!w.alive) continue; const d = u.distTo(w) + (w.def.gate ? -30 : 0); if (d < bd) { bd = d; best = w; } }
    return best;
  }
  countOf(type) { return this.home.buildings.filter(b => b.type === type).length; }
  canPlace(type, cx, cy, quick = false) {
    const d = BUILDINGS[type], m = this.home.map;
    if (this.slam) return false; // land is being annexed
    let lvl = null;
    for (let y = cy; y < cy + d.fh; y++) for (let x = cx; x < cx + d.fw; x++) {
      if (!m.ground(x, y) || m.stairAt(x, y) || m.block[m.i(x, y)]) return false;
      // keep the coast free for annexed land: no footprint cell may touch water (8-neighbourhood)
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy)) return false;
      if (m.isCliff(x, y + 1) && y === cy + d.fh - 1) return false;
      const l = m.level(x, y); if (lvl === null) lvl = l; else if (l !== lvl) return false;
    }
    // building art is taller than its footprint: keep the drawn areas from overlapping
    const vis = (t, x, y) => {
      const dd = BUILDINGS[t]; const s = SHEETS[dd.img || dd.imgs[0]];
      const extra = Math.max(0, Math.ceil((((s && s.fh) || 192) - 20) / T) - dd.fh); // rows of art above the footprint
      return { x0: x, x1: x + dd.fw - 1, y0: y - extra, y1: y + dd.fh - 1 };
    };
    const me = vis(type, cx, cy);
    for (const b of this.home.buildings) {
      const o = vis(b.type, b.cx, b.cy);
      if (me.x0 <= o.x1 && me.x1 >= o.x0 && me.y0 <= o.y1 && me.y1 >= o.y0) return false;
    }
    // keep a clear yard in front of the hall/castle door so buildings never crowd the walkway
    if (type !== 'castle' && this.door) { const [dx0, dy0] = this.door; for (let y = cy; y < cy + d.fh; y++) for (let x = cx; x < cx + d.fw; x++) if (Math.abs(x - dx0) <= 2 && y >= dy0 - 1 && y <= dy0 + 2) return false; }
    // an open row in front so the door stays reachable
    let open = false;
    for (let x = cx; x < cx + d.fw; x++) if (m.walkable(x, cy + d.fh) && m.level(x, cy + d.fh) === lvl) open = true;
    if (!open) return false;
    if (quick) return true;
    // never wall off the castle: check reachability after placement
    for (let y = cy; y < cy + d.fh; y++) for (let x = cx; x < cx + d.fw; x++) m.block[m.i(x, y)]++;
    const re = reachable(m, this.door[0], this.door[1]);
    let ok = true;
    for (const b of this.home.buildings) {
      if (b.type === 'castle') continue;
      let any = false;
      for (let x = b.cx - 1; x <= b.cx + b.fw && !any; x++) for (let y = b.cy - 1; y <= b.cy + b.fh && !any; y++) if (m.in(x, y) && re[m.i(x, y)]) any = true;
      if (!any) ok = false;
    }
    let reachMe = false;
    for (let x = cx - 1; x <= cx + d.fw; x++) for (let y = cy - 1; y <= cy + d.fh; y++) if (m.in(x, y) && re[m.i(x, y)]) reachMe = true;
    for (let y = cy; y < cy + d.fh; y++) for (let x = cx; x < cx + d.fw; x++) m.block[m.i(x, y)]--;
    return ok && reachMe;
  }
  placeBuilding(type, cx, cy) {
    const d = BUILDINGS[type];
    if (this.countOf(type) >= this.limitFor(type)) return 'Your realm must grow before you can build more of these.';
    if (!this.canPlace(type, cx, cy)) return 'That spot is blocked.';
    if (!this.pay(d.cost)) return 'Not enough resources.';
    const bt = Math.round(d.time * (1 + this.decrees.fx('build')));
    const b = this.home.addBuilding(type, cx, cy, { buildEnd: Date.now() + bt * 1000, buildTotal: bt, variant: Math.floor(Math.random() * 3) });
    b.hp = b.maxHp; b.pop = 1;
    this.home.fxAt('dust2', b.x, b.y, { scale: 1.6 });
    this.sfx('place'); this.shake(3);
    this.reach = reachable(this.home.map, this.door[0], this.door[1]);
    if (this.state.jobs.build === 0 && this.state.pawns > 1 && !this.buildTipShown) { this.buildTipShown = true; this.ui.toast('Tip: assign a pawn to Build in Workers to raise it faster.'); }
    this.save();
    return null;
  }
  // ---- 4.0 the hamlet start: a founder hero and a companion, and one house beside the hall
  foundHamlet() {
    const S = this.state;
    if (S.soldiers.some(s => s.hero)) return;
    const f = this.newSoldier('warrior'), c = this.newSoldier('archer');
    for (const [r, t] of [[f, 'Founder'], [c, 'Companion']]) { r.hero = true; r.title = t; r.level = 3; r.xp = XP_LEVELS[3]; }
    f.traits = ['brave']; c.traits = ['keen'];
    this.log(`${f.name} and ${c.name} raised a hall on an empty shore. The realm begins.`, 'found');
  }
  hamletHouse() {
    if (this.home.buildings.some(b => b.type === 'house')) return;
    const c = this.castle;
    for (let r = 2; r < 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = c.cx + c.fw + dx, y = c.cy + dy;
      if (this.canPlace('house', x, y)) { this.home.addBuilding('house', x, y, { variant: 0 }); this.reach = reachable(this.home.map, this.door[0], this.door[1]); return; }
    }
  }
  // ---- 4.0 the coronation: the founder (or the best soldier) is crowned when the realm becomes a Kingdom
  crown(quiet) {
    const S = this.state; if (S.soldiers.some(s => s.type === 'king')) return;
    const here = S.soldiers.filter(s => s.status !== 'garrison');
    let rec = here.find(s => s.hero && s.title === 'Founder') || [...here].sort((a, b) => b.level - a.level)[0];
    const old = rec && this.home.units.find(u => u.rec === rec && u.alive);
    if (!rec) rec = this.newSoldier('king');
    rec.type = 'king'; rec.avatar = 'av_king1'; rec.title = 'King'; rec.hero = true;
    if (!/^King /.test(rec.name)) rec.name = 'King ' + rec.name.split(' ')[0];
    rec.hp = undefined;
    let at = null; if (old) { at = { x: old.x, y: old.y }; old.dead = true; old.hp = 0; this.home.selected.delete(old); }
    if (rec.status === 'home') { const u = this.spawnSoldier(rec, true, at || undefined); if (u) { this.home.fxAt('healFx', u.x, u.y, { scale: 2 }); this.home.floatText('Long live the King', u.x, u.y - 110, '#f2c14e', 18); } }
    this.log(`${rec.name} was crowned. The realm is a Kingdom.`, 'crown');
    if (!quiet) { this.ui.banner('Long live the King', `${rec.name} is crowned in the great hall. Allies near the King fight harder, and the throne will pass to an heir one day.`, 'gold'); this.sfx('fanfare'); this.shake(5); }
  }
  // ---- 3.6 decorations: they never block paths, so they live in their own list
  decorList() { const S = this.state; return S.decor || (S.decor = []); }
  decorAt(x, y) { return this.decorList().find(d => d.cx === x && d.cy === y); }
  canPlaceDecor(x, y) {
    const m = this.home.map;
    if (!m.ground(x, y) || m.stairAt(x, y) || m.block[m.i(x, y)] || this.decorAt(x, y)) return false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (!m.isLand(x + ox, y + oy)) return false;
    if (m.isCliff(x, y + 1)) return false;
    return true;
  }
  placeDecor(type, x, y) {
    const d = BUILDINGS[type];
    if (this.decorList().filter(o => o.type === type).length >= this.limitFor(type)) return 'Your realm must grow before you can place more.';
    if (!this.canPlaceDecor(x, y)) return 'That spot is taken.';
    if (!this.pay(d.cost)) return 'Not enough to pay.';
    const k = d.decor[Math.floor(Math.random() * d.decor.length)];
    this.decorList().push({ type, k, cx: x, cy: y });
    this.home.fxAt('dust1', x * T + 32, y * T + 44); this.sfx('place');
    this.state.stats.decor = (this.state.stats.decor || 0) + 1;
    this.save(); return null;
  }
  clearDecor(o) { const S = this.state; S.decor = this.decorList().filter(d => d !== o); this.addAll(BUILDINGS[o.type].cost, 0.5); this.home.fxAt('dust1', o.cx * T + 32, o.cy * T + 44); this.sfx('close'); this.save(); }
  // ---- 3.6 neighbourhood bonuses: what's near what
  near(b, type, r) { return this.home.buildings.some(o => o !== b && o.type === type && o.done && !o.ruined && Math.hypot(o.cx + o.fw / 2 - (b.cx + b.fw / 2), o.cy + o.fh / 2 - (b.cy + b.fh / 2)) <= r); }
  nearWall(b) { const h = this.home; for (let y = b.cy - 2; y <= b.cy + b.fh + 1; y++) for (let x = b.cx - 2; x <= b.cx + b.fw + 1; x++) { const w = h.wallAt(x, y); if (w && w.done) return true; } return false; }
  neighbourBonus(b) { // [label, text] pairs for a building where it stands
    const out = [];
    if (b.type === 'house' && (this.near(b, 'chapel', 6) || this.near(b, 'tavern', 6))) out.push(['Cosy street', '+2 happiness for a house near a Chapel or Tavern']);
    if (b.type === 'tower' && this.nearWall(b)) out.push(['Wall tower', '+20% damage for a tower beside a wall']);
    if (b.type === 'market' && this.trade.dock() && Math.hypot(this.trade.dock().lx - (b.cx + 1), this.trade.dock().ly - b.cy) <= 7) out.push(['Harbour market', 'trade boats sail 20% faster']);
    if ((b.type === 'barracks' || b.type === 'archery') && this.castle && Math.hypot(this.castle.cx + 2.5 - (b.cx + b.fw / 2), this.castle.cy + 1 - (b.cy + b.fh / 2)) <= 9) out.push(['Near the castle', 'training 10% faster']);
    return out;
  }
  hasBonus(b, label) { return this.neighbourBonus(b).some(x => x[0] === label); }
  // ---- 3.6 moving buildings: lift one off the map, then drop it somewhere else
  liftBuilding(b) {
    const h = this.home; if (!h.buildings.includes(b)) return;
    h.buildings = h.buildings.filter(o => o !== b); h.placeBlock(b.cells(), -1);
    for (const u of h.units) if (u.kind === 'pawn' && u.node === b) { u.node = null; u.task = null; }
    this.reach = reachable(h.map, this.door[0], this.door[1]);
  }
  dropBuilding(b, cx, cy, quiet) {
    const h = this.home; b.cx = cx; b.cy = cy;
    if (!h.buildings.includes(b)) { h.buildings.push(b); h.placeBlock(b.cells(), 1); }
    this.reach = reachable(h.map, this.door[0], this.door[1]);
    this.rescueTrapped();
    if (!quiet) { b.pop = 0.45; h.fxAt('dust2', b.x, b.y, { scale: 1.6 }); this.sfx('place'); this.shake(2); }
    this.save();
  }
  moveBuilding(b, cx, cy) {
    if (!this.canPlace(b.type, cx, cy)) return 'That spot is blocked.';
    this.dropBuilding(b, cx, cy);
    this.state.stats.moves = (this.state.stats.moves || 0) + 1;
    return null;
  }
  demolish(b) {
    if (b.type === 'castle') return;
    this.home.removeBuilding(b);
    const d = BUILDINGS[b.type];
    if (!b.done) this.addAll(d.cost, 0.75); else this.addAll(d.cost, 0.25);
    this.home.fxAt('dust2', b.x, b.y, { scale: 2 });
    this.reach = reachable(this.home.map, this.door[0], this.door[1]);
    this.assignJobs(); this.save();
  }
  trainOptions(b) {
    if (!b.done || b.ruined) return [];
    return Object.entries(UNITS).filter(([k, u]) => u.from === b.type).map(([k, u]) => ({ key: k, def: u, locked: u.tier > this.state.tier, block: this.trainBlock(b, k) }));
  }
  queueCap(b) { return b.type === 'castle' ? 5 : levelEffects(b.type, b.level).queue || 5; }
  trainTime(b, unit) { const e = levelEffects(b.type, b.level); return Math.round(UNITS[unit].time * (e.speed || 1) * (this.needs && this.home ? this.needs.trainMult() : 1) * (1 + this.decrees.fx('train')) * (this.home && this.hasBonus(b, 'Near the castle') ? 0.9 : 1)); }
  // Why can't this unit be trained right now? null if it can.
  trainBlock(b, unit) {
    const d = UNITS[unit];
    if (d.tier > this.state.tier) return { code: 'locked', msg: `Requires a ${TIERS[d.tier].name}.` };
    if (!b.done) return { code: 'building', msg: 'Still under construction.' };
    if (b.ruined) return { code: 'ruined', msg: 'This building is in ruins. Repair it first.' };
    if (b.queue.length >= this.queueCap(b)) return { code: 'queue', msg: 'The training queue is full.' };
    if (d.unique && (this.state.soldiers.some(s => s.type === unit) || this.home.buildings.some(x => x.queue.some(q => q.unit === unit)))) return { code: 'unique', msg: 'There can be only one.' };
    if (d.pop && this.popUsed() + d.pop > this.popCap()) return { code: 'housing', msg: `No room: ${this.popUsed()} of ${this.popCap()} people. Build or upgrade Houses.` };
    if (!this.canAfford(d.cost)) return { code: 'cost', msg: 'Not enough resources.' };
    return null;
  }
  train(b, unit) {
    const block = this.trainBlock(b, unit);
    if (block) { if (block.code === 'housing') this.ui.flashPop(); return block.msg; }
    const d = UNITS[unit];
    this.pay(d.cost);
    const t = this.trainTime(b, unit);
    const start = Math.max(Date.now(), b.queue.length ? b.queue[b.queue.length - 1].end : 0);
    b.queue.push({ unit, end: start + t * 1000, total: t });
    this.save();
    return null;
  }
  cancelTrain(b, i) {
    const q = b.queue[i]; if (!q) return;
    b.queue.splice(i, 1);
    this.addAll(UNITS[q.unit].cost);
    // later entries move up
    let t = Date.now();
    for (let k = 0; k < b.queue.length; k++) {
      const e = b.queue[k];
      if (k < i) { t = e.end; continue; }
      const started = k === 0 ? Math.min(e.end - e.total * 1000, Date.now()) : t;
      e.end = Math.max(started, t) + e.total * 1000; t = e.end;
    }
    this.save();
  }
  // ---- building upgrades
  upgradeBlock(b) {
    if (b.type === 'castle') return { msg: '' };
    const max = maxBuildingLevel(this.state.tier);
    if (!b.done) return { msg: 'Finish construction first.' };
    if (b.upEnd) return { msg: 'Already upgrading.' };
    if (b.ruined) return { msg: 'Repair it first.' };
    if (b.level >= 5) return { msg: 'Fully upgraded.', max: true };
    if (b.level >= max) return { msg: `Grow the realm to upgrade further.`, tierCap: true };
    if (!this.canAfford(upgradeCost(b.type, b.level))) return { msg: 'Not enough resources.' };
    return null;
  }
  upgradeBuilding(b) {
    const block = this.upgradeBlock(b); if (block) return block.msg;
    this.pay(upgradeCost(b.type, b.level));
    b.upTotal = Math.round(upgradeTime(b.type, b.level) * (1 + this.decrees.fx('build'))); b.upEnd = Date.now() + b.upTotal * 1000;
    this.home.fxAt('dust2', b.x, b.y, { scale: 1.8 });
    this.sfx('build');
    this.save(); return null;
  }
  finishBuildingUpgrade(b, quiet) {
    b.upEnd = 0; b.upTotal = 0; b.level++;
    this.state.stats.upgrades = (this.state.stats.upgrades || 0) + 1;
    const f = b.hp / b.maxHp; b.maxHp = levelHp(b.type, b.level); b.hp = Math.max(b.maxHp * f, b.maxHp * 0.6);
    b.pop = 1;
    if (!quiet) { this.ui.toast(`${BUILDINGS[b.type].name} reached level ${b.level}.`, 'gold'); this.home.fxAt('dust2', b.x, b.y, { scale: 2 }); this.sfx('complete', b); }
    this.log(`${BUILDINGS[b.type].name} upgraded to level ${b.level}.`);
  }
  repairCost(b) { return { wood: Math.ceil((b.maxHp - b.hp) / 20) }; }
  repairNow(b) {
    if (b.hp >= b.maxHp) return 'Not damaged.';
    if (!this.pay(this.repairCost(b))) return 'Not enough wood.';
    b.hp = b.maxHp; this.home.fxAt('dust2', b.x, b.y, { scale: 1.6 }); this.sfx('build'); return null;
  }
  completeTraining(b, q, quiet) {
    const S = this.state;
    S.stats['trained_' + q.unit] = (S.stats['trained_' + q.unit] || 0) + 1;
    if (q.unit === 'pawn') {
      S.pawns++;
      // put the new pawn on whichever resource is running lowest
      const busy = S.jobs.wood + S.jobs.gold + S.jobs.meat + S.jobs.build;
      if (busy < S.pawns) { const low = ['wood', 'gold', 'meat'].sort((a, c) => S.res[a] - S.res[c])[0]; S.jobs[low]++; }
      this.spawnPawn();
      if (!quiet) { this.ui.toast('A new Pawn joins the realm.'); this.sfx('ready'); }
      return;
    }
    const rec = this.newSoldier(q.unit);
    const recruit = levelEffects(b.type, b.level).recruit || 1;
    if (recruit > 1) { rec.level = recruit; rec.xp = XP_LEVELS[recruit]; }
    const c = this.home.nearestWalkable(b.cx + Math.floor(b.fw / 2), b.cy + b.fh) || this.door;
    this.spawnSoldier(rec, false, { x: center(c[0]), y: center(c[1]) + 8 });
    if (!quiet) { this.ui.toast(`${rec.name} joins the army: a new ${UNITS[q.unit].name}.`); this.sfx('ready'); this.home.fxAt('dust1', center(c[0]), center(c[1]) + 8); }
    this.log(`${rec.name} joined as ${/^[AEIOU]/.test(UNITS[q.unit].name) ? 'an' : 'a'} ${UNITS[q.unit].name}.`);
  }
  upgradeCastle() {
    const S = this.state;
    if (S.upgradeEnd) return 'Already upgrading.';
    if (S.tier >= 5) {
      const cost = renownCost(S.renown);
      if (!this.pay(cost)) return 'Not enough resources.';
      S.renown++; this.ui.toast(`Your Renown rises to rank ${S.renown}.`); this.log(`Renown rank ${S.renown} reached.`, 'renown');
      for (const u of this.home.units) if (u.rec) { const f = u.hp / u.maxHp; u.applyStats(); u.hp = u.maxHp * f; }
      this.save(); return null;
    }
    const next = TIERS[S.tier + 1];
    if (!this.pay(next.cost)) return 'Not enough resources.';
    S.upgradeEnd = Date.now() + next.time * 1000; S.upgradeTotal = next.time;
    this.save(); return null;
  }
  finishUpgrade(quiet) {
    const S = this.state;
    S.tier++; S.upgradeEnd = 0;
    const f = this.castle.hp / this.castle.maxHp;
    this.castle.maxHp = Math.round(TIERS[S.tier].castleHp * (1 + this.bonus().castleHp));
    this.castle.hp = Math.max(this.castle.maxHp * f, this.castle.maxHp * 0.5);
    this.log(`The realm grew into a ${TIERS[S.tier].name}.`, S.tier < 5 ? 'tier' : null);
    this.castle.pop = 1;
    if (S.tier === 3) { this.home.fxAt('explosion2', this.castle.x, this.castle.y - 40, { scale: 2.2 }); for (let i = 0; i < 6; i++) this.home.fxAt('dust2', this.castle.x + (i - 2.5) * 50, this.castle.y + 6, { scale: 1.4 }); this.shake(8); }
    if (S.tier === 5) this.crown(quiet);
    if (S.tier === 3 && !quiet) { this.ui.banner('The Castle is raised', 'Stone walls and towers rise where the hall stood. The realm is a Castle now: new buildings, soldiers and the deep waters await.', 'gold'); this.sfx('victory'); return; }
    if (S.tier === 5) return;
    if (!quiet) { this.ui.banner(`Your realm is now a ${TIERS[S.tier].name}`, 'New buildings and soldiers are available. Buildings can now be upgraded further.', 'gold'); this.sfx('victory'); }
  }

  // ------------------------------------------------------------ offline progress
  applyOffline() {
    const S = this.state;
    const now = Date.now();
    const secs = Math.max(0, Math.min(12 * 3600, (now - S.lastSeen) / 1000));
    const report = { secs, got: { gold: 0, wood: 0, meat: 0 }, done: [] };
    if (secs < 30) { this.tickTimers(true); return report; }
    const gb = this.bonus();
    const rate = { wood: 0.22 * (1 + gb.gather + gb.wood), gold: 0.18 * (1 + gb.gather + gb.gold), meat: 0.2 * (1 + gb.gather) };
    for (const r of ['wood', 'gold', 'meat']) {
      const n = Math.floor(S.jobs[r] * rate[r] * secs);
      report.got[r] = this.addRes(r, n);
    }
    // finished work
    for (const b of this.home.buildings) if (b.buildEnd && now >= b.buildEnd) report.done.push(BUILDINGS[b.type].name + ' completed');
    for (const b of this.home.buildings) for (const q of b.queue) if (now >= q.end) report.done.push(UNITS[q.unit].name + ' trained');
    if (S.upgradeEnd && now >= S.upgradeEnd) report.done.push(`Grew into a ${TIERS[Math.min(5, S.tier + 1)].name}`);
    this.colonies.catchUp(secs);
    this.court.catchUp();
    { const n = this.kingdoms.catchUp(secs); if (n > 0) report.done.push(n === 1 ? 'News came from across the sea' : `${n} tidings came from across the sea`); }
    { const tg = this.trade.catchUp(); for (const k in tg) report.got[k] += tg[k]; if (tg.gold + tg.wood + tg.meat > 0) report.done.push('Trade boats came and went'); }
    this.tickTimers(true);
    // buildings mend and sheep wander back
    for (const b of this.home.buildings) if (b.done) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * Math.min(1, secs / 1800));
    const missingSheep = this.maxSheep() - this.home.sheep.length;
    for (let i = 0; i < Math.min(missingSheep, Math.floor(secs / 40)); i++) this.spawnSheep();
    for (const rec of S.soldiers) rec.hp = undefined;
    for (const u of this.home.units) if (u.rec) u.hp = u.maxHp;
    return report;
  }
  maxSheep() { return 9 + this.state.tier * 2; }

  // timers that use real clock time (construction, training, upgrades, respawns)
  tickTimers(quiet) {
    const S = this.state, now = Date.now(), h = this.home;
    for (const b of h.buildings) {
      if (b.buildEnd && now >= b.buildEnd) {
        b.buildEnd = 0; b.buildTotal = 0;
        S.stats['built_' + b.type] = (S.stats['built_' + b.type] || 0) + 1;
        b.pop = 1;
        if (!quiet) {
          this.ui.toast(`${BUILDINGS[b.type].name} completed.`); h.fxAt('dust2', b.x, b.y, { scale: 1.8 }); this.sfx('complete');
          b.pop = 0.45; // squash-and-stretch on completion
          for (let i = 0; i < 3; i++) h.fxAt('dust1', b.x + (i - 1) * b.fw * 22, b.y + 4, { scale: 1.1 });
          if (!b.def.wall && !b.def.lantern) h.floatText(BUILDINGS[b.type].name, b.x, b.y - 140, '#ffe066', 16);
        }
        this.assignJobs();
      }
      if (b.upEnd && now >= b.upEnd) this.finishBuildingUpgrade(b, quiet);
      while (b.queue.length && now >= b.queue[0].end && b.done) {
        const q = b.queue.shift();
        this.completeTraining(b, q, quiet);
      }
    }
    if (S.upgradeEnd && now >= S.upgradeEnd) this.finishUpgrade(quiet);
    S.goldRespawns = S.goldRespawns.filter(g => {
      if (now < g.at) return true;
      const z = this.goldZones.length ? this.goldZones[Math.floor(Math.random() * this.goldZones.length)] : [g.cx, g.cy];
      const c = h.nearestWalkable(z[0], z[1], 4, (x, y) => !h.map.stairAt(x, y) && !h.map.isCliff(x, y + 1) && h.map.ground(x, y + 1));
      if (c) h.addGold(c[0], c[1], { amount: 120 });
      return false;
    });
    for (const rec of S.soldiers) {
      if (rec.status === 'wounded' && now >= rec.woundedUntil) {
        rec.status = 'home'; rec.hp = undefined; this.spawnSoldier(rec, true);
        if (!quiet) this.ui.toast(`${rec.name} has recovered.`);
      }
    }
  }

  // ------------------------------------------------------------ rival kingdoms
  rivalUnlocked(r) { const S = this.state, u = r.unlock; return S.tier >= (u.tier || 1) && S.stats.raidsSurvived >= (u.raids || 0); }
  rivalLevel(key) {
    const r = rivalDef(key), days = (Date.now() - this.state.created) / 86400000;
    return r.base + Math.floor(days / 1.5) + (this.state.tier - 1) + this.state.renown;
  }
  activeRivals() { return RIVALS.filter(r => this.rivalUnlocked(r) && !this.state.rivals[r.key].subjugated && !((this.state.rivals[r.key].truceUntil || 0) > Date.now())); }
  tributeRate(key) { return { gold: 30 + this.rivalLevel(key) * 6, wood: 20 + this.rivalLevel(key) * 4 }; } // per hour
  tickTribute() {
    const now = Date.now();
    // kingdoms of the open sea that bent the knee pay a little every hour
    const W = this.state.world;
    if (W && this.sea.ocean) for (const [id, at] of Object.entries(W.conquered || {})) {
      const hours = Math.floor((now - at) / 3600000); if (hours < 1) continue;
      const is = this.sea.ocean.islandById(id), lv = is ? is.level : 3, h = Math.min(hours, 24);
      const g = this.addRes('gold', (20 + lv * 4) * h), w = this.addRes('wood', (15 + lv * 3) * h);
      W.conquered[id] = at + hours * 3600000;
      if (g || w) this.ui.toast(`${is && is.kingdom ? is.kingdom.name : 'A vassal'} pays tribute: ${g} gold, ${w} wood.`, 'gold');
    }
    // trade pacts and allies share their harbour dues
    if (W && W.k && this.sea.ocean) for (const [id, k] of Object.entries(W.k)) {
      if (!k.pact && k.stance !== 'ally') continue;
      k.duesAt = k.duesAt || now; const hours = Math.floor((now - k.duesAt) / 3600000); if (hours < 1) continue;
      const is = this.sea.ocean.islandById(id); if (!is || !is.kingdom || this.kingdoms.stance(is) === 'war') { k.duesAt = now; continue; }
      const g = this.addRes('gold', (k.stance === 'ally' ? 12 : 8) * Math.min(hours, 24) * (1 + is.level * 0.25));
      k.duesAt += hours * 3600000;
      if (g) this.ui.toast(`Harbour dues from ${is.kingdom.name}: ${g} gold.`, 'gold');
    }
    for (const r of RIVALS) {
      const st = this.state.rivals[r.key];
      if (!st.subjugated) continue;
      if (!st.tributeAt) st.tributeAt = now;
      const hours = Math.floor((now - st.tributeAt) / 3600000);
      if (hours >= 1) {
        const rate = this.tributeRate(r.key), h = Math.min(hours, 24);
        const g = this.addRes('gold', rate.gold * h), w = this.addRes('wood', rate.wood * h);
        st.tributeAt += hours * 3600000;
        if (g || w) this.ui.toast(`${r.name} pays tribute: ${g} gold, ${w} wood.`, 'gold');
      }
    }
  }

  // ------------------------------------------------------------ holidays and the moon
  holiday() {
    const now = Date.now();
    if (!this._hol || now - this._hol.t > 60000) this._hol = { t: now, h: holidayFor(new Date(now + (this.env.offset || 0) * 3600000)) };
    return this._hol.h;
  }
  moon() { return moonPhase(Date.now() + (this.env.offset || 0) * 3600000); }
  holidayTick() {
    const S = this.state, h = this.holiday(); if (!h) return;
    const tag = todayStr() + ':' + h.key;
    if (S.holidayDone === tag) return;
    S.holidayDone = tag;
    S.holidaysSeen = S.holidaysSeen || {}; S.holidaysSeen[h.key] = (S.holidaysSeen[h.key] || 0) + 1;
    this.ui.banner(h.name, (h.verse ? h.verse + ' ' : '') + h.desc, h.colour || 'gold');
    this.sfx(h.solemn ? 'bell' : 'victory');
    this.log(`${h.name} was kept in the realm.`);
    const soldiers = this.home.units.filter(u => u.rec && u.alive);
    const blessed = this.countOf('chapel') ? 2 : 1;
    if (blessed > 1 && h.verse) { const g = 100 + this.state.tier * 80; this.addAll({ gold: g, meat: g }); this.ui.toast('The Chapel gives thanks: a second gift for the realm.', 'gold'); }
    if (h.xpGift) for (const u of soldiers) { this.grantXp(this.home, u, h.xpGift * blessed); u.hp = u.maxHp; this.home.fxAt('healFx', u.x, u.y); }
    if (h.feast) for (const u of soldiers) u.hp = u.maxHp;
    if (h.lambs) for (let i = 0; i < h.lambs; i++) this.spawnSheep();
    if (h.merchant && !this.events.merchant) this.events.startMerchant();
  }

  // ------------------------------------------------------------ daily
  checkDaily() {
    const D = this.state.daily, today = todayStr();
    if (D.last === today) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    D.streak = D.last === todayStr(y) ? D.streak + 1 : 1;
    D.last = today;
    const hol = holidayFor(new Date());
    const mult = (1 + Math.min(D.streak - 1, 6) * 0.25) * ((hol && hol.gift) || 1);
    const base = 40 + this.state.tier * 40;
    const gift = { gold: Math.round(base * mult), wood: Math.round(base * mult), meat: Math.round(base * 0.8 * mult) };
    for (const k in gift) gift[k] = this.addRes(k, gift[k]);
    if (todayStr(new Date(this.state.created)) !== today) this.pendingDaily = { streak: D.streak, gift }; // not on a realm's first day: the intro says enough
  }

  // ------------------------------------------------------------ main tick
  update(dt) {
    const S = this.state;
    if (this.exp) { const n = this.speed === 2 ? 2 : 1; for (let k = 0; k < n; k++) this.exp.update(dt); } // battle speed only speeds up the voyage
    this.home.update(dt);
    this.env.update(dt);
    this.updateAnnex(dt); // annexed land slam (src/annex.js)
    this.tickTimersT = (this.tickTimersT || 0) - dt;
    if (this.tickTimersT <= 0) { this.tickTimersT = 0.5; this.tickTimers(false); this.checkDaily(); this.tickTribute(); this.orders.update(); this.chal.update(); this.trade.update(); this.seasonal.update(); this.squads.clean(); this.holidayTick(); this.rescueT = (this.rescueT || 0) - 0.5; if (this.rescueT <= 0 && !this.exp) { this.rescueT = 4; this.rescueTrapped(); } }
    // sheep breed
    this.sheepT = (this.sheepT || 0) + dt;
    if (this.env.breed() > 0 && this.sheepT > 35 / this.env.breed()) { this.sheepT = 0; if (this.home.sheep.length < this.maxSheep()) this.spawnSheep(); }
    // soldiers mend at home when no fighting
    this.regenT += dt;
    if (this.regenT > 1) {
      this.regenT = 0;
      const calm = !this.raid || !this.raid.active;
      const mend = this.countOf('chapel') ? 0.06 : 0.03;
      for (const u of this.home.units) if (u.rec && u.alive && calm && !u.target) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * mend);
      for (const b of this.home.buildings) if (b.done && calm && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * (b.ruined ? 0.004 : 0.006));
      if (this.castle.hp <= 0) this.castle.hp = 1;
    }
    this.updateRaid(dt);
    this.needs.update(dt);
    this.sea.update(dt);
    this.kingdoms.update(dt);
    this.colonies.update(dt);
    this.war.update(dt);
    this.court.update(dt);
    this.saga.update(dt);
    this.envoyT = (this.envoyT ?? 240 + Math.random() * 240) - dt;
    if (this.envoyT <= 0) { this.envoyT = 360 + Math.random() * 360; if (!this.exp && !(this.raid && this.raid.active) && this.state.tier >= 2 && this.ui && this.ui.envoy) { const e = this.kingdoms.envoy(); if (e) this.ui.envoy(e); } }
    this.trade.visuals(Date.now());
    if (!this.exp) this.events.update(dt);
    this.questT -= dt;
    if (this.questT <= 0) { this.questT = 1; this.checkQuest(); }
    this.saveT += dt;
    if (this.saveT > 6) { this.saveT = 0; this.save(); }
  }

  // ------------------------------------------------------------ raids
  raidCountdown() { return this.state.timers.raid; }
  updateRaid(dt) {
    const S = this.state;
    if (!this.raid) {
      if (this.exp) return;
      if (this.events.blocking) return;
      const hol = this.holiday();
      if (hol && hol.peace && !this.raidWarned) { S.timers.raid = Math.max(S.timers.raid, 90); return; } // holy days are days of peace
      S.timers.raid -= dt;
      if (S.timers.raid <= 45 && !this.raidWarned) {
        this.raidWarned = true;
        this.pendingRaid = this.planRaid();
        const sp0 = this.pendingRaid.spawns[0], dname = sp0 ? DISTRICTS[districtAt(this, sp0.lx, sp0.ly)] : null;
        if (sp0) this.home.raidMark = { x: sp0.lx * T + 32, y: sp0.ly * T + 40, t: 0 };
        this.ui.banner(this.pendingRaid.night ? 'Raiders in the dark' : 'Raiders sighted', `${this.pendingRaid.region.name} raiders approach from the ${this.pendingRaid.dir}${dname ? `, making for ${dname}` : ''}${this.pendingRaid.night ? ' under cover of darkness, with night creatures among them' : ''}. They land in 45 seconds.`, 'red');
        this.sfx('horn');
        this.showBoat(this.pendingRaid);
      }
      if (S.timers.raid <= 0) this.startRaid(this.pendingRaid || this.planRaid());
      return;
    }
    const R = this.raid, h = this.home;
    R.t += dt;
    if (R.queue.length) {
      R.spawnT -= dt;
      if (R.spawnT <= 0) {
        R.spawnT = R.gap || 0.45;
        const e = R.queue.shift();
        const sp = R.spawns[e.si % R.spawns.length];
        const u = h.addUnit(e.type, 1, center(sp.lx) + (Math.random() - 0.5) * 20, center(sp.ly) + 8, { level: R.level, mode: 'raid', elite: e.elite });
        u.home = { x: center(sp.lx), y: center(sp.ly) + 8 };
        u.raidId = R.id;
        if (e.flagDuel) e.flagDuel(u);
        if (e.nemesis) this.court.empower(u);
        R.units.push(u);
        if (sp.ground) h.fxAt('dust2', u.x, u.y, { scale: 1.6 }); else { h.fxAt('splash', center(sp.wx), center(sp.wy) + 20); this.sfx('splash', u, h); }
        if (u.def.boss) { this.sfx('roar'); this.shake(6, h); }
      }
    }
    const alive = R.units.filter(u => u.alive && !u.dead);
    if (!R.queue.length && !alive.length && R.active) this.endRaid(true);
    else if (R.t > 600 && R.active) { for (const u of alive) u.leaving = true; this.endRaid(true); }
  }
  planRaid(kind = 'raid', opts = {}) {
    const S = this.state;
    const unlocked = Math.min(REGIONS.length, 1 + Math.floor(S.cleared / 5));
    let region = opts.region || REGIONS[Math.floor(Math.random() * unlocked)];
    // rival houses take a share of the raids once they know of you
    const rivals = this.activeRivals(), nem = !opts.region && !opts.units && kind === 'raid' && Math.random() < 0.25 ? this.court.nemesisRegion() : null;
    if (nem) region = nem;
    else if (!opts.region && !opts.units && kind === 'raid' && rivals.length && Math.random() < 0.35) {
      const rv = rivals[Math.floor(Math.random() * rivals.length)];
      region = { key: 'rival', name: rv.name, rival: rv.key, enemies: rivalRoster(rv.key, this.rivalLevel(rv.key)) };
      if (!S.rivals[rv.key].met) { S.rivals[rv.key].met = true; this.log(`${rv.name} declared war. "${rv.motto}"`, 'war'); }
      S.rivals[rv.key].raids++;
    } else if (!opts.region && !opts.units && kind === 'raid' && S.tier >= 2 && Math.random() < 0.3) {
      const ki = this.kingdoms.raider();
      if (ki) { const c = ki.kingdom.color; region = { key: 'rival', name: ki.kingdom.name, kingdomIsle: ki.id, enemies: rivalRoster(c, Math.max(1, Math.round(ki.level * 0.8))) }; }
    }
    const days = (Date.now() - S.created) / 86400000;
    const budget = (opts.budget ?? (3 + S.tier * 2.5 + S.stats.raidsSurvived * 0.7 + Math.min(days, 60) * 0.25 + S.renown * 2)) * (1 + this.decrees.fx('raidSize') + this.court.fx('raidSize')) * (S.stats.raidsSurvived + S.stats.raidsLost < 3 && !opts.units ? 0.7 : 1);
    const level = 1 + Math.floor(S.stats.raidsSurvived / 4) + (S.tier - 1) + S.renown;
    // landing spots far from the castle
    const far = this.shore.filter(s => dist(s.lx, s.ly, CASTLE.x + 2, CASTLE.y + 1) > 11);
    if (!this.shore.length) this.shore = [{ wx: 1, wy: 1, lx: this.door[0], ly: this.door[1] }];
    const pool = far.length ? far : this.shore;
    const main = pool[Math.floor(Math.random() * pool.length)];
    const spawns = [main];
    const nBoats = opts.boats || 1;
    for (let i = 1; i < nBoats; i++) { const o = pool[Math.floor(Math.random() * pool.length)]; spawns.push(o); }
    const dx = main.lx - (CASTLE.x + 2), dy = main.ly - (CASTLE.y + 1);
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
    const queue = [];
    if (opts.units) for (const t of opts.units) queue.push({ type: t, si: queue.length, elite: opts.elite });
    else {
      let b = budget, i = 0;
      const enemies = region.rival ? rivalRoster(region.rival, this.rivalLevel(region.rival)) : region.enemies.filter(k => !ENEMIES[k].boss && !(ENEMIES[k].caster && S.tier < 3) && (ENEMIES[k].minLevel || 0) <= level + 1);
      if (S.tier >= 2 && !region.rival && Math.random() < 0.35) queue.push({ type: 'thief', si: 0 });
      if (this.env.isNight && this.moon().dark) { queue.push({ type: 'thief', si: 1 }, { type: 'thief', si: 2 }); } // a thieves' moon
      const night = this.env.isNight && !region.rival;
      while (b > 0 && i < 40) {
        let k = enemies[Math.floor(Math.random() * enemies.length)];
        if (night && Math.random() < 0.5) k = NIGHT_CREATURES[Math.floor(Math.random() * NIGHT_CREATURES.length)];
        if (night && S.tier >= 3 && i === 3) k = 'shaman';
        queue.push({ type: k, si: i++ });
        b -= ENEMIES[k].cost;
      }
    }
    if (!opts.units && this.court.leads(region)) queue.splice(Math.min(3, queue.length), 0, { type: this.court.nemesisUnit(level), si: 0, nemesis: true });
    return { kind, region, level, spawns, queue, dir, gap: opts.gap, night: this.env.isNight };
  }
  showBoat(plan) {
    this.home.boats = plan.spawns.map(s => ({ key: plan.region.key === 'reef' ? 'seahorse' : 'boat', x: center(s.wx), y: center(s.wy) + (plan.region.key === 'reef' ? 30 : 46), t: 0, flip: s.wx > s.lx }));
  }
  startRaid(plan, opts = {}) {
    this.pendingRaid = null; this.raidWarned = false;
    this.state.timers.raid = 480 + Math.random() * 360;
    if (!this.home.boats.length && plan.spawns[0] && !plan.spawns[0].ground) this.showBoat(plan);
    const sp0 = plan.spawns[0];
    if (sp0 && !sp0.ground) {
      this.home.raidMark = { x: sp0.lx * T + 32, y: sp0.ly * T + 40, t: 0 };
      const went = this.squads.respond(sp0.lx, sp0.ly);
      if (went.length) setTimeout(() => this.ui.toast(`${went.map(q => q.name).join(' and ')} ${went.length > 1 ? 'march' : 'marches'} to meet them.`, 'gold'), 1200);
    }
    this.raid = { id: Math.random(), active: true, t: 0, spawnT: 0, queue: plan.queue.slice(), units: [], spawns: plan.spawns, level: plan.level, kind: plan.kind, gap: plan.gap, onEnd: opts.onEnd, title: opts.title || 'Raid', loot: 0, region: plan.region };
    if (!opts.silent) this.sfx('horn');
    if (!opts.silent) this.ui.banner(opts.title || 'To arms!', opts.text || `Raiders are landing. Pawns are taking shelter in the ${this.seatName()}.`, 'red');
    for (const u of this.home.units) if (u.kind === 'pawn') { u.task = null; this.releaseNode(u); }
  }
  endRaid(won) {
    const R = this.raid; if (!R || !R.active) return;
    R.active = false;
    this.court.settleRaid(R);
    const S = this.state;
    if (won) {
      S.stats.raidsSurvived++; S.lastRaidWon = Date.now();
      if (this.env.isNight) S.stats.nightRaids = (S.stats.nightRaids || 0) + 1;
      if (this.env.weather === 'storm') S.stats.stormRaids = (S.stats.stormRaids || 0) + 1;
      const reward = Math.round((R.loot + 20 + R.level * 6) * (this.env.isNight ? 1.5 : 1) * (1 + this.decrees.fx('raidGold')));
      this.addRes('gold', reward);
      this.sfx('victory');
      this.ui.banner(R.kind === 'raid' ? 'Raid repelled' : R.title + ' survived', `The raiders are beaten. You recover ${reward} gold from the field.`, 'blue');
      this.log(`Repelled a ${R.region ? R.region.name + ' ' : ''}raid. +${reward} gold.`, S.stats.raidsSurvived === 1 && R.kind === 'raid' ? 'raid' : R.title === 'Invasion' ? 'raid' : null);
      if (Math.random() < 0.15 + R.level * 0.005) this.dropGear(R.level, { from: 'a raider' });
      this.chal.note('raid', { downs: R.downs || 0 });
      this.war.victory(this.home);
      this.court.maybeNemesis(R.region);
      if (R.region && R.region.kingdomIsle) this.kingdoms.onRaidBeaten(this.sea.ocean.islandById(R.region.kingdomIsle));
    }
    if (R.onEnd) R.onEnd(won);
    this.home.raidMark = null;
    for (const u of this.home.units) if (u.alerted) u.alerted = null;
    this.raid = null;
    this.home.boats = [];
    this.state.timers.raid = 480 + Math.random() * 360;
    this.assignJobs();
    this.save();
  }
  loseRaid() {
    const R = this.raid; if (!R || !R.active) return;
    this.court.settleRaid(R);
    const S = this.state; S.lastRaidLost = Date.now();
    const lost = {};
    for (const r of ['gold', 'wood', 'meat']) { lost[r] = Math.floor(S.res[r] * 0.25); S.res[r] -= lost[r]; }
    S.stats.raidsLost++;
    this.court.onRaidLost(R.region);
    for (const u of R.units) if (u.alive) { u.leaving = true; u.target = null; }
    this.sfx('defeat'); this.shake(10);
    this.ui.banner(`The ${this.seatName()} has fallen`, `Raiders plundered ${lost.gold} gold, ${lost.wood} wood and ${lost.meat} meat, then sailed off. The walls will mend.`, 'red');
    this.log(`The ${this.seatName()} fell to raiders. Lost a quarter of stores.`, 'defeat');
    R.active = false;
    if (R.onEnd) R.onEnd(false);
    this.home.raidMark = null; for (const u of this.home.units) u.alerted = null;
    this.raid = null; this.home.boats = [];
    this.state.timers.raid = 540 + Math.random() * 300;
    this.castle.hp = Math.round(this.castle.maxHp * 0.3);
    this.assignJobs(); this.save();
  }
  raidTarget(scene, u) {
    if (scene !== this.home) return null;
    const bs = scene.buildings.filter(b => !b.ruined && b.done && !b.def.wall);
    let best = this.castle.alive ? this.castle : null, bd = best ? u.distTo(best) * (u.def.burn ? 1.6 : 1) : 1e9;
    for (const b of bs) { const d = u.distTo(b) * (u.def.burn ? 0.6 : 1); if (d < bd && (d < 7 * T || u.def.burn)) { bd = d; best = b; } }
    return best;
  }
  thiefAI(scene, u, dt) {
    if (u.leaving) return this.leaveAI(scene, u, dt);
    if (!u.loot) {
      if (u.distTo(this.castle) < 24) {
        const amt = Math.min(80, Math.floor(this.state.res.gold * 0.12));
        this.state.res.gold -= amt; u.loot = amt;
        scene.floatText('-' + amt + ' gold', u.x, u.y - 70, '#ffe066');
        this.ui.toast(`A thief snatched ${amt} gold. Stop him before he reaches his boat.`);
        u.leaving = true; u.stop();
        return;
      }
      u.pathT -= dt;
      if (!u.path || !u.path.length || u.pathT <= 0) { u.pathT = 1; u.setPath(this.castle.x, this.castle.y, scene.adjacentGoal(this.castle.cells())); }
      u.stepPath(dt);
    }
  }
  leaveAI(scene, u, dt) {
    if (!u.path || !u.path.length) { if (!u.setPath(u.home.x, u.home.y)) { u.dead = true; return; } }
    if (u.stepPath(dt)) {
      scene.fxAt('splash', u.x, u.y);
      if (u.loot) { this.ui.toast(`The thief escaped with ${u.loot} gold.`); u.loot = 0; }
      u.dead = true;
    }
  }
  casterTick(scene, u, dt) {
    u.hexT = (u.hexT ?? 6) - dt;
    if (u.hexT > 0) return;
    u.hexT = 11;
    const targets = scene.units.filter(o => o.team === 0 && o.kind === 'soldier' && o.alive && !o.hidden && o.cursed <= 0 && o.type !== 'king' && dist(o.x, o.y, u.x, u.y) < 6.5 * T);
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random() * targets.length)];
    scene.fxAt('hexTransform', t.x, t.y, {}); this.sfx('hex', t, scene);
    t.cursed = this.state.relics.hexcharm ? 22 : 45;
    t.order = null; t.target = null; t.stop();
    scene.selected.delete(t);
    scene.floatText('Hexed', t.x, t.y - 80, '#d7a6ff');
  }

  // ------------------------------------------------------------ deaths and kills
  onUnitKilled(scene, u, src) {
    const S = this.state;
    if (u.team === 1) {
      S.stats.kills++; this.saga.killed(u.type);
      if (['skull', 'bat', 'imp', 'shaman'].includes(u.type) && this.env.isNight) S.stats.nightKills = (S.stats.nightKills || 0) + 1;
      if (src && src.tower) S.stats.towerKills = (S.stats.towerKills || 0) + 1;
      if (u.type === 'troll') S.stats.trollsSlain++;
      if (u.loot) { this.addRes('gold', u.loot); scene.floatText('+' + u.loot + ' gold', u.x, u.y - 60, '#ffe066'); this.ui.toast('Stolen gold recovered.'); }
      if (this.raid && u.raidId === this.raid.id) this.raid.loot += u.def.gold * (1 + (u.level - 1) * 0.1);
      if (scene.expLoot !== undefined) scene.expLoot += u.def.gold * (1 + (u.level - 1) * 0.1);
      // experience
      const xp = u.def.xp * (1 + (u.level - 1) * 0.1);
      const killer = src && src.rec ? src : null;
      if (killer) {
        killer.rec.kills++;
        this.grantXp(scene, killer, xp);
        if (killer.killHeal) killer.hp = Math.min(killer.maxHp, killer.hp + killer.killHeal);
        if (u.type === 'troll' && !killer.rec.traits.includes('trollbane')) { killer.rec.traits.push('trollbane'); killer.applyStats(); this.ui.toast(`${killer.rec.name} earned the title Trollbane.`); }
      }
      for (const o of scene.units) if (o.rec && o !== killer && o.alive && dist(o.x, o.y, u.x, u.y) < 6 * T) this.grantXp(scene, o, xp * 0.3);
      if (u.onDeath) u.onDeath(src);
      return;
    }
    if (u.kind === 'soldier' && u.rec) {
      const rec = u.rec;
      if (rec.type === 'king' || (rec.hero && rec.title === 'Founder')) { // the realm's founder, like its King, is carried home rather than lost
        const mins = rec.type === 'king' ? 30 : 20;
        rec.status = 'wounded'; rec.woundedUntil = Date.now() + mins * 60000; rec.hp = undefined;
        if (S.world && S.world.crew) S.world.crew = S.world.crew.filter(id => id !== rec.id);
        this.ui.banner(rec.type === 'king' ? 'The King has fallen wounded' : 'The Founder has fallen wounded', `${rec.type === 'king' ? 'He' : rec.name.split(' ')[0]} is carried home to recover for ${mins} minutes.`, 'red');
        this.log(`${rec.name} was wounded.`);
        return;
      }
      S.soldiers = S.soldiers.filter(s => s !== rec);
      const where = scene === this.home ? 'defending the realm' : `on ${scene.islandName}`;
      const killer = src && src.def ? ((this.ui.foeName ? this.ui.foeName(src.def) : src.def.name) || 'a monster') : 'unknown hands';
      S.fallen.unshift({ name: rec.name, type: rec.type, level: rec.level, kills: rec.kills, avatar: rec.avatar, traits: rec.traits, title: rec.title || null, hero: !!rec.hero, where, killer, date: Date.now() });
      S.fallen.length = Math.min(S.fallen.length, 100);
      const gearNote = Gear.onFall(this, rec, scene === this.home);
      this.ui.toast(`${rec.name} has fallen ${where}.${gearNote}`, 'red');
      this.log(`${rec.name} (level ${rec.level}, ${rec.kills} kills) fell ${where}, slain by ${killer}.`, rec.hero || rec.general || rec.level >= 8 ? 'fallen' : null);
    }
  }
  grantXp(scene, u, xp) {
    const rec = u.rec; if (!rec || rec.level >= levelCap(rec)) return;
    const holx = this.holiday();
    rec.xp += xp * ((u.xpMul || 1) + this.env.xpMul() + (this.bonus().xp || 0) + ((holx && holx.xp) || 0));
    let up = false;
    while (rec.level < levelCap(rec) && rec.xp >= XP_LEVELS[rec.level + 1]) {
      rec.level++; up = true;
      if (rec.level % 3 === 0 && rec.traits.length < 4) {
        const options = COMMON_TRAITS.filter(t => !rec.traits.includes(t));
        const t = options[Math.floor(Math.random() * options.length)];
        rec.traits.push(t);
        this.ui.toast(`${rec.name} gained the ${TRAITS[t].name} trait.`);
      }
    }
    if (up && rec.level === 10 && !rec.promoted && rec.type !== 'king') this.ui.toast(`${rec.name} has reached level 10 and can be promoted. Open their Gear sheet in Army.`, 'gold');
    if (up) {
      const f = u.hp / u.maxHp; u.applyStats(); u.hp = Math.min(u.maxHp, u.maxHp * f + u.maxHp * 0.2);
      scene.floatText('Level ' + rec.level, u.x, u.y - 90, '#ffe066');
      scene.fxAt('healFx', u.x, u.y, {}); this.sfx('levelup', u, scene);
    }
  }
  onBuildingDown(scene, b, src) {
    if (b === this.castle) { this.loseRaid(); return; }
    if (this.raid && this.raid.active && !b.def.wall) this.raid.downs = (this.raid.downs || 0) + 1;
    if (b.def.wall) { // fences splinter and are gone
      scene.removeBuilding(b); scene.fxAt('dust2', b.x, b.y);
      this.reach = reachable(scene.map, this.door[0], this.door[1]);
      return;
    }
    this.ui.toast(`Your ${BUILDINGS[b.type].name} is in ruins. Builders can restore it.`, 'red');
  }
  onStructDown(scene, s) {
    if (s.def.palisade) { if (s.def.gate) { scene.floatText('The gate is broken', s.x, s.y - 60, '#ffe066'); this.ui.toast('The gate is down. Storm the castle.', 'gold'); } return; }
    scene.floatText(s.def.name + ' destroyed', s.x, s.y - 100, '#ffe066');
    if (scene.expLoot !== undefined) scene.expLoot += 25 * s.level;
  }

  // ------------------------------------------------------------ quests
  questValue(type) {
    const S = this.state;
    if (type === 'jobWood') return S.jobs.wood;
    if (type === 'tier') return S.tier;
    if (type === 'renown') return S.renown;
    if (type === 'islandsCleared') return S.cleared;
    if (type === 'generals') return S.soldiers.filter(r => r.general).length;
    if (type === 'councillors') return Object.keys((S.council && S.council.seats) || {}).length;
    if (type.startsWith('built_')) return this.home.buildings.filter(b => b.type === type.slice(6) && b.done).length;
    return S.stats[type] || 0;
  }
  currentQuest() { const i = this.state.questIdx; return i < QUESTS.length ? QUESTS[i] : endlessQuest(i); }
  checkQuest() {
    const q = this.currentQuest();
    if (this.questValue(q.type) >= q.n) {
      this.addAll(q.reward);
      this.state.questIdx++;
      const parts = Object.entries(q.reward).map(([k, v]) => `${v} ${k}`).join(', ');
      this.ui.toast(`Chronicle complete: ${q.text}. Reward: ${parts}.`, 'gold');
      this.log(`Chronicle: ${q.text}.`);
    }
  }

  // ------------------------------------------------------------ expeditions
  startExpedition(n, ids, bounty) {
    const S = this.state;
    let rivalKey = typeof bounty === 'string' && bounty.startsWith('rival:') ? bounty.slice(6) : null;
    if (rivalKey) bounty = false;
    const storyIdx = typeof bounty === 'string' && bounty.startsWith('story:') ? +bounty.slice(6) : -1;
    if (storyIdx >= 0) bounty = false;
    const isle = typeof bounty === 'string' && bounty.startsWith('isle:') ? this.sea.ocean.islandById(bounty.slice(5)) : null;
    if (isle) bounty = false;
    const kingdomIsle = isle && isle.kind === 'kingdom' ? isle : null;
    const abyss = bounty === 'abyss' ? ((S.abyss || (S.abyss = { depth: 1, best: 0, runs: 0 })).depth || 1) : 0;
    if (abyss) bounty = false;
    if (kingdomIsle) rivalKey = kingdomIsle.kingdom.color;
    let info = islandInfo(n);
    const seed = isle ? isle.seed : abyss ? hashStr('abyss' + abyss + 'x' + S.seed + 'r' + (S.abyss.runs || 0)) : storyIdx >= 0 ? hashStr('story' + storyIdx + 'x' + S.seed) : rivalKey ? hashStr('rival' + rivalKey + S.seed) : bounty ? hashStr('bounty' + todayStr()) : hashStr('isle' + n + 'x' + S.seed);
    let region = bounty ? REGIONS[seed % REGIONS.length] : info.region;
    let level = bounty ? Math.max(2, info.level + 1) : info.level;
    if (rivalKey) {
      const rv = kingdomIsle ? { name: kingdomIsle.kingdom.name, colors: [4, 1, 2] } : rivalDef(rivalKey);
      level = kingdomIsle ? kingdomIsle.level : this.rivalLevel(rivalKey);
      region = { key: 'rival', name: rv.name, colors: rv.colors, rival: rivalKey, enemies: rivalRoster(rivalKey, level), camp: `${rivalKey}Tower`, camp2: `${rivalKey}Barracks`, camp3: `${rivalKey}House`, boss: `${rivalKey}_king` };
      info = { ...info, boss: true, name: kingdomIsle ? kingdomIsle.name : `the ${rv.name.split(' ')[1]} Capital`, rival: rivalKey };
    }
    if (isle && !kingdomIsle) { // a lair or ruins out on the sea
      const P = this.sea.isleParams(isle);
      region = P.region; level = P.level;
      info = { ...info, boss: P.boss && isle.kind === 'lair', name: P.name };
      if (!info.boss) region = { ...region, bossRelic: null };
    }
    if (abyss) {
      const BOSSES = ['bear', 'panda', 'minotaur', 'turtle', 'troll', 'moonbear'];
      const isBoss = abyss % 5 === 0;
      const boss = abyss % 25 === 0 ? 'trollking' : BOSSES[(abyss / 5 - 1) % BOSSES.length];
      const pool = [...new Set(REGIONS.flatMap(r => r.enemies))];
      region = { key: 'abyss', name: 'Every Shore', colors: [2, 5, 4], enemies: pool, boss: isBoss ? boss : null, bossRelic: null };
      level = Math.round(2 + abyss * 1.4 + S.tier * 0.5);
      info = { ...info, boss: isBoss, name: `The Abyss, floor ${abyss}`, abyss };
    }
    if (storyIdx >= 0) {
      const ch = CHAPTERS[storyIdx], base = REGIONS.find(r => r.key === ch.region);
      region = ch.boss ? { ...base, boss: ch.boss, bossRelic: ch.final ? null : base.bossRelic } : base;
      level = ch.level + (info.cycle || 0) * 0;
      info = { ...info, boss: !!ch.boss, name: ch.name, story: storyIdx };
    }
    const map = generateIsland({ w: 40, h: 30, seed, plateaus: 5, highs: 2, colors: region.colors, landFrac: 0.55 });
    const sc = new Scene(this, 'expedition', map, seed);
    sc.islandName = bounty ? 'The Bounty Isle' : info.name; sc.info = info; sc.region = region; sc.level = level; sc.bounty = !!bounty; sc.n = n; sc.rival = rivalKey;
    sc.expLoot = 0; sc.story = storyIdx; sc.abyss = abyss; sc.isle = isle; sc.fromSea = true;
    const r = rng(seed + 5);
    // landing on the west shore, boat floating clear of the coast
    const reach0 = [];
    for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) if (map.kindAt(x, y) === K_LOW) reach0.push([x, y]);
    // land on a shore that connects to most of the island (some coves are cut-off pockets)
    const allSpots = boatSpots(map, null), size = new Map();
    const area = s => { const k = s.lx + ',' + s.ly; if (!size.has(k)) { const re0 = reachable(map, s.lx, s.ly); let n = 0; for (const [x, y] of reach0) if (re0[map.i(x, y)]) n++; size.set(k, n); } return size.get(k); };
    const good = allSpots.filter(s => area(s) >= reach0.length * 0.5);
    const pool = good.length ? good : allSpots.sort((a, b) => area(b) - area(a)).slice(0, 1);
    const west = pool.filter(b => b.dx === -1);
    const spot = (west.length ? west : pool).sort((a, b) => a.lx - b.lx)[0];
    const land = spot ? [spot.lx, spot.ly] : reach0[0];
    if (spot) sc.boats.push({ key: 'boat', x: center(spot.wx), y: center(spot.wy) + 46, t: 0, flip: spot.dx < 0 });
    const re = reachable(map, land[0], land[1]);
    // camps
    const nCamps = abyss ? 0 : isle && isle.kind === 'ruins' ? 2 : rivalKey ? 4 : storyIdx >= 0 && CHAPTERS[storyIdx].final ? 5 : Math.min(5, 2 + Math.floor(level / 4));
    const camps = [];
    const campSpots = reach0.filter(([x, y]) => re[map.i(x, y)] && dist(x, y, land[0], land[1]) > 9);
    for (let k = 0; k < 400 && camps.length < nCamps; k++) {
      const [x, y] = campSpots[Math.floor(r() * campSpots.length)] || [];
      if (x == null) break;
      if (camps.some(c => dist(c[0], c[1], x, y) < 8)) continue;
      camps.push([x, y]);
    }
    camps.sort((a, b) => dist(a[0], a[1], land[0], land[1]) - dist(b[0], b[1], land[0], land[1]));
    camps.forEach(([x, y], ci) => { // x,y may move to where the capital fits
      const isBossCamp = info.boss && !bounty && ci === camps.length - 1;
      let stype = (ci % 2 && region.camp2) ? region.camp2 : region.camp;
      if (rivalKey) stype = isBossCamp ? `${rivalKey}Castle` : [region.camp, region.camp2, region.camp3][ci % 3];
      // place the structure on free ground near the spot
      const sd = { fw: 3, fh: 1, ...((s => s && { fw: s.fw, fh: s.fh })(this.campDef(stype))) };
      let placed = false;
      for (let rr = 0; rr < 7 && !placed; rr++) for (let dy = -rr; dy <= rr && !placed; dy++) for (let dx = -rr; dx <= rr && !placed; dx++) {
        const cx = x + dx, cy = y + dy; let ok = true;
        for (let yy = cy; yy < cy + sd.fh; yy++) for (let xx = cx; xx < cx + sd.fw; xx++) if (!map.walkable(xx, yy) || map.stairAt(xx, yy) || map.kindAt(xx, yy) !== map.kindAt(x, y)) ok = false;
        if (ok && map.walkable(cx, cy + sd.fh)) { sc.addStruct(stype, cx, cy, ci, level); placed = true; }
      }
      if (!placed && rivalKey && isBossCamp) { // the capital castle must exist: search the whole island for room
        let best = null, bd = 1e9;
        for (const [qx, qy] of campSpots) {
          let ok = true;
          for (let yy = qy; yy < qy + sd.fh && ok; yy++) for (let xx = qx; xx < qx + sd.fw && ok; xx++) if (!map.walkable(xx, yy) || map.stairAt(xx, yy) || map.level(xx, yy) !== map.level(qx, qy)) ok = false;
          if (ok && map.walkable(qx, qy + sd.fh)) { const d = -dist(qx, qy, land[0], land[1]); if (d < bd) { bd = d; best = [qx, qy]; } }
        }
        if (best) { sc.addStruct(stype, best[0], best[1], ci, level); x = best[0] + 2; y = best[1] + 1; }
        else sc.addStruct(`${rivalKey}Tower`, x, y, ci, level);
      }
      const budget = rivalKey ? 2 + level * 0.45 : 1.6 + level * 0.85;
      let b = budget, i = 0;
      const pool = region.enemies.filter(k => !ENEMIES[k].boss && (ENEMIES[k].minLevel || 0) <= level);
      if (rivalKey && isBossCamp) b += 3;
      while (b > 0 && i < 14) {
        const k = pool[Math.floor(r() * pool.length)];
        const c = sc.nearestWalkable(x + Math.floor(r() * 5) - 2, y + 1 + Math.floor(r() * 3), 5);
        if (c) { const u = sc.addUnit(k, 1, center(c[0]), center(c[1]) + 8, { level, mode: 'guard', campId: ci }); u.home = { x: u.x, y: u.y }; }
        b -= ENEMIES[k].cost; i++;
      }
      if (isBossCamp) {
        const c = sc.nearestWalkable(x, y + 2, 5);
        const boss = sc.addUnit(region.boss, 1, center(c[0]), center(c[1]) + 8, { level, mode: 'guard', campId: ci, elite: true });
        boss.home = { x: boss.x, y: boss.y }; boss.isBoss = true; sc.boss = boss;
      }
    });
    if (rivalKey) this.buildSiege(sc, rivalKey, level, land);
    if (abyss) this.fillAbyss(sc, region, level, land, campSpots, r);
    // squad
    const squad = S.soldiers.filter(s => ids.includes(s.id));
    sc.squadTypes = squad.map(s => s.type);
    squad.forEach((rec, i) => {
      rec.status = 'away';
      const c = sc.nearestWalkable(land[0] + (i % 3), land[1] + Math.floor(i / 3) - 1) || land;
      const u = sc.addUnit(rec.type, 0, center(c[0]), center(c[1]) + 8, { rec, hp: rec.hp });
      u.home = { x: u.x, y: u.y };
    });
    for (const u of this.home.units) if (u.rec && ids.includes(u.rec.id)) { u.rec.hp = Math.round(u.hp); u.dead = true; this.home.selected.delete(u); }
    this.exp = sc; this.scene = sc;
    this.sfx('sail');
    this.ui.onSceneChange();
    this.save();
  }
  // 3.5 the Abyss: packs of monsters spread over the floor, and a boss every fifth floor
  fillAbyss(sc, region, level, land, spots, r) {
    const fl = sc.abyss, pool = region.enemies.filter(k => !ENEMIES[k].boss && (ENEMIES[k].minLevel || 0) <= level);
    let budget = 5 + fl * 1.7;
    const packs = [];
    for (let k = 0; k < 300 && packs.length < Math.min(7, 3 + Math.floor(fl / 3)); k++) {
      const s = spots[Math.floor(r() * spots.length)]; if (!s) break;
      if (packs.some(p => dist(p[0], p[1], s[0], s[1]) < 6)) continue; packs.push(s);
    }
    packs.sort((a, b) => dist(a[0], a[1], land[0], land[1]) - dist(b[0], b[1], land[0], land[1]));
    let i = 0;
    while (budget > 0 && packs.length && i < 60) {
      const p = packs[i % packs.length], k = pool[Math.floor(r() * pool.length)];
      const c = sc.nearestWalkable(p[0] + Math.floor(r() * 3) - 1, p[1] + Math.floor(r() * 3) - 1, 4);
      if (c) { const u = sc.addUnit(k, 1, center(c[0]), center(c[1]) + 8, { level, mode: 'guard', campId: i % packs.length, elite: fl >= 15 && r() < 0.2 }); u.home = { x: u.x, y: u.y }; }
      budget -= ENEMIES[k].cost; i++;
    }
    if (region.boss && packs.length) {
      const p = packs[packs.length - 1], c = sc.nearestWalkable(p[0], p[1] + 1, 5);
      if (c) { const b = sc.addUnit(region.boss, 1, center(c[0]), center(c[1]) + 8, { level, mode: 'guard', campId: packs.length - 1, elite: fl >= 10 }); b.home = { x: b.x, y: b.y }; b.isBoss = true; sc.boss = b; }
    }
  }
  // 3.4 sieges: a palisade ring with a gate around a rival's capital, towers at the front corners
  buildSiege(sc, key, level, land) {
    const m = sc.map, castle = sc.structs.find(s => s.type === `${key}Castle`); if (!castle) return;
    const lv = m.level(castle.cx, castle.cy);
    const x0 = castle.cx - 2, x1 = castle.cx + castle.fw + 1, y0 = castle.cy - 3, y1 = castle.cy + castle.fh + 1;
    const ring = [];
    for (let x = x0; x <= x1; x++) { ring.push([x, y0]); ring.push([x, y1]); }
    for (let y = y0 + 1; y < y1; y++) { ring.push([x0, y]); ring.push([x1, y]); }
    const ok = (x, y) => m.in(x, y) && m.walkable(x, y) && !m.stairAt(x, y) && m.level(x, y) === lv && !m.block[m.i(x, y)];
    const cells = ring.filter(([x, y]) => ok(x, y));
    if (cells.length < 8) return; // no room for a proper wall on this ground
    // the gate faces the landing
    const corner = ([x, y]) => (x === x0 || x === x1) && (y === y0 || y === y1);
    const gate = cells.filter(c => !corner(c)).sort((a, b) => dist(a[0], a[1], land[0], land[1]) - dist(b[0], b[1], land[0], land[1]))[0];
    for (const [x, y] of cells) sc.addStruct(gate && x === gate[0] && y === gate[1] ? `${key}Gate` : `${key}Wall`, x, y, castle.campId, level);
    for (const [tx, ty] of [[x0 - 2, y1 - 1], [x1 + 1, y1 - 1]]) if (ok(tx, ty) && ok(tx + 1, ty) && m.walkable(tx, ty + 1)) sc.addStruct(`${key}Tower`, tx, ty, castle.campId, level);
    // anyone standing where the wall went up steps aside
    for (const u of sc.units) { const cx = cellOf(u.x), cy = cellOf(u.y); if (m.block[m.i(cx, cy)]) { const c = sc.nearestWalkable(cx, cy, 4); if (c) { u.x = center(c[0]); u.y = center(c[1]) + 8; u.home = { x: u.x, y: u.y }; } } }
    sc.siege = true;
  }
  campDef(t) { return CAMP_STRUCTS[t]; }
  abyssHome() { const A = this.state.abyss; if (A) { A.depth = 1; A.runs = (A.runs || 0) + 1; } }
  expStatus() {
    const sc = this.exp; if (!sc) return null;
    const foes = sc.units.filter(u => u.team === 1 && u.alive).length;
    const squad = sc.units.filter(u => u.team === 0 && u.alive);
    return { camps: sc.structs.filter(s => !s.def.palisade).length, foes, squad, name: sc.islandName, region: sc.region.name, level: sc.level, boss: sc.boss };
  }
  checkExpedition() {
    const st = this.expStatus(); if (!st || this.exp.ended) return;
    if (!st.squad.length) return this.endExpedition('lost');
    if (!st.camps && !st.foes) return this.endExpedition('won');
  }
  endExpedition(result) {
    const sc = this.exp, S = this.state; if (!sc || sc.ended) return;
    sc.ended = true;
    const survivors = sc.units.filter(u => u.team === 0 && u.alive && u.rec);
    const summary = { result, name: sc.islandName, survivors: survivors.map(u => u.rec.name), fallen: [], loot: null, relic: null, gear: [] };
    if (result === 'won') {
      this.war.victory(this.exp);
      const lv = sc.level, mult = sc.bounty ? 2 : 1;
      const loot = { gold: Math.round((50 + lv * 28 + sc.expLoot) * mult), wood: Math.round((30 + lv * 18) * mult), meat: Math.round((25 + lv * 14) * mult) };
      if (sc.info.boss && !sc.bounty) { loot.gold += 150 + lv * 20; }
      if (sc.abyss) { for (const k in loot) loot[k] = Math.round(loot[k] * (1 + sc.abyss * 0.06)); }
      this.addAll(loot); summary.loot = loot;
      if (sc.info.boss && !sc.bounty && sc.region.bossRelic && !S.relics[sc.region.bossRelic]) { S.relics[sc.region.bossRelic] = true; summary.relic = sc.region.bossRelic; }
      if (sc.isle && sc.isle.kind === 'kingdom') { // a kingdom of the open sea bends the knee
        const W = S.world; W.conquered[sc.isle.id] = Date.now(); summary.conquered = sc.isle.kingdom.name;
        S.stats.kingdoms = (S.stats.kingdoms || 0) + 1; S.cleared++; this.kingdoms.onConquered(sc.isle);
        this.log(`${sc.isle.kingdom.name} of ${sc.isle.name} bent the knee.`, 'conquest');
      } else if (sc.isle) {
        S.world.cleared[sc.isle.id] = Date.now(); S.cleared++; S.frontier = Math.max(S.frontier, S.cleared + 1);
        if (sc.isle.kind === 'ruins') { S.fragments = (S.fragments || 0) + 1; summary.gear.push(this.dropGear(lv + 3, { quiet: true, min: 1, from: sc.islandName })); summary.fragment = true; }
      } else if (sc.rival) {
        const st = S.rivals[sc.rival], rv = rivalDef(sc.rival);
        st.subjugated = true; st.defeats++; st.tributeAt = Date.now();
        summary.rival = sc.rival;
        this.log(`${rv.name} bent the knee. ${rv.ruler} will pay tribute.`, 'conquest');
      } else if (sc.bounty) {
        S.daily.bounty = todayStr();
        const unowned = Object.keys(RELICS).filter(k => !S.relics[k] && !['trolltusk', 'minotaurhorn', 'bearpelt', 'pandabelt', 'turtleshell', 'rubberduck', ...['seacrown', 'harvestsickle', 'frostheart', 'springbloom', 'sunstone', 'moonstone']].includes(k));
        if (unowned.length && Math.random() < 0.35) { const k = unowned[Math.floor(Math.random() * unowned.length)]; S.relics[k] = true; summary.relic = k; }
      } else if (sc.abyss) {
        const A = S.abyss, fl = sc.abyss;
        A.best = Math.max(A.best || 0, fl); A.depth = fl + 1;
        summary.abyss = fl; summary.survivorIds = survivors.map(u => u.rec.id);
        summary.gear.push(this.dropGear(lv + 2, { quiet: true, min: fl >= 20 ? 2 : fl >= 8 ? 1 : 0, from: sc.islandName }));
        if (sc.info.boss) summary.gear.push(this.dropGear(lv + 4, { quiet: true, min: fl >= 15 ? 3 : 2, from: sc.islandName }));
        for (const u of survivors) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25); // a short rest between floors
        if (fl >= (S.stats.abyssBest || 0)) S.stats.abyssBest = fl;
        S.stats.abyssFloors = (S.stats.abyssFloors || 0) + 1;
        this.log(`Cleared floor ${fl} of the Abyss.`);
      } else if (sc.story >= 0) {
        const st = chapterState(S), ch = CHAPTERS[sc.story];
        st.done = Math.max(st.done, sc.story + 1);
        summary.story = sc.story;
        if (ch.final) {
          if (!S.relics.seacrown) { S.relics.seacrown = true; summary.relic = 'seacrown'; }
          summary.gear.push(this.dropGear(lv + 6, { quiet: true, rarity: 3, from: ch.name }));
        }
        this.log(`The Drowned Crown, chapter ${sc.story + 1}: ${ch.name} is won.`, 'story');
      } else if (!sc.rival && sc.n === S.frontier) { S.frontier++; S.cleared = Math.max(S.cleared, sc.n); }
      S.stats.voyagesWon = (S.stats.voyagesWon || 0) + 1;
      const squadTypes = sc.squadTypes || [];
      this.chal.note('voyage', { squad: squadTypes, lost: squadTypes.length - survivors.length });
      if (sc.rival || sc.info.boss) this.chal.note('boss', {});
      // gear: one piece per victory, more from bosses and capitals
      const big = sc.rival || (sc.info.boss && !sc.bounty);
      summary.gear.push(this.dropGear(lv, { quiet: true, from: sc.islandName }));
      if (big) summary.gear.push(this.dropGear(lv + 2, { quiet: true, min: 1, from: sc.islandName }));
      if (sc.bounty && Math.random() < 0.5) summary.gear.push(this.dropGear(lv + 1, { quiet: true, from: sc.islandName }));
      for (const u of survivors) this.grantXp(sc, u, 15 + lv * 2);
      // conquered land joins the realm: rival capitals and boss islands slam into your coast
      if (!sc.abyss && !(sc.isle && sc.isle.kind === 'ruins') && (sc.rival || (sc.info.boss && !sc.bounty)) && this.canAnnex()) {
        const rec = this.annex({ region: sc.rival ? 'rival' : sc.region.key, size: sc.rival ? 3 : 2 });
        if (rec) summary.province = provinceOf(sc.rival ? 'rival' : sc.region.key);
        if (rec) summary.annexed = true;
      }
      this.log(`Cleared ${sc.islandName}${summary.relic ? ' and claimed the ' + RELICS[summary.relic].name : ''}.`, summary.relic || sc.boss ? 'voyage' : null);
    } else if (result === 'lost') {
      if (sc.abyss) { S.abyss.depth = 1; S.abyss.runs = (S.abyss.runs || 0) + 1; }
      this.log(`The squad sent to ${sc.islandName} was lost.`);
    } else { if (sc.abyss) { S.abyss.depth = 1; S.abyss.runs = (S.abyss.runs || 0) + 1; } this.log(`Retreated from ${sc.islandName}.`); }
    // survivors climb back aboard the ship (4.0); with nobody left the ship drifts home on its own
    if (sc.fromSea && S.world) {
      for (const u of survivors) { u.rec.status = 'away'; u.rec.hp = Math.round(u.hp); u.rec.post = null; }
      S.world.crew = survivors.map(u => u.rec.id);
      summary.fromSea = true;
      if (!survivors.length) { S.world.fleet = { x: 0, y: 0 }; S.world.dest = null; summary.shipHome = true; this.sea.unloadHold(); }
    } else {
      for (const u of survivors) { u.rec.status = 'home'; u.rec.hp = Math.round(u.hp); u.rec.post = null; }
    }
    for (const rec of S.soldiers) if (rec.status === 'away' && !(S.world && S.world.crew.includes(rec.id))) { rec.status = 'home'; }
    for (const rec of S.soldiers) if (rec.status === 'home' && !this.home.units.some(u => u.rec === rec)) this.spawnSoldier(rec, true);
    this.exp = null; this.scene = this.home;
    this.sfx(result === 'won' ? 'victory' : result === 'lost' ? 'defeat' : 'sail');
    this.ui.onSceneChange();
    this.ui.expeditionResult(summary);
    this.save();
  }

  // ------------------------------------------------------------ annexed land (see src/annex.js for the API)
  homeCfg() { return HOME_CFG; }
  // The home tree layout: base forests (from the seed) plus each annexed chunk's forests, minus spots
  // under buildings or that would seal ground off. Depends only on terrain and buildings, so a live
  // merge and a reload agree. r continues the seed's sequence in buildHome.
  homeTreeSpots(map, parts, r = rng(this.state.seed + 1234)) {
    const h = this.home, live = map.block;
    map.block = new Uint16Array(live.length);
    for (const b of h.buildings) for (const [x, y] of b.cells()) if (map.in(x, y)) map.block[map.i(x, y)]++;
    const nearCastle = (x, y, d) => Math.abs(x - (CASTLE.x + 2)) < d + 2 && Math.abs(y - (CASTLE.y + 1)) < d;
    const inBase = () => [r.int(BASE_X + 4, BASE_X + BASE_W - 5), r.int(BASE_Y + 4, BASE_Y + BASE_H - 5)];
    const spots = Annex.forestSpots(map, r, 4, () => { const c = inBase(); return nearCastle(c[0], c[1], 6) ? null : c; }, () => r.int(9, 14), (x, y) => !nearCastle(x, y, 5));
    for (const p of parts) spots.push(...Annex.annexTreeSpots(map, p));
    const keep = spots.filter(t => map.block[map.i(t.x, t.y)] === 0);
    Annex.unsealTrees(map, h.nearestWalkable(CASTLE.x + 2, CASTLE.y + 2), keep);
    map.block = live;
    return keep;
  }
  canAnnex(opts) { return Annex.canAnnex(this, opts); }
  planAnnex(opts) { return Annex.planAnnex(this, opts); }
  annex(opts = {}) {
    // away on an expedition: queue it (saved) and slam it in when the player is home again
    if (!opts.instant && this.scene !== this.home) {
      const S = this.state; (S.annexPending = S.annexPending || []).push({ side: opts.side, size: opts.size, seed: opts.seed, region: opts.region });
      return { pending: true };
    }
    return Annex.annex(this, opts);
  }
  debugAnnex(opts = {}) {
    const o = { side: 'auto', seed: (Math.random() * 1e9) >>> 0, size: 1 + Math.floor(Math.random() * 3), ...opts };
    return this.annex(o) || (opts.size ? null : this.annex({ ...o, size: undefined }));
  }
  updateAnnex(dt) {
    if (this.slam) Annex.updateSlam(this, dt);
    const P = this.state.annexPending;
    if (!this.slam && P && P.length && this.scene === this.home && !this.exp) { const o = P.shift(); if (!this.annex(o) && !this.annex({ ...o, side: 'auto', size: undefined })) this.log('There was no room left in the sea for new land.'); }
  }
}
