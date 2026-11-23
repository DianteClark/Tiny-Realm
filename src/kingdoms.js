// Living kingdoms (5.0). Every kingdom within reach of home has strength, wealth, a temper and a stance
// toward you. They grow, send war fleets against each other, seize islands, make and break treaties, send
// envoys, raid you when at war, and conquered vassals can rebel. Far-off kingdoms sleep until you near them.
import { RIVALS } from './data.js';

const REACH = 3400;          // kingdoms this close to home take part in the world's affairs
const TICK = 15;             // seconds between simulation steps
export const STANCES = { war: 'At war', peace: 'At peace', truce: 'Truce', ally: 'Allied', vassal: 'Your vassal' };
const TEMPER_REL = { warlike: -35, greedy: -10, cautious: 5, pious: 15 };
const TEMPER_WORD = { warlike: 'Warlike', greedy: 'Greedy', cautious: 'Cautious', pious: 'Pious' };
export const temperWord = t => TEMPER_WORD[t] || 'Proud';

export class Kingdoms {
  constructor(realm) { this.R = realm; this.t = 0; this.list = null; }
  get W() { return this.R.state.world; }
  get K() { const W = this.W; return W.k || (W.k = {}); }
  // every kingdom island in reach (cached; island objects come from the ocean's chunk cache)
  islands() {
    if (this.list) return this.list.map(id => this.R.sea.ocean.islandById(id)).filter(Boolean);
    const Z = this.R.sea, n = Math.ceil(REACH / 512) + 1, out = [];
    for (let cy = -n; cy <= n; cy++) for (let cx = -n; cx <= n; cx++) for (const is of Z.ocean.chunk(cx, cy).islands) if (is.kind === 'kingdom' && Math.hypot(is.x, is.y) <= REACH) out.push(is);
    this.list = out.map(i => i.id); return out;
  }
  // the state of one kingdom, created on first use from its island
  st(is) {
    const K = this.K; if (K[is.id]) return K[is.id];
    const temper = is.kingdom.temper, d = Math.hypot(is.x, is.y);
    const k = K[is.id] = { power: Math.round(is.level * 12 + 10 + (is.seed % 17)), wealth: 50 + is.level * 20, rel: TEMPER_REL[temper] ?? 0, stance: temper === 'warlike' && d < 2600 ? 'war' : 'peace', until: 0, owner: null, loyalty: 0, gifts: 0 };
    return k;
  }
  // great houses keep their own story (S.rivals); everything else lives here
  houseKey(is) { return is && is.house ? is.house : null; }
  stance(is) {
    if (!is || !is.kingdom) return 'peace';
    const S = this.R.state, h = this.houseKey(is);
    if (h) { const r = RIVALS.find(x => x.key === h); return S.rivals[h].subjugated ? 'vassal' : this.R.rivalUnlocked(r) ? (this.st(is).stance === 'truce' && this.st(is).until > Date.now() ? 'truce' : 'war') : 'peace'; }
    if (this.W.conquered[is.id]) return 'vassal';
    const lord = this.lord(is); if (lord !== is) return this.stance(lord);
    const k = this.st(is);
    if (k.stance === 'truce' && k.until && Date.now() > k.until) { k.stance = 'peace'; k.until = 0; this.news(`The truce with ${is.kingdom.name} has ended. There is peace, for now.`); }
    return k.stance;
  }
  // an island held by another kingdom answers to its conqueror
  lord(is) { const k = this.K[is.id]; if (k && k.owner) { const o = this.R.sea.ocean.islandById(k.owner); if (o && o !== is && !(this.K[o.id] && this.K[o.id].owner)) return o; } return is; }
  regardWord(is) { const r = this.st(this.lord(is)).rel; return r >= 50 ? 'Warm' : r >= 5 ? 'Friendly' : r > -20 ? 'Wary' : r > -50 ? 'Hostile' : 'Hateful'; }
  // kingdoms whose affairs you know of: near home or seen with your own eyes, nearest first
  known() { return this.islands().filter(is => this.near(is)).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)); }
  relation(is) { const s = this.stance(is); return s === 'war' ? 'enemy' : s === 'ally' || s === 'vassal' ? 'ally' : 'neutral'; }
  // the realm's own strength, for comparisons
  myPower() { const S = this.R.state, B = this.R.home ? this.R.home.buildings.filter(b => b.done && !b.def.decor) : []; return Math.round(S.soldiers.reduce((a, r) => a + 6 + r.level * 3 + (r.promoted ? 8 : 0) + (r.hero ? 6 : 0), 0) + S.tier * 15 + S.renown * 15 + B.reduce((a, b) => a + (b.type === 'tower' ? 8 : b.type === 'wall' || b.type === 'gate' ? 0.5 : 3), 0)); }
  strengthWord(is) {
    const p = this.st(is).power / Math.max(1, this.myPower());
    return p > 2 ? 'Far stronger than you' : p > 1.25 ? 'Stronger than you' : p > 0.8 ? 'About your match' : p > 0.5 ? 'Weaker than you' : 'Much weaker than you';
  }
  news(text, loud) {
    const W = this.W; W.news = W.news || []; W.news.unshift({ t: Date.now(), text }); W.news.length = Math.min(W.news.length, 40);
    this.R.log(text);
    if (loud && this.R.ui) this.R.ui.toast(text, 'gold');
  }
  // ---- the world turns
  update(dt) {
    if (!this.R.sea.ocean || !this.W) return;
    this.moveFleets(dt);
    this.t -= dt; if (this.t > 0) return; this.t = TICK;
    this.step(TICK, true);
  }
  // one step of the world: growth, ambition, rebellion; `live` sends visible fleets instead of instant results
  step(secs, live) {
    const W = this.W, isl = this.islands(), now = Date.now();
    for (const is of isl) {
      const k = this.st(is); if (k.owner) { if (Math.random() < secs / 21600) { k.owner = null; k.ownerK = null; if (is.origKingdom) { is.kingdom = is.origKingdom; is.origKingdom = null; } k.power = 20 + is.level * 10; if (this.near(is)) this.news(`${is.name} threw off its conquerors. ${is.kingdom.name} rules there again.`); } k.power = Math.min(20 + is.level * 15, k.power + secs * 0.01); continue; }
      const cap = this.W.conquered[is.id] ? 15 + is.level * 10 : 30 + is.level * 20; if (k.power < cap) k.power = Math.min(cap, k.power + (cap - k.power) * Math.min(1, secs / 5400) + secs * 0.004); k.wealth = Math.min(200 + is.level * 120, k.wealth + secs * 0.05 * is.level);
      const base = TEMPER_REL[is.kingdom.temper] ?? 0; k.rel += (base - k.rel) * Math.min(1, 0.00004 * secs); // grudges and friendships fade, slowly
      k.rel = Math.max(-100, Math.min(100, k.rel));
    }
    W.fleets = W.fleets || [];
    // ambition: warlike and greedy kingdoms go to war with weaker neighbours
    if (W.fleets.filter(f => !f.you).length < 3 && Math.random() < secs / 3600) {
      const atk = isl.filter(is => !this.st(is).owner && !this.houseKey(is) && ['warlike', 'greedy'].includes(is.kingdom.temper) && !this.W.conquered[is.id]);
      const a = atk[Math.floor(Math.random() * atk.length)];
      if (a) {
        const ka = this.st(a);
        const targets = isl.filter(is => is !== a && Math.hypot(is.x - a.x, is.y - a.y) < 1500 && this.st(is).power < ka.power * 1.1 && this.st(is).owner !== a.id && !(this.W.conquered[is.id] && this.stance(a) !== 'war'));
        const b = targets.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
        if (b) {
          if (live) { W.fleets.push({ from: a.id, to: b.id, x: a.x, y: a.y, t: 0 }); if (this.near(b)) this.news(`A war fleet of ${a.kingdom.name} sails against ${b.name}.`); }
          else this.battle(a, b, false);
        }
      }
    }
    // kingdoms at war with you near home send fleets against your island
    if (live && this.R.state.tier >= 2 && Math.random() < secs / 3600) {
      const foes = isl.filter(is => !this.houseKey(is) && !this.st(is).owner && this.stance(is) === 'war' && this.near(is) && Math.hypot(is.x, is.y) < 2200);
      const a = foes[Math.floor(Math.random() * foes.length)];
      if (a) this.launch(a, 'home', this.st(a).power * 0.5);
    }
    // neglected vassals grow restless
    for (const id of Object.keys(W.conquered || {})) {
      const is = this.R.sea.ocean.islandById(id); if (!is) continue;
      const k = this.st(is);
      k.loyalty = Math.max(-50, Math.min(100, k.loyalty + secs * (this.myPower() > k.power ? 0.004 : -0.01)));
      if (k.loyalty < -20 && Math.random() < secs / 1800) this.rebel(is);
    }
  }
  // a war fleet sets out against you: your island ('home') or one of your colonies
  launch(a, to, power) {
    const W = this.W; W.fleets = W.fleets || [];
    if (W.fleets.some(f => f.you && (f.to === to || f.from === a.id)) || W.fleets.filter(f => f.you).length >= 2) return false;
    const t = this.R.sea.ocean.islandById(to); if (!t) return false;
    W.fleets.push({ from: a.id, to, you: true, x: a.x, y: a.y, power: Math.round(power) });
    const where = to === 'home' ? 'your island' : t.name;
    this.news(`A war fleet of ${a.kingdom.name} sails against ${where}.`);
    if (this.R.ui) this.R.ui.banner('War fleet sighted', `${a.kingdom.name} sends a fleet against ${where}. Meet it at sea with your crew, or ${to === 'home' ? 'be ready on the shore' : 'trust the garrison'}.`, 'red');
    return true;
  }
  near(is) { return Math.hypot(is.x, is.y) < 2400 || this.R.sea.fog.isRevealed(is.x, is.y); }
  moveFleets(dt) {
    const W = this.W; if (!W.fleets || !W.fleets.length) return;
    const Z = this.R.sea;
    for (const f of [...W.fleets]) {
      const a = Z.ocean.islandById(f.from), b = Z.ocean.islandById(f.to); if (!a || !b) { W.fleets.splice(W.fleets.indexOf(f), 1); continue; }
      const dx = b.x - f.x, dy = b.y - f.y, L = Math.hypot(dx, dy), step = 40 * dt;
      if (f.you && this.stance(a) !== 'war') { W.fleets.splice(W.fleets.indexOf(f), 1); continue; } // peace was made: they turn back
      if (L <= b.r + 20) {
        if (f.you) {
          if (f.to === 'home') { if (this.R.war.landAtHome(f)) W.fleets.splice(W.fleets.indexOf(f), 1); }
          else { W.fleets.splice(W.fleets.indexOf(f), 1); this.R.colonies.raid(f.to, a, f.power, true); }
          continue;
        }
        W.fleets.splice(W.fleets.indexOf(f), 1); if (!(W.conquered[b.id] && this.stance(a) !== 'war')) this.battle(a, b, true); continue;
      }
      f.x += dx / L * step; f.y += dy / L * step; f.flip = dx < 0;
    }
  }
  battle(a, b, live) {
    const ka = this.st(a), kb = this.st(b), W = this.W;
    const defend = kb.power * (W.conquered[b.id] ? 1.2 : 1) * (this.houseKey(b) ? 1.5 : 1);
    const win = Math.random() < ka.power / (ka.power + defend);
    const show = this.near(b);
    if (win) {
      ka.power *= 0.8; kb.power *= 0.55;
      if (W.conquered[b.id]) { // they took one of yours
        delete W.conquered[b.id]; kb.loyalty = 0;
        ka.stance = 'war'; ka.rel = Math.max(-100, ka.rel - 40);
        kb.owner = a.id; kb.ownerK = { name: a.kingdom.name, color: a.kingdom.color, sigil: a.kingdom.sigil, ruler: a.kingdom.ruler, motto: a.kingdom.motto, temper: a.kingdom.temper };
        this.dress(b);
        this.news(`${a.kingdom.name} seized your vassal ${b.name}. They are at war with you now.`, true);
        if (this.R.ui && show && live) this.R.ui.banner('A vassal is lost', `${a.kingdom.name} stormed ${b.name} and took it from you.`, 'red');
      } else if (!this.houseKey(b)) {
        kb.owner = a.id; kb.ownerK = { name: a.kingdom.name, color: a.kingdom.color, sigil: a.kingdom.sigil, ruler: a.kingdom.ruler, motto: a.kingdom.motto, temper: a.kingdom.temper };
        this.dress(b);
        if (show) this.news(`${a.kingdom.name} seized ${b.name} from ${b.origKingdom.name}.`, live && this.R.seaOpen);
      } else if (show) this.news(`${a.kingdom.name} raided ${b.kingdom.name} and carried off plunder.`);
      ka.wealth += kb.wealth * 0.4; kb.wealth *= 0.6;
    } else {
      ka.power *= 0.6; kb.power *= 0.85;
      if (show) this.news(`${b.kingdom.name} beat back a war fleet of ${a.kingdom.name}.`);
    }
  }
  // an island that was taken shows its conqueror; give it back its own colours if it is ever freed
  dress(is) {
    const k = this.K[is.id]; if (!k || !k.owner || !k.ownerK || !is.kingdom) return;
    if (!is.origKingdom) is.origKingdom = is.kingdom;
    is.kingdom = { ...is.origKingdom, ...k.ownerK, id: is.origKingdom.id, realm: `taken from ${is.origKingdom.name}` };
  }
  rebel(is) {
    const W = this.W, k = this.st(is);
    delete W.conquered[is.id]; k.stance = 'war'; k.rel = -40; k.loyalty = 0; k.power = Math.max(k.power, this.myPower() * 0.6);
    this.news(`${is.kingdom.name} of ${is.name} has risen in rebellion. Their tribute stops.`, true);
    if (this.R.ui) this.R.ui.banner('Rebellion', `${is.name} throws off your rule. Win them back by force, or make peace.`, 'red');
  }
  // while you were away the world kept turning, without the fleets to watch
  catchUp(secs) {
    const steps = Math.min(48, Math.floor(secs / 600));
    const before = (this.W.news || []).length;
    for (let i = 0; i < steps; i++) this.step(600, false);
    return (this.W.news || []).length - before;
  }
  // kingdoms at war with you near home send raiding parties
  raider() {
    const isl = this.islands().filter(is => !this.houseKey(is) && this.stance(is) === 'war' && Math.hypot(is.x, is.y) < 2200 && !this.st(is).owner);
    return isl[Math.floor(Math.random() * isl.length)] || null;
  }
  onRaidBeaten(is) { if (is) { const k = this.st(is); k.power *= 0.85; k.rel -= 5; } }
  onConquered(is) { const k = this.st(is); k.power *= 0.4; k.pact = false; k.stance = 'vassal'; k.loyalty = 40; k.owner = null; k.ownerK = null; if (is.origKingdom) { is.kingdom = is.origKingdom; is.origKingdom = null; } }
  // ---- diplomacy
  giftCost() { return { gold: 80 + this.R.state.tier * 60 }; }
  act(is, what) {
    is = this.lord(is);
    const R = this.R, k = this.st(is), s = this.stance(is), name = is.kingdom.name, mine = this.myPower(), ratio = k.power / Math.max(1, mine);
    if (what === 'gift') {
      if (!R.pay(this.giftCost())) return 'Not enough gold for a fitting gift.';
      const gain = Math.max(4, 16 - k.gifts * 3); k.gifts++; k.rel = Math.min(100, k.rel + gain);
      return { ok: `${name} accepts your gift. Their regard for you rises.` };
    }
    if (what === 'truce') {
      if (s !== 'war') return 'You are not at war.';
      if (k.rel < -45 && ratio > 0.8) return `${name} refuses. They want you humbled first. Win a battle, or send gifts.`;
      k.stance = 'truce'; k.until = Date.now() + 2 * 3600000; k.rel += 10;
      if (this.houseKey(is)) R.state.rivals[this.houseKey(is)].truceUntil = k.until;
      return { ok: `${name} agrees to a truce of two hours. No raids will come from them.` };
    }
    if ((what === 'peace' || what === 'alliance') && this.houseKey(is)) return `The ${name} will never make a lasting peace. They bend the knee only to the sword.`;
    if (what === 'peace') {
      if (s !== 'truce' && s !== 'war') return 'You are not at war.';
      if (k.rel < 5) return `${name} does not trust you enough for a lasting peace. Their regard must be friendly.`;
      k.stance = 'peace'; k.until = 0; return { ok: `Peace is sealed with ${name}.` };
    }
    if (what === 'alliance') {
      if (s !== 'peace') return 'Make peace first.';
      if (k.rel < 50) return `${name} will not ally with a realm it barely trusts. Their regard must be warm.`;
      k.stance = 'ally'; R.state.stats.alliances = (R.state.stats.alliances || 0) + 1;
      return { ok: `${name} swears an alliance. They will send gifts, and their fleets will not trouble you.` };
    }
    if (what === 'demand') {
      if (s === 'vassal') return 'They already pay you.';
      if (ratio > 0.67) return `${name} laughs at the demand. You would need to be half again their strength.`;
      if ((k.demandAt || 0) > Date.now()) return `${name} paid you already. Ask again in ${Math.ceil((k.demandAt - Date.now()) / 60000)} minutes.`;
      const g = Math.round(20 + k.wealth * 0.4); k.wealth *= 0.6; R.addRes('gold', g); k.rel = Math.max(-100, k.rel - 25); k.demandAt = Date.now() + 3600000;
      if (s === 'ally') k.stance = 'peace';
      if (k.rel < -50 && s !== 'war') { k.stance = 'war'; k.pact = false; return { ok: `${name} pays ${g} gold, then declares war on you. They will not be bled again.` }; }
      return { ok: `${name} pays ${g} gold to keep you away, and will not forget it.` };
    }
    if (what === 'war') {
      if (s === 'war') return 'You are already at war.';
      if (s === 'vassal') return 'They are your vassals.';
      const broke = s === 'truce' || s === 'ally';
      k.stance = 'war'; k.until = 0; k.pact = false; k.rel = Math.min(k.rel, -50);
      if (this.houseKey(is)) R.state.rivals[this.houseKey(is)].truceUntil = 0;
      if (broke) { for (const o of this.islands()) if (o !== is) { const q = this.st(o); q.rel = Math.max(-100, q.rel - 10); } this.news(`You broke faith with ${name}. Every court on the sea has heard of it.`); }
      return { ok: `You declare war on ${name}.${broke ? ' Breaking your word has cost you the trust of every kingdom.' : ''}` };
    }
    return 'Nothing happens.';
  }
  // ---- envoys: a kingdom sends word with an offer or a threat
  envoy() {
    const R = this.R, isl = this.islands().filter(is => this.near(is) && !this.st(is).owner);
    if (!isl.length) return null;
    const is = isl[Math.floor(Math.random() * isl.length)], k = this.st(is), s = this.stance(is), name = is.kingdom.name, mine = this.myPower(), ratio = k.power / Math.max(1, mine);
    const t = is.kingdom.temper, tier = R.state.tier, h = this.houseKey(is);
    if (h) { // a great house only ever offers a truce, and only once the feud is open
      if (s !== 'war' || !(t === 'cautious' || t === 'pious' || ratio < 0.8)) return null;
      return { is, title: `An envoy from ${name}`, text: `${name} is weary of war and offers a truce of two hours.`, yes: 'Accept the truce', no: 'Send them away', onYes: () => { k.stance = 'truce'; k.until = Date.now() + 2 * 3600000; R.state.rivals[h].truceUntil = k.until; return `A truce with ${name}.`; } };
    }
    if (s === 'war' && (t === 'cautious' || t === 'pious' || ratio < 0.8)) return { is, title: `An envoy from ${name}`, text: `${name} is weary of war and offers a truce of two hours.`, yes: 'Accept the truce', no: 'Send them away', onYes: () => { k.stance = 'truce'; k.until = Date.now() + 2 * 3600000; k.rel += 10; return `A truce with ${name}.`; } };
    if (s === 'war' && t === 'greedy') { const g = 120 + tier * 80; return { is, title: `An envoy from ${name}`, text: `${name} will make peace for ${g} gold.`, yes: `Pay ${g} gold`, cost: { gold: g }, no: 'Refuse', onYes: () => { k.stance = 'peace'; k.rel += 20; return `Peace is bought with ${name}.`; } }; }
    if (s === 'peace' && t === 'warlike' && ratio > 1.2) { const g = 100 + tier * 90; return { is, title: `A demand from ${name}`, text: `${name} demands ${g} gold in tribute, or it will mean war.`, yes: `Pay ${g} gold`, cost: { gold: g }, no: 'Refuse: let them come', onYes: () => { k.rel += 5; return `You paid ${name}. For now they are content.`; }, onNo: () => { k.stance = 'war'; k.rel -= 30; return `${name} declares war on you.`; } }; }
    if (s === 'peace' && !k.pact && (t === 'greedy' || t === 'cautious')) return { is, title: `An envoy from ${name}`, text: `${name} proposes a trade pact: a share of their harbour dues, every hour, for as long as there is peace.`, yes: 'Seal the pact', no: 'Decline', onYes: () => { k.rel += 15; k.pact = true; return `A trade pact with ${name}. Their harbour dues arrive every hour.`; } };
    if (s === 'ally' && (k.giftAt || 0) < Date.now()) { k.giftAt = Date.now() + 3 * 3600000; const g = 60 + tier * 50; return { is, title: `A gift from ${name}`, text: `Your allies of ${name} send wagons of goods as a sign of friendship.`, yes: 'Accept with thanks', no: null, onYes: () => { R.addAll({ gold: g, wood: g, meat: g }); return `${name} sent ${g} each of gold, wood and meat.`; } }; }
    if (s === 'peace' && k.rel > 30) return { is, title: `An envoy from ${name}`, text: `${name} speaks warmly of your realm and asks whether you would consider an alliance.`, yes: 'Swear an alliance', no: 'Not now', onYes: () => { k.stance = 'ally'; k.rel += 10; R.state.stats.alliances = (R.state.stats.alliances || 0) + 1; return `An alliance with ${name}.`; } };
    if (s === 'vassal' && k.loyalty < 15) { const g = 80 + tier * 50; return { is, title: `Unrest in ${is.name}`, text: `Your vassals in ${is.name} grumble. ${g} gold for their lords would calm them.`, yes: `Pay ${g} gold`, cost: { gold: g }, no: 'Let them grumble', onYes: () => { k.loyalty += 35; return `${is.name} is calmer.`; }, onNo: () => { k.loyalty -= 15; return `${is.name} grows more restless.`; } }; }
    return null;
  }
}
