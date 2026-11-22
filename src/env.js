// Seasons, weather and the day/night cycle.
// Seasons follow the real calendar (each lasts two real days), weather rolls
// every few minutes, and a full day passes every 12 minutes of play.
import { drawSprite } from './assets.js';
import { T } from './terrain.js';

export const SEASONS = [
  { key: 'spring', name: 'Spring', desc: 'Lambs are born twice as fast. +10% meat.', meat: 0.1, breed: 2, tint: null },
  { key: 'summer', name: 'Summer', desc: 'Long days. +15% gold.', gold: 0.15, day: 1.25, tint: 'rgba(255,220,120,0.06)' },
  { key: 'autumn', name: 'Autumn', desc: 'Falling leaves. +20% wood.', wood: 0.2, tint: 'rgba(230,140,60,0.08)', leaves: true },
  { key: 'winter', name: 'Winter', desc: 'Cold hands: -20% wood, no lambs. Soldiers gain +20% experience.', wood: -0.2, breed: 0, xp: 0.2, day: 0.8, tint: 'rgba(150,190,255,0.12)', snow: true },
];
export const WEATHER = {
  clear: { name: 'Clear', desc: '' },
  cloudy: { name: 'Cloudy', desc: 'Grey skies.', clouds: 6 },
  rain: { name: 'Rain', desc: 'Archers and towers lose 15% range. Fires burn out fast.', rain: 1, range: -0.15, clouds: 5 },
  storm: { name: 'Storm', desc: 'Lightning and heavy rain. Archers lose 25% range.', rain: 2, range: -0.25, clouds: 8, lightning: true },
  fog: { name: 'Fog', desc: 'Thick fog. Everyone spots foes later.', fog: true, aggro: -0.25 },
};
const DAY_LEN = 720; // seconds per full day

export class Environment {
  constructor(realm) {
    this.R = realm;
    this.t = (Date.now() / 1000) % DAY_LEN;
    this.weather = 'clear'; this.weatherT = 120 + Math.random() * 180;
    this.drops = []; this.flash = 0; this.lightT = 6;
  }
  get season() { return SEASONS[Math.floor(Date.now() / 86400000 / 2) % 4]; }
  get w() { return WEATHER[this.weather]; }
  // 0 = midnight, 0.5 = noon
  get phase() { return ((this.t / DAY_LEN) + 0.35) % 1; }
  get night() {
    const p = this.phase, dl = 0.22 * (this.season.day || 1); // daylight half-width around noon
    const d = Math.abs(p - 0.5);
    if (d < dl) return 0;
    return Math.min(1, (d - dl) / 0.08);
  }
  get isNight() { return this.night > 0.5; }
  update(dt) {
    this.t = (this.t + dt) % DAY_LEN;
    this.weatherT -= dt;
    if (this.weatherT <= 0) this.roll();
    if (this.flash > 0) this.flash -= dt * 3;
    if (this.w.lightning) {
      this.lightT -= dt;
      if (this.lightT <= 0) { this.lightT = 5 + Math.random() * 10; this.flash = 1; this.R.sfx('thud'); this.R.shake(3); }
    }
  }
  roll() {
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
    const n = this.night; if (n <= 0.05 || scene.kind !== 'home') return;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of scene.buildings) {
      if (!b.done || b.ruined || b.def.wall) continue;
      const r = b.type === 'castle' ? 170 : 90;
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
    if (n > 0) { ctx.fillStyle = `rgba(20,24,70,${0.42 * n})`; ctx.fillRect(0, 0, vw, vh); }
    if (this.season.tint) { ctx.fillStyle = this.season.tint; ctx.fillRect(0, 0, vw, vh); }
    const w = this.w;
    if (w.rain || w.storm) { ctx.fillStyle = `rgba(30,50,80,${0.08 * (w.rain || 1)})`; ctx.fillRect(0, 0, vw, vh); }
    const want = w.rain ? 120 * w.rain : this.season.snow ? 90 : this.season.leaves ? 26 : 0;
    const kind = w.rain ? 'rain' : this.season.snow ? 'snow' : this.season.leaves ? 'leaf' : null;
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
  label() { return `${this.season.name}${this.weather !== 'clear' ? ', ' + this.w.name : ''}${this.isNight ? ', Night' : ''}`; }
}
