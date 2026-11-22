// Day and Night Orders: two objectives posted at every dawn and dusk (real clock).
import { audio } from './audio.js';

const sum = (S, pre, skip) => Object.entries(S.stats).filter(([k]) => k.startsWith(pre) && k !== skip).reduce((a, [, v]) => a + v, 0);
const TEMPLATES = {
  day: [
    { id: 'wood', text: n => `Gather ${n} wood`, stat: S => S.stats.wood || 0, n: t => 150 * t },
    { id: 'gold', text: n => `Mine ${n} gold`, stat: S => S.stats.gold || 0, n: t => 120 * t },
    { id: 'meat', text: n => `Bring in ${n} meat`, stat: S => S.stats.meat || 0, n: t => 120 * t },
    { id: 'train', text: n => `Train ${n} soldiers`, stat: S => sum(S, 'trained_', 'trained_pawn'), n: t => 2 + t },
    { id: 'kills', text: n => `Slay ${n} foes`, stat: S => S.stats.kills, n: t => 8 + t * 4 },
    { id: 'voyage', text: () => 'Win a voyage', stat: S => S.stats.voyagesWon || 0, n: () => 1 },
    { id: 'upgrade', text: () => 'Build or upgrade something', stat: S => sum(S, 'built_') + (S.stats.upgrades || 0), n: () => 1 },
  ],
  night: [
    { id: 'nightraid', text: () => 'Repel a raid by night', stat: S => S.stats.nightRaids || 0, n: () => 1 },
    { id: 'creatures', text: n => `Slay ${n} night creatures`, stat: S => S.stats.nightKills || 0, n: t => 6 + t * 3 },
    { id: 'towers', text: n => `Let your towers fell ${n} foes`, stat: S => S.stats.towerKills || 0, n: t => 3 + t * 2 },
    { id: 'moongold', text: n => `Mine ${n} gold by moonlight`, stat: S => S.stats.gold || 0, n: t => 80 * t },
    { id: 'kills', text: n => `Slay ${n} foes in the dark`, stat: S => S.stats.kills, n: t => 6 + t * 3 },
  ],
};

export class Orders {
  constructor(realm) { this.R = realm; }
  get list() { return (this.R.state.orders && this.R.state.orders.list) || []; }
  tpl(kind, id) { return TEMPLATES[kind].find(t => t.id === id); }
  update() {
    const R = this.R, S = R.state, period = R.env.period;
    if (!S.orders || S.orders.period !== period) this.post(period);
    for (const o of S.orders.list) {
      if (o.done) continue;
      const t = this.tpl(S.orders.kind, o.id); if (!t) continue;
      o.have = Math.min(o.n, Math.max(0, t.stat(S) - o.base));
      if (o.have >= o.n) {
        o.done = true;
        R.addAll(o.reward);
        R.ui.toast(`${S.orders.kind === 'night' ? 'Night' : 'Day'} order complete: ${o.text}. Reward: ${Object.entries(o.reward).map(([k, v]) => v + ' ' + k).join(', ')}.`, 'gold');
        audio.play('complete');
        S.stats.ordersDone = (S.stats.ordersDone || 0) + 1;
      }
    }
  }
  post(period) {
    const R = this.R, S = R.state, kind = period.endsWith('night') ? 'night' : 'day', tier = S.tier;
    let h = 0; for (const ch of period + S.seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = TEMPLATES[kind].slice(), list = [];
    while (list.length < 2 && pool.length) {
      const t = pool.splice(h % pool.length, 1)[0]; h = (h * 1103515245 + 12345) >>> 0;
      const n = Math.round(t.n(tier));
      const mult = kind === 'night' ? 1.5 : 1;
      list.push({ id: t.id, text: t.text(n), n, base: t.stat(S), have: 0, done: false, reward: { gold: Math.round((80 + tier * 60) * mult), wood: Math.round((60 + tier * 40) * mult), meat: Math.round((40 + tier * 30) * mult) } });
    }
    S.orders = { period, kind, list };
  }
}
