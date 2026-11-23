// Squads and guard districts (3.6). Soldiers can be grouped into named squads, each with a banner on
// the island. A squad stands guard around its banner, in whichever district the banner sits, with a
// stance that decides how far it will go to fight. The island is split into districts around the castle.
import { T } from './terrain.js';

export const COLORS = [
  { key: 'blue', name: 'Blue', hex: '#4a90c0' }, { key: 'red', name: 'Red', hex: '#d9534f' },
  { key: 'gold', name: 'Gold', hex: '#e8b93a' }, { key: 'purple', name: 'Purple', hex: '#8f5fb5' },
  { key: 'green', name: 'Green', hex: '#6dbb5b' }, { key: 'black', name: 'Black', hex: '#3b3b4a' },
];
const NAMES = ['The Shieldwall', 'Iron Company', 'The Wolves', 'Oak Guard', 'The Lanterns', 'Salt Company', 'The Thorns', 'Ember Guard', 'The Ravens', 'Stone Company', 'The Larks', 'Tide Guard'];
export const STANCES = {
  hold: { name: 'Hold', desc: 'Stand at the banner and only fight what comes close.', aggro: 4.5, leash: 5 },
  defend: { name: 'Defend', desc: 'Fight anything in their district, then return to the banner.', aggro: 11, leash: 13 },
  chase: { name: 'Chase', desc: 'Hunt raiders anywhere on the island.', aggro: 22, leash: 40 },
};
export const DISTRICTS = {
  castle: 'Home Grounds', north: 'North Reach', east: 'East Shore', south: 'South Fields', west: 'West Woods',
};

export function districtAt(R, cx, cy) {
  const c = R.castle; if (!c) return 'castle';
  const dx = cx - (c.cx + c.fw / 2), dy = cy - (c.cy + c.fh / 2);
  if (Math.hypot(dx, dy) < 8) return 'castle';
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
}

const OFFS = [[0, 1], [1, 1], [-1, 1], [0, 2], [1, 2], [-1, 2], [2, 1], [-2, 1], [2, 2], [-2, 2], [0, 3], [1, 3], [-1, 3], [2, 0], [-2, 0], [3, 1]];

export class Squads {
  constructor(realm) { this.R = realm; }
  get list() { const S = this.R.state; return S.squads || (S.squads = []); }
  max() { return Math.min(6, 1 + this.R.state.tier); }
  of(rec) { return this.list.find(q => q.members.includes(rec.id)); }
  byId(id) { return this.list.find(q => q.id === id); }
  create() {
    const L = this.list; if (L.length >= this.max()) return 'Grow the realm to raise more squads.';
    const used = new Set(L.map(q => q.color)), color = COLORS.find(c => !used.has(c.key)) || COLORS[0];
    const name = NAMES.find(n => !L.some(q => q.name === n)) || 'Squad ' + (L.length + 1);
    const R = this.R, door = R.door;
    const spot = R.home.nearestWalkable(door[0] + (L.length % 3) * 3 - 3, door[1] + 3 + Math.floor(L.length / 3) * 3, 8) || door;
    const q = { id: (this.R.state.nextSquad = (this.R.state.nextSquad || 0) + 1), name, color: color.key, members: [], stance: 'defend', banner: { cx: spot[0], cy: spot[1] } };
    L.push(q); return q;
  }
  disband(q) { const S = this.R.state; S.squads = this.list.filter(o => o !== q); for (const id of q.members) this.repost(id); }
  rename(q) { const free = NAMES.filter(n => n === q.name || !this.list.some(o => o.name === n)); q.name = free[(free.indexOf(q.name) + 1) % free.length] || q.name; }
  clean() { const ids = new Set(this.R.state.soldiers.map(s => s.id)); for (const q of this.list) q.members = q.members.filter(id => ids.has(id)); }
  toggle(q, recId) {
    if (q.members.includes(recId)) { q.members = q.members.filter(x => x !== recId); this.repost(recId); return; }
    for (const o of this.list) o.members = o.members.filter(x => x !== recId);
    q.members.push(recId); this.repost(recId);
  }
  setBanner(q, cx, cy) {
    const m = this.R.home.map; if (!m.walkable(cx, cy) || !(this.R.reach && this.R.reach[m.i(cx, cy)])) return 'The banner needs open ground your people can reach.';
    q.banner = { cx, cy }; for (const id of q.members) this.repost(id);
    this.R.home.fxAt('dust1', cx * T + 32, cy * T + 40); this.R.sfx('place');
    return null;
  }
  // where a squad member stands: around the banner
  postFor(rec) {
    const q = this.of(rec); if (!q || !q.banner) return null;
    const R = this.R, m = R.home.map, i = Math.max(0, q.members.indexOf(rec.id)), [ox, oy] = OFFS[i % OFFS.length];
    const lvl = m.level(q.banner.cx, q.banner.cy);
    const c = R.home.nearestWalkable(q.banner.cx + ox, q.banner.cy + oy, 4, (x, y) => R.reach[m.i(x, y)] && m.level(x, y) === lvl) || [q.banner.cx, q.banner.cy];
    return { x: c[0] * T + 32, y: c[1] * T + 40 };
  }
  repost(recId) {
    const R = this.R, rec = R.state.soldiers.find(s => s.id === recId); if (!rec) return;
    rec.post = null;
    const p = this.postFor(rec) || R.postFor(rec);
    const u = R.home.units.find(o => o.rec === rec && o.alive);
    if (u) { u.home = p; u.target = null; u.order = null; u.path = null; }
  }
  stanceOf(rec) { const q = this.of(rec); return q ? STANCES[q.stance] : null; }
  // home units of a squad
  units(q) { return this.R.home.units.filter(u => u.rec && u.alive && !u.hidden && q.members.includes(u.rec.id)); }
  // a raid lands: squads defending that district (and anyone set to chase) march to meet it
  respond(cx, cy) {
    const R = this.R, d = districtAt(R, cx, cy), out = [];
    for (const q of this.list) {
      if (!q.banner || q.stance === 'hold') continue;
      if (q.stance === 'defend' && districtAt(R, q.banner.cx, q.banner.cy) !== d) continue;
      for (const u of this.units(q)) { u.order = null; u.target = null; u.path = null; u.alerted = { x: cx * T + 32, y: cy * T + 40, t: 25 }; }
      if (this.units(q).length) out.push(q);
    }
    return out;
  }
}
