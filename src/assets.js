// Sprite manifest and loader. Every sheet is a horizontal strip of frames.
// fw/fh = frame size, foot = pixel row inside the frame where the feet touch
// the ground (used as the draw anchor), fps defaults to 10 (pack standard).

const F = 'assets/free/';
const U = F + 'Units/Blue Units/';
const W = 'assets/warfare/';
const E = 'assets/enemy/';

const sheets = {};
function S(key, src, fw, fh, foot, extra = {}) {
  sheets[key] = { key, src, fw, fh, foot: foot ?? Math.round(fh * 0.7), cx: extra.cx ?? fw / 2, fps: extra.fps ?? 10, frames: extra.frames ?? 0 };
}

// Terrain
for (let i = 1; i <= 5; i++) S('tiles' + i, F + `Terrain/Tileset/Tilemap_color${i}.png`, 64, 64, 0);
S('shadow', F + 'Terrain/Tileset/Shadow.png', 192, 192, 96);
S('foam', F + 'Terrain/Tileset/Water Foam.png', 192, 192, 96);
S('waterBg', F + 'Terrain/Tileset/Water Background color.png', 64, 64, 0);
for (let i = 1; i <= 4; i++) S('bush' + i, F + `Terrain/Decorations/Bushes/Bushe${i}.png`, 128, 128, 80);
for (let i = 1; i <= 4; i++) S('rock' + i, F + `Terrain/Decorations/Rocks/Rock${i}.png`, 64, 64, 48);
for (let i = 1; i <= 4; i++) S('wrock' + i, F + `Terrain/Decorations/Rocks in the Water/Water Rocks_0${i}.png`, 64, 64, 40);
for (let i = 1; i <= 8; i++) S('cloud' + i, F + `Terrain/Decorations/Clouds/Clouds_0${i}.png`, 576, 256, 128);
S('duck', F + 'Terrain/Decorations/Rubber Duck/Rubber duck.png', 32, 32, 24);

// Resources
S('tree1', F + 'Terrain/Resources/Wood/Trees/Tree1.png', 192, 256, 236);
S('tree2', F + 'Terrain/Resources/Wood/Trees/Tree2.png', 192, 256, 236);
S('tree3', F + 'Terrain/Resources/Wood/Trees/Tree3.png', 192, 192, 166);
S('tree4', F + 'Terrain/Resources/Wood/Trees/Tree4.png', 192, 192, 166);
for (let i = 1; i <= 4; i++) S('stump' + i, F + `Terrain/Resources/Wood/Trees/Stump ${i}.png`, 192, 256, 236);
for (let i = 1; i <= 6; i++) {
  S('gold' + i, F + `Terrain/Resources/Gold/Gold Stones/Gold Stone ${i}.png`, 128, 128, 80);
  S('goldHi' + i, F + `Terrain/Resources/Gold/Gold Stones/Gold Stone ${i}_Highlight.png`, 128, 128, 80);
}
S('woodItem', F + 'Terrain/Resources/Wood/Wood Resource/Wood Resource.png', 64, 64, 48);
S('meatItem', F + 'Terrain/Resources/Meat/Meat Resource/Meat Resource.png', 64, 64, 48);
S('goldItem', F + 'Terrain/Resources/Gold/Gold Resource/Gold_Resource.png', 128, 128, 84);
S('sheepIdle', F + 'Terrain/Resources/Meat/Sheep/Sheep_Idle.png', 128, 128, 84);
S('sheepMove', F + 'Terrain/Resources/Meat/Sheep/Sheep_Move.png', 128, 128, 84);
S('sheepGrass', F + 'Terrain/Resources/Meat/Sheep/Sheep_Grass.png', 128, 128, 84);

// Buildings (single images, anchored bottom-center)
for (const b of ['Castle', 'House1', 'House2', 'House3', 'Barracks', 'Archery', 'Monastery', 'Tower']) {
  S('b_' + b, F + `Buildings/Blue Buildings/${b}.png`, 0, 0, 0);
}
for (const b of ['Castle', 'House1', 'Tower', 'Barracks']) {
  S('br_' + b, F + `Buildings/Red Buildings/${b}.png`, 0, 0, 0);
}

// FX
S('dust1', F + 'Particle FX/Dust_01.png', 64, 64, 48);
S('dust2', F + 'Particle FX/Dust_02.png', 64, 64, 48);
S('explosion1', F + 'Particle FX/Explosion_01.png', 192, 192, 120);
S('explosion2', F + 'Particle FX/Explosion_02.png', 192, 192, 120);
S('fire1', F + 'Particle FX/Fire_01.png', 64, 64, 56);
S('fire2', F + 'Particle FX/Fire_02.png', 64, 64, 56);
S('fire3', F + 'Particle FX/Fire_03.png', 64, 64, 56);
S('splash', F + 'Particle FX/Water Splash.png', 192, 192, 110);
S('healFx', U + 'Monk/Heal_Effect.png', 192, 192, 135);

// Player units
const P = (k, path, fw, foot) => S(k, path, fw, fw, foot);
P('pawn_idle', U + 'Pawn/Pawn_Idle.png', 192, 134);
P('pawn_run', U + 'Pawn/Pawn_Run.png', 192, 134);
for (const t of ['Axe', 'Pickaxe', 'Knife', 'Hammer', 'Gold', 'Wood', 'Meat']) {
  P('pawn_idle_' + t, U + `Pawn/Pawn_Idle ${t}.png`, 192, 134);
  P('pawn_run_' + t, U + `Pawn/Pawn_Run ${t}.png`, 192, 134);
}
for (const t of ['Axe', 'Pickaxe', 'Knife', 'Hammer']) P('pawn_work_' + t, U + `Pawn/Pawn_Interact ${t}.png`, 192, 134);
P('warrior_idle', U + 'Warrior/Warrior_Idle.png', 192, 136);
P('warrior_run', U + 'Warrior/Warrior_Run.png', 192, 136);
P('warrior_attack', U + 'Warrior/Warrior_Attack1.png', 192, 136);
P('warrior_attack2', U + 'Warrior/Warrior_Attack2.png', 192, 136);
P('warrior_guard', U + 'Warrior/Warrior_Guard.png', 192, 136);
P('archer_idle', U + 'Archer/Archer_Idle.png', 192, 135);
P('archer_run', U + 'Archer/Archer_Run.png', 192, 135);
P('archer_attack', U + 'Archer/Archer_Shoot.png', 192, 135);
S('arrow', U + 'Archer/Arrow.png', 64, 64, 32);
P('monk_idle', U + 'Monk/Idle.png', 192, 133);
P('monk_run', U + 'Monk/Run.png', 192, 133);
P('monk_attack', U + 'Monk/Heal.png', 192, 133);
P('lancer_idle', U + 'Lancer/Lancer_Idle.png', 320, 197);
P('lancer_run', U + 'Lancer/Lancer_Run.png', 320, 197);
P('lancer_attack', U + 'Lancer/Lancer_Right_Attack.png', 320, 197);
P('lancer_attack_up', U + 'Lancer/Lancer_UpRight_Attack.png', 320, 197);
P('lancer_attack_down', U + 'Lancer/Lancer_DownRight_Attack.png', 320, 197);
P('lancer_guard', U + 'Lancer/Lancer_Right_Defence.png', 320, 197);

const WF = (unit, anim, fw, foot, file) =>
  P(unit.toLowerCase() + '_' + anim, W + `${unit}/${unit} Animations/${unit}_Blue/${unit}_${file}_Blue.png`, fw, foot);
WF('King', 'idle', 192, 136, 'Idle'); WF('King', 'run', 192, 136, 'Run'); WF('King', 'attack', 192, 136, 'Attack');
WF('Berserker', 'idle', 192, 137, 'Idle'); WF('Berserker', 'run', 192, 137, 'Run'); WF('Berserker', 'attack', 192, 137, 'Attack');
WF('Swordsman', 'idle', 320, 205, 'Idle'); WF('Swordsman', 'run', 320, 205, 'Run'); WF('Swordsman', 'attack', 320, 205, 'Attack');
WF('Horseman', 'idle', 320, 221, 'Idle'); WF('Horseman', 'run', 320, 221, 'Run'); WF('Horseman', 'attack', 320, 221, 'Attack');
WF('Catapult', 'idle', 256, 200, 'IdleWithStone'); WF('Catapult', 'run', 256, 200, 'MoveWithStone');
WF('Catapult', 'attack', 256, 200, 'FireStone'); WF('Catapult', 'load', 256, 200, 'LoadStone');
S('stone', W + 'Catapult/Stone Projectile/Stone_Spinning.png', 128, 128, 64);

// Avatars
for (let i = 1; i <= 25; i++) S('av_h' + i, F + `UI Elements/UI Elements/Human Avatars/Avatars_${String(i).padStart(2, '0')}.png`, 256, 256, 0);
for (const u of ['King', 'Berserker', 'Horseman']) for (let i = 1; i <= 5; i++) S(`av_${u.toLowerCase()}${i}`, W + `${u}/${u} Avatar/${u}_Avatar_0${i}.png`, 256, 256, 0);
for (let i = 1; i <= 5; i++) S('av_swordsman' + i, W + `Swordsman/Swordsman Avatar/Swordsman_Avatar_${i}.png`, 256, 256, 0);
for (let i = 1; i <= 5; i++) S('av_catapult' + i, W + `Catapult/Catapult Avatar/Cataput_Avatar_0${i}.png`, 256, 256, 0);

// Enemies: key, folder, file prefix, frame size, foot, anims {name: fileSuffix}
const enemyDefs = [
  ['torchgoblin', 'Torch Goblin', 192, 132, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['speargoblin', 'Spear Goblin', 256, 175, { idle: 'Idle', run: 'Run', attack: 'Attack Fast' }],
  ['gnome', 'Gnome', 192, 126, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['slinggnome', 'Slingshot Gnome', 192, 136, { idle: 'Idle', run: 'Run', attack: 'Shoot' }],
  ['gnoll', 'Gnoll', 192, 134, { idle: 'Idle', run: 'Walk', attack: 'Throw' }],
  ['skull', 'Skull', 192, 129, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['thief', 'Thief', 192, 131, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['lizard', 'Lizard', 192, 151, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['snake', 'Snake', 192, 122, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['spider', 'Spider', 192, 136, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['bear', 'Bear', 256, 176, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['panda', 'Panda', 256, 171, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['turtle', 'Turtle', 320, 207, { idle: 'Idle', run: 'Walk', attack: 'Attack' }],
  ['minotaur', 'Minotaur', 320, 213, { idle: 'Idle', run: 'Walk', attack: 'Attack' }],
  ['troll', 'Troll', 384, 296, { idle: 'Idle', run: 'Walk', attack: 'Attack', windup: 'Windup', recover: 'Recovery' }],
  ['harpoonshark', 'Harpoon Shark', 192, 135, { idle: 'Idle', run: 'Run', attack: 'Throw' }],
  ['paddleshark', 'Paddle Shark', 192, 133, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
  ['bombfish', 'Bomb Fish', 192, 134, { idle: 'Idle', run: 'Run', attack: 'Shoot' }],
  ['imp', 'Imp', 192, 151, { idle: 'Idle', run: 'Move', attack: 'Attack_Loop' }],
  ['bat', 'Giant Bat', 192, 142, { idle: 'Idle', run: 'Move', attack: 'Attack' }],
  ['bee', 'Bumblebee', 192, 152, { idle: 'Idle', run: 'Move', attack: 'Attack' }],
  ['shaman', 'Hex Shaman', 192, 136, { idle: 'Idle', run: 'Run', attack: 'Attack' }],
];
for (const [key, folder, fw, foot, anims] of enemyDefs) {
  for (const [a, file] of Object.entries(anims)) P(`${key}_${a}`, E + `${folder}/${folder}_${file}.png`, fw, foot);
  S(`av_${key}`, E + `${folder}/${folder === 'Minotaur' ? 'Minotaur_' : folder}_Avatar.png`, 256, 256, 0);
}
P('pigrider_idle', E + 'Extra/Pig Rider Spear Goblin/Pig Rider_Idle.png', 256, 180);
P('pigrider_run', E + 'Extra/Pig Rider Spear Goblin/Pig Rider_Run.png', 256, 180);
P('pigrider_attack', E + 'Extra/Pig Rider Spear Goblin/Pig Rider_Attack.png', 256, 180);
S('av_pigrider', E + 'Spear Goblin/Spear Goblin_Avatar.png', 256, 256, 0);
P('troll_dead', E + 'Extra/Troll Dead/Troll_Dead.png', 384, 296);
P('gnoll_hit', E + 'Extra/Gnoll Hit/Gnoll_Hit.png', 192, 134);
P('turtle_guard', E + 'Extra/Turtle Guard/Turtle_Guard_In.png', 320, 207);
P('minotaur_guard', E + 'Extra/Minotaur Guard/Minotaur_Guard.png', 320, 213);
P('skull_guard', E + 'Extra/Skull Guard/Skull_Guard.png', 192, 129);
P('pig_idle', E + 'Extra/Pig/Pig_Idle.png', 192, 133);
P('pig_run', E + 'Extra/Pig/Pig_Run.png', 192, 133);
S('bone', E + 'Gnoll/Gnoll_Bone.png', 64, 64, 32);
S('harpoon', E + 'Harpoon Shark/Harpoon.png', 64, 64, 32);
S('acorn', E + 'Slingshot Gnome/Acorn_Projectile.png', 64, 64, 32);
S('bomb', E + 'Bomb Fish/Bomb_Spinning.png', 128, 128, 64);
S('hexBolt', E + 'Hex Shaman/Hex Shaman_Projectile.png', 128, 128, 64);
S('hexBoom', E + 'Hex Shaman/Hex Shaman_Explosion.png', 128, 128, 80);
P('hexTransform', E + 'Extra/Hex Shaman Transformation Spell/Hex Shaman_Transformation Spell.png', 192, 136);
S('cannonBall', E + 'Extra/Cannon/Cannon_Ball.png', 128, 128, 64);

// Enemy structures and vessels
S('goblinHut', E + 'Extra/Goblin Hut/Goblin Hut.png', 256, 256, 240);
S('gnomeHut', E + 'Extra/Gnome Buildings/Gnome Hut.png', 0, 0, 0);
S('gnomeTower', E + 'Extra/Gnome Buildings/Gnome Tower.png', 0, 0, 0);
S('cave', E + 'Extra/Cave/Cave_Idle.png', 192, 192, 172);
S('fishHut', E + 'Extra/Fish Hut/Fish Hut.png', 192, 192, 177);
S('pirateTower', E + 'Extra/Pirate Tower/Pirate Tower_Ground.png', 0, 0, 0);
S('pirateTowerWater', E + 'Extra/Pirate Tower/Pirate Tower_Water.png', 128, 192, 178);
S('deadTree', E + 'Extra/Dead Tree/Dead Tree.png', 0, 0, 0);
for (let i = 1; i <= 3; i++) S('bones' + i, E + `Extra/Skull decorations/Bones_0${i}.png`, 64, 64, 44);
for (let i = 1; i <= 2; i++) S('skullSpike' + i, E + `Extra/Skull decorations/Skull Spike_0${i}.png`, 0, 0, 0);
S('boat', E + 'Extra/Boat/Boat_Idle.png', 256, 256, 180);
S('seahorse', E + 'Extra/Seahorse Boat/Seahorse Boat_Idle.png', 192, 192, 148);
S('sharkRow', E + 'Extra/Boat/Paddle Shark_Row.png', 192, 192, 148);

// UI
S('icon_hammer', F + 'UI Elements/UI Elements/Icons/Icon_01.png', 64, 64, 0);
S('icon_wood', F + 'UI Elements/UI Elements/Icons/Icon_02.png', 64, 64, 0);
S('icon_gold', F + 'UI Elements/UI Elements/Icons/Icon_03.png', 64, 64, 0);
S('icon_meat', F + 'UI Elements/UI Elements/Icons/Icon_04.png', 64, 64, 0);
S('icon_sword', F + 'UI Elements/UI Elements/Icons/Icon_05.png', 64, 64, 0);
S('icon_shield', F + 'UI Elements/UI Elements/Icons/Icon_06.png', 64, 64, 0);
S('cursorRing', F + 'UI Elements/UI Elements/Cursors/Cursor_04.png', 128, 128, 64);

export const SHEETS = sheets;
export const IMG = {};

export function loadAll(onProgress) {
  const list = Object.values(sheets);
  let done = 0;
  return Promise.all(list.map(s => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      if (!s.fw) { s.fw = im.width; s.fh = im.height; s.foot = s.foot || im.height; s.cx = im.width / 2; }
      s.frames = s.frames || Math.max(1, Math.floor(im.width / s.fw));
      s.img = im; IMG[s.key] = im;
      onProgress && onProgress(++done / list.length); res();
    };
    im.onerror = () => { console.error('missing asset', s.src); s.frames = 0; onProgress && onProgress(++done / list.length); res(); };
    im.src = new URL('../' + encodeURI(s.src), import.meta.url).href;
  })));
}

// Draw one frame of a sheet with feet at (x, y). t = time in seconds (or frame index if useFrame).
export function drawSprite(ctx, key, x, y, t = 0, opts = {}) {
  const s = sheets[key];
  if (!s || !s.img) return;
  let f = opts.frame != null ? opts.frame : Math.floor(t * (opts.fps || s.fps));
  f = opts.once ? Math.min(f, s.frames - 1) : ((f % s.frames) + s.frames) % s.frames;
  const sc = opts.scale || 1;
  const dw = s.fw * sc, dh = s.fh * sc;
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flip) {
    ctx.save();
    ctx.translate(Math.round(x), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(s.img, f * s.fw, 0, s.fw, s.fh, Math.round(-s.cx * sc), Math.round(y - s.foot * sc), dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, f * s.fw, 0, s.fw, s.fh, Math.round(x - s.cx * sc), Math.round(y - s.foot * sc), dw, dh);
  }
  if (opts.alpha != null) ctx.globalAlpha = 1;
}

export function frameCount(key) { return sheets[key] ? sheets[key].frames : 1; }
export function animDuration(key) { const s = sheets[key]; return s ? s.frames / s.fps : 1; }
