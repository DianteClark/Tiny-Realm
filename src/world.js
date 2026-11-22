// Scenes hold a map plus every live object on it, run the AI and draw it all.
import { SHEETS, drawSprite, animDuration } from './assets.js';
import { T, findPath, TerrainChunks, foamCells, rng, K_WATER } from './terrain.js';
import { UNITS, ENEMIES, BUILDINGS, CAMP_STRUCTS, TRAITS, levelEffects, ABILITIES } from './data.js';

const WATER = '#47aba9';
let NEXT_ID = 1;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const cellOf = v => Math.floor(v / T);
const center = c => c * T + T / 2;

// ---------------------------------------------------------------- Unit
export class Unit {
  constructor(scene, type, team, x, y, opts = {}) {
    this.id = NEXT_ID++;
    this.scene = scene; this.type = type; this.team = team;
    this.x = x; this.y = y;
    this.def = team === 0 ? UNITS[type] : ENEMIES[type];
    this.kind = team === 1 ? 'enemy' : (type === 'pawn' ? 'pawn' : 'soldier');
    this.anim = team === 0 ? this.def.anim : (this.def.anim || type);
    this.rec = opts.rec || null;
    this.level = opts.level || 1;
    this.state = 'idle';
    this.path = null; this.pathT = 0; this.atkT = 0; this.atkAnim = -1; this.hitDone = false;
    this.flip = false; this.animT = Math.random() * 3; this.moving = false;
    this.target = null; this.order = null; this.home = { x, y };
    this.cursed = 0; this.flash = 0; this.hidden = false; this.dead = false;
    this.ox = (Math.random() - 0.5) * 18; this.oy = (Math.random() - 0.5) * 14;
    this.campId = opts.campId ?? null; this.mode = opts.mode || 'guard';
    this.charged = true;
    this.buffs = {}; this.abT = 0; this.trampled = new Set();
    this.applyStats(opts);
    this.hp = opts.hp != null ? Math.min(opts.hp, this.maxHp) : this.maxHp;
  }
  applyStats(opts = {}) {
    const d = this.def;
    const B = this.scene.bonus ? this.scene.bonus() : {};
    let hp = d.hp, dmg = d.dmg || d.heal || 0, speed = d.speed, cd = d.cd || 1, range = d.range || 1, armor = d.armor || 0, dodge = 0;
    this.bigDmg = d.bigBonus || 0; this.killHeal = 0; this.xpMul = 1;
    if (this.team === 0 && this.rec) {
      const lv = this.rec.level - 1;
      hp *= 1 + lv * 0.08; dmg *= 1 + lv * 0.08;
      for (const k of this.rec.traits) {
        const t = TRAITS[k]; if (!t) continue;
        hp *= 1 + (t.hp || 0); dmg *= 1 + (t.dmg || 0); speed *= 1 + (t.speed || 0); cd *= 1 + (t.cd || 0);
        if (t.range && d.proj) range += t.range;
        armor += t.armor || 0; dodge += t.dodge || 0; this.bigDmg += t.bigDmg || 0;
        this.killHeal += t.killHeal || 0; this.xpMul += t.xp || 0;
      }
      const G = this.scene.game && this.scene.game.gearMods ? this.scene.game.gearMods(this.rec) : {};
      hp *= 1 + (G.hp || 0); dmg *= 1 + (G.dmg || 0); speed *= 1 + (G.speed || 0); cd *= 1 + (G.cd || 0);
      armor += G.armor || 0; dodge += G.dodge || 0; this.killHeal += G.killHeal || 0; this.xpMul += G.xp || 0;
      hp *= 1 + (B.hp || 0); dmg *= 1 + (B.dmg || 0) + (d.proj ? (B.rangedDmg || 0) : (B.meleeDmg || 0)); cd *= 1 - (B.atkSpeed || 0);
    }
    if (this.team === 1) {
      const boss = d.boss || d.big;
      const hs = d.rival ? 0.06 : boss ? 0.07 : 0.12, ds = d.rival ? 0.045 : boss ? 0.05 : 0.09; // rival soldiers start strong, so they scale gently
      hp *= 1 + (this.level - 1) * hs; dmg *= 1 + (this.level - 1) * ds;
      if (opts.elite) { hp *= 1.6; dmg *= 1.3; }
    }
    this.maxHp = Math.round(hp); this.dmg = dmg; this.speed = speed; this.cd = cd;
    this.range = range * T; this.armor = Math.min(0.6, armor); this.dodge = dodge;
  }
  get flying() { return !!this.def.flying; }
  get big() { return !!this.def.big; }
  get alive() { return !this.dead && this.hp > 0; }
  get bodyY() { return this.y - (this.big ? 50 : 30); }

  animKey(base) {
    if (this.kind === 'pawn') {
      return base === 'run' && this.carry ? `pawn_run_${this.carry}` :
        base === 'run' && this.tool ? `pawn_run_${this.tool}` :
          base === 'work' ? `pawn_work_${this.tool}` :
            this.carry ? `pawn_idle_${this.carry}` : this.tool ? `pawn_idle_${this.tool}` : 'pawn_idle';
    }
    if (this.anim === 'troll' && base === 'attack' && this.atkAnim >= 0 && this.atkAnim < animDuration('troll_windup')) return 'troll_windup';
    return `${this.anim}_${base}`;
  }

  // ---- movement
  setPath(tx, ty, goal) {
    const m = this.scene.map;
    if (this.flying) { this.path = [[cellOf(tx), cellOf(ty)]]; this.flyTo = { x: tx, y: ty }; return true; }
    const sx = cellOf(this.x), sy = cellOf(this.y);
    const p = findPath(m, sx, sy, cellOf(tx), cellOf(ty), goal);
    this.path = p; this.flyTo = null;
    return !!p;
  }
  stepPath(dt) {
    if (!this.path || !this.path.length) { this.moving = false; return true; }
    let tx, ty;
    if (this.flyTo && this.path.length === 1) { tx = this.flyTo.x; ty = this.flyTo.y; }
    else { const [cx, cy] = this.path[0]; tx = center(cx) + (this.path.length === 1 ? this.ox : 0); ty = center(cy) + 8 + (this.path.length === 1 ? this.oy : 0); }
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    const sp = this.speed * (this.cursed > 0 ? 0.5 : 1) * this.speedMul * dt;
    if (Math.abs(dx) > 1) this.flip = dx < 0;
    if (d <= sp) { this.x = tx; this.y = ty; this.path.shift(); }
    else { this.x += dx / d * sp; this.y += dy / d * sp; }
    this.moving = true;
    return !this.path.length;
  }
  stop() { this.path = null; this.moving = false; }

  // ---- combat helpers
  distTo(t) {
    if (t instanceof Building || t instanceof Struct) {
      const x0 = t.cx * T, y0 = t.cy * T, x1 = x0 + t.fw * T, y1 = y0 + t.fh * T;
      const px = Math.max(x0, Math.min(this.x, x1)), py = Math.max(y0, Math.min(this.y, y1));
      return Math.hypot(this.x - px, this.y - py);
    }
    return Math.hypot(this.x - t.x, this.y - t.y);
  }
  effRange(t) {
    let r = this.range;
    if (this.def.proj && this.team === 0 && !(t instanceof Building) && t.y !== undefined) { const up = this.scene.map.level(cellOf(this.x), cellOf(this.y)) - this.scene.map.level(cellOf(t.x), cellOf(t.y)); if (up > 0) r += 1.5 * up * T; }
    if (this.def.proj) r *= this.scene.game.env.rangeMul();
    return r + (t.big ? 18 : 0);
  }
  canAttack() { return this.atkT <= 0 && this.atkAnim < 0 && this.cursed <= 0; }
  buff(k) { return (this.buffs[k] || 0) > 0; }
  get speedMul() { return (this.buff('charge') ? 2 : 1) * (this.buff('trample') ? 2.2 : 1) * (this.scene.game.weatherSpeed ? this.scene.game.weatherSpeed(this) : 1); }
  startAttack(t) {
    this.atkAnim = 0; this.hitDone = false; this.atkTarget = t;
    const tx = t.x ?? (t.cx + t.fw / 2) * T;
    this.flip = tx < this.x;
  }
  attackDuration() {
    const k = `${this.anim}_attack`;
    let d = animDuration(k);
    if (this.anim === 'troll') d += animDuration('troll_windup');
    return Math.min(d, Math.max(0.45, this.cd * 0.9)) || 0.6;
  }
  updateAttack(dt) {
    if (this.atkAnim < 0) return;
    this.atkAnim += dt;
    const dur = this.attackDuration();
    let hitAt = dur * (this.def.hit || 0.5);
    if (this.anim === 'troll') hitAt = animDuration('troll_windup') + 0.3;
    if (!this.hitDone && this.atkAnim >= hitAt) {
      this.hitDone = true;
      const t = this.atkTarget;
      if (t && (t.alive ?? true)) this.scene.doHit(this, t);
    }
    if (this.atkAnim >= dur) { this.atkAnim = -1; this.atkT = this.cd * (this.buff('rage') ? 0.4 : 1); }
  }

  takeDamage(amount, src) {
    if (!this.alive || this.hidden) return;
    if (this.dodge && Math.random() < this.dodge) { this.scene.floatText('Dodge', this.x, this.bodyY - 20, '#ffffff'); return; }
    let a = amount * (1 - this.armor);
    if (this.def.armorRanged && src && src.def && src.def.proj) a *= 1 - this.def.armorRanged;
    if (this.anim === 'warrior' && this.state === 'idle') a *= 0.85;
    if (this.buff('shield')) a *= 0.4;
    this.hp -= a; this.flash = 0.12;
    this.lastHitBy = src;
    if (this.team === 1 && src) this.scene.alertCamp(this, src);
    if (this.hp <= 0) this.scene.kill(this, src);
  }
}

// ---------------------------------------------------------------- Building (player)
export class Building {
  constructor(scene, type, cx, cy, opts = {}) {
    this.id = NEXT_ID++; this.scene = scene; this.type = type; this.def = BUILDINGS[type];
    this.cx = cx; this.cy = cy; this.fw = this.def.fw; this.fh = this.def.fh;
    this.team = 0;
    this.variant = opts.variant ?? Math.floor(Math.random() * 3);
    this.maxHp = opts.maxHp || this.def.hp;
    this.hp = opts.hp ?? this.maxHp;
    this.buildEnd = opts.buildEnd || 0; this.buildTotal = opts.buildTotal || 0;
    this.queue = opts.queue || [];
    this.atkT = 0; this.fireT = Math.random();
    this.level = opts.level || 1; this.upEnd = 0; this.upTotal = 0; this.pop = 0;
  }
  get x() { return (this.cx + this.fw / 2) * T; }
  get y() { return (this.cy + this.fh) * T; }
  get alive() { return this.hp > 0; }
  get done() { return !this.buildEnd || Date.now() >= this.buildEnd; }
  get ruined() { return this.hp <= 0; }
  get imgKey() { return this.def.imgs ? this.def.imgs[this.variant % this.def.imgs.length] : this.def.img; }
  get bodyY() { return this.y - 60; }
  cells() { const out = []; for (let y = this.cy; y < this.cy + this.fh; y++) for (let x = this.cx; x < this.cx + this.fw; x++) out.push([x, y]); return out; }
  takeDamage(a, src) {
    if (this.hp <= 0) return;
    let amt = a; if (src && src.def && src.def.burn) amt *= 1.6;
    this.hp = Math.max(0, this.hp - amt); this.flash = 0.12;
    if (this.hp <= 0) this.scene.onBuildingDown(this, src);
  }
  hitTest(wx, wy) {
    if (this.def.wall || this.def.lantern) return wx >= this.cx * T && wx < (this.cx + 1) * T && wy >= this.cy * T - 10 && wy < (this.cy + 1) * T;
    const s = SHEETS[this.imgKey]; const w = s.fw, h = s.fh;
    return wx >= this.x - w / 2 + 8 && wx <= this.x + w / 2 - 8 && wy >= this.y - h + 40 && wy <= this.y + 6;
  }
}

// ---------------------------------------------------------------- Struct (enemy camp building)
export class Struct {
  constructor(scene, type, cx, cy, campId, level) {
    this.id = NEXT_ID++; this.scene = scene; this.type = type; this.def = CAMP_STRUCTS[type];
    this.cx = cx; this.cy = cy; this.fw = this.def.fw; this.fh = this.def.fh; this.team = 1; this.campId = campId;
    this.maxHp = Math.round(this.def.hp * (1 + (level - 1) * 0.15)); this.hp = this.maxHp; this.level = level;
    this.t = Math.random() * 3; this.atkT = 1;
  }
  get x() { return (this.cx + this.fw / 2) * T; }
  get y() { return (this.cy + this.fh) * T; }
  get alive() { return this.hp > 0; }
  get bodyY() { return this.y - 60; }
  get big() { return true; }
  takeDamage(a, src) {
    if (this.hp <= 0) return;
    let amt = a; if (src && src.def && src.def.siege) amt *= 2;
    this.hp -= amt; this.flash = 0.12;
    if (src) this.scene.alertCamp(this, src);
    if (this.hp <= 0) this.scene.onStructDown(this, src);
  }
  hitTest(wx, wy) {
    const s = SHEETS[this.def.sprite]; const w = s.fw, h = s.fh;
    return wx >= this.x - w / 2 + 10 && wx <= this.x + w / 2 - 10 && wy >= this.y - h + 30 && wy <= this.y + 6;
  }
}

// ---------------------------------------------------------------- Scene
export class Scene {
  constructor(game, kind, map, seed) {
    this.game = game; this.kind = kind; this.map = map;
    this.terrain = new TerrainChunks(map); // chunked canvases, rendered lazily (see terrain.js)
    this.foam = foamCells(map, rng(seed + 99));
    this.units = []; this.buildings = []; this.structs = [];
    this.trees = []; this.golds = []; this.sheep = [];
    this.projectiles = []; this.fx = []; this.texts = []; this.boats = [];
    this.selected = new Set();
    this.time = 0; this.goldRush = 0; this.tint = 0;
    this.r = rng(seed + 7);
    this.clouds = [];
    for (let i = 0; i < 4; i++) this.clouds.push({ k: 'cloud' + (1 + (i % 8)), x: Math.random() * map.w * T, y: Math.random() * map.h * T, v: 6 + Math.random() * 8 });
    this.duck = null;
  }
  bonus() { return this.game.bonus(); }

  // ---------- spawning
  addUnit(type, team, x, y, opts) {
    const u = new Unit(this, type, team, x, y, opts);
    this.units.push(u); return u;
  }
  placeBlock(cells, d) { for (const [x, y] of cells) if (this.map.in(x, y)) this.map.block[this.map.i(x, y)] += d; }
  addBuilding(type, cx, cy, opts) {
    const b = new Building(this, type, cx, cy, opts);
    this.buildings.push(b); this.placeBlock(b.cells(), 1);
    if (b.def.wall) this.wallMap = null;
    return b;
  }
  removeBuilding(b) { this.buildings = this.buildings.filter(o => o !== b); if (!(b.def.gate && b.open)) this.placeBlock(b.cells(), -1); if (b.def.wall) this.wallMap = null; }
  addStruct(type, cx, cy, campId, level) {
    const s = new Struct(this, type, cx, cy, campId, level);
    this.structs.push(s); const cells = []; for (let y = cy; y < cy + s.fh; y++) for (let x = cx; x < cx + s.fw; x++) cells.push([x, y]);
    s.cells = cells; this.placeBlock(cells, 1); return s;
  }
  addTree(cx, cy, opts = {}) {
    const t = { cx, cy, v: opts.v || (1 + Math.floor(Math.random() * 4)), wood: opts.wood ?? 25, regrow: opts.regrow || 0, t: Math.random() * 5, res: null };
    this.trees.push(t); this.placeBlock([[cx, cy]], 1); return t;
  }
  addGold(cx, cy, opts = {}) {
    const g = { cx, cy, amount: opts.amount ?? 120, max: 120, t: Math.random() * 5, res: [] };
    this.golds.push(g); this.placeBlock([[cx, cy]], 1); return g;
  }
  addSheep(x, y) {
    const s = { x, y, hx: x, hy: y, tx: x, ty: y, wait: Math.random() * 4, t: Math.random() * 5, flip: Math.random() < 0.5, grazing: 0, res: null };
    this.sheep.push(s); return s;
  }
  fxAt(key, x, y, opts = {}) { this.fx.push({ key, x, y, t: 0, dur: opts.dur || animDuration(key), scale: opts.scale || 1, flip: opts.flip, follow: opts.follow, alpha: opts.alpha }); }
  floatText(text, x, y, color = '#fff3c4', size = 18) { if (this.texts.length > 60) return; this.texts.push({ text, x, y, t: 0, color, size }); }

  nearestWalkable(cx, cy, maxR = 8, pred) {
    for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (this.map.walkable(x, y) && (!pred || pred(x, y))) return [x, y];
    }
    return null;
  }
  adjacentGoal(cells) {
    const set = new Set(cells.map(([x, y]) => x + ',' + y));
    return (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (set.has((x + dx) + ',' + (y + dy))) return true;
      return false;
    };
  }

  // ---------- queries
  nearestFoe(u, radius) {
    let best = null, bd = radius;
    for (const o of this.units) {
      if (o.team === u.team || !o.alive || o.hidden || o.kind === 'pawn') continue;
      if (o.duelOnly && o.duelOnly !== u) continue;
      if (o.duel && !u.duelOnly) continue;
      if (u.duelOnly && o !== u.duelOnly) continue;
      const d = dist(u.x, u.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ---------- combat resolution
  doHit(a, t) {
    const d = a.def;
    if (d.heal) {
      if (t.alive && t.hp < t.maxHp) {
        t.hp = Math.min(t.maxHp, t.hp + a.dmg);
        this.fxAt('healFx', t.x, t.y, { scale: t.big ? 1.2 : 0.9 });
        this.game.sfx('heal', t, this);
        this.floatText('+' + Math.round(a.dmg), t.x, t.bodyY - 26, '#9be37b', 13);
      }
      return;
    }
    let dmg = a.dmg;
    if (a.def.rage) dmg *= 1 + (1 - a.hp / a.maxHp) * 0.8;
    if (a.def.charge && a.charged) { dmg *= 2; a.charged = false; }
    if (t.big && a.bigDmg) dmg *= 1 + a.bigDmg;
    if (a.team === 0 && a.scene.kingAura(a)) dmg *= 1.15;
    if (a.buff('rally')) dmg *= 1.25;
    if (a.team === 0 && this.game.state.relics.moonstone && this.game.env.isNight) dmg *= 1.15;
    if (a.charges > 0) { dmg *= 2; a.charges--; }
    if (d.proj) {
      const tx = t.x, ty = (t.bodyY ?? t.y - 30);
      const arc = d.proj === 'stone' || d.proj === 'bomb' ? 70 : (d.proj === 'arrow' ? 18 : 10);
      const sy = a.y - (a.big ? 60 : 38);
      this.game.sfx(d.proj === 'stone' ? 'thud' : 'arrow', a, this);
      const fire = a.firestone; a.firestone = false;
      this.projectiles.push({ fire, key: d.proj, x: a.x, y: sy, sx: a.x, sy, tx, ty, target: t, t: 0, dur: Math.max(0.25, dist(a.x, sy, tx, ty) / (d.proj === 'stone' ? 260 : 460)), arc, dmg, src: a, splash: d.splash ? d.splash * T : 0, team: a.team });
      return;
    }
    this.applyDamage(a, t, dmg);
    this.game.sfx(a.team === 0 && !a.big ? 'sword' : 'hit', a, this);
    if (a.big && d.splash) this.game.shake(a.anim === 'troll' ? 7 : 4, this);
    if (d.cleave || d.splash) {
      const r = (d.splash || 1.1) * T;
      for (const o of this.units) if (o !== t && o.team !== a.team && o.alive && !o.hidden && o.kind !== 'pawn' && dist(o.x, o.y, t.x, t.y) < r) this.applyDamage(a, o, dmg * (d.cleave || 0.6));
      if (d.splash && a.big) this.fxAt('dust2', t.x, t.y + 4, { scale: 1.6 });
    }
  }
  applyDamage(a, t, dmg) {
    if (!t.alive) return;
    const before = t.hp;
    t.takeDamage(dmg, a);
    const done = Math.round(before - Math.max(0, t.hp));
    if (done > 0 && a.buff && a.buff('rage')) a.hp = Math.min(a.maxHp, a.hp + done * 0.3);
    if (done > 0 && !(t instanceof Building)) this.floatText(String(done), t.x + (Math.random() - 0.5) * 20, (t.bodyY ?? t.y) - 26, a.team === 0 ? '#ffffff' : '#ff8a80', 13);
  }
  kingAura(u) {
    if (u.type === 'king') return false;
    for (const o of this.units) if (o.type === 'king' && o.team === u.team && o.alive && dist(o.x, o.y, u.x, u.y) < 4 * T) return true;
    return false;
  }
  kill(u, src) {
    u.dead = true; u.hp = 0;
    this.selected.delete(u);
    this.game.sfx(u.big ? 'roar' : 'death', u, this);
    if (u.big) this.game.shake(u.anim === 'troll' ? 9 : 5, this);
    if (u.anim === 'troll') this.fxAt('troll_dead', u.x, u.y, { flip: u.flip, dur: animDuration('troll_dead') + 1.5 });
    else this.fxAt('dust2', u.x, u.y + 2, { scale: u.big ? 2 : 1.2 });
    this.game.onUnitKilled(this, u, src);
  }
  alertCamp(victim, src) {
    if (!src || src.team === undefined || src.team === victim.team) return;
    if (victim.campId == null) return;
    for (const o of this.units) {
      if (o.team === 1 && o.alive && o.campId === victim.campId && !o.target && src.alive) { o.target = src; o.mode = 'hunt'; }
    }
  }
  onBuildingDown(b, src) { this.fxAt('explosion1', b.x, b.y - 20, { scale: 1.2 }); this.game.sfx('explosion', b, this); this.game.shake(8, this); this.game.onBuildingDown(this, b, src); }
  onStructDown(s, src) {
    this.fxAt('explosion2', s.x, s.y - 30, { scale: 1.3 });
    this.game.sfx('explosion', s, this); this.game.shake(7, this);
    this.structs = this.structs.filter(o => o !== s); this.placeBlock(s.cells, -1);
    this.game.onStructDown(this, s, src);
  }

  // ---------- update
  update(dt) {
    this.time += dt;
    if (this.goldRush > 0) this.goldRush -= dt;
    for (const u of this.units) if (u.alive && (!u.hidden || u.kind === 'pawn')) this.updateUnit(u, dt);
    this.separate(dt);
    for (const b of this.buildings) this.updateBuilding(b, dt);
    for (const s of this.structs) this.updateStruct(s, dt);
    this.updateProjectiles(dt);
    this.updateSheep(dt);
    this.updateTrees(dt);
    for (const f of this.fx) { f.t += dt; if (f.follow) { f.x = f.follow.x; f.y = f.follow.y; } }
    if (this.fires) { for (const f of this.fires) f.t -= dt; this.fires = this.fires.filter(f => f.t > 0); }
    this.fx = this.fx.filter(f => f.t < f.dur);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < 1.4);
    this.units = this.units.filter(u => !u.dead);
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > this.map.w * T + 300) { c.x = -300; c.y = Math.random() * this.map.h * T; } }
    for (const b of this.boats) b.t += dt;
    if (this.duck) { this.duck.t += dt; this.duck.x += Math.sin(this.duck.t * 0.7) * (this.duck.wisp ? 30 : 6) * dt; if (this.duck.t > this.duck.life) this.duck = null; }
  }

  updateUnit(u, dt) {
    u.animT += dt;
    if (u.flash > 0) u.flash -= dt;
    if (u.atkT > 0) u.atkT -= dt;
    if (u.cursed > 0) { u.cursed -= dt; if (u.cursed <= 0) this.fxAt('dust1', u.x, u.y); }
    if (u.abT > 0) { const hol = this.game.holiday && this.game.holiday(); u.abT -= dt * (hol && hol.abilityHaste ? 2 : 1); }
    for (const k in u.buffs) if (u.buffs[k] > 0) u.buffs[k] -= dt;
    if (u.buff('trample')) for (const o of this.units) if (o.team !== u.team && o.alive && !o.hidden && o.kind !== 'pawn' && !u.trampled.has(o) && dist(o.x, o.y, u.x, u.y) < 36) { u.trampled.add(o); this.applyDamage(u, o, u.dmg * 1.5); this.fxAt('dust1', o.x, o.y); this.game.sfx('hit', o, this); }
    for (const f of this.fires || []) if (f.t > 0 && u.team !== 0 && dist(f.x, f.y, u.x, u.y) < 64) { u.burnT = (u.burnT || 0) - dt; if (u.burnT <= 0) { u.burnT = 0.5; this.applyDamage(f.src, u, 6); } }
    u.updateAttack(dt);
    if (u.kind === 'pawn') return this.game.pawnAI(this, u, dt);
    if (u.type === 'monk' || u.def.heal) return this.monkAI(u, dt);
    if (u.team === 0) return this.soldierAI(u, dt);
    return this.enemyAI(u, dt);
  }

  // chase-and-attack shared by soldiers and monsters
  engage(u, t, dt) {
    const d = u.distTo(t);
    const r = u.effRange(t);
    if (u.def.minRange && d < u.def.minRange * T && !(t instanceof Building) && !(t instanceof Struct)) {
      // too close for a catapult: back off
      const a = Math.atan2(u.y - t.y, u.x - t.x);
      const nx = u.x + Math.cos(a) * u.speed * dt, ny = u.y + Math.sin(a) * u.speed * dt;
      if (this.map.walkable(cellOf(nx), cellOf(ny))) { u.x = nx; u.y = ny; u.moving = true; }
      return;
    }
    if (d <= r) {
      u.stop();
      if (u.canAttack()) u.startAttack(t);
      return;
    }
    if (u.atkAnim >= 0) return;
    // close the last stretch in a straight line (pathing only gets us to a neighbouring cell)
    if (d < 2.2 * T) {
      let tx = t.x, ty = t.y;
      if (t instanceof Building || t instanceof Struct) {
        tx = Math.max(t.cx * T, Math.min(u.x, (t.cx + t.fw) * T)); ty = Math.max(t.cy * T, Math.min(u.y, (t.cy + t.fh) * T));
      }
      const m = this.map, myL = m.level(cellOf(u.x), cellOf(u.y));
      const a = Math.atan2(ty - u.y, tx - u.x), sp = u.speed * dt;
      const nx = u.x + Math.cos(a) * sp, ny = u.y + Math.sin(a) * sp;
      const ok = u.flying || (m.walkable(cellOf(nx), cellOf(ny)) && m.level(cellOf(nx), cellOf(ny)) === myL &&
        (t instanceof Building || t instanceof Struct || m.level(cellOf(t.x), cellOf(t.y)) === myL || t.flying));
      if (ok) { u.stop(); u.x = nx; u.y = ny; u.moving = true; if (Math.abs(tx - u.x) > 2) u.flip = tx < u.x; return; }
    }
    u.pathT -= dt;
    if (!u.path || !u.path.length || u.pathT <= 0) {
      u.pathT = 0.5 + Math.random() * 0.4;
      let ok;
      if (t instanceof Building || t instanceof Struct) {
        const cells = t.cells instanceof Function ? t.cells() : t.cells;
        ok = u.setPath(t.x, t.y - 10, this.adjacentGoal(cells));
      } else if (u.flying) ok = u.setPath(t.x, t.y);
      else {
        const tcx = cellOf(t.x), tcy = cellOf(t.y);
        const reach = Math.max(1, Math.floor(r / T));
        ok = u.setPath(t.x, t.y, (x, y) => Math.max(Math.abs(x - tcx), Math.abs(y - tcy)) <= Math.min(reach, 1) || (reach > 1 && Math.hypot(x - tcx, y - tcy) <= reach - 0.5));
      }
      if (!ok) {
        // raiders who can't reach their target hack through the nearest wall instead
        if (u.team === 1 && !u.flying && this.walls().size && !(t.def && t.def.wall)) {
          const w = this.game.breachTarget(this, u);
          if (w) { u.target = w; u.pathT = 0; return; }
        }
        u.giveUp = 2.5; u.target = null; u.stop(); return;
      }
    }
    u.stepPath(dt);
  }

  soldierAI(u, dt) {
    if (u.giveUp > 0) u.giveUp -= dt;
    // explicit orders
    if (u.order && u.order.type === 'move') {
      if (u.atkAnim >= 0) return;
      if (!u.path) { if (!u.setPath(u.order.x, u.order.y)) { u.order = null; return; } }
      if (u.stepPath(dt)) { u.home = { x: u.x, y: u.y }; u.order = null; u.charged = true; }
      return;
    }
    if (u.order && u.order.type === 'attack') {
      const t = u.order.target;
      if (!t.alive) { u.order = null; u.target = null; }
      else {
        // fight back against anyone in our face while battering a structure
        if (t instanceof Struct || t instanceof Building) {
          const threat = this.nearestFoe(u, Math.max(2.2 * T, u.def.proj ? u.range : 0));
          if (threat) { u.target = threat; this.engage(u, threat, dt); return; }
        }
        u.target = t; this.engage(u, t, dt); return;
      }
    }
    if (u.cursed > 0) { u.stop(); return; }
    // auto targeting
    if (u.target && (!u.target.alive || u.target.hidden || u.distTo(u.target) > 9 * T)) u.target = null;
    if (!u.target && (u.giveUp || 0) <= 0) {
      const raiding = this.kind === 'home' && this.game.raid && this.game.raid.active;
      const aggro = (this.kind === 'home' ? (raiding ? 15 : 8) * T : 5.5 * T) * this.game.env.aggroMul();
      let best = this.nearestFoe(u, aggro);
      if (!best && u.def.siege) best = this.nearestStruct(u, u.range + T);
      if (best) u.target = best;
    }
    if (u.target) {
      // leash on home island: don't chase forever
      const leash = this.game.raid && this.game.raid.active ? 20 : 12;
      if (this.kind === 'home' && dist(u.x, u.y, u.home.x, u.home.y) > leash * T && !u.target.big) { u.target = null; }
      else return this.engage(u, u.target, dt);
    }
    // return to post (if the post can't be reached, the current spot becomes the post)
    if (u.atkAnim < 0 && dist(u.x, u.y, u.home.x, u.home.y) > 40) {
      if ((!u.path || !u.path.length) && !u.setPath(u.home.x, u.home.y)) { u.home = { x: u.x, y: u.y }; return; }
      if (u.stepPath(dt)) u.charged = true;
    } else { u.moving = false; u.charged = true; }
  }

  nearestStruct(u, r) {
    let best = null, bd = r;
    for (const s of this.structs) { const d = u.distTo(s); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  monkAI(u, dt) {
    if (u.order && u.order.type === 'move') return this.soldierAI(u, dt);
    if (u.cursed > 0) return;
    let best = null, worst = 0.999;
    for (const o of this.units) {
      if (o.team !== u.team || o.kind === 'pawn' || !o.alive || o.hidden) continue;
      const frac = o.hp / o.maxHp;
      if (frac < worst && dist(o.x, o.y, u.x, u.y) < 7 * T) { worst = frac; best = o; }
    }
    if (best) return this.engage(u, best, dt);
    // follow the nearest soldier loosely in the field
    if (this.kind !== 'home') {
      let f = null, fd = 1e9;
      for (const o of this.units) if (o !== u && o.team === u.team && o.kind !== 'pawn' && !o.def.heal && o.alive) { const d = dist(o.x, o.y, u.x, u.y); if (d < fd) { fd = d; f = o; } }
      if (f && fd > 2.5 * T) { if (!u.path || !u.path.length || (u.pathT -= dt) <= 0) { u.pathT = 0.8; u.setPath(f.x, f.y); } u.stepPath(dt); return; }
    }
    if (u.team === 1 && this.kind === 'home') { // a rival healer with nobody hurt marches with the raid
      let f = null, fd = 1e9;
      for (const o of this.units) if (o !== u && o.team === 1 && o.alive && !o.def.heal) { const d = dist(o.x, o.y, u.x, u.y); if (d < fd) { fd = d; f = o; } }
      if (f && fd > 2.5 * T) { if (!u.path || !u.path.length || (u.pathT -= dt) <= 0) { u.pathT = 0.8; u.setPath(f.x, f.y); } u.stepPath(dt); } else u.moving = false;
      return;
    }
    if (u.atkAnim < 0 && dist(u.x, u.y, u.home.x, u.home.y) > 40 && this.kind === 'home') {
      if ((!u.path || !u.path.length) && !u.setPath(u.home.x, u.home.y)) { u.home = { x: u.x, y: u.y }; return; }
      u.stepPath(dt);
    } else u.moving = false;
  }

  enemyAI(u, dt) {
    if (u.atkAnim >= 0 && !u.moving) return;
    if (u.giveUp > 0) u.giveUp -= dt;
    const G = this.game;
    // thieves: steal then run
    if (u.def.thief && this.kind === 'home') return G.thiefAI(this, u, dt);
    if (u.def.caster) G.casterTick(this, u, dt);
    if (u.duelOnly) {
      if (!u.duelOnly.alive) { u.duelOnly = null; u.leaving = true; }
      else return this.engage(u, u.duelOnly, dt);
    }
    if (u.leaving) { // walk to boat and vanish
      if (!u.path || !u.path.length) { if (!u.setPath(u.home.x, u.home.y)) { u.dead = true; return; } }
      if (u.stepPath(dt)) { this.fxAt('splash', u.x, u.y, {}); u.dead = true; }
      return;
    }
    if (u.waiting > 0) { u.waiting -= dt; u.moving = false; return; }
    if (u.target && (!u.target.alive || u.target.hidden)) u.target = null;
    u.retarget = (u.retarget || 0) - dt;
    if (u.retarget <= 0) {
      u.retarget = 0.6;
      const aggro = (u.mode === 'raid' ? 5 : 5.5) * T;
      const foe = this.nearestFoe(u, aggro);
      if (foe && (!u.target || u.target instanceof Building || u.distTo(foe) + 20 < u.distTo(u.target))) u.target = foe;
      if (!u.target && u.mode === 'raid') u.target = G.raidTarget(this, u);
    }
    if (u.mode === 'guard' || u.mode === 'hunt') {
      const away = dist(u.x, u.y, u.home.x, u.home.y);
      if (u.target && away > 11 * T && u.mode !== 'hunt') u.target = null;
      if (u.target && away > 16 * T) { u.target = null; u.mode = 'guard'; }
    }
    if (u.target && (u.giveUp || 0) <= 0) return this.engage(u, u.target, dt);
    if (dist(u.x, u.y, u.home.x, u.home.y) > 48 && u.mode !== 'raid') {
      if ((!u.path || !u.path.length) && !u.setPath(u.home.x, u.home.y)) { u.home = { x: u.x, y: u.y }; return; }
      u.stepPath(dt);
    } else u.moving = false;
  }

  separate(dt) {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (!a.alive || a.hidden || a.kind === 'pawn') continue; // pawns walk through everyone
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j]; if (!b.alive || b.hidden || b.kind === 'pawn') continue;
        if (a.moving && b.moving) continue; // walkers pass each other; only standing units spread out
        if (a.flying !== b.flying) continue;
        const dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy;
        const minD = (a.big || b.big) ? 40 : 22;
        if (d2 < minD * minD && d2 > 0.01) {
          const d = Math.sqrt(d2), push = (minD - d) * 0.5 * Math.min(1, dt * 8);
          const nx = dx / d * push, ny = dy / d * push;
          this.nudge(a, -nx, -ny); this.nudge(b, nx, ny);
        }
      }
    }
  }
  nudge(u, dx, dy) {
    const nx = u.x + dx, ny = u.y + dy;
    if (u.flying || (this.map.walkable(cellOf(nx), cellOf(ny)) && this.map.level(cellOf(nx), cellOf(ny)) === this.map.level(cellOf(u.x), cellOf(u.y)))) { u.x = nx; u.y = ny; }
  }

  refreshWalls() { this.wallMap = new Map(); for (const b of this.buildings) if (b.def.wall) this.wallMap.set(b.cx + ',' + b.cy, b); }
  updateGate(b, dt) {
    b.gateT = (b.gateT || 0) - dt;
    if (b.gateT > 0) return;
    b.gateT = 0.3;
    const x = (b.cx + 0.5) * T, y = (b.cy + 0.5) * T;
    const foeNear = this.units.some(u => u.team === 1 && u.alive && !u.flying && dist(u.x, u.y, x, y) < 4 * T);
    const shut = foeNear || b.hold;
    const want = !shut && b.done && !b.ruined;
    if (want !== !!b.open) {
      b.open = want;
      this.placeBlock([[b.cx, b.cy]], want ? -1 : 1);
      if (this.game.sfx) this.game.sfx(want ? 'close' : 'thud', b, this);
    }
  }
  updateBuilding(b, dt) {
    if (b.flash > 0) b.flash -= dt;
    if (b.def.gate) this.updateGate(b, dt);
    b.fireT += dt;
    if (!b.done || b.ruined) return;
    const def = b.def.defense;
    if (def) {
      b.atkT -= dt;
      if (b.atkT <= 0) {
        const L = levelEffects('tower', b.level);
        const lvlBonus = this.map.level(b.cx, b.cy) * 1.5;
        const range = (def.range + lvlBonus + L.range) * T * this.game.env.rangeMul();
        const foes = [];
        for (const u of this.units) if (u.team === 1 && u.alive && !u.duel) { const d = dist(u.x, u.y, b.x, b.y - 20); if (d < range) foes.push([d, u]); }
        foes.sort((a, c) => a[0] - c[0]);
        if (foes.length) {
          b.atkT = def.cd * L.cd;
          const B = this.bonus();
          const dmg = def.dmg * (1 + (this.game.state.tier - 1) * 0.25) * L.dmg * (1 + (B.towerDmg || 0));
          for (const [d, foe] of foes.slice(0, L.shots)) {
            const sx = b.x, sy = b.y - 150;
            this.projectiles.push({ key: 'arrow', x: sx, y: sy, sx, sy, tx: foe.x, ty: foe.bodyY, target: foe, t: 0, dur: Math.max(0.2, d / 480), arc: 12, dmg, src: { team: 0, def: { proj: 'arrow' }, alive: true, tower: true }, splash: 0, team: 0 });
          }
          b.shotT = 0.5;
          this.game.sfx('arrow', b);
        } else b.atkT = 0.3;
      }
      if (b.shotT > 0) b.shotT -= dt;
    }
  }
  updateStruct(s, dt) {
    s.t += dt; if (s.flash > 0) s.flash -= dt;
    if (s.def.shoots) {
      s.atkT -= dt;
      if (s.atkT <= 0) {
        s.atkT = 1.8;
        let best = null, bd = 5 * T;
        for (const u of this.units) if (u.team === 0 && u.alive && !u.hidden) { const d = dist(u.x, u.y, s.x, s.y); if (d < bd) { bd = d; best = u; } }
        if (best) {
          const sx = s.x, sy = s.y - 110;
          this.projectiles.push({ key: s.def.shoots, x: sx, y: sy, sx, sy, tx: best.x, ty: best.bodyY, target: best, t: 0, dur: Math.max(0.25, bd / 420), arc: 20, dmg: 10 * (1 + (s.level - 1) * 0.1), src: { team: 1, def: { proj: s.def.shoots }, alive: true }, splash: 0, team: 1 });
        }
      }
    }
  }
  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.t < 0) continue;
      if (p.target && p.target.alive !== false) { p.tx = p.target.x; p.ty = p.target.bodyY ?? p.target.y - 30; }
      const k = Math.min(1, p.t / p.dur);
      const nx = p.sx + (p.tx - p.sx) * k, ny = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
      p.rot = Math.atan2(ny - p.y, nx - p.x);
      p.x = nx; p.y = ny;
      if (k >= 1) {
        p.done = true;
        if (p.fire) { this.fires = this.fires || []; for (let k = 0; k < 5; k++) this.fires.push({ x: p.tx + (Math.random() - 0.5) * 100, y: p.ty + 40 + (Math.random() - 0.5) * 60, t: 5, src: p.src, v: 1 + (k % 3) }); }
        if (p.splash) {
          this.fxAt(p.key === 'bomb' ? 'explosion1' : 'dust2', p.tx, p.ty + 20, { scale: p.key === 'bomb' ? 0.8 : 1.4 });
          this.game.sfx(p.key === 'bomb' ? 'explosion' : 'thud', { x: p.tx, y: p.ty }, this); this.game.shake(p.key === 'bomb' ? 4 : 3, this);
          for (const u of this.units) if (u.team !== p.team && u.alive && !u.hidden && u.kind !== 'pawn' && dist(u.x, u.bodyY, p.tx, p.ty) < p.splash) this.applyDamage(p.src, u, p.dmg * (u === p.target ? 1 : 0.7));
          for (const s of [...this.structs, ...this.buildings]) if (s.team !== p.team && s.alive && dist(s.x, s.bodyY, p.tx, p.ty) < p.splash + 40) s.takeDamage(p.dmg, p.src);
        } else if (p.target && p.target.alive !== false) {
          if (p.key === 'hexBolt') this.fxAt('hexBoom', p.tx, p.ty + 30, { scale: 0.8 });
          this.applyDamage(p.src, p.target, p.dmg);
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
  }
  updateSheep(dt) {
    for (const s of this.sheep) {
      s.t += dt;
      if (s.caught) continue;
      if (s.grazing > 0) { s.grazing -= dt; continue; }
      const d = dist(s.x, s.y, s.tx, s.ty);
      if (d > 2) {
        const sp = 22 * dt; s.flip = s.tx < s.x;
        s.x += (s.tx - s.x) / d * Math.min(sp, d); s.y += (s.ty - s.y) / d * Math.min(sp, d); s.moving = true;
      } else {
        s.moving = false; s.wait -= dt;
        if (s.wait <= 0) {
          if (Math.random() < 0.45) { s.grazing = animDuration('sheepGrass') * 2; s.t = 0; }
          s.wait = 2 + Math.random() * 5;
          for (let k = 0; k < 6; k++) {
            const tx = s.hx + (Math.random() - 0.5) * 4 * T, ty = s.hy + (Math.random() - 0.5) * 3 * T;
            const cx = cellOf(tx), cy = cellOf(ty);
            if (this.map.walkable(cx, cy) && this.map.level(cx, cy) === this.map.level(cellOf(s.x), cellOf(s.y))) { s.tx = tx; s.ty = ty; break; }
          }
        }
      }
    }
  }
  updateTrees(dt) {
    const now = Date.now();
    for (const t of this.trees) if (t.wood <= 0 && t.regrow && now >= t.regrow) { t.wood = 25; t.regrow = 0; this.fxAt('dust1', center(t.cx), center(t.cy) + 20); }
    for (const g of this.golds) g.t += dt;
    for (const t of this.trees) t.t += dt;
  }

  // ---------- hero abilities
  useAbility(u) {
    const ab = ABILITIES[u.type]; if (!ab || u.abT > 0 || !u.alive || u.cursed > 0) return false;
    u.abT = ab.cd;
    if (u.team === 0 && this.game.state) this.game.state.stats.abilities = (this.game.state.stats.abilities || 0) + 1;
    const G = this.game, foes = () => this.units.filter(o => o.team !== u.team && o.alive && !o.hidden && o.kind !== 'pawn');
    const allies = r => this.units.filter(o => o.team === u.team && o.alive && !o.hidden && o.kind !== 'pawn' && dist(o.x, o.y, u.x, u.y) < r);
    this.floatText(ab.name, u.x, u.y - 92, '#ffe066', 15);
    if (u.type === 'warrior') { u.buffs.shield = ab.dur; this.fxAt('dust1', u.x, u.y); G.sfx('build', u, this); }
    else if (u.type === 'archer') {
      let near = null, bd = u.range + 3 * T;
      for (const o of foes()) { const d = dist(o.x, o.y, u.x, u.y); if (d < bd) { bd = d; near = o; } }
      if (!near) { u.abT = 1; if (u.team === 0 && G.state) G.state.stats.abilities--; this.floatText('No foes in range', u.x, u.y - 70, '#ffffff', 13); return false; }
      const pack = foes().filter(o => dist(o.x, o.y, near.x, near.y) < 1.8 * T);
      for (let i = 0; i < 6; i++) {
        const t = pack[i % pack.length], sy = u.y - 38, delay = i * 0.07;
        this.projectiles.push({ key: 'arrow', x: u.x, y: sy, sx: u.x, sy, tx: t.x, ty: t.bodyY, target: t, t: -delay, dur: Math.max(0.3, dist(u.x, sy, t.x, t.bodyY) / 420), arc: 60, dmg: u.dmg * 1.2, src: u, splash: 0, team: u.team });
      }
      u.startAttack(near); G.sfx('arrow', u, this);
    } else if (u.type === 'lancer') { u.buffs.charge = ab.dur; u.charges = 3; G.sfx('horn', u, this); }
    else if (u.type === 'monk') { for (const o of allies(4 * T)) { o.hp = Math.min(o.maxHp, o.hp + 60); this.fxAt('healFx', o.x, o.y, {}); } G.sfx('heal', u, this); }
    else if (u.type === 'swordsman') {
      for (const o of foes()) if (dist(o.x, o.y, u.x, u.y) < 1.6 * T) this.applyDamage(u, o, u.dmg * 1.6);
      this.fxAt('dust2', u.x, u.y, { scale: 2 }); u.atkAnim = 0; u.hitDone = true; u.atkTarget = null; G.sfx('sword', u, this); G.shake(3, this);
    } else if (u.type === 'berserker') { u.buffs.rage = ab.dur; G.sfx('roar', u, this); }
    else if (u.type === 'horseman') { u.buffs.trample = ab.dur; u.trampled = new Set(); G.sfx('thud', u, this); }
    else if (u.type === 'catapult') { u.firestone = true; G.sfx('build', u, this); }
    else if (u.type === 'king') { for (const o of allies(6 * T)) { o.buffs.rally = ab.dur; o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.2); this.fxAt('healFx', o.x, o.y, {}); } G.sfx('victory', u, this); }
    return true;
  }

  // ---------- picking
  pick(wx, wy) {
    let best = null, bd = 34;
    for (const u of this.units) {
      if (!u.alive || u.hidden) continue;
      const d = dist(wx, wy, u.x, u.bodyY);
      const r = u.big ? 60 : 34;
      if (d < r && d < bd + (u.big ? 26 : 0)) { bd = d; best = u; }
    }
    if (best) return best;
    if (this.duck && dist(wx, wy, this.duck.x, this.duck.y - 10) < 40) return this.duck;
    for (const n of this.npcs || []) if (dist(wx, wy, n.x, n.y - 30) < 40) return n;
    for (const s of this.structs) if (s.hitTest(wx, wy)) return s;
    for (const b of [...this.buildings].sort((a, c) => c.y - a.y)) if (b.hitTest(wx, wy)) return b;
    return null;
  }

  // ---------- drawing
  draw(ctx, cam, vw, vh) {
    const z = cam.z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = WATER; ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(z, 0, 0, z, Math.round(-cam.x * z), Math.round(-cam.y * z));
    const x0 = cam.x - 200, y0 = cam.y - 260, x1 = cam.x + vw / z + 200, y1 = cam.y + vh / z + 260;
    const vis = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
    const t = this.time;
    for (const d of this.map.decor) if (d.type === 'wrock' && vis(center(d.x), center(d.y))) drawSprite(ctx, 'wrock' + d.v, center(d.x), center(d.y) + 8, t + d.t);
    for (const f of this.foam) if (vis(center(f.x), center(f.y))) drawSprite(ctx, 'foam', center(f.x), center(f.y), t + f.t);
    // annexed land sliding in (src/annex.js sets this.slam = { cv, foam, x, y })
    const sl = this.slam;
    if (sl) for (const f of sl.foam) drawSprite(ctx, 'foam', sl.x + center(f.x), sl.y + center(f.y), t + f.t);
    // terrain
    this.terrain.draw(ctx, cam, x0, y0, x1, y1);
    if (sl) ctx.drawImage(sl.cv, Math.round(sl.x), Math.round(sl.y));

    // y-sorted objects
    const list = [];
    for (const d of this.map.decor) if (d.type !== 'wrock') { const x = center(d.x) + d.ox, y = center(d.y) + d.oy + 16; if (vis(x, y)) list.push({ y, d: () => drawSprite(ctx, (d.type === 'bush' ? 'bush' : 'rock') + d.v, x, y, t + d.t) }); }
    for (const n of this.npcs || []) list.push({ y: n.y, d: () => drawSprite(ctx, n.key, n.x, n.y, this.time, { flip: n.flip }) });
    for (const b of this.boats) if (vis(b.x, b.y)) list.push({ y: b.y - 30, d: () => drawSprite(ctx, b.key, b.x, b.y, b.t, { flip: b.flip }) });
    if (this.duck) { const dk = this.duck; list.push({ y: dk.y - 20, d: () => dk.wisp ? drawSprite(ctx, 'hexBolt', dk.x, dk.y - 30 + Math.sin(dk.t * 2) * 10, dk.t, { alpha: 0.85 }) : drawSprite(ctx, 'duck', dk.x, dk.y, 0, { frame: Math.floor(dk.t * 3) % 3, scale: 1.4 }) }); }
    for (const tr of this.trees) {
      const x = center(tr.cx), y = center(tr.cy) + 22;
      if (!vis(x, y)) continue;
      const stump = tr.wood <= 0;
      list.push({ y, d: () => drawSprite(ctx, stump ? 'stump' + tr.v : 'tree' + tr.v, x + (tr.shake > 0 ? Math.sin(t * 40) * 2 : 0), y, t + tr.t) });
      if (tr.shake > 0) tr.shake -= 1 / 60;
    }
    for (const g of this.golds) {
      const x = center(g.cx), y = center(g.cy) + 14;
      if (!vis(x, y)) continue;
      const size = Math.max(1, Math.min(6, Math.ceil(g.amount / g.max * 6)));
      list.push({ y, d: () => drawSprite(ctx, (this.goldRush > 0 ? 'goldHi' : 'gold') + size, x, y, t + g.t) });
    }
    for (const s of this.sheep) {
      if (s.caught || !vis(s.x, s.y)) continue;
      const k = s.grazing > 0 ? 'sheepGrass' : s.moving ? 'sheepMove' : 'sheepIdle';
      list.push({ y: s.y, d: () => drawSprite(ctx, k, s.x, s.y, s.t, { flip: s.flip }) });
    }
    for (const b of this.buildings) {
      if (!vis(b.x, b.y)) continue;
      list.push({ y: b.y, d: () => this.drawBuilding(ctx, b) });
    }
    for (const s of this.structs) {
      if (!vis(s.x, s.y)) continue;
      list.push({ y: s.y, d: () => {
        const opt = { frame: s.def.anim ? undefined : 0, alpha: s.flash > 0 ? 0.7 : 1 };
        drawSprite(ctx, s.def.sprite, s.x, s.y + 4, s.t, opt);
      } });
    }
    for (const u of this.units) {
      if (!u.alive || u.hidden || !vis(u.x, u.y)) continue;
      list.push({ y: u.y, d: () => this.drawUnit(ctx, u) });
    }
    for (const f of this.fires || []) list.push({ y: f.y, d: () => drawSprite(ctx, 'fire' + f.v, f.x, f.y, this.time + f.v, { alpha: Math.min(1, f.t) }) });
    for (const f of this.fx) list.push({ y: f.y + 1, d: () => drawSprite(ctx, f.key, f.x, f.y, f.t, { once: true, scale: f.scale, flip: f.flip, alpha: f.alpha }) });
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.d();

    // projectiles
    for (const p of this.projectiles) {
      const s = SHEETS[p.key]; if (!s || !s.img) continue;
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.key === 'arrow' || p.key === 'harpoon') ctx.rotate(p.rot || 0);
      ctx.drawImage(s.img, (Math.floor(p.t * 12) % s.frames) * s.fw, 0, s.fw, s.fh, -s.fw / 2, -s.fh / 2, s.fw, s.fh);
      ctx.restore();
    }
    // overlays: selection, hp bars
    for (const u of this.selected) if (u.alive) drawSprite(ctx, 'cursorRing', u.x, u.bodyY + 16, 0, { scale: (u.big ? 0.85 : 0.6) * (1 + Math.sin(this.time * 6) * 0.06) });
    for (const u of this.units) {
      if (!u.alive || u.hidden || u.kind === 'pawn') continue;
      if (u.hp < u.maxHp || this.selected.has(u)) this.bar(ctx, u.x, u.y - (u.big ? 110 : 72), u.big ? 56 : 40, u.hp / u.maxHp, u.team === 0 ? '#6dbb5b' : '#d9534f');
      if (u.cursed > 0) this.bar(ctx, u.x, u.y - 78, 40, u.cursed / 45, '#a874c9');
    }
    for (const b of [...this.buildings, ...this.structs]) {
      if (b.hp < b.maxHp && b.hp > 0) this.bar(ctx, b.x, b.y - (SHEETS[b.imgKey || b.def.sprite]?.fh || 160) + 30, 70, b.hp / b.maxHp, b.team === 0 ? '#6dbb5b' : '#d9534f');
      if (b.buildEnd && !b.done) this.bar(ctx, b.x, b.y - 40, 70, 1 - (b.buildEnd - Date.now()) / (b.buildTotal * 1000), '#e8c35a');
      if (b.upEnd) this.bar(ctx, b.x, b.y - 40, 70, 1 - (b.upEnd - Date.now()) / (b.upTotal * 1000), '#a874c9');
      if (b.level > 1 && b.done) for (let i = 0; i < b.level - 1; i++) {
        const px = Math.round(b.x - (b.level - 2) * 7 + i * 14), py = Math.round(b.y - 20);
        ctx.fillStyle = '#2b2b3a'; ctx.fillRect(px - 5, py - 5, 10, 10);
        ctx.fillStyle = '#e8b93a'; ctx.fillRect(px - 3, py - 3, 6, 6);
      }
    }
    // floating text
    ctx.textAlign = 'center';
    for (const tx of this.texts) {
      const a = 1 - tx.t / 1.4;
      ctx.font = `${tx.size || 18}px BoldPixels, monospace`;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#2b2b3a'; ctx.fillText(tx.text, tx.x + 1, tx.y - tx.t * 28 + 1);
      ctx.fillStyle = tx.color; ctx.fillText(tx.text, tx.x, tx.y - tx.t * 28);
    }
    ctx.globalAlpha = 1;
    this.game.env.drawWorld(ctx, this);
    // clouds (more of them when the weather turns)
    const wantClouds = 4 + (this.game.env.w.clouds || 0) + (this.game.env.w.fog ? 6 : 0);
    while (this.clouds.length < wantClouds) this.clouds.push({ k: 'cloud' + (1 + Math.floor(Math.random() * 8)), x: -300, y: Math.random() * this.map.h * T, v: 6 + Math.random() * 8 });
    if (this.clouds.length > wantClouds && this.clouds[this.clouds.length - 1].x < -200) this.clouds.pop();
    for (const c of this.clouds) if (vis(c.x, c.y)) drawSprite(ctx, c.k, c.x, c.y, 0, { alpha: 0.9 });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.game.env.drawScreen(ctx, vw, vh, this, cam);
    if (this.tint > 0) { ctx.fillStyle = `rgba(70,10,40,${0.32 * this.tint})`; ctx.fillRect(0, 0, vw, vh); }
  }
  bar(ctx, x, y, w, frac, color) {
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = '#2b2b3a'; ctx.fillRect(Math.round(x - w / 2) - 2, Math.round(y) - 2, w + 4, 9);
    ctx.fillStyle = '#5a4636'; ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 5);
    ctx.fillStyle = color; ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * frac), 5);
  }
  walls() { if (!this.wallMap) this.refreshWalls(); return this.wallMap; }
  wallAt(x, y) { return this.walls().get(x + ',' + y) || null; }
  drawWall(ctx, b) {
    const s = SHEETS.fence; if (!s || !s.img) return;
    const n = (dx, dy) => !!this.wallAt(b.cx + dx, b.cy + dy);
    const L = n(-1, 0), R = n(1, 0), U = n(0, -1), D = n(0, 1);
    let c = [1, 0];
    if (b.def.gate && b.open) return this.drawGateOpen(ctx, b, L || R);
    if (L && R) c = [1, 0]; else if (U && D) c = [0, 1];
    else if (R && D) c = [0, 0]; else if (L && D) c = [3, 0]; else if (U && R) c = [0, 2]; else if (U && L) c = [3, 2];
    else if (L) c = [1, 2]; else if (R) c = [2, 2]; else if (U || D) c = [0, 1]; else c = [2, 2];
    ctx.globalAlpha = b.done ? 1 : 0.5;
    ctx.drawImage(s.img, c[0] * T, c[1] * T, T, T, b.cx * T, b.cy * T, T, T);
    if (b.def.gate) { ctx.fillStyle = '#8c5a2b'; ctx.fillRect(b.cx * T + 8, b.cy * T + 24, 48, 6); ctx.fillStyle = '#3b2f2a'; ctx.fillRect(b.cx * T + 8, b.cy * T + 30, 48, 2); }
    ctx.globalAlpha = 1;
    if (b.flash > 0) b.flash -= 1 / 60;
  }
  drawGateOpen(ctx, b, horizontal) {
    // an open gate: two posts with the doors swung back
    const s = SHEETS.fence, x = b.cx * T, y = b.cy * T;
    ctx.drawImage(s.img, 1 * T, 2 * T, 28, T, x, y, 28, T);
    ctx.drawImage(s.img, 2 * T + 36, 2 * T, 28, T, x + 36, y, 28, T);
  }
  drawLantern(ctx, b) {
    const s = SHEETS.fence; if (!s || !s.img) return;
    ctx.globalAlpha = b.done ? 1 : 0.5;
    ctx.drawImage(s.img, 2 * T + 18, 2 * T, 28, T, b.cx * T + 18, b.cy * T, 28, T); // a lone fence post
    ctx.globalAlpha = 1;
    if (this.game.env.night > 0.05 && b.done) drawSprite(ctx, 'fire1', b.cx * T + 32, b.cy * T + 26, this.time + b.id * 0.37, { alpha: this.game.env.night });
  }
  drawBuilding(ctx, b) {
    if (b.def.lantern) return this.drawLantern(ctx, b);
    if (b.def.wall) return this.drawWall(ctx, b);
    const s = SHEETS[b.imgKey]; if (!s || !s.img) return;
    const constructing = !b.done;
    ctx.globalAlpha = constructing ? 0.5 : (b.ruined ? 0.55 : 1);
    if (b.pop > 0) {
      b.pop = Math.max(0, b.pop - 1 / 30);
      const k = Math.sin((1 - b.pop) * Math.PI * 3) * b.pop * 0.1;
      ctx.save(); ctx.translate(b.x, b.y + 8); ctx.scale(1 - k * 0.6, 1 + k);
      ctx.drawImage(s.img, Math.round(-s.fw / 2), -s.fh);
      ctx.restore();
    } else ctx.drawImage(s.img, Math.round(b.x - s.fw / 2), Math.round(b.y - s.fh + 8));
    ctx.globalAlpha = 1;
    if (b.flash > 0) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.globalAlpha = 1; }
    if (b.type === 'tower' && b.done && !b.ruined) drawSprite(ctx, b.shotT > 0 ? 'archer_attack' : 'archer_idle', b.x, b.y - 126, b.shotT > 0 ? 0.5 - b.shotT : this.time, {});
    // fire when badly hurt
    const frac = b.hp / b.maxHp;
    if (!constructing && frac < 0.6) {
      const n = frac <= 0 ? 4 : frac < 0.3 ? 3 : 1;
      for (let i = 0; i < n; i++) drawSprite(ctx, 'fire' + (1 + (i % 3)), b.x + (i - n / 2 + 0.5) * 34, b.y - 40 - (i % 2) * 40, b.fireT + i * 0.3);
    }
  }
  drawUnit(ctx, u) {
    if (u.cursed > 0) { drawSprite(ctx, u.moving ? 'sheepMove' : 'sheepIdle', u.x, u.y, u.animT, { flip: u.flip }); return; }
    let key, tt = u.animT, opts = { flip: u.flip };
    if (u.atkAnim >= 0) {
      key = u.animKey('attack');
      tt = u.anim === 'troll' && key === 'troll_attack' ? u.atkAnim - animDuration('troll_windup') : u.atkAnim;
      const dur = u.attackDuration();
      const native = animDuration(key === 'troll_windup' ? 'troll_windup' : `${u.anim}_attack`);
      if (native > dur && key !== 'troll_windup') tt = u.atkAnim * native / dur;
      opts.once = true;
      if (u.anim === 'lancer' && u.atkTarget) {
        const dy = (u.atkTarget.y ?? u.atkTarget.y) - u.y, dx = Math.abs((u.atkTarget.x ?? 0) - u.x);
        if (dy < -dx * 0.8) key = 'lancer_attack_up'; else if (dy > dx * 0.8) key = 'lancer_attack_down';
      }
      if (u.def.scale) opts.scale = u.def.scale;
    } else if (u.buff('shield') && !u.moving && (u.anim === 'warrior' || u.anim === 'lancer')) key = u.anim + '_guard';
    else if (u.kind === 'pawn' && u.working) key = u.animKey('work');
    else key = u.animKey(u.moving ? 'run' : 'idle');
    if (u.def.scale) opts.scale = u.def.scale;
    drawSprite(ctx, key, u.x, u.y, tt, opts);
    if (u.buff('rage') || u.buff('rally') || u.buff('charge') || u.buff('trample')) { // glow while buffed
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, key, u.x, u.y, tt, { ...opts, alpha: 0.18 + Math.sin(this.time * 8) * 0.08 });
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.flash > 0) { // brighten on hit
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, key, u.x, u.y, tt, { ...opts, alpha: Math.min(0.7, u.flash * 6) });
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
