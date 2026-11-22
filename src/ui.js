// HUD, panels and dialogs. Plain DOM styled with the pack's UI art.
import { SHEETS } from './assets.js';
import { UNITS, ENEMIES, BUILDINGS, TIERS, TRAITS, RELICS, XP_LEVELS, MAX_LEVEL, islandInfo, renownCost, STORY, upgradeCost, upgradeTime, describeLevel, levelEffects, ABILITIES } from './data.js';
const FORMATIONS = ['Loose', 'Line', 'Wedge', 'Column'];
import { Unit, Building, Struct, cellOf } from './world.js';
import { T } from './terrain.js';
import { MAJOR } from './events.js';
import { audio } from './audio.js';

export const VERSION = '2.1';

const $ = s => document.querySelector(s);
const src = k => SHEETS[k] ? encodeURI(SHEETS[k].src) : '';
const fmt = n => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.floor(n));
const time = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}h ${m}m` : `${m}:${String(x).padStart(2, '0')}`; };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const UNIT_AV = { pawn: 'av_h5', warrior: 'av_h1', archer: 'av_h3', lancer: 'av_h2', monk: 'av_h4', swordsman: 'av_swordsman1', berserker: 'av_berserker1', horseman: 'av_horseman1', catapult: 'av_catapult1', king: 'av_king1' };
const BLD_IMG = { wall: 'fence', gate: 'fence', castle: 'b_Castle', house: 'b_House1', barracks: 'b_Barracks', archery: 'b_Archery', monastery: 'b_Monastery', tower: 'b_Tower' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.toastsEl = $('#toasts'); this.bannerEl = $('#banner');
    this.panelEl = $('#panel'); this.body = $('#panelBody'); this.tabs = $('#panelTabs');
    this.modalEl = $('#modal');
    this.panel = null; this.panelArg = null; this.tab = null; this.live = [];
    this.place = null; this.squadPick = new Set(); this.modalQueue = [];
  }
  bind(realm, view) {
    this.R = realm; this.view = view;
    document.querySelectorAll('.navbtn').forEach(b => b.onclick = () => this.togglePanel(b.dataset.panel));
    $('#panelClose').onclick = () => this.closePanel();
    this.panelEl.onclick = e => { if (e.target === this.panelEl) this.closePanel(); };
    $('#btnSettings').onclick = () => this.togglePanel('settings');
    $('#btnDesel').onclick = () => { this.R.scene.selected.clear(); this.refreshSel(); };
    $('#btnSelAll').onclick = () => this.selectAll();
    $('#btnSquadAll').onclick = () => this.selectAll();
    $('#btnRetreat').onclick = () => this.confirm('Retreat?', 'Your squad sails home with no loot from this island.', 'Retreat', () => this.R.endExpedition('retreat'));
    $('#btnPlaceOk').onclick = () => this.confirmPlace();
    this.formation = localStorage.getItem('tinyrealm.formation') || 'Loose';
    const cycleForm = () => { this.formation = FORMATIONS[(FORMATIONS.indexOf(this.formation) + 1) % FORMATIONS.length]; localStorage.setItem('tinyrealm.formation', this.formation); this.toast(`Formation: ${this.formation}. Melee forms the front, archers and monks the rear.`); this.syncFormButtons(); };
    $('#btnForm').onclick = cycleForm; $('#btnSquadForm').onclick = cycleForm;
    this.syncFormButtons();
    $('#btnSpeed').onclick = () => { this.R.speed = this.R.speed === 2 ? 1 : 2; $('#btnSpeed').textContent = this.R.speed + 'x'; };
    $('#abilitybar').addEventListener('click', e => {
      const b = e.target.closest('[data-ab]'); if (!b) return;
      const sc = this.R.scene; let used = 0;
      for (const u of sc.selected) if (u.type === b.dataset.ab && sc.useAbility(u)) used++;
      if (!used) this.toast('Not ready yet.');
      this.abKey = null;
    });
    $('#btnPlaceCancel').onclick = () => this.cancelPlace();
    this.body.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && !el.disabled) this.act(el.dataset.act, el); });
    this.tabs.addEventListener('click', e => { const el = e.target.closest('[data-tab]'); if (el) { this.tab = el.dataset.tab; this.renderPanel(); } });
    $('#pills').addEventListener('click', e => { const el = e.target.closest('[data-pill]'); if (el) this.pillAction(el.dataset.pill); });
    $('#hud').classList.remove('hidden');
    document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled && !b.classList.contains('navbtn')) audio.play('click'); }, true);
  }

  // ------------------------------------------------------------ messages
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast paper-dark' + (kind ? ' ' + kind : '');
    if (kind === 'red') audio.play('error');
    el.textContent = text;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 3600);
  }
  banner(title, text, color = 'blue') {
    const b = this.bannerEl;
    b.querySelector('.banner-ribbon').innerHTML = `<div class="ribbon ${color === 'gold' ? 'yellow' : color}"><span>${esc(title)}</span></div>`;
    const p = b.querySelector('p'); p.textContent = text; p.className = 'paper';
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 6500);
    b.onclick = () => b.classList.add('hidden');
  }
  choice(title, text, options) {
    if (!this.modalEl.classList.contains('hidden')) { this.modalQueue.push([title, text, options]); return; }
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = typeof text === 'string' ? `<p>${esc(text)}</p>` : '';
    if (typeof text !== 'string') $('#modalBody').appendChild(text);
    const btns = $('#modalBtns'); btns.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'btn wide ' + (o.cls || ''); b.textContent = o.label;
      b.onclick = () => { this.closeModal(); o.fn && o.fn(); };
      btns.appendChild(b);
    }
    this.modalEl.classList.remove('hidden');
  }
  closeModal() {
    this.modalEl.classList.add('hidden');
    if (this.modalQueue.length) { const [a, b, c] = this.modalQueue.shift(); setTimeout(() => this.choice(a, b, c), 150); }
  }
  confirm(title, text, ok, fn) { this.choice(title, text, [{ label: ok, cls: 'red', fn }, { label: 'Cancel' }]); }
  welcome(info) {
    const R = this.R, S = R.state;
    if (info.fresh || !S.introSeen) {
      S.introSeen = true;
      this.choice('Tiny Realm', STORY.intro + '\n', [{ label: 'Begin', fn: () => this.toast('Follow the Chronicle for your first goals.') }]);
      $('#modalBody').innerHTML += `<p class="muted" style="font-size:13px">Drag to look around, pinch or scroll to zoom. Tap a soldier then tap the ground to move them. Tap buildings to train and upgrade.</p>`;
    } else if (info.away && info.away.secs >= 30) {
      const a = info.away;
      const div = document.createElement('div');
      div.innerHTML = `<p>You were away for ${time(a.secs)}.</p>
        <div class="cost" style="justify-content:center;font-size:18px">
          <span><i class="ic ic-gold"></i>+${a.got.gold}</span><span><i class="ic ic-wood"></i>+${a.got.wood}</span><span><i class="ic ic-meat"></i>+${a.got.meat}</span></div>
        ${a.done.length ? `<p class="muted">${a.done.slice(0, 6).map(esc).join('<br>')}</p>` : ''}
        ${Object.values(S.res).some(v => v >= R.storage()) ? '<p>Your stores are full. Upgrade the castle to hold more.</p>' : ''}`;
      this.choice('Welcome back', div, [{ label: 'To work' }]);
    }
    if (!info.fresh && localStorage.getItem('tinyrealm.seen') !== VERSION) {
      const div = document.createElement('div');
      div.innerHTML = `<p style="text-align:left;font-size:14px;line-height:1.4">
        Music and sound effects, all synthesized live.<br>
        Upgrade Watchtowers, Houses and training halls up to level 5.<br>
        Upgraded halls train faster and send out veteran recruits.<br>
        The castle houses more people, and train buttons now say exactly why they are blocked.<br>
        Tap a unit in a training queue to cancel it for a full refund.<br>
        Pay wood to repair damaged buildings instantly.<br>
        New pawns go straight to work on your scarcest resource.<br>
        Screen shake, hit flashes, damage numbers, a goal tracker, and smoother camera glide.<br>
        Islands rebuilt to follow the Tiny Swords tilemap rules: chunky coastlines, sea cliffs, two levels of high ground, and boats and clouds layered properly.${R.migrated ? '<br>Your island has been reshaped. Buildings were moved to the nearest solid ground.' : ''}</p>
        <p class="muted" style="font-size:12px">Sound starts after your first tap. Volume is in Settings.</p>`;
      this.choice('Tiny Realm ' + VERSION, div, [{ label: 'Onward' }]);
    }
    localStorage.setItem('tinyrealm.seen', VERSION);
    if (R.pendingDaily) {
      const d = R.pendingDaily; R.pendingDaily = null;
      const div = document.createElement('div');
      div.innerHTML = `<p>Day ${d.streak} in a row. Your people leave a gift at the castle gate.</p>
        <div class="cost" style="justify-content:center;font-size:18px"><span><i class="ic ic-gold"></i>+${d.gift.gold}</span><span><i class="ic ic-wood"></i>+${d.gift.wood}</span><span><i class="ic ic-meat"></i>+${d.gift.meat}</span></div>
        <p class="muted">Return tomorrow for a bigger gift. A new Bounty Isle awaits in Voyage.</p>`;
      this.choice('Daily tribute', div, [{ label: 'Thank you' }]);
    }
  }

  // ------------------------------------------------------------ per-frame HUD
  frame(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    const R = this.R, S = R.state, cap = R.storage();
    this.prevRes = this.prevRes || { ...S.res };
    for (const r of ['gold', 'wood', 'meat']) {
      const el = document.querySelector(`.res[data-r="${r}"]`);
      if (S.res[r] > this.prevRes[r] + 0.5) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      this.prevRes[r] = S.res[r];
      el.querySelector('span').textContent = fmt(S.res[r]);
      el.classList.toggle('full', S.res[r] >= cap);
    }
    document.querySelector('.res[data-r="pop"] span').textContent = `${R.popUsed()}/${R.popCap()}`;
    $('#tierRibbon').textContent = TIERS[S.tier].name + (S.renown ? ` R${S.renown}` : '');
    const J = S.jobs, idle = Math.max(0, S.pawns - J.wood - J.gold - J.meat - J.build);
    const badge = document.querySelector('[data-panel="workers"] .badge');
    if (idle > 0) { if (!badge) document.querySelector('[data-panel="workers"]').insertAdjacentHTML('beforeend', `<b class="badge">${idle}</b>`); else badge.textContent = idle; }
    else if (badge) badge.remove();
    this.renderPills();
    for (const f of this.live) f();
    if (R.exp) this.renderExpHud();
    if (R.exp) R.checkExpedition();
    this.refreshSel();
  }
  renderPills() {
    const R = this.R, S = R.state, E = R.events;
    const pills = [];
    if (R.raid && R.raid.active) {
      const n = R.raid.units.filter(u => u.alive).length + R.raid.queue.length;
      pills.push(['raid', 'red', `${R.raid.title}: ${n} foes`]);
    } else if (E.pending) pills.push(['event', 'red', `${MAJOR[E.pending.kind].title} ${time(E.pending.t)}`]);
    else if (!R.exp && S.timers.raid < 120) pills.push(['raidsoon', 'red', `Raid in ${time(S.timers.raid)}`]);
    else if (!R.exp) pills.push(['raidsoon', 'black', `Next raid ${time(S.timers.raid)}`]);
    pills.push(['env', R.env.isNight ? 'black' : 'blue', R.env.label()]);
    if (!R.exp) { const q = R.currentQuest(); pills.push(['quest', 'purple', `Goal: ${q.text} ${Math.min(R.questValue(q.type), q.n)}/${q.n}`]); }
    if (E.merchant) pills.push(['merchant', 'yellow', `Merchant ${time(E.merchant.t)}`]);
    if (E.bees) pills.push(['bees', 'yellow', `Bee swarm`]);
    if (R.home.goldRush > 0) pills.push(['rush', 'yellow', `Gold Rush ${time(R.home.goldRush)}`]);
    if (S.upgradeEnd) pills.push(['upgrade', 'purple', `Castle ${time((S.upgradeEnd - Date.now()) / 1000)}`]);
    const html = pills.map(([k, c, t]) => `<div class="ribbon-small ${c} pill" data-pill="${k}">${esc(t)}</div>`).join('');
    if (html !== this.pillsHtml) { $('#pills').innerHTML = html; this.pillsHtml = html; }
  }
  pillAction(k) {
    const R = this.R;
    if (k === 'merchant') this.openPanel('merchant');
    else if (k === 'quest') this.openPanel('chronicle');
    else if (k === 'env') { const e = R.env; this.toast(`${e.season.name}: ${e.season.desc}${e.weather !== 'clear' ? ' ' + e.w.name + ': ' + e.w.desc : ''}`); }
    else if (k === 'raid' && R.raid) { const u = R.raid.units.find(u => u.alive); if (u) this.view.centerOn(u.x, u.y); }
    else if (k === 'bees' && R.events.bees) this.view.centerOn(R.events.bees.x, R.events.bees.y);
    else if (k === 'upgrade') this.openPanel('building', R.castle);
    else if (k === 'raidsoon' || k === 'event') this.toast('Keep soldiers near the castle and towers on high ground.');
  }
  syncFormButtons() { $('#btnForm').textContent = this.formation; $('#btnSquadForm').textContent = this.formation; }
  renderAbilities() {
    const sc = this.R.scene, el = $('#abilitybar');
    const types = {};
    for (const u of sc.selected) if (ABILITIES[u.type] && u.alive) { const t = types[u.type] || (types[u.type] = { n: 0, ready: 0, cd: 0 }); t.n++; if (u.abT <= 0) t.ready++; else t.cd = Math.max(t.cd, u.abT / ABILITIES[u.type].cd); }
    const keys = Object.keys(types);
    el.classList.toggle('hidden', !keys.length || !!this.place);
    const key = keys.map(k => k + types[k].ready + ':' + Math.round(types[k].cd * 10)).join(',');
    if (key === this.abKey) return; this.abKey = key;
    el.innerHTML = keys.map(k => { const t = types[k], ab = ABILITIES[k]; return `<button class="ab ${t.ready ? '' : 'cool'}" data-ab="${k}" title="${esc(ab.desc)}"><div class="cd" style="height:${t.ready ? 0 : t.cd * 100}%"></div><span>${ab.name}${t.n > 1 ? `<br>${t.ready}/${t.n}` : ''}</span></button>`; }).join('');
  }
  flashPop() {
    const el = document.querySelector('.res[data-r="pop"]');
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  refreshSel() {
    const sc = this.R.scene;
    for (const u of [...sc.selected]) if (!u.alive || u.cursed > 0) sc.selected.delete(u);
    const n = sc.selected.size;
    const show = n > 0 && !this.place;
    $('#selbar').classList.toggle('hidden', !show || !!this.R.exp);
    if (show) $('#selText').textContent = n === 1 ? [...sc.selected][0].rec.name : `${n} soldiers`;
    if (this.R.exp) this.renderSquad();
    this.renderAbilities();
  }
  selectAll() {
    const sc = this.R.scene;
    sc.selected.clear();
    for (const u of sc.units) if (u.team === 0 && u.kind === 'soldier' && u.alive && !u.hidden && u.cursed <= 0) sc.selected.add(u);
    this.refreshSel();
  }
  onSceneChange() {
    const exp = !!this.R.exp;
    this.closePanel(); this.cancelPlace();
    $('#bottombar').classList.toggle('hidden', exp);
    $('#squadbar').classList.toggle('hidden', !exp);
    $('#exphud').classList.toggle('hidden', !exp);
    $('#subbar').classList.toggle('hidden', exp);
    document.body.classList.toggle('exp', exp);
    this.R.speed = 1; $('#btnSpeed').textContent = '1x';
    $('#selbar').classList.add('hidden');
    this.view.focusScene();
    if (exp) this.renderSquad(true);
  }
  renderExpHud() {
    const st = this.R.expStatus(); if (!st) return;
    $('#expName').textContent = `${st.name} - ${st.region} - Level ${st.level}`;
    $('#expStat').textContent = `Camps ${st.camps}   Foes ${st.foes}` + (st.boss && st.boss.alive ? `   Boss: ${ENEMIES[st.boss.type].name}` : '');
  }
  renderSquad(force) {
    const sc = this.R.exp; if (!sc) return;
    const us = sc.units.filter(u => u.team === 0 && u.rec);
    const key = us.map(u => u.id + ':' + Math.round(u.hp / u.maxHp * 20) + ':' + (sc.selected.has(u) ? 1 : 0) + ':' + (u.alive ? 1 : 0)).join(',');
    if (key === this.squadKey && !force) return;
    this.squadKey = key;
    const el = $('#squadAvatars');
    el.innerHTML = us.map(u => `<button class="sq ${sc.selected.has(u) ? 'sel' : ''} ${u.alive ? '' : 'dead'}" data-id="${u.id}"><img src="${src(u.rec.avatar)}" alt=""><div class="hpb"><i style="width:${Math.max(0, u.hp / u.maxHp * 100)}%"></i></div></button>`).join('');
    el.onclick = e => {
      const b = e.target.closest('.sq'); if (!b) return;
      const u = us.find(x => x.id === +b.dataset.id); if (!u || !u.alive) return;
      if (sc.selected.has(u) && sc.selected.size === 1) this.view.centerOn(u.x, u.y);
      sc.selected.clear(); sc.selected.add(u); this.refreshSel();
    };
  }

  // ------------------------------------------------------------ world taps
  onTap(wx, wy) {
    const R = this.R, sc = R.scene;
    if (this.place) { this.movePlace(wx, wy); return; }
    const o = sc.pick(wx, wy);
    if (o && o.tap) { o.tap(); return; }
    if (o instanceof Unit) {
      if (o.team === 0 && o.kind === 'soldier') {
        if (o.cursed > 0) { this.toast(`${o.rec.name} has been turned into a sheep. Defeat the Hex Shaman or wait it out.`); return; }
        if (sc.selected.has(o) && sc.selected.size === 1) { sc.selected.clear(); this.refreshSel(); return; }
        sc.selected.clear(); sc.selected.add(o); this.refreshSel();
        const r = o.rec; this.toast(`${r.name} - level ${r.level} ${UNITS[o.type].name}. ${r.traits.map(t => TRAITS[t].name).join(', ')}`);
        return;
      }
      if (o.kind === 'pawn') { this.toast(`A Pawn, working as ${o.job === 'idle' ? 'an idle hand' : 'a ' + { wood: 'woodcutter', gold: 'miner', meat: 'shepherd', build: 'builder' }[o.job]}.`); return; }
      if (o.team === 1) {
        if (sc.selected.size) { this.order({ type: 'attack', target: o }); sc.fxAt('cursorRing', o.x, o.bodyY + 16, { dur: 0.35, scale: 0.7 }); return; }
        this.toast(`${ENEMIES[o.type].name}, level ${o.level}. ${Math.ceil(o.hp)} health.`);
        return;
      }
    }
    if (o instanceof Struct) {
      if (sc.selected.size) { this.order({ type: 'attack', target: o }); return; }
      this.toast(`${o.def.name}. Destroy every camp to clear the island.`); return;
    }
    if (o instanceof Building) {
      if (sc.selected.size) { sc.selected.clear(); this.refreshSel(); }
      this.openPanel('building', o); return;
    }
    if (sc.selected.size) {
      this.order({ type: 'move', x: wx, y: wy });
      sc.fxAt('cursorRing', wx, wy + 16, { dur: 0.35, scale: 0.6 });
    }
  }
  order(o) {
    const sc = this.R.scene;
    const us = [...sc.selected];
    if (o.type !== 'move') {
      for (const u of us) { u.target = null; u.stop(); u.giveUp = 0; u.order = { type: 'attack', target: o.target }; }
      return;
    }
    const spots = this.formationSpots(us, o.x, o.y);
    let failed = 0;
    us.forEach((u, i) => {
      u.target = null; u.stop(); u.giveUp = 0;
      let [x, y] = spots.get(u);
      if (!sc.map.walkable(cellOf(x), cellOf(y)) && !u.flying) { x = o.x; y = o.y; }
      u.order = { type: 'move', x, y };
      if (!u.setPath(x, y)) { u.order = null; failed++; }
    });
    if (failed === us.length) this.toast('They cannot reach that spot.');
  }
  // Melee in front, ranged and monks behind, facing the direction of travel
  formationSpots(us, tx, ty) {
    const out = new Map();
    const cx = us.reduce((a, u) => a + u.x, 0) / us.length, cy = us.reduce((a, u) => a + u.y, 0) / us.length;
    let fx = tx - cx, fy = ty - cy; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
    const px = -fy, py = fx; // sideways
    const back = u => !!(u.def.proj || u.def.heal);
    const sorted = [...us].sort((a, b) => back(a) - back(b));
    const S = 44;
    const f = this.formation;
    sorted.forEach((u, i) => {
      let side = 0, depth = 0;
      if (f === 'Line') {
        const front = sorted.filter(v => !back(v)), rear = sorted.filter(back);
        const row = back(u) ? rear : front, k = row.indexOf(u);
        side = (k - (row.length - 1) / 2); depth = back(u) && front.length ? -1 : 0;
      } else if (f === 'Wedge') {
        const k = i, ring = Math.ceil(k / 2); side = k === 0 ? 0 : (k % 2 ? -ring : ring) * 0.8; depth = -ring * 0.8;
      } else if (f === 'Column') {
        side = (i % 2) - 0.5; depth = -Math.floor(i / 2);
      } else {
        const a = i * 2.4, r = i ? 0.5 + i * 0.12 : 0; side = Math.cos(a) * r; depth = Math.sin(a) * r;
      }
      out.set(u, [tx + (px * side + fx * depth) * S, ty + (py * side + fy * depth) * S]);
    });
    return out;
  }

  // ------------------------------------------------------------ placement
  startPlace(type) {
    this.closePanel();
    if (BUILDINGS[type].wall) {
      this.place = { type, line: type === 'wall', a: null, b: null, cx: null, cy: null };
      $('#placebar').classList.remove('hidden'); $('#placeText').textContent = BUILDINGS[type].name;
      $('#bottombar').classList.add('hidden');
      this.R.scene.selected.clear(); this.refreshSel();
      this.toast(type === 'wall' ? 'Tap where the wall starts, then tap where it ends.' : 'Tap a spot, or an existing wall to turn it into a gate.');
      return;
    }
    const c = this.view.centerCell();
    this.place = { type, cx: c[0] - Math.floor(BUILDINGS[type].fw / 2), cy: c[1] - BUILDINGS[type].fh + 1 };
    $('#placebar').classList.remove('hidden');
    $('#placeText').textContent = BUILDINGS[type].name;
    $('#bottombar').classList.add('hidden');
    this.R.scene.selected.clear(); this.refreshSel();
    this.toast('Tap the map to choose a spot.');
  }
  movePlace(wx, wy) {
    const d = BUILDINGS[this.place.type];
    if (d.wall) {
      const c = [cellOf(wx), cellOf(wy)], p = this.place;
      if (p.line) { if (!p.a || p.b && p.done) { p.a = c; p.b = c; p.done = false; } else { p.b = c; p.done = true; } }
      else { p.cx = c[0]; p.cy = c[1]; }
      return;
    }
    this.place.cx = cellOf(wx) - Math.floor(d.fw / 2);
    this.place.cy = cellOf(wy) - d.fh + 1;
  }
  confirmPlace() {
    const p = this.place; if (!p) return;
    if (BUILDINGS[p.type].wall) {
      const cells = p.line ? (p.a ? this.R.wallLine(p.a, p.b) : []) : (p.cx != null ? [[p.cx, p.cy]] : []);
      if (!cells.length) { this.toast('Tap the map first.'); return; }
      const err = this.R.placeWalls(p.type, cells);
      if (err) { this.toast(err, 'red'); return; }
      if (p.line) { p.a = null; p.b = null; this.toast('Wall raised. Tap again for another line, or Cancel when done.'); } else this.cancelPlace();
      return;
    }
    const err = this.R.placeBuilding(p.type, p.cx, p.cy);
    if (err) { this.toast(err, 'red'); return; }
    this.cancelPlace();
  }
  cancelPlace() {
    this.place = null;
    $('#placebar').classList.add('hidden');
    if (!this.R.exp) $('#bottombar').classList.remove('hidden');
  }

  // ------------------------------------------------------------ panels
  togglePanel(name, arg) { if (this.panel === name && !arg) this.closePanel(); else this.openPanel(name, arg); }
  openPanel(name, arg) {
    if (this.R.exp && !['settings', 'army', 'chronicle'].includes(name)) return;
    if (this.panel !== name) audio.play('open');
    this.panel = name; this.panelArg = arg; this.tab = null;
    this.panelEl.classList.remove('hidden');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
    this.renderPanel();
    this.body.scrollTop = 0;
  }
  closePanel() {
    if (this.panel) audio.play('close');
    this.panel = null; this.live = [];
    this.panelEl.classList.add('hidden');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('on'));
  }
  refresh() { if (this.panel) { const st = this.body.scrollTop; this.renderPanel(); this.body.scrollTop = st; } }
  setTabs(list) {
    if (!list) { this.tabs.innerHTML = ''; return; }
    if (!this.tab) this.tab = list[0][0];
    this.tabs.innerHTML = list.map(([k, l]) => `<button class="btn small ${this.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
  }
  costHtml(cost) {
    const S = this.R.state;
    return `<div class="cost">${Object.entries(cost || {}).map(([k, v]) => `<span class="${S.res[k] < v ? 'lack' : ''}"><i class="ic ic-${k}"></i>${fmt(v)}</span>`).join('')}</div>`;
  }
  renderPanel() {
    this.live = [];
    const p = this.panel;
    const titles = { build: 'Build', workers: 'Workers', army: 'Army', voyage: 'Voyage', chronicle: 'Chronicle', settings: 'Settings', merchant: 'Merchant', building: '' };
    $('#panelTitle').textContent = p === 'building' ? (this.panelArg.def.name) : titles[p];
    this.setTabs(null);
    const fn = this['panel_' + p];
    this.body.innerHTML = fn ? fn.call(this) : '';
    if (this.afterRender) { this.afterRender(); this.afterRender = null; }
  }

  panel_build() {
    const R = this.R;
    return Object.entries(BUILDINGS).filter(([k]) => k !== 'castle').map(([k, d]) => {
      const lim = R.limitFor(k), n = R.countOf(k);
      const locked = lim === 0;
      const full = n >= lim;
      const ok = !locked && !full && R.canAfford(d.cost);
      const need = locked ? `Needs a ${TIERS.findIndex((t, i) => t && t.limits[k] > 0) > 0 ? TIERS[TIERS.findIndex((t, i) => t && t.limits[k] > 0)].name : 'bigger castle'}` : `${n} / ${lim} built`;
      return `<div class="card light"><div class="thumb"><img src="${src(BLD_IMG[k])}" alt=""></div>
        <div class="grow"><h3>${d.name}</h3><p>${d.desc}</p>${this.costHtml(d.cost)}<p class="muted">${need} - ${d.time}s</p></div>
        <button class="btn small" data-act="place:${k}" ${ok ? '' : 'disabled'}>Build</button></div>`;
    }).join('');
  }

  panel_workers() {
    const R = this.R, S = R.state, J = S.jobs;
    const busy = J.wood + J.gold + J.meat + J.build;
    const castle = R.castle;
    const q = castle.queue.filter(x => x.unit === 'pawn').length;
    const jobs = [['wood', 'Woodcutters', 'ic-wood', 'Chop trees. Forests regrow.'], ['gold', 'Miners', 'ic-gold', 'Break gold stones. New seams appear.'], ['meat', 'Shepherds', 'ic-meat', 'Bring back meat from the flock.'], ['build', 'Builders', 'ic-hammer', 'Speed up construction and repair damage.']];
    return `<p class="section-title">${S.pawns} pawns - ${S.pawns - busy} idle</p>` +
      jobs.map(([k, n, ic, d]) => `<div class="job card light"><i class="ic ${ic}"></i><div class="name"><h3>${n}</h3><p>${d}</p></div>
        <button class="tiny-btn red" data-act="job:${k}:-1">-</button><span class="count">${J[k]}</span><button class="tiny-btn" data-act="job:${k}:1">+</button></div>`).join('') +
      `<div class="card"><div class="thumb"><img src="${src('av_h5')}" class="av" alt=""></div><div class="grow"><h3>Train a Pawn</h3><p>New hands for the realm. Trained at the Castle.${q ? ` ${q} in training.` : ''}</p>${this.costHtml(UNITS.pawn.cost)}</div>
        <button class="btn small" data-act="train:${castle.id}:pawn">Train</button></div>
       <p class="muted" style="text-align:center;font-size:13px">Room: ${R.popUsed()} of ${R.popCap()} people. Houses add room, and upgraded Houses add more.</p>
       <p class="muted" style="font-size:13px;text-align:center">While you are away, assigned pawns keep working at half pace until the stores are full.</p>`;
  }

  soldierCard(rec, opts = {}) {
    const U = UNITS[rec.type];
    const next = rec.level < MAX_LEVEL ? XP_LEVELS[rec.level + 1] : null;
    const prev = XP_LEVELS[rec.level];
    const xpPct = next ? Math.min(100, (rec.xp - prev) / (next - prev) * 100) : 100;
    const u = this.R.home.units.find(x => x.rec === rec) || (this.R.exp && this.R.exp.units.find(x => x.rec === rec));
    const hpPct = u ? u.hp / u.maxHp * 100 : 100;
    const status = rec.status === 'away' ? 'On expedition' : rec.status === 'wounded' ? `Wounded, ${time((rec.woundedUntil - Date.now()) / 1000)}` : 'At home';
    return `<div class="card ${opts.pick ? 'light' : ''}" ${opts.pick ? `data-act="pick:${rec.id}"` : ''}>
      ${opts.pick ? `<button class="check ${this.squadPick.has(rec.id) ? 'on' : ''}"></button>` : ''}
      <div class="thumb"><img src="${src(rec.avatar)}" class="av" alt=""></div>
      <div class="grow"><h3>${esc(rec.name)}</h3><p>Level ${rec.level} ${U.name} - ${rec.kills} kills - ${status}</p>
        <div>${rec.traits.map(t => `<span class="trait ${TRAITS[t].rare ? 'rare' : ''}" title="${TRAITS[t].desc}">${TRAITS[t].name}</span>`).join('')}</div>
        <div class="hpbar"><i style="width:${hpPct}%"></i></div><div class="xpbar"><i style="width:${xpPct}%"></i></div></div>
      ${!opts.pick && rec.status === 'home' && !this.R.exp ? `<button class="btn small" data-act="find:${rec.id}">Find</button>` : ''}</div>`;
  }
  panel_army() {
    const R = this.R, S = R.state;
    this.setTabs([['roster', 'Roster'], ['fallen', 'Fallen'], ['relics', 'Relics']]);
    if (this.tab === 'fallen') {
      if (!S.fallen.length) return '<p class="section-title">No one has fallen yet. Keep it that way.</p>';
      return '<p class="section-title">The Hall of the Fallen</p>' + S.fallen.map(f => `<div class="card"><div class="thumb"><img src="${src(f.avatar)}" class="av" alt="" style="filter:grayscale(1)"></div>
        <div class="grow"><h3>${esc(f.name)}</h3><p>Level ${f.level} ${UNITS[f.type].name}, ${f.kills} kills. Fell ${esc(f.where)}, slain by ${esc(f.killer)}. ${ago(f.date)}.</p></div></div>`).join('');
    }
    if (this.tab === 'relics') {
      const owned = Object.keys(RELICS).filter(k => S.relics[k]);
      return `<p class="section-title">${owned.length} of ${Object.keys(RELICS).length} relics</p>` + Object.entries(RELICS).map(([k, r]) => `<div class="card ${S.relics[k] ? '' : 'light'}"><i class="ic ic-shield" style="${S.relics[k] ? '' : 'filter:grayscale(1);opacity:.5'}"></i>
        <div class="grow"><h3>${S.relics[k] ? r.name : 'Unknown relic'}</h3><p>${S.relics[k] ? r.desc : 'Won from bosses, great events, bounties, and stranger places.'}</p></div></div>`).join('');
    }
    const list = [...S.soldiers].sort((a, b) => b.level - a.level || b.kills - a.kills);
    const pop = `<p class="section-title">${S.soldiers.length} soldiers - room ${R.popUsed()}/${R.popCap()}</p>`;
    if (!list.length) return pop + '<p style="text-align:center">Build a Barracks or Archery Range to train soldiers.</p>';
    return pop + (R.exp ? '' : `<button class="btn wide" data-act="selall">Select everyone at home</button><p></p>`) + list.map(r => this.soldierCard(r)).join('');
  }

  panel_voyage() {
    const R = this.R, S = R.state;
    if (R.raid && R.raid.active) return '<p class="section-title">You cannot sail while the realm is under attack.</p>';
    if (R.events.pending) return '<p class="section-title">A great threat approaches. Stay and defend.</p>';
    const home = S.soldiers.filter(s => s.status === 'home');
    const cap = TIERS[S.tier].squad;
    for (const id of [...this.squadPick]) if (!home.some(s => s.id === id)) this.squadPick.delete(id);
    const info = islandInfo(S.frontier);
    const bountyDone = S.daily.bounty === S.daily.last;
    const target = this.voyageTarget || 'frontier';
    const isle = (k, title, sub, desc, enabled) => `<div class="card ${target === k ? '' : 'light'}" data-act="vt:${k}" style="${enabled ? '' : 'opacity:.5'}">
      <div class="thumb"><img src="${src(k === 'bounty' ? 'av_thief' : 'av_' + info.region.boss)}" class="av" alt=""></div>
      <div class="grow"><h3>${title}</h3><p>${sub}</p><p class="muted">${desc}</p></div></div>`;
    let html = '<p class="section-title">Choose an island</p>';
    html += isle('frontier', `Island ${info.n}: ${info.name}`, `${info.region.name} - Level ${info.level}${info.boss ? ' - Boss: ' + ENEMIES[info.region.boss].name : ''}`, info.boss ? `The boss guards a relic: ${RELICS[info.region.bossRelic].name}.` : 'Clear every camp to push the frontier onward.', true);
    html += isle('bounty', 'Bounty Isle', bountyDone ? 'Plundered today. A new one appears tomorrow.' : 'Double loot and a chance at a relic. Once per day.', 'A different island every day.', !bountyDone);
    html += `<p class="section-title">Pick your squad (${this.squadPick.size}/${cap})</p>`;
    if (!home.length) html += '<p style="text-align:center">No soldiers at home.</p>';
    html += home.sort((a, b) => b.level - a.level).map(r => this.soldierCard(r, { pick: true })).join('');
    html += `<p class="muted" style="text-align:center;font-size:13px">Soldiers who fall on an island are gone forever. Survivors return with experience and loot.</p>`;
    html += `<button class="btn wide" data-act="launch" ${this.squadPick.size && !(target === 'bounty' && bountyDone) ? '' : 'disabled'}>Set sail</button>`;
    return html;
  }

  panel_chronicle() {
    const R = this.R, S = R.state;
    this.setTabs([['quest', 'Chronicle'], ['realm', 'Realm'], ['log', 'Tales']]);
    if (this.tab === 'realm') {
      const days = Math.floor((Date.now() - S.created) / 86400000) + 1;
      const rows = [['Realm day', days], ['Castle', TIERS[S.tier].name], ['Renown', S.renown], ['Daily streak', S.daily.streak], ['Islands cleared', S.cleared], ['Raids repelled', S.stats.raidsSurvived], ['Raids lost', S.stats.raidsLost], ['Great events survived', S.stats.eventsSurvived], ['Monsters slain', S.stats.kills], ['Trolls slain', S.stats.trollsSlain], ['Soldiers fallen', S.fallen.length], ['Gold gathered', fmt(S.stats.gold || 0)], ['Wood gathered', fmt(S.stats.wood || 0)], ['Meat gathered', fmt(S.stats.meat || 0)], ['Storage cap', fmt(R.storage())]];
      return `<div class="stat-grid">${rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div>`;
    }
    if (this.tab === 'log') {
      if (!S.log.length) return '<p class="section-title">Your tale has yet to be told.</p>';
      return S.log.map(l => `<p class="log"><span class="when">${ago(l.t)}</span>${esc(l.text)}</p>`).join('');
    }
    const q = R.currentQuest();
    const v = R.questValue(q.type);
    const pct = Math.min(100, v / q.n * 100);
    const relicsOwned = Object.values(S.relics).filter(Boolean).length;
    return `<div class="card"><i class="ic ic-info" style="width:40px;height:40px"></i><div class="grow"><h3>${esc(q.text)}</h3><p>${Math.min(v, q.n)} / ${q.n}</p><div class="xpbar"><i style="width:${pct}%"></i></div>
      <p style="margin-top:4px">Reward</p>${this.costHtml(q.reward).replace(/lack/g, '')}</div></div>
      <p class="section-title">Goals that never end</p>
      <div class="card light"><div class="grow"><p>Push the frontier: island ${S.frontier} awaits. Every fifth island holds a boss and a relic.</p></div></div>
      <div class="card light"><div class="grow"><p>Raise the castle: ${S.tier < 5 ? 'next is ' + TIERS[S.tier + 1].name : 'Citadel reached. Raise your Renown without limit.'}</p></div></div>
      <div class="card light"><div class="grow"><p>Relics found: ${relicsOwned} of ${Object.keys(RELICS).length}. Great events like the Troll Breakout hold the rarest.</p></div></div>`;
  }

  panel_building() {
    const R = this.R, S = R.state, b = this.panelArg;
    if (!R.home.buildings.includes(b)) { setTimeout(() => this.closePanel()); return ''; }
    let html = `<div class="card light"><div class="thumb"><img src="${src(b.imgKey)}" alt=""></div><div class="grow"><p>${b.def.desc}</p>
      <div class="hpbar"><i id="bhp" style="width:${b.hp / b.maxHp * 100}%"></i></div><p class="muted" id="bhpt">${Math.ceil(b.hp)} / ${b.maxHp} health${b.ruined ? ' - in ruins' : ''}</p></div></div>`;
    this.live.push(() => { const e = $('#bhp'); if (e) e.style.width = (b.hp / b.maxHp * 100) + '%'; const t = $('#bhpt'); if (t) t.textContent = `${Math.ceil(b.hp)} / ${b.maxHp} health${b.ruined ? ' - in ruins' : ''}`; });
    if (!b.done) {
      html += `<p class="section-title" id="bbuild">Under construction: ${time((b.buildEnd - Date.now()) / 1000)}</p>`;
      this.live.push(() => { const e = $('#bbuild'); if (e) e.textContent = `Under construction: ${time((b.buildEnd - Date.now()) / 1000)}`; if (b.done) this.refresh(); });
      html += `<p style="text-align:center;font-size:13px">Builders working here make it rise twice as fast.</p>`;
    }
    if (b.type === 'castle') {
      if (S.upgradeEnd) {
        html += `<p class="section-title" id="bup">Growing into a ${TIERS[S.tier + 1].name}: ${time((S.upgradeEnd - Date.now()) / 1000)}</p>`;
        this.live.push(() => { const e = $('#bup'); if (e) { if (!S.upgradeEnd) return this.refresh(); e.textContent = `Growing into a ${TIERS[S.tier + 1].name}: ${time((S.upgradeEnd - Date.now()) / 1000)}`; } });
      } else if (S.tier < 5) {
        const nt = TIERS[S.tier + 1];
        const unlock = Object.entries(nt.limits).filter(([k, v]) => v > (TIERS[S.tier].limits[k] || 0)).map(([k, v]) => `${v} ${BUILDINGS[k].name}${v > 1 ? 's' : ''}`).join(', ');
        const units = Object.values(UNITS).filter(u => u.tier === S.tier + 1).map(u => u.name).join(', ');
        html += `<div class="card"><div class="grow"><h3>Grow into a ${nt.name}</h3><p>Storage ${fmt(nt.storage)}, squad of ${nt.squad}, castle health ${nt.castleHp}. Allows ${unlock}.${units ? ' New soldiers: ' + units + '.' : ''} Takes ${time(nt.time)}.</p>${this.costHtml(nt.cost)}</div>
          <button class="btn small" data-act="upgrade" ${R.canAfford(nt.cost) ? '' : 'disabled'}>Grow</button></div>`;
      } else {
        const c = renownCost(S.renown);
        html += `<div class="card"><div class="grow"><h3>Raise Renown to rank ${S.renown + 1}</h3><p>Each rank adds 4% to gathering, 3% to soldier health and damage, and 2000 storage. Raiders grow bolder too.</p>${this.costHtml(c)}</div>
          <button class="btn small" data-act="upgrade" ${R.canAfford(c) ? '' : 'disabled'}>Raise</button></div>`;
      }
    }
    if (b.def.gate) {
      html += `<div class="card"><div class="grow"><h3>${b.hold ? 'Held shut' : 'Automatic'}</h3><p>${b.hold ? 'The gate stays closed until you open it.' : 'Opens for your people, slams shut when foes come within 4 tiles.'}</p></div>
        <button class="btn small" data-act="gate:${b.id}">${b.hold ? 'Automatic' : 'Hold shut'}</button></div>`;
    }
    // level and upgrades (2.0)
    if (b.type !== 'castle' && b.done && !b.def.wall) {
      const cur = describeLevel(b.type, b.level);
      html += `<p class="section-title">Level ${b.level}${cur && b.level > 1 ? ': ' + cur : ''}</p>`;
      if (b.type === 'tower') {
        const L = levelEffects('tower', b.level), hl = R.home.map.level(b.cx, b.cy), high = hl > 0;
        html += `<p style="text-align:center;font-size:14px">Damage ${Math.round(BUILDINGS.tower.defense.dmg * (1 + (S.tier - 1) * 0.25) * L.dmg)}, range ${(BUILDINGS.tower.defense.range + hl * 1.5 + L.range).toFixed(1)} tiles${high ? ' (high ground bonus)' : ''}.</p>`;
      }
      if (b.upEnd) {
        html += `<p class="section-title" id="bupl">Upgrading to level ${b.level + 1}: ${time((b.upEnd - Date.now()) / 1000)}</p>`;
        this.live.push(() => { const e = $('#bupl'); if (e) { if (!b.upEnd) return this.refresh(); e.textContent = `Upgrading to level ${b.level + 1}: ${time((b.upEnd - Date.now()) / 1000)}`; } });
      } else if (b.level < 5) {
        const block = R.upgradeBlock(b);
        const c = upgradeCost(b.type, b.level);
        html += `<div class="card"><div class="grow"><h3>Upgrade to level ${b.level + 1}</h3><p>${describeLevel(b.type, b.level + 1)}. Also +30% health. Takes ${time(upgradeTime(b.type, b.level))}.</p>${this.costHtml(c)}${block && block.tierCap ? `<p class="warn">${block.msg}</p>` : ''}</div>
          <button class="btn small" data-act="bup:${b.id}" ${block ? 'disabled' : ''}>Upgrade</button></div>`;
      }
    }
    if (b.done && b.hp < b.maxHp && !(R.raid && R.raid.active)) {
      html += `<div class="card light"><div class="grow"><h3>${b.ruined ? 'In ruins' : 'Damaged'}</h3><p>Builders repair for free over time, or pay to fix it now.</p>${this.costHtml(R.repairCost(b))}</div>
        <button class="btn small" data-act="repair:${b.id}" ${R.canAfford(R.repairCost(b)) ? '' : 'disabled'}>Repair</button></div>`;
    }
    const opts = R.trainOptions(b);
    if (opts.length) {
      html += `<p class="section-title">Train <span class="muted">(${R.popUsed()} / ${R.popCap()} people)</span></p>`;
      html += opts.map(o => {
        const bl = o.block;
        const label = !bl ? 'Train' : bl.code === 'housing' ? 'No room' : bl.code === 'cost' ? 'Train' : bl.code === 'queue' ? 'Full' : bl.code === 'unique' ? 'Crowned' : 'Train';
        return `<div class="card ${o.locked ? 'light' : ''}"><div class="thumb"><img src="${src(UNIT_AV[o.key])}" class="av" alt=""></div>
        <div class="grow"><h3>${o.def.name}</h3><p>${o.def.desc}</p>${o.locked ? `<p class="muted">Requires a ${TIERS[o.def.tier].name}</p>` : this.costHtml(o.def.cost)}<p class="muted">${o.def.hp} health${o.def.dmg ? ', ' + o.def.dmg + ' damage' : ''}${o.def.heal ? ', heals ' + o.def.heal : ''} - ${R.trainTime(b, o.key)}s</p>
        ${bl && !o.locked && bl.code !== 'cost' ? `<p class="warn">${esc(bl.msg)}</p>` : ''}</div>
        <button class="btn small ${bl && bl.code === 'housing' ? 'red' : ''}" data-act="train:${b.id}:${o.key}" ${o.locked || (bl && bl.code === 'unique') ? 'disabled' : ''}>${label}</button></div>`;
      }).join('');
      html += `<p class="muted" style="text-align:center;font-size:12px">Tap a unit in the queue to cancel it for a full refund.</p><div class="queue" id="bqueue"></div>`;
      const renderQ = () => {
        const e = $('#bqueue'); if (!e) return;
        const now = Date.now();
        const k = b.queue.map(q => q.unit).join();
        if (e.dataset.k !== k) { e.dataset.k = k; e.innerHTML = b.queue.map((q, i) => `<button class="qi" data-act="cancel:${b.id}:${i}"><img src="${src(UNIT_AV[q.unit])}" alt=""><i></i></button>`).join(''); }
        [...e.children].forEach((c, i) => { const q = b.queue[i]; if (!q) return; const st = q.end - q.total * 1000; c.querySelector('i').style.width = Math.max(0, Math.min(100, (now - st) / (q.total * 1000) * 100)) + '%'; });
      };
      this.live.push(renderQ); this.afterRender = renderQ;
    }
    if (b.type !== 'castle') html += `<p></p><button class="btn small red wide" data-act="demolish:${b.id}">Demolish</button>`;
    return html;
  }

  panel_merchant() {
    const E = this.R.events, M = E.merchant;
    if (!M) return '<p class="section-title">The merchant has sailed away.</p>';
    return `<p class="section-title">Trader Pell's offers</p>` + M.offers.map((o, i) => `<div class="card light"><div class="grow row between"><div>${this.costHtml(o.give)}</div><i class="ic ic-go"></i><div>${this.costHtml(o.get).replace(/lack/g, '')}</div></div>
      <button class="btn small" data-act="trade:${i}" ${this.R.canAfford(o.give) ? '' : 'disabled'}>Trade</button></div>`).join('');
  }

  panel_settings() {
    const lvl = (key, v) => `<div class="row" style="justify-content:center;gap:4px">${[['Off', 0], ['Low', 0.3], ['Mid', 0.6], ['High', 1]].map(([l, x]) => `<button class="btn small ${Math.abs(audio.settings[key] - x) < 0.05 ? 'on' : ''}" data-act="vol:${key}:${x}">${l}</button>`).join('')}</div>`;
    return `<p class="section-title">Music</p>${lvl('music')}<p class="section-title">Sound effects</p>${lvl('sfx')}
      <p class="section-title">Your realm is saved in this browser automatically.</p>
      <button class="btn wide" data-act="export">Export save</button><p></p>
      <textarea id="saveText" placeholder="Paste a save here to import"></textarea><p></p>
      <button class="btn wide" data-act="import">Import save</button>
      <p class="section-title">Start over</p>
      <p style="text-align:center;font-size:13px">Wiping erases your castle, soldiers, relics and every record. This cannot be undone.</p>
      <button class="btn wide red" data-act="wipe">Wipe realm</button>
      <p class="section-title">Credits</p>
      <p style="text-align:center;font-size:13px">Art: Tiny Swords by Pixel Frog. Font: BoldPixels by YukiPixels (CC BY-SA 4.0). Music and sound are synthesized in your browser.</p>
      <p class="muted" style="text-align:center;font-size:12px">Tiny Realm ${VERSION}</p>`;
  }

  // ------------------------------------------------------------ actions
  act(a, el) {
    const R = this.R, [k, x, y] = a.split(':');
    const err = msg => { if (msg) this.toast(msg, 'red'); };
    if (k === 'place') return this.startPlace(x);
    if (k === 'job') { R.setJobCount(x, R.state.jobs[x] + (+y)); return this.refresh(); }
    if (k === 'train') {
      const b = R.home.buildings.find(o => o.id === +x);
      err(R.train(b, y)); return this.refresh();
    }
    if (k === 'upgrade') { err(R.upgradeCastle()); return this.refresh(); }
    if (k === 'gate') { const b = R.home.buildings.find(o => o.id === +x); b.hold = !b.hold; b.gateT = 0; return this.refresh(); }
    if (k === 'bup') { err(R.upgradeBuilding(R.home.buildings.find(o => o.id === +x))); return this.refresh(); }
    if (k === 'repair') { err(R.repairNow(R.home.buildings.find(o => o.id === +x))); return this.refresh(); }
    if (k === 'cancel') { const b = R.home.buildings.find(o => o.id === +x); R.cancelTrain(b, +y); return this.refresh(); }
    if (k === 'demolish') {
      const b = R.home.buildings.find(o => o.id === +x);
      return this.confirm('Demolish?', `Tear down this ${b.def.name}? You get a quarter of its cost back.`, 'Demolish', () => { R.demolish(b); this.closePanel(); });
    }
    if (k === 'find') {
      const u = R.home.units.find(o => o.rec && o.rec.id === +x);
      if (u) { this.closePanel(); this.view.centerOn(u.x, u.y); R.home.selected.clear(); R.home.selected.add(u); this.refreshSel(); }
      return;
    }
    if (k === 'selall') { this.closePanel(); this.selectAll(); return; }
    if (k === 'vt') { if (x === 'bounty' && R.state.daily.bounty === R.state.daily.last) return; this.voyageTarget = x; return this.refresh(); }
    if (k === 'pick') {
      const id = +x, cap = TIERS[R.state.tier].squad;
      if (this.squadPick.has(id)) this.squadPick.delete(id);
      else if (this.squadPick.size < cap) this.squadPick.add(id);
      else this.toast(`Your castle supports a squad of ${cap}.`);
      return this.refresh();
    }
    if (k === 'launch') {
      const ids = [...this.squadPick];
      const bounty = (this.voyageTarget || 'frontier') === 'bounty';
      this.squadPick.clear();
      R.startExpedition(R.state.frontier, ids, bounty);
      this.banner(R.exp.islandName, `${R.exp.region.name}, level ${R.exp.level}. Destroy every camp. Tap a soldier or All, then tap the ground or a foe.`, 'blue');
      return;
    }
    if (k === 'vol') { audio.unlock(); audio.settings[x] = +y; audio.saveSettings(); if (x === 'sfx') audio.play('coin'); return this.refresh(); }
    if (k === 'trade') { err(R.events.trade(+x)); return this.refresh(); }
    if (k === 'export') {
      const t = $('#saveText'); t.value = R.exportSave(); t.select();
      try { navigator.clipboard.writeText(t.value); this.toast('Save copied to clipboard.'); } catch (e) { this.toast('Save shown in the box. Copy it somewhere safe.'); }
      return;
    }
    if (k === 'import') {
      const v = $('#saveText').value;
      if (!v.trim()) return err('Paste a save first.');
      return this.confirm('Import save?', 'This replaces your current realm.', 'Import', () => {
        try { R.importSave(v); location.reload(); } catch (e) { err('That save could not be read.'); }
      });
    }
    if (k === 'wipe') {
      return this.confirm('Wipe your realm?', 'Everything will be erased and a new island will rise from the sea.', 'Wipe it all', () => {
        this.confirm('Are you certain?', 'Last chance. Your soldiers, relics and records will be gone forever.', 'Yes, start over', () => {
          this.wiping = true; R.wipe(); location.reload();
        });
      });
    }
  }

  expeditionResult(s) {
    const div = document.createElement('div');
    if (s.result === 'won') {
      div.innerHTML = `<p>${esc(s.name)} is cleared.</p><div class="cost" style="justify-content:center;font-size:18px"><span><i class="ic ic-gold"></i>+${s.loot.gold}</span><span><i class="ic ic-wood"></i>+${s.loot.wood}</span><span><i class="ic ic-meat"></i>+${s.loot.meat}</span></div>
        ${s.relic ? `<p>Relic found: <b>${RELICS[s.relic].name}</b>. ${RELICS[s.relic].desc}</p>` : ''}<p class="muted">Survivors: ${s.survivors.map(esc).join(', ') || 'none'}</p>`;
      this.choice('Victory', div, [{ label: 'Home' }]);
    } else if (s.result === 'lost') {
      div.innerHTML = `<p>No one returned from ${esc(s.name)}. Their names are kept in the Hall of the Fallen.</p>`;
      this.choice('The squad is lost', div, [{ label: 'Home' }]);
    } else {
      div.innerHTML = `<p>The squad sails home from ${esc(s.name)}.</p><p class="muted">Returning: ${s.survivors.map(esc).join(', ')}</p>`;
      this.choice('Retreat', div, [{ label: 'Home' }]);
    }
  }
}
