// The Realm: persistent state, economy, pawn work, raids, expeditions, quests, saving.
import { T, generateIsland, rng, hashStr, reachable, boatSpots, K_LOW, K_WATER } from './terrain.js';
import { Scene, Unit, Building, cellOf } from './world.js';
import {
  UNITS, ENEMIES, BUILDINGS, TIERS, TRAITS, COMMON_TRAITS, XP_LEVELS, MAX_LEVEL, RELICS, REGIONS,
  islandInfo, FIRST_NAMES, EPITHETS, QUESTS, endlessQuest, renownCost, RENOWN_BONUS,
  maxBuildingLevel, upgradeCost, upgradeTime, levelHp, levelEffects, castlePop,
} from './data.js';
import { EventDirector } from './events.js';
import { SHEETS } from './assets.js';
import { audio } from './audio.js';
import { Environment } from './env.js';

const SAVE_KEY = 'tinyrealm.save.v1';
const HOME_W = 46, HOME_H = 34;
const MAP_VERSION = 2; // bump when island generation changes so saves get migrated
const CASTLE = { x: 20, y: 14, w: 5, h: 2 };
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
    timers: { raid: 330, minor: 150, major: 1500 },
    daily: { last: '', streak: 0, bounty: '' },
    log: [], introSeen: false,
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
  }

  // ------------------------------------------------------------ persistence
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
    const fresh = !s;
    this.state = Object.assign(freshState(), s || {});
    this.state.stats = Object.assign(freshState().stats, this.state.stats || {});
    this.state.timers = Object.assign(freshState().timers, this.state.timers || {});
    this.state.daily = Object.assign(freshState().daily, this.state.daily || {});
    // a voyage interrupted by closing the app counts as a retreat
    for (const rec of this.state.soldiers) if (rec.status === 'away') { rec.status = 'home'; rec.post = null; }
    if (this.state.timers.raid < 60) this.state.timers.raid = 60;
    this.buildHome();
    const away = fresh ? 0 : this.applyOffline();
    this.scene = this.home;
    this.checkDaily();
    return { fresh, away };
  }
  save() {
    if (!this.state) return;
    this.syncState();
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
    S.buildings = h.buildings.map(b => ({ type: b.type, cx: b.cx, cy: b.cy, hp: Math.round(b.hp), maxHp: b.maxHp, buildEnd: b.buildEnd, buildTotal: b.buildTotal, variant: b.variant, queue: b.queue, level: b.level, upEnd: b.upEnd, upTotal: b.upTotal }));
    S.trees = h.trees.map(t => ({ wood: t.wood, regrow: t.regrow }));
    S.golds = h.golds.map(g => ({ cx: g.cx, cy: g.cy, amount: Math.round(g.amount) }));
    S.sheep = h.sheep.filter(s => !s.caught).length;
    for (const u of h.units) if (u.rec && u.alive) { u.rec.hp = Math.round(u.hp); u.rec.post = { x: Math.round(u.home.x), y: Math.round(u.home.y) }; }
  }

  // ------------------------------------------------------------ feedback
  sfx(name, pos, scene) { if (scene && scene !== this.scene) return; audio.play(name, pos); }
  shake(n, scene) { if (scene && scene !== this.scene) return; this.shakeAmt = Math.min(14, Math.max(this.shakeAmt || 0, n)); }

  // ------------------------------------------------------------ bonuses
  bonus() {
    const R = this.state.relics, rn = this.state.renown;
    return {
      hp: (R.minotaurhorn ? 0.1 : 0) + rn * RENOWN_BONUS.power,
      dmg: rn * RENOWN_BONUS.power,
      meleeDmg: R.trolltusk ? 0.1 : 0,
      rangedDmg: R.sharktooth ? 0.1 : 0,
      atkSpeed: R.pandabelt ? 0.05 : 0,
      towerDmg: R.boneidol ? 0.25 : 0,
      gather: rn * RENOWN_BONUS.gather + (R.rubberduck ? 0.05 : 0),
      gold: R.goldenacorn ? 0.1 : 0,
      wood: R.bearpelt ? 0.1 : 0,
      castleHp: R.turtleshell ? 0.2 : 0,
    };
  }
  get tierDef() { return TIERS[this.state.tier]; }
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
  log(text) { this.state.log.unshift({ t: Date.now(), text }); this.state.log.length = Math.min(this.state.log.length, 60); }

  // ------------------------------------------------------------ home island
  buildHome() {
    const S = this.state;
    const migrate = S.buildings && S.mapVer !== MAP_VERSION;
    if (migrate) { S.trees = null; S.golds = null; S.goldRespawns = []; for (const rec of S.soldiers) rec.post = null; }
    const map = generateIsland({ w: HOME_W, h: HOME_H, seed: S.seed, plateaus: 6, highs: 2, reserve: { x: CASTLE.x - 1, y: CASTLE.y - 1, w: CASTLE.w + 2, h: CASTLE.h + 4 }, colors: [1, 3, 2], landFrac: 0.6 });
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
    const free = (x, y, pad = 0) => {
      for (let oy = -pad; oy <= pad; oy++) for (let ox = -pad; ox <= pad; ox++) {
        const k = map.kindAt(x + ox, y + oy);
        if (k === K_WATER || map.block[map.i(x + ox, y + oy)] || map.stairAt(x + ox, y + oy)) return false;
      }
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (map.stairAt(x + ox, y + oy)) return false;
      return map.ground(x, y) && !map.isCliff(x, y + 1);
    };
    const nearCastle = (x, y, d) => Math.abs(x - (CASTLE.x + 2)) < d + 2 && Math.abs(y - (CASTLE.y + 1)) < d;
    const treeSpots = [];
    const forests = [];
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 50; k++) {
        const fx = r.int(4, HOME_W - 5), fy = r.int(4, HOME_H - 5);
        if (map.isLand(fx, fy) && !nearCastle(fx, fy, 6) && forests.every(f => dist(f[0], f[1], fx, fy) > 8)) { forests.push([fx, fy]); break; }
      }
    }
    for (const [fx, fy] of forests) {
      const n = r.int(9, 14);
      for (let k = 0; k < n * 4 && treeSpots.filter(t => t.f === fx).length < n; k++) {
        const x = fx + r.int(-3, 3), y = fy + r.int(-3, 3);
        if (free(x, y) && !nearCastle(x, y, 5) && !treeSpots.some(t => t.x === x && t.y === y)) { treeSpots.push({ x, y, f: fx }); map.block[map.i(x, y)]++; }
      }
    }
    // drop any tree that seals off walkable ground (plateaus, nooks) from the castle
    const door0 = h.nearestWalkable(CASTLE.x + 2, CASTLE.y + 2);
    for (let pass = 0; pass < 4; pass++) {
      const re = reachable(map, door0[0], door0[1]);
      const sealed = (x, y) => map.walkable(x, y) && !re[map.i(x, y)];
      const keep = [];
      let removed = 0;
      for (const t of treeSpots) {
        let bad = false;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (sealed(t.x + ox, t.y + oy)) bad = true;
        if (bad) { map.block[map.i(t.x, t.y)]--; removed++; } else keep.push(t);
      }
      treeSpots.length = 0; treeSpots.push(...keep);
      if (!removed) break;
    }
    for (const t of treeSpots) map.block[map.i(t.x, t.y)]--;
    // validate: every tree must leave the castle reachable (avoid sealing paths)
    treeSpots.forEach((t, i) => {
      const saved = S.trees && S.trees[i];
      h.addTree(t.x, t.y, { v: 1 + ((t.x * 7 + t.y * 13) % 4), wood: saved ? saved.wood : 25, regrow: saved ? saved.regrow : 0 });
    });
    if (S.golds) for (const g of S.golds) h.addGold(g.cx, g.cy, { amount: g.amount });
    else {
      let placedG = 0;
      for (let k = 0; k < 300 && placedG < 7; k++) {
        const x = r.int(4, HOME_W - 5), y = r.int(4, HOME_H - 5);
        if (free(x, y, 1) && !nearCastle(x, y, 5)) { h.addGold(x, y, { amount: 120 }); placedG++; if (free(x + 1, y, 0) && placedG < 7) { h.addGold(x + 1, y + (r.chance(0.5) ? 0 : 1) * 0, { amount: 120 }); placedG++; } }
      }
    }
    this.goldZones = h.golds.map(g => [g.cx, g.cy]);
    // pasture for sheep
    this.pasture = null;
    for (let k = 0; k < 200 && !this.pasture; k++) {
      const x = r.int(5, HOME_W - 6), y = r.int(5, HOME_H - 6);
      if (map.kindAt(x, y) === K_LOW && free(x, y, 1) && !nearCastle(x, y, 4) && dist(x, y, CASTLE.x, CASTLE.y) < 14) this.pasture = [x, y];
    }
    if (!this.pasture) this.pasture = [CASTLE.x + 2, CASTLE.y + 5];
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
    if (migrate) this.migrated = true;
    S.mapVer = MAP_VERSION;
    this.shore = boatSpots(map, this.reach);
    // people
    for (let i = 0; i < S.pawns; i++) this.spawnPawn(true);
    for (const rec of S.soldiers) if (rec.status === 'home') this.spawnSoldier(rec, true);
  }
  spawnSheep(x, y) {
    const [px, py] = this.pasture;
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
    const avatar = avKind.startsWith('h') ? 'av_' + avKind : `av_${avKind}1`;
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
    if (u.hidden) { u.hidden = false; const c = scene.nearestWalkable(this.door[0], this.door[1]); u.x = center(c[0]) + (Math.random() - 0.5) * 30; u.y = center(c[1]) + 8; u.stop(); }
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
        if (!u.setPath(center(u.node.cx), center(u.node.cy), scene.adjacentGoal([[u.node.cx, u.node.cy]]))) { u.node.tried = u.id; this.releaseNode(u); return; }
        u.task = 'go';
      }
      if (u.task === 'go') { if (u.stepPath(dt)) { u.task = 'work'; u.workT = job === 'wood' ? 3.2 : 3.6; } return; }
      if (u.task === 'work') {
        u.working = true; u.flip = center(u.node.cx) < u.x;
        if (job === 'wood' && Math.random() < dt * 2) u.node.shake = 0.2;
        u.sndT = (u.sndT || 0) - dt;
        if (u.sndT <= 0) { u.sndT = 0.6; this.sfx(job === 'wood' ? 'chop' : 'mine', u, scene); }
        u.workT -= dt;
        if (u.workT <= 0) {
          u.working = false;
          const take = job === 'wood' ? Math.min(5, u.node.wood) : Math.min(5, u.node.amount);
          let n = take * (1 + gb.gather + (job === 'gold' ? gb.gold : gb.wood) + this.env.gather(job));
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
          u.carry = 'Meat'; u.carryN = Math.round(8 * (1 + gb.gather + this.env.gather('meat'))); u.task = null;
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
  idleWander(scene, u, dt) {
    u.working = false;
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
    if (type === 'wall') return 30 + this.state.tier * 30;
    if (type === 'gate') return 1 + this.state.tier;
    return this.tierDef.limits[type] ?? 99;
  }
  // ---- walls and gates (3.0)
  canPlaceWall(x, y, type = 'wall') {
    const m = this.home.map, h = this.home;
    if (type === 'gate') { const w = h.wallAt(x, y); if (w && w.type === 'wall') return true; }
    if (!m.ground(x, y) || m.stairAt(x, y) || m.block[m.i(x, y)]) return false;
    if (m.isCliff(x, y + 1) && false) return false;
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
      if (this.countOf(type) >= this.limitFor(type)) { this.ui.toast('Your castle must grow before you can build more of these.', 'red'); break; }
      if (!this.canPlaceWall(x, y, type)) { blocked++; continue; }
      if (!this.canAfford(d.cost)) { this.ui.toast('Ran out of wood.', 'red'); break; }
      this.pay(d.cost);
      const old = this.home.wallAt(x, y);
      if (old) this.home.removeBuilding(old);
      const b = this.home.addBuilding(type, x, y, { buildEnd: Date.now() + d.time * 1000, buildTotal: d.time });
      b.pop = 1; n++;
    }
    this.home.wallMap = null;
    this.reach = reachable(this.home.map, this.door[0], this.door[1]);
    if (n) { this.sfx('place'); this.home.fxAt('dust2', center(cells[0][0]), center(cells[0][1]) + 20); }
    this.save();
    return n ? null : (blocked ? 'That spot is blocked.' : 'Nothing was built.');
  }
  breachTarget(scene, u) {
    let best = null, bd = 1e9;
    for (const w of scene.walls().values()) { if (!w.alive) continue; const d = u.distTo(w) + (w.def.gate ? -30 : 0); if (d < bd) { bd = d; best = w; } }
    return best;
  }
  countOf(type) { return this.home.buildings.filter(b => b.type === type).length; }
  canPlace(type, cx, cy) {
    const d = BUILDINGS[type], m = this.home.map;
    let lvl = null;
    for (let y = cy; y < cy + d.fh; y++) for (let x = cx; x < cx + d.fw; x++) {
      if (!m.ground(x, y) || m.stairAt(x, y) || m.block[m.i(x, y)]) return false;
      if (m.isCliff(x, y + 1) && y === cy + d.fh - 1) return false;
      const l = m.level(x, y); if (lvl === null) lvl = l; else if (l !== lvl) return false;
    }
    // building art is taller than its footprint: keep the drawn areas from overlapping
    const vis = (t, x, y) => {
      const dd = BUILDINGS[t]; const s = SHEETS[dd.img || dd.imgs[0]];
      const extra = Math.max(0, Math.ceil(((s && s.fh) || 192) / T) - dd.fh - 1);
      return { x0: x, x1: x + dd.fw - 1, y0: y - extra, y1: y + dd.fh - 1 };
    };
    const me = vis(type, cx, cy);
    for (const b of this.home.buildings) {
      const o = vis(b.type, b.cx, b.cy);
      if (me.x0 <= o.x1 && me.x1 >= o.x0 && me.y0 <= o.y1 && me.y1 >= o.y0) return false;
    }
    // an open row in front so the door stays reachable
    let open = false;
    for (let x = cx; x < cx + d.fw; x++) if (m.walkable(x, cy + d.fh) && m.level(x, cy + d.fh) === lvl) open = true;
    if (!open) return false;
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
    if (this.countOf(type) >= this.limitFor(type)) return 'Your castle must grow before you can build more of these.';
    if (!this.canPlace(type, cx, cy)) return 'That spot is blocked.';
    if (!this.pay(d.cost)) return 'Not enough resources.';
    const b = this.home.addBuilding(type, cx, cy, { buildEnd: Date.now() + d.time * 1000, buildTotal: d.time, variant: Math.floor(Math.random() * 3) });
    b.hp = b.maxHp; b.pop = 1;
    this.home.fxAt('dust2', b.x, b.y, { scale: 1.6 });
    this.sfx('place'); this.shake(3);
    this.reach = reachable(this.home.map, this.door[0], this.door[1]);
    if (this.state.jobs.build === 0 && this.state.pawns > 1 && !this.buildTipShown) { this.buildTipShown = true; this.ui.toast('Tip: assign a pawn to Build in Workers to raise it faster.'); }
    this.save();
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
  trainTime(b, unit) { const e = levelEffects(b.type, b.level); return Math.round(UNITS[unit].time * (e.speed || 1)); }
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
    if (b.level >= max) return { msg: `Grow the castle to upgrade further.`, tierCap: true };
    if (!this.canAfford(upgradeCost(b.type, b.level))) return { msg: 'Not enough resources.' };
    return null;
  }
  upgradeBuilding(b) {
    const block = this.upgradeBlock(b); if (block) return block.msg;
    this.pay(upgradeCost(b.type, b.level));
    b.upTotal = upgradeTime(b.type, b.level); b.upEnd = Date.now() + b.upTotal * 1000;
    this.home.fxAt('dust2', b.x, b.y, { scale: 1.8 });
    this.sfx('build');
    this.save(); return null;
  }
  finishBuildingUpgrade(b, quiet) {
    b.upEnd = 0; b.upTotal = 0; b.level++;
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
    if (!quiet) { this.ui.toast(`${rec.name} the ${UNITS[q.unit].name} is ready.`); this.sfx('ready'); this.home.fxAt('dust1', center(c[0]), center(c[1]) + 8); }
    this.log(`${rec.name} joined as ${/^[AEIOU]/.test(UNITS[q.unit].name) ? 'an' : 'a'} ${UNITS[q.unit].name}.`);
  }
  upgradeCastle() {
    const S = this.state;
    if (S.upgradeEnd) return 'Already upgrading.';
    if (S.tier >= 5) {
      const cost = renownCost(S.renown);
      if (!this.pay(cost)) return 'Not enough resources.';
      S.renown++; this.ui.toast(`Your Renown rises to rank ${S.renown}.`); this.log(`Renown rank ${S.renown} reached.`);
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
    this.log(`The realm grew into a ${TIERS[S.tier].name}.`);
    this.castle.pop = 1;
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
    if (S.upgradeEnd && now >= S.upgradeEnd) report.done.push('Castle upgrade finished');
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
        if (!quiet) { this.ui.toast(`${BUILDINGS[b.type].name} completed.`); h.fxAt('dust2', b.x, b.y, { scale: 1.8 }); this.sfx('complete'); }
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

  // ------------------------------------------------------------ daily
  checkDaily() {
    const D = this.state.daily, today = todayStr();
    if (D.last === today) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    D.streak = D.last === todayStr(y) ? D.streak + 1 : 1;
    D.last = today;
    const mult = 1 + Math.min(D.streak - 1, 6) * 0.25;
    const base = 40 + this.state.tier * 40;
    const gift = { gold: Math.round(base * mult), wood: Math.round(base * mult), meat: Math.round(base * 0.8 * mult) };
    for (const k in gift) gift[k] = this.addRes(k, gift[k]);
    this.pendingDaily = { streak: D.streak, gift };
  }

  // ------------------------------------------------------------ main tick
  update(dt) {
    const S = this.state;
    if (this.exp) { const n = this.speed === 2 ? 2 : 1; for (let k = 0; k < n; k++) this.exp.update(dt); } // battle speed only speeds up the voyage
    this.home.update(dt);
    this.env.update(dt);
    this.tickTimersT = (this.tickTimersT || 0) - dt;
    if (this.tickTimersT <= 0) { this.tickTimersT = 0.5; this.tickTimers(false); this.checkDaily(); }
    // sheep breed
    this.sheepT = (this.sheepT || 0) + dt;
    if (this.env.breed() > 0 && this.sheepT > 35 / this.env.breed()) { this.sheepT = 0; if (this.home.sheep.length < this.maxSheep()) this.spawnSheep(); }
    // soldiers mend at home when no fighting
    this.regenT += dt;
    if (this.regenT > 1) {
      this.regenT = 0;
      const calm = !this.raid || !this.raid.active;
      for (const u of this.home.units) if (u.rec && u.alive && calm && !u.target) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.03);
      for (const b of this.home.buildings) if (b.done && calm && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * (b.ruined ? 0.004 : 0.006));
      if (this.castle.hp <= 0) this.castle.hp = 1;
    }
    this.updateRaid(dt);
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
      S.timers.raid -= dt;
      if (S.timers.raid <= 45 && !this.raidWarned) {
        this.raidWarned = true;
        this.pendingRaid = this.planRaid();
        this.ui.banner('Raiders sighted', `${this.pendingRaid.region.name} raiders approach from the ${this.pendingRaid.dir}. They land in 45 seconds.`, 'red');
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
    const region = opts.region || REGIONS[Math.floor(Math.random() * unlocked)];
    const days = (Date.now() - S.created) / 86400000;
    const budget = opts.budget ?? (3 + S.tier * 2.5 + S.stats.raidsSurvived * 0.7 + Math.min(days, 60) * 0.25 + S.renown * 2);
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
      const enemies = region.enemies.filter(k => !ENEMIES[k].boss && !(ENEMIES[k].caster && S.tier < 3) && (ENEMIES[k].minLevel || 0) <= level + 1);
      if (S.tier >= 2 && Math.random() < 0.35) queue.push({ type: 'thief', si: 0 });
      while (b > 0 && i < 40) {
        const k = enemies[Math.floor(Math.random() * enemies.length)];
        queue.push({ type: k, si: i++ });
        b -= ENEMIES[k].cost;
      }
    }
    return { kind, region, level, spawns, queue, dir, gap: opts.gap };
  }
  showBoat(plan) {
    this.home.boats = plan.spawns.map(s => ({ key: plan.region.key === 'reef' ? 'seahorse' : 'boat', x: center(s.wx), y: center(s.wy) + (plan.region.key === 'reef' ? 30 : 46), t: 0, flip: s.wx > s.lx }));
  }
  startRaid(plan, opts = {}) {
    this.pendingRaid = null; this.raidWarned = false;
    this.state.timers.raid = 480 + Math.random() * 360;
    if (!this.home.boats.length && plan.spawns[0] && !plan.spawns[0].ground) this.showBoat(plan);
    this.raid = { id: Math.random(), active: true, t: 0, spawnT: 0, queue: plan.queue.slice(), units: [], spawns: plan.spawns, level: plan.level, kind: plan.kind, gap: plan.gap, onEnd: opts.onEnd, title: opts.title || 'Raid', loot: 0, region: plan.region };
    if (!opts.silent) this.sfx('horn');
    if (!opts.silent) this.ui.banner(opts.title || 'To arms!', opts.text || 'Raiders are landing. Pawns are taking shelter in the castle.', 'red');
    for (const u of this.home.units) if (u.kind === 'pawn') { u.task = null; this.releaseNode(u); }
  }
  endRaid(won) {
    const R = this.raid; if (!R || !R.active) return;
    R.active = false;
    const S = this.state;
    if (won) {
      S.stats.raidsSurvived++;
      const reward = Math.round(R.loot + 20 + R.level * 6);
      this.addRes('gold', reward);
      this.sfx('victory');
      this.ui.banner(R.kind === 'raid' ? 'Raid repelled' : R.title + ' survived', `The raiders are beaten. You recover ${reward} gold from the field.`, 'blue');
      this.log(`Repelled a ${R.region ? R.region.name : ''} raid. +${reward} gold.`);
    }
    if (R.onEnd) R.onEnd(won);
    this.raid = null;
    this.home.boats = [];
    this.state.timers.raid = 480 + Math.random() * 360;
    this.assignJobs();
    this.save();
  }
  loseRaid() {
    const R = this.raid; if (!R || !R.active) return;
    const S = this.state;
    const lost = {};
    for (const r of ['gold', 'wood', 'meat']) { lost[r] = Math.floor(S.res[r] * 0.25); S.res[r] -= lost[r]; }
    S.stats.raidsLost++;
    for (const u of R.units) if (u.alive) { u.leaving = true; u.target = null; }
    this.sfx('defeat'); this.shake(10);
    this.ui.banner('The castle has fallen', `Raiders plundered ${lost.gold} gold, ${lost.wood} wood and ${lost.meat} meat, then sailed off. The walls will mend.`, 'red');
    this.log(`The castle fell to raiders. Lost a quarter of stores.`);
    R.active = false;
    if (R.onEnd) R.onEnd(false);
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
      S.stats.kills++;
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
      if (rec.type === 'king') {
        rec.status = 'wounded'; rec.woundedUntil = Date.now() + 30 * 60000; rec.hp = undefined;
        this.ui.banner('The King has fallen wounded', 'He is carried home to recover for 30 minutes.', 'red');
        this.log(`${rec.name} was wounded.`);
        return;
      }
      S.soldiers = S.soldiers.filter(s => s !== rec);
      const where = scene === this.home ? 'defending the realm' : `on ${scene.islandName}`;
      const killer = src && src.def ? (src.def.name || 'a monster') : 'unknown hands';
      S.fallen.unshift({ name: rec.name, type: rec.type, level: rec.level, kills: rec.kills, avatar: rec.avatar, traits: rec.traits, where, killer, date: Date.now() });
      S.fallen.length = Math.min(S.fallen.length, 100);
      this.ui.toast(`${rec.name} has fallen ${where}.`, 'red');
      this.log(`${rec.name} (level ${rec.level}, ${rec.kills} kills) fell ${where}, slain by ${killer}.`);
    }
  }
  grantXp(scene, u, xp) {
    const rec = u.rec; if (!rec || rec.level >= MAX_LEVEL) return;
    rec.xp += xp * ((u.xpMul || 1) + this.env.xpMul());
    let up = false;
    while (rec.level < MAX_LEVEL && rec.xp >= XP_LEVELS[rec.level + 1]) {
      rec.level++; up = true;
      if (rec.level % 3 === 0 && rec.traits.length < 4) {
        const options = COMMON_TRAITS.filter(t => !rec.traits.includes(t));
        const t = options[Math.floor(Math.random() * options.length)];
        rec.traits.push(t);
        this.ui.toast(`${rec.name} gained the ${TRAITS[t].name} trait.`);
      }
    }
    if (up) {
      const f = u.hp / u.maxHp; u.applyStats(); u.hp = Math.min(u.maxHp, u.maxHp * f + u.maxHp * 0.2);
      scene.floatText('Level ' + rec.level, u.x, u.y - 90, '#ffe066');
      scene.fxAt('healFx', u.x, u.y, {}); this.sfx('levelup', u, scene);
    }
  }
  onBuildingDown(scene, b, src) {
    if (b === this.castle) { this.loseRaid(); return; }
    if (b.def.wall) { // fences splinter and are gone
      scene.removeBuilding(b); scene.fxAt('dust2', b.x, b.y);
      this.reach = reachable(scene.map, this.door[0], this.door[1]);
      return;
    }
    this.ui.toast(`Your ${BUILDINGS[b.type].name} is in ruins. Builders can restore it.`, 'red');
  }
  onStructDown(scene, s) {
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
    const info = islandInfo(n);
    const seed = bounty ? hashStr('bounty' + todayStr()) : hashStr('isle' + n + 'x' + S.seed);
    const region = bounty ? REGIONS[seed % REGIONS.length] : info.region;
    const level = bounty ? Math.max(2, info.level + 1) : info.level;
    const map = generateIsland({ w: 40, h: 30, seed, plateaus: 5, highs: 2, colors: region.colors, landFrac: 0.55 });
    const sc = new Scene(this, 'expedition', map, seed);
    sc.islandName = bounty ? 'the Bounty Isle' : info.name; sc.info = info; sc.region = region; sc.level = level; sc.bounty = !!bounty; sc.n = n;
    sc.expLoot = 0;
    const r = rng(seed + 5);
    // landing on the west shore, boat floating clear of the coast
    const reach0 = [];
    for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) if (map.kindAt(x, y) === K_LOW) reach0.push([x, y]);
    const spots = boatSpots(map, null).filter(b => b.dx === -1);
    const spot = (spots.length ? spots : boatSpots(map, null)).sort((a, b) => a.lx - b.lx)[0];
    const land = spot ? [spot.lx, spot.ly] : reach0[0];
    if (spot) sc.boats.push({ key: 'boat', x: center(spot.wx), y: center(spot.wy) + 46, t: 0, flip: spot.dx < 0 });
    const re = reachable(map, land[0], land[1]);
    // camps
    const nCamps = Math.min(5, 2 + Math.floor(level / 4));
    const camps = [];
    const campSpots = reach0.filter(([x, y]) => re[map.i(x, y)] && dist(x, y, land[0], land[1]) > 9);
    for (let k = 0; k < 400 && camps.length < nCamps; k++) {
      const [x, y] = campSpots[Math.floor(r() * campSpots.length)] || [];
      if (x == null) break;
      if (camps.some(c => dist(c[0], c[1], x, y) < 8)) continue;
      camps.push([x, y]);
    }
    camps.sort((a, b) => dist(a[0], a[1], land[0], land[1]) - dist(b[0], b[1], land[0], land[1]));
    camps.forEach(([x, y], ci) => {
      const isBossCamp = info.boss && !bounty && ci === camps.length - 1;
      const stype = (ci % 2 && region.camp2) ? region.camp2 : region.camp;
      // place the structure on free ground near the spot
      const sd = { fw: 3, fh: 1, ...((s => s && { fw: s.fw, fh: s.fh })(this.campDef(stype))) };
      let placed = false;
      for (let rr = 0; rr < 4 && !placed; rr++) for (let dy = -rr; dy <= rr && !placed; dy++) for (let dx = -rr; dx <= rr && !placed; dx++) {
        const cx = x + dx, cy = y + dy; let ok = true;
        for (let yy = cy; yy < cy + sd.fh; yy++) for (let xx = cx; xx < cx + sd.fw; xx++) if (!map.walkable(xx, yy) || map.stairAt(xx, yy) || map.kindAt(xx, yy) !== map.kindAt(x, y)) ok = false;
        if (ok && map.walkable(cx, cy + sd.fh)) { sc.addStruct(stype, cx, cy, ci, level); placed = true; }
      }
      const budget = 1.6 + level * 0.85;
      let b = budget, i = 0;
      const pool = region.enemies.filter(k => !ENEMIES[k].boss && (ENEMIES[k].minLevel || 0) <= level);
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
    // squad
    const squad = S.soldiers.filter(s => ids.includes(s.id));
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
  campDef(t) { return { goblinHut: { fw: 2, fh: 1 }, gnomeHut: { fw: 2, fh: 1 }, gnomeTower: { fw: 2, fh: 1 }, cave: { fw: 2, fh: 1 }, fishHut: { fw: 2, fh: 1 }, pirateTower: { fw: 2, fh: 1 }, skullSpike: { fw: 1, fh: 1 }, deadTree: { fw: 2, fh: 1 } }[t]; }
  expStatus() {
    const sc = this.exp; if (!sc) return null;
    const foes = sc.units.filter(u => u.team === 1 && u.alive).length;
    const squad = sc.units.filter(u => u.team === 0 && u.alive);
    return { camps: sc.structs.length, foes, squad, name: sc.islandName, region: sc.region.name, level: sc.level, boss: sc.boss };
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
    const summary = { result, name: sc.islandName, survivors: survivors.map(u => u.rec.name), fallen: [], loot: null, relic: null };
    if (result === 'won') {
      const lv = sc.level, mult = sc.bounty ? 2 : 1;
      const loot = { gold: Math.round((50 + lv * 28 + sc.expLoot) * mult), wood: Math.round((30 + lv * 18) * mult), meat: Math.round((25 + lv * 14) * mult) };
      if (sc.info.boss && !sc.bounty) { loot.gold += 150 + lv * 20; }
      this.addAll(loot); summary.loot = loot;
      if (sc.info.boss && !sc.bounty && !S.relics[sc.region.bossRelic]) { S.relics[sc.region.bossRelic] = true; summary.relic = sc.region.bossRelic; }
      if (sc.bounty) {
        S.daily.bounty = todayStr();
        const unowned = Object.keys(RELICS).filter(k => !S.relics[k] && !['trolltusk', 'minotaurhorn', 'bearpelt', 'pandabelt', 'turtleshell', 'rubberduck'].includes(k));
        if (unowned.length && Math.random() < 0.35) { const k = unowned[Math.floor(Math.random() * unowned.length)]; S.relics[k] = true; summary.relic = k; }
      } else if (sc.n === S.frontier) { S.frontier++; S.cleared = Math.max(S.cleared, sc.n); }
      for (const u of survivors) this.grantXp(sc, u, 15 + lv * 2);
      this.log(`Cleared ${sc.islandName}${summary.relic ? ' and claimed the ' + RELICS[summary.relic].name : ''}.`);
    } else if (result === 'lost') {
      this.log(`The squad sent to ${sc.islandName} was lost.`);
    } else this.log(`Retreated from ${sc.islandName}.`);
    // bring survivors home
    for (const u of survivors) { u.rec.status = 'home'; u.rec.hp = Math.round(u.hp); u.rec.post = null; }
    for (const rec of S.soldiers) if (rec.status === 'away') { rec.status = 'home'; }
    for (const rec of S.soldiers) if (rec.status === 'home' && !this.home.units.some(u => u.rec === rec)) this.spawnSoldier(rec, true);
    this.exp = null; this.scene = this.home;
    this.sfx(result === 'won' ? 'victory' : result === 'lost' ? 'defeat' : 'sail');
    this.ui.onSceneChange();
    this.ui.expeditionResult(summary);
    this.save();
  }
}
