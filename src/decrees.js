// Royal decrees (3.5): each week three laws are proposed and the ruler picks one. Every law has a
// price. The choice holds until Monday; it can be changed once for gold.

export const DECREES = {
  martial: { name: 'Martial Law', good: 'Soldiers deal 15% more damage', bad: 'Happiness -10', fx: { dmg: 0.15, mood: -10 } },
  markets: { name: 'Open Markets', good: 'Trade boats carry 30% more', bad: 'Raiding parties are 20% larger', fx: { trade: 0.3, raidSize: 0.2 } },
  tithe: { name: 'Harvest Tithe', good: 'Gathering +15%', bad: 'Half the gold from beaten raids', fx: { gather: 0.15, raidGold: -0.5 } },
  builders: { name: "Builders' Guild", good: 'Building and upgrades 30% faster', bad: 'Gathering -5%', fx: { build: -0.3, gather: -0.05 } },
  watch: { name: 'Night Watch', good: 'Watchtowers deal 30% more damage', bad: 'Gathering -5%', fx: { towerDmg: 0.3, gather: -0.05 } },
  academy: { name: 'Royal Academy', good: 'Soldiers earn 30% more experience', bad: 'Training takes 20% longer', fx: { xp: 0.3, train: 0.2 } },
  feast: { name: 'Feast Days', good: 'Happiness +15', bad: 'Gathering -8%', fx: { mood: 15, gather: -0.08 } },
  conscription: { name: 'Conscription', good: 'Training 30% faster', bad: 'Happiness -8', fx: { train: -0.3, mood: -8 } },
  pilgrimage: { name: 'Pilgrimage', good: 'Happiness +8 and experience +10%', bad: 'Gathering -5%', fx: { mood: 8, xp: 0.1, gather: -0.05 } },
};

const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const weekKey = (d = new Date()) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return dstr(m); };

export class Decrees {
  constructor(realm) { this.R = realm; }
  get D() {
    const S = this.R.state, wk = weekKey();
    if (!S.decree || S.decree.week !== wk) {
      const keys = Object.keys(DECREES); let h = 0; for (const c of wk + S.seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const offers = []; while (offers.length < 3) { const k = keys[h % keys.length]; if (!offers.includes(k)) offers.push(k); h = (h * 1103515245 + 12345) >>> 0; }
      S.decree = { week: wk, offers, pick: null, changed: false };
    }
    return S.decree;
  }
  active() { const p = this.D.pick; return p ? DECREES[p] : null; }
  fx(k) { const a = this.active(); return (a && a.fx[k]) || 0; }
  changeCost() { return { gold: 250 + this.R.state.tier * 150 }; }
  choose(key) {
    const R = this.R, D = this.D;
    if (!D.offers.includes(key)) return 'That law is not before the council this week.';
    if (D.pick === key) return;
    if (D.pick) { if (D.changed) return 'The decree can only be changed once a week.'; if (!R.pay(this.changeCost())) return 'Not enough gold to change the law.'; D.changed = true; }
    D.pick = key;
    R.state.stats.decrees = (R.state.stats.decrees || 0) + 1;
    for (const u of R.home.units) if (u.rec && u.alive) { const f = u.hp / u.maxHp; u.applyStats(); u.hp = u.maxHp * f; }
    R.ui.banner('By royal decree', `${DECREES[key].name}. ${DECREES[key].good}. ${DECREES[key].bad}.`, 'gold');
    R.sfx('bell'); R.log(`Decreed: ${DECREES[key].name}.`);
  }
}
