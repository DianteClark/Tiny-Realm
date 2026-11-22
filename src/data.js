// All balance numbers and content definitions live here.

export const RES = ['gold', 'wood', 'meat'];

// ---------- player units ----------
// range in tiles; speed px/s; cd seconds between attacks; hit = fraction of the attack anim where damage lands
export const UNITS = {
  pawn: { name: 'Pawn', hp: 40, speed: 72, worker: true, cost: { meat: 25 }, time: 12, from: 'castle', tier: 1, pop: 1, anim: 'pawn', desc: 'Gathers wood, gold and meat, and raises buildings.' },
  warrior: { name: 'Warrior', hp: 130, dmg: 14, range: 0.95, cd: 1.0, speed: 74, cost: { gold: 15, meat: 25 }, time: 20, from: 'barracks', tier: 1, pop: 1, anim: 'warrior', hit: 0.5, desc: 'Sturdy shield fighter. Blocks a share of every blow.', armor: 0.15, avatar: 'human' },
  archer: { name: 'Archer', hp: 75, dmg: 11, range: 5, cd: 1.35, speed: 72, cost: { gold: 20, wood: 30 }, time: 22, from: 'archery', tier: 1, pop: 1, anim: 'archer', hit: 0.55, proj: 'arrow', desc: 'Ranged. Gains extra range on high ground.', avatar: 'human' },
  lancer: { name: 'Lancer', hp: 160, dmg: 19, range: 1.4, cd: 1.3, speed: 78, cost: { gold: 35, meat: 30, wood: 10 }, time: 30, from: 'barracks', tier: 2, pop: 1, anim: 'lancer', hit: 0.5, desc: 'Long reach. Deals bonus damage to large monsters.', bigBonus: 0.5, avatar: 'human' },
  monk: { name: 'Monk', hp: 70, heal: 16, range: 3.5, cd: 2.0, speed: 68, cost: { gold: 45, meat: 15 }, time: 32, from: 'monastery', tier: 2, pop: 1, anim: 'monk', hit: 0.6, desc: 'Heals the most wounded ally in reach.', avatar: 'human' },
  swordsman: { name: 'Swordsman', hp: 210, dmg: 24, range: 1.1, cd: 1.2, speed: 72, cost: { gold: 60, meat: 45 }, time: 40, from: 'barracks', tier: 3, pop: 1, anim: 'swordsman', hit: 0.55, cleave: 0.5, desc: 'Heavy blade. Cleaves nearby foes for half damage.', avatar: 'swordsman' },
  berserker: { name: 'Berserker', hp: 175, dmg: 28, range: 1.0, cd: 0.85, speed: 82, cost: { gold: 70, meat: 55 }, time: 40, from: 'barracks', tier: 3, pop: 1, anim: 'berserker', hit: 0.5, rage: true, desc: 'Hits harder the more wounded he is.', avatar: 'berserker' },
  horseman: { name: 'Horseman', hp: 250, dmg: 27, range: 1.2, cd: 1.1, speed: 118, cost: { gold: 110, meat: 70, wood: 30 }, time: 55, from: 'barracks', tier: 4, pop: 2, anim: 'horseman', hit: 0.5, charge: true, desc: 'Fast rider. First strike after a charge deals double damage.', avatar: 'horseman' },
  catapult: { name: 'Catapult', hp: 190, dmg: 55, range: 7, minRange: 1.5, cd: 4.2, speed: 44, cost: { gold: 120, wood: 140 }, time: 60, from: 'archery', tier: 4, pop: 2, anim: 'catapult', hit: 0.45, proj: 'stone', splash: 1.3, siege: true, desc: 'Hurls stones that crush groups and enemy camps.', avatar: 'catapult' },
  king: { name: 'King', hp: 420, dmg: 34, range: 1.0, cd: 1.0, speed: 76, cost: { gold: 300, meat: 100 }, time: 30, from: 'castle', tier: 3, pop: 0, anim: 'king', hit: 0.5, unique: true, aura: 0.15, desc: 'Your sovereign. Allies near him deal 15% more damage. If struck down he is carried home wounded, never slain.', avatar: 'king' },
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
  troll: { name: 'Troll', hp: 1500, dmg: 58, range: 1.6, cd: 2.6, speed: 52, hit: 0.5, big: true, boss: true, splash: 1.5, windup: true, cost: 25, xp: 180, gold: 180 },
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
  tower: { name: 'Watchtower', img: 'b_Tower', fw: 2, fh: 1, hp: 700, cost: { wood: 100, gold: 40 }, time: 60, defense: { dmg: 12, range: 5.5, cd: 1.4 }, desc: 'A posted archer shoots raiders. Higher ground gives longer range.' },
};

// ---------- kingdom tiers ----------
export const TIERS = [
  null,
  { name: 'Village', storage: 400, squad: 4, castleHp: 1500, limits: { house: 3, barracks: 1, archery: 1, tower: 1, monastery: 0 } },
  { name: 'Town', storage: 1200, squad: 6, castleHp: 2400, cost: { gold: 250, wood: 300, meat: 120 }, time: 180, limits: { house: 6, barracks: 1, archery: 1, tower: 2, monastery: 1 } },
  { name: 'Stronghold', storage: 3000, squad: 8, castleHp: 3600, cost: { gold: 800, wood: 900, meat: 400 }, time: 600, limits: { house: 9, barracks: 2, archery: 2, tower: 4, monastery: 1 } },
  { name: 'Fortress', storage: 7000, squad: 10, castleHp: 5200, cost: { gold: 2000, wood: 2200, meat: 1000 }, time: 1800, limits: { house: 12, barracks: 2, archery: 2, tower: 6, monastery: 2 } },
  { name: 'Citadel', storage: 16000, squad: 12, castleHp: 7500, cost: { gold: 5000, wood: 5000, meat: 2500 }, time: 3600, limits: { house: 16, barracks: 3, archery: 3, tower: 8, monastery: 2 } },
];
// Endless Renown ranks after Citadel
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

export const XP_LEVELS = [0, 0, 30, 80, 160, 280, 450, 700, 1050, 1500, 2100];
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
};

// ---------- expedition regions ----------
export const REGIONS = [
  { key: 'goblin', name: 'Goblin Shore', flat: 4, high: 2, enemies: ['torchgoblin', 'speargoblin', 'torchgoblin', 'pigrider'], camp: 'goblinHut', boss: 'bear', bossRelic: 'bearpelt' },
  { key: 'gnome', name: 'Gnome Woods', flat: 3, high: 2, enemies: ['gnome', 'slinggnome', 'gnome', 'gnoll'], camp: 'gnomeHut', camp2: 'gnomeTower', boss: 'panda', bossRelic: 'pandabelt' },
  { key: 'badlands', name: 'Gnoll Badlands', flat: 4, high: 1, enemies: ['gnoll', 'lizard', 'snake', 'spider'], camp: 'cave', boss: 'minotaur', bossRelic: 'minotaurhorn' },
  { key: 'reef', name: 'Shark Reef', flat: 5, high: 3, enemies: ['paddleshark', 'harpoonshark', 'bombfish', 'paddleshark'], camp: 'fishHut', camp2: 'pirateTower', boss: 'turtle', bossRelic: 'turtleshell' },
  { key: 'crypt', name: 'Skull Crypts', flat: 2, high: 5, enemies: ['skull', 'bat', 'imp', 'skull', 'shaman'], camp: 'skullSpike', camp2: 'deadTree', boss: 'troll', bossRelic: 'trolltusk' },
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
  { id: 'q9', text: 'Raise the castle to a Town', type: 'tier', n: 2, reward: { gold: 150, wood: 150, meat: 150 } },
  { id: 'q10', text: 'Build a Watchtower', type: 'built_tower', n: 1, reward: { gold: 100 } },
  { id: 'q11', text: 'Clear 3 islands', type: 'islandsCleared', n: 3, reward: { gold: 200, wood: 200 } },
  { id: 'q12', text: 'Build a Monastery', type: 'built_monastery', n: 1, reward: { meat: 200 } },
  { id: 'q13', text: 'Defeat the boss of island 5', type: 'islandsCleared', n: 5, reward: { gold: 400, meat: 200 } },
  { id: 'q14', text: 'Raise the castle to a Stronghold', type: 'tier', n: 3, reward: { gold: 500, wood: 500, meat: 300 } },
  { id: 'q15', text: 'Crown your King', type: 'trained_king', n: 1, reward: { gold: 300 } },
  { id: 'q16', text: 'Survive 10 raids', type: 'raidsSurvived', n: 10, reward: { gold: 600, wood: 600 } },
  { id: 'q17', text: 'Slay a Troll', type: 'trollsSlain', n: 1, reward: { gold: 800, meat: 400 } },
  { id: 'q18', text: 'Raise the castle to a Fortress', type: 'tier', n: 4, reward: { gold: 1200, wood: 1200, meat: 600 } },
  { id: 'q19', text: 'Clear 15 islands', type: 'islandsCleared', n: 15, reward: { gold: 1500, wood: 1500 } },
  { id: 'q20', text: 'Raise the castle to a Citadel', type: 'tier', n: 5, reward: { gold: 3000, wood: 3000, meat: 1500 } },
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
  intro: 'A small island, three loyal pawns, and a castle with more ambition than walls. The sea is full of monsters. Make this a realm worth defending.',
};
