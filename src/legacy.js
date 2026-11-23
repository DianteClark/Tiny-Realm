// New Game+ (3.5). Founding a new realm turns the old one's deeds into Legacy points. Legacy rank gives
// every future realm lasting bonuses, and one chosen hero sails along as the new realm's founder.
// Kept outside the save so it survives wiping and founding.

const KEY = 'tinyrealm.legacy';

export function loadLegacy() {
  try { return Object.assign({ points: 0, realms: [], founder: null }, JSON.parse(localStorage.getItem(KEY) || 'null') || {}); }
  catch (e) { return { points: 0, realms: [], founder: null }; }
}
export function saveLegacy(L) { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* storage full or blocked */ } }

export const rankOf = points => Math.min(20, Math.floor(points / 100));
export function rankBonus(rank) {
  return { gather: rank * 0.02, hp: rank * 0.02, dmg: rank * 0.02, xp: rank * 0.03, start: rank * 60, pawns: Math.min(4, Math.floor(rank / 3)) };
}

// what the current realm is worth
export function realmScore(R) {
  const S = R.state, parts = [];
  const add = (label, n, each) => { if (n > 0) parts.push([label, n, n * each]); };
  add('Castle tier', S.tier, 20);
  add('Renown', S.renown, 25);
  add('Islands cleared', S.cleared, 3);
  add('Deepest Abyss floor', (S.abyss && S.abyss.best) || 0, 4);
  add('Story chapters', (S.story && S.story.done) || 0, 10);
  add('Relics', Object.values(S.relics).filter(Boolean).length, 5);
  add('Vassal houses', Object.values(S.rivals || {}).filter(r => r.subjugated).length, 15);
  add('Promotions', S.stats.promotions || 0, 5);
  return { parts, total: parts.reduce((a, p) => a + p[2], 0) };
}

export const canFound = R => R.state.tier >= 3;

// wiping starts over completely, but the realm (and its seed) is still remembered in the Hall
export function recordWipe(R) {
  const S = R.state, L = loadLegacy();
  L.realms.unshift({ seed: R.sea && R.sea.ocean ? R.sea.words() : null, ended: Date.now(), days: Math.floor((Date.now() - S.created) / 86400000) + 1, tier: S.tier, renown: S.renown, cleared: S.cleared, abyss: (S.abyss && S.abyss.best) || 0, chapters: (S.story && S.story.done) || 0, points: 0, wiped: true, saga: R.saga ? R.saga.summary() : null, house: S.dynasty ? S.dynasty.house : null });
  L.realms.length = Math.min(L.realms.length, 20);
  L.points = 0; L.founder = null;
  saveLegacy(L);
}

// write the legacy record; the caller then wipes the save and reloads
export function foundNewRealm(R, founderId) {
  const S = R.state, L = loadLegacy(), sc = realmScore(R);
  const days = Math.floor((Date.now() - S.created) / 86400000) + 1;
  L.points += sc.total;
  L.realms.unshift({ seed: R.sea && R.sea.ocean ? R.sea.words() : null, ended: Date.now(), days, tier: S.tier, renown: S.renown, cleared: S.cleared, abyss: (S.abyss && S.abyss.best) || 0, chapters: (S.story && S.story.done) || 0, points: sc.total, saga: R.saga ? R.saga.summary() : null, house: S.dynasty ? S.dynasty.house : null });
  L.realms.length = Math.min(L.realms.length, 20);
  const rec = S.soldiers.find(s => s.id === founderId);
  if (rec) {
    const eq = Object.values(rec.gear || {}).map(id => (S.gear || []).find(g => g.id === id)).filter(Boolean);
    const best = eq.sort((a, b) => b.rarity - a.rarity || b.level - a.level)[0] || null;
    L.founder = { name: rec.name, type: rec.type, traits: rec.traits.slice(0, 3), avatar: rec.avatar, kills: rec.kills, title: rec.title || null, heirloom: best ? { ...best } : null };
  } else L.founder = null;
  saveLegacy(L);
  return L;
}

// a brand-new realm receives its inheritance
export function applyToFresh(S) {
  const L = loadLegacy(), rank = rankOf(L.points), b = rankBonus(rank);
  S.legacyRank = rank;
  if (rank) {
    for (const k of ['gold', 'wood', 'meat']) S.res[k] += b.start;
    S.pawns += b.pawns; S.jobs.wood += b.pawns;
  }
  const f = L.founder;
  if (f) {
    const rec = { id: S.nextId++, name: f.name, type: f.type, level: 5, xp: 280, traits: f.traits, kills: 0, avatar: f.avatar, status: 'home', joined: Date.now(), founder: true, title: 'Founder', promoted: false };
    S.soldiers.push(rec);
    if (f.heirloom) { const it = { ...f.heirloom, id: (S.nextGear = (S.nextGear || 0) + 1), found: 'your last realm' }; S.gear = S.gear || []; S.gear.push(it); rec.gear = { [it.slot]: it.id }; }
    L.founder = null; saveLegacy(L);
    S.log = S.log || []; S.log.unshift({ t: Date.now(), text: `${rec.name} sailed from the old realm to found this one.` });
  }
  return { rank, founder: f };
}
