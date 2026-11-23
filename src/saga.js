// The saga, the bestiary and the codex (9.0).
// Saga: the great deeds of the realm, written down as they happen and bound into one book per ruler.
// Bestiary: every kind of foe you have met, with what you have learned of it. Hunting a kind of foe long
// enough teaches your soldiers its weak points.
// Codex: the realm's book of knowledge, filled in as you build, train, sail, find and decree.
import { ENEMIES, BUILDINGS, UNITS, RELICS } from './data.js';
import { DECREES } from './decrees.js';
import { DOCTRINES } from './warfare.js';
import { RULER_TRAITS } from './court.js';

export const LORE_STEPS = [[300, 0.15, 'Mastered'], [100, 0.1, 'Well known'], [25, 0.05, 'Studied'], [1, 0, 'Met']];
const COLORS_RX = /^(red|yellow|purple|black|blue)_/;
// a rival house's soldiers are one kind of foe whatever colours they wear
export const family = type => COLORS_RX.test(type) ? 'house_' + type.replace(COLORS_RX, '') : type;
export function familyInfo(f) {
  if (f.startsWith('house_')) { const u = f.slice(6), d = UNITS[u] || {}; return { name: `House ${d.name || u}`, def: ENEMIES['red_' + u] || ENEMIES['blue_' + u], sprite: `red_${u}`, house: true }; }
  const d = ENEMIES[f]; return { name: d ? d.name : f, def: d, sprite: d ? d.anim || f : f };
}
// a line of lore for each foe; anything missing falls back to its traits
const LORE = {
  torchgoblin: 'Sets fire to whatever it can reach. Kill it before it reaches the houses.',
  speargoblin: 'Keeps its distance behind a long spear. Cheap, many, and not very brave.',
  pigrider: 'Charges through lines on a war pig. Hit hard by spears and archers.',
  gnome: 'Small, quick and greedy. Comes in numbers.',
  slinggnome: 'Pelts your soldiers with acorns from behind its friends.',
  gnoll: 'Throws bones from range. Close the distance quickly.',
  troll: 'Huge and slow, and it winds up before every blow. Step back when it raises its club.',
  skull: 'Walks only by night. Holy ground and fire unsettle it.',
  shaman: 'Hexes the strongest soldier in reach. Kill it first.',
  thief: 'Runs for your gold and then for the boats. Cut it off.',
};
const PLACES = {
  home: ['Home', 'Your own island, where the realm began.'], lair: ['Monster lairs', 'Camps of goblins, gnomes, gnolls, sharks and the dead. Clear them for loot, then settle the land.'],
  ruins: ['Ruins', 'Old stones that still hide treasure, and sometimes the things that guard it.'], port: ['Free ports', 'Harbours that trade with anyone. Rest the crew here.'],
  wild: ['Wild land', 'Unclaimed and fertile. Found a colony here.'], kingdom: ['Kingdoms', 'Every kingdom has a temper and a stance toward you. Make friends, or make vassals.'],
  story: ['The story isles', 'Where the tale of the Drowned Crown is told, one chapter at a time.'], abyss: ['The Abyss', 'An endless descent. Each floor deeper pays more.'],
};

export class Saga {
  constructor(realm) { this.R = realm; this.t = 3; }
  get S() { return this.R.state; }
  // ---------------------------------------------------------------- saga
  get list() { const S = this.S; return S.saga || (S.saga = []); }
  add(kind, text) {
    const S = this.S, C = this.R.court;
    const day = Math.floor((Date.now() - S.created) / 86400000) + 1;
    let gen = 1, ruler = ''; try { const D = C.D; gen = D.gen; ruler = C.regnal(D.ruler); } catch (e) { /* the court is not ready during founding */ }
    this.list.unshift({ t: Date.now(), day, gen, ruler, kind, text });
    this.list.length = Math.min(this.list.length, 300);
  }
  books() {
    const out = new Map();
    for (const e of this.list) { if (!out.has(e.gen)) out.set(e.gen, { gen: e.gen, ruler: e.ruler, entries: [] }); out.get(e.gen).entries.unshift(e); } // each book reads from its first page
    return [...out.values()];
  }
  // what the Hall of Realms keeps: how it began, how it was crowned, and its last great deeds, oldest first
  summary() {
    const L = this.list.filter(e => e.kind !== 'minor'), keep = new Set([...L.filter(e => e.kind === 'found' || e.kind === 'crown'), ...L.slice(0, 15)]);
    return L.filter(e => keep.has(e)).reverse().map(e => ({ day: e.day, text: e.text }));
  }
  // ---------------------------------------------------------------- bestiary
  get B() { const S = this.S; return S.bestiary || (S.bestiary = {}); }
  seen(type) { const f = family(type), b = this.B[f]; if (!b) { this.B[f] = { seen: Date.now(), kills: 0 }; } }
  killed(type) {
    const f = family(type), b = this.B[f] || (this.B[f] = { seen: Date.now(), kills: 0 });
    const before = this.lore(type); b.kills++;
    if (this.lore(type) > before && this.R.ui) this.R.ui.toast(`Your soldiers have learned the ways of the ${familyInfo(f).name}: +${Math.round(this.lore(type) * 100)}% damage against them.`, 'gold');
  }
  lore(type) { const b = this.B[family(type)]; if (!b) return 0; for (const [n, v] of LORE_STEPS) if (b.kills >= n) return v; return 0; }
  loreWord(f) { const b = this.B[f]; if (!b) return 'Unknown'; for (const [n, , w] of LORE_STEPS) if (b.kills >= n) return w; return 'Seen'; }
  nextLore(f) { const b = this.B[f] || { kills: 0 }; const steps = LORE_STEPS.slice().reverse().filter(s => s[1] > 0); const nx = steps.find(s => b.kills < s[0]); return nx ? nx[0] - b.kills : 0; }
  loreText(f) { if (LORE[f]) return LORE[f]; const { def } = familyInfo(f); if (!def) return ''; const bits = []; if (def.heal && !def.dmg) bits.push('Stays behind the line'); else if (def.proj) bits.push('Fights from range'); else bits.push('Fights up close'); if (def.big) bits.push('big and hard to stop'); if (def.burn) bits.push('sets fires'); if (def.flying) bits.push('flies over walls'); if (def.boss) bits.push('a leader of its kind'); if (def.caster) bits.push('casts hexes'); if (def.heal) bits.push('heals its friends'); return bits.join(', ') + '.'; }
  families() { const all = new Set(); for (const k of Object.keys(ENEMIES)) all.add(family(k)); return [...all]; }
  // ---------------------------------------------------------------- codex
  get X() { const S = this.S; return S.codex || (S.codex = { b: {}, u: {}, p: {}, d: {}, g: {}, t: {} }); }
  // notice what the realm has come to know (cheap, every few seconds)
  scan() {
    const X = this.X, S = this.S, R = this.R;
    for (const b of R.home.buildings) if (b.done && !X.b[b.type]) X.b[b.type] = Date.now();
    for (const s of S.soldiers) if (!X.u[s.type]) X.u[s.type] = Date.now();
    if (S.pawns > 0) X.u.pawn = X.u.pawn || Date.now();
    for (const s of S.soldiers) if (s.general && !X.g[s.general]) X.g[s.general] = Date.now();
    const W = S.world;
    if (W && R.sea.ocean) { const ids = Object.keys(W.seen || {}); if (ids.length !== X._seenN && Object.keys(PLACES).some(k => !X.p[k])) for (const id of ids.slice(X._seenN || 0)) { const is = R.sea.ocean.islandById(id); if (is && !X.p[is.kind]) X.p[is.kind] = Date.now(); } X._seenN = ids.length; }
    X.p.home = X.p.home || Date.now();
    const a = R.decrees && R.decrees.active && R.decrees.active(); if (a) for (const [k, d] of Object.entries(DECREES)) if (d === a && !X.d[k]) X.d[k] = Date.now();
    try { const D = R.court.D; for (const p of [D.ruler, D.heir, ...D.past]) if (p) for (const t of p.traits || []) X.t[t] = X.t[t] || Date.now(); if (D.spouse) X.t[D.spouse.trait] = X.t[D.spouse.trait] || Date.now(); } catch (e) { /* ignore */ }
  }
  chapters() {
    const X = this.X, S = this.S;
    return [
      { key: 'b', name: 'Buildings', items: Object.entries(BUILDINGS).filter(([k, d]) => !d.decor).map(([k, d]) => ({ k, name: d.name, desc: d.desc, on: !!X.b[k] || k === 'castle', img: { castle: 'b_Castle', house: 'b_House1', barracks: 'b_Barracks', archery: 'b_Archery', monastery: 'b_Monastery', tower: 'b_Tower', tavern: 'b_Tavern', market: 'b_Market', chapel: 'b_Chapel', wall: 'fence', gate: 'fence', lantern: 'fire1' }[k] })) },
      { key: 'u', name: 'Soldiers', items: Object.entries(UNITS).map(([k, d]) => ({ k, name: d.name, desc: d.desc || '', on: !!X.u[k], img: k === 'pawn' ? 'av_h5' : d.avatar ? (/^h\d+$/.test(d.avatar) ? 'av_' + d.avatar : 'av_' + d.avatar + '1') : null })) },
      { key: 'r', name: 'Relics', items: Object.entries(RELICS).map(([k, d]) => ({ k, name: d.name, desc: d.desc, on: !!(S.relics && S.relics[k]) })) },
      { key: 'p', name: 'Places', items: Object.entries(PLACES).map(([k, [n, d]]) => ({ k, name: n, desc: d, on: !!X.p[k] })) },
      { key: 'g', name: 'Doctrines', items: Object.entries(DOCTRINES).map(([k, d]) => ({ k, name: d.name, desc: d.desc, on: !!X.g[k] })) },
      { key: 't', name: 'Ruler traits', items: Object.entries(RULER_TRAITS).map(([k, d]) => ({ k, name: d.name, desc: d.desc, on: !!X.t[k] })) },
      { key: 'd', name: 'Decrees', items: Object.entries(DECREES).map(([k, d]) => ({ k, name: d.name, desc: `${d.good}. But: ${d.bad.toLowerCase()}.`, on: !!X.d[k] })) },
    ];
  }
  progress() { let n = 0, of = 0; for (const c of this.chapters()) for (const i of c.items) { of++; if (i.on) n++; } const fam = this.families(); return { n, of, bn: fam.filter(f => this.B[f]).length, bof: fam.length }; }
  update(dt) { this.t -= dt; if (this.t > 0) return; this.t = 5; this.scan(); }
}
