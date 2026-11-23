// HUD, panels and dialogs. Plain DOM styled with the pack's UI art.
import { SHEETS } from './assets.js';
import { REGIONS, levelCap, PROMOTIONS, PROMO_COST, UNITS, ENEMIES, BUILDINGS, TIERS, TRAITS, RELICS, XP_LEVELS, MAX_LEVEL, islandInfo, renownCost, STORY, upgradeCost, upgradeTime, describeLevel, levelEffects, ABILITIES, RIVALS, rivalDef, provinceOf } from './data.js';
const FORMATIONS = ['Loose', 'Line', 'Wedge', 'Column'];
import { Unit, Building, Struct, cellOf } from './world.js';
import { reachable } from './terrain.js';
import { T } from './terrain.js';
import { MAJOR } from './events.js';
import { audio } from './audio.js';
import { FEATS } from './tutorial.js';
import { upcomingHolidays } from './calendar.js';
import * as Gear from './gear.js';
import { NEEDS, MOODS, EXCHANGE } from './needs.js';
import { CHAPTERS, nextChapter, chapterOpen, chapterState } from './campaign.js';
import { ports } from './trade.js';
import { DECREES } from './decrees.js';
import { SHOP, SEASON_EVENTS } from './seasonal.js';
import * as Legacy from './legacy.js';
import { COLORS, STANCES, DISTRICTS, districtAt } from './squads.js';
import { minimapOn, setMinimap } from './minimap.js';
import { sigilCanvas } from './heraldry.js';
import { temperWord } from './kingdoms.js';
import { COLONY_LEVELS } from './colonies.js';
import { DOCTRINES, SHIP } from './warfare.js';
import { RULER_TRAITS, SEATS } from './court.js';
import { familyInfo, LORE_STEPS } from './saga.js';
import { SPEED } from './sea.js';
import { parseSeedWords, normalizeSeedWords } from './ocean.js';

export const VERSION = '9.0';
const NOTES_SEEN = '9.0'; // the what's-new notes below were last changed in 9.0

const $ = s => document.querySelector(s);
const src = k => SHEETS[k] ? encodeURI(SHEETS[k].src) : '';
// "1 kills" -> "1 kill": one pass over any text the UI shows
const SING = { kills: 'kill', foes: 'foe', pawns: 'pawn', soldiers: 'soldier', raids: 'raid', days: 'day', islands: 'island', points: 'point', voyages: 'voyage', tokens: 'token', pieces: 'piece', floors: 'floor', people: 'person', hours: 'hour', minutes: 'minute', boats: 'boat', camps: 'camp', relics: 'relic', feats: 'feat', newcomers: 'newcomer', fragments: 'fragment', lambs: 'lamb', creatures: 'creature', orders: 'order', trips: 'trip', gold_: 'gold' };
const RX = new RegExp('(^|[^\\d.,])1 (' + Object.keys(SING).join('|') + ')\\b', 'g');
export const fixText = s => typeof s === 'string' ? s.replace(RX, (m, a, w) => a + '1 ' + SING[w]) : s;
const fmt = n => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.floor(n));
const time = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}h ${m}m` : `${m}:${String(x).padStart(2, '0')}`; };
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
const UNIT_AV = { pawn: 'av_h5', warrior: 'av_h1', archer: 'av_h3', lancer: 'av_h2', monk: 'av_h4', swordsman: 'av_swordsman1', berserker: 'av_berserker1', horseman: 'av_horseman1', catapult: 'av_catapult1', king: 'av_king1' };
const REGION_NAMES = Object.fromEntries(REGIONS.map(r => [r.key, r.name]));
const BLD_IMG = { lantern: 'fire1', wall: 'fence', gate: 'fence', castle: 'b_Castle', house: 'b_House1', barracks: 'b_Barracks', archery: 'b_Archery', monastery: 'b_Monastery', tower: 'b_Tower', tavern: 'b_Tavern', market: 'b_Market', chapel: 'b_Chapel', bush: 'bush1', rock: 'rock1', stump: 'stump1' };
// a crisp thumbnail of a sprite's first frame, trimmed to its visible pixels and scaled by a whole number
const thumbCache = new Map();
const spriteThumb = (k, box = 48) => {
  if (thumbCache.has(k)) return thumbCache.get(k);
  const S = SHEETS[k]; if (!S || !S.img) return src(k);
  const fw = S.fw || S.img.width, fh = S.fh || S.img.height, c = document.createElement('canvas'); c.width = fw; c.height = fh;
  const x = c.getContext('2d'); x.drawImage(S.img, 0, 0, fw, fh, 0, 0, fw, fh);
  const d = x.getImageData(0, 0, fw, fh).data; let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let i = 0; i < fw; i++) if (d[(y * fw + i) * 4 + 3] > 8) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src(k);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, sc = Math.max(1, Math.floor(box / Math.max(w, h))), o = document.createElement('canvas');
  o.width = w * sc; o.height = h * sc; const ox = o.getContext('2d'); ox.imageSmoothingEnabled = false; ox.drawImage(c, x0, y0, w, h, 0, 0, w * sc, h * sc);
  const url = o.toDataURL(); thumbCache.set(k, url); return url;
};
const cap1 = s => s && !/^x\d/.test(s) ? s[0].toUpperCase() + s.slice(1) : s; // "x1.35 damage" stays as it is
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
    document.querySelectorAll('.navbtn').forEach(b => b.onclick = () => {
      if (b.dataset.panel === 'voyage') { if (this.R.exp) return this.toast('Finish the battle first, or Retreat.'); return this.seaOpen && !this.panel ? this.closeSea() : this.openSea(); }
      if (this.seaOpen) this.closeSea(true);
      this.togglePanel(b.dataset.panel);
    });
    $('#seaCard').addEventListener('click', e => { const el = e.target.closest('[data-sea]'); if (el && !el.disabled) this.seaAct(el.dataset.sea); });
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
    this.body.addEventListener('toggle', e => { const d = e.target; if (d.classList && d.classList.contains('codex')) { this.codexOpen = this.codexOpen || new Set(); if (d.open) this.codexOpen.add(d.dataset.key); else this.codexOpen.delete(d.dataset.key); } }, true);
    this.body.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && !el.disabled) this.act(el.dataset.act, el); });
    this.tabs.addEventListener('click', e => { const el = e.target.closest('[data-tab]'); if (el) { this.tab = el.dataset.tab; this.renderPanel(); } });
    $('#undoBtn').onclick = () => this.doUndo();
    $('#squadBtns').onclick = e => { const b = e.target.closest('[data-sq]'); if (b) { audio.play('click'); this.selectSquad(+b.dataset.sq); } };
    this.body.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('pickone')) this.pickOpen = e.target.open; }, true);
    $('#subbar').addEventListener('click', e => { const el = e.target.closest('[data-pill]'); if (el) this.pillAction(el.dataset.pill); });
    $('#hud').classList.remove('hidden');
    document.addEventListener('click', e => { const b = e.target.closest('button, .chip, summary'); if (b && !b.disabled && !b.classList.contains('navbtn')) audio.play('click'); }, true);
  }

  // ------------------------------------------------------------ messages
  toast(text, kind = '') {
    if (kind === 'red') audio.play('error');
    // the same message again just bumps a counter and restarts its timer
    const same = [...this.toastsEl.children].find(t => t.dataset.text === text && !t.classList.contains('out'));
    if (same) {
      const n = (+same.dataset.n || 1) + 1; same.dataset.n = n; if (this.panel) same.classList.add('over');
      same.querySelector('.tn').textContent = 'x' + n;
      same.classList.remove('bump'); void same.offsetWidth; same.classList.add('bump');
      clearTimeout(same._t); same._t = setTimeout(() => this.dropToast(same), 3600);
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast paper-dark' + (kind ? ' ' + kind : '') + (this.panel || kind === 'red' ? ' over' : '');
    el.dataset.text = text;
    el.innerHTML = `<span class="tt"></span><b class="tn"></b>`;
    el.firstChild.textContent = fixText(text);
    el.onclick = () => this.dropToast(el);
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
    el._t = setTimeout(() => this.dropToast(el), 3600 + Math.min(2400, text.length * 25));
  }
  dropToast(el) { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 450); }
  // a dialog, an open panel (unless it is a warning) or another banner holds a banner back until it is clear
  bannerBlocked(color) { return !this.modalEl.classList.contains('hidden') || (this.panel && color !== 'red'); }
  banner(title, text, color = 'blue') {
    const Q = this.bannerQueue = this.bannerQueue || [];
    if (this.bannerCur && this.bannerCur[0] === title && !this.bannerEl.classList.contains('hidden')) { this.showBanner(title, text, color); return; } // the same news again just refreshes
    const dup = Q.findIndex(q => q[0] === title); if (dup >= 0) Q.splice(dup, 1);
    if (this.bannerBlocked(color) || (!this.bannerEl.classList.contains('hidden') && color !== 'red')) { Q.push([title, text, color]); if (Q.length > 4) Q.shift(); return; }
    this.showBanner(title, text, color);
  }
  flushBanners() {
    const Q = this.bannerQueue; if (!Q || !Q.length || !this.bannerEl.classList.contains('hidden')) return;
    const i = Q.findIndex(q => !this.bannerBlocked(q[2])); if (i < 0) return;
    const [t, x, c] = Q.splice(i, 1)[0]; this.showBanner(t, x, c);
  }
  hideBanner() { this.bannerEl.classList.add('hidden'); clearTimeout(this.bannerT); setTimeout(() => this.flushBanners(), 350); }
  // a panel or dialog opening over a calm banner tucks it away to show again afterwards
  stashBanner() {
    const c = this.bannerCur; if (!c || this.bannerEl.classList.contains('hidden') || !this.bannerBlocked(c[2])) return;
    this.bannerEl.classList.add('hidden'); clearTimeout(this.bannerT);
    (this.bannerQueue = this.bannerQueue || []).unshift(c);
  }
  showBanner(title, text, color) {
    this.bannerCur = [title, text, color];
    const b = this.bannerEl;
    b.querySelector('.banner-ribbon').innerHTML = `<div class="ribbon ${color === 'gold' ? 'yellow' : color}"><span>${esc(title)}</span></div>`;
    const p = b.querySelector('p'); p.textContent = fixText(text); p.className = 'paper';
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => this.hideBanner(), (this.bannerQueue && this.bannerQueue.length ? 4000 : 6500) + Math.min(2000, text.length * 15));
    b.onclick = () => this.hideBanner();
  }
  choice(title, text, options) {
    if (!this.modalEl.classList.contains('hidden')) { this.modalQueue.push([title, text, options]); return; }
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = typeof text === 'string' ? `<p>${esc(fixText(text))}</p>` : '';
    if (typeof text !== 'string' && text.innerHTML) text.innerHTML = fixText(text.innerHTML);
    if (typeof text !== 'string') $('#modalBody').appendChild(text);
    const btns = $('#modalBtns'); btns.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'btn wide ' + (o.cls || ''); b.textContent = o.label;
      b.onclick = () => { this.closeModal(); o.fn && o.fn(); };
      btns.appendChild(b);
    }
    this.modalEl.classList.remove('hidden');
    this.stashBanner();
  }
  closeModal() {
    this.modalEl.classList.add('hidden');
    if (this.modalQueue.length) { const [a, b, c] = this.modalQueue.shift(); setTimeout(() => this.choice(a, b, c), 150); }
    else setTimeout(() => this.flushBanners(), 250);
  }
  confirm(title, text, ok, fn) { this.choice(title, text, [{ label: ok, cls: 'red', fn }, { label: 'Cancel' }]); }
  welcome(info) {
    const R = this.R, S = R.state;
    if (info.newAge) this.choice('A new age', 'Tiny Realm 4.0 begins a new age. Every realm now starts as a hamlet with two heroes and grows into a Kingdom, and the old saves have been set aside. Your past realms are still remembered in the Hall of Realms.', [{ label: 'Begin anew' }]);
    if (info.abandoned) setTimeout(() => this.banner('Landing abandoned', `The battle at ${info.abandoned} was left unfinished when the realm was closed. The crew is back aboard the ship.`, 'red'), 900);
    if (R.resumedRaid) setTimeout(() => this.banner('The raiders are still ashore', 'They were landing when you left. To arms!', 'red'), 700);
    if (info.fresh || !S.introSeen) {
      const intro = document.createElement('div');
      let legacyLine = '';
      if (info.inherit && (info.inherit.rank || info.inherit.founder)) {
        const lb = Legacy.rankBonus(info.inherit.rank), f = info.inherit.founder;
        legacyLine = `<p style="font-size:14px"><b>Legacy rank ${info.inherit.rank}.</b> ${info.inherit.rank ? `Every realm you found starts with ${lb.start} of each resource${lb.pawns ? ` and ${lb.pawns} extra pawn${lb.pawns > 1 ? 's' : ''}` : ''}, and gathers and fights ${Math.round(lb.gather * 100)}% better.` : ''}${f ? ` ${esc(f.name)} sailed with you as the realm's Founder${f.heirloom ? `, carrying ${esc(f.heirloom.name)}` : ''}.` : ''}</p>`;
      }
      intro.innerHTML = `<p>${esc(STORY.intro)}</p>${legacyLine}<p class="muted" style="font-size:13px">Drag to look around, pinch or scroll to zoom. Tap a soldier then tap the ground to move them. Tap buildings to train and upgrade.</p>`;
      this.choice('Tiny Realm', intro, [{ label: 'Begin', fn: () => { S.introSeen = true; R.save(); this.toast('Follow the Chronicle for your first goals.'); } }]);
    } else if (info.away && info.away.secs >= 30) {
      const a = info.away;
      const div = document.createElement('div');
      div.innerHTML = `<p>You were away for ${time(a.secs)}.</p>
        <div class="cost" style="justify-content:center;font-size:18px">
          <span><i class="ic ic-gold"></i>+${a.got.gold}</span><span><i class="ic ic-wood"></i>+${a.got.wood}</span><span><i class="ic ic-meat"></i>+${a.got.meat}</span></div>
        ${a.done.length ? `<p class="muted">${a.done.slice(0, 6).map(esc).join('<br>')}</p>` : ''}
        ${Object.values(S.res).some(v => v >= R.storage()) ? '<p>Your stores are full. Grow the realm to hold more.</p>' : ''}`;
      this.choice('Welcome back', div, [{ label: 'To work' }]);
    }
    if (!info.fresh && localStorage.getItem('tinyrealm.seen') !== NOTES_SEEN) {
      const div = document.createElement('div');
      div.innerHTML = `<p style="text-align:left;font-size:14px;line-height:1.4">
        <b>9.0 Saga, Bestiary and Codex</b><br>
        Chronicle, Saga: the great deeds of your realm are written down as they happen, one book for each ruler. Past realms keep their sagas in the Hall of Realms.<br>
        Bestiary: every kind of foe you meet, with what you have learned of it. Slay 25, 100 and 300 of a kind and your soldiers strike it 5% harder each time.<br>
        Codex: the realm's book of knowledge, filled in as you build, train, sail, find relics, appoint generals and pass decrees.<br><br>
        <b>8.0 Dynasty, Court and Nemesis</b><br>
        Tap the castle, then The throne room. Your realm has a ruling house now.<br>
        Dynasty: your ruler has traits that help the whole realm, and ages a year every four hours. Marry into a kingdom at peace with you for an heir. When the ruler dies the heir takes the throne; with no heir, a succession crisis.<br>
        Council: hire a Steward, Marshal, Chancellor and Spymaster. They draw wages, and leave if unpaid.<br>
        Nemesis: a captain who escapes your blades may swear vengeance. He leads raids in person with his name over his head, flees when badly hurt, and comes back stronger. Cut him down before he reaches his boat.<br><br>
        <b>7.0 Generals and Sea Battles</b><br>
        Generals: open a veteran of level 6 or more in Army and appoint them with a doctrine: Vanguard, Bulwark, Marksman or Warden. Everyone who fights beside them gains from it.<br>
        Generals rise from Captain to Commander to Marshal as they win battles, and their doctrine grows stronger.<br>
        Kingdoms at war with you now send war fleets against your island and your colonies. You can watch them come.<br>
        Tap an enemy fleet on the sea and Intercept it with your crew. Win the sea battle to sink it and take its gold, or meet it on the shore when it lands.<br>
        Refit the ship at home from the Crew panel: cannons, sails and hull.<br><br>
        <b>6.0 Colonies and Trade Fleets</b><br>
        Settle wild land, or any lair or ruin you have cleared: sail there and tap Found a colony. Two pawns stay behind as settlers.<br>
        Colonies fill their stores every hour and grow from Outpost to Settlement to Town. A Town adds a trade boat.<br>
        Bring the stores home with a trade boat, or load them aboard your fleet. Leave your crew as a garrison to guard against raids.<br>
        Trade routes now reach your colonies and the harbours of kingdoms you have a pact or alliance with, and you can watch your boats sail on the sea.<br>
        Trade, Colonies lists every colony you hold.<br><br>
        <b>5.0 Living Rivals</b><br>
        Every kingdom on the sea now has its own strength, temper and stance toward you: at war, at peace, in a truce, allied, or your vassal.<br>
        Watch their war fleets sail. Kingdoms seize each other's islands, and a taken island flies its conqueror's colours.<br>
        Diplomacy: tap a kingdom on the sea, then Diplomacy, to send gifts, offer truces, make peace, swear alliances, demand tribute or declare war.<br>
        Envoys arrive with offers and threats. Kingdoms at war with you send raiders, and neglected vassals may rebel.<br>
        Chronicle, Courts lists every court you know, with news from across the sea.<br><br>
        <b>4.0</b><br>
        Every realm begins as a hamlet with two heroes and grows into a Kingdom.<br>
        Voyage opens the open sea: sail your fleet to islands, kingdoms, ports and ruins with a crew of your choosing.<br>
        Every world grows from a seed you can keep and sail again.<br><br>
        <b>3.6</b><br>
        Move any building: tap it, then Move. Drag buildings and walls into place, with Undo.<br>
        Squads in Army: give each a banner and a stance, and it guards that district. Raid landings are marked, and the squads guarding there march to meet them.<br>
        Red brackets show what your troops are attacking, and a flag shows where they are going.<br>
        Decorations, neighbourhood bonuses, and a minimap in the corner.<br>
        A new loading screen, cursors, progress bars over buildings, and many small fixes.<br><br>
        <b>3.5</b><br>
        Promotions: level 10 soldiers become Knights, Berserkers, Cavaliers or Elites, and grow to level 15.<br>
        The Abyss: an endless descent. Press on or come home after every floor.<br>
        Royal decrees: choose one law each week. Every law has a price.<br>
        Seasonal events: The Harvest Fair runs until December, then The Long Night. Tasks, a weekly boss and a season shop live in Chronicle, Season.<br>
        New Game+: once the Castle is raised, found a new realm. Your Legacy grows, and one hero sails with you.<br>
        Fences can no longer trap your people.<br><br>
        <b>3.4</b><br>
        Hero gear: weapons, armour and trinkets drop from voyages and great events. Equip them from Army.<br>
        Daily and weekly challenges with a streak: every 7th day in a row brings a legendary piece.<br>
        Tavern, Market and Chapel keep your people happy. Happy realms gather faster and grow on their own.<br>
        The Drowned Crown: an eight chapter story across the sea.<br>
        Rival capitals now stand behind walls and a gate. Trade boats sail from your Market.<br><br>
        <b>3.3</b><br>
        When placing a building, every spot it can go is shaded green, and the ghost starts on the nearest good spot.
        Workers stand beside trees and rocks so their swings land. Ability buttons and the squad bar fit on phones.
        Counters roll, buttons press in, and fireflies drift on warm nights.<br><br>
        <b>3.2</b><br>
        Seasons now follow the real calendar. A cleaner status strip and notice list replace the scrolling ribbons.<br>
        Holy days follow the real calendar: Advent, Christmas Eve and Christmas, Epiphany, Palm Sunday, Good Friday, Easter, Ascension and Pentecost, plus New Year, Thanksgiving and summer festivals. Holy days bring peace, gifts and blessings.<br>
        The real moon: brighter full-moon nights, darker new moons with extra thieves, and the Moonlit Hunt once a month.<br>
        A Night Market opens after dark. Pawns sleep at night: build Lantern Posts to keep them working.<br>
        <b>3.1</b><br>
        The realm now runs on your real clock. Night falls at dusk where you are: torches are lit, night raids bring skeletons, bats and imps and pay 50% more, and wisps drift over the island.<br>
        Day and Night Orders: two new objectives at every dawn and dusk.<br>
        Annexed land becomes a province with a lasting bonus. Grass changes colour with the seasons.<br>
        <b>3.0</b><br>
        Your island lives in a much bigger sea now. Conquer a boss island or a rival capital and its land sails over and slams into your coast. Coastal tiles stay clear of buildings to make room.<br>
        Four rival houses now raid you. Conquer their capitals from Voyage to make them pay tribute.<br>
        Build walls and gates. Raiders must hack their way through.<br>
        Every soldier type has a special ability, and squads can march in formations. Expeditions have a 2x speed button.<br>
        Seasons, weather, and a day and night cycle.<br>
        27 Feats to earn, listed in the Chronicle.<br>
        <b>2.x</b><br>
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
      this.choice("What's new", div, [{ label: 'Onward' }]);
    }
    localStorage.setItem('tinyrealm.seen', NOTES_SEEN);
    if (R.pendingDaily) {
      const d = R.pendingDaily; R.pendingDaily = null;
      const div = document.createElement('div');
      div.innerHTML = `<p>${d.streak > 1 ? `Day ${d.streak} in a row.` : 'A new day dawns.'} Your people leave a gift at the ${R.seatName()} door.</p>
        <div class="cost" style="justify-content:center;font-size:18px"><span><i class="ic ic-gold"></i>+${d.gift.gold}</span><span><i class="ic ic-wood"></i>+${d.gift.wood}</span><span><i class="ic ic-meat"></i>+${d.gift.meat}</span></div>
        <p class="muted">Return tomorrow for a bigger gift.</p>`;
      this.choice('Daily tribute', div, [{ label: 'Thank you' }]);
    }
  }

  // ------------------------------------------------------------ per-frame HUD
  frame(dt) {
    // resource numbers roll toward their real value
    {
      const S = this.R.state; if (!this.shown || this.shownFor !== S) { this.shown = { gold: 0, wood: 0, meat: 0 }; this.shownFor = S; }
      for (const r of ['gold', 'wood', 'meat']) {
        const want = S.res[r], cur = this.shown[r];
        if (cur === want) continue;
        const next = Math.abs(want - cur) < 1 ? want : cur + (want - cur) * Math.min(1, dt * 7);
        this.shown[r] = next;
        const txt = fmt(next), el = this.resEls?.[r] || ((this.resEls = this.resEls || {})[r] = document.querySelector(`.res[data-r="${r}"] span`));
        if (el && el.textContent !== txt) el.textContent = txt;
      }
    }
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    const R = this.R, S = R.state, cap = R.storage();
    this.prevRes = this.prevRes || { ...S.res };
    for (const r of ['gold', 'wood', 'meat']) {
      const el = document.querySelector(`.res[data-r="${r}"]`);
      if (S.res[r] > this.prevRes[r] + 0.5) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      this.prevRes[r] = S.res[r];
      if (!this.shown) el.querySelector('span').textContent = fmt(S.res[r]);
      el.classList.toggle('full', S.res[r] >= cap);
    }
    document.querySelector('.res[data-r="pop"] span').textContent = `${R.popUsed()}/${R.popCap()}`;
    const tierTxt = TIERS[S.tier].name + (S.renown ? ` R${S.renown}` : '');
    if ($('#tierRibbon').textContent !== tierTxt) $('#tierRibbon').textContent = tierTxt;
    const J = S.jobs, idle = Math.max(0, S.pawns - J.wood - J.gold - J.meat - J.build);
    const badge = document.querySelector('[data-panel="workers"] .badge');
    if (idle > 0) { if (!badge) document.querySelector('[data-panel="workers"]').insertAdjacentHTML('beforeend', `<b class="badge">${idle}</b>`); else badge.textContent = idle; }
    else if (badge) badge.remove();
    this.renderPills();
    this.renderSquadBtns();
    for (const f of this.live) f();
    if (R.exp) this.renderExpHud();
    if (R.exp) R.checkExpedition();
    this.refreshSel();
  }
  renderPills() {
    const R = this.R, S = R.state, E = R.events;
    // status strip: tier, clock and sky, raid timer
    let raidText, raidHot = false, raidKey = 'raidsoon';
    if (R.raid && R.raid.active) { const n = R.raid.units.filter(u => u.alive).length + R.raid.queue.length; raidText = `${R.raid.title}: ${n} foes`; raidHot = true; raidKey = 'raid'; }
    else if (E.pending) { raidText = `${MAJOR[E.pending.kind].title} ${time(E.pending.t)}`; raidHot = true; raidKey = 'event'; }
    else if (R.exp) raidText = 'At sea';
    else { const hol = R.holiday(); raidText = hol && hol.peace ? 'Peace today' : `Raid in ${time(S.timers.raid)}`; raidHot = !(hol && hol.peace) && S.timers.raid < 120; }
    const env = R.env.label();
    const sKey = raidText + '|' + raidHot + '|' + env;
    if (sKey !== this.stKey) {
      this.stKey = sKey;
      $('#stEnv').textContent = env;
      const r = $('#stRaid'); r.textContent = fixText(raidText); r.classList.toggle('hot', raidHot); r.dataset.pill = raidKey;
      document.getElementById('statusbar').classList.toggle('night', R.env.isNight);
    }
    // notices: only what needs attention, newest-relevant first
    const N = [];
    const hol = R.holiday();
    if (hol) N.push(['holiday', 'gold', 'ic-shield', hol.name]);
    if (E.market && !R.exp) N.push(['market', 'purple', 'ic-gold', 'Night Market is open']);
    if (E.merchant) N.push(['merchant', 'gold', 'ic-gold', `Merchant ${time(E.merchant.t)}`]);
    if (E.bees) N.push(['bees', 'red', 'ic-x', 'Bee swarm in the forest']);
    if (R.home.goldRush > 0) N.push(['rush', 'gold', 'ic-gold', `Gold Rush ${time(R.home.goldRush)}`]);
    if (S.upgradeEnd) N.push(['upgrade', 'blue', 'ic-hammer', `${TIERS[Math.min(5, S.tier + 1)].name} in ${time((S.upgradeEnd - Date.now()) / 1000)}`]);
    if (!R.exp && S.orders) { const o = S.orders.list, d = o.filter(x => x.done).length; if (d < o.length) N.push(['orders', S.orders.kind === 'night' ? 'purple' : 'gold', 'ic-sword', `${S.orders.kind === 'night' ? 'Night' : 'Day'} orders ${d}/${o.length}`]); }
    if (!R.exp && R.state.tier >= 2 && R.seasonal.bossReady() && !R.seasonal.summonBlock()) N.push(['season', 'purple', 'ic-sword', `${R.seasonal.ev.boss.title} awaits`]);
    if (!R.exp && !R.decrees.D.pick) N.push(['decree', 'purple', 'ic-info', 'Choose this week\'s royal decree']);
    if (!R.exp && R.needs.get().mood.key === 'unhappy') N.push(['mood', 'red', 'ic-pawn', 'Your people are unhappy']);
    if (!R.exp && R.chal.C.day && !R.chal.C.day.done) { const c = R.chal.C.day; N.push(['chal', 'gold', 'ic-shield', `Daily: ${c.text}${c.n > 1 ? ` ${Math.floor(c.have)}/${c.n}` : ''}`]); }
    if (!R.exp) { const q = R.currentQuest(); N.unshift(['quest', 'blue', 'ic-info', `${q.text} ${Math.min(R.questValue(q.type), q.n)}/${q.n}`]); } // the goal tracker always leads
    const max = this.noticesOpen ? N.length : 3;
    const list = N.slice(0, max);
    if (N.length > 3) list.push(['more', 'more', null, this.noticesOpen ? 'Show less' : `+${N.length - 3} more`]);
    // keyed update so chips only animate in when they first appear
    const box = $('#pills'), have = new Map([...box.children].map(el => [el.dataset.pill, el]));
    let prev = null;
    for (const [k, c, ic, t] of list) {
      let el = have.get(k);
      if (!el) { el = document.createElement('div'); el.dataset.pill = k; el.innerHTML = (ic ? `<i class="ic ${ic}"></i>` : '') + '<span></span>'; }
      have.delete(k);
      const cls = 'chip ' + c; if (el.className !== cls) el.className = cls;
      const tt = fixText(t), sp = el.lastChild; if (sp.textContent !== tt) sp.textContent = tt;
      const want = prev ? prev.nextSibling : box.firstChild;
      if (want !== el) box.insertBefore(el, want);
      prev = el;
    }
    for (const el of have.values()) el.remove();
  }
  pillAction(k) {
    const R = this.R;
    if (k === 'more') { this.noticesOpen = !this.noticesOpen; this.renderPills(); return; }
    if (k === 'merchant') this.openPanel('merchant');
    else if (k === 'quest' || k === 'orders' || k === 'chal') this.openPanel('chronicle');
    else if (k === 'mood') this.openPanel('workers');
    else if (k === 'decree') this.openPanel('chronicle');
    else if (k === 'season') { this.openPanel('chronicle'); this.tab = 'season'; this.renderPanel(); }
    else if (k === 'market') this.openPanel('nightmarket');
    else if (k === 'holiday') { const h = R.holiday(); if (h) this.banner(h.name, (h.verse ? h.verse + ' ' : '') + h.desc, h.colour || 'gold'); }
    else if (k === 'env') { const e = R.env; this.toast(`${e.season.name}: ${e.season.desc}${e.weather !== 'clear' ? ' ' + e.w.name + ': ' + e.w.desc : ''}`); }
    else if (k === 'raid' && R.raid) { const u = R.raid.units.find(u => u.alive); if (u) this.view.centerOn(u.x, u.y); }
    else if (k === 'bees' && R.events.bees) this.view.centerOn(R.events.bees.x, R.events.bees.y);
    else if (k === 'upgrade') this.openPanel('building', R.castle);
    else if (k === 'raidsoon' || k === 'event') this.toast(`Keep soldiers near the ${R.seatName()} and towers on high ground.`);
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
    el.innerHTML = keys.map(k => { const t = types[k], ab = ABILITIES[k]; return `<button class="ab ${t.ready ? '' : 'cool'}" data-ab="${k}" title="${esc(ab.desc)}"><div class="cd" style="height:${t.ready ? 0 : t.cd * 100}%"></div><span class="abn">${ab.name}</span>${t.n > 1 ? `<b class="abc">${t.ready}/${t.n}</b>` : ''}</button>`; }).join('');
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
  // a kingdom of the open sea borrows a great house's colours: name its troops after its own house
  foeName(def) {
    const k = this.R.exp && this.R.exp.isle && this.R.exp.isle.kingdom;
    if (!k || !def || !def.rival || this.R.exp.isle.house) return def ? def.name : '';
    const own = (RIVALS.find(r => r.key === def.rival) || { name: 'House Azure' }).name.split(' ')[1];
    return def.name.replace(own, String(k.name).replace(/^House /, ''));
  }
  renderExpHud() {
    const st = this.R.expStatus(); if (!st) return;
    $('#expName').textContent = `${st.name} - ${st.region} - Level ${st.level}`;
    const stat = `<span>Camps ${st.camps}</span><span>Foes ${st.foes}</span>` + (st.boss && st.boss.alive ? `<span>Boss: ${esc(this.foeName(ENEMIES[st.boss.type]))}</span>` : '');
    if (stat !== this.expStatKey) { this.expStatKey = stat; $('#expStat').innerHTML = stat; }
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
    if (this.seaOpen) return this.seaTap(wx, wy);
    if (this.place) { this.movePlace(wx, wy); return; }
    if (this.bannerFor) {
      const e = R.squads.setBanner(this.bannerFor, cellOf(wx), cellOf(wy));
      if (e) return this.toast(e, 'red');
      const q = this.bannerFor; this.endBanner();
      this.toast(`${q.name} will guard ${DISTRICTS[districtAt(R, q.banner.cx, q.banner.cy)]}.`, 'gold');
      return;
    }
    const o = sc.pick(wx, wy);
    if (o && o.tap) { o.tap(); return; }
    if (!o && sc === R.home && !sc.selected.size) {
      const dd = R.decorAt(cellOf(wx), cellOf(wy));
      if (dd) return this.confirm('Clear this?', `Remove the ${BUILDINGS[dd.type].name.toLowerCase()}? Half its cost comes back.`, 'Clear', () => R.clearDecor(dd));
    }
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
        this.toast(`${this.foeName(ENEMIES[o.type])}, level ${o.level}. ${Math.ceil(o.hp)} health.`);
        return;
      }
    }
    if (o instanceof Struct) {
      if (sc.selected.size) { this.order({ type: 'attack', target: o }); return; }
      this.toast(`${this.foeName(o.def)}. ${o.def.palisade ? 'Break through to reach the castle.' : 'Destroy every camp to clear the island.'}`); return;
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
    if (BUILDINGS[type].wall || BUILDINGS[type].lantern || BUILDINGS[type].decor) {
      this.place = { type, line: type === 'wall', a: null, b: null, cx: null, cy: null };
      $('#placebar').classList.remove('hidden'); $('#placeText').textContent = BUILDINGS[type].name;
      $('#bottombar').classList.add('hidden');
      this.R.scene.selected.clear(); this.refreshSel();
      this.toast(BUILDINGS[type].decor ? 'Tap or drag to a spot, then Build here. You can place several.' : type === 'wall' ? 'Drag along the ground to lay a wall, or tap its two ends.' : type === 'lantern' ? 'Tap a spot near your woodcutters and miners.' : 'Tap a spot, or an existing wall to turn it into a gate.', 'hint');
      return;
    }
    const c = this.view.centerCell();
    this.place = { type, cx: c[0] - Math.floor(BUILDINGS[type].fw / 2), cy: c[1] - BUILDINGS[type].fh + 1 };
    $('#placebar').classList.remove('hidden');
    $('#placeText').textContent = BUILDINGS[type].name;
    $('#bottombar').classList.add('hidden');
    this.R.scene.selected.clear(); this.refreshSel();
    this.toast('Drag the building where you want it, or tap a spot. Green tiles are free.', 'hint');
  }
  startMove(b) {
    this.closePanel();
    if (this.R.raid && this.R.raid.active) return this.toast('Not while raiders are ashore.', 'red');
    this.R.liftBuilding(b);
    this.place = { type: b.type, move: b, from: [b.cx, b.cy], cx: b.cx, cy: b.cy, moved: true };
    $('#placebar').classList.remove('hidden'); $('#placeText').textContent = 'Move ' + b.def.name; $('#btnPlaceOk').textContent = 'Place here';
    this.view.centerOn(b.x, b.y - 60);
    $('#bottombar').classList.add('hidden');
    this.R.scene.selected.clear(); this.refreshSel();
    this.R.sfx('build');
    this.toast('Drag it to its new home. Green tiles are free.', 'hint');
  }
  // a few seconds to take back the last placement or move
  offerUndo(u) {
    this.undo = u; const el = $('#undoBtn'); el.classList.remove('hidden');
    el.style.setProperty('--t', '8s'); el.classList.remove('run'); void el.offsetWidth; el.classList.add('run');
    clearTimeout(this.undoT); this.undoT = setTimeout(() => { el.classList.add('hidden'); this.undo = null; }, 8000);
  }
  doUndo() {
    const u = this.undo, R = this.R; if (!u) return;
    this.undo = null; $('#undoBtn').classList.add('hidden'); clearTimeout(this.undoT);
    if (!R.home.buildings.includes(u.b)) return;
    if (u.kind === 'move') {
      R.liftBuilding(u.b);
      if (R.canPlace(u.b.type, u.from[0], u.from[1])) R.dropBuilding(u.b, u.from[0], u.from[1]);
      else { R.dropBuilding(u.b, u.to[0], u.to[1], true); this.toast('Its old spot is taken now.', 'red'); }
    } else if (u.kind === 'place' && !u.b.done) {
      R.home.removeBuilding(u.b); R.addAll(BUILDINGS[u.b.type].cost); R.home.fxAt('dust1', u.b.x, u.b.y); R.sfx('close');
      R.reach = reachable(R.home.map, R.door[0], R.door[1]); R.save();
    }
  }
  movePlace(wx, wy) {
    const d = BUILDINGS[this.place.type];
    if (d.wall || d.lantern || d.decor) {
      const c = [cellOf(wx), cellOf(wy)], p = this.place;
      if (p.line) { if (!p.a || p.b && p.done) { p.a = c; p.b = c; p.done = false; } else { p.b = c; p.done = true; } }
      else { p.cx = c[0]; p.cy = c[1]; }
      return;
    }
    this.place.cx = cellOf(wx) - Math.floor(d.fw / 2);
    this.place.cy = cellOf(wy) - d.fh + 1;
    this.place.moved = true;
  }
  confirmPlace() {
    const p = this.place; if (!p) return;
    if (BUILDINGS[p.type].decor) {
      if (p.cx == null) { this.toast('Tap the map first.'); return; }
      const err = this.R.placeDecor(p.type, p.cx, p.cy);
      if (err) this.toast(err, 'red');
      return; // stay in placing mode for the next one
    }
    if (BUILDINGS[p.type].wall || BUILDINGS[p.type].lantern) {
      const cells = p.line ? (p.a ? this.R.wallLine(p.a, p.b) : []) : (p.cx != null ? [[p.cx, p.cy]] : []);
      if (!cells.length) { this.toast('Tap the map first.'); return; }
      const err = this.R.placeWalls(p.type, cells);
      if (err) { this.toast(err, 'red'); return; }
      if (p.line) { p.a = null; p.b = null; this.toast('Wall raised. Tap again for another line, or Cancel when done.'); } else this.cancelPlace();
      return;
    }
    if (p.move) {
      const err = this.R.moveBuilding(p.move, p.cx, p.cy);
      if (err) { this.toast(err, 'red'); return; }
      const b = p.move; this.place = null; this.cancelPlace();
      if (b.cx !== p.from[0] || b.cy !== p.from[1]) this.offerUndo({ kind: 'move', b, from: p.from, to: [b.cx, b.cy] });
      return;
    }
    const err = this.R.placeBuilding(p.type, p.cx, p.cy);
    if (err) { this.toast(err, 'red'); return; }
    const nb = this.R.home.buildings[this.R.home.buildings.length - 1];
    this.cancelPlace();
    if (nb && nb.type === p.type) this.offerUndo({ kind: 'place', b: nb });
  }
  dropHints() { for (const t of this.toastsEl.querySelectorAll('.toast.hint')) this.dropToast(t); }
  endBanner() { this.dropHints(); this.bannerFor = null; $('#placebar').classList.add('hidden'); $('#btnPlaceOk').classList.remove('hidden'); if (!this.R.exp) $('#bottombar').classList.remove('hidden'); }
  cancelPlace() {
    if (this.bannerFor) return this.endBanner();
    const p = this.place;
    $('#btnPlaceOk').textContent = 'Build here';
    if (p && p.move && !this.R.home.buildings.includes(p.move)) this.R.dropBuilding(p.move, p.from[0], p.from[1], true); // put it back
    this.place = null; this.dropHints();
    $('#placebar').classList.add('hidden');
    if (!this.R.exp) $('#bottombar').classList.remove('hidden');
  }

  // ------------------------------------------------------------ the sea (4.0)
  openSea() {
    const R = this.R; if (R.exp) return;
    this.closePanel(); if (this.place) this.cancelPlace();
    R.scene.selected.clear(); this.refreshSel();
    this.seaOpen = true; R.seaOpen = true; document.body.classList.add('sea');
    this.view.enterSea(R.sea.W.fleet);
    this.seaSel = R.sea.fleetIsland() || null; this.seaKey = null; this.renderSeaCard();
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.panel === 'voyage'));
    audio.play('open');
  }
  closeSea(quiet) {
    if (!this.seaOpen) return;
    this.seaOpen = false; this.R.seaOpen = false; document.body.classList.remove('sea');
    this.view.exitSea(); this.seaSel = null;
    $('#seaCard').classList.add('hidden'); $('#seaTop').classList.add('hidden');
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('on'));
    if (!quiet) audio.play('close');
  }
  seaTap(wx, wy) {
    const Z = this.R.sea, is = Z.ocean.islandAt(wx, wy, 26);
    // a war fleet under your finger comes first
    const z = this.view.seaZoom ? this.view.seaZoom() : 1, near = (Z.W.fleets || []).filter(f => Z.fog.isRevealed(f.x, f.y)).map(f => [f, Math.hypot(f.x - wx, f.y - wy)]).sort((a, b) => a[1] - b[1])[0];
    if (near && near[1] < Math.max(40, 30 / z)) { this.seaSel = { kind: 'efleet', id: 'efleet', f: near[0], x: near[0].x, y: near[0].y }; audio.play('click'); this.seaKey = null; this.renderSeaCard(); return; }
    // an island counts as seen when any part of it is out of the fog (that is when its label shows)
    const seen = i => i.kind === 'home' || [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => Z.fog.isRevealed(i.x + dx * i.r, i.y + dy * i.r));
    if (is && seen(is)) this.seaSel = is;
    else if (this.seaSel && this.seaSel.kind === 'water' && Math.hypot(this.seaSel.x - wx, this.seaSel.y - wy) < 40) this.seaSel = null;
    else this.seaSel = { kind: 'water', id: null, x: wx, y: wy, name: Z.fog.isRevealed(wx, wy) ? 'Open sea' : 'Uncharted water' };
    audio.play('click');
    this.seaKey = null; this.renderSeaCard();
  }
  onFleetArrive(is) {
    this.toast(`The fleet reaches ${is.name}.`, 'gold');
    if (this.seaOpen) { this.seaSel = is; this.seaKey = null; this.renderSeaCard(); }
  }
  seaCardH() { return this.seaCardPx || 180; } // keeps ring names clear of the island card (measured twice a second)
  kindLabel(is) { return { home: 'Your island', kingdom: 'Kingdom', lair: 'Monster lair', ruins: 'Ruins', port: 'Free port', wild: 'Wild land', abyss: 'The Abyss', story: 'Story isle' }[is.kind] || ''; }
  renderSeaCard() {
    const R = this.R, S = R.state, Z = R.sea, W = Z.W, el = $('#seaCard'), top = $('#seaTop');
    if (!this.seaOpen) return;
    // the waters at the centre of the view
    const c = this.view.seaCenter(), ring = Z.ocean.ringOf(c[0], c[1]);
    const tt = `${ring.name} - danger ${ring.level}`;
    if (top.textContent !== tt) top.textContent = tt; top.classList.remove('hidden');
    const is = this.seaSel, sail = W.dest, docked = Z.fleetIsland(), crew = Z.crewRecs();
    let html = '';
    if (W.hold && Z.holdText()) html += `<div class="sea-status"><span>In the hold: <b>${esc(Z.holdText())}</b>. Unloaded at home.</span></div>`;
    const ch = W.chase && Z.chased();
    if (ch) { const ca = Z.ocean.islandById(ch.from); html += `<div class="sea-status"><span>Chasing the war fleet of <b>${esc(ca ? ca.kingdom.name : 'the enemy')}</b></span><button class="btn small red" data-sea="stop">Break off</button></div>`; }
    else if (sail) { const to = Z.ocean.islandById(sail.id); html += `<div class="sea-status"><span>Sailing to <b>${esc(to ? to.name : 'open sea')}</b>, ${time(Z.eta())}</span><button class="btn small red" data-sea="stop">Stop</button></div>`; }
    if (is && is.kind === 'efleet') {
      const f = is.f, live = (W.fleets || []).includes(f) && Z.fog.isRevealed(f.x, f.y);
      if (live && !f.power) { const fa = Z.ocean.islandById(f.from); f.power = Math.round(fa ? R.kingdoms.st(fa).power * 0.5 : 50); }
      if (!live) { this.seaSel = null; }
      else {
        const a = Z.ocean.islandById(f.from), to = Z.ocean.islandById(f.to), K = R.kingdoms, war = a && K.stance(a) === 'war';
        const bound = f.to === 'home' ? 'your island' : to ? to.name : 'open sea';
        const chasing = W.chase && W.chase.from === f.from && W.chase.to === f.to;
        let acts = '';
        if (!war) acts = `<p class="note">${a ? esc(a.kingdom.name) : 'They'} ${a && K.stance(a) === 'vassal' ? 'serve you' : 'are not at war with you'}. Declare war before you attack their ships.</p>`;
        else if (!crew.length) acts = '<p class="note">No crew aboard. Sail home and choose a crew to fight at sea.</p>';
        else if ((W.seaCooldown || 0) > Date.now()) acts = `<p class="note">The crew is still licking its wounds. They can fight again in ${time((W.seaCooldown - Date.now()) / 1000)}.</p>`;
        else if (chasing) acts = `<button class="btn red" data-sea="stop">Break off</button>`;
        else acts = `<button class="btn red" data-sea="intercept">Intercept</button>`;
        const odds = war && crew.length ? `<p class="muted">${R.war.oddsWord(f)}. Your strength ${R.war.crewPower()}, theirs ${Math.round(f.power || (a ? K.st(a).power * 0.5 : 50))}.</p>` : '';
        html += `<div class="isle"><div class="isle-head"><div class="sig" data-sig></div><div class="grow"><h3>War fleet ${a ? this.stanceTag(a) : ''}</h3><p>${a ? esc(a.kingdom.name) : 'Unknown colours'}, bound for ${esc(bound)}</p>${odds}</div><button class="tiny-btn red" data-sea="close" aria-label="Close"><i class="ic ic-x"></i></button></div><div class="isle-acts">${acts}</div></div>`;
      }
    } else if (is && is.kind === 'water') {
      const d = Math.round(Math.hypot(is.x - W.fleet.x, is.y - W.fleet.y)), rg = Z.ocean.ringOf(is.x, is.y);
      html += `<div class="isle"><div class="isle-head"><div class="grow"><h3>${is.name}</h3><p>${esc(rg.name)}, danger ${rg.level}. Sail out to see what lies there.</p></div><button class="tiny-btn" data-sea="close" aria-label="Close"><i class="ic ic-x"></i></button></div>
        <div class="isle-acts">${sail ? '' : `<button class="btn" data-sea="goto">Sail here (${time(d / Z.speed())})</button>`}</div></div>`;
    } else if (is) {
      const rel = is.kingdom ? Z.relation(is) : null, here = !sail && docked && docked.id === is.id;
      const d = Math.round(Math.hypot(is.x - W.fleet.x, is.y - W.fleet.y)), eta = time(d / Z.speed());
      const sub = R.colonies.C[is.id] ? `Your ${COLONY_LEVELS[R.colonies.C[is.id].level].name.toLowerCase()}, founded ${ago(R.colonies.C[is.id].founded)}` : is.kind === 'home' ? `The ${TIERS[S.tier].name.toLowerCase()} of your realm` : is.kind === 'kingdom' ? `${esc(is.kingdom.name)}, ${esc(is.kingdom.realm || '')}` : is.kind === 'lair' ? `${(REGION_NAMES[is.region] || 'Monsters')}${is.boss ? ', with a boss' : ''}` : is.kind === 'story' ? `The Drowned Crown, chapter ${is.chapter}` : { port: 'Trade routes, and rest for the crew', ruins: 'Old stones that may still hold treasure', abyss: 'Monsters from every shore, floor after floor', wild: 'Unclaimed land with good soil' }[is.kind] || this.kindLabel(is);
      const L = Z.landing(is);
      let acts = '';
      if (here) {
        if (L.act === 'land') acts = crew.length ? `<button class="btn" data-sea="land">${esc(L.label)} (${crew.length})</button>` : `<button class="btn" disabled>${esc(L.label)}</button><p class="note">No crew aboard. Sail home and choose a crew.</p>`;
        else if (L.act === 'home') acts = `<button class="btn" data-sea="crew">Choose crew</button>${crew.length ? `<button class="btn red" data-sea="disembark">Disembark (${crew.length})</button>` : ''}`;
        else if (L.act === 'settle') {
          const Co = R.colonies, why = Co.canSettle(is);
          acts = why ? `${L.note ? `<p class="note">${esc(L.note)}</p>` : ''}<p class="note">${esc(why)}</p>` : `<button class="btn" data-sea="settle">Found a colony</button>${this.costHtml(Co.cost())}<p class="note">Two pawns stay behind as settlers.</p>`;
        }
        else if (L.act === 'colony') {
          const Co = R.colonies, c = Co.C[is.id], gar = Co.garrison(is.id).length, st = Co.stores(is.id), any = Object.values(st).some(v => v > 0), cap = TIERS[S.tier].squad;
          acts = `<button class="btn" data-sea="load" ${any ? '' : 'disabled'}>Load the stores</button>`
            + (crew.length && gar < 4 + c.level * 2 ? `<button class="btn" data-sea="garrison">Leave the crew as garrison</button>` : '')
            + (gar && crew.length < cap ? `<button class="btn" data-sea="ungarrison">Take the garrison aboard (${gar})</button>` : '');
        }
        else if (L.act === 'port') acts = `<button class="btn" data-sea="rest" ${crew.length ? '' : 'disabled'}>Rest the crew</button><button class="btn" data-sea="trade">Trade routes</button>`;
        else acts = `<p class="note">${esc(L.note)}</p>`;
      } else if ((is.kind !== 'home' || !Z.atHome()) && !(sail && sail.id === is.id)) acts = `<button class="btn" data-sea="go">${is.kind === 'home' ? 'Sail home' : 'Sail here'} (${eta})</button>`;
      const relHtml = rel ? this.stanceTag(is) : R.colonies.C[is.id] ? '<span class="rel own">Your colony</span>' : '';
      const colInfo = R.colonies.C[is.id] ? this.colonyLine(is.id) : '';
      if (is.kind === 'kingdom') acts += `<button class="btn" data-sea="court">Diplomacy</button>`;
      html += `<div class="isle"><div class="isle-head"><div class="sig" data-sig></div><div class="grow"><h3>${esc(is.name)} ${relHtml}</h3><p>${sub}</p>${is.kind !== 'home' ? `<p class="muted">${this.kindLabel(is)} - ${is.kind === 'abyss' ? `floor ${(S.abyss && S.abyss.depth) || 1} awaits` : R.colonies.C[is.id] ? 'yours' : `level ${is.level}`} - ${esc(Z.ocean.ringOf(is.x, is.y).name)}${W.cleared[is.id] && !R.colonies.C[is.id] ? ' - cleared' : ''}</p>` : ''}${colInfo}</div><button class="tiny-btn red" data-sea="close" aria-label="Close"><i class="ic ic-x"></i></button></div>
        <div class="isle-acts">${acts}</div></div>`;
    }
    html += `<div class="sea-bar"><button class="btn small" data-sea="fleet">Fleet${crew.length ? ` (${crew.length})` : ''}${W.hold ? ' +cargo' : ''}</button><button class="btn small" data-sea="crewview">Crew</button><button class="btn small" data-sea="trade">Trade</button><button class="btn small" data-sea="homeview">Home</button></div>`;
    const key = html + (is ? is.id : '');
    if (key === this.seaKey) { this.seaCardPx = window.innerHeight - el.getBoundingClientRect().top + 8; document.body.style.setProperty('--seacard', Math.round(this.seaCardPx + 6) + 'px'); return; } this.seaKey = key;
    el.innerHTML = html; el.classList.remove('hidden');
    const sig = el.querySelector('[data-sig]');
    if (sig) {
      const sk = is && is.kind === 'efleet' ? (R.sea.ocean.islandById(is.f.from) || {}).kingdom : is && is.kingdom;
      if (sk) { const sc = sigilCanvas(sk.sigil, 44), cv = document.createElement('canvas'); cv.width = sc.width; cv.height = sc.height; cv.getContext('2d').drawImage(sc, 0, 0); sig.appendChild(cv); }
      else sig.remove();
    }
  }
  seaAct(a) {
    const R = this.R, Z = R.sea, is = this.seaSel, S = R.state;
    if (a === 'close') { this.seaSel = null; }
    else if (a === 'go' && is) { Z.sail(is); if (!Z.crewRecs().length && is.kind !== 'home' && Z.atHome()) this.toast('Sailing without a crew: you can scout, but not land. Choose a crew at home first.'); }
    else if (a === 'goto' && is) Z.sailTo(is.x, is.y);
    else if (a === 'intercept' && is && is.f) { if ((Z.W.seaCooldown || 0) > Date.now()) return this.toast('The crew needs time before another fight.', 'red'); Z.chase(is.f); this.toast('The fleet gives chase.'); }
    else if (a === 'stop') Z.stop();
    else if (a === 'fleet') this.view.seaFocus(Z.W.fleet.x, Z.W.fleet.y);
    else if (a === 'homeview') { this.closeSea(); return; }
    else if (a === 'trade') { this.closeSea(true); this.openPanel('voyage'); this.tab = 'trade'; this.renderPanel(); return; }
    else if (a === 'settle' && is) { const e = R.colonies.settle(is); if (e) return this.toast(e, 'red'); this.banner('A colony is founded', `Settlers raise an outpost on ${is.name}. Its stores fill every hour: send a trade boat, or load them aboard your fleet.`, 'blue'); }
    else if (a === 'load' && is) { const st = R.colonies.empty(is.id), W = Z.W; W.hold = W.hold || {}; for (const k in st) W.hold[k] = (W.hold[k] || 0) + st[k]; this.toast('The stores are loaded. They are unloaded when the fleet reaches home.', 'gold'); R.save(); }
    else if (a === 'garrison' && is) { R.colonies.leaveGarrison(is.id, Z.crewRecs()); this.toast('The crew stays to guard the colony.', 'gold'); R.save(); }
    else if (a === 'ungarrison' && is) { R.colonies.takeGarrison(is.id, TIERS[S.tier].squad); this.toast('The garrison comes aboard.', 'gold'); R.save(); }
    else if (a === 'court' && is) { const id = is.id; this.closeSea(true); this.openPanel('court', id); return; }
    else if (a === 'crew' || a === 'crewview') { this.closeSea(true); this.openPanel('crew'); return; }
    else if (a === 'disembark') { Z.disembark(); this.toast('The crew comes ashore.'); }
    else if (a === 'rest') {
      if (Z.W.rested === (is && is.id)) return this.toast('They have rested here already. Sail on, and rest at the next port.');
      Z.W.rested = is && is.id; for (const r of Z.crewRecs()) r.hp = undefined; // undefined means full health when they next take the field
      R.save(); this.toast('The crew eats well and sleeps in real beds. Everyone is back to full health.', 'gold');
    }
    else if (a === 'land' && is) {
      const L = Z.landing(is); if (L.act !== 'land') return;
      const ids = Z.crewRecs().map(r => r.id);
      this.closeSea(true);
      R.startExpedition(S.frontier, ids, L.mode);
      this.banner(R.exp.islandName, `${R.exp.region.name}, level ${R.exp.level}. ${is.kind === 'kingdom' ? 'Break the walls and take the castle.' : R.exp.structs.length ? 'Destroy every camp.' : 'Defeat every monster.'} Tap a soldier or All, then tap the ground or a foe.`, 'blue');
      return;
    }
    this.seaKey = null; this.renderSeaCard();
  }
  sagaHtml() {
    const R = this.R, S = R.state, P = R.saga.progress();
    let html = `<div class="row-btns"><button class="btn small" data-act="codex:bestiary">Bestiary (${P.bn} of ${P.bof})</button><button class="btn small" data-act="codex:codex">Codex (${P.n} of ${P.of})</button></div>`;
    const books = R.saga.books();
    if (!books.length) html += '<p class="section-title">Your saga has yet to be told.</p>';
    for (const b of books) {
      html += `<div class="book"><p class="book-title">The Book of ${esc(b.ruler || 'the Founders')}</p>` + b.entries.filter(e => e.kind !== 'minor').map(e => `<p class="saga-line"><span class="sday">Day ${e.day}</span><span>${esc(e.text)}</span></p>`).join('') + `</div>`;
    }
    html += `<details class="tales"><summary>Daily tales (${S.log.length})</summary>${S.log.map(l => `<p class="log"><span class="when">${ago(l.t)}</span>${esc(l.text)}</p>`).join('')}</details>`;
    return html;
  }
  panel_codex() {
    const R = this.R, Sg = R.saga;
    if (!['bestiary', 'codex'].includes(this.tab)) this.tab = this.panelArg || 'bestiary';
    this.setTabs([['bestiary', 'Bestiary'], ['codex', 'Codex']]);
    if (this.tab === 'bestiary') {
      const fams = Sg.families(), B = Sg.B, known = fams.filter(f => B[f]);
      let html = `<p class="section-title">${known.length} of ${fams.length} kinds of foe</p><p style="text-align:center;font-size:13px">Every 25, 100 and 300 of a kind slain teaches your soldiers to strike it 5% harder.</p>`;
      const order = fams.slice().sort((a, b) => (B[b] ? 1 : 0) - (B[a] ? 1 : 0) || ((B[b] || {}).kills || 0) - ((B[a] || {}).kills || 0));
      html += order.map(f => {
        const b = B[f], I = familyInfo(f), d = I.def || {};
        if (!b) return `<div class="card light locked"><div class="thumb"><span class="qm">?</span></div><div class="grow"><h3>Unknown foe</h3><p class="muted">Not yet met.</p></div></div>`;
        const key = SHEETS[`${I.sprite}_idle`] ? `${I.sprite}_idle` : SHEETS[`${I.sprite}_run`] ? `${I.sprite}_run` : null, nx = Sg.nextLore(f), lo = Sg.lore(f.startsWith('house_') ? 'red_' + f.slice(6) : f);
        return `<div class="card light"><div class="thumb">${key ? `<img src="${spriteThumb(key)}" alt="">` : ''}</div><div class="grow"><h3>${esc(I.name)} <span class="rel ${lo ? 'ally' : 'neutral'}">${Sg.loreWord(f)}</span></h3><p>${esc(Sg.loreText(f))}</p><p class="muted">Health ${d.hp || '?'}, ${d.dmg ? `damage ${d.dmg}` : d.heal ? `heals ${d.heal}` : 'damage ?'}${d.proj ? ', ranged' : ''}. Slain: ${b.kills}.${lo ? ` +${Math.round(lo * 100)}% damage against them.` : ''}${nx ? ` Slay ${nx} more for the next step.` : ''}</p></div></div>`;
      }).join('');
      return html;
    }
    const P = Sg.progress();
    let html = `<p class="section-title">The Codex: ${P.n} of ${P.of} known</p>`;
    for (const c of Sg.chapters()) {
      const n = c.items.filter(i => i.on).length;
      html += `<details class="codex" data-key="${c.key}" ${this.codexOpen && this.codexOpen.has(c.key) ? 'open' : ''}><summary>${c.name} <span class="muted">${n} of ${c.items.length}</span></summary>` + c.items.map(i => i.on ? `<div class="card light"><div class="thumb">${i.img ? `<img src="${SHEETS[i.img] && SHEETS[i.img].fw ? spriteThumb(i.img) : src(i.img)}" alt="">` : '<i class="ic ic-shield"></i>'}</div><div class="grow"><h3>${esc(i.name)}</h3><p>${esc(i.desc || '')}</p></div></div>` : `<div class="card light locked"><div class="thumb"><span class="qm">?</span></div><div class="grow"><h3>Not yet known</h3></div></div>`).join('') + `</details>`;
    }
    return html;
  }
  panel_throne() {
    const R = this.R, S = R.state, Co = R.court;
    if (!['dynasty', 'council', 'nemesis'].includes(this.tab)) this.tab = 'dynasty';
    this.setTabs([['dynasty', 'Dynasty'], ['council', 'Council'], ['nemesis', 'Nemesis']]);
    const traits = ts => ts.map(t => `<span class="trait" title="${esc(RULER_TRAITS[t].desc)}">${RULER_TRAITS[t].name}</span>`).join('');
    const tdesc = ts => ts.map(t => RULER_TRAITS[t].desc).join('; ');
    if (this.tab === 'dynasty') {
      const D = Co.D, r = D.ruler, left = Math.max(0, r.dies - Co.age(r));
      let html = `<p class="section-title">${esc(D.house)}, generation ${D.gen}</p>`;
      html += `<div class="card"><div class="thumb"><img src="${src(r.avatar)}" class="av" alt=""></div><div class="grow"><h3><span class="rank">${Co.title()}</span> ${esc(Co.regnal(r))}</h3><p>Age ${Co.age(r)}. ${left <= 6 ? 'Grey and failing: the end is near.' : left <= 15 ? 'In the autumn of life.' : 'Hale and strong.'} A year passes every four hours.</p><div>${traits(r.traits)}</div><p class="muted">${esc(tdesc(r.traits))}.</p></div></div>`;
      if (D.spouse) html += `<div class="card light"><div class="thumb"><img src="${src(D.spouse.avatar)}" class="av" alt=""></div><div class="grow"><h3>${esc(D.spouse.name)}, consort</h3><p>Of ${esc(D.spouse.house)}.</p><div>${traits([D.spouse.trait])}</div><p class="muted">${esc(tdesc([D.spouse.trait]))}.</p></div></div>`;
      if (D.heir) html += `<div class="card light"><div class="thumb"><img src="${src(D.heir.avatar)}" class="av" alt=""></div><div class="grow"><h3>${esc(D.heir.name)}, heir</h3><p>Age ${Co.age(D.heir)}. Takes the throne when ${esc(r.name)} dies.</p><div>${traits(D.heir.traits)}</div></div></div>`;
      else if (D.spouse) html += `<p style="text-align:center;font-size:13px">No heir yet. ${D.childAt ? 'A child is expected before long.' : ''}</p>`;
      else {
        const su = Co.suitors(), cost = Co.marryCost();
        html += `<p class="section-title">A match for the ruler</p><p style="text-align:center;font-size:13px">Without an heir, the ruler's death brings a succession crisis. Marry into a kingdom at peace with you: their regard rises, and a child will follow.</p>`;
        html += su.length ? su.map(is => { const k = R.kingdoms.st(is); return `<div class="card light"><div class="sig" data-sigil="${esc(is.id)}"></div><div class="grow"><h3>${esc(is.kingdom.name)} ${this.stanceTag(is)}</h3><p>Regard: ${R.kingdoms.regardWord(is).toLowerCase()}.</p>${this.costHtml(cost)}</div><button class="btn small" data-act="marry:${is.id}" ${k.rel >= 5 ? '' : 'disabled'}>${k.rel >= 5 ? 'Propose' : 'Needs regard'}</button></div>`; }).join('') : '<p class="muted" style="text-align:center;font-size:13px">No court at peace with you knows of you yet. Sail out, make peace, send gifts.</p>';
      }
      if (D.past.length) html += `<p class="section-title">Those who ruled before</p>` + D.past.map(p => `<div class="card light"><div class="thumb"><img src="${src(p.avatar)}" class="av" alt="" style="filter:grayscale(1)"></div><div class="grow"><h3>${esc(p.name)}</h3><p>Died ${esc(p.cause)} at ${p.age}, ${ago(p.to)}.</p><div>${traits(p.traits)}</div></div></div>`).join('');
      return html;
    }
    if (this.tab === 'council') {
      const C = Co.C, pool = Co.candidates();
      let html = `<p class="section-title">The council</p>`;
      html += Object.entries(SEATS).map(([k, D]) => { const c = C.seats[k]; return c ? `<div class="card"><div class="thumb"><img src="${src(c.avatar)}" class="av" alt=""></div><div class="grow"><h3><span class="rank">${D.name}</span> ${esc(c.name)}</h3><p>Skill ${c.skill}: ${D.desc(c.skill)}. Wage ${Co.wage(c)} gold an hour.</p><p class="muted">Loyalty: ${c.loyalty >= 70 ? 'devoted' : c.loyalty >= 40 ? 'content' : 'unhappy'}.</p></div><button class="btn small red" data-act="cdis:${k}">Dismiss</button></div>` : `<div class="card light"><div class="grow"><h3>${D.name}: empty</h3><p>${D.desc(1)} at skill 1, more with greater skill.</p></div></div>`; }).join('');
      html += `<p class="section-title">Seeking a place at court</p>` + pool.map(c => `<div class="card light"><div class="thumb"><img src="${src(c.avatar)}" class="av" alt=""></div><div class="grow"><h3>${esc(c.name)}</h3><p>Skill ${c.skill}. Asks ${Co.wage(c)} gold an hour.</p>${this.costHtml(Co.hireCost(c))}<div class="seatbtns">${Object.entries(SEATS).map(([k, D]) => `<button class="btn small ${C.seats[k] ? 'off' : ''}" data-act="hire:${c.id}:${k}">${D.name}${C.seats[k] ? ' (replace)' : ''}</button>`).join('')}</div></div></div>`).join('');
      html += `<p class="muted" style="text-align:center;font-size:13px">New petitioners arrive every two hours. Councillors who go unpaid grow unhappy, and leave.</p>`;
      return html;
    }
    const N = Co.N;
    if (!N) return `<p class="section-title">No nemesis, yet</p><p style="text-align:center;font-size:13px">Once your realm is a Castle, beating off raiders of a rival house or a kingdom at war may leave one of their captains swearing vengeance. They will lead raids in person, and grow stronger each time they get away. Make peace with their house and they stay away.</p>`;
    const alive = N.status === 'active';
    return `<p class="section-title">${alive ? 'Your nemesis' : 'Your last nemesis'}</p><div class="card ${alive ? '' : 'light'}"><div class="thumb"><img src="${src('av_h' + (3 + (N.name.length % 20)))}" class="av" alt="" style="${alive ? '' : 'filter:grayscale(1)'}"></div><div class="grow"><h3>${esc(Co.nemesisName(N))}</h3><p>Captain of ${esc(N.house)}. ${alive ? `Strength ${N.level} of 6, with ${N.scars} scar${N.scars === 1 ? '' : 's'} from your blades. You have met ${N.met - 1} time${N.met === 2 ? '' : 's'}${N.wins ? `, and they have beaten you ${N.wins} time${N.wins === 1 ? '' : 's'}` : ''}.${R.court.nemesisAtWar() ? '' : ' Their house is not at war with you, so they keep away.'}` : `Slain ${ago(N.endAt)}.`}</p></div></div>
      <p style="text-align:center;font-size:13px">${alive ? 'They lead some raids of their house in person, with their name overhead. Bring them below a quarter of their health and they run for the boats: cut them down first, or they return stronger.' : 'Another may rise in time.'}</p>`;
  }
  generalHtml(rec) {
    const Wf = this.R.war;
    if (rec.type === 'king') return '';
    let html = `<p class="section-title">Command</p>`;
    if (rec.general) {
      const D = DOCTRINES[rec.general], w = rec.command || 0, nxt = w < 5 ? 5 : w < 15 ? 15 : null;
      html += `<div class="card light"><div class="grow"><h3>${esc(D.name)} ${esc(Wf.rankName(rec))}</h3><p>${esc(D.desc)} At this rank the effect is ${Math.round(Wf.power(rec) * 100)}%.</p><p class="muted">${w} victor${w === 1 ? 'y' : 'ies'}${nxt ? `, ${nxt - w} more to the next rank` : ', the highest rank'}.</p></div><button class="btn small red" data-act="gendis:${rec.id}">Relieve</button></div>`;
      return html;
    }
    const why = Wf.canAppoint(rec);
    if (why) return html + `<p style="text-align:center;font-size:13px">${esc(why)} A general lifts every soldier who fights beside them.</p>`;
    html += `<p style="text-align:center;font-size:13px">Make ${esc(rec.name.split(' ')[0])} a general (${Wf.appointCost().gold} gold). Choose a doctrine:</p>`;
    html += Object.entries(DOCTRINES).map(([k, D]) => `<div class="card light"><div class="grow"><h3>${D.name}</h3><p>${D.desc}</p></div><button class="btn small" data-act="genapp:${rec.id}:${k}">Appoint</button></div>`).join('');
    return html;
  }
  shipHtml() {
    const Wf = this.R.war, sh = Wf.ship(), home = this.R.sea.atHome();
    let html = `<p class="section-title">The ship</p><p style="text-align:center;font-size:13px">Sea strength with this crew: <b>${Wf.crewPower() || 'no crew aboard'}</b>.${home ? '' : ' Refits are done at home.'}</p>`;
    html += Object.entries(SHIP).map(([k, D]) => { const full = sh[k] >= D.max; return `<div class="card light"><div class="grow"><h3>${D.name} ${sh[k]}/${D.max}</h3><p>${D.desc}</p>${full ? '' : this.costHtml(Wf.shipCost(k))}</div>${full ? '' : `<button class="btn small" data-act="refit:${k}" ${home ? '' : 'disabled'}>Refit</button>`}</div>`; }).join('');
    return html;
  }
  seaBattle(res, f) {
    const R = this.R, Z = R.sea; this.boom = { x: (f.x + Z.W.fleet.x) / 2, y: (f.y + Z.W.fleet.y) / 2, t0: performance.now() };
    R.sfx && R.sfx('hit');
    setTimeout(() => {
      const div = document.createElement('div');
      const volleys = res.rounds.map(h => `<span class="volley ${h ? 'ok' : 'bad'}">${h ? 'Hit' : 'Hit taken'}</span>`).join('');
      div.innerHTML = `<div class="volleys">${volleys}</div><p>${res.win ? `Your fleet sank the war fleet of ${esc(res.name)}. ${res.loot ? `You took ${res.loot} gold from the wreck` : 'Your gold stores are too full to take any from the wreck'}, and the crew gained experience.` : `The war fleet of ${esc(res.name)} drove you off. ${res.hurt.length ? esc(res.hurt.join(', ')) + (res.hurt.length > 1 ? ' were' : ' was') + ' wounded and sent home to mend.' : ''}`}</p>`;
      this.choice(res.win ? 'Victory at sea' : 'Beaten at sea', div, [{ label: res.win ? 'Onward' : 'Withdraw' }]);
      R.sfx && R.sfx(res.win ? 'victory' : 'defeat');
      this.seaKey = null; this.renderSeaCard();
    }, 1600);
  }
  colonyLine(id) {
    const Co = this.R.colonies, c = Co.C[id], r = Co.rate(id), st = Co.stores(id), gar = Co.garrison(id).length, Lv = COLONY_LEVELS[c.level];
    const res = o => Object.entries(o).map(([k, v]) => `<span><i class="ic ic-${k}"></i>${fmt(v)}</span>`).join('');
    return `<p class="muted">${Lv.name}${c.sackedUntil > Date.now() ? ', sacked: work resumes in ' + time((c.sackedUntil - Date.now()) / 1000) : ''}. Garrison: ${gar || 'none'}.</p><div class="cost"><span class="muted" style="font-size:12px">Per hour</span>${res(r)}</div><div class="cost"><span class="muted" style="font-size:12px">Stores</span>${res(st)}</div>`;
  }
  coloniesHtml() {
    const R = this.R, S = R.state, Co = R.colonies, L = Co.list();
    let html = `<p class="section-title">Colonies (${L.length} of ${Co.max()})</p>`;
    if (!L.length) return html + `<p style="text-align:center;font-size:13px">Sail to wild land, or to a lair you have cleared, and found a colony there. ${S.tier < 2 ? 'Your hamlet must grow into a Village first.' : 'Each one costs two pawns as settlers.'}</p>`;
    for (const { id, c, is } of L) {
      const up = c.level < 3 ? `<button class="btn small" data-act="colup:${id}">Grow into a ${COLONY_LEVELS[c.level + 1].name}</button>${this.costHtml(Co.upCost(c))}` : '<p class="muted" style="font-size:12px">A Town, with a wharf that adds a trade boat while you have a Market.</p>';
      const route = R.trade.st.slots.some(s => s.port === 'col:' + id);
      html += `<div class="card light colcard"><div class="thumb"><img src="${src(['', 'b_House1', 'b_House2', 'b_House3'][c.level])}" alt=""></div><div class="grow"><h3>${esc(is.name)}</h3>${this.colonyLine(id)}<p class="muted" style="font-size:12px">${route ? 'A trade boat serves this colony.' : 'No trade boat serves it yet. Send one from Trade.'}</p>${up}</div><button class="btn small" data-act="tosea:${id}">Find</button></div>`;
    }
    return html + `<p class="muted" style="text-align:center;font-size:13px">Kingdoms at war with you may raid colonies near their shores. A garrison, or peace, keeps the stores safe.</p>`;
  }
  stanceTag(is) {
    const s = this.R.kingdoms.stance(is), cls = { war: 'enemy', truce: 'neutral', peace: 'neutral', ally: 'ally', vassal: 'ally' }[s];
    return `<span class="rel ${cls}">${{ war: 'At war', truce: 'Truce', peace: 'At peace', ally: 'Ally', vassal: 'Vassal' }[s]}</span>`;
  }
  // a kingdom's court: who they are, how they see you, and what you can do about it
  panel_court() {
    const R = this.R, Kd = R.kingdoms, is0 = R.sea.ocean.islandById(this.panelArg);
    if (!is0 || !is0.kingdom) return '<p>That court is gone.</p>';
    const is = Kd.lord(is0), k = Kd.st(is), s = Kd.stance(is0), kg = is.kingdom, house = Kd.houseKey(is);
    const held = is !== is0 ? `<p class="note">${esc(is0.name)} is held by ${esc(kg.name)}. Their lords answer for it.</p>` : '';
    const reg = Math.max(-100, Math.min(100, Math.round(k.rel)));
    const truce = s === 'truce' && k.until ? `<p class="muted">The truce ends in ${time((k.until - Date.now()) / 1000)}.</p>` : '';
    const vassal = s === 'vassal' ? `<p class="muted">Loyalty: ${k.loyalty >= 40 ? 'steadfast' : k.loyalty >= 0 ? 'uneasy' : 'restless, near rebellion'}.</p>` : '';
    const gift = Kd.giftCost().gold;
    const B = (what, label, on, cls = '') => `<button class="btn ${cls}" data-act="dip:${what}:${is0.id}" ${on ? '' : 'disabled'}>${label}</button>`;
    let html = `<div class="court-head"><div class="sig" data-sigil="${esc(is.id)}"></div><div class="grow"><h3>${esc(kg.name)} ${this.stanceTag(is0)}</h3><p>${esc(kg.ruler || '')}${kg.motto ? ` - "${esc(kg.motto)}"` : ''}</p></div></div>${held}
      <div class="court-rows">
        <div><span>Temper</span><b>${temperWord(kg.temper)}</b></div>
        <div><span>Strength</span><b>${Kd.strengthWord(is)}</b></div>
        <div><span>Regard for you</span><b>${Kd.regardWord(is0)}</b></div>
        <div class="regard"><i style="left:${50 + reg / 2}%"></i></div>
      </div>${truce}${vassal}`;
    if (s === 'vassal') html += `<p style="text-align:center;font-size:13px">They pay you tribute every hour. Keep your army strong, or pay their lords when they grumble, and they stay loyal.</p>`;
    else {
      html += `<p class="section-title">Diplomacy</p><div class="court-acts">
        ${B('gift', `Send a gift (${gift} gold)`, R.state.res.gold >= gift)}
        ${B('truce', 'Offer a truce', s === 'war')}
        ${house ? '' : B('peace', 'Make peace', s === 'war' || s === 'truce')}
        ${house ? '' : B('alliance', 'Propose an alliance', s === 'peace')}
        ${B('demand', (k.demandAt || 0) > Date.now() ? `Tribute paid (${time((k.demandAt - Date.now()) / 1000)})` : 'Demand tribute', s !== 'ally' && !((k.demandAt || 0) > Date.now()) && k.power / Math.max(1, Kd.myPower()) <= 0.67)}
        ${B('war', s === 'truce' || s === 'ally' ? 'Break faith: declare war' : 'Declare war', s !== 'war', 'red')}
      </div><p class="muted" style="font-size:12px;text-align:center">${house ? 'A great house never makes a lasting peace. Truces buy time; only a siege ends the feud.' : 'Gifts raise their regard. Peace needs a friendly court, an alliance a warm one. Tribute is only paid to a realm half again their strength, once an hour.'}</p>`;
    }
    html += `<button class="btn wide" data-act="tosea:${is0.id}">Back to the sea</button>`;
    return html;
  }
  coursHtml() {
    const R = this.R, Kd = R.kingdoms, W = R.state.world, list = Kd.known();
    let html = `<p class="section-title">Courts of the sea</p>`;
    html += list.length ? list.map(is => `<button class="card light court-card" data-act="court:${is.id}"><div class="sig" data-sigil="${esc(Kd.lord(is).id)}"></div><div class="grow"><h3>${esc(is.kingdom.name)} ${this.stanceTag(is)}</h3><p>${esc(is.name)}. ${temperWord(Kd.lord(is).kingdom.temper)}, ${Kd.strengthWord(Kd.lord(is)).toLowerCase()}. Regard: ${Kd.regardWord(is).toLowerCase()}.</p></div></button>`).join('') : '<p style="text-align:center;font-size:13px">No court knows of you yet. Sail out and be seen.</p>';
    html += `<p class="section-title">News from across the sea</p>`;
    html += (W.news || []).length ? W.news.slice(0, 15).map(n => `<div class="card light"><div class="grow"><p>${esc(n.text)}</p><p class="muted">${ago(n.t)}</p></div></div>`).join('') : '<p style="text-align:center;font-size:13px">All is quiet on the sea.</p>';
    return html;
  }
  envoy(e) {
    const R = this.R, opts = [];
    const fin = msg => { this.toast(msg, 'gold'); R.kingdoms.news(msg); R.save(); };
    if (e.cost && !R.canAfford(e.cost)) opts.push({ label: `${e.yes} (you have ${Math.floor(R.state.res.gold)})`, cls: 'off', fn: () => { this.toast('Not enough gold. The envoy will wait for another day.', 'red'); } });
    else opts.push({ label: e.yes, fn: () => { if (e.cost && !R.pay(e.cost)) return; fin(e.onYes()); } });
    if (e.no) opts.push({ label: e.no, cls: e.onNo ? 'red' : '', fn: () => { if (e.onNo) fin(e.onNo()); } });
    this.choice(e.title, e.text, opts);
  }
  panel_crew() {
    const R = this.R, S = R.state, Z = R.sea, cap = TIERS[S.tier].squad;
    if (!Z.atHome()) {
      const crew = Z.crewRecs();
      return `<p class="section-title">The fleet is at sea</p><p style="text-align:center;font-size:13px">A crew can only be changed at home. Aboard now:</p>` + (crew.length ? crew.map(r => this.soldierCard(r)).join('') : '<p style="text-align:center">Nobody.</p>') + `<button class="btn wide" data-act="tosea">Back to the sea</button>` + this.shipHtml();
    }
    const home = S.soldiers.filter(s => s.status === 'home' || Z.W.crew.includes(s.id));
    if (!this.crewInit) { this.squadPick = new Set(Z.W.crew); this.crewInit = true; }
    for (const id of [...this.squadPick]) if (!home.some(s => s.id === id)) this.squadPick.delete(id);
    const SQ = R.squads.list.filter(q => q.members.length);
    let html = `<p style="text-align:center;font-size:13px">Choose who sails. Soldiers aboard leave the island's defence until the fleet comes home. Those who fall on an island are gone forever.</p>`;
    if (SQ.length) html += `<p class="section-title">Send a squad</p><div class="sqpicks">` + SQ.map(q => {
      const col = COLORS.find(c => c.key === q.color).hex, at = q.members.filter(id => home.some(h => h.id === id)).length;
      const on = q.members.some(id => this.squadPick.has(id)) && q.members.every(id => !home.some(h => h.id === id) || this.squadPick.has(id));
      return `<button class="sqpick ${on ? 'on' : ''}" data-act="sqpick:${q.id}" style="--c:${col}" ${at ? '' : 'disabled'}><b>${esc(q.name)}</b><span>${at} of ${q.members.length} at home</span></button>`;
    }).join('') + `</div>`;
    html += `<details class="pickone" ${!SQ.length || this.pickOpen ? 'open' : ''}><summary>${SQ.length ? 'Or pick soldiers one by one' : 'Pick your soldiers'} (${this.squadPick.size}/${cap})</summary>` + (home.length ? home.sort((a, b) => b.level - a.level).map(r => this.soldierCard(r, { pick: true })).join('') : '<p style="text-align:center">No soldiers at home.</p>') + '</details>';
    html += `<p class="section-title">Aboard: ${this.squadPick.size} of ${cap}</p><div class="sqfaces big">${[...this.squadPick].map(id => S.soldiers.find(s => s.id === id)).filter(Boolean).map(r => `<img src="${src(r.avatar)}" alt="" title="${esc(r.name)}">`).join('') || '<span class="muted">Nobody yet</span>'}</div>`;
    html += `<button class="btn wide" data-act="embark">${this.squadPick.size ? 'Embark and open the sea' : 'Sail with no crew'}</button>`;
    return html + this.shipHtml();
  }
  // ------------------------------------------------------------ panels
  togglePanel(name, arg) { if (this.panel === name && !arg) this.closePanel(); else this.openPanel(name, arg); }
  openPanel(name, arg) {
    clearTimeout(this.closeT); this.panelEl.classList.remove('closing');
    if (this.R.exp && !['settings', 'army', 'chronicle', 'hero', 'codex'].includes(name)) return;
    if (name === 'nightmarket' && !this.R.events.market) return this.toast('The Night Market only opens after dark.');
    if (this.panel !== name) audio.play('open');
    this.panel = name; this.panelArg = arg; this.tab = null;
    this.panelEl.classList.remove('hidden');
    this.stashBanner();
    document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
    this.renderPanel();
    this.body.scrollTop = 0;
  }
  closePanel() {
    if (this.panel) { audio.play('close'); const el = this.panelEl; el.classList.add('closing'); clearTimeout(this.closeT); this.closeT = setTimeout(() => el.classList.remove('closing'), 190); }
    this.panel = null; this.live = [];
    this.panelEl.classList.add('hidden');
    setTimeout(() => this.flushBanners(), 250);
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
    const titles = { crew: 'Crew', voyage: 'Trade', hero: 'Hero', nightmarket: 'Night Market', build: 'Build', workers: 'Workers', army: 'Army', chronicle: 'Chronicle', settings: 'Settings', merchant: 'Merchant', building: '', court: 'Court', throne: 'Throne room', codex: 'Codex' };
    $('#panelTitle').textContent = p === 'building' ? (this.panelArg.type === 'castle' && this.R.state.tier < 3 ? TIERS[this.R.state.tier].name + ' Hall' : this.panelArg.def.name) : p === 'hero' ? this.panelArg.name : titles[p];
    this.setTabs(null);
    const fn = this['panel_' + p];
    this.body.innerHTML = fn ? fixText(fn.call(this)) : '';
    for (const el of this.body.querySelectorAll('[data-sigil]')) { const is = this.R.sea.ocean.islandById(el.dataset.sigil); if (!is || !is.kingdom) continue; const sc = sigilCanvas(is.kingdom.sigil, 40), cv = document.createElement('canvas'); cv.width = sc.width; cv.height = sc.height; cv.getContext('2d').drawImage(sc, 0, 0); el.appendChild(cv); }
    if (this.afterRender) { this.afterRender(); this.afterRender = null; }
  }

  panel_build() {
    const R = this.R;
    let decoHead = false;
    return Object.entries(BUILDINGS).filter(([k]) => k !== 'castle').sort((a, b) => !!a[1].decor - !!b[1].decor).map(([k, d]) => {
      if (d.decor) {
        const head = decoHead ? '' : (decoHead = true, `<p class="section-title">Decorations</p><p style="text-align:center;font-size:13px">They never block anyone's path. Every two make your people a little happier. Tap one later to clear it.</p>`);
        const n = R.decorList().filter(o => o.type === k).length, lim = R.limitFor(k), ok = n < lim && R.canAfford(d.cost);
        return head + `<div class="card light"><div class="thumb dec"><img src="${spriteThumb(d.decor[0])}" alt=""></div><div class="grow"><h3>${d.name}</h3>${this.costHtml(d.cost)}<p class="muted">${n} / ${lim} placed</p></div>
          <button class="btn small" data-act="place:${k}" ${ok ? '' : 'disabled'}>Place</button></div>`;
      }
      const lim = R.limitFor(k), n = R.countOf(k);
      const locked = lim === 0;
      const full = n >= lim;
      const ok = !locked && !full && R.canAfford(d.cost);
      const need = locked ? `Needs a ${TIERS.findIndex((t, i) => t && t.limits[k] > 0) > 0 ? TIERS[TIERS.findIndex((t, i) => t && t.limits[k] > 0)].name : 'bigger realm'}` : `${n} / ${lim} built`;
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
    const H = R.needs.get();
    const mood = `<div class="card mood m-${H.mood.key}"><div class="grow"><h3>Happiness: ${H.mood.name} (${H.value})</h3><div class="hpbar happy"><i style="width:${H.value}%"></i></div><p>${H.mood.desc}</p>
      <details><summary>Why</summary>${H.parts.map(([l, v]) => `<p class="why"><span>${esc(l)}</span><b class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v}</b></p>`).join('')}</details></div></div>`;
    return mood + `<p class="section-title">${S.pawns} pawns - ${S.pawns - busy} idle</p>` +
      jobs.map(([k, n, ic, d]) => `<div class="job card light"><i class="ic ${ic}"></i><div class="name"><h3>${n}</h3><p>${d}</p></div>
        <button class="tiny-btn red" data-act="job:${k}:-1">-</button><span class="count">${J[k]}</span><button class="tiny-btn" data-act="job:${k}:1">+</button></div>`).join('') +
      `<div class="card"><div class="thumb"><img src="${src('av_h5')}" class="av" alt=""></div><div class="grow"><h3>Train a Pawn</h3><p>New hands for the realm. Trained at the ${R.seatName()}.${q ? ` ${q} in training.` : ''}</p>${this.costHtml(UNITS.pawn.cost)}</div>
        <button class="btn small" data-act="train:${castle.id}:pawn">Train</button></div>
       <p class="muted" style="text-align:center;font-size:13px">Room: ${R.popUsed()} of ${R.popCap()} people. Houses add room, and upgraded Houses add more.</p>
       <p class="muted" style="font-size:13px;text-align:center">While you are away, assigned pawns keep working at half pace until the stores are full.</p>`;
  }

  soldierCard(rec, opts = {}) {
    const U = UNITS[rec.type];
    const next = rec.level < levelCap(rec) ? XP_LEVELS[rec.level + 1] : null;
    const prev = XP_LEVELS[rec.level];
    const xpPct = next ? Math.min(100, (rec.xp - prev) / (next - prev) * 100) : 100;
    const u = this.R.home.units.find(x => x.rec === rec && x.alive && !x.dead) || (this.R.exp && this.R.exp.units.find(x => x.rec === rec && x.alive));
    const hpPct = u ? u.hp / u.maxHp * 100 : 100;
    const status = rec.status === 'away' ? (this.R.exp && this.R.exp.units.some(u => u.rec === rec) ? 'In battle' : 'Aboard the ship') : rec.status === 'garrison' ? `Guarding ${esc((this.R.sea.ocean.islandById(rec.colony) || { name: 'a colony' }).name)}` : rec.status === 'wounded' ? `Wounded, ${time((rec.woundedUntil - Date.now()) / 1000)}` : 'At home';
    return `<div class="card ${opts.pick ? 'light' : ''}" ${opts.pick ? `data-act="pick:${rec.id}"` : ''}>
      ${opts.pick ? `<button class="check ${this.squadPick.has(rec.id) ? 'on' : ''}"></button>` : ''}
      <div class="thumb"><img src="${src(rec.avatar)}" class="av" alt=""></div>
      <div class="grow"><h3>${rec.promoted || rec.founder || rec.hero ? `<span class="rank">${esc(rec.promoted || rec.hero ? (rec.title || 'Elite') : 'Founder')}</span> ` : ''}${rec.general ? `<span class="rank gen">${esc(DOCTRINES[rec.general].name)} ${esc(this.R.war.rankName(rec))}</span> ` : ''}${esc(rec.name)}</h3><p>Level ${rec.level} ${U.name} - ${rec.kills} kills - ${status}</p>
        <div>${rec.traits.map(t => `<span class="trait ${TRAITS[t].rare ? 'rare' : ''}" title="${TRAITS[t].desc}">${TRAITS[t].name}</span>`).join('')}</div>
        ${this.gearRow(rec)}
        <div class="hpbar"><i style="width:${hpPct}%"></i></div><div class="xpbar"><i style="width:${xpPct}%"></i></div></div>
      ${!opts.pick && !opts.noButtons ? `<div class="col-btns"><button class="btn small" data-act="hero:${rec.id}">Gear</button>${rec.status === 'home' && !this.R.exp ? `<button class="btn small" data-act="find:${rec.id}">Find</button>` : ''}</div>` : ''}</div>`;
  }
  gearRow(rec) {
    const S = this.R.state;
    return `<div class="gearrow">${Gear.SLOTS.map(([k, , ic]) => { const it = Gear.itemById(S, rec.gear && rec.gear[k]); return `<span class="gslot ${it ? 'r' + it.rarity : 'empty'}" title="${it ? esc(it.name) : 'Empty'}"><i class="ic ${ic}"></i></span>`; }).join('')}<span class="gscore">${Gear.heroScore(S, rec) ? 'Power ' + Gear.heroScore(S, rec) : ''}</span></div>`;
  }
  itemCard(it, btns) {
    const S = this.R.state, o = Gear.ownerOf(S, it.id), ic = Gear.SLOTS.find(s => s[0] === it.slot)[2];
    return `<div class="card light item r${it.rarity}"><span class="gslot big r${it.rarity}"><i class="ic ${ic}"></i></span>
      <div class="grow"><h3 style="color:${Gear.RARITY[it.rarity].color}">${esc(it.name)}</h3><p>${Gear.RARITY[it.rarity].name} ${it.slot === 'armor' ? 'armour' : it.slot}, level ${it.level}. ${Gear.describe(it)}.</p>
      ${o ? `<p class="muted">Worn by ${esc(o.name)}</p>` : it.found ? `<p class="muted">From ${esc(it.found)}</p>` : ''}</div>${btns}</div>`;
  }
  squadsHtml() {
    const R = this.R, S = R.state, Q = R.squads, L = Q.list;
    if (this.editSquad && !L.includes(this.editSquad)) this.editSquad = null;
    if (this.editSquad) { // choose members
      const q = this.editSquad, col = COLORS.find(c => c.key === q.color).hex;
      return `<p class="section-title"><span class="swatch" style="background:${col}"></span>${esc(q.name)}: tap soldiers to add or remove</p><button class="btn wide" data-act="sqdone">Done</button><p></p>` +
        [...S.soldiers].sort((a, b) => (q.members.includes(b.id) - q.members.includes(a.id)) || b.level - a.level).map(r => {
          const o = Q.of(r);
          return `<div class="card ${q.members.includes(r.id) ? '' : 'light'}" data-act="sqtog:${q.id}:${r.id}"><button class="check ${q.members.includes(r.id) ? 'on' : ''}"></button><div class="thumb"><img src="${src(r.avatar)}" class="av" alt=""></div>
          <div class="grow"><h3>${esc(r.name)}</h3><p>Level ${r.level} ${UNITS[r.type].name}${o && o !== q ? ` - in ${esc(o.name)}` : ''}</p></div></div>`; }).join('');
    }
    let html = `<p class="section-title">${L.length} of ${Q.max()} squads</p><p style="text-align:center;font-size:13px">Group soldiers into squads. Each squad guards the district around its banner, and can be sent on a voyage in one tap.</p>`;
    html += L.map(q => {
      const col = COLORS.find(c => c.key === q.color).hex, mem = q.members.map(id => S.soldiers.find(s => s.id === id)).filter(Boolean);
      const dist = q.banner ? DISTRICTS[districtAt(R, q.banner.cx, q.banner.cy)] : 'no banner';
      return `<div class="card squad" style="border-left: 6px solid ${col}"><div class="grow">
        <h3>${esc(q.name)} <button class="tiny-link" data-act="sqname:${q.id}">rename</button></h3>
        <p>${mem.length} soldier${mem.length === 1 ? '' : 's'}, guarding ${dist}.</p>
        <div class="sqfaces">${mem.slice(0, 10).map(r => `<img src="${src(r.avatar)}" alt="" title="${esc(r.name)}">`).join('') || '<span class="muted">Empty</span>'}</div>
        <div class="stances">${Object.entries(STANCES).map(([k, s]) => `<button class="btn small ${q.stance === k ? 'on' : ''}" data-act="sqst:${q.id}:${k}" title="${s.desc}">${s.name}</button>`).join('')}</div>
        <p class="muted" style="font-size:12px">${STANCES[q.stance].desc}</p>
        <div class="row-btns"><button class="btn small" data-act="sqedit:${q.id}">Members</button><button class="btn small" data-act="sqbanner:${q.id}">Move banner</button><button class="btn small" data-act="sqsel:${q.id}">Select</button><button class="btn small red" data-act="sqdel:${q.id}">Disband</button></div>
      </div></div>`;
    }).join('');
    html += `<button class="btn wide" data-act="sqnew" ${L.length >= Q.max() ? 'disabled' : ''}>Raise a new squad</button>`;
    if (L.length >= Q.max()) html += `<p class="muted" style="text-align:center;font-size:12px">A bigger realm can field more squads.</p>`;
    return html;
  }
  renderSquadBtns() { // quick-select buttons down the right edge
    const R = this.R, el = $('#squadBtns'); if (!el) return;
    const L = R.squads.list.filter(q => q.members.length), sc = R.scene;
    const key = L.map(q => q.id + q.color + q.members.length).join(',') + (R.exp ? 'x' : 'h') + (this.place ? 'p' : '');
    if (key === this.sqBtnKey) return; this.sqBtnKey = key;
    el.classList.toggle('hidden', !L.length || !!this.place);
    el.innerHTML = L.map(q => `<button class="sqbtn" data-sq="${q.id}" style="--c:${COLORS.find(c => c.key === q.color).hex}" title="${esc(q.name)}"><span>${q.members.length}</span></button>`).join('');
  }
  selectSquad(id, center) {
    const R = this.R, q = R.squads.byId(id); if (!q) return;
    const sc = R.scene, us = sc.units.filter(u => u.rec && u.alive && !u.hidden && q.members.includes(u.rec.id));
    if (!us.length) return this.toast(`${q.name} has no one here.`);
    const same = us.every(u => sc.selected.has(u)) && sc.selected.size === us.length;
    sc.selected.clear(); for (const u of us) sc.selected.add(u); this.refreshSel();
    if (same || center) { const x = us.reduce((a, u) => a + u.x, 0) / us.length, y = us.reduce((a, u) => a + u.y, 0) / us.length; this.view.centerOn(x, y); }
    this.toast(`${q.name} selected.`);
  }
  panel_hero() {
    const R = this.R, S = R.state, rec = this.panelArg;
    if (!S.soldiers.includes(rec)) { setTimeout(() => this.closePanel()); return ''; }
    if (!Gear.SLOTS.some(s => s[0] === this.tab)) this.tab = 'weapon';
    const slot = this.tab;
    this.setTabs(Gear.SLOTS.map(([k, n]) => [k, n]));
    const cur = Gear.itemById(S, rec.gear && rec.gear[slot]);
    let html = this.soldierCard(rec, { noButtons: true });
    html += `<div class="row-btns"><button class="btn small" data-act="autoeq:${rec.id}">Equip best</button></div>`;
    html += this.generalHtml(rec);
    if (!rec.promoted && rec.type !== 'king') {
      const paths = PROMOTIONS[rec.type] || [{ to: '', title: 'Elite', desc: `Becomes an Elite ${UNITS[rec.type].name}, keeping their look and ability.` }];
      html += `<p class="section-title">Promotion</p>`;
      if (rec.level < 10) html += `<p style="text-align:center;font-size:13px">At level 10 this soldier can be promoted: +20% health and damage, and room to grow to level 15. Level ${rec.level} now.</p>`;
      else html += paths.map(p => { const blk = R.promoteBlock(rec, p.to); return `<div class="card light"><div class="thumb"><img src="${src(p.to ? 'av_' + (/^h\d+$/.test(UNITS[p.to].avatar) ? UNITS[p.to].avatar : UNITS[p.to].avatar + '1') : rec.avatar)}" class="av" alt=""></div>
        <div class="grow"><h3>${p.title}</h3><p>${p.desc} Also +20% health and damage, a rare trait, and levels up to 15.</p>${this.costHtml(PROMO_COST)}${blk && blk !== 'Not enough to pay.' ? `<p class="muted">${esc(blk)}</p>` : ''}</div>
        <button class="btn small" data-act="promote:${rec.id}:${p.to}" ${blk ? 'disabled' : ''}>Promote</button></div>`; }).join('');
    }
    html += `<p class="section-title">Wearing</p>` + (cur ? this.itemCard(cur, `<button class="btn small red" data-act="uneq:${rec.id}:${slot}">Remove</button>`) : '<p style="text-align:center;font-size:13px">Nothing in this slot.</p>');
    const free = (S.gear || []).filter(g => g.slot === slot && g !== cur).sort((a, b) => Gear.score(b) - Gear.score(a));
    html += `<p class="section-title">In the armoury (${free.length})</p>`;
    html += free.length ? free.map(it => this.itemCard(it, `<button class="btn small" data-act="eq:${rec.id}:${it.id}">Equip</button>`)).join('') : '<p style="text-align:center;font-size:13px">Win voyages, survive great events and beat raids to find gear.</p>';
    return html;
  }
  panel_army() {
    const R = this.R, S = R.state;
    this.setTabs([['roster', 'Roster'], ['squads', 'Squads'], ['armory', 'Armoury'], ['fallen', 'Fallen'], ['relics', 'Relics']]);
    if (this.tab === 'squads') return this.squadsHtml();
    if (this.tab === 'armory') {
      const G = [...(S.gear || [])].sort((a, b) => b.rarity - a.rarity || Gear.score(b) - Gear.score(a));
      if (!G.length) return '<p class="section-title">The armoury is empty.</p><p style="text-align:center;font-size:13px">Every voyage won brings back a piece of gear. Bosses, rival capitals, great events and the Moonlit Hunt bring better pieces. Raiders sometimes drop something too.</p>';
      const spare = G.filter(g => !Gear.ownerOf(S, g.id) && g.rarity === 0).length;
      return `<p class="section-title">${G.length} pieces of gear</p>${spare ? `<button class="btn wide" data-act="salvall">Sell ${spare} spare common pieces</button><p></p>` : ''}` +
        G.map(it => this.itemCard(it, `<button class="btn small red" data-act="salv:${it.id}">Sell ${Gear.salvageValue(it)}</button>`)).join('');
    }
    if (this.tab === 'fallen') {
      if (!S.fallen.length) return '<p class="section-title">No one has fallen yet. Keep it that way.</p>';
      return '<p class="section-title">The Hall of the Fallen</p>' + S.fallen.map(f => `<div class="card"><div class="thumb"><img src="${src(f.avatar)}" class="av" alt="" style="filter:grayscale(1)"></div>
        <div class="grow"><h3>${esc(f.name)}</h3><p>Level ${f.level} ${UNITS[f.type].name}, ${f.kills} kills. Fell ${esc(f.where)}, slain by ${esc(f.killer)}. ${ago(f.date)}.</p></div></div>`).join('');
    }
    if (this.tab === 'relics') {
      const owned = Object.keys(RELICS).filter(k => S.relics[k]);
      const unknown = Object.keys(RELICS).length - owned.length;
      return `<p class="section-title">${owned.length} of ${Object.keys(RELICS).length} relics</p>` + owned.map(k => `<div class="card"><i class="ic ic-shield"></i>
        <div class="grow"><h3>${RELICS[k].name}</h3><p>${RELICS[k].desc}</p></div></div>`).join('') +
        (unknown ? `<div class="card light"><i class="ic ic-shield" style="filter:grayscale(1);opacity:.5"></i><div class="grow"><h3>${unknown} still unknown</h3><p>Won from bosses, great events and stranger places.</p></div></div>` : '');
    }
    const list = [...S.soldiers].sort((a, b) => b.level - a.level || b.kills - a.kills);
    const pop = `<p class="section-title">${S.soldiers.length} soldier${S.soldiers.length === 1 ? '' : 's'} - room ${R.popUsed()}/${R.popCap()}</p>`;
    if (!list.length) return pop + '<p style="text-align:center">Build a Barracks or Archery Range to train soldiers.</p>';
    return pop + (R.exp ? '' : `<button class="btn wide" data-act="selall">Select everyone at home</button><p></p>`) + list.map(r => this.soldierCard(r)).join('');
  }

  panel_voyage() {
    const R = this.R, S = R.state;
    if (this.tab !== 'colonies') this.tab = 'trade';
    this.setTabs([['trade', 'Trade'], ['colonies', 'Colonies']]);
    return (this.tab === 'colonies' ? this.coloniesHtml() : this.tradeHtml()) + `<button class="btn wide" data-act="tosea">Back to the sea</button>`;
    if (R.raid && R.raid.active) return '<p class="section-title">You cannot sail while the realm is under attack.</p>';
    if (R.events.pending) return '<p class="section-title">A great threat approaches. Stay and defend.</p>';
    const home = S.soldiers.filter(s => s.status === 'home');
    const cap = TIERS[S.tier].squad;
    for (const id of [...this.squadPick]) if (!home.some(s => s.id === id)) this.squadPick.delete(id);
    const info = islandInfo(S.frontier);
    const bountyDone = S.daily.bounty === S.daily.last;
    let target = this.voyageTarget || 'frontier';
    if (target.startsWith('rival:')) { const rv = rivalDef(target.slice(6)); if (!R.rivalUnlocked(rv) || S.rivals[rv.key].subjugated) target = this.voyageTarget = 'frontier'; }
    let html = `<canvas id="chart" class="chart"></canvas><p class="muted" style="text-align:center;font-size:12px;margin:2px 0 6px">Tap an island on the chart to choose your destination.</p>`;
    // destination card
    let title, sub, desc, av, blocked = false;
    if (target.startsWith('story:')) {
      const i = +target.slice(6), ch = CHAPTERS[i];
      if (i !== nextChapter(S)) target = this.voyageTarget = 'frontier';
    }
    if (target === 'abyss' && S.tier < 3) target = this.voyageTarget = 'frontier';
    if (target === 'abyss') {
      const A = S.abyss || { depth: 1, best: 0 };
      title = `The Abyss, floor ${A.depth || 1}`; sub = `Deepest floor reached: ${A.best || 0}`; av = 'av_skull';
      desc = 'Monsters from every shore, a boss every fifth floor. After each floor, press on with your survivors or come home. Each floor deeper pays more; going home ends the run.';
    } else if (target.startsWith('story:')) {
      const i = +target.slice(6), ch = CHAPTERS[i], open = chapterOpen(S, i);
      title = `Chapter ${i + 1}: ${ch.name}`; sub = `The Drowned Crown - Level ${ch.level}${ch.boss ? ' - Boss: ' + ENEMIES[ch.boss].name : ''}`;
      desc = open ? ch.intro : `Clear ${ch.need} frontier islands to reach it. You have cleared ${S.cleared}.`;
      av = ch.final ? 'av_troll' : 'av_h' + (5 + i); blocked = !open;
    } else if (target === 'bounty') { title = 'Bounty Isle'; sub = bountyDone ? 'Plundered today. A new one appears tomorrow.' : 'Double loot and a chance at a relic. Once per day.'; desc = 'A different island every day.'; av = 'av_thief'; blocked = bountyDone; }
    else if (target.startsWith('rival:')) {
      const rv = rivalDef(target.slice(6)), lv = R.rivalLevel(rv.key), tr = R.tributeRate(rv.key);
      title = `${rv.name} Capital`; sub = `Ruled by ${rv.ruler} - Level ${lv}`; av = `av_h${rv.avatarRow}`;
      desc = `"${rv.motto}" Storm four strongholds and defeat their King. Conquered houses stop raiding and pay ${tr.gold} gold and ${tr.wood} wood every hour.`;
    } else {
      title = `Island ${info.n}: ${info.name}`; sub = `${info.region.name} - Level ${info.level}${info.boss ? ' - Boss: ' + ENEMIES[info.region.boss].name : ''}`;
      desc = info.boss ? `The boss guards a relic: ${RELICS[info.region.bossRelic].name}.` : 'Clear every camp to push the frontier onward.'; av = 'av_' + info.region.boss;
    }
    html += `<div class="card"><div class="thumb"><img src="${src(av)}" class="av" alt=""></div><div class="grow"><h3>${esc(title)}</h3><p>${esc(sub)}</p><p class="muted">${esc(desc)}</p></div></div>`;
    const SQ = R.squads.list.filter(q => q.members.length);
    if (SQ.length) {
      html += `<p class="section-title">Send a squad</p><div class="sqpicks">` + SQ.map(q => {
        const col = COLORS.find(c => c.key === q.color).hex, at = q.members.filter(id => home.some(h => h.id === id)).length;
        const on = q.members.length && q.members.every(id => !home.some(h => h.id === id) || this.squadPick.has(id)) && q.members.some(id => this.squadPick.has(id));
        return `<button class="sqpick ${on ? 'on' : ''}" data-act="sqpick:${q.id}" style="--c:${col}" ${at ? '' : 'disabled'}><b>${esc(q.name)}</b><span>${at} of ${q.members.length} at home</span></button>`;
      }).join('') + `</div>`;
    }
    html += `<details class="pickone" ${!SQ.length || this.pickOpen ? 'open' : ''}><summary>${SQ.length ? 'Or pick soldiers one by one' : 'Pick your soldiers'} (${this.squadPick.size}/${cap})</summary>`;
    if (!home.length) html += '<p style="text-align:center">No soldiers at home.</p>';
    html += home.sort((a, b) => b.level - a.level).map(r => this.soldierCard(r, { pick: true })).join('') + '</details>';
    html += `<p class="section-title">Sailing: ${this.squadPick.size} of ${cap}</p><div class="sqfaces big">${[...this.squadPick].map(id => S.soldiers.find(s => s.id === id)).filter(Boolean).map(r => `<img src="${src(r.avatar)}" alt="" title="${esc(r.name)}">`).join('') || '<span class="muted">Nobody yet</span>'}</div>`;
    html += `<p class="muted" style="text-align:center;font-size:13px">Soldiers who fall on an island are gone forever. Survivors return with experience and loot.</p>`;
    html += `<button class="btn wide" data-act="launch" ${this.squadPick.size && !blocked ? '' : 'disabled'}>Set sail</button>`;
    this.afterRender = () => this.drawChart(target);
    this.live.push(() => this.drawChart(target));
    return html;
  }
  tradeHtml() {
    const R = this.R, S = R.state, n = R.trade.boats(), C = R.trade.st, now = Date.now();
    if (!n) return `<p class="section-title">No trade boats</p><div class="card light"><div class="thumb"><img src="${src('b_Market')}" alt=""></div><div class="grow"><p>Build a Market to launch a trade boat. Each Market level adds another boat.</p></div></div>`;
    let html = `<p class="section-title">Your boats (${n})</p>`;
    C.slots.slice(0, n).forEach((s, i) => {
      const p = s.port && R.trade.port(s.port);
      const line = !p ? 'Idle in the harbour.' : s.waiting ? 'Fighting off pirates at the dock.' : now >= s.back ? 'Waiting offshore for the fighting to end.' : `Sailing to ${p.name}. Back in ${time((s.back - now) / 1000)}.`;
      html += `<div class="card ${p ? '' : 'light'}"><i class="ic ic-boat" style="width:44px;height:44px"></i><div class="grow"><h3>Boat ${i + 1}</h3><p class="tline" data-slot="${i}">${line}${s.stopAfter ? ' Docking after this trip.' : ''}</p></div>
        ${p && !s.stopAfter ? `<button class="btn small red" data-act="tstop:${i}">Stop</button>` : ''}</div>`;
    });
    const idle = C.slots.slice(0, n).some(s => !s.port);
    html += `<p class="section-title">Ports</p>` + ports(R).map(p => `<div class="card light"><div class="grow"><h3>${esc(p.name)}</h3><p>${esc(p.sub)}. ${p.mins} minute round trip, ${Math.round(p.risk * 100)}% chance of pirates on the way home.</p>
      <div class="cost"><span class="muted" style="font-size:12px">Brings back</span>${Object.entries(p.cargo).map(([k, v]) => `<span><i class="ic ic-${k}"></i>${v}</span>`).join('')}</div></div>
      <button class="btn small" data-act="tsend:${p.key}" ${idle ? '' : 'disabled'}>Send</button></div>`).join('');
    html += `<p class="muted" style="text-align:center;font-size:13px">Boats keep sailing their route until stopped, even while you are away. Conquer provinces and rival capitals to open more ports.</p>`;
    this.live.push(() => document.querySelectorAll('.tline').forEach(el => { const s = C.slots[+el.dataset.slot]; if (s && s.port && s.back && !s.waiting && now < s.back) { const p = R.trade.port(s.port); el.textContent = `Sailing to ${p ? p.name : 'sea'}. Back in ${time((s.back - Date.now()) / 1000)}.${s.stopAfter ? ' Docking after this trip.' : ''}`; } }));
    return html;
  }
  drawChart(target) {
    const cv = $('#chart'); if (!cv) return;
    const R = this.R, S = R.state, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 340, H = 272;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = false;
    c.fillStyle = '#47aba9'; c.fillRect(0, 0, W, H);
    const t = performance.now() / 1000;
    // gentle waves
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 26; i++) { const x = (i * 97 + t * 6) % W, y = (i * 53) % H; c.fillRect(x, y, 6, 2); }
    const tiles = SHEETS.tiles1.img, sx = W / 340;
    const isle = (x, y, size, sheet = tiles, alpha = 1) => { c.globalAlpha = alpha; c.drawImage(sheet, 3 * 64, 3 * 64, 64, 64, x - size / 2, y - size / 2, size, size); c.globalAlpha = 1; };
    const img = (k, x, y, w) => { const s = SHEETS[k]; if (!s || !s.img) return; const h = w * s.fh / s.fw; c.drawImage(s.img, 0, 0, s.fw, s.fh, x - w / 2, y - h / 2, w, h); };
    const nodes = [];
    // home
    const hx = 46 * sx, hy = 120;
    isle(hx, hy, 70); img('b_Castle', hx, hy - 6, 50);
    // frontier chain
    const F = S.frontier, first = Math.max(1, F - 3), pts = [];
    for (let j = 0; j < 8; j++) { const n = first + j; pts.push({ n, x: (102 + j * 25) * sx, y: 120 + Math.sin(n * 1.3) * 52 }); }
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.setLineDash([4, 4]); c.lineWidth = 2;
    c.beginPath(); c.moveTo(hx + 26, hy); for (const p of pts) c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
    for (const p of pts) {
      const inf = islandInfo(p.n), done = p.n < F, cur = p.n === F;
      isle(p.x, p.y, cur ? 34 : 26, SHEETS['tiles' + inf.region.colors[0]].img, done ? 0.55 : 1);
      if (done) img('icon_shield', p.x, p.y, 16);
      else if (cur || inf.boss) img('av_' + (inf.boss ? inf.region.boss : inf.region.enemies[0]), p.x, p.y - 4, cur ? 40 : 30);
      if (p.n > F + 1) img('cloud' + (1 + p.n % 8), p.x, p.y, 54);
      if (cur) nodes.push({ k: 'frontier', x: p.x, y: p.y, r: 26 });
    }
    // bounty
    const bx = 150 * sx, by = 24, bountyDone = S.daily.bounty === S.daily.last;
    isle(bx, by, 30, SHEETS.tiles4.img, bountyDone ? 0.5 : 1); img('av_thief', bx, by - 4, 34);
    nodes.push({ k: 'bounty', x: bx, y: by, r: 22 });
    // rival capitals down the right edge
    RIVALS.forEach((rv, i) => {
      const x = (W - 34), y = 26 + i * 58, st = S.rivals[rv.key], open = R.rivalUnlocked(rv);
      isle(x, y + 6, 46, SHEETS['tiles' + rv.colors[0]].img, open ? 1 : 0.6);
      img(`b${rv.key}_Castle`, x, y, 46);
      if (!open) img('cloud' + (3 + i), x, y + 4, 70);
      if (st.subjugated) { c.fillStyle = '#4a90c0'; c.fillRect(x - 22, y + 20, 44, 10); c.fillStyle = '#fff'; c.font = '9px BoldPixels, monospace'; c.textAlign = 'center'; c.fillText('VASSAL', x, y + 28); }
      if (open && !st.subjugated) nodes.push({ k: 'rival:' + rv.key, x, y, r: 26 });
    });
    // the Abyss: a dark isle in the top-left corner (Castle and up)
    {
      const ax = 28, ay = 28, open = S.tier >= 3;
      isle(ax, ay, 34, SHEETS.tiles2.img, open ? 1 : 0.5);
      img('av_skull', ax, ay - 4, 34);
      if (!open) img('cloud6', ax, ay, 56);
      else nodes.push({ k: 'abyss', x: ax, y: ay, r: 22 });
      if (open && S.abyss && S.abyss.best) { c.fillStyle = '#ffe9a8'; c.font = '9px BoldPixels, monospace'; c.textAlign = 'center'; c.fillText('BEST ' + S.abyss.best, ax, ay + 26); c.textAlign = 'left'; }
    }
    // The Drowned Crown: a row of story islands along the bottom
    {
      const nx = nextChapter(S), y0 = H - 30, x0 = 26, step = (W - 104) / (CHAPTERS.length - 1);
      c.strokeStyle = 'rgba(255,230,160,0.6)'; c.setLineDash([3, 4]); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + step * (CHAPTERS.length - 1), y0); c.stroke(); c.setLineDash([]);
      CHAPTERS.forEach((ch, i) => {
        const x = x0 + i * step, y = y0 + (i % 2 ? -6 : 6), done = i < chapterState(S).done, cur = i === nx, open = cur && chapterOpen(S, i);
        isle(x, y, cur ? 30 : 22, SHEETS['tiles' + (ch.final ? 2 : 3)].img, done ? 0.55 : 1);
        if (done) img('icon_shield', x, y, 14);
        else if (cur) img(ch.final ? 'av_troll' : ch.boss ? 'av_' + (ch.boss === 'moonbear' ? 'bear' : ch.boss) : 'av_h' + (5 + i), x, y - 4, 32);
        else img('cloud' + (1 + i % 8), x, y, 40);
        if (cur) nodes.push({ k: 'story:' + i, x, y, r: 22 });
      });
      c.fillStyle = '#ffe9a8'; c.font = '10px BoldPixels, monospace'; c.textAlign = 'right'; c.fillText('THE DROWNED CROWN', W - 8, H - 8); c.textAlign = 'left';
    }
    // selection ring
    const sel = nodes.find(n => n.k === target);
    if (sel) { const s = 0.5 + Math.sin(t * 5) * 0.05; img('cursorRing', sel.x, sel.y, 128 * s); }
    cv.onclick = e => {
      const rc = cv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
      let best = null, bd = 30;
      for (const n of nodes) { const d = Math.hypot(n.x - mx, n.y - my); if (d < bd) { bd = d; best = n; } }
      if (best) { this.voyageTarget = best.k; audio.play('click'); this.refresh(); }
    };
  }

  panel_chronicle() {
    const R = this.R, S = R.state;
    this.setTabs([['quest', 'Goals'], ['season', 'Season'], ['realm', 'Realm'], ['courts', 'Courts'], ['feats', 'Feats'], ['log', 'Saga']]);
    if (this.tab === 'season') return this.seasonHtml();
    if (this.tab === 'courts') return this.coursHtml();
    if (this.tab === 'feats') {
      const F = S.feats || {}, n = FEATS.filter(f => F[f.id]).length;
      return `<p class="section-title">${n} of ${FEATS.length} feats</p>` + FEATS.map(f => `<div class="card ${F[f.id] ? '' : 'light'}"><i class="ic ic-shield" style="${F[f.id] ? '' : 'filter:grayscale(1);opacity:.45'}"></i><div class="grow"><h3>${f.name}</h3><p>${f.desc}${F[f.id] ? ' Earned ' + ago(F[f.id]) + '.' : ''}</p></div></div>`).join('');
    }
    if (this.tab === 'realm') {
      const days = Math.floor((Date.now() - S.created) / 86400000) + 1;
      const rows = [['Realm day', days], ['Realm', TIERS[S.tier].name], ['Renown', S.renown], ['Daily streak', S.daily.streak], ['Islands cleared', S.cleared], ['Raids repelled', S.stats.raidsSurvived], ['Raids lost', S.stats.raidsLost], ['Great events survived', S.stats.eventsSurvived], ['Monsters slain', S.stats.kills], ['Trolls slain', S.stats.trollsSlain], ['Soldiers fallen', S.fallen.length], ['Gold gathered', fmt(S.stats.gold || 0)], ['Wood gathered', fmt(S.stats.wood || 0)], ['Meat gathered', fmt(S.stats.meat || 0)], ['Storage cap', fmt(R.storage())]];
      const rv = RIVALS.map(r => { const st = S.rivals[r.key], open = R.rivalUnlocked(r);
        return `<div class="card light"><div class="thumb"><img src="${src('b' + r.key + '_Castle')}" alt=""></div><div class="grow"><h3>${r.name}</h3><p>${!open ? 'Unknown waters. Grow your realm to meet them.' : st.subjugated ? `Your vassal. Pays ${R.tributeRate(r.key).gold} gold and ${R.tributeRate(r.key).wood} wood per hour.` : `At war. Level ${R.rivalLevel(r.key)}, ${st.raids} raids so far. Lay siege to their capital from the sea.`}</p></div></div>`; }).join('');
      const prov = (S.annexed || []).map(a => provinceOf(a.region));
      const provHtml = prov.length ? prov.map(p => `<div class="card light"><div class="grow"><h3>${p.name}</h3><p>${p.desc}</p></div></div>`).join('') : '<p style="text-align:center;font-size:13px">Conquer boss islands and rival capitals to annex their land. Each province adds a lasting bonus.</p>';
      const moon = R.moon();
      const hols = upcomingHolidays(5).map(h => `<div class="card light"><div class="grow"><h3>${h.name}</h3><p>${h.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}. ${esc(h.desc)}</p></div></div>`).join('');
      const moonHtml = `<div class="card"><div class="grow"><h3>${moon.name}</h3><p>${moon.full ? 'Full moon tonight: the Moonlit Hunt stirs.' : moon.dark ? "A thieves' moon: dark nights bring extra thieves." : `Full moon in about ${Math.round(((29.53 / 2) - moon.age + 29.53) % 29.53)} days.`}</p></div></div>`;
      const seedCard = `<p class="section-title">This world</p><div class="card light"><div class="grow"><h3 class="seedw">${esc(R.sea.words())}</h3><p class="muted">Your world's seed. Paste it when you start a new realm to sail these same seas again.</p></div><button class="btn small" data-act="copyseed:${esc(R.sea.words())}">Copy</button></div>`;
      return seedCard + `<button class="btn wide" data-act="throne">The throne room: dynasty, council and nemesis</button><div class="stat-grid">${rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div><p class="section-title">The moon</p>${moonHtml}<p class="section-title">Holy days and festivals</p>${hols}<p class="section-title">Provinces</p>${provHtml}<p class="section-title">Rival houses</p>${rv}${this.legacyHtml(true)}`;
    }
    if (this.tab === 'log') return this.sagaHtml();
    const q = R.currentQuest();
    const v = R.questValue(q.type);
    const pct = Math.min(100, v / q.n * 100);
    const relicsOwned = Object.values(S.relics).filter(Boolean).length;
    const O = S.orders;
    const orders = O ? `<p class="section-title">${O.kind === 'night' ? 'Night orders' : 'Day orders'} <span class="muted">(new ones at ${O.kind === 'night' ? 'dawn' : 'dusk'})</span></p>` + O.list.map(o => `<div class="card ${o.done ? '' : 'light'}"><i class="ic ${o.done ? 'ic-shield' : 'ic-sword'}"></i><div class="grow"><h3>${esc(o.text)}</h3><p>${o.done ? 'Done.' : `${Math.floor(o.have || 0)} / ${o.n}`}</p>${o.done ? '' : `<div class="xpbar"><i style="width:${Math.min(100, (o.have || 0) / o.n * 100)}%"></i></div>`}${this.costHtml(o.reward).replace(/lack/g, '')}</div></div>`).join('') : '';
    return this.decreeHtml() + this.chalHtml() + orders + `<p class="section-title">Chronicle</p><div class="card"><i class="ic ic-info" style="width:40px;height:40px"></i><div class="grow"><h3>${esc(q.text)}</h3><p>${Math.min(v, q.n)} / ${q.n}</p><div class="xpbar"><i style="width:${pct}%"></i></div>
      <p style="margin-top:4px">Reward</p>${this.costHtml(q.reward).replace(/lack/g, '')}</div></div>
      ${(() => { const nx = nextChapter(S); if (nx < 0) return '<p class="section-title">The Drowned Crown</p><div class="card"><div class="grow"><p>Complete. The crown of the Sea Kings is yours.</p></div></div>'; const ch = CHAPTERS[nx];
        return `<p class="section-title">The Drowned Crown</p><div class="card light"><div class="grow"><h3>Chapter ${nx + 1}: ${esc(ch.name)}</h3><p>${chapterOpen(S, nx) ? `Ready. In Voyage, sail to the isle flying a gold banner marked ${nx + 1}.` : `Clear ${ch.need} islands at sea to reach it (${S.cleared} so far).`}</p><div class="xpbar"><i style="width:${nx / CHAPTERS.length * 100}%"></i></div></div></div>`; })()}
      <p class="section-title">Goals that never end</p>
      <div class="card light"><div class="grow"><p>Explore the sea: ${S.cleared} islands cleared so far. Lairs with a boss guard a relic.</p></div></div>
      <div class="card light"><div class="grow"><p>Grow the realm: ${S.tier < 5 ? 'next is a ' + TIERS[S.tier + 1].name + '.' : 'the Kingdom is crowned. Raise your Renown without limit.'}</p></div></div>
      <div class="card light"><div class="grow"><p>Relics found: ${relicsOwned} of ${Object.keys(RELICS).length}. Great events like the Troll Breakout hold the rarest.</p></div></div>`;
  }

  seasonHtml() {
    const R = this.R, S = R.state, Z = R.seasonal, ev = Z.ev, st = Z.st;
    const days = Math.max(1, Math.ceil(Z.endsIn() / 86400000));
    let html = `<div class="card season"><div class="grow"><h3>${ev.name}</h3><p>${esc(ev.blurb)}</p><p class="muted">${R.env.season.name} event, ${days} day${days === 1 ? '' : 's'} left. Tokens: <b>${st.tokens}</b></p></div></div>`;
    html += `<p class="section-title">Weekly boss</p><div class="card light"><div class="grow"><h3>${ev.boss.title}</h3><p>${esc(ev.boss.text)} Beat it for 5 tokens and epic gear.</p>${Z.bossReady() ? (S.tier < 2 ? '<p class="muted">Grow into a Village to face it.</p>' : '') : '<p class="muted">Beaten or fled this week. It returns on Monday.</p>'}</div>
      ${Z.bossReady() ? `<button class="btn small red" data-act="sboss" ${Z.summonBlock() ? 'disabled' : ''}>Summon</button>` : ''}</div>`;
    html += `<p class="section-title">Season tasks (4 tokens each)</p>` + st.tasks.map((t, i) => `<div class="card ${t.done ? '' : 'light'}"><i class="ic ${t.done ? 'ic-shield' : 'ic-sword'}"></i><div class="grow"><h3>${esc(ev.tasks[i].text(t.n))}</h3><p>${t.done ? 'Done.' : `${Math.floor(t.have || 0)} / ${t.n}`}</p>${t.done ? '' : `<div class="xpbar"><i style="width:${Math.min(100, (t.have || 0) / t.n * 100)}%"></i></div>`}</div></div>`).join('');
    const rel = RELICS[ev.relic];
    const item = (id, title, desc, extra = '') => { const cost = Z.price(id), dis = st.tokens < cost || extra; return `<div class="card light"><div class="grow"><h3>${title}</h3><p>${desc}</p>${extra ? `<p class="muted">${extra}</p>` : ''}</div><button class="btn small" data-act="sbuy:${id}" ${dis ? 'disabled' : ''}>${cost} tokens</button></div>`; };
    html += `<p class="section-title">Season shop</p>` +
      item('relic', rel.name, `A relic found only in ${ev.name}: ${rel.desc}.`, S.relics[ev.relic] ? 'Already yours.' : '') +
      item('legend', 'Seasonal legendary', 'A legendary piece forged for the season.', st.bought.legend ? 'One per season.' : '') +
      item('chest', 'Epic war chest', 'A piece of epic gear or better.') +
      item('bundle', 'Fair goods', `${200 + S.tier * 120} each of gold, wood and meat.`);
    return html + '<p class="muted" style="text-align:center;font-size:12px">Tokens and tasks reset when the season changes. Spend them before it ends.</p>';
  }
  // before a new realm begins: a random world, or a seed you liked
  askSeed(done) {
    const div = document.createElement('div');
    div.innerHTML = `<p>Every realm sails its own world. Leave this empty for a new one, or paste a seed (from Chronicle, Realm, or the Hall of Realms) to sail a world you enjoyed.</p><input id="seedIn" class="seed-in" placeholder="e.g. SALT-RAVEN-4821" autocomplete="off" autocapitalize="characters" spellcheck="false"><p class="muted" id="seedNote" style="font-size:12px;min-height:16px"></p>`;
    this.choice('Choose a world', div, [
      { label: 'Begin', fn: () => { const v = (document.getElementById('seedIn') || {}).value || ''; done(v.trim() ? normalizeSeedWords(v) : null); } },
      { label: 'Cancel', cls: 'red' },
    ]);
    setTimeout(() => { const i = document.getElementById('seedIn'), n = document.getElementById('seedNote'); if (!i) return; i.oninput = () => { const v = i.value.trim(); n.textContent = !v ? '' : parseSeedWords(v) != null ? `A known world: ${normalizeSeedWords(v)}` : 'Not a seed from the Hall, but it will still make a world of its own.'; }; }, 50);
  }
  legacyHtml(full) {
    const R = this.R, L = Legacy.loadLegacy(), rank = Legacy.rankOf(L.points), sc = Legacy.realmScore(R), b = Legacy.rankBonus(rank);
    const next = rank < 20 ? (rank + 1) * 100 : null;
    let html = `<div class="card light"><div class="grow"><h3>Legacy rank ${rank}</h3><p>${L.points} points${next ? `, ${next - L.points} to rank ${rank + 1}` : ', the highest rank'}.${rank ? ` Each new realm: +${Math.round(b.gather * 100)}% gathering, health and damage, +${Math.round(b.xp * 100)}% experience, ${b.start} of each resource${b.pawns ? `, ${b.pawns} extra pawns` : ''}.` : ''}</p>
      ${next ? `<div class="xpbar"><i style="width:${(L.points % 100)}%"></i></div>` : ''}<p class="muted">This realm is worth ${sc.total} points: ${sc.parts.map(p => `${p[0].toLowerCase()} ${p[1]}`).join(', ') || 'nothing yet'}.</p></div></div>`;
    html += Legacy.canFound(R) ? `<button class="btn wide" data-act="found">Found a new realm</button><p class="muted" style="text-align:center;font-size:12px">Bank this realm's points, choose a hero to sail with you, and begin again on a new island.</p>`
      : `<p style="text-align:center;font-size:13px">Raise the Castle to found a new realm and bank your Legacy.</p>`;
    // (this world's seed card is shown at the top of the Realm tab)
    if (full && L.realms.length) html += '<p class="section-title">Hall of Realms</p>' + L.realms.map((r, i) => `<div class="card light"><div class="grow"><h3>Realm ${L.realms.length - i}${r.seed ? ` <span class="seedw small">${esc(r.seed)}</span>` : ''}</h3><p>${r.days} days, ${(TIERS[r.tier] || TIERS[1]).name}${r.renown ? ` renown ${r.renown}` : ''}, ${r.cleared} islands, Abyss floor ${r.abyss}, ${r.chapters} story chapters. Worth ${r.points} points. Ended ${ago(r.ended)}.</p></div>${r.seed ? `<button class="btn small" data-act="copyseed:${esc(r.seed)}">Copy seed</button>` : ''}</div>${r.saga && r.saga.length ? `<details class="tales hall"><summary>The saga of ${esc(r.house || 'this realm')}</summary>${r.saga.map(e => `<p class="saga-line"><span class="sday">Day ${e.day}</span><span>${esc(e.text)}</span></p>`).join('')}</details>` : ''}`).join('');
    return html;
  }
  decreeHtml() {
    const R = this.R, D = R.decrees.D, a = R.decrees.active();
    const opt = k => { const d = DECREES[k], on = D.pick === k; return `<div class="card ${on ? '' : 'light'} decree"><div class="grow"><h3>${on ? '<span class="rank">In force</span> ' : ''}${d.name}</h3><p class="good">${d.good}.</p><p class="bad">${d.bad}.</p></div>
      ${on ? '' : `<button class="btn small" data-act="decree:${k}" ${D.pick && D.changed ? 'disabled' : ''}>${D.pick ? 'Change' : 'Decree'}</button>`}</div>`; };
    return `<p class="section-title">Royal decree <span class="muted">(new laws on Monday)</span></p>` + (a ? opt(D.pick) + `<details class="other-laws"><summary>Other laws before the council${D.changed ? '' : `, change once for ${R.decrees.changeCost().gold} gold`}</summary>${D.offers.filter(k => k !== D.pick).map(opt).join('')}</details>` : `<p style="text-align:center;font-size:13px">Choose one law for this week. Every law has a price.</p>` + D.offers.map(opt).join(''));
  }
  chalHtml() {
    const R = this.R, C = R.chal.C; if (!C.day) return '';
    const card = (c, label, sub) => `<div class="card ${c.done ? '' : 'light'} chal"><i class="ic ${c.done ? 'ic-shield' : 'ic-sword'}"></i><div class="grow"><p class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:1px">${label}</p><h3>${esc(c.text)}</h3>
      <p>${c.done ? 'Done. ' + sub.done : `${Math.floor(c.have)} / ${c.n}. ${sub.todo}`}</p>${c.done ? '' : `<div class="xpbar"><i style="width:${Math.min(100, c.have / c.n * 100)}%"></i></div>`}</div></div>`;
    const flames = C.streak ? `<div class="streak">${Array.from({ length: 7 }, (_, i) => `<span class="${i < (C.streak % 7 || (C.streak ? 7 : 0)) ? 'on' : ''}"></span>`).join('')}<b>${C.streak} day streak</b></div>` : '';
    const nextDay = new Date(); nextDay.setHours(24, 0, 0, 0);
    return `<p class="section-title">Challenges</p>${flames}` +
      card(C.day, 'Today', { todo: `Reward: resources and ${R.chal.nextPrize()}.`, done: `Next challenge in ${time((nextDay - Date.now()) / 1000)}.` }) +
      card(C.week, 'This week', { todo: 'Reward: an epic piece, plenty of gold and a relic fragment.', done: 'A new one arrives on Monday.' }) +
      `<p class="muted" style="text-align:center;font-size:12px">Best streak: ${C.best} day${C.best === 1 ? "" : "s"}. Every 3rd day in a row brings an epic piece, every 7th a legendary one.</p>`;
  }

  panel_building() {
    const R = this.R, S = R.state, b = this.panelArg;
    if (!R.home.buildings.includes(b)) { setTimeout(() => this.closePanel()); return ''; }
    let html = `<div class="card light"><div class="thumb"><img src="${src(b.type === 'castle' && S.tier < 3 ? 'b_House3' : b.imgKey)}" alt=""></div><div class="grow"><p>${b.def.desc}</p>
      <div class="hpbar"><i id="bhp" style="width:${b.hp / b.maxHp * 100}%"></i></div><p class="muted" id="bhpt">${Math.ceil(b.hp)} / ${b.maxHp} health${b.ruined ? ' - in ruins' : ''}</p></div></div>`;
    this.live.push(() => { const e = $('#bhp'); if (e) e.style.width = (b.hp / b.maxHp * 100) + '%'; const t = $('#bhpt'); if (t) t.textContent = `${Math.ceil(b.hp)} / ${b.maxHp} health${b.ruined ? ' - in ruins' : ''}`; });
    if (!b.done) {
      html += `<p class="section-title" id="bbuild">Under construction: ${time((b.buildEnd - Date.now()) / 1000)}</p>`;
      this.live.push(() => { const e = $('#bbuild'); if (e) e.textContent = `Under construction: ${time((b.buildEnd - Date.now()) / 1000)}`; if (b.done) this.refresh(); });
      html += `<p style="text-align:center;font-size:13px">Builders working here make it rise twice as fast.</p>`;
    }
    if (b.type === 'castle') {
      html += `<button class="btn wide" data-act="throne">The throne room</button>`;
      if (S.upgradeEnd) {
        html += `<p class="section-title" id="bup">Growing into a ${TIERS[S.tier + 1].name}: ${time((S.upgradeEnd - Date.now()) / 1000)}</p>`;
        this.live.push(() => { const e = $('#bup'); if (e) { if (!S.upgradeEnd) return this.refresh(); e.textContent = `Growing into a ${TIERS[S.tier + 1].name}: ${time((S.upgradeEnd - Date.now()) / 1000)}`; } });
      } else if (S.tier < 5) {
        const nt = TIERS[S.tier + 1];
        const unlock = Object.entries(nt.limits).filter(([k, v]) => v > (TIERS[S.tier].limits[k] || 0)).map(([k, v]) => { const n = BUILDINGS[k].name; return `${v} ${v === 1 || /s$/.test(n) ? n : /y$/.test(n) ? n.slice(0, -1) + 'ies' : n + 's'}`; }).join(', ');
        const units = Object.values(UNITS).filter(u => u.tier === S.tier + 1 && u.from !== 'crown').map(u => u.name).join(', ');
        html += `<div class="card"><div class="grow"><h3>Grow into a ${nt.name}</h3><p>Storage ${fmt(nt.storage)}, squad of ${nt.squad}, ${S.tier + 1 >= 3 ? 'castle' : 'hall'} health ${nt.castleHp}. Allows ${unlock}.${units ? ' New soldiers: ' + units + '.' : ''} Takes ${time(nt.time)}.</p>${this.costHtml(nt.cost)}</div>
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
    // neighbourhood (3.6)
    if (b.done && !b.def.wall && b.type !== 'castle') {
      const nb = R.neighbourBonus(b);
      const hint = { house: 'Build near a Chapel or Tavern for a cosy street (+2 happiness).', tower: 'Stand it beside a wall for +20% damage.', market: 'Close to the shore where boats dock, trade boats sail 20% faster.', barracks: 'Within 9 tiles of the castle, training is 10% faster.', archery: 'Within 9 tiles of the castle, training is 10% faster.' }[b.type];
      if (nb.length || hint) html += `<p class="section-title">Neighbourhood</p><div class="card light"><div class="grow">${nb.map(([l, t]) => `<p><b class="good">${l}</b>: ${t}.</p>`).join('')}${!nb.length && hint ? `<p class="muted">${hint} Use Move to relocate it.</p>` : ''}</div></div>`;
    }
    // village services (3.4)
    if (b.done && !b.ruined && b.type === 'tavern') {
      const t = R.tavernHero(), U = UNITS[t.type];
      html += `<p class="section-title">Today at the Tavern</p><div class="card light"><div class="thumb"><img src="${src('av_' + U.avatar + (/^h\d+$/.test(U.avatar) ? '' : '1'))}" class="av" alt=""></div>
        <div class="grow"><h3>${esc(t.name)}</h3><p>Level ${t.level} ${U.name}, two traits, arrives wearing rare gear or better.</p>${t.hired ? '<p class="muted">Already hired. Someone new tomorrow.</p>' : this.costHtml(R.tavernCost())}</div>
        ${t.hired ? '' : `<button class="btn small" data-act="hire">Hire</button>`}</div>`;
    }
    if (b.done && !b.ruined && b.type === 'market') {
      html += `<p class="section-title">Exchange</p>` + EXCHANGE.map(x => `<div class="card light"><div class="grow"><h3>${x.label}</h3><div class="cost">${Object.entries(x.give).map(([k, v]) => `<span><i class="ic ic-${k}"></i>${v}</span>`).join('')}<span class="for">for</span>${Object.entries(x.get).map(([k, v]) => `<span><i class="ic ic-${k}"></i>${v}</span>`).join('')}</div></div>
        <button class="btn small" data-act="xchg:${x.id}" ${R.canAfford(x.give) ? '' : 'disabled'}>Trade</button></div>`).join('') + `<p class="muted" style="text-align:center;font-size:13px">Trade boats sail from the Voyage panel.</p>`;
    }
    if (b.done && !b.ruined && b.type === 'chapel') {
      html += `<p class="section-title">Blessings</p><div class="card light"><div class="grow"><p>Soldiers resting at home heal twice as fast. On holy days the realm receives a second gift and soldiers twice the experience.</p></div></div>`;
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
        html += `<div class="card"><div class="grow"><h3>Upgrade to level ${b.level + 1}</h3><p>${cap1(describeLevel(b.type, b.level + 1))}. Also +30% health. Takes ${time(upgradeTime(b.type, b.level))}.</p>${this.costHtml(c)}${block && block.tierCap ? `<p class="warn">${block.msg}</p>` : ''}</div>
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
    if (b.type !== 'castle') html += `<p></p><div class="row-btns"><button class="btn small" data-act="move:${b.id}" ${R.raid && R.raid.active ? 'disabled' : ''}>Move</button><button class="btn small red" data-act="demolish:${b.id}">Demolish</button></div>${R.raid && R.raid.active ? '<p class="muted" style="text-align:center;font-size:12px">Buildings cannot be moved during a raid.</p>' : ''}`;
    return html;
  }

  panel_nightmarket() {
    const E = this.R.events, M = E.market;
    if (!M) return '<p class="section-title">The trader has slipped away. Come back after dark.</p>';
    return `<p class="section-title">"Quiet now. Everything has a price."</p>` + M.offers.map(o => `<div class="card ${M.bought[o.id] ? 'light' : ''}"><div class="thumb"><img src="${src(o.id === 'sellsword' ? UNIT_AV[o.type] : 'av_thief')}" class="av" alt=""></div>
      <div class="grow"><h3>${esc(o.name)}</h3><p>${esc(o.desc)}</p>${this.costHtml(o.cost)}${o.get ? '<p class="muted">You receive ' + Object.entries(o.get).map(([k, v]) => v + ' ' + k).join(', ') + '</p>' : ''}</div>
      <button class="btn small" data-act="buy:${o.id}" ${M.bought[o.id] || !this.R.canAfford(o.cost) ? 'disabled' : ''}>${M.bought[o.id] ? 'Sold' : 'Buy'}</button></div>`).join('');
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
      <p class="section-title">Minimap</p><div class="row" style="justify-content:center;gap:4px"><button class="btn small ${minimapOn() ? 'on' : ''}" data-act="mm:1">Show</button><button class="btn small ${minimapOn() ? '' : 'on'}" data-act="mm:0">Hide</button></div>
      <p class="section-title">Your realm is saved in this browser automatically.</p>
      <button class="btn wide" data-act="export">Export save</button><p></p>
      <textarea id="saveText" placeholder="Paste a save here to import"></textarea><p></p>
      <button class="btn wide" data-act="import">Import save</button>
      <p class="section-title">Legacy</p>
      ${this.legacyHtml()}
      <p class="section-title">Start over</p>
      <p style="text-align:center;font-size:13px">Wiping erases your realm, soldiers, relics and your Legacy points. Its seed is kept in the Hall of Realms. This cannot be undone.</p>
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
    if (k === 'move') { const b = R.home.buildings.find(o => o.id === +x); if (b) this.startMove(b); return; }
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
    if (k === 'sboss') { err(R.seasonal.summon()); this.closePanel(); return; }
    if (k === 'sbuy') { err(R.seasonal.buy(x)); return this.refresh(); }
    if (k === 'decree') { const D = R.decrees.D; if (D.pick && D.pick !== x) return this.confirm('Change the law?', `Replace ${DECREES[D.pick].name} with ${DECREES[x].name} for ${R.decrees.changeCost().gold} gold? You can only change it once this week.`, 'Change', () => { err(R.decrees.choose(x)); this.refresh(); }); err(R.decrees.choose(x)); return this.refresh(); }
    if (k === 'sqnew') { const q = R.squads.create(); if (typeof q === 'string') err(q); else { this.editSquad = q; R.sfx('ready'); } return this.refresh(); }
    if (k === 'sqedit') { this.editSquad = R.squads.byId(+x); return this.refresh(); }
    if (k === 'sqdone') { this.editSquad = null; return this.refresh(); }
    if (k === 'sqtog') { const q = R.squads.byId(+x); if (q) R.squads.toggle(q, +y); return this.refresh(); }
    if (k === 'sqst') { const q = R.squads.byId(+x); if (q) { q.stance = y; for (const id of q.members) R.squads.repost(id); } return this.refresh(); }
    if (k === 'sqname') { const q = R.squads.byId(+x); if (q) R.squads.rename(q); return this.refresh(); }
    if (k === 'sqsel') { this.closePanel(); this.selectSquad(+x, true); return; }
    if (k === 'sqdel') { const q = R.squads.byId(+x); return this.confirm('Disband this squad?', `${q.name} goes back to the general guard. The soldiers stay.`, 'Disband', () => { R.squads.disband(q); this.refresh(); }); }
    if (k === 'sqbanner') {
      const q = R.squads.byId(+x); if (!q) return;
      this.closePanel(); this.bannerFor = q;
      $('#placebar').classList.remove('hidden'); $('#placeText').textContent = q.name + ' banner'; $('#btnPlaceOk').classList.add('hidden'); $('#bottombar').classList.add('hidden');
      if (q.banner) this.view.centerOn(q.banner.cx * T + 32, q.banner.cy * T);
      this.toast('Tap where the banner should stand. The squad will guard that district.', 'hint');
      return;
    }
    if (k === 'sqpick') {
      const q = R.squads.byId(+x), cap = TIERS[R.state.tier].squad; this.squadPick.clear();
      for (const id of q.members) { const r = R.state.soldiers.find(s => s.id === id); if (r && r.status === 'home' && this.squadPick.size < cap) this.squadPick.add(id); }
      this.pickedSquad = q.id; return this.refresh();
    }
    if (k === 'copyseed') {
      const w = a.slice(9);
      try { navigator.clipboard.writeText(w).then(() => this.toast(`Copied ${w}.`, 'gold'), () => this.toast(`Seed: ${w}`)); } catch (e) { this.toast(`Seed: ${w}`); }
      return;
    }
    if (k === 'embark') { R.sea.embark([...this.squadPick]); this.crewInit = false; this.squadPick.clear(); this.openSea(); return; }
    if (k === 'tosea') { this.openSea(); if (x) { const is = R.sea.ocean.islandById(a.slice(6)); if (is) { this.seaSel = is; this.view.seaFocus(is.x, is.y); this.seaKey = null; this.renderSeaCard(); } } return; }
    if (k === 'court') { this.openPanel('court', a.slice(6)); return; }
    if (k === 'throne') { this.openPanel('throne'); return; }
    if (k === 'codex') { this.openPanel('codex', x); this.tab = x; this.renderPanel(); return; }
    if (k === 'marry') { const e = R.court.marry(a.slice(6)); if (e) this.toast(e, 'red'); else { this.toast('The wedding is held with great feasting.', 'gold'); R.sfx && R.sfx('victory'); } return this.refresh(); }
    if (k === 'hire') { const e = R.court.hire(+x, y); if (e) this.toast(e, 'red'); else this.toast('A new councillor takes their seat.', 'gold'); return this.refresh(); }
    if (k === 'cdis') { return this.confirm('Dismiss?', 'Send this councillor away? Their fee is not returned.', 'Dismiss', () => { R.court.dismiss(x); this.refresh(); }); }
    if (k === 'genapp') { const rec = R.state.soldiers.find(s => s.id === +x); if (rec) { const e = R.war.appoint(rec, y); if (e) this.toast(e, 'red'); else this.toast(`${rec.name} is now a general.`, 'gold'); } return this.refresh(); }
    if (k === 'gendis') { const rec = R.state.soldiers.find(s => s.id === +x); if (rec) this.confirm('Relieve this general?', `${rec.name} goes back to the ranks. Their victories are remembered if they are appointed again.`, 'Relieve', () => { R.war.dismiss(rec); this.refresh(); }); return; }
    if (k === 'refit') { const e = R.war.refit(x); if (e) this.toast(e, 'red'); else { this.toast('The shipwrights finish their work.', 'gold'); R.sfx && R.sfx('build'); } return this.refresh(); }
    if (k === 'colup') { const e = R.colonies.upgrade(a.slice(6)); if (e) this.toast(e, 'red'); else { this.toast('The colony grows.', 'gold'); R.sfx && R.sfx('build'); } return this.refresh(); }
    if (k === 'dip') {
      const id = a.slice(5 + x.length), is = R.sea.ocean.islandById(id); if (!is) return;
      const go = () => { const r = R.kingdoms.act(is, x); if (typeof r === 'string') this.toast(r, 'red'); else { this.toast(r.ok, 'gold'); R.sfx && R.sfx('coin'); R.save(); } this.refresh(); };
      if (x === 'war') return this.confirm('Declare war?', `Declare war on ${is.kingdom.name}? Their raiders may come for your island${['truce', 'ally'].includes(R.kingdoms.stance(is)) ? ', and breaking your word will cost you the trust of every court on the sea' : ''}.`, 'Declare war', go);
      return go();
    }
    if (k === 'tsend') { err(R.trade.send(a.slice(6))); return this.refresh(); }
    if (k === 'tstop') { R.trade.stop(+x); return this.refresh(); }
    if (k === 'hire') { err(R.hireHero()); return this.refresh(); }
    if (k === 'xchg') { err(R.exchange(x)); return this.refresh(); }
    if (k === 'promote') { const rec = R.state.soldiers.find(s => s.id === +x); err(R.promote(rec, y || null)); return this.refresh(); }
    if (k === 'hero') { const rec = R.state.soldiers.find(s => s.id === +x); if (rec) this.openPanel('hero', rec); return; }
    if (k === 'eq') { const rec = R.state.soldiers.find(s => s.id === +x); Gear.equip(R, rec, +y); return this.refresh(); }
    if (k === 'uneq') { const rec = R.state.soldiers.find(s => s.id === +x); Gear.unequip(R, rec, y); return this.refresh(); }
    if (k === 'autoeq') { const rec = R.state.soldiers.find(s => s.id === +x); Gear.autoEquip(R, rec); return this.refresh(); }
    if (k === 'salv') {
      const it = Gear.itemById(R.state, +x); if (!it) return;
      const go = () => { Gear.salvage(R, +x); this.refresh(); };
      if (it.rarity >= 2 || Gear.ownerOf(R.state, it.id)) return this.confirm('Sell this gear?', `${it.name} sells for ${Gear.salvageValue(it)} gold.`, 'Sell', go);
      return go();
    }
    if (k === 'salvall') { for (const g of [...R.state.gear]) if (g.rarity === 0 && !Gear.ownerOf(R.state, g.id)) Gear.salvage(R, g.id); return this.refresh(); }
    if (k === 'vt') { if (x === 'bounty' && R.state.daily.bounty === R.state.daily.last) return; this.voyageTarget = x; return this.refresh(); }
    if (k === 'pick') {
      const id = +x, cap = TIERS[R.state.tier].squad;
      if (this.squadPick.has(id)) this.squadPick.delete(id);
      else if (this.squadPick.size < cap) this.squadPick.add(id);
      else this.toast(`Your realm can send ${cap} soldiers at a time.`);
      return this.refresh();
    }
    if (k === 'launch') {
      const ids = [...this.squadPick];
      const vt = this.voyageTarget || 'frontier';
      const bounty = vt === 'bounty' ? true : (vt.startsWith('rival:') || vt.startsWith('story:') || vt === 'abyss') ? vt : false;
      this.squadPick.clear();
      R.startExpedition(R.state.frontier, ids, bounty);
      this.banner(R.exp.islandName, `${R.exp.region.name}, level ${R.exp.level}. Destroy every camp. Tap a soldier or All, then tap the ground or a foe.`, 'blue');
      return;
    }
    if (k === 'mm') { setMinimap(x === '1'); return this.refresh(); }
    if (k === 'vol') { audio.unlock(); audio.settings[x] = +y; audio.saveSettings(); if (x === 'sfx') audio.play('coin'); return this.refresh(); }
    if (k === 'buy') { err(R.events.buy(x)); return this.refresh(); }
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
    if (k === 'found') {
      const S = R.state, sc = Legacy.realmScore(R);
      if (!Legacy.canFound(R)) return err('Raise the Castle first.');
      const heroes = [...S.soldiers].filter(s => s.type !== 'king').sort((a, b) => b.level - a.level || b.kills - a.kills).slice(0, 5);
      const go = id => this.confirm('Found a new realm?', `This realm ends and its ${sc.total} points join your Legacy.${id ? ` ${S.soldiers.find(s => s.id === id).name} sails with you, with their best piece of gear.` : ''} Everything else stays behind.`, 'Set sail', () => {
        this.askSeed(words => { Legacy.foundNewRealm(R, id); try { if (words) localStorage.setItem('tinyrealm.nextSeed', words); } catch (e) { /* ignore */ } this.wiping = true; R.wipe(); location.reload(); });
      });
      return this.choice('Choose a founder', `Your new realm begins with one hero from this one, back at level 5, keeping up to three traits and their best piece of gear.`, [
        ...heroes.map(h => ({ label: `${h.name}, level ${h.level} ${UNITS[h.type].name}`, fn: () => go(h.id) })),
        { label: 'Go alone', fn: () => go(null) },
        { label: 'Not yet', cls: 'red' },
      ]);
    }
    if (k === 'wipe') {
      return this.confirm('Wipe your realm?', 'Everything will be erased and a new island will rise from the sea.', 'Wipe it all', () => {
        this.confirm('Are you certain?', 'Last chance. Your soldiers, relics and records will be gone forever.', 'Yes, start over', () => {
          this.askSeed(words => { this.wiping = true; try { Legacy.recordWipe(R); if (words) localStorage.setItem('tinyrealm.nextSeed', words); } catch (e) { /* ignore */ } R.wipe(); location.reload(); });
        });
      });
    }
  }

  expeditionResult(s) {
    if (s.fromSea && !s.shipHome) this.openSea(); // the result is read from the deck, not from home
    const div = document.createElement('div');
    if (s.result === 'won') {
      div.innerHTML = `<p>${esc(s.name)} is cleared.</p><div class="cost" style="justify-content:center;font-size:18px"><span><i class="ic ic-gold"></i>+${s.loot.gold}</span><span><i class="ic ic-wood"></i>+${s.loot.wood}</span><span><i class="ic ic-meat"></i>+${s.loot.meat}</span></div>
        ${s.rival ? `<p><b>${rivalDef(s.rival).name}</b> bends the knee. They will pay tribute every hour and never raid you again.</p>` : ''}
        ${s.annexed ? `<p>The conquered land will join your island when you return${s.province ? `, a ${s.province.name} province: ${s.province.desc}` : ''}.</p>` : ''}
        ${s.relic ? `<p>Relic found: <b>${RELICS[s.relic].name}</b>. ${RELICS[s.relic].desc}</p>` : ''}
        ${(s.gear || []).length ? `<p>Gear found: ${s.gear.map(g => `<b style="color:${Gear.RARITY[g.rarity].color}">${esc(g.name)}</b>`).join(', ')}. Equip it from Army.</p>` : ''}<p class="muted">Survivors: ${s.survivors.map(esc).join(', ') || 'none'}</p>`;
      if (s.abyss) {
        const R = this.R, next = s.abyss + 1, ids = (s.survivorIds || []).filter(id => R.state.soldiers.some(r => r.id === id));
        div.innerHTML += `<p>Floor ${next}${next % 5 === 0 ? ' holds a boss' : ' waits below'}. Your squad has rested a little. Press on, or come home and end the run.</p>`;
        this.choice(`Floor ${s.abyss} cleared`, div, [
          { label: `Descend to floor ${next}`, fn: () => { if (!ids.length) return; R.startExpedition(R.state.frontier, ids, 'abyss'); this.banner(R.exp.islandName, next % 5 === 0 ? 'Something large stirs on this floor.' : 'Clear every monster to go deeper.', 'red'); } },
          { label: 'Back to the ship', cls: 'red', fn: () => { R.abyssHome(); this.toast(`The run ends on floor ${s.abyss}.`); this.openSea(); } },
        ]);
        return;
      }
      if (s.story >= 0 && s.story != null) {
        const ch = CHAPTERS[s.story], nx = CHAPTERS[s.story + 1];
        div.innerHTML = `<p style="font-style:italic">${esc(ch.outro)}</p>` + div.innerHTML + (nx ? `<p class="muted">Next: Chapter ${s.story + 2}, ${esc(nx.name)}.</p>` : '<p><b>The Drowned Crown is complete.</b></p>');
        this.choice(ch.final ? 'The crown is yours' : `Chapter ${s.story + 1} won`, div, [{ label: 'Home' }]);
      } else this.choice(s.conquered ? 'The kingdom kneels' : 'Victory', div, [{ label: s.fromSea ? 'Continue' : 'Home', fn: () => { if (s.fromSea && !this.seaOpen) this.openSea(); } }]);
    } else if (s.result === 'lost') {
      div.innerHTML = `<p>No one returned from ${esc(s.name)}. Their names are kept in the Hall of the Fallen.</p>${s.shipHome ? '<p class="muted">With no one left aboard, the ship drifts home on the tide.</p>' : ''}`;
      this.choice('The squad is lost', div, [{ label: 'Home' }]);
    } else {
      div.innerHTML = `<p>The squad pulls back to the ship from ${esc(s.name)}.</p><p class="muted">Aboard: ${s.survivors.map(esc).join(', ')}</p>`;
      this.choice('Retreat', div, [{ label: s.fromSea ? 'Continue' : 'Home', fn: () => { if (s.fromSea && !this.seaOpen) this.openSea(); } }]);
    }
  }
}
