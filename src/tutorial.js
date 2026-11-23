// First-session guided tutorial and achievements ("Feats").
import { SHEETS } from './assets.js';
import { audio } from './audio.js';

const $ = s => document.querySelector(s);

// Each step: text, where to point (a CSS selector, or a world object), and when it's done.
const STEPS = [
  { text: 'Welcome, ruler. Your two heroes guard the hamlet while your pawns gather wood, gold and meat. Open Workers to see them.', el: () => '[data-panel="workers"]', done: (R, U) => U.panel === 'workers' },
  { text: 'More hands means more of everything. Train a Pawn at the hall.', el: () => '[data-act$=":pawn"]', done: R => R.state.pawns > 3 || R.castle.queue.some(q => q.unit === 'pawn') },
  { text: 'New pawns go to work on their own. Close this panel.', el: () => '#panelClose', done: (R, U) => !U.panel },
  { text: 'One house will not hold a growing hamlet. Open Build.', el: () => '[data-panel="build"]', done: (R, U) => U.panel === 'build' || R.countOf('house') > 1 },
  { text: 'Build a second House to make room for more people.', el: () => '[data-act="place:house"]', done: (R, U) => (U.place && U.place.type === 'house') || R.countOf('house') > 1 },
  { text: 'Drag the house to a green spot, then press Build here.', el: () => '#btnPlaceOk', done: R => R.countOf('house') > 1 },
  { text: 'Raiders will come. Open Build again and place a Barracks.', el: (R, U) => U.panel === 'build' ? '[data-act="place:barracks"]' : U.place ? '#btnPlaceOk' : '[data-panel="build"]', done: R => R.countOf('barracks') > 0 },
  { text: 'While it rises, tap the Barracks. When it is finished, train a Warrior there.', world: R => R.home.buildings.find(b => b.type === 'barracks'), el: (R, U) => U.panel === 'building' ? '[data-act$=":warrior"]' : null, done: R => R.state.soldiers.some(s => !s.hero) },
  { text: 'Every soldier has a name and traits, and death is permanent. Tap your new Warrior to select them.', world: R => R.home.units.find(u => u.rec && u.alive && !u.rec.hero) || R.home.units.find(u => u.rec && u.alive), done: R => R.home.selected.size > 0 },
  { text: 'Now tap the ground somewhere to move them. Soldiers guard the spot you choose.', done: R => [...R.home.selected].some(u => u.order || (u.home && Math.hypot(u.home.x - u.x, u.home.y - u.y) < 30 && u.movedOnce)) || R.home.units.some(u => u.rec && u.order) },
  { text: 'Each soldier type has a special ability. With them selected, try Shield Wall.', el: () => '.ab', done: R => R.home.units.some(u => u.buff && u.buff('shield')) || R.home.selected.size === 0 },
  { text: 'You are ready. The goal tracker at the top always shows what to do next. Long live the realm!', el: () => '[data-pill="quest"]', done: (R, U, t) => t > 7 },
];

export class Tutorial {
  constructor(realm, ui, view) {
    this.R = realm; this.U = ui; this.view = view;
    this.box = document.createElement('div');
    this.box.id = 'tut'; this.box.className = 'paper hidden';
    this.box.innerHTML = '<p id="tutText"></p><button class="btn small red" id="tutSkip">Skip tutorial</button>';
    this.hand = document.createElement('img');
    this.hand.id = 'tutHand'; this.hand.className = 'hidden';
    this.hand.src = encodeURI(SHEETS.cursorHand ? SHEETS.cursorHand.src : 'assets/free/UI Elements/UI Elements/Cursors/Cursor_02.png');
    document.getElementById('hud').append(this.box, this.hand);
    this.box.querySelector('#tutSkip').onclick = () => this.finish();
    this.t = 0;
  }
  get step() { return this.R.state.tutorial; }
  start() {
    const S = this.R.state;
    if (S.tutorial === undefined) S.tutorial = (S.soldiers.some(s => !s.hero) || S.questIdx > 3) ? -1 : 0;
    this.show();
  }
  finish() { this.R.state.tutorial = -1; this.box.classList.add('hidden'); this.hand.classList.add('hidden'); this.R.save(); }
  show() {
    const i = this.step;
    if (i < 0 || i >= STEPS.length || this.R.exp) { this.box.classList.add('hidden'); this.hand.classList.add('hidden'); return; }
    this.box.classList.remove('hidden');
    $('#tutText').textContent = STEPS[i].text;
  }
  update(dt) {
    const i = this.step;
    if (i < 0 || i >= STEPS.length) { if (i >= STEPS.length) this.finish(); else { this.box.classList.add('hidden'); this.hand.classList.add('hidden'); } return; }
    if (this.R.exp) { this.box.classList.add('hidden'); this.hand.classList.add('hidden'); return; }
    this.t += dt;
    const st = STEPS[i];
    if (st.done(this.R, this.U, this.t)) {
      this.R.state.tutorial = i + 1; this.t = 0; audio.play('ready');
      this.show(); return;
    }
    this.box.classList.remove('hidden');
    // point the hand
    let x = null, y = null;
    const sel = st.el && st.el(this.R, this.U);
    const el = sel && document.querySelector(sel);
    if (el && el.offsetParent !== null) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
    else if (st.world) { const o = st.world(this.R); if (o) { const p = this.view.toScreen(o.x, (o.bodyY ?? o.y) - 10); x = p.x; y = p.y; } }
    // keep the message out of the way of whatever we point at
    this.box.classList.toggle('low', y !== null && y < window.innerHeight * 0.45);
    if (x === null) { this.hand.classList.add('hidden'); return; }
    this.hand.classList.remove('hidden');
    const bob = Math.sin(performance.now() / 180) * 6;
    this.hand.style.transform = `translate(${Math.round(x - 6)}px, ${Math.round(y + 4 + bob)}px)`;
  }
}

// ------------------------------------------------------------ feats
export const FEATS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Slay your first monster.', test: S => S.stats.kills >= 1 },
  { id: 'hundred', name: 'Monster Bane', desc: 'Slay 100 foes.', test: S => S.stats.kills >= 100 },
  { id: 'thousand', name: 'Legend of the Isles', desc: 'Slay 1000 foes.', test: S => S.stats.kills >= 1000 },
  { id: 'town', name: 'Village Green', desc: 'Grow the hamlet into a Village.', test: S => S.tier >= 2 },
  { id: 'stronghold', name: 'Stone and Mortar', desc: 'Raise the Castle.', test: S => S.tier >= 3 },
  { id: 'citadel', name: 'Long Live the King', desc: 'Be crowned: become a Kingdom.', test: S => S.tier >= 5 },
  { id: 'renown5', name: 'Renowned', desc: 'Reach Renown rank 5.', test: S => S.renown >= 5 },
  { id: 'isles5', name: 'Seafarer', desc: 'Clear 5 islands.', test: S => S.cleared >= 5 },
  { id: 'isles15', name: 'Admiral', desc: 'Clear 15 islands.', test: S => S.cleared >= 15 },
  { id: 'isles30', name: 'Master of the Sea', desc: 'Clear 30 islands.', test: S => S.cleared >= 30 },
  { id: 'raids10', name: 'Steadfast', desc: 'Repel 10 raids.', test: S => S.stats.raidsSurvived >= 10 },
  { id: 'raids50', name: 'Unbreakable', desc: 'Repel 50 raids.', test: S => S.stats.raidsSurvived >= 50 },
  { id: 'troll', name: 'Trollbane', desc: 'Slay a Troll.', test: S => S.stats.trollsSlain >= 1 },
  { id: 'veteran', name: 'Living Legend', desc: 'Raise a soldier to level 10.', test: S => S.soldiers.some(s => s.level >= 10) },
  { id: 'champion', name: 'Champion of the Realm', desc: 'Win the Minotaur\'s Challenge.', test: S => S.soldiers.some(s => s.traits.includes('champion')) },
  { id: 'relics5', name: 'Collector', desc: 'Hold 5 relics.', test: S => Object.values(S.relics).filter(Boolean).length >= 5 },
  { id: 'relicsall', name: 'Curator', desc: 'Hold every relic.', test: S => Object.values(S.relics).filter(Boolean).length >= 10 },
  { id: 'duck', name: 'Quack', desc: 'Find the Lucky Rubber Duck.', test: S => !!S.relics.rubberduck },
  { id: 'vassal', name: 'Overlord', desc: 'Make a rival house your vassal.', test: S => Object.values(S.rivals || {}).some(r => r.subjugated) },
  { id: 'emperor', name: 'Emperor of the Isles', desc: 'Make all four rival houses your vassals.', test: S => Object.values(S.rivals || {}).filter(r => r.subjugated).length >= 4 },
  { id: 'walls', name: 'Palisade', desc: 'Stand 30 wall sections.', test: (S, R) => R.countOf('wall') >= 30 },
  { id: 'army20', name: 'Grand Army', desc: 'Command 20 soldiers at once.', test: S => S.soldiers.length >= 20 },
  { id: 'rich', name: 'Overflowing Coffers', desc: 'Hold 10,000 gold.', test: S => S.res.gold >= 10000 },
  { id: 'streak7', name: 'Faithful', desc: 'Visit 7 days in a row.', test: S => S.daily.streak >= 7 },
  { id: 'night', name: 'Night Watch', desc: 'Repel a raid at night.', test: S => (S.stats.nightRaids || 0) >= 1 },
  { id: 'storm', name: 'Storm Breaker', desc: 'Repel a raid during a storm.', test: S => (S.stats.stormRaids || 0) >= 1 },
  { id: 'orders10', name: 'Round the Clock', desc: 'Complete 10 day or night orders.', test: S => (S.stats.ordersDone || 0) >= 10 },
  { id: 'wisp', name: 'Wisp Catcher', desc: 'Slay 25 night creatures.', test: S => (S.stats.nightKills || 0) >= 25 },
  { id: 'christmas', name: 'Keeping Christmas', desc: 'Be in your realm on Christmas Day.', test: S => !!(S.holidaysSeen || {}).christmas },
  { id: 'easter', name: 'He Is Risen', desc: 'Be in your realm on Easter Sunday.', test: S => !!(S.holidaysSeen || {}).easter },
  { id: 'advent', name: 'Watchful Waiting', desc: 'Keep all four Sundays of Advent.', test: S => ((S.holidaysSeen || {}).advent || 0) >= 4 },
  { id: 'moonhunt', name: 'Moonhide', desc: 'Survive the Moonlit Hunt.', test: S => (S.stats.moonHunts || 0) >= 1 },
  { id: 'market', name: 'Shady Dealings', desc: 'Buy something at the Night Market.', test: S => (S.stats.marketBuys || 0) >= 1 },
  { id: 'geared', name: 'Kitted Out', desc: 'Find 10 pieces of gear.', test: S => (S.stats.gearFound || 0) >= 10 },
  { id: 'legend', name: 'The Stuff of Legend', desc: 'Find a legendary piece of gear.', test: S => (S.stats.legendaries || 0) >= 1 },
  { id: 'streak3', name: 'Habit Forming', desc: 'Reach a 3 day challenge streak.', test: S => ((S.chal && S.chal.best) || 0) >= 3 },
  { id: 'streak7', name: 'A Week of Valour', desc: 'Reach a 7 day challenge streak.', test: S => ((S.chal && S.chal.best) || 0) >= 7 },
  { id: 'trader', name: 'Merchant Prince', desc: 'Bring home 20 trade boats.', test: S => (S.stats.tradeTrips || 0) >= 20 },
  { id: 'joyful', name: 'A Joyful Realm', desc: 'Welcome 5 newcomers drawn by your happy realm.', test: S => (S.stats.newcomers || 0) >= 5 },
  { id: 'crown', name: 'The Drowned Crown', desc: 'Finish the story and claim the crown of the Sea Kings.', test: S => !!(S.relics && S.relics.seacrown) },
  { id: 'promoted', name: 'Rise, Sir Knight', desc: 'Promote a soldier.', test: S => (S.stats.promotions || 0) >= 1 },
  { id: 'abyss10', name: 'Into the Deep', desc: 'Clear floor 10 of the Abyss.', test: S => ((S.abyss && S.abyss.best) || 0) >= 10 },
  { id: 'abyss25', name: 'Bottomless', desc: 'Clear floor 25 of the Abyss.', test: S => ((S.abyss && S.abyss.best) || 0) >= 25 },
  { id: 'seasonboss', name: 'Season Slayer', desc: 'Beat a seasonal boss.', test: S => (S.stats.seasonBosses || 0) >= 1 },
  { id: 'founder', name: 'A New Beginning', desc: 'Found a realm with a hero from the last one.', test: S => (S.soldiers || []).some(s => s.founder) },
  { id: 'squads', name: 'Under the Banner', desc: 'Raise a squad and give it members.', test: S => (S.squads || []).some(q => q.members.length) },
  { id: 'gardener', name: 'Gardener', desc: 'Place 10 decorations.', test: S => (S.stats.decor || 0) >= 10 },
  { id: 'mover', name: 'Town Planner', desc: 'Move a building.', test: S => (S.stats.moves || 0) >= 1 },
  { id: 'weekly', name: 'Week Won', desc: 'Complete a weekly challenge.', test: S => (S.stats.weeklyChallenges || 0) >= 1 },
  { id: 'annex', name: 'Land Grabber', desc: 'Annex new land to your island.', test: S => (S.annexed || []).length >= 1 },
];
export function checkFeats(R) {
  const S = R.state; S.feats = S.feats || {};
  for (const f of FEATS) {
    if (S.feats[f.id]) continue;
    let ok = false; try { ok = f.test(S, R); } catch (e) { ok = false; }
    if (ok) {
      S.feats[f.id] = Date.now();
      const g = 50 + Object.keys(S.feats).length * 25;
      R.addRes('gold', g);
      R.ui.banner('Feat unlocked: ' + f.name, `${f.desc} (+${g} gold)`, 'gold');
      audio.play('levelup');
      R.log(`Feat unlocked: ${f.name}.`);
    }
  }
}
