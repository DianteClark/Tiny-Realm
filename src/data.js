// All balance numbers and content definitions live here.

export const RES = ['gold', 'wood', 'meat'];

// ---------- player units ----------
// range in tiles; speed px/s; cd seconds between attacks; hit = fraction of the attack anim where damage lands
export const UNITS = {
  pawn: { name: 'Pawn', hp: 40, speed: 72, worker: true, cost: { meat: 25 }, time: 12, from: 'castle', tier: 1, pop: 1, anim: 'pawn', desc: 'Gathers wood, gold and meat, and raises buildings.' },
  warrior: { name: 'Warrior', hp: 130, dmg: 14, range: 0.95, cd: 1.0, speed: 74, cost: { gold: 15, meat: 25 }, time: 20, from: 'barracks', tier: 1, pop: 1, anim: 'warrior', avatar: 'h1', hit: 0.5, desc: 'Sturdy shield fighter. Blocks a share of every blow.', armor: 0.15 },
  archer: { name: 'Archer', hp: 75, dmg: 11, range: 5, cd: 1.35, speed: 72, cost: { gold: 20, wood: 30 }, time: 22, from: 'archery', tier: 1, pop: 1, anim: 'archer', avatar: 'h3', hit: 0.55, proj: 'arrow', desc: 'Ranged. Gains extra range on high ground.' },
  lancer: { name: 'Lancer', hp: 160, dmg: 19, range: 1.4, cd: 1.3, speed: 78, cost: { gold: 35, meat: 30, wood: 10 }, time: 30, from: 'barracks', tier: 2, pop: 1, anim: 'lancer', avatar: 'h2', hit: 0.5, desc: 'Long reach. Deals bonus damage to large monsters.', bigBonus: 0.5 },
  monk: { name: 'Monk', hp: 70, heal: 24, range: 3.5, cd: 2.0, speed: 68, cost: { gold: 45, meat: 15 }, time: 32, from: 'monastery', tier: 2, pop: 1, anim: 'monk', avatar: 'h4', hit: 0.6, desc: 'Heals the most wounded ally in reach.' },
  swordsman: { name: 'Swordsman', hp: 210, dmg: 24, range: 1.1, cd: 1.2, speed: 72, cost: { gold: 60, meat: 45 }, time: 40, from: 'barracks', tier: 3, pop: 1, anim: 'swordsman', hit: 0.55, cleave: 0.5, desc: 'Heavy blade. Cleaves nearby foes for half damage.', avatar: 'swordsman' },
  berserker: { name: 'Berserker', hp: 175, dmg: 28, range: 1.0, cd: 0.85, speed: 82, cost: { gold: 70, meat: 55 }, time: 40, from: 'barracks', tier: 3, pop: 1, anim: 'berserker', hit: 0.5, rage: true, desc: 'Hits harder the more wounded he is.', avatar: 'berserker' },
  horseman: { name: 'Horseman', hp: 250, dmg: 27, range: 1.2, cd: 1.1, speed: 118, cost: { gold: 110, meat: 70, wood: 30 }, time: 55, from: 'barracks', tier: 4, pop: 2, anim: 'horseman', hit: 0.5, charge: true, desc: 'Fast rider. First strike after a charge deals double damage.', avatar: 'horseman' },
  catapult: { name: 'Catapult', hp: 190, dmg: 55, range: 7, minRange: 1.5, cd: 4.2, speed: 44, cost: { gold: 120, wood: 140 }, time: 60, from: 'archery', tier: 4, pop: 2, anim: 'catapult', hit: 0.45, proj: 'stone', splash: 1.3, siege: true, desc: 'Hurls stones that crush groups and enemy camps.', avatar: 'catapult' },
  king: { name: 'King', hp: 420, dmg: 34, range: 1.0, cd: 1.0, speed: 76, cost: { gold: 300, meat: 100 }, time: 30, from: 'crown', tier: 5, pop: 0, anim: 'king', hit: 0.5, unique: true, aura: 0.15, desc: 'Your sovereign. Allies near him deal 15% more damage. If struck down he is carried home wounded, never slain.', avatar: 'king' },
};
export const SOLDIER_TYPES = Object.keys(UNITS).filter(k => k !== 'pawn');

// ---------- monsters ----------
export const ENEMIES = {
  torchgoblin: { name: 'Torch Goblin', hp: 60, dmg: 9, range: 0.9, cd: 1.1, speed: 76, hit: 0.55, burn: true, cost: 1, xp: 6, gold: 4 },
  speargoblin: { name: 'Spear Goblin', hp: 80, dmg: 12, range: 1.4, cd: 1.2, speed: 72, hit: 0.5, cost: 1.4, xp: 8, gold: 5 },
  pigrider: { name: 'Pig Rider', minLevel: 3, hp: 150, dmg: 18, range: 1.4, cd: 1.3, speed: 112, hit: 0.5, cost: 3, xp: 16, gold: 10, big: true },
  gnome: { name: 'Gnome', hp: 45, dmg: 7, range: 0.9, cd: 0.9, speed: 88, hit: 0.5, cost: 0.7, xp: 4, gold: 3 },
  slinggnome: { name: 'Slingshot Gnome', hp: 40, dmg: 8, range: 4.5, cd: 1.5, speed: 80, hit: 0.6, proj: 'acorn', cost: 1, xp: 6, gold: 4 },
  gnoll: { name: 'Gnoll', hp: 75, dmg: 11, range: 4, cd: 1.6, speed: 70, hit: 0.6, proj: 'bone', cost: 1.4, xp: 8, gold: 5 },
  skull: { name: 'Skull Warrior', hp: 70, dmg: 11, range: 0.9, cd: 1.0, speed: 70, hit: 0.5, cost: 1.1, xp: 6, gold: 3 },
  thief: { name: 'Thief', hp: 55, dmg: 6, range: 0.9, cd: 1.0, speed: 108, hit: 0.5, thief: true, cost: 1.2, xp: 8, gold: 6 },
  lizard: { name: 'Lizard', hp: 95, dmg: 13, range: 1.0, cd: 1.1, speed: 78, hit: 0.5, cost: 1.5, xp: 9, gold: 5 },
  snake: { name: 'Snake', hp: 55, dmg: 10, range: 0.9, cd: 0.8, speed: 84, hit: 0.5, cost: 1, xp: 6, gold: 3 },
  spider: { name: 'Spider', hp: 80, dmg: 12, range: 0.9, cd: 1.0, speed: 92, hit: 0.5, cost: 1.3, xp: 8, gold: 4 },
  bear: { name: 'Bear', hp: 300, dmg: 24, range: 1.1, cd: 1.4, speed: 70, hit: 0.5, big: true, cost: 5, xp: 30, gold: 20 },
  panda: { name: 'Panda Master', hp: 340, dmg: 20, range: 1.1, cd: 0.8, speed: 74, hit: 0.5, big: true, cost: 6, xp: 34, gold: 24 },
  turtle: { name: 'Turtle', hp: 460, dmg: 18, range: 1.1, cd: 1.5, speed: 48, hit: 0.5, big: true, armorRanged: 0.5, cost: 6, xp: 36, gold: 24 },
  minotaur: { name: 'Minotaur', hp: 950, dmg: 42, range: 1.4, cd: 1.6, speed: 66, hit: 0.55, big: true, boss: true, splash: 1.2, cost: 18, xp: 120, gold: 120 },
  troll: { name: 'Troll', hp: 950, dmg: 34, range: 1.6, cd: 2.8, speed: 52, hit: 0.5, big: true, boss: true, splash: 1.0, windup: true, cost: 25, xp: 180, gold: 180 },
  harpoonshark: { name: 'Harpoon Shark', hp: 80, dmg: 12, range: 4.5, cd: 1.6, speed: 74, hit: 0.6, proj: 'harpoon', cost: 1.4, xp: 8, gold: 5 },
  paddleshark: { name: 'Paddle Shark', hp: 95, dmg: 13, range: 0.95, cd: 1.1, speed: 76, hit: 0.5, cost: 1.3, xp: 8, gold: 5 },
  bombfish: { name: 'Bomb Fish', hp: 60, dmg: 26, range: 4, cd: 2.6, speed: 70, hit: 0.6, proj: 'bomb', splash: 1.1, cost: 1.8, xp: 10, gold: 6 },
  imp: { name: 'Imp', hp: 55, dmg: 9, range: 0.9, cd: 0.9, speed: 92, hit: 0.5, flying: true, cost: 1, xp: 6, gold: 4 },
  bat: { name: 'Giant Bat', hp: 65, dmg: 9, range: 0.9, cd: 1.0, speed: 96, hit: 0.5, flying: true, cost: 1.1, xp: 6, gold: 3 },
  bee: { name: 'Bumblebee', hp: 30, dmg: 5, range: 0.8, cd: 0.8, speed: 110, hit: 0.5, flying: true, cost: 0.5, xp: 3, gold: 1 },
  shaman: { name: 'Hex Shaman', minLevel: 4, hp: 140, dmg: 14, range: 4.5, cd: 1.8, speed: 64, hit: 0.6, proj: 'hexBolt', caster: true, cost: 5, xp: 40, gold: 30 },
};

// ---------- buildings ----------
// fw/fh footprint in tiles. img drawn bottom-centered on the footprint.
export const BUILDINGS = {
  castle: { name: 'Castle', img: 'b_Castle', fw: 5, fh: 2, hp: 1500, unique: true, desc: 'Heart of the realm. Stores resources, trains pawns, and holds your banner.' },
  house: { name: 'House', imgs: ['b_House1', 'b_House2', 'b_House3'], fw: 2, fh: 1, hp: 300, cost: { wood: 40 }, time: 25, pop: 5, desc: 'Room for 5 more of your people.' },
  barracks: { name: 'Barracks', img: 'b_Barracks', fw: 3, fh: 2, hp: 600, cost: { wood: 80, gold: 30 }, time: 45, desc: 'Trains Warriors, Lancers, Swordsmen, Berserkers and Horsemen.' },
  archery: { name: 'Archery Range', img: 'b_Archery', fw: 3, fh: 2, hp: 550, cost: { wood: 90, gold: 30 }, time: 45, desc: 'Trains Archers and builds Catapults.' },
  monastery: { name: 'Monastery', img: 'b_Monastery', fw: 3, fh: 2, hp: 600, cost: { wood: 120, gold: 80 }, time: 70, desc: 'Trains Monks who heal your soldiers.' },
  wall: { name: 'Wooden Wall', img: 'fence', fw: 1, fh: 1, hp: 260, cost: { wood: 6 }, time: 3, wall: true, desc: 'Fence lines that raiders must hack through. Drag out a line to build many at once.' },
  gate: { name: 'Gate', img: 'fence', fw: 1, fh: 1, hp: 450, cost: { wood: 20 }, time: 6, wall: true, gate: true, desc: 'A gap your people walk through. Swings shut whenever foes come close. Place it on a wall to convert it.' },
  lantern: { name: 'Lantern Post', img: 'fence', fw: 1, fh: 1, hp: 120, cost: { wood: 20, gold: 10 }, time: 5, lantern: true, desc: 'Lights up the night. Pawns within 5 tiles keep working at full pace after dark.' },
  tavern: { name: 'Tavern', img: 'b_Tavern', fw: 2, fh: 1, hp: 380, cost: { wood: 110, gold: 50 }, time: 45, need: true, desc: 'Drink and company for 15 people. Once a day a wandering hero stops by, ready to be hired.' },
  market: { name: 'Market', img: 'b_Market', fw: 2, fh: 1, hp: 380, cost: { wood: 140, gold: 70 }, time: 55, need: true, desc: 'Goods for 15 people, a fixed-price exchange, and trade boats to your vassals and provinces.' },
  chapel: { name: 'Chapel', img: 'b_Chapel', fw: 3, fh: 2, hp: 650, cost: { wood: 160, gold: 120 }, time: 70, need: true, desc: 'Faith and rest for 20 people. Soldiers at home heal twice as fast, and holy days give twice the gifts.' },
  bush: { name: 'Bush', img: 'bush1', fw: 1, fh: 1, hp: 50, cost: { wood: 8 }, time: 1, decor: ['bush1', 'bush2', 'bush3', 'bush4'], desc: 'A bit of green. Every decoration makes your people a little happier.' },
  rock: { name: 'Rock', img: 'rock1', fw: 1, fh: 1, hp: 50, cost: { wood: 5, gold: 5 }, time: 1, decor: ['rock1', 'rock2', 'rock3', 'rock4'], desc: 'A handsome stone. Every decoration makes your people a little happier.' },
  stump: { name: 'Stump', img: 'stump1', fw: 1, fh: 1, hp: 50, cost: { wood: 6 }, time: 1, decor: ['stump1', 'stump2', 'stump3', 'stump4'], desc: 'A tree stump to sit on. Every decoration makes your people a little happier.' },
  tower: { name: 'Watchtower', img: 'b_Tower', fw: 2, fh: 1, hp: 700, cost: { wood: 100, gold: 40 }, time: 60, defense: { dmg: 12, range: 5.5, cd: 1.4 }, desc: 'A posted archer shoots raiders. Higher ground gives longer range.' },
};

// ---------- kingdom tiers ----------
export const TIERS = [
  null,
  { name: 'Hamlet', storage: 400, squad: 4, castleHp: 1500, limits: { house: 3, barracks: 1, archery: 1, tower: 1, monastery: 0, tavern: 1, market: 0, chapel: 0 } },
  { name: 'Village', storage: 1200, squad: 6, castleHp: 2400, cost: { gold: 250, wood: 300, meat: 120 }, time: 180, limits: { house: 6, barracks: 1, archery: 1, tower: 2, monastery: 1, tavern: 1, market: 1, chapel: 1 } },
  { name: 'Castle', storage: 3000, squad: 8, castleHp: 3600, cost: { gold: 800, wood: 900, meat: 400 }, time: 600, limits: { house: 9, barracks: 2, archery: 2, tower: 4, monastery: 1, tavern: 2, market: 1, chapel: 1 } },
  { name: 'Stronghold', storage: 7000, squad: 10, castleHp: 5200, cost: { gold: 2000, wood: 2200, meat: 1000 }, time: 1800, limits: { house: 12, barracks: 2, archery: 2, tower: 6, monastery: 2, tavern: 2, market: 2, chapel: 2 } },
  { name: 'Kingdom', storage: 16000, squad: 12, castleHp: 7500, cost: { gold: 5000, wood: 5000, meat: 2500 }, time: 3600, limits: { house: 16, barracks: 3, archery: 3, tower: 8, monastery: 2, tavern: 3, market: 2, chapel: 2 } },
];
// Endless Renown ranks after Kingdom
export function renownCost(rank) {
  const f = Math.pow(1.35, rank);
  return { gold: Math.round(4000 * f), wood: Math.round(4000 * f), meat: Math.round(2000 * f) };
}
export const RENOWN_BONUS = { gather: 0.04, power: 0.03 };

// ---------- traits ----------
export const TRAITS = {
  brave: { name: 'Brave', desc: '+12% damage', dmg: 0.12 },
  sturdy: { name: 'Sturdy', desc: '+15% health', hp: 0.15 },
  swift: { name: 'Swift', desc: '+15% speed', speed: 0.15 },
  keen: { name: 'Keen-eyed', desc: '+1 range for ranged units', range: 1 },
  lucky: { name: 'Lucky', desc: '12% chance to dodge', dodge: 0.12 },
  bloodthirsty: { name: 'Bloodthirsty', desc: 'Heals 15 on each kill', killHeal: 15 },
  cautious: { name: 'Cautious', desc: '+10% health, -5% damage', hp: 0.1, dmg: -0.05 },
  reckless: { name: 'Reckless', desc: '+20% damage, -10% health', dmg: 0.2, hp: -0.1 },
  quick: { name: 'Quick Hands', desc: 'Attacks 12% faster', cd: -0.12 },
  ironhide: { name: 'Ironhide', desc: 'Takes 10% less damage', armor: 0.1 },
  giantslayer: { name: 'Giant Slayer', desc: '+30% damage to large monsters', bigDmg: 0.3 },
  veteran: { name: 'Veteran', desc: '+20% experience earned', xp: 0.2 },
  champion: { name: 'Champion', desc: 'Bested a Minotaur. +15% damage and health', dmg: 0.15, hp: 0.15, rare: true },
  trollbane: { name: 'Trollbane', desc: 'Felled a Troll. +25% damage to large monsters', bigDmg: 0.25, rare: true },
};
export const COMMON_TRAITS = Object.keys(TRAITS).filter(k => !TRAITS[k].rare);

export const XP_LEVELS = [0, 0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100, 2900, 3900, 5100, 6600, 8400];
// 3.5 promotions: level 10 soldiers can be promoted once; promoted soldiers can reach level 15
export const levelCap = rec => (rec && rec.promoted ? 15 : 10);
export const PROMOTIONS = {
  warrior: [{ to: 'swordsman', title: 'Knight', desc: 'Becomes a Swordsman: a heavy blade that cleaves, and the Whirlwind ability.' }, { to: 'berserker', title: 'Berserker', desc: 'Becomes a Berserker: fast, furious strikes and the Bloodrage ability.' }],
  lancer: [{ to: 'horseman', title: 'Cavalier', desc: 'Becomes a Horseman: fast charges and the Trample ability.' }],
};
export const PROMO_COST = { gold: 600, meat: 300 };
export const ELITE = { hp: 0.2, dmg: 0.2 };
export const MAX_LEVEL = 10;
export const LEVEL_BONUS = 0.08; // per level above 1, to hp and damage

// ---------- relics (permanent bonuses) ----------
export const RELICS = {
  trolltusk: { name: 'Troll Tusk', desc: '+10% melee damage for all soldiers' },
  minotaurhorn: { name: 'Minotaur Horn', desc: '+10% health for all soldiers' },
  sharktooth: { name: 'Shark Tooth', desc: '+10% ranged damage' },
  hexcharm: { name: 'Hex Charm', desc: 'Curses last half as long' },
  goldenacorn: { name: 'Golden Acorn', desc: '+10% gold gathered' },
  boneidol: { name: 'Bone Idol', desc: 'Watchtowers deal 25% more damage' },
  rubberduck: { name: 'Lucky Rubber Duck', desc: '+5% to everything gathered. Quack.' },
  bearpelt: { name: 'Bear Pelt', desc: '+10% wood gathered' },
  pandabelt: { name: 'Panda Sash', desc: 'Soldiers attack 5% faster' },
  turtleshell: { name: 'Turtle Shell', desc: 'Castle has 20% more health' },
  moonstone: { name: 'Moonstone', desc: 'Soldiers deal 15% more damage at night' },
  seacrown: { name: 'Crown of the Sea Kings', desc: '+10% health and damage for all soldiers, +10% to everything gathered' },
};

// ---------- expedition regions ----------
export const REGIONS = [
  { key: 'goblin', name: 'Goblin Shore', colors: [4, 2, 3], enemies: ['torchgoblin', 'speargoblin', 'torchgoblin', 'pigrider'], camp: 'goblinHut', boss: 'bear', bossRelic: 'bearpelt' },
  { key: 'gnome', name: 'Gnome Woods', colors: [3, 2, 1], enemies: ['gnome', 'slinggnome', 'gnome', 'gnoll'], camp: 'gnomeHut', camp2: 'gnomeTower', boss: 'panda', bossRelic: 'pandabelt' },
  { key: 'badlands', name: 'Gnoll Badlands', colors: [4, 1, 2], enemies: ['gnoll', 'lizard', 'snake', 'spider'], camp: 'cave', boss: 'minotaur', bossRelic: 'minotaurhorn' },
  { key: 'reef', name: 'Shark Reef', colors: [5, 3, 1], enemies: ['paddleshark', 'harpoonshark', 'bombfish', 'paddleshark'], camp: 'fishHut', camp2: 'pirateTower', boss: 'turtle', bossRelic: 'turtleshell' },
  { key: 'crypt', name: 'Skull Crypts', colors: [2, 5, 4], enemies: ['skull', 'bat', 'imp', 'skull', 'shaman'], camp: 'skullSpike', camp2: 'deadTree', boss: 'troll', bossRelic: 'trolltusk' },
];

export const CAMP_STRUCTS = {
  goblinHut: { name: 'Goblin Hut', sprite: 'goblinHut', hp: 400, fw: 2, fh: 1, anim: true },
  gnomeHut: { name: 'Gnome Hut', sprite: 'gnomeHut', hp: 260, fw: 2, fh: 1 },
  gnomeTower: { name: 'Gnome Tower', sprite: 'gnomeTower', hp: 380, fw: 2, fh: 1, shoots: 'acorn' },
  cave: { name: 'Gnoll Den', sprite: 'cave', hp: 500, fw: 2, fh: 1, anim: true },
  fishHut: { name: 'Fish Hut', sprite: 'fishHut', hp: 350, fw: 2, fh: 1, anim: true },
  pirateTower: { name: 'Pirate Tower', sprite: 'pirateTower', hp: 420, fw: 2, fh: 1, shoots: 'harpoon' },
  skullSpike: { name: 'Bone Totem', sprite: 'skullSpike1', hp: 250, fw: 1, fh: 1 },
  deadTree: { name: 'Hollow Tree', sprite: 'deadTree', hp: 500, fw: 2, fh: 1 },
};

const PRE = ['Grim', 'Mossy', 'Salt', 'Thorn', 'Ember', 'Gloom', 'Rattle', 'Crooked', 'Hollow', 'Wasp', 'Briar', 'Cinder', 'Ash', 'Bramble', 'Fang', 'Murk', 'Rust', 'Pebble', 'Squall', 'Raven'];
const SUF = ['holm', 'reach', 'isle', 'crag', 'hollow', 'point', 'fen', 'skerry', 'rock', 'cove', 'bluff', 'mire', 'shoal', 'spire', 'drift'];
export function islandName(n) {
  let h = (n * 2654435761) >>> 0;
  const a = PRE[h % PRE.length]; h = (h / PRE.length) >>> 0;
  const b = SUF[h % SUF.length];
  return a + b;
}
export function islandInfo(n) {
  const r = REGIONS[Math.floor((n - 1) / 5) % REGIONS.length];
  const cycle = Math.floor((n - 1) / (5 * REGIONS.length));
  const boss = n % 5 === 0;
  return { n, region: r, boss, level: n + cycle * 4, name: (cycle ? 'Deep ' : '') + islandName(n), cycle };
}

// ---------- names ----------
export const FIRST_NAMES = ['Aldric', 'Bram', 'Cedric', 'Dunstan', 'Edda', 'Fenna', 'Garrick', 'Hilde', 'Ivo', 'Jory', 'Kestrel', 'Leofric', 'Maude', 'Nell', 'Osric', 'Pell', 'Quinn', 'Rowan', 'Sabine', 'Tobin', 'Ulric', 'Vesna', 'Wynn', 'Yara', 'Bertram', 'Corwin', 'Dagny', 'Elric', 'Freya', 'Gideon', 'Halden', 'Isolde', 'Jasper', 'Keld', 'Linnea', 'Merrick', 'Odile', 'Percival', 'Ragna', 'Sigrid', 'Tamsin', 'Wendel', 'Alys', 'Brenna', 'Cormac', 'Darby', 'Esme', 'Fitz', 'Gwen', 'Hob', 'Ingrid', 'Lark', 'Mabel', 'Nils', 'Orla', 'Piers', 'Rook', 'Sten', 'Tilda', 'Wat'];
export const EPITHETS = ['the Bold', 'Ironfoot', 'the Quiet', 'Oakheart', 'the Red', 'Stonebrow', 'Quickstep', 'the Elder', 'Halfshield', 'Longreach', 'the Stubborn', 'Ashborn', 'Greycloak', 'the Lucky', 'Saltbeard', 'Thornwise', 'the Young', 'Barrelchest', 'Brightspear', 'the Patient'];

// ---------- chronicle quests ----------
// type: what stat or condition to check; n: target. reward: resources / relic.
export const QUESTS = [
  { id: 'q1', text: 'Put 3 pawns to work cutting wood', type: 'jobWood', n: 3, reward: { gold: 40 } },
  { id: 'q2', text: 'Build a House', type: 'built_house', n: 1, reward: { wood: 40, meat: 30 } },
  { id: 'q3', text: 'Train 2 more Pawns', type: 'trained_pawn', n: 2, reward: { meat: 40 } },
  { id: 'q4', text: 'Build a Barracks', type: 'built_barracks', n: 1, reward: { gold: 40, meat: 40 } },
  { id: 'q5', text: 'Train 3 Warriors', type: 'trained_warrior', n: 3, reward: { gold: 60 } },
  { id: 'q6', text: 'Survive a raid', type: 'raidsSurvived', n: 1, reward: { gold: 80, wood: 80 } },
  { id: 'q7', text: 'Build an Archery Range and train 2 Archers', type: 'trained_archer', n: 2, reward: { wood: 100 } },
  { id: 'q8', text: 'Clear your first island', type: 'islandsCleared', n: 1, reward: { gold: 120, meat: 80 } },
  { id: 'q9', text: 'Grow the hamlet into a Village', type: 'tier', n: 2, reward: { gold: 150, wood: 150, meat: 150 } },
  { id: 'q10', text: 'Build a Watchtower', type: 'built_tower', n: 1, reward: { gold: 100 } },
  { id: 'q11', text: 'Clear 3 islands', type: 'islandsCleared', n: 3, reward: { gold: 200, wood: 200 } },
  { id: 'q12', text: 'Build a Monastery', type: 'built_monastery', n: 1, reward: { meat: 200 } },
  { id: 'q13', text: 'Defeat the boss of island 5', type: 'islandsCleared', n: 5, reward: { gold: 400, meat: 200 } },
  { id: 'q14', text: 'Raise the Castle', type: 'tier', n: 3, reward: { gold: 500, wood: 500, meat: 300 } },
  { id: 'q15', text: 'Crown your King', type: 'trained_king', n: 1, reward: { gold: 300 } },
  { id: 'q16', text: 'Survive 10 raids', type: 'raidsSurvived', n: 10, reward: { gold: 600, wood: 600 } },
  { id: 'q17', text: 'Slay a Troll', type: 'trollsSlain', n: 1, reward: { gold: 800, meat: 400 } },
  { id: 'q18', text: 'Fortify into a Stronghold', type: 'tier', n: 4, reward: { gold: 1200, wood: 1200, meat: 600 } },
  { id: 'q19', text: 'Clear 15 islands', type: 'islandsCleared', n: 15, reward: { gold: 1500, wood: 1500 } },
  { id: 'q20', text: 'Be crowned: become a Kingdom', type: 'tier', n: 5, reward: { gold: 3000, wood: 3000, meat: 1500 } },
];
// After the list runs out, endless quests are generated
export function endlessQuest(i) {
  const k = i - QUESTS.length;
  const kinds = [
    { type: 'islandsCleared', base: 20, step: 5, text: n => `Clear ${n} islands` },
    { type: 'raidsSurvived', base: 15, step: 5, text: n => `Survive ${n} raids` },
    { type: 'renown', base: 1, step: 1, text: n => `Reach Renown rank ${n}` },
  ];
  const kind = kinds[k % kinds.length];
  const n = kind.base + Math.floor(k / kinds.length) * kind.step;
  const s = 1 + k * 0.25;
  return { id: 'e' + k, text: kind.text(n), type: kind.type, n, reward: { gold: Math.round(1500 * s), wood: Math.round(1500 * s), meat: Math.round(800 * s) } };
}

export const STORY = {
  intro: 'An empty shore, a wooden hall, one house and three pawns. Two heroes who swore to build something here. The sea is full of monsters and other crowns. Grow this hamlet into a Kingdom.',
};

// ---------- building levels (2.0) ----------
// Highest level a building can reach at the current castle tier
export const maxBuildingLevel = tier => Math.min(5, tier + 1);
export function upgradeCost(type, level) { // cost to go from `level` to `level + 1`
  const base = BUILDINGS[type].cost || {};
  const f = 0.9 + level * 0.8;
  return { wood: Math.round((base.wood || 60) * f), gold: Math.round(((base.gold || 0) + 25) * f + 15 * level) };
}
export const upgradeTime = (type, level) => Math.round((BUILDINGS[type].time || 40) * (0.8 + level * 0.7));
export const levelHp = (type, level) => Math.round(BUILDINGS[type].hp * (1 + 0.3 * (level - 1)));
export function levelEffects(type, L) {
  if (type === 'tower') return { dmg: 1 + 0.35 * (L - 1), range: 0.75 * (L - 1), cd: 1 - 0.07 * (L - 1), shots: L >= 4 ? 2 : 1 };
  if (type === 'house') return { pop: 5 + 3 * (L - 1) };
  if (type === 'tavern' || type === 'market') return { serves: 15 + 8 * (L - 1), boats: L };
  if (type === 'chapel') return { serves: 20 + 10 * (L - 1) };
  if (type === 'barracks' || type === 'archery' || type === 'monastery') return { speed: 1 - 0.13 * (L - 1), recruit: L, queue: 4 + L };
  return {};
}
export function describeLevel(type, L) {
  const e = levelEffects(type, L);
  if (type === 'tower') return `x${e.dmg.toFixed(2)} damage, +${e.range} range, ${Math.round((1 - e.cd) * 100)}% faster${e.shots > 1 ? ', fires 2 arrows' : ''}`;
  if (type === 'house') return `houses ${e.pop} people`;
  if (type === 'market') return `serves ${e.serves} people, ${e.boats} trade boat${e.boats > 1 ? 's' : ''}`;
  if (e.serves) return `serves ${e.serves} people`;
  if (e.recruit) return `trains ${Math.round((1 - e.speed) * 100)}% faster, recruits start at level ${e.recruit}, queue of ${e.queue}`;
  return '';
}
export const castlePop = tier => 6 + tier * 2;

// ---------- hero abilities (3.0) ----------
// cd seconds, dur seconds for buffs. Triggered from the ability bar when units are selected.
export const ABILITIES = {
  warrior: { name: 'Shield Wall', cd: 25, dur: 6, desc: 'Takes 60% less damage for 6 seconds.' },
  archer: { name: 'Volley', cd: 20, desc: 'Rains 6 arrows on the nearest pack of foes.' },
  lancer: { name: 'Charge', cd: 18, dur: 4, desc: 'Doubles speed; the next 3 strikes deal double damage.' },
  monk: { name: 'Blessing', cd: 30, desc: 'Heals every ally within 4 tiles for 60.' },
  swordsman: { name: 'Whirlwind', cd: 16, desc: 'Strikes every foe around him for 1.6x damage.' },
  berserker: { name: 'Bloodrage', cd: 28, dur: 8, desc: 'Attacks 60% faster and heals from damage dealt.' },
  horseman: { name: 'Trample', cd: 22, dur: 3, desc: 'Gallops through foes, trampling each one.' },
  catapult: { name: 'Firestone', cd: 30, desc: 'The next stone bursts into flames that burn the area.' },
  king: { name: 'Rally', cd: 45, dur: 10, desc: 'Allies within 6 tiles deal 25% more damage and heal 20%.' },
};

// ---------- rival kingdoms (3.0) ----------
// Four rival houses in the pack's other team colours. They raid you, grow
// stronger over time, and can be conquered for tribute (and land).
export const RIVALS = [
  { key: 'red', color: 'Red', name: 'House Ember', ruler: 'Queen Brannagh', base: 3, unlock: { tier: 2 }, colors: [4, 1, 2], avatarRow: 6, motto: 'The fire remembers.' },
  { key: 'yellow', color: 'Yellow', name: 'House Sunhold', ruler: 'Lord Aurel', base: 5, unlock: { tier: 2, raids: 6 }, colors: [1, 2, 3], avatarRow: 11, motto: 'Gold buys every war.' },
  { key: 'purple', color: 'Purple', name: 'House Duskmere', ruler: 'the Twin Regents', base: 8, unlock: { tier: 3 }, colors: [2, 5, 3], avatarRow: 16, motto: 'We wait. We win.' },
  { key: 'black', color: 'Black', name: 'House Ashgrave', ruler: 'the Iron Widow', base: 11, unlock: { tier: 4 }, colors: [5, 2, 4], avatarRow: 21, motto: 'Ash to ash.' },
];
const RIVAL_UNITS = { warrior: 1.4, archer: 1.3, lancer: 2, monk: 1.6, swordsman: 2.6, berserker: 2.6, horseman: 3.5, king: 14 };
for (const r of RIVALS) {
  const house = r.name.split(' ')[1];
  for (const [u, cost] of Object.entries(RIVAL_UNITS)) {
    const d = UNITS[u];
    ENEMIES[`${r.key}_${u}`] = {
      name: `${house} ${d.name}`, hp: d.hp, dmg: d.dmg, heal: d.heal, range: d.range, cd: d.cd, speed: d.speed, hit: d.hit, proj: d.proj,
      armor: d.armor, cleave: d.cleave, rage: d.rage, charge: d.charge, big: u === 'horseman' || u === 'king', boss: u === 'king',
      anim: `${r.key}_${u}`, rival: r.key, cost, xp: Math.round(cost * 8), gold: Math.round(cost * 6), minLevel: { swordsman: 5, berserker: 5, horseman: 7, monk: 3 }[u] || 0,
    };
  }
  CAMP_STRUCTS[`${r.key}Castle`] = { name: `${house} Castle`, sprite: `b${r.key}_Castle`, hp: 1600, fw: 5, fh: 2, rival: r.key };
  CAMP_STRUCTS[`${r.key}Tower`] = { name: `${house} Tower`, sprite: `b${r.key}_Tower`, hp: 650, fw: 2, fh: 1, shoots: 'arrow', rival: r.key };
  CAMP_STRUCTS[`${r.key}Barracks`] = { name: `${house} Barracks`, sprite: `b${r.key}_Barracks`, hp: 700, fw: 3, fh: 2, rival: r.key };
  CAMP_STRUCTS[`${r.key}Wall`] = { name: `${house} Palisade`, sprite: 'fence', hp: 420, fw: 1, fh: 1, rival: r.key, wall: true, palisade: true };
  CAMP_STRUCTS[`${r.key}Gate`] = { name: `${house} Gate`, sprite: 'fence', hp: 320, fw: 1, fh: 1, rival: r.key, wall: true, palisade: true, gate: true };
  CAMP_STRUCTS[`${r.key}House`] = { name: `${house} House`, sprite: `b${r.key}_House1`, hp: 350, fw: 2, fh: 1, rival: r.key };
}
export const rivalDef = k => RIVALS.find(r => r.key === k);
// a raid party or garrison drawn from a rival's roster at a given level
export function rivalRoster(key, level) {
  const pool = ['warrior', 'archer', 'warrior', 'lancer', 'archer', 'monk', 'swordsman', 'berserker', 'horseman'].map(u => `${key}_${u}`);
  return pool.filter(k => (ENEMIES[k].minLevel || 0) <= level);
}

// ---------- provinces: annexed land grants a bonus by where it came from ----------
export const PROVINCES = {
  goblin: { name: 'Goblin Shore', bonus: { gold: 0.08 }, desc: '+8% gold' },
  gnome: { name: 'Gnome Woods', bonus: { wood: 0.1 }, desc: '+10% wood' },
  badlands: { name: 'Gnoll Badlands', bonus: { gold: 0.1 }, desc: '+10% gold' },
  reef: { name: 'Shark Reef', bonus: { meat: 0.12 }, desc: '+12% meat' },
  crypt: { name: 'Skull Crypts', bonus: { towerDmg: 0.08, xp: 0.05 }, desc: '+8% tower damage, +5% experience' },
  rival: { name: 'Conquered capital', bonus: { gather: 0.04, hp: 0.03 }, desc: '+4% all gathering, +3% soldier health' },
  wilds: { name: 'Wild land', bonus: { gather: 0.02 }, desc: '+2% all gathering' },
};
export function provinceOf(label) {
  if (!label) return PROVINCES.wilds;
  if (PROVINCES[label]) return PROVINCES[label];
  if (String(label).startsWith('rival') || / House /.test(' ' + label + ' ')) return PROVINCES.rival;
  const byName = Object.values(PROVINCES).find(p => p.name === label);
  return byName || PROVINCES.wilds;
}
// night creatures join raids after dark
export const NIGHT_CREATURES = ['skull', 'bat', 'imp', 'skull', 'bat'];

// the full-moon beast: the Bear sprite, drawn larger
ENEMIES.trollking = { ...ENEMIES.troll, name: 'The Troll King', hp: 3400, dmg: 58, cd: 2.4, scale: 1.6, splash: 1.4, anim: 'troll', cost: 40, xp: 600, gold: 800 };
ENEMIES.moonbear = { ...ENEMIES.bear, name: 'Moonhide Bear', hp: 1300, dmg: 36, cd: 1.6, boss: true, big: true, splash: 1.1, anim: 'bear', scale: 1.5, cost: 20, xp: 160, gold: 160 };
