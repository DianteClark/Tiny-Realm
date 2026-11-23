// Villager needs and happiness (3.4). Taverns, Markets and Chapels each serve a number of people;
// a well-served, well-fed, uncrowded realm is happier, gathers faster and attracts newcomers.
import { levelEffects } from './data.js';

export const MOODS = [
  { min: 85, key: 'joyful', name: 'Joyful', gather: 0.15, train: -0.1, arrive: 300, desc: 'Gathering +15%, training 10% faster, newcomers arrive often.' },
  { min: 65, key: 'cheerful', name: 'Cheerful', gather: 0.08, train: 0, arrive: 600, desc: 'Gathering +8%, newcomers arrive now and then.' },
  { min: 35, key: 'content', name: 'Content', gather: 0, train: 0, arrive: 0, desc: 'No bonus. Give your people more to enjoy.' },
  { min: 0, key: 'unhappy', name: 'Unhappy', gather: -0.15, train: 0.15, arrive: 0, desc: 'Gathering -15% and training 15% slower.' },
];
export const NEEDS = [
  ['tavern', 'Drink and company', 'Taverns'],
  ['market', 'Goods and trade', 'Markets'],
  ['chapel', 'Faith and rest', 'Chapels'],
];

export function happiness(R) {
  const S = R.state, pop = Math.max(1, R.popUsed()), parts = [];
  let h = 40; parts.push(['Base', 40]);
  for (const [type, label] of NEEDS) {
    let cap = 0;
    for (const b of R.home.buildings) if (b.type === type && b.done && !b.ruined) cap += levelEffects(type, b.level).serves;
    const cov = Math.min(1, cap / pop), pts = Math.round(cov * 15);
    parts.push([`${label} (${Math.min(cap, pop)} of ${pop} served)`, pts]); h += pts;
  }
  const meat = S.res.meat;
  if (meat >= pop * 10) { parts.push(['Plenty of food', 8]); h += 8; }
  else if (meat < pop * 2) { parts.push(['Food is short', -15]); h -= 15; }
  if (R.popUsed() >= R.popCap()) { parts.push(['Crowded houses', -8]); h -= 8; }
  if (S.lastRaidLost && Date.now() - S.lastRaidLost < 30 * 60000) { parts.push(['The castle fell recently', -15]); h -= 15; }
  if (S.lastRaidWon && Date.now() - S.lastRaidWon < 10 * 60000) { parts.push(['A raid was beaten', 5]); h += 5; }
  const hol = R.holiday();
  if (hol) { parts.push([hol.name, 10]); h += 10; }
  if (R.env.weather === 'storm') { parts.push(['Storm', -5]); h -= 5; }
  if (R.events.market) { parts.push(['Night Market', 3]); h += 3; }
  if (S.relics.springbloom) { parts.push(['Spring Bloom', 10]); h += 10; }
  const deco = Math.min(10, Math.floor((S.decor || []).length / 2));
  if (deco) { parts.push(['Pleasant grounds', deco]); h += deco; }
  const cosy = Math.min(10, R.home.buildings.filter(b => b.type === 'house' && b.done && R.hasBonus && R.hasBonus(b, 'Cosy street')).length * 2);
  if (cosy) { parts.push(['Cosy streets', cosy]); h += cosy; }
  const dec = R.decrees && R.decrees.active();
  if (dec && dec.fx.mood) { parts.push([dec.name, dec.fx.mood]); h += dec.fx.mood; }
  h = Math.max(0, Math.min(100, h));
  return { value: h, mood: MOODS.find(m => h >= m.min), parts };
}

export class Needs {
  constructor(realm) { this.R = realm; this.cache = null; this.t = 0; }
  get() { if (!this.cache) this.cache = happiness(this.R); return this.cache; }
  update(dt) {
    const R = this.R, S = R.state;
    this.t -= dt;
    if (this.t <= 0) { this.t = 2; this.cache = happiness(R); }
    const mood = this.get().mood;
    // newcomers move in when the realm is cheerful and there is room
    if (mood.arrive && !R.exp && R.popUsed() < R.popCap()) {
      S.arriveT = (S.arriveT ?? mood.arrive) - dt;
      if (S.arriveT <= 0) {
        S.arriveT = mood.arrive;
        S.pawns++;
        const busy = S.jobs.wood + S.jobs.gold + S.jobs.meat + S.jobs.build;
        if (busy < S.pawns) { const low = ['wood', 'gold', 'meat'].sort((a, c) => S.res[a] - S.res[c])[0]; S.jobs[low]++; }
        R.spawnPawn();
        S.stats.newcomers = (S.stats.newcomers || 0) + 1;
        R.ui.toast('Word of your happy realm spreads. A family moves in.', 'gold'); R.sfx('ready');
      }
    }
  }
  gatherBonus() { return this.get().mood.gather; }
  trainMult() { return 1 + this.get().mood.train; }
}

// ---- building services
// Tavern: once a day, a wandering hero can be hired. Market: fixed-rate exchange. Chapel: blessing.
export const EXCHANGE = [
  { id: 'w2g', give: { wood: 100 }, get: { gold: 45 }, label: 'Sell 100 wood' },
  { id: 'm2g', give: { meat: 100 }, get: { gold: 50 }, label: 'Sell 100 meat' },
  { id: 'g2w', give: { gold: 60 }, get: { wood: 100 }, label: 'Buy 100 wood' },
  { id: 'g2m', give: { gold: 60 }, get: { meat: 100 }, label: 'Buy 100 meat' },
];
