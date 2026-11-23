// The sea (4.0): your fleet on the infinite ocean. Holds the world state (fog, fleet, crew, cleared and
// conquered islands), sails the fleet in real time, and decides what each island offers when you arrive.
import { Ocean, Fog, SEED_SPACE, wordsFromSeed } from './ocean.js';
import { RIVALS, REGIONS } from './data.js';
import { CHAPTERS } from './campaign.js';

export const SPEED = 95;    // world units per second
const SIGHT = 320;          // fog revealed around the fleet
const HOME_SIGHT = 760;     // known waters at the start

export class Sea {
  constructor(realm) { this.R = realm; this.ocean = null; this.fog = null; this.saveT = 0; this.revealT = 0; }
  get W() { return this.R.state.world; }
  seedInt() { return this.R.state.seed % SEED_SPACE; }
  words() { return wordsFromSeed(this.seedInt()); }
  init() {
    const S = this.R.state;
    S.world = Object.assign({ fog: null, fleet: { x: 0, y: 0 }, dest: null, cleared: {}, conquered: {}, crew: [], houses: null, seen: {} }, S.world || {});
    this.ocean = new Ocean(this.seedInt());
    this.fog = new Fog(S.world.fog);
    this.fog.reveal(0, 0, HOME_SIGHT);
    this.placeHouses();
    // story names, levels and the great houses are applied to every chunk as it is generated
    const gen = this.ocean._gen.bind(this.ocean);
    this.ocean._gen = (cx, cy) => { const c = gen(cx, cy); for (const is of c.islands) this.decorate(is); return c; };
    for (const c of this.ocean.cache.values()) for (const is of c.islands) this.decorate(is);
  }
  decorate(is) {
    if (is.kind === 'story' && CHAPTERS[is.chapter - 1]) { const ch = CHAPTERS[is.chapter - 1]; is.name = ch.name; is.level = ch.level; }
    if (is.kind === 'abyss') is.name = 'The Abyss';
    const key = this.W && this.W.houses && Object.keys(this.W.houses).find(k => this.W.houses[k] === is.id);
    if (this.R.kingdoms && is.kingdom && !key) this.R.kingdoms.dress(is);
    if (key && is.kingdom) { const rv = RIVALS.find(r => r.key === key); is.kingdom.name = rv.name; is.kingdom.color = key; is.kingdom.ruler = rv.ruler; is.kingdom.motto = rv.motto; is.house = key; }
  }
  // the four great houses sit on real islands: the nearest kingdom of their colour (stable once chosen)
  placeHouses() {
    const W = this.W;
    if (!W.houses) {
      const ks = [];
      for (let cy = -6; cy <= 6; cy++) for (let cx = -6; cx <= 6; cx++) for (const is of this.ocean.chunk(cx, cy).islands) if (is.kind === 'kingdom') ks.push(is);
      ks.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
      W.houses = {}; const used = new Set();
      RIVALS.forEach((rv, i) => {
        const min = 1100 + i * 500; // stronger houses sit farther out
        const pick = ks.find(k => !used.has(k.id) && k.kingdom.color === rv.key && Math.hypot(k.x, k.y) >= min) || ks.find(k => !used.has(k.id) && Math.hypot(k.x, k.y) >= min) || ks.find(k => !used.has(k.id));
        if (pick) { used.add(pick.id); W.houses[rv.key] = pick.id; }
      });
    }
  }
  houseOf(is) { return is && is.house ? RIVALS.find(r => r.key === is.house) : null; }
  relation(is) {
    if (!is || !is.kingdom) return 'neutral';
    const S = this.R.state, h = this.houseOf(is);
    return this.R.kingdoms.relation(is);
  }
  // where the fleet is
  fleetIsland() { const f = this.W.fleet; return this.ocean.islandAt(f.x, f.y, 70); }
  atHome() { const f = this.W.fleet; return !this.W.dest && Math.hypot(f.x, f.y) < 260; }
  crewRecs() { const S = this.R.state; return this.W.crew.map(id => S.soldiers.find(s => s.id === id)).filter(Boolean); }
  // set sail toward an island: stop just off its shore on the side we approach from
  sail(is) {
    const f = this.W.fleet, a = Math.atan2(f.y - is.y, f.x - is.x), d = is.r + 34;
    this.W.dest = { x: is.x + Math.cos(a) * d, y: is.y + Math.sin(a) * d, id: is.id }; this.W.rested = null;
    this.R.sfx('sail');
  }
  sailTo(x, y) { this.W.dest = { x, y, id: null }; this.W.rested = null; this.R.sfx('sail'); }
  stop() { this.W.dest = null; }
  eta() { const d = this.W.dest, f = this.W.fleet; return d ? Math.hypot(d.x - f.x, d.y - f.y) / SPEED : 0; }
  update(dt) {
    if (!this.ocean) return;
    const W = this.W, f = W.fleet, d = W.dest;
    if (d) {
      const dx = d.x - f.x, dy = d.y - f.y, L = Math.hypot(dx, dy), step = SPEED * dt;
      if (L <= step) {
        f.x = d.x; f.y = d.y; W.dest = null;
        const is = this.ocean.islandById(d.id);
        this.fog.reveal(f.x, f.y, SIGHT);
        if (is) { W.seen[is.id] = 1; if (is.kind === 'home' && W.crew.length) { this.disembark(); this.R.ui.toast('Home again. The crew comes ashore.', 'gold'); } this.R.ui.onFleetArrive && this.R.ui.onFleetArrive(is); }
        else this.R.ui.toast('The fleet drops anchor in open water.');
        this.persist();
      } else { f.x += dx / L * step; f.y += dy / L * step; f.flip = dx < 0; }
      this.revealT -= dt; if (this.revealT <= 0) { this.revealT = 0.2; this.fog.reveal(f.x, f.y, SIGHT); }
      this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 5; this.persist(); }
    }
  }
  persist() { this.W.fog = this.fog.serialize(); }
  // crew: soldiers aboard leave the island and come back when the fleet docks at home
  embark(ids) {
    const R = this.R, S = R.state;
    this.disembark(true);
    this.W.crew = ids.slice();
    for (const rec of this.crewRecs()) {
      rec.status = 'away';
      for (const u of R.home.units) if (u.rec === rec && u.alive) { rec.hp = Math.round(u.hp); u.dead = true; R.home.selected.delete(u); }
    }
    R.save();
  }
  disembark(quiet) {
    const R = this.R;
    for (const rec of this.crewRecs()) if (rec.status === 'away') { rec.status = 'home'; rec.post = null; R.spawnSoldier(rec, true); }
    this.W.crew = [];
    if (!quiet) R.save();
  }
  // what landing on an island means, mapped onto the expedition modes the game already has
  landing(is) {
    const S = this.R.state, W = this.W;
    if (!is) return null;
    if (is.kind === 'home') return { act: 'home' };
    if (is.kind === 'story') {
      const i = is.chapter - 1, done = (S.story && S.story.done) || 0;
      if (i < done) return { act: 'none', note: 'The tale of this island is told.' };
      if (i > done) return { act: 'none', note: `The story has not reached this island yet. Chapter ${done + 1} comes first.` };
      const need = CHAPTERS[i] ? CHAPTERS[i].need : 0;
      if ((S.cleared || 0) < need) return { act: 'none', note: `The way here is not yet known. Clear ${need - (S.cleared || 0)} more island${need - (S.cleared || 0) === 1 ? '' : 's'} first.` };
      return { act: 'land', mode: 'story:' + i, label: `Chapter ${is.chapter}` };
    }
    if (is.kind === 'abyss') return S.tier < 3 ? { act: 'none', note: 'The Abyss swallows small realms whole. Raise the Castle before you descend.' } : { act: 'land', mode: 'abyss', label: `Descend to floor ${(S.abyss && S.abyss.depth) || 1}` };
    if (is.kind === 'port') return { act: 'port' };
    if (is.kind === 'wild') return { act: 'none', note: 'Nothing to fight and nothing to take. Settling new land comes in a later update.' };
    if (is.kind === 'kingdom') {
      const h = this.houseOf(is);
      const st = this.R.kingdoms.stance(is);
      if (h) {
        if (S.rivals[h.key].subjugated) return { act: 'none', note: `${h.name} is your vassal. Their tribute arrives every hour.` };
        if (!this.R.rivalUnlocked(h)) return { act: 'none', note: `${h.name} keeps to itself for now. Grow your realm before you challenge them.` };
        if (st === 'truce') return { act: 'none', note: `A truce holds with ${h.name}. Break it from Diplomacy if you mean to fight.` };
        return { act: 'land', mode: 'rival:' + h.key, label: 'Lay siege' };
      }
      if (W.conquered[is.id]) return { act: 'none', note: `${is.kingdom.name} bends the knee to you.` };
      if (st !== 'war') return { act: 'none', note: `You are ${st === 'ally' ? 'allied' : st === 'truce' ? 'in a truce' : 'at peace'} with ${is.kingdom.name}. Declare war from Diplomacy before you lay siege.` };
      return { act: 'land', mode: 'isle:' + is.id, label: 'Lay siege' };
    }
    if (W.cleared[is.id]) return { act: 'none', note: is.kind === 'ruins' ? 'The ruins are picked clean.' : 'Cleared. The monsters have not come back yet.' };
    return { act: 'land', mode: 'isle:' + is.id, label: is.kind === 'ruins' ? 'Search the ruins' : 'Land and attack' };
  }
  // the parameters an island gives a voyage
  isleParams(is) {
    const region = REGIONS.find(r => r.key === is.region) || REGIONS[0];
    return { region, level: is.level, boss: !!is.boss, name: is.name, seed: is.seed };
  }
}
