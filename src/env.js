// Seasons, weather and the day/night cycle.
// Time of day follows the player's real clock: dawn and dusk come at real
// hours (later sunsets in summer, longer nights in winter). Seasons follow the
// real calendar (winter is December to February) and weather rolls every few minutes.
import { drawSprite } from './assets.js';
import { T } from './terrain.js';

export const SEASONS = [
  { key: 'spring', name: 'Spring', desc: 'Lambs are born twice as fast. +10% meat.', meat: 0.1, breed: 2, tint: null, dawn: 6, dusk: 20, colors: [1, 3, 2] },
  { key: 'summer', name: 'Summer', desc: 'Long days. +15% gold.', gold: 0.15, tint: 'rgba(255,220,120,0.06)', dawn: 5, dusk: 21, colors: [3, 1, 2] },
  { key: 'autumn', name: 'Autumn', desc: 'Falling leaves. +20% wood.', wood: 0.2, tint: 'rgba(230,140,60,0.05)', leaves: true, dawn: 6.5, dusk: 19, colors: [4, 2, 1] },
  { key: 'winter', name: 'Winter', desc: 'Cold hands: -20% wood, no lambs. Soldiers gain +20% experience.', wood: -0.2, breed: 0, xp: 0.2, tint: 'rgba(150,190,255,0.08)', snow: true, dawn: 7, dusk: 18, colors: [2, 5, 3] },
];
export const WEATHER = {
  clear: { name: 'Clear', desc: '' },
  cloudy: { name: 'Cloudy', desc: 'Grey skies.', clouds: 6 },
  rain: { name: 'Rain', desc: 'Archers and towers lose 15% range. Fires burn out fast.', rain: 1, range: -0.15, clouds: 5 },
  storm: { name: 'Storm', desc: 'Lightning and heavy rain. Archers lose 25% range.', rain: 2, range: -0.25, clouds: 8, lightning: true },
  fog: { name: 'Fog', desc: 'Thick fog. Everyone spots foes later.', fog: true, aggro: -0.25 },
};

export class Environment {
  constructor(realm) {
    this.R = realm;
    this.weather = 'clear'; this.weatherT = 120 + Math.random() * 180;
    this.drops = []; this.flash = 0; this.lightT = 6;
  }
  // northern-hemisphere meteorological seasons from the real date
  get season() { const m = new Date(Date.now() + (this.offset || 0) * 3600000).getMonth(); return SEASONS[[3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][m]]; }
  get w() { return WEATHER[this.weather]; }
  // real local time in hours (0..24). this.offset lets tests fake the clock.
  get hour() { const d = new Date(Date.now() + (this.offset || 0) * 3600000); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
  get phase() { return this.hour / 24; } // 0 = midnight, 0.5 = noon
  // 0 = full day, 1 = full night, with 45-minute dawn and dusk
  get night() {
    const h = this.hour, s = this.season, ramp = 0.75;
    if (h >= s.dawn + ramp && h <= s.dusk) return 0;
    if (h > s.dusk && h < s.dusk + ramp) return (h - s.dusk) / ramp;
    if (h >= s.dawn && h < s.dawn + ramp) return 1 - (h - s.dawn) / ramp;
    return 1;
  }
  get period() { const d = new Date(Date.now() + (this.offset || 0) * 3600000); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${this.isNight ? 'night' : 'day'}`; }
  clock() { const d = new Date(Date.now() + (this.offset || 0) * 3600000); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  get isNight() { return this.night > 0.5; }
  update(dt) {
    // seasons recolour the home island's grass
    const sk = this.season.key;
    if (sk !== this.appliedSeason && this.R.home) {
      this.appliedSeason = sk;
      const m = this.R.home.map, c = this.season.colors;
      if (m.colors.join() !== c.join()) { m.colors = c.slice(); if (this.R.home.terrain.invalidate) this.R.home.terrain.invalidate(); }
    }
    // dawn and dusk announcements
    const n = this.isNight;
    if (this.wasNight !== undefined && n !== this.wasNight) {
      this.R.ui.banner(n ? 'Night falls' : 'Dawn breaks', n ? 'Torches are lit. Night creatures prowl, raids hit harder and pay more. New night orders are posted.' : 'The sun is up. New day orders are posted.', n ? 'purple' : 'gold');
      this.R.sfx(n ? 'hex' : 'bell');
    }
    this.wasNight = n;
    this.weatherT -= dt;
    if (this.weatherT <= 0) this.roll();
    if (this.flash > 0) this.flash -= dt * 3;
    if (this.w.lightning) {
      this.lightT -= dt;
      if (this.lightT <= 0) { this.lightT = 5 + Math.random() * 10; this.flash = 1; this.R.sfx('thud'); this.R.shake(3); }
    }
  }
  roll() {
    const hol = this.R.holiday && this.R.holiday();
    if (hol && (hol.clear || hol.key === 'easter')) { this.weather = 'clear'; this.weatherT = 300; return; }
    const s = this.season.key;
    const table = s === 'winter' ? { clear: 3, cloudy: 3, fog: 2, storm: 1 } : s === 'autumn' ? { clear: 3, cloudy: 2, rain: 3, fog: 2, storm: 1 } : s === 'spring' ? { clear: 4, cloudy: 2, rain: 3, storm: 1 } : { clear: 6, cloudy: 2, rain: 1, storm: 1 };
    let n = Object.values(table).reduce((a, b) => a + b, 0) * Math.random();
    let pick = 'clear';
    for (const [k, v] of Object.entries(table)) { n -= v; if (n <= 0) { pick = k; break; } }
    if (pick !== this.weather) {
      this.weather = pick;
      if (pick !== 'clear') this.R.ui.toast(`Weather: ${WEATHER[pick].name}. ${WEATHER[pick].desc}`);
    }
    this.weatherT = 150 + Math.random() * 240;
  }
  // multipliers used by the simulation
  gather(r) { return this.season[r] || 0; }
  breed() { return this.season.breed ?? 1; }
  rangeMul() { return 1 + (this.w.range || 0); }
  aggroMul() { return 1 + (this.w.aggro || 0); }
  xpMul() { return this.season.xp || 0; }

  // world-space extras: torches and window glow at night
  drawWorld(ctx, scene) {
    const hol = this.R.holiday(), n = this.night;
    if (scene.kind === 'home' && hol && hol.glow && n > 0.05) { // a star over the castle on holy nights
      const c = this.R.castle, x = c.x, y = c.y - 260;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 120);
      g.addColorStop(0, `rgba(255,240,170,${0.9 * n})`); g.addColorStop(0.15, `rgba(255,220,120,${0.35 * n})`); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - 120, y - 120, 240, 240); ctx.globalCompositeOperation = 'source-over';
    }
    if (scene.kind === 'home' && hol && hol.fireworks && n > 0.5) {
      this.fwT = (this.fwT || 0) - 1 / 60;
      if (this.fwT <= 0) { this.fwT = 0.8 + Math.random() * 1.6; const c = this.R.castle; scene.fxAt(Math.random() < 0.5 ? 'explosion1' : 'explosion2', c.x + (Math.random() - 0.5) * 500, c.y - 250 - Math.random() * 200, { scale: 0.6 + Math.random() * 0.6 }); this.R.sfx('thud'); }
    }
    if (n <= 0.05 || scene.kind !== 'home') return;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of scene.buildings) {
      if (!b.done || b.ruined || (b.def.wall && !b.def.lantern)) continue;
      const r = b.type === 'castle' ? 170 : b.def.lantern ? 5 * 64 : 90;
      const g = ctx.createRadialGradient(b.x, b.y - 40, 4, b.x, b.y - 40, r);
      g.addColorStop(0, `rgba(255,190,90,${0.28 * n})`); g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g; ctx.fillRect(b.x - r, b.y - 40 - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of scene.buildings) if (b.type === 'castle' || b.type === 'tower') {
      drawSprite(ctx, 'fire1', b.x - (b.type === 'castle' ? 46 : 30), b.y - 6, scene.time, { alpha: n });
      drawSprite(ctx, 'fire1', b.x + (b.type === 'castle' ? 46 : 30), b.y - 6, scene.time + 0.3, { alpha: n });
    }
  }
  // screen-space: darkness, tints, rain, snow, leaves, fog, lightning
  drawScreen(ctx, vw, vh, scene, cam) {
    const n = scene.kind === 'home' ? this.night : 0;
    const moon = this.R.moon(), hol = this.R.holiday();
    if (n > 0) {
      const k = moon.full ? 0.72 : moon.dark ? 1.25 : 1;
      ctx.fillStyle = moon.full ? `rgba(40,55,110,${0.36 * n * k})` : `rgba(20,24,70,${0.36 * n * k})`; ctx.fillRect(0, 0, vw, vh);
      if (moon.full) { ctx.fillStyle = `rgba(200,215,255,${0.05 * n})`; ctx.fillRect(0, 0, vw, vh); }
    }
    if (this.season.tint) { ctx.fillStyle = this.season.tint; ctx.fillRect(0, 0, vw, vh); }
    const w = this.w;
    if (w.rain || w.storm) { ctx.fillStyle = `rgba(30,50,80,${0.08 * (w.rain || 1)})`; ctx.fillRect(0, 0, vw, vh); }
    const snow = this.season.snow || (hol && hol.snow);
    const want = w.rain ? 120 * w.rain : snow ? 90 : this.season.leaves ? 26 : 0;
    const kind = w.rain ? 'rain' : snow ? 'snow' : this.season.leaves ? 'leaf' : null;
    while (this.drops.length < want) this.drops.push({ x: Math.random() * vw, y: Math.random() * vh, v: 0.6 + Math.random() * 0.8, p: Math.random() * 6 });
    if (this.drops.length > want) this.drops.length = want;
    const s = vw / 400;
    for (const d of this.drops) {
      if (kind === 'rain') {
        d.y += 14 * d.v * s; d.x -= 3 * s;
        ctx.strokeStyle = 'rgba(200,225,255,0.45)'; ctx.lineWidth = Math.max(1, s * 0.8);
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 3 * s, d.y - 12 * s); ctx.stroke();
      } else if (kind === 'snow') {
        d.y += 1.2 * d.v * s; d.p += 0.03; d.x += Math.sin(d.p) * 0.6 * s;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; const r = Math.max(2, 2.2 * s * d.v); ctx.fillRect(d.x, d.y, r, r);
      } else if (kind === 'leaf') {
        d.y += 1.1 * d.v * s; d.p += 0.05; d.x += Math.sin(d.p) * 1.4 * s;
        ctx.fillStyle = d.v > 1 ? '#d9822b' : '#e8b93a'; const r = Math.max(3, 3 * s); ctx.fillRect(d.x, d.y, r * 1.4, r);
      }
      if (d.y > vh + 20) { d.y = -20; d.x = Math.random() * vw; }
      if (d.x < -20) d.x = vw + 10;
    }
    if (w.fog) { ctx.fillStyle = 'rgba(220,230,235,0.22)'; ctx.fillRect(0, 0, vw, vh); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 * this.flash})`; ctx.fillRect(0, 0, vw, vh); }
  }
  label() { const m = this.R.moon(); return `${this.clock()} ${this.season.name}${this.weather !== 'clear' ? ', ' + this.w.name : ''}${this.isNight ? ', ' + m.name : ''}`; }
}
