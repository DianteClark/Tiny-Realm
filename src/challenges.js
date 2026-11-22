// Daily and weekly challenges (3.4). The same challenge for everyone on a given day (seeded by the
// date and the realm), with a twist that Day/Night Orders do not have. Completing the daily
// challenge on consecutive days builds a streak with growing rewards.
import { audio } from './audio.js';

const dstr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekKey = d => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return dstr(m); };
const ranged = t => ['archer', 'catapult'].includes(t);
const melee = t => !ranged(t) && t !== 'monk';

// kind 'stat': progress = stat now - stat when posted. kind 'event': counts matching events.
export const DAILY = [
  { id: 'small', text: () => 'Win a voyage with 3 soldiers or fewer', kind: 'event', on: 'voyage', match: e => e.squad.length <= 3, n: () => 1 },
  { id: 'archers', text: () => 'Win a voyage with only archers and catapults', kind: 'event', on: 'voyage', match: e => e.squad.every(ranged), n: () => 1 },
  { id: 'steel', text: () => 'Win a voyage with only melee fighters', kind: 'event', on: 'voyage', match: e => e.squad.every(melee), n: () => 1 },
  { id: 'nolosses', text: () => 'Win a voyage without losing anyone', kind: 'event', on: 'voyage', match: e => e.lost === 0, n: () => 1 },
  { id: 'unbroken', text: () => 'Repel a raid without losing a building', kind: 'event', on: 'raid', match: e => e.downs === 0, n: () => 1 },
  { id: 'butcher', text: n => `Slay ${n} foes`, kind: 'stat', stat: S => S.stats.kills || 0, n: t => 25 + t * 8 },
  { id: 'abilities', text: n => `Use ${n} hero abilities`, kind: 'stat', stat: S => S.stats.abilities || 0, n: t => 5 + t },
  { id: 'lumber', text: n => `Gather ${n} wood`, kind: 'stat', stat: S => S.stats.wood || 0, n: t => 300 + t * 150 },
  { id: 'prospect', text: n => `Mine ${n} gold`, kind: 'stat', stat: S => S.stats.gold || 0, n: t => 220 + t * 120 },
  { id: 'muster', text: n => `Train ${n} soldiers`, kind: 'stat', stat: S => Object.entries(S.stats).filter(([k]) => k.startsWith('trained_') && k !== 'trained_pawn').reduce((a, [, v]) => a + v, 0), n: t => 2 + t },
];
export const WEEKLY = [
  { id: 'w_voyages', text: n => `Win ${n} voyages`, kind: 'stat', stat: S => S.stats.voyagesWon || 0, n: t => 4 + t },
  { id: 'w_raids', text: n => `Repel ${n} raids`, kind: 'stat', stat: S => S.stats.raidsSurvived || 0, n: t => 5 + t },
  { id: 'w_slayer', text: n => `Slay ${n} foes`, kind: 'stat', stat: S => S.stats.kills || 0, n: t => 200 + t * 60 },
  { id: 'w_lean', text: n => `Win ${n} voyages with 4 soldiers or fewer`, kind: 'event', on: 'voyage', match: e => e.squad.length <= 4, n: () => 3 },
  { id: 'w_boss', text: () => 'Defeat a boss island, rival capital or great event', kind: 'event', on: 'boss', match: () => true, n: () => 1 },
  { id: 'w_orders', text: n => `Complete ${n} Day or Night Orders`, kind: 'stat', stat: S => S.stats.ordersDone || 0, n: () => 8 },
  { id: 'w_gear', text: n => `Find ${n} pieces of gear`, kind: 'stat', stat: S => S.stats.gearFound || 0, n: () => 6 },
];

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

export class Challenges {
  constructor(realm) { this.R = realm; }
  get C() { const S = this.R.state; return S.chal || (S.chal = { day: null, week: null, streak: 0, best: 0, lastDone: '' }); }
  post(slot) {
    const S = this.R.state, C = this.C, now = new Date();
    const key = slot === 'day' ? dstr(now) : weekKey(now);
    const pool = slot === 'day' ? DAILY : WEEKLY;
    const t = pool[hash(key + slot + S.seed) % pool.length];
    const n = Math.round(t.n(S.tier));
    C[slot] = { key, id: t.id, text: t.text(n), n, base: t.kind === 'stat' ? t.stat(S) : 0, have: 0, done: false };
  }
  tpl(slot, id) { return (slot === 'day' ? DAILY : WEEKLY).find(t => t.id === id); }
  update() {
    const C = this.C, now = new Date();
    if (!C.day || C.day.key !== dstr(now)) {
      // a missed day breaks the streak
      const y = new Date(now); y.setDate(y.getDate() - 1);
      if (C.lastDone && C.lastDone !== dstr(y) && C.lastDone !== dstr(now)) C.streak = 0;
      this.post('day');
    }
    if (!C.week || C.week.key !== weekKey(now)) this.post('week');
    for (const slot of ['day', 'week']) {
      const c = C[slot], t = this.tpl(slot, c.id); if (!t || c.done) continue;
      if (t.kind === 'stat') c.have = Math.min(c.n, Math.max(0, t.stat(this.R.state) - c.base));
      if (c.have >= c.n) this.complete(slot);
    }
  }
  note(on, e) {
    const C = this.C;
    for (const slot of ['day', 'week']) {
      const c = C[slot]; if (!c || c.done) continue;
      const t = this.tpl(slot, c.id);
      if (t && t.kind === 'event' && t.on === on && t.match(e)) { c.have = Math.min(c.n, c.have + 1); if (c.have >= c.n) this.complete(slot); }
    }
  }
  rewardFor(slot) {
    const S = this.R.state, C = this.C, tier = S.tier;
    if (slot === 'week') return { res: { gold: 400 + tier * 250, wood: 300 + tier * 150 }, gear: { min: 2, level: 6 + tier * 4 }, fragment: true };
    const st = C.streak + 1; // the streak this completion will make
    const mult = 1 + Math.min(st - 1, 6) * 0.2;
    const gear = st % 7 === 0 ? { rarity: 3, level: 8 + tier * 4 } : st % 3 === 0 ? { min: 2, level: 5 + tier * 3 } : { min: 1, level: 3 + tier * 3 };
    return { res: { gold: Math.round((120 + tier * 80) * mult), meat: Math.round((80 + tier * 50) * mult) }, gear };
  }
  complete(slot) {
    const R = this.R, S = R.state, C = this.C, c = C[slot];
    const rw = this.rewardFor(slot);
    c.done = true;
    R.addAll(rw.res);
    R.dropGear(rw.gear.level, { ...rw.gear, from: slot === 'day' ? 'a daily challenge' : 'a weekly challenge' });
    if (rw.fragment) S.fragments = (S.fragments || 0) + 1;
    if (slot === 'day') {
      C.streak++; C.best = Math.max(C.best, C.streak); C.lastDone = dstr(new Date());
      S.stats.dailyChallenges = (S.stats.dailyChallenges || 0) + 1;
      R.ui.banner(C.streak > 1 ? `Daily challenge: ${C.streak} day streak` : 'Daily challenge complete', `${c.text}. ${C.streak % 7 === 6 ? 'Tomorrow completes a week: a legendary piece awaits.' : 'Come back tomorrow to keep the streak.'}`, 'gold');
    } else {
      S.stats.weeklyChallenges = (S.stats.weeklyChallenges || 0) + 1;
      R.ui.banner('Weekly challenge complete', `${c.text}. You also earn a relic fragment.`, 'gold');
    }
    audio.play('streak');
  }
  // what tomorrow's streak reward will be, for the UI
  nextPrize() { const st = this.C.streak + 1; return st % 7 === 0 ? 'a legendary piece' : st % 3 === 0 ? 'an epic piece' : 'a rare piece'; }
}
