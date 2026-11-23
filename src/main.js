import { loadAll, SHEETS } from './assets.js';
import { T } from './terrain.js';
import { Realm } from './game.js';
import { UI } from './ui.js';
import { BUILDINGS } from './data.js';
import { cellOf } from './world.js';
import { audio } from './audio.js';
import { Tutorial, checkFeats } from './tutorial.js';
import { Minimap } from './minimap.js';
import { WorldMapRenderer } from './worldmap.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr = 1, vw = 0, vh = 0;
const cam = { x: 0, y: 0, z: 1 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  // iOS home-screen apps can report a short innerHeight; measure the canvas, which is pinned to the full screen
  const r = canvas.getBoundingClientRect();
  vw = Math.max(1, Math.round(r.width || window.innerWidth)); vh = Math.max(1, Math.round(r.height || window.innerHeight));
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  ctx.imageSmoothingEnabled = false;
  clampCam();
}

const ui = new UI();
const realm = new Realm(ui);

const view = {
  // the sea uses the same camera in world-map units; the island view is put aside and restored
  enterSea(f) { this.homeCam = { x: cam.x, y: cam.y, z: cam.z }; cam.z = this.seaZ || 0.55; this.centerOn(f.x, f.y); glide = null; },
  exitSea() { this.seaZ = cam.z; if (this.homeCam) { cam.x = this.homeCam.x; cam.y = this.homeCam.y; cam.z = this.homeCam.z; } glide = null; clampCam(); },
  seaCenter() { return [cam.x + vw / cam.z / 2, cam.y + vh / cam.z / 2]; },
  seaFocus(x, y) { realm.cameraTarget = { x, y, t: 0.8 }; },
  centerOn(x, y) { cam.x = x - vw / cam.z / 2; cam.y = y - vh / cam.z / 2; clampCam(); },
  toScreen(x, y) { return { x: (x - cam.x) * cam.z, y: (y - cam.y) * cam.z }; },
  centerCell() { return [cellOf(cam.x + vw / cam.z / 2), cellOf(cam.y + vh / cam.z / 2)]; },
  focusScene() {
    const sc = realm.scene;
    if (sc === realm.home) this.centerOn(realm.castle.x, realm.castle.y + 40);
    else { const u = sc.units.find(u => u.team === 0); if (u) this.centerOn(u.x + Math.min(160, vw / cam.z * 0.22), u.y); }
  },
};

function clampCam() {
  if (realm.seaOpen) { cam.z = Math.max(0.1, Math.min(1.8, cam.z)); return; } // the sea has no edges
  const sc = realm.scene; if (!sc) return;
  const W = sc.map.w * T, H = sc.map.h * T;
  const minZ = Math.max(0.3, Math.min(vw / W, vh / H) * 0.9);
  cam.z = Math.max(minZ, Math.min(2.2, cam.z));
  const vwW = vw / cam.z, vhW = vh / cam.z;
  const pad = 2 * T;
  cam.x = vwW > W + pad * 2 ? (W - vwW) / 2 : Math.max(-pad, Math.min(W + pad - vwW, cam.x));
  cam.y = vhW > H + pad * 2 ? (H - vhW) / 2 : Math.max(-pad - 80, Math.min(H + pad + 60 - vhW, cam.y));
}
function zoomAt(sx, sy, factor) {
  const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z;
  cam.z *= factor; clampCam();
  cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; clampCam();
}

// ---------------- audio needs a user gesture before it can start (iOS)
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);
audio.viewRect = () => ({ x0: cam.x, y0: cam.y, x1: cam.x + vw / cam.z, y1: cam.y + vh / cam.z });

// ---------------- input: drag to pan, pinch / wheel to zoom, tap to act
const ptrs = new Map();
let drag = null, pinch = null, glide = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false, t: performance.now() };
  if (realm.cameraTarget && realm.cameraTarget.t != null) realm.cameraTarget = null;
  // placing: press on the ghost to carry it, or press anywhere to drag out a wall line
  const pl = ui.place;
  if (ptrs.size === 1 && pl) {
    const wx = cam.x + e.clientX / cam.z, wy = cam.y + e.clientY / cam.z, cx = cellOf(wx), cy = cellOf(wy), d = BUILDINGS[pl.type];
    if (pl.line) { const single = pl.a && pl.done && pl.a[0] === pl.b[0] && pl.a[1] === pl.b[1]; if (!single) pl.a = [cx, cy]; pl.b = [cx, cy]; pl.done = false; drag.place = 'line'; drag.second = single; }
    else if (d.wall || d.lantern || d.decor) { pl.cx = cx; pl.cy = cy; drag.place = 'cell'; }
    else if (pl.cx != null && cx >= pl.cx - 1 && cx <= pl.cx + d.fw && cy >= pl.cy - 2 && cy <= pl.cy + d.fh) { drag.place = 'carry'; drag.off = [cx - pl.cx, cy - pl.cy]; }
  }
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    if (drag) drag.moved = true;
  }
});
// desktop: the pack's cursors, with a pointing hand over anything you can tap in the world
let hoverT = 0;
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || ptrs.size || !realm.scene) return;
  const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
  const wx = cam.x + e.clientX / cam.z, wy = cam.y + e.clientY / cam.z;
  const o = ui.place ? null : realm.scene.pick(wx, wy);
  const foe = o && o.team === 1;
  canvas.dataset.hover = ui.place ? 'place' : o ? (foe && realm.scene.selected.size ? 'attack' : 'tap') : '';
  realm.scene.hoverObj = o && (o.team === 1 || o.team === 0) ? o : null;
});
canvas.addEventListener('pointerleave', () => { canvas.dataset.hover = ''; if (realm.scene) realm.scene.hoverObj = null; });
canvas.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const target = pinch.z * d / pinch.d;
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / cam.z);
    return;
  }
  if (drag && drag.place && ui.place) {
    const pl = ui.place, wx = cam.x + e.clientX / cam.z, wy = cam.y + e.clientY / cam.z, cx = cellOf(wx), cy = cellOf(wy);
    drag.moved = true; drag.edge = { x: e.clientX, y: e.clientY };
    if (drag.place === 'line') pl.b = [cx, cy];
    else if (drag.place === 'cell') { pl.cx = cx; pl.cy = cy; }
    else { const nx = cx - drag.off[0], ny = cy - drag.off[1]; if (nx !== pl.cx || ny !== pl.cy) { pl.cx = nx; pl.cy = ny; pl.moved = true; audio.play('tick'); } }
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 9) drag.moved = true;
    if (drag.moved) {
      const nx = drag.cx - dx / cam.z, ny = drag.cy - dy / cam.z, t = performance.now();
      const dtm = Math.max(1, t - (drag.lt || t - 16));
      drag.vx = (nx - cam.x) / dtm; drag.vy = (ny - cam.y) / dtm; drag.lt = t;
      cam.x = nx; cam.y = ny; clampCam(); glide = null;
    }
  }
});
const endPtr = e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0 && drag && drag.place) {
    if (drag.place === 'line' && ui.place) { ui.place.done = true; if (!drag.moved && !drag.second) ui.place.b = ui.place.a; }
    if (drag.place === 'carry' && !drag.moved) ui.onTap(cam.x + e.clientX / cam.z, cam.y + e.clientY / cam.z);
    drag = null; return;
  }
  if (ptrs.size === 0 && drag) {
    if (!drag.moved && e.type === 'pointerup') ui.onTap(cam.x + e.clientX / cam.z, cam.y + e.clientY / cam.z);
    else if (drag.moved && drag.vx !== undefined && performance.now() - drag.lt < 80) glide = { vx: drag.vx, vy: drag.vy };
    drag = null;
  } else if (ptrs.size === 1) {
    const [p] = [...ptrs.values()];
    drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: true };
  }
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('keydown', e => {
  const s = 40 / cam.z;
  if (e.key === 'ArrowLeft' || e.key === 'a') cam.x -= s; else if (e.key === 'ArrowRight' || e.key === 'd') cam.x += s;
  else if (e.key === 'ArrowUp' || e.key === 'w') cam.y -= s; else if (e.key === 'ArrowDown' || e.key === 's') cam.y += s;
  else if (e.key === 'Escape') { realm.scene.selected.clear(); ui.cancelPlace(); ui.closePanel(); }
  clampCam();
});

// ---------------- placement ghost
// buildable-space grid: valid anchors are checked a few dozen per frame and cached per placement
const grid = { key: '', res: new Map() };
function drawGrid(p, d) {
  const key = p.type + '|' + realm.home.buildings.length + '|' + realm.home.structs.length + '|' + (realm.state.annexed || []).length;
  if (grid.key !== key) { grid.key = key; grid.res = new Map(); }
  const single = d.wall || d.lantern || d.decor;
  const x0 = Math.floor(cam.x / T) - d.fw, y0 = Math.floor(cam.y / T) - d.fh;
  const x1 = Math.ceil((cam.x + vw / cam.z) / T), y1 = Math.ceil((cam.y + vh / cam.z) / T);
  let budget = 60;
  const cover = new Set();
  // check from the camera centre outward so the area you look at fills first
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, todo = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = x + ',' + y; let v = grid.res.get(k);
    if (v === undefined) {
      const quick = single ? null : realm.canPlace(p.type, x, y, true);
      if (quick === false) { grid.res.set(k, false); continue; }
      todo.push([Math.abs(x - mx) + Math.abs(y - my), x, y, k]); continue;
    }
    if (v) for (let yy = y; yy < y + d.fh; yy++) for (let xx = x; xx < x + d.fw; xx++) cover.add(xx + ',' + yy);
  }
  todo.sort((a, b) => a[0] - b[0]);
  for (const [, x, y, k] of todo) { if (budget-- <= 0) break; grid.res.set(k, single ? realm.canPlaceWall(x, y, p.type) : realm.canPlace(p.type, x, y)); }
  // until the player taps somewhere, park the ghost on the nearest good spot
  if (!single && !p.moved && grid.res.get(p.cx + ',' + p.cy) !== true) {
    let best = null, bd = 1e9;
    for (const [k, v] of grid.res) if (v) { const [x, y] = k.split(',').map(Number); const dd = Math.hypot(x - p.cx, y - p.cy); if (dd < bd) { bd = dd; best = [x, y]; } }
    if (best && !todo.length) { p.cx = best[0]; p.cy = best[1]; p.moved = true; }
  }
  ctx.fillStyle = 'rgba(150,230,120,0.16)'; ctx.strokeStyle = 'rgba(235,255,220,0.35)'; ctx.lineWidth = 1.5;
  for (const k of cover) { const [x, y] = k.split(',').map(Number); ctx.fillRect(x * T, y * T, T, T); ctx.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6); }
}

function drawGhost() {
  const p = ui.place; if (!p) return;
  const d = BUILDINGS[p.type];
  {
    const z = cam.z * dpr;
    ctx.setTransform(z, 0, 0, z, Math.round(-cam.x * z), Math.round(-cam.y * z));
    drawGrid(p, d);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (d.wall || d.lantern || d.decor) {
    const z = cam.z * dpr;
    ctx.setTransform(z, 0, 0, z, Math.round(-cam.x * z), Math.round(-cam.y * z));
    const cells = p.line ? (p.a ? realm.wallLine(p.a, p.b) : []) : (p.cx != null ? [[p.cx, p.cy]] : []);
    for (const [x, y] of cells) { ctx.fillStyle = realm.canPlaceWall(x, y, p.type) ? 'rgba(109,187,91,0.5)' : 'rgba(217,83,79,0.5)'; ctx.fillRect(x * T + 4, y * T + 4, T - 8, T - 8); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const ok = realm.canPlace(p.type, p.cx, p.cy);
  const z = cam.z * dpr;
  ctx.setTransform(z, 0, 0, z, Math.round(-cam.x * z), Math.round(-cam.y * z));
  ctx.fillStyle = ok ? 'rgba(109,187,91,0.45)' : 'rgba(217,83,79,0.5)';
  for (let y = p.cy; y < p.cy + d.fh; y++) for (let x = p.cx; x < p.cx + d.fw; x++) ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
  { // what this spot would give
    const fake = { type: p.type, cx: p.cx, cy: p.cy, fw: d.fw, fh: d.fh, done: true };
    const nb = p.cx != null && ok ? realm.neighbourBonus(fake) : [];
    if (nb.length) {
      const lx = (p.cx + d.fw / 2) * T, ly = (p.cy + d.fh) * T + 24;
      ctx.font = '14px BoldPixels, monospace'; ctx.textAlign = 'center';
      for (let i = 0; i < nb.length; i++) { const t = nb[i][0]; ctx.fillStyle = '#2b2b3a'; ctx.fillText(t, lx + 1, ly + 1 + i * 16); ctx.fillStyle = '#9be37b'; ctx.fillText(t, lx, ly + i * 16); }
    }
  }
  const s = SHEETS[p.move ? p.move.imgKey : (d.img || d.imgs[0])];
  if (s && s.img) {
    ctx.globalAlpha = 0.6;
    const bx = (p.cx + d.fw / 2) * T, by = (p.cy + d.fh) * T;
    ctx.drawImage(s.img, Math.round(bx - s.fw / 2), Math.round(by - s.fh + 8));
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------- the sea (4.0)
let seaRenderer = null, seaT = 0;
function drawSea(t) {
  const Z = realm.sea; if (!Z.ocean) return;
  if (!seaRenderer || seaRenderer.ocean !== Z.ocean) seaRenderer = new WorldMapRenderer(Z.ocean, SHEETS);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const f = Z.W.fleet, marks = [{ x: f.x, y: f.y, kind: 'ship', flip: f.flip }];
  { // a fleet still moored at the heart of home is drawn at the jetty, easing out as it leaves
    const h = Z.ocean.islandAt(0, 0, 10), d = Math.hypot(f.x, f.y);
    if (h && h.kind === 'home' && d < h.r) { const k = 1 - d / h.r; marks[0].x += h.r * 0.95 * k; marks[0].y += h.r * 0.35 * k; }
  }
  if (Z.W.dest) marks.push({ x: Z.W.dest.x, y: Z.W.dest.y, kind: 'target' });
  for (const b of realm.trade.seaBoats()) if (Z.fog.isRevealed(b.x, b.y)) marks.push({ x: b.x, y: b.y, kind: 'fleet', flip: b.flip, relation: 'own' });
  for (const fl of Z.W.fleets || []) { if (!Z.fog.isRevealed(fl.x, fl.y)) continue; const a = Z.ocean.islandById(fl.from); if (a) marks.push({ x: fl.x, y: fl.y, kind: 'fleet', flip: fl.flip, sigil: a.kingdom.sigil, relation: Z.relation(a) }); }
  seaRenderer.draw(ctx, { x: cam.x, y: cam.y, z: cam.z * dpr }, Z.fog, {
    t, dpr, marks, selectedId: ui.seaSel ? ui.seaSel.id : null, homeTier: realm.state.tier, padTop: 132, padBottom: ui.seaCardH ? ui.seaCardH() : 180,
    relations: kid => { const is = Z.ocean.islandById(String(kid).replace(/^k/, '')); return Z.relation(is); },
  });
  seaT -= 1 / 60; if (seaT <= 0) { seaT = 0.5; ui.renderSeaCard(); }
}

// ---------------- loop
let last = performance.now(), tutorial = null, featT = 3, minimap = null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (minimap) minimap.update(dt);
  if (drag && drag.place && drag.edge && ui.place) { // carry the camera along when dragging near the screen edge
    const m = 46, ex = drag.edge.x, ey = drag.edge.y, sp = 520 * dt / cam.z;
    const vx = ex < m ? -sp : ex > vw - m ? sp : 0, vy = ey < m + 60 ? -sp : ey > vh - m - 90 ? sp : 0;
    if (vx || vy) { cam.x += vx; cam.y += vy; clampCam(); }
  }
  if (!realm.state) return; // wiped, reload pending
  realm.update(dt);
  ui.frame(dt);
  if (tutorial) tutorial.update(dt);
  featT -= dt; if (featT <= 0) { featT = 2; checkFeats(realm); }
  if (glide) {
    cam.x += glide.vx * dt * 1000; cam.y += glide.vy * dt * 1000; clampCam();
    const f = Math.pow(0.04, dt); glide.vx *= f; glide.vy *= f;
    if (Math.hypot(glide.vx, glide.vy) < 0.01) glide = null;
  }
  // camera hook for annexed land (src/annex.js): glide toward realm.cameraTarget {x, y, z?}
  const ct = realm.cameraTarget;
  if (ct && ct.t != null) { ct.t -= dt; if (ct.t <= 0) realm.cameraTarget = null; }
  if (ct) { const k = 1 - Math.pow(0.03, dt), c = [cam.x + vw / cam.z / 2, cam.y + vh / cam.z / 2]; if (ct.z) cam.z += (ct.z - cam.z) * k; view.centerOn(c[0] + (ct.x - c[0]) * k, c[1] + (ct.y - c[1]) * k); glide = null; }
  const raidOn = (realm.raid && realm.raid.active) || realm.events.pending || realm.events.active;
  audio.setMood(realm.exp ? 'voyage' : raidOn ? 'battle' : 'home');
  let sx = 0, sy = 0;
  if (realm.shakeAmt > 0.2) { sx = (Math.random() - 0.5) * realm.shakeAmt; sy = (Math.random() - 0.5) * realm.shakeAmt; realm.shakeAmt *= Math.pow(0.002, dt); } else realm.shakeAmt = 0;
  const zc = { x: cam.x + sx / cam.z, y: cam.y + sy / cam.z, z: cam.z * dpr };
  ctx.imageSmoothingEnabled = false;
  if (realm.seaOpen) { drawSea(now / 1000); requestAnimationFrame(frame); return; }
  realm.scene.draw(ctx, zc, canvas.width, canvas.height);
  drawGhost();
  requestAnimationFrame(frame);
}

async function boot() {
  const fill = document.getElementById('loadFill'), pawn = document.getElementById('loadPawn'), pct = document.getElementById('loadPct'), tipEl = document.getElementById('loadText');
  const TIPS = ['Tip: tap a soldier, then tap a foe to attack it.', 'Tip: houses make room for more people.', 'Tip: watchtowers on high ground shoot farther.', 'Tip: every 5th island has a boss and a relic.', 'Tip: fences with a gate keep raiders out and your people in.', 'Tip: the realm keeps working while you are away.', 'Tip: a happy realm gathers faster and grows on its own.', 'Tip: promote a level 10 soldier for a new look and more power.'];
  let tipI = Math.floor(Math.random() * TIPS.length); tipEl.textContent = TIPS[tipI];
  const tipT = setInterval(() => { tipEl.style.opacity = 0; setTimeout(() => { tipI = (tipI + 1) % TIPS.length; tipEl.textContent = TIPS[tipI]; tipEl.style.opacity = 0.9; }, 300); }, 2600);
  const fontP = document.fonts ? document.fonts.load('16px BoldPixels').catch(() => { }) : Promise.resolve();
  await Promise.all([loadAll(p => { fill.style.width = `calc(${Math.round(p * 100)}% + 20px)`; pawn.style.left = Math.round(p * 100) + '%'; pct.textContent = Math.round(p * 100) + '%'; }), fontP]);
  clearInterval(tipT);
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  setTimeout(resize, 400); setTimeout(resize, 1500);
  const info = realm.load();
  ui.bind(realm, view);
  cam.z = Math.max(0.6, Math.min(1, vw / (64 * 15)));
  view.focusScene();
  const ld = document.getElementById('loading'); ld.classList.add('hidden'); setTimeout(() => ld.classList.add('gone'), 500);
  ui.welcome(info);
  tutorial = new Tutorial(realm, ui, view); tutorial.start();
  minimap = new Minimap(realm, view, cam);
  realm.save();
  window.realm = realm; window.cam = cam; window.view = view; window.audio = audio; // handy for debugging from the console
  requestAnimationFrame(t => { last = t; frame(t); });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) realm.save();
  else if (realm.state) {
    // returning to the tab: count the time away like an offline session
    const away = realm.applyOffline();
    if (away.secs >= 60) ui.welcome({ away });
    last = performance.now();
  }
});
window.addEventListener('pagehide', () => { if (!ui.wiping) realm.save(); });

boot().catch(e => {
  console.error(e);
  document.getElementById('loadText').textContent = 'Something went wrong loading the realm: ' + e.message;
});
