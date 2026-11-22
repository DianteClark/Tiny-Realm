// Seasonal events (3.5). Each real season runs its own event: three season-long tasks, a boss the
// ruler can summon once a week, and tokens to spend in a seasonal shop with a relic of its own.
import { RELICS } from './data.js';

export const SEASON_EVENTS = {
  autumn: {
    name: 'The Harvest Fair', blurb: 'Stalls, bonfires and full barns. A greedy Panda and his gnomes have smelled the pies.',
    boss: { title: 'The Gluttonous Panda', text: 'A huge Panda and a crowd of gnomes are raiding the fair for pies.', units: ['panda', 'gnome', 'gnome', 'slinggnome', 'gnome', 'slinggnome', 'gnoll'] },
    tasks: [
      { id: 'wood', text: n => `Stack ${n} wood for the bonfires`, stat: S => S.stats.wood || 0, n: 3000 },
      { id: 'meat', text: n => `Bring ${n} meat to the feast`, stat: S => S.stats.meat || 0, n: 2000 },
      { id: 'voy', text: n => `Win ${n} voyages`, stat: S => S.stats.voyagesWon || 0, n: 8 },
    ],
    relic: 'harvestsickle',
  },
  winter: {
    name: 'The Long Night', blurb: 'The nights are longest now, and something old walks across the ice with the dead behind it.',
    boss: { title: 'The Frost Troll', text: 'A Troll leads a host of skeletons and bats out of the winter dark.', units: ['troll', 'skull', 'skull', 'bat', 'skull', 'bat', 'imp', 'skull'] },
    tasks: [
      { id: 'night', text: n => `Slay ${n} night creatures`, stat: S => S.stats.nightKills || 0, n: 150 },
      { id: 'nraid', text: n => `Repel ${n} raids by night`, stat: S => S.stats.nightRaids || 0, n: 6 },
      { id: 'abyss', text: n => `Clear ${n} floors of the Abyss`, stat: S => S.stats.abyssFloors || 0, n: 10 },
    ],
    relic: 'frostheart',
  },
  spring: {
    name: 'The Turtle Tide', blurb: 'The sea warms, the lambs are born, and the great turtles come ashore with the sharks behind them.',
    boss: { title: 'The Great Turtle', text: 'An ancient Turtle crawls up the beach, with sharks and bomb fish in its wake.', units: ['turtle', 'paddleshark', 'harpoonshark', 'bombfish', 'paddleshark', 'harpoonshark'] },
    tasks: [
      { id: 'trips', text: n => `Bring home ${n} trade boats`, stat: S => S.stats.tradeTrips || 0, n: 15 },
      { id: 'newc', text: n => `Welcome ${n} newcomers`, stat: S => S.stats.newcomers || 0, n: 6 },
      { id: 'gold', text: n => `Mine ${n} gold`, stat: S => S.stats.gold || 0, n: 2500 },
    ],
    relic: 'springbloom',
  },
  summer: {
    name: 'The Midsummer War', blurb: 'Long days and hot tempers. A Minotaur has gathered the badlands to march on you.',
    boss: { title: 'The Minotaur Warlord', text: 'A Minotaur leads gnolls and lizards ashore, horns painted for war.', units: ['minotaur', 'gnoll', 'lizard', 'gnoll', 'lizard', 'spider', 'gnoll'] },
    tasks: [
      { id: 'kills', text: n => `Slay ${n} foes`, stat: S => S.stats.kills || 0, n: 400 },
      { id: 'raids', text: n => `Repel ${n} raids`, stat: S => S.stats.raidsSurvived || 0, n: 10 },
      { id: 'abyss', text: n => `Clear ${n} floors of the Abyss`, stat: S => S.stats.abyssFloors || 0, n: 10 },
    ],
    relic: 'sunstone',
  },
};
export const SEASON_RELICS = {
  harvestsickle: { name: 'Harvest Sickle', desc: '+8% to everything gathered' },
  frostheart: { name: 'Frostheart', desc: 'Watchtowers deal 20% more damage' },
  springbloom: { name: 'Spring Bloom', desc: 'Happiness +10' },
  sunstone: { name: 'Sunstone', desc: 'Soldiers deal 8% more damage' },
};
Object.assign(RELICS, SEASON_RELICS);

const TASK_TOKENS = 4, BOSS_TOKENS = 5;
export const SHOP = [
  { id: 'relic', name: 'Season relic', cost: 12 },
  { id: 'legend', name: 'Seasonal legendary', cost: 10 },
  { id: 'chest', name: 'Epic war chest', cost: 5 },
  { id: 'bundle', name: 'Fair goods', cost: 2 },
];

const weekKey = (d = new Date()) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.toDateString(); };

export class Seasonal {
  constructor(realm) { this.R = realm; }
  key() { // winter spans the new year: December belongs to the winter that ends in February
    const d = new Date(Date.now() + (this.R.env.offset || 0) * 3600000), s = this.R.env.season.key;
    const y = d.getFullYear() + (s === 'winter' && d.getMonth() === 11 ? 1 : 0);
    return s + y;
  }
  get ev() { return SEASON_EVENTS[this.R.env.season.key]; }
  get st() {
    const S = this.R.state, k = this.key();
    if (!S.season || S.season.key !== k) {
      const tier = S.tier, scale = 0.6 + tier * 0.2;
      S.season = { key: k, tokens: (S.season && S.season.key !== k) ? 0 : 0, tasks: this.ev.tasks.map(t => ({ id: t.id, n: Math.round(t.n * scale), base: t.stat(S), done: false })), bossWeek: '', bought: {} };
    }
    return S.season;
  }
  endsIn() { // ms until the season changes
    const d = new Date(Date.now() + (this.R.env.offset || 0) * 3600000), m = d.getMonth();
    const nextStart = [2, 5, 8, 11].find(x => x > m) ?? 14; // months where seasons begin (Mar, Jun, Sep, Dec)
    const end = new Date(d.getFullYear() + (nextStart >= 12 ? 1 : 0), nextStart % 12, 1);
    return end - d;
  }
  update() {
    const S = this.R.state, st = this.st, ev = this.ev;
    st.tasks.forEach((t, i) => {
      if (t.done) return;
      const def = ev.tasks[i]; t.have = Math.min(t.n, Math.max(0, def.stat(S) - t.base));
      if (t.have >= t.n) { t.done = true; st.tokens += TASK_TOKENS; this.R.ui.toast(`${ev.name}: "${def.text(t.n)}" done. +${TASK_TOKENS} tokens.`, 'gold'); this.R.sfx('streak'); }
    });
  }
  bossReady() { return this.st.bossWeek !== weekKey(); }
  summonBlock() {
    const R = this.R;
    if (!this.bossReady()) return 'The boss has already come this week.';
    if (R.exp) return 'Come home first.';
    if ((R.raid && R.raid.active) || R.events.blocking || R.slam) return 'Deal with the current threat first.';
    return null;
  }
  summon() {
    const R = this.R, err = this.summonBlock(); if (err) return err;
    const ev = this.ev, st = this.st, S = R.state;
    st.bossWeek = weekKey();
    const units = ev.boss.units.slice(); for (let i = 1; i < S.tier; i++) units.push(ev.boss.units[1 + (i % (units.length - 1))]);
    const plan = R.planRaid('season', { units, region: { key: 'season', name: ev.name, enemies: units }, elite: false });
    plan.queue[0].elite = true;
    R.showBoat(plan);
    const keep = S.timers.raid;
    R.startRaid(plan, {
      title: ev.boss.title, text: ev.boss.text,
      onEnd: won => {
        if (!won) { R.ui.toast(`${ev.boss.title} got away with the spoils. It will be back next week.`, 'red'); return; }
        st.tokens += BOSS_TOKENS; S.stats.seasonBosses = (S.stats.seasonBosses || 0) + 1;
        R.dropGear(4 + S.tier * 3, { min: 2, from: ev.name });
        R.ui.banner(`${ev.boss.title} is beaten`, `+${BOSS_TOKENS} ${ev.name} tokens and a piece of epic gear.`, 'gold');
      },
    });
    S.timers.raid = keep;
  }
  price(id) { return SHOP.find(x => x.id === id).cost; }
  buy(id) {
    const R = this.R, S = R.state, st = this.st, ev = this.ev, cost = this.price(id);
    if (id === 'relic' && S.relics[ev.relic]) return 'You already hold this season\'s relic.';
    if (id === 'legend' && st.bought.legend) return 'One per season.';
    if (st.tokens < cost) return 'Not enough tokens.';
    st.tokens -= cost; st.bought[id] = (st.bought[id] || 0) + 1;
    if (id === 'relic') { S.relics[ev.relic] = true; R.ui.banner('Season relic claimed', `${RELICS[ev.relic].name}: ${RELICS[ev.relic].desc}.`, 'gold'); R.sfx('fanfare'); }
    else if (id === 'legend') { const it = R.dropGear(8 + S.tier * 4, { rarity: 3, from: ev.name }); it.name = it.name.replace(/^[^,]+/, { autumn: 'Harvestmoon', winter: 'Frostbite', spring: 'Tidebloom', summer: 'Sunforged' }[R.env.season.key]); }
    else if (id === 'chest') R.dropGear(4 + S.tier * 3, { min: 2, from: ev.name });
    else { const g = 200 + S.tier * 120; R.addAll({ gold: g, wood: g, meat: g }); R.sfx('coin'); }
  }
}
