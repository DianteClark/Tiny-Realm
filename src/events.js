// Realm events: major threats that replace a raid, and smaller happenings.
import { T } from './terrain.js';
import { REGIONS, UNITS, TIERS, COMMON_TRAITS, TRAITS, RELICS, FIRST_NAMES, EPITHETS, XP_LEVELS } from './data.js';
import { cellOf } from './world.js';

const center = c => c * T + T / 2;
const pick = a => a[Math.floor(Math.random() * a.length)];
const regionBy = k => REGIONS.find(r => r.key === k);

export const MAJOR = {
  troll: {
    title: 'The Troll Breakout',
    warn: 'Trolls have smashed their chains in the Gnarlrock pits and are rowing for your shores. Ready every blade.',
    ok: S => S.tier >= 2 && S.stats.raidsSurvived >= 2,
  },
  armada: {
    title: 'The Shark Armada',
    warn: 'Three seahorse boats crowded with sharks are closing in from different directions.',
    ok: S => S.stats.raidsSurvived >= 3,
  },
  bones: {
    title: 'The Night of Bones',
    warn: 'The sky turns the colour of old wine. Something is stirring under the grass of your island.',
    ok: (S, R) => S.tier >= 2 && R.env.isNight,
  },
  hex: {
    title: "The Hex Shaman's Curse",
    warn: 'A Hex Shaman and her imps have landed. Her spells turn soldiers into sheep. Strike her down to lift the curse.',
    ok: S => S.tier >= 2 && S.stats.raidsSurvived >= 1,
  },
  moonhunt: {
    title: 'The Moonlit Hunt',
    warn: 'The full moon rises. The Moonhide Bear wakes in the deep woods and leads its pack of spiders and snakes toward the light of your castle.',
    ok: (S, R) => false, // only triggered by the full moon
  },
  minotaur: {
    title: "The Minotaur's Challenge",
    warn: 'A Minotaur wades ashore and bellows for a champion. Answer with your best fighter, or face its fury.',
    ok: (S, R) => S.tier >= 2 && S.soldiers.some(s => s.status === 'home'),
  },
};

export class EventDirector {
  constructor(realm) {
    this.R = realm;
    this.pending = null;   // major event counting down
    this.active = null;    // major event in progress
    this.merchant = null;
    this.bees = null;
  }
  get blocking() { return !!(this.pending || this.active); }

  update(dt) {
    const R = this.R, S = R.state, h = R.home;
    S.timers.minor -= dt;
    if (S.timers.minor <= 0 && !R.raid) { S.timers.minor = 150 + Math.random() * 180; this.minor(); }
    const majorAllowed = S.tier >= 2 || S.stats.raidsSurvived >= 3;
    const hol0 = R.holiday();
    if (majorAllowed && !R.raid && !this.blocking && !R.pendingRaid && !(hol0 && hol0.peace)) {
      S.timers.major -= dt;
      if (S.timers.major <= 0) { S.timers.major = 1500 + Math.random() * 900; this.major(); }
    }
    // the full moon summons the Moonlit Hunt once per lunar month
    const moon = R.moon(), hol = R.holiday();
    if (R.env.isNight && moon.full && S.tier >= 2 && !R.raid && !this.blocking && !(hol && hol.peace)) {
      const huntId = Math.floor((Date.now() - Date.UTC(2000, 0, 6)) / (29.530588853 * 86400000));
      if (S.lastHunt !== huntId) { S.lastHunt = huntId; this.announce('moonhunt'); }
    }
    // the night market opens at dusk and packs up at dawn
    if (R.env.isNight && !R.exp) { if (!this.market || this.market.period !== R.env.period) this.openMarket(); }
    else if (this.market) this.closeMarket();
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.kind === 'bones') h.tint = Math.min(1, h.tint + dt * 0.3);
      if (this.pending.t <= 0) this.launch();
    }
    if (this.active && this.active.kind === 'bones') h.tint = Math.min(1, h.tint + dt * 0.3);
    else if (!this.pending || this.pending.kind !== 'bones') h.tint = Math.max(0, h.tint - dt * 0.2);
    if (this.active && this.active.update) this.active.update(dt);
    if (this.merchant) { this.merchant.t -= dt; if (this.merchant.t <= 0) this.endMerchant(true); }
    if (this.bees) this.updateBees(dt);
  }

  // ------------------------------------------------------------ major
  major(force) {
    const S = this.R.state;
    const options = Object.keys(MAJOR).filter(k => MAJOR[k].ok(S, this.R));
    if (!options.length) return;
    const kind = force || pick(options);
    this.announce(kind);
  }
  announce(kind) {
    const R = this.R, S = R.state, ev = MAJOR[kind];
    let plan;
    const lvl = 1 + Math.floor(S.stats.raidsSurvived / 4) + (S.tier - 1) + S.renown;
    if (kind === 'troll') {
      const n = S.tier < 4 ? 1 : S.tier < 5 ? 2 : 3;
      plan = R.planRaid('troll', { region: regionBy('goblin'), units: [...Array(n).fill('troll'), 'speargoblin', 'torchgoblin', 'torchgoblin', ...(S.tier >= 3 ? ['speargoblin', 'pigrider'] : [])], gap: 1.1 });
    } else if (kind === 'armada') {
      const base = R.planRaid('raid', { region: regionBy('reef') });
      plan = R.planRaid('armada', { region: regionBy('reef'), boats: 3, units: base.queue.map(e => e.type).concat(S.tier >= 3 ? ['turtle'] : []) });
    } else if (kind === 'bones') {
      plan = R.planRaid('bones', { region: regionBy('crypt'), units: [] });
      const spots = [];
      const m = R.home.map;
      for (let k = 0; k < 300 && spots.length < 6; k++) {
        const x = 3 + Math.floor(Math.random() * (m.w - 6)), y = 3 + Math.floor(Math.random() * (m.h - 6));
        if (m.walkable(x, y) && R.reach[m.i(x, y)] && Math.hypot(x - R.door[0], y - R.door[1]) > 7 && !spots.some(s => Math.hypot(s.lx - x, s.ly - y) < 5)) spots.push({ lx: x, ly: y, wx: x, wy: y, ground: true });
      }
      plan.spawns = spots;
      const n = 8 + S.tier * 3 + Math.floor(S.stats.raidsSurvived / 2);
      plan.queue = Array.from({ length: n }, (_, i) => ({ type: i % 5 === 4 ? 'bat' : 'skull', si: i }));
      plan.gap = 0.8;
    } else if (kind === 'hex') {
      plan = R.planRaid('hex', { region: regionBy('crypt'), units: ['shaman', 'imp', 'imp', 'imp', 'skull', 'imp', 'skull'] });
    } else if (kind === 'minotaur') {
      plan = R.planRaid('minotaur', { region: regionBy('badlands'), units: ['minotaur'] });
    } else if (kind === 'moonhunt') {
      plan = R.planRaid('moonhunt', { region: regionBy('badlands'), units: ['moonbear', 'spider', 'snake', 'spider', 'snake', 'spider', ...(S.tier >= 3 ? ['bear', 'spider', 'snake'] : [])], gap: 0.9 });
    }
    plan.level = lvl;
    this.pending = { kind, t: kind === 'minotaur' ? 25 : 75, plan };
    if (plan.spawns[0] && !plan.spawns[0].ground) R.showBoat(plan);
    R.sfx(kind === 'troll' || kind === 'minotaur' ? 'roar' : 'horn');
    R.ui.banner(ev.title, ev.warn + (kind === 'minotaur' ? '' : ' It begins in about a minute.'), 'red');
    R.log(`${ev.title} began.`);
  }
  launch() {
    const R = this.R, S = R.state;
    const { kind, plan } = this.pending; this.pending = null;
    const ev = MAJOR[kind];
    const act = { kind, title: ev.title };
    this.active = act;
    const onEnd = won => {
      this.active = null;
      if (won) {
        S.stats.eventsSurvived++;
        this.reward(kind, act);
      }
    };
    if (kind === 'bones') {
      // spawn from the ground with dust instead of boats
      R.startRaid(plan, { title: ev.title, text: 'Skeletons claw their way out of the earth.', onEnd });
      R.raid.ground = true;
    } else if (kind === 'minotaur') {
      R.startRaid(plan, { title: ev.title, text: 'The Minotaur waits on the shore.', onEnd, silent: true });
      plan.queue[0].flagDuel = u => { u.waiting = 9999; act.mino = u; act.wait = 120; u.duel = true; this.askChampion(act); };
      R.raid.queue[0].flagDuel = plan.queue[0].flagDuel;
      act.update = dt => {
        if (act.mino && act.mino.waiting > 1000) {
          act.wait -= dt;
          if (act.wait <= 0) this.refuseDuel(act);
        }
      };
    } else {
      R.startRaid(plan, { title: ev.title, text: kind === 'troll' ? 'The trolls are ashore. Their clubs can flatten a house.' : kind === 'armada' ? 'Sharks spill onto every beach.' : kind === 'moonhunt' ? 'The Moonhide Bear is ashore.' : 'The shaman begins to chant.', onEnd });
    }
  }
  askChampion(act) {
    const R = this.R;
    const units = R.home.units.filter(u => u.rec && u.alive && u.kind === 'soldier' && u.type !== 'monk' && u.type !== 'catapult' && u.cursed <= 0);
    if (!units.length) return this.refuseDuel(act);
    R.ui.choice("The Minotaur's Challenge", 'Choose a champion to face the Minotaur alone. If your champion falls, they are gone for good. Refuse and the beast will rampage through your realm.', [
      ...units.sort((a, b) => b.rec.level - a.rec.level).slice(0, 6).map(u => ({ label: `${u.rec.name} (${UNITS[u.type].name}, lvl ${u.rec.level})`, fn: () => this.startDuel(act, u) })),
      { label: 'Refuse', cls: 'red', fn: () => this.refuseDuel(act) },
    ]);
  }
  startDuel(act, champ) {
    const m = act.mino; if (!m || !m.alive || !champ.alive) return;
    m.waiting = 0; m.duelOnly = champ; m.target = champ;
    champ.duelOnly = m; champ.order = { type: 'attack', target: m };
    act.champ = champ;
    this.R.ui.toast(`${champ.rec.name} steps forward to face the Minotaur.`);
    m.onDeath = () => {
      champ.duelOnly = null;
      if (champ.alive && champ.rec && !champ.rec.traits.includes('champion')) { champ.rec.traits.push('champion'); champ.applyStats(); }
      act.duelWon = true;
    };
    act.update = () => {
      if (!champ.alive && m.alive && !act.duelLost) {
        act.duelLost = true; m.duelOnly = null; m.leaving = true; m.target = null;
        this.R.ui.banner('The champion has fallen', 'The Minotaur roars in triumph and wades back into the sea.', 'red');
      }
    };
  }
  refuseDuel(act) {
    const m = act.mino; if (!m || !m.alive) return;
    m.waiting = 0; m.duel = false;
    this.R.ui.banner('The Minotaur rampages', 'No champion answered. It charges the realm. Bring it down together.', 'red');
    act.refused = true;
  }
  reward(kind, act) {
    const R = this.R, S = R.state;
    const g = 150 + S.tier * 100;
    let relic = null;
    const give = k => { if (!S.relics[k]) { S.relics[k] = true; relic = k; } };
    if (kind === 'troll') { R.addAll({ gold: g * 2, meat: g }); give('trolltusk'); }
    else if (kind === 'armada') { R.addAll({ gold: g, wood: g }); give('sharktooth'); }
    else if (kind === 'bones') { R.addAll({ gold: g, wood: g * 0.5 }); give('boneidol'); }
    else if (kind === 'hex') { R.addAll({ gold: g * 1.2 }); give('hexcharm'); }
    else if (kind === 'moonhunt') { R.addAll({ gold: g * 1.5, meat: g }); give('moonstone'); S.stats.moonHunts = (S.stats.moonHunts || 0) + 1; }
    else if (kind === 'minotaur') {
      if (act.duelLost) return;
      R.addAll({ gold: g * (act.duelWon ? 2 : 1), meat: g });
      if (act.duelWon) { give('minotaurhorn'); R.ui.toast(`${act.champ.rec.name} is now a Champion.`); }
    }
    // great events always leave a piece of gear on the field; the hunt leaves something special
    R.chal.note('boss', {});
    R.dropGear(4 + S.tier * 3, { min: kind === 'moonhunt' ? 2 : 1, from: MAJOR[kind] ? MAJOR[kind].title : '' });
    if (relic) R.ui.banner('Relic claimed', `${RELICS[relic].name}: ${RELICS[relic].desc}`, 'gold');
  }

  // ------------------------------------------------------------ night market
  openMarket() {
    const R = this.R, S = R.state, h = R.home, T0 = S.tier;
    this.closeMarket();
    const c = h.nearestWalkable(R.door[0] + 3, R.door[1] + 1, 6) || R.door;
    const npc = { key: 'thief_idle', x: c[0] * T + 32, y: c[1] * T + 40, flip: true, tap: () => R.ui.openPanel('nightmarket') };
    h.npcs = [npc];
    let seed = 0; for (const ch of R.env.period + S.seed) seed = (seed * 33 + ch.charCodeAt(0)) >>> 0;
    const types = Object.keys(UNITS).filter(k => k !== 'pawn' && !UNITS[k].unique && UNITS[k].tier <= Math.min(5, T0 + 1));
    const type = types[seed % types.length];
    const offers = [
      { id: 'fragment', name: 'Relic Fragment', desc: `A shard of something old. Gather 3 to forge a relic you do not have. You hold ${S.fragments || 0}.`, cost: { gold: 220 * T0 } },
      { id: 'sellsword', name: `Moonlit ${UNITS[type].name}`, desc: `A level ${4 + T0} ${UNITS[type].name} with three traits, no questions asked.`, cost: { gold: (UNITS[type].cost.gold || 30) * 3 + 120 * T0 }, type },
      { id: 'draught', name: "Soldier's Draught", desc: 'A bitter brew. One soldier at home gains a full level.', cost: { gold: 140 * T0, meat: 60 * T0 } },
      { id: 'chest', name: 'Sealed War Chest', desc: 'Something heavy rattles inside. Always rare or better.', cost: { gold: 160 + 90 * T0 } },
      { id: 'timber', name: 'Smuggled Timber', desc: 'Wood of doubtful origin, cheap.', cost: { gold: 90 * T0 }, get: { wood: 260 * T0 } },
    ];
    this.market = { period: R.env.period, npc, offers, bought: {} };
    if (S.tier >= 1) R.ui.toast(`A hooded trader has set up a Night Market by the ${S.tier < 3 ? 'hall' : 'castle'}. Tap them to see their wares.`);
  }
  closeMarket() { if (this.market) { this.R.home.npcs = []; this.market = null; } }
  buy(id) {
    const R = this.R, S = R.state, M = this.market; if (!M) return 'The market has closed.';
    const o = M.offers.find(x => x.id === id); if (!o) return;
    if (M.bought[id]) return 'Sold out for tonight.';
    if (id === 'sellsword' && R.popUsed() + UNITS[o.type].pop > R.popCap()) return 'No room. Build more Houses.';
    if (id === 'draught' && !S.soldiers.some(s => s.status === 'home' && s.level < 10)) return 'No soldier at home can drink it.';
    if (!R.pay(o.cost)) return 'Not enough to pay.';
    M.bought[id] = true; R.sfx('coin');
    S.stats.marketBuys = (S.stats.marketBuys || 0) + 1;
    if (id === 'chest') { R.dropGear(3 + S.tier * 3, { min: 1, from: 'the Night Market' }); }
    else if (id === 'fragment') {
      S.fragments = (S.fragments || 0) + 1;
      if (S.fragments >= 3) {
        const unowned = Object.keys(RELICS).filter(k => !S.relics[k] && !['seacrown', 'harvestsickle', 'frostheart', 'springbloom', 'sunstone', 'moonstone'].includes(k));
        if (unowned.length) { const k = unowned[Math.floor(Math.random() * unowned.length)]; S.relics[k] = true; S.fragments -= 3; R.ui.banner('Relic forged', `${RELICS[k].name}: ${RELICS[k].desc}`, 'gold'); R.sfx('levelup'); }
      } else R.ui.toast(`You hold ${S.fragments} of 3 fragments.`);
    } else if (id === 'sellsword') {
      const rec = R.newSoldier(o.type); rec.level = 4 + S.tier; rec.xp = XP_LEVELS[rec.level];
      while (rec.traits.length < 3) { const t = COMMON_TRAITS[Math.floor(Math.random() * COMMON_TRAITS.length)]; if (!rec.traits.includes(t)) rec.traits.push(t); }
      R.spawnSoldier(rec, false, { x: M.npc.x, y: M.npc.y }); R.ui.toast(`${rec.name} slips out of the shadows to join you.`);
    } else if (id === 'draught') {
      const recs = S.soldiers.filter(s => s.status === 'home' && s.level < 10).sort((a, b) => b.level - a.level);
      const rec = recs[0]; const u = R.home.units.find(x => x.rec === rec);
      rec.xp = Math.max(rec.xp, XP_LEVELS[rec.level + 1]);
      if (u) R.grantXp(R.home, u, 0.01); else rec.level++;
      R.ui.toast(`${rec.name} drinks the draught and grows stronger.`);
    } else if (o.get) R.addAll(o.get);
    return null;
  }

  // ------------------------------------------------------------ minor
  minor(force) {
    const R = this.R, S = R.state;
    const night = R.env.isNight, hol = R.holiday();
    let opts = night ? ['goldrush', 'wisp', 'wisp', 'lambs'] : ['goldrush', 'merchant', 'duck', 'lambs', 'bees'];
    if (hol && hol.peace) opts = opts.filter(k => k !== 'bees');
    if (hol && hol.solemn) opts = ['lambs'];
    if (S.tier >= 1 && S.stats.raidsSurvived >= 1) opts.push('mercenary', 'mercenary');
    const k = force || pick(opts);
    if (k === 'goldrush') {
      R.home.goldRush = 240;
      R.ui.banner('Gold Rush', 'A seam of bright gold glints in every stone. Miners bring back double for 4 minutes.', 'gold');
    } else if (k === 'merchant') this.startMerchant();
    else if (k === 'duck') this.spawnDuck();
    else if (k === 'lambs') {
      for (let i = 0; i < 3; i++) R.spawnSheep();
      R.ui.toast('Lambing season. Three new sheep join the flock.');
    } else if (k === 'mercenary') this.offerMercenary();
    else if (k === 'bees') this.startBees();
    else if (k === 'wisp') this.spawnWisp();
  }
  startMerchant() {
    const R = this.R;
    const s = R.shore[Math.floor(Math.random() * R.shore.length)];
    if (!s) return;
    const boat = { key: 'boat', x: center(s.wx), y: center(s.wy) + 40, t: 0, flip: s.wx > s.lx, merchant: true };
    R.home.boats.push(boat);
    const T0 = R.state.tier;
    const n = 100 * T0, m = Math.round(70 * T0);
    this.merchant = {
      t: 240, boat,
      offers: [
        { give: { wood: n }, get: { gold: m } },
        { give: { meat: n }, get: { gold: m } },
        { give: { gold: m }, get: { wood: Math.round(n * 1.2) } },
        { give: { gold: m }, get: { meat: Math.round(n * 1.2) } },
        { give: { wood: n }, get: { meat: n } },
      ],
    };
    R.sfx('bell');
    R.ui.banner('A merchant boat docks', 'Trader Pell will barter for 4 minutes. Tap the Merchant button to trade.', 'gold');
    R.ui.refresh();
  }
  trade(i) {
    const R = this.R, M = this.merchant; if (!M) return;
    const o = M.offers[i];
    if (!R.pay(o.give)) return 'Not enough to trade.';
    R.addAll(o.get); R.sfx('coin');
    return null;
  }
  endMerchant(sail) {
    const R = this.R;
    if (this.merchant) R.home.boats = R.home.boats.filter(b => b !== this.merchant.boat);
    this.merchant = null;
    if (sail) R.ui.toast('The merchant boat sails away.');
    R.ui.refresh();
  }
  spawnDuck() {
    const R = this.R, h = R.home;
    const s = R.shore[Math.floor(Math.random() * R.shore.length)];
    if (!s) return;
    const dx = Math.sign(s.wx - s.lx), dy = Math.sign(s.wy - s.ly);
    h.duck = { x: center(s.wx) + dx * 20, y: center(s.wy) + dy * 20 + 20, t: 0, life: 150, tap: () => this.tapDuck() };
    R.sfx('quack');
    R.ui.toast('Something small and yellow is bobbing near the shore.');
  }
  spawnWisp() {
    const R = this.R, h = R.home, m = h.map;
    for (let k = 0; k < 60; k++) {
      const x = 3 + Math.floor(Math.random() * (m.w - 6)), y = 3 + Math.floor(Math.random() * (m.h - 6));
      if (!m.walkable(x, y) || !R.reach[m.i(x, y)]) continue;
      h.duck = { key: 'hexBolt', wisp: true, x: x * T + 32, y: y * T + 32, t: 0, life: 120, tap: () => this.tapWisp() };
      R.ui.toast('A pale wisp drifts over the island. Catch it before dawn.');
      R.sfx('hex');
      return;
    }
  }
  tapWisp() {
    const R = this.R, S = R.state, h = R.home, d = h.duck;
    h.fxAt('hexBoom', d.x, d.y + 20); h.duck = null; R.sfx('levelup');
    const soldiers = h.units.filter(u => u.rec && u.alive);
    if (soldiers.length && Math.random() < 0.5) {
      for (const u of soldiers) R.grantXp(h, u, 20 + S.tier * 10);
      R.ui.toast('The wisp bursts into light. Every soldier at home feels wiser.', 'gold');
    } else { const g = Math.round((80 + Math.random() * 120) * S.tier); R.addRes('gold', g); R.ui.toast(`The wisp leaves behind ${g} gold.`, 'gold'); }
  }
  tapDuck() {
    const R = this.R, S = R.state;
    R.home.fxAt('splash', R.home.duck.x, R.home.duck.y + 20); R.sfx('quack'); R.sfx('coin');
    R.home.duck = null;
    if (!S.relics.rubberduck && Math.random() < 0.15) {
      S.relics.rubberduck = true;
      R.ui.banner('Relic claimed', `${RELICS.rubberduck.name}: ${RELICS.rubberduck.desc}`, 'gold');
    } else {
      const g = Math.round((60 + Math.random() * 120) * S.tier);
      R.addRes('gold', g);
      R.ui.toast(`Inside the duck: a rolled-up treasure note worth ${g} gold.`, 'gold');
    }
  }
  offerMercenary() {
    const R = this.R, S = R.state;
    const types = Object.keys(UNITS).filter(k => k !== 'pawn' && !UNITS[k].unique && UNITS[k].tier <= Math.min(5, S.tier + 1));
    const type = pick(types);
    const level = 2 + Math.floor(Math.random() * 3) + Math.floor(S.tier / 2);
    const traits = [];
    while (traits.length < 2) { const t = pick(COMMON_TRAITS); if (!traits.includes(t)) traits.push(t); }
    const price = Math.round((UNITS[type].cost.gold || 30) * 2 + level * 30);
    const name = pick(FIRST_NAMES) + ' ' + pick(EPITHETS);
    R.ui.choice('A wandering mercenary', `${name}, a level ${level} ${UNITS[type].name} (${traits.map(t => TRAITS[t].name).join(', ')}), offers to join your realm for ${price} gold.`, [
      { label: `Hire for ${price} gold`, fn: () => {
        if (R.popUsed() + UNITS[type].pop > R.popCap()) return R.ui.toast('No room. Build more Houses.', 'red');
        if (!R.pay({ gold: price })) return R.ui.toast('Not enough gold.', 'red');
        const rec = R.newSoldier(type);
        rec.name = name; rec.level = level; rec.traits = traits;
        rec.xp = [0, 0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100][level];
        R.spawnSoldier(rec, false, { x: R.castle.x, y: R.castle.y + 80 });
        R.log(`Hired ${name} the mercenary.`);
      } },
      { label: 'Send them away', cls: 'red', fn: () => { } },
    ]);
  }
  startBees() {
    const R = this.R, h = R.home;
    const living = h.trees.filter(t => t.wood > 0);
    if (!living.length) return;
    const tr = pick(living);
    const n = 5 + R.state.tier * 2;
    const units = [];
    for (let i = 0; i < n; i++) {
      const u = h.addUnit('bee', 1, center(tr.cx) + (Math.random() - 0.5) * 80, center(tr.cy) + (Math.random() - 0.5) * 60, { level: R.state.tier, mode: 'guard' });
      u.home = { x: center(tr.cx), y: center(tr.cy) + 10 }; u.campId = 'bees';
      units.push(u);
    }
    this.bees = { units, x: center(tr.cx), y: center(tr.cy) };
    R.ui.banner('Bee swarm', 'Angry bumblebees have nested in a forest. Woodcutters near them will flee. Send soldiers to clear the swarm.', 'gold');
  }
  updateBees(dt) {
    const B = this.bees, R = this.R;
    const alive = B.units.filter(u => u.alive);
    if (!alive.length) {
      this.bees = null;
      const g = 40 + R.state.tier * 30;
      R.addRes('gold', g); R.addRes('meat', g);
      R.ui.toast(`The swarm is cleared. The forest is safe. +${g} gold and meat.`, 'gold');
      return;
    }
    for (const p of R.home.units) {
      if (p.kind !== 'pawn' || p.job !== 'wood' || p.stung > 0) continue;
      if (alive.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 3 * T)) { p.stung = 15; R.releaseNode(p); p.task = null; p.carry = null; R.home.floatText('Stung', p.x, p.y - 70, '#ffe066'); }
    }
  }
}
