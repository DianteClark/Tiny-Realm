// Minimap (3.6): a small map in the corner. Land and water are cached per map; buildings, troops, foes,
// banners, the raid landing and the camera view are drawn on top a few times a second. Tap to look there.
import { T, K_WATER, K_HIGH, K_CLIFF } from './terrain.js';
import { COLORS } from './squads.js';

const KEY = 'tinyrealm.minimap';
export const minimapOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
export const setMinimap = on => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ } };

export class Minimap {
  constructor(realm, view, cam) {
    this.R = realm; this.view = view; this.cam = cam;
    this.el = document.getElementById('minimap'); this.ctx = this.el.getContext('2d');
    this.base = null; this.baseFor = null; this.t = 0;
    this.el.addEventListener('click', e => {
      const sc = this.R.scene, r = this.el.getBoundingClientRect();
      const f = this.fit(sc.map); const wx = ((e.clientX - r.left) - f.ox) / f.s * T, wy = ((e.clientY - r.top) - f.oy) / f.s * T;
      this.view.centerOn(wx, wy);
    });
  }
  fit(m) { // frame the land, not the whole sea
    const W = this.el.clientWidth || 112, H = this.el.clientHeight || 84, b = this.box || { x0: 0, y0: 0, x1: m.w, y1: m.h };
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, s = Math.min(W / bw, H / bh);
    return { s, ox: (W - bw * s) / 2 - b.x0 * s, oy: (H - bh * s) / 2 - b.y0 * s, W, H };
  }
  bake(m) { // one pixel per tile, coloured by ground
    const c = document.createElement('canvas'); c.width = m.w; c.height = m.h; const x = c.getContext('2d'), img = x.createImageData(m.w, m.h);
    for (let y = 0; y < m.h; y++) for (let i = 0; i < m.w; i++) {
      const k = m.kindAt(i, y), o = (y * m.w + i) * 4;
      const col = k === K_WATER ? [71, 171, 169] : k === K_CLIFF ? [96, 108, 98] : k === K_HIGH || m.level(i, y) > 0 ? [118, 156, 74] : [140, 184, 92];
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    let x0 = m.w, y0 = m.h, x1 = 0, y1 = 0;
    for (let y = 0; y < m.h; y++) for (let i = 0; i < m.w; i++) if (m.kindAt(i, y) !== K_WATER) { x0 = Math.min(x0, i); y0 = Math.min(y0, y); x1 = Math.max(x1, i + 1); y1 = Math.max(y1, y + 1); }
    const pad = 3; this.box = x1 > x0 ? { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(m.w, x1 + pad), y1: Math.min(m.h, y1 + pad) } : null;
    return c;
  }
  update(dt) {
    const on = minimapOn() && !this.R.ui.panel && !this.R.ui.place && !this.R.seaOpen;
    this.el.classList.toggle('hidden', !on); if (!on) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.2;
    const sc = this.R.scene, m = sc.map, key = m.w + 'x' + m.h + ':' + (this.R.state.annexed || []).length + ':' + (sc === this.R.home ? 'h' : 'e');
    if (!this.base || this.baseFor !== m || this.baseKey !== key) { this.base = this.bake(m); this.baseFor = m; this.baseKey = key; }
    const dpr = Math.min(2, window.devicePixelRatio || 1), f = this.fit(m);
    if (this.el.width !== Math.round(f.W * dpr)) { this.el.width = Math.round(f.W * dpr); this.el.height = Math.round(f.H * dpr); }
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false;
    c.fillStyle = '#3f9593'; c.fillRect(0, 0, f.W, f.H);
    c.drawImage(this.base, f.ox, f.oy, m.w * f.s, m.h * f.s);
    const P = (wx, wy) => [f.ox + wx / T * f.s, f.oy + wy / T * f.s];
    for (const b of sc.buildings) { if (b.def.wall) continue; const [x, y] = P(b.cx * T, b.cy * T); c.fillStyle = b.type === 'castle' ? '#2f6fa8' : '#f1e3c2'; c.fillRect(x, y, Math.max(2, b.fw * f.s), Math.max(2, b.fh * f.s)); }
    for (const s of sc.structs) { if (s.def.palisade) continue; const [x, y] = P(s.cx * T, s.cy * T); c.fillStyle = '#b8433c'; c.fillRect(x, y, Math.max(2, s.fw * f.s), Math.max(2, s.fh * f.s)); }
    if (sc === this.R.home) for (const q of this.R.squads.list) if (q.banner) { const [x, y] = P(q.banner.cx * T, q.banner.cy * T); c.fillStyle = (COLORS.find(k => k.key === q.color) || COLORS[0]).hex; c.fillRect(x - 1, y - 3, 3, 4); }
    for (const u of sc.units) {
      if (!u.alive || u.hidden || u.kind === 'pawn') continue;
      const [x, y] = P(u.x, u.y); c.fillStyle = u.team === 0 ? '#bfe3ff' : '#ff5a4e'; c.fillRect(x - 1, y - 1, u.big ? 3 : 2, u.big ? 3 : 2);
    }
    if (sc.raidMark) { const [x, y] = P(sc.raidMark.x, sc.raidMark.y), k = (performance.now() / 600) % 1; c.strokeStyle = `rgba(255,90,78,${1 - k})`; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 3 + k * 7, 0, Math.PI * 2); c.stroke(); }
    // the camera's view
    const cam = this.cam, vw = window.innerWidth, vh = window.innerHeight, [x0, y0] = P(cam.x, cam.y), [x1, y1] = P(cam.x + vw / cam.z, cam.y + vh / cam.z);
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1; c.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
  }
}
