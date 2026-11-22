// Scenes hold a map plus every live object on it, run the AI and draw it all.
import { SHEETS, drawSprite, animDuration } from './assets.js';
import { T, findPath, renderTerrain, foamCells, rng, K_WATER } from './terrain.js';
import { UNITS, ENEMIES, BUILDINGS, CAMP_STRUCTS, TRAITS } from './data.js';

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
    this.anim = team === 0 ? this.def.anim : type;
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
      hp *= 1 + (B.hp || 0); dmg *= 1 + (B.dmg || 0) + (d.proj ? (B.rangedDmg || 0) : (B.meleeDmg || 0)); cd *= 1 - (B.atkSpeed || 0);
    }
    if (this.team === 1) {
      const s = 1 + (this.level - 1) * 0.12;
      hp *= s; dmg *= 1 + (this.level - 1) * 0.09;
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
    const sp = this.speed * (this.cursed > 0 ? 0.5 : 1) * dt;
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
    if (this.def.proj && this.team === 0 && this.scene.map.level(cellOf(this.x), cellOf(this.y)) === 1 && !(t instanceof Building) && t.y !== undefined && this.scene.map.level(cellOf(t.x), cellOf(t.y)) === 0) r += 1.5 * T;
    return r + (t.big ? 18 : 0);
  }
  canAttack() { return this.atkT <= 0 && this.atkAnim < 0 && this.cursed <= 0; }
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
    if (this.atkAnim >= dur) { this.atkAnim = -1; this.atkT = this.cd; }
  }

  takeDamage(amount, src) {
    if (!this.alive || this.hidden) return;
    if (this.dodge && Math.random() < this.dodge) { this.scene.floatText('Dodge', this.x, this.bodyY - 20, '#ffffff'); return; }
    let a = amount * (1 - this.armor);
    if (this.def.armorRanged && src && src.def && src.def.proj) a *= 1 - this.def.armorRanged;
    if (this.anim === 'warrior' && this.state === 'idle') a *= 0.85;
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
    this.terrain = renderTerrain(map);
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
    this.buildings.push(b); this.placeBlock(b.cells(), 1); return b;
  }
  removeBuilding(b) { this.buildings = this.buildings.filter(o => o !== b); this.placeBlock(b.cells(), -1); }
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
  floatText(text, x, y, color = '#fff3c4') { this.texts.push({ text, x, y, t: 0, color }); }

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
      }
      return;
    }
    let dmg = a.dmg;
    if (a.def.rage) dmg *= 1 + (1 - a.hp / a.maxHp) * 0.8;
    if (a.def.charge && a.charged) { dmg *= 2; a.charged = false; }
    if (t.big && a.bigDmg) dmg *= 1 + a.bigDmg;
    if (a.team === 0 && a.scene.kingAura(a)) dmg *= 1.15;
    if (d.proj) {
      const tx = t.x, ty = (t.bodyY ?? t.y - 30);
      const arc = d.proj === 'stone' || d.proj === 'bomb' ? 70 : (d.proj === 'arrow' ? 18 : 10);
      const sy = a.y - (a.big ? 60 : 38);
      this.projectiles.push({ key: d.proj, x: a.x, y: sy, sx: a.x, sy, tx, ty, target: t, t: 0, dur: Math.max(0.25, dist(a.x, sy, tx, ty) / (d.proj === 'stone' ? 260 : 460)), arc, dmg, src: a, splash: d.splash ? d.splash * T : 0, team: a.team });
      return;
    }
    this.applyDamage(a, t, dmg);
    if (d.cleave || d.splash) {
      const r = (d.splash || 1.1) * T;
      for (const o of this.units) if (o !== t && o.team !== a.team && o.alive && !o.hidden && o.kind !== 'pawn' && dist(o.x, o.y, t.x, t.y) < r) this.applyDamage(a, o, dmg * (d.cleave || 0.6));
      if (d.splash && a.big) this.fxAt('dust2', t.x, t.y + 4, { scale: 1.6 });
    }
  }
  applyDamage(a, t, dmg) {
    if (!t.alive) return;
    t.takeDamage(dmg, a);
  }
  kingAura(u) {
    if (u.type === 'king') return false;
    for (const o of this.units) if (o.type === 'king' && o.team === u.team && o.alive && dist(o.x, o.y, u.x, u.y) < 4 * T) return true;
    return false;
  }
  kill(u, src) {
    u.dead = true; u.hp = 0;
    this.selected.delete(u);
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
  onBuildingDown(b, src) { this.fxAt('explosion1', b.x, b.y - 20, { scale: 1.2 }); this.game.onBuildingDown(this, b, src); }
  onStructDown(s, src) {
    this.fxAt('explosion2', s.x, s.y - 30, { scale: 1.3 });
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
    this.fx = this.fx.filter(f => f.t < f.dur);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < 1.4);
    this.units = this.units.filter(u => !u.dead);
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > this.map.w * T + 300) { c.x = -300; c.y = Math.random() * this.map.h * T; } }
    for (const b of this.boats) b.t += dt;
    if (this.duck) { this.duck.t += dt; this.duck.x += Math.sin(this.duck.t * 0.7) * 6 * dt; if (this.duck.t > this.duck.life) this.duck = null; }
  }

  updateUnit(u, dt) {
    u.animT += dt;
    if (u.flash > 0) u.flash -= dt;
    if (u.atkT > 0) u.atkT -= dt;
    if (u.cursed > 0) { u.cursed -= dt; if (u.cursed <= 0) this.fxAt('dust1', u.x, u.y); }
    u.updateAttack(dt);
    if (u.kind === 'pawn') return this.game.pawnAI(this, u, dt);
    if (u.type === 'monk') return this.monkAI(u, dt);
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
      if (!ok) { u.giveUp = 2.5; u.target = null; u.stop(); return; }
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
      const aggro = this.kind === 'home' ? 8 * T : 5.5 * T;
      let best = this.nearestFoe(u, aggro);
      if (!best && u.def.siege) best = this.nearestStruct(u, u.range + T);
      if (best) u.target = best;
    }
    if (u.target) {
      // leash on home island: don't chase forever
      if (this.kind === 'home' && dist(u.x, u.y, u.home.x, u.home.y) > 12 * T && !u.target.big) { u.target = null; }
      else return this.engage(u, u.target, dt);
    }
    // return to post
    if (u.atkAnim < 0 && dist(u.x, u.y, u.home.x, u.home.y) > 40) {
      if (!u.path || !u.path.length) u.setPath(u.home.x, u.home.y);
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
      for (const o of this.units) if (o !== u && o.team === 0 && o.kind === 'soldier' && o.type !== 'monk' && o.alive) { const d = dist(o.x, o.y, u.x, u.y); if (d < fd) { fd = d; f = o; } }
      if (f && fd > 2.5 * T) { if (!u.path || !u.path.length || (u.pathT -= dt) <= 0) { u.pathT = 0.8; u.setPath(f.x, f.y); } u.stepPath(dt); return; }
    }
    if (u.atkAnim < 0 && dist(u.x, u.y, u.home.x, u.home.y) > 40 && this.kind === 'home') {
      if (!u.path || !u.path.length) u.setPath(u.home.x, u.home.y);
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
      if (!u.path || !u.path.length) u.setPath(u.home.x, u.home.y);
      u.stepPath(dt);
    } else u.moving = false;
  }

  separate(dt) {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (!a.alive || a.hidden) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j]; if (!b.alive || b.hidden) continue;
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

  updateBuilding(b, dt) {
    if (b.flash > 0) b.flash -= dt;
    b.fireT += dt;
    if (!b.done || b.ruined) return;
    const def = b.def.defense;
    if (def) {
      b.atkT -= dt;
      if (b.atkT <= 0) {
        const lvlBonus = this.map.level(b.cx, b.cy) === 1 ? 1.5 : 0;
        const range = (def.range + lvlBonus) * T;
        let best = null, bd = range;
        for (const u of this.units) if (u.team === 1 && u.alive && !u.duel) { const d = dist(u.x, u.y, b.x, b.y - 20); if (d < bd) { bd = d; best = u; } }
        if (best) {
          b.atkT = def.cd;
          const B = this.bonus();
          const dmg = def.dmg * (1 + (this.game.state.tier - 1) * 0.25) * (1 + (B.towerDmg || 0));
          const sx = b.x, sy = b.y - 150;
          this.projectiles.push({ key: 'arrow', x: sx, y: sy, sx, sy, tx: best.x, ty: best.bodyY, target: best, t: 0, dur: Math.max(0.2, bd / 480), arc: 12, dmg, src: { team: 0, def: { proj: 'arrow' }, alive: true, tower: true }, splash: 0, team: 0 });
          b.shotT = 0.5;
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
      if (p.target && p.target.alive !== false) { p.tx = p.target.x; p.ty = p.target.bodyY ?? p.target.y - 30; }
      const k = Math.min(1, p.t / p.dur);
      const nx = p.sx + (p.tx - p.sx) * k, ny = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.arc;
      p.rot = Math.atan2(ny - p.y, nx - p.x);
      p.x = nx; p.y = ny;
      if (k >= 1) {
        p.done = true;
        if (p.splash) {
          this.fxAt(p.key === 'bomb' ? 'explosion1' : 'dust2', p.tx, p.ty + 20, { scale: p.key === 'bomb' ? 0.8 : 1.4 });
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
    for (const b of this.boats) drawSprite(ctx, b.key, b.x, b.y, b.t, { flip: b.flip });
    if (this.duck) drawSprite(ctx, 'duck', this.duck.x, this.duck.y, 0, { frame: Math.floor(this.duck.t * 3) % 3, scale: 1.4 });
    // terrain
    const sx = Math.max(0, x0), sy = Math.max(0, y0);
    const sw = Math.min(this.terrain.width, x1) - sx, sh = Math.min(this.terrain.height, y1) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(this.terrain, sx, sy, sw, sh, sx, sy, sw, sh);

    // y-sorted objects
    const list = [];
    for (const d of this.map.decor) if (d.type !== 'wrock') { const x = center(d.x) + d.ox, y = center(d.y) + d.oy + 16; if (vis(x, y)) list.push({ y, d: () => drawSprite(ctx, (d.type === 'bush' ? 'bush' : 'rock') + d.v, x, y, t + d.t) }); }
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
    for (const u of this.selected) if (u.alive) drawSprite(ctx, 'cursorRing', u.x, u.bodyY + 32 * 0.5, 0, { scale: u.big ? 0.85 : 0.6 });
    for (const u of this.units) {
      if (!u.alive || u.hidden || u.kind === 'pawn') continue;
      if (u.hp < u.maxHp || this.selected.has(u)) this.bar(ctx, u.x, u.y - (u.big ? 110 : 72), u.big ? 56 : 40, u.hp / u.maxHp, u.team === 0 ? '#6dbb5b' : '#d9534f');
      if (u.cursed > 0) this.bar(ctx, u.x, u.y - 78, 40, u.cursed / 45, '#a874c9');
    }
    for (const b of [...this.buildings, ...this.structs]) {
      if (b.hp < b.maxHp && b.hp > 0) this.bar(ctx, b.x, b.y - (SHEETS[b.imgKey || b.def.sprite]?.fh || 160) + 30, 70, b.hp / b.maxHp, b.team === 0 ? '#6dbb5b' : '#d9534f');
      if (b.buildEnd && !b.done) this.bar(ctx, b.x, b.y - 40, 70, 1 - (b.buildEnd - Date.now()) / (b.buildTotal * 1000), '#e8c35a');
    }
    // floating text
    ctx.textAlign = 'center'; ctx.font = '18px BoldPixels, monospace';
    for (const tx of this.texts) {
      const a = 1 - tx.t / 1.4;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#2b2b3a'; ctx.fillText(tx.text, tx.x + 1, tx.y - tx.t * 28 + 1);
      ctx.fillStyle = tx.color; ctx.fillText(tx.text, tx.x, tx.y - tx.t * 28);
    }
    ctx.globalAlpha = 1;
    // clouds
    for (const c of this.clouds) if (vis(c.x, c.y)) drawSprite(ctx, c.k, c.x, c.y, 0, { alpha: 0.75 });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.tint > 0) { ctx.fillStyle = `rgba(70,10,40,${0.32 * this.tint})`; ctx.fillRect(0, 0, vw, vh); }
  }
  bar(ctx, x, y, w, frac, color) {
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = '#2b2b3a'; ctx.fillRect(Math.round(x - w / 2) - 2, Math.round(y) - 2, w + 4, 9);
    ctx.fillStyle = '#5a4636'; ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 5);
    ctx.fillStyle = color; ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * frac), 5);
  }
  drawBuilding(ctx, b) {
    const s = SHEETS[b.imgKey]; if (!s || !s.img) return;
    const constructing = !b.done;
    ctx.globalAlpha = constructing ? 0.5 : (b.ruined ? 0.55 : 1);
    ctx.drawImage(s.img, Math.round(b.x - s.fw / 2), Math.round(b.y - s.fh + 8));
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
    } else if (u.kind === 'pawn' && u.working) key = u.animKey('work');
    else key = u.animKey(u.moving ? 'run' : 'idle');
    if (u.flash > 0) opts.alpha = 0.55;
    drawSprite(ctx, key, u.x, u.y, tt, opts);
  }
}
