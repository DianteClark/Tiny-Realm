// Hero gear (3.4): weapons, armour and trinkets that drop from voyages, hunts and raids.
// Items live in state.gear; a soldier record holds equipped ids in rec.gear = { weapon, armor, trinket }.

export const RARITY = [
  { key: 'common', name: 'Common', color: '#857759' },
  { key: 'rare', name: 'Rare', color: '#4a90c0' },
  { key: 'epic', name: 'Epic', color: '#9b59c9' },
  { key: 'legendary', name: 'Legendary', color: '#e8a93a' },
];
export const SLOTS = [['weapon', 'Weapon', 'ic-sword'], ['armor', 'Armour', 'ic-shield'], ['trinket', 'Trinket', 'ic-gem']];

const BASES = {
  weapon: ['Blade', 'War Axe', 'Spear', 'Longbow', 'Mace', 'Falchion', 'Glaive'],
  armor: ['Mail', 'Plate', 'Brigandine', 'Cloak', 'Hauberk', 'Gambeson'],
  trinket: ['Charm', 'Ring', 'Amulet', 'Feather', 'Idol', 'Locket'],
};
const PREFIX = [['Worn', 'Plain', 'Sturdy', 'Rough'], ['Fine', 'Keen', 'Tempered', 'Polished'], ['Heroic', 'Runed', 'Gilded', 'Storied']];
const LEGENDS = ['Dawnbringer', 'Tidecaller', 'Oathkeeper', 'Stormsong', 'Moonhide', 'Kingsguard', 'Emberheart', 'Wyrmbane', 'Lionheart', 'Gracefall'];

// trinket powers: [stat, values by rarity, label]
const TRINKET = [
  ['speed', [0.06, 0.1, 0.15, 0.2], 'speed'],
  ['cd', [-0.05, -0.08, -0.12, -0.16], 'attack speed'],
  ['dodge', [0.04, 0.07, 0.1, 0.14], 'dodge'],
  ['xp', [0.1, 0.2, 0.3, 0.45], 'experience'],
  ['killHeal', [8, 15, 25, 40], 'health per kill'],
];

const pick = (a, r) => a[Math.floor(r() * a.length)];

export function rollRarity(level, min = 0, r = Math.random) {
  const lv = Math.min(30, level || 1);
  const leg = 0.01 + lv * 0.003, epic = 0.06 + lv * 0.008, rare = 0.25 + lv * 0.01;
  const x = r();
  const k = x < leg ? 3 : x < leg + epic ? 2 : x < leg + epic + rare ? 1 : 0;
  return Math.max(min, k);
}

export function rollItem(S, level = 1, opts = {}) {
  const r = Math.random;
  const slot = opts.slot || pick(['weapon', 'armor', 'trinket'], r);
  const rar = opts.rarity ?? rollRarity(level, opts.min || 0, r);
  const L = Math.max(1, Math.min(40, Math.round(level)));
  const m = 1 + 0.03 * L;
  const st = {};
  const jitter = () => 0.85 + r() * 0.3;
  if (slot === 'weapon') {
    st.dmg = [0.06, 0.12, 0.2, 0.3][rar] * m * jitter();
    if (rar >= 1) { const t = pick(TRINKET.slice(0, 2), r); st[t[0]] = t[1][rar - 1]; }
  } else if (slot === 'armor') {
    st.hp = [0.08, 0.15, 0.25, 0.38][rar] * m * jitter();
    st.armor = [0, 0.03, 0.05, 0.08][rar];
  } else {
    const t = pick(TRINKET, r); st[t[0]] = t[1][rar] * (t[0] === 'killHeal' ? 1 : jitter());
    if (rar === 3) { const t2 = pick(TRINKET.filter(x => x !== t), r); st[t2[0]] = t2[1][1]; }
  }
  const base = pick(BASES[slot], r);
  const name = rar === 3 ? `${pick(LEGENDS, r)}, ${base}` : `${pick(PREFIX[rar], r)} ${base}`;
  for (const k in st) st[k] = Math.round(st[k] * 1000) / 1000;
  return { id: S.nextGear = (S.nextGear || 0) + 1, slot, rarity: rar, name, level: L, stats: st, found: opts.from || '' };
}

export function describe(item) {
  const out = [];
  const s = item.stats;
  if (s.dmg) out.push(`+${Math.round(s.dmg * 100)}% damage`);
  if (s.hp) out.push(`+${Math.round(s.hp * 100)}% health`);
  if (s.armor) out.push(`+${Math.round(s.armor * 100)}% armour`);
  if (s.speed) out.push(`+${Math.round(s.speed * 100)}% speed`);
  if (s.cd) out.push(`+${Math.round(-s.cd * 100)}% attack speed`);
  if (s.dodge) out.push(`+${Math.round(s.dodge * 100)}% dodge`);
  if (s.xp) out.push(`+${Math.round(s.xp * 100)}% experience`);
  if (s.killHeal) out.push(`+${Math.round(s.killHeal)} health per kill`);
  return out.join(', ');
}

export function score(item) { return item ? Math.round((item.rarity + 1) * 10 + item.level * 1.5) : 0; }

export function itemById(S, id) { return (S.gear || []).find(g => g.id === id); }
export function equipped(S, rec) { const g = rec.gear || {}; return SLOTS.map(([k]) => itemById(S, g[k])).filter(Boolean); }
export function heroScore(S, rec) { return equipped(S, rec).reduce((a, it) => a + score(it), 0); }
export function ownerOf(S, id) { return S.soldiers.find(s => s.gear && Object.values(s.gear).includes(id)); }

// stat modifiers summed over a soldier's gear
export function mods(S, rec) {
  const m = {};
  for (const it of equipped(S, rec)) for (const k in it.stats) m[k] = (m[k] || 0) + it.stats[k];
  return m;
}

export function grant(R, item, quiet) {
  const S = R.state; S.gear = S.gear || [];
  S.gear.push(item);
  S.stats.gearFound = (S.stats.gearFound || 0) + 1;
  if (item.rarity >= 3) S.stats.legendaries = (S.stats.legendaries || 0) + 1;
  if (!quiet) {
    R.ui.toast(`Found ${RARITY[item.rarity].name.toLowerCase()} gear: ${item.name}.`, item.rarity >= 2 ? 'gold' : '');
    if (item.rarity >= 2) R.sfx('fanfare');
  }
  R.log(`Found ${item.name} (${RARITY[item.rarity].name}).`);
  return item;
}

export function equip(R, rec, id) {
  const S = R.state, it = itemById(S, id); if (!it) return;
  const prev = ownerOf(S, id); if (prev) prev.gear[it.slot] = null;
  rec.gear = rec.gear || {};
  rec.gear[it.slot] = id;
  refreshUnit(R, rec); if (prev && prev !== rec) refreshUnit(R, prev);
  R.sfx('equip');
}
export function unequip(R, rec, slot) { if (rec.gear) rec.gear[slot] = null; refreshUnit(R, rec); }
export function salvageValue(it) { return Math.round(12 * (it.rarity + 1) * (it.rarity + 1) + it.level * 2); }
export function salvage(R, id) {
  const S = R.state, it = itemById(S, id); if (!it) return;
  const o = ownerOf(S, id); if (o) { o.gear[it.slot] = null; refreshUnit(R, o); }
  S.gear = S.gear.filter(g => g !== it);
  R.addRes('gold', salvageValue(it));
  R.sfx('coin');
}
function refreshUnit(R, rec) {
  for (const sc of [R.home, R.exp]) if (sc) for (const u of sc.units) if (u.rec === rec && u.alive) { const f = u.hp / u.maxHp; u.applyStats(); u.hp = Math.max(1, Math.round(u.maxHp * f)); }
}

// a soldier falls: gear is recovered at home, lost forever at sea
export function onFall(R, rec, atHome) {
  const S = R.state; const its = equipped(S, rec);
  if (!its.length) return '';
  if (atHome) return ` Their ${its.map(i => i.name).join(' and ')} went back to the armoury.`;
  S.gear = S.gear.filter(g => !its.includes(g));
  return ` Their ${its.map(i => i.name).join(' and ')} sank with them.`;
}

// best-in-slot helper for "Auto equip"
export function autoEquip(R, rec) {
  const S = R.state;
  for (const [slot] of SLOTS) {
    const cur = itemById(S, rec.gear && rec.gear[slot]);
    const free = S.gear.filter(g => g.slot === slot && !ownerOf(S, g.id));
    const best = free.sort((a, b) => score(b) - score(a))[0];
    if (best && score(best) > score(cur)) equip(R, rec, best.id);
  }
}
