// All sound is synthesized live with WebAudio: no audio files needed.
// Sfx are small recipes of oscillators and filtered noise. Music is a
// procedural chiptune sequencer with three moods that crossfade.

const SETTINGS_KEY = 'tinyrealm.settings';
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // midi to Hz

export class Audio {
  constructor() {
    this.ctx = null;
    this.settings = Object.assign({ music: 0.55, sfx: 0.8 }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    this.last = {};
    this.voices = 0;
    this.mood = 'home'; this.wantMood = 'home';
    this.viewRect = null; // function returning {x0,y0,x1,y1} in world space
  }
  saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); this.applyVolumes(); }

  // must run from a user gesture (iOS)
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.connect(comp);
    this.musicBus = c.createGain(); this.musicBus.connect(comp);
    // a short room reverb for the music
    const conv = c.createConvolver(); conv.buffer = this.impulse(1.6);
    const wet = c.createGain(); wet.gain.value = 0.18;
    this.musicBus.connect(conv); conv.connect(wet); wet.connect(comp);
    this.noiseBuf = this.makeNoise();
    this.applyVolumes();
    // iOS: play a silent buffer to fully unlock
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
    this.startMusic();
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.settings.sfx * 0.9;
    this.musicBus.gain.value = this.settings.music * 0.32;
  }
  impulse(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
    return b;
  }
  makeNoise() {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ---------------- building blocks
  tone(f, dur, { type = 'square', vol = 0.2, slide = 0, at = 0, attack = 0.005, bus, detune = 0, vib = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = f * 0.03; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { freq = 1000, q = 1, type = 'bandpass', vol = 0.2, at = 0, sweep = 0, bus } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---------------- sound effects
  // pos (optional) = world {x,y}: only audible if on screen
  play(name, pos, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || this.settings.sfx <= 0) return;
    if (pos && this.viewRect) {
      const r = this.viewRect();
      if (pos.x < r.x0 - 100 || pos.x > r.x1 + 100 || pos.y < r.y0 - 100 || pos.y > r.y1 + 100) return;
    }
    const gap = { sword: 0.05, hit: 0.05, arrow: 0.06, chop: 0.12, mine: 0.12, coin: 0.08, death: 0.08, step: 0.1, click: 0.03 }[name] ?? 0.04;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const fn = SFX[name]; if (fn) fn(this, vol);
  }

  // ---------------- music
  setMood(m) { this.wantMood = m; }
  startMusic() {
    if (this.seq) return;
    this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.phrase = null; this.bar = 0;
    this.seq = setInterval(() => this.schedule(), 30);
  }
  schedule() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    while (this.nextT < c.currentTime + 0.15) {
      if (this.step % 16 === 0) {
        if (this.wantMood !== this.mood && this.bar % 2 === 0) { this.mood = this.wantMood; this.phrase = null; this.bar = 0; }
        if (!this.phrase || this.bar % 8 === 0) this.phrase = composePhrase(this.mood, Math.floor(this.bar / 8));
      }
      if (this.settings.music > 0) playStep(this, this.mood, this.phrase, this.step, this.bar, this.nextT - c.currentTime);
      const S = SONGS[this.mood];
      this.nextT += 60 / S.bpm / 4;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }
}

// ------------------------------------------------------------ sfx recipes
const SFX = {
  click: a => a.tone(880, 0.05, { type: 'square', vol: 0.08, slide: 1.3 }),
  open: a => { a.tone(523, 0.06, { vol: 0.07 }); a.tone(784, 0.08, { vol: 0.07, at: 0.05 }); },
  close: a => { a.tone(784, 0.06, { vol: 0.06 }); a.tone(523, 0.08, { vol: 0.06, at: 0.05 }); },
  error: a => { a.tone(150, 0.14, { type: 'square', vol: 0.1 }); a.tone(110, 0.14, { type: 'square', vol: 0.08, at: 0.07 }); },
  sword: a => { a.noise(0.07, { freq: 3500, q: 2, vol: 0.18, sweep: 0.5 }); a.tone(1400 + Math.random() * 300, 0.09, { type: 'triangle', vol: 0.06, slide: 0.7 }); },
  hit: a => { a.noise(0.09, { freq: 700, type: 'lowpass', vol: 0.3 }); a.tone(120, 0.08, { type: 'sine', vol: 0.18, slide: 0.5 }); },
  arrow: a => a.noise(0.14, { freq: 4000, q: 6, vol: 0.12, sweep: 0.35 }),
  thud: a => { a.noise(0.12, { freq: 400, type: 'lowpass', vol: 0.35 }); a.tone(80, 0.15, { type: 'sine', vol: 0.25, slide: 0.5 }); },
  chop: a => { a.noise(0.05, { freq: 900, type: 'lowpass', vol: 0.18 }); a.tone(210 + Math.random() * 30, 0.05, { type: 'square', vol: 0.05, slide: 0.6 }); },
  mine: a => { a.tone(1900 + Math.random() * 300, 0.08, { type: 'triangle', vol: 0.08 }); a.tone(2800, 0.05, { type: 'triangle', vol: 0.04, at: 0.01 }); a.noise(0.04, { freq: 5000, type: 'highpass', vol: 0.06 }); },
  hammer: a => { a.tone(160, 0.06, { type: 'square', vol: 0.07, slide: 0.6 }); a.noise(0.05, { freq: 1200, vol: 0.08 }); },
  tick: a => a.tone(1600, 0.025, { type: 'square', vol: 0.025 }),
  equip: a => { a.noise(0.06, { freq: 2600, q: 3, vol: 0.12 }); a.tone(660, 0.07, { type: 'triangle', vol: 0.07, at: 0.04 }); a.tone(990, 0.1, { type: 'triangle', vol: 0.06, at: 0.09 }); },
  fanfare: a => { [523, 659, 784].forEach((f, i) => a.tone(f, 0.14, { type: 'square', vol: 0.05, at: i * 0.09 })); a.tone(1047, 0.45, { type: 'square', vol: 0.06, at: 0.3, vib: 6 }); a.noise(0.5, { freq: 8000, type: 'highpass', vol: 0.04, at: 0.3 }); },
  streak: a => { [659, 784, 988, 1319].forEach((f, i) => a.tone(f, 0.12, { type: 'triangle', vol: 0.08, at: i * 0.07 })); },
  coin: a => { a.tone(988, 0.07, { vol: 0.06 }); a.tone(1319, 0.12, { vol: 0.06, at: 0.06 }); },
  baa: a => a.tone(330, 0.3, { type: 'sawtooth', vol: 0.05, vib: 22, slide: 0.9 }),
  place: a => { a.noise(0.15, { freq: 500, type: 'lowpass', vol: 0.3 }); a.tone(110, 0.15, { type: 'sine', vol: 0.2, slide: 0.6 }); },
  build: a => [0, 0.12, 0.24].forEach(t => { a.tone(160, 0.06, { type: 'square', vol: 0.07, slide: 0.6, at: t }); a.noise(0.05, { freq: 1200, vol: 0.08, at: t }); }),
  complete: a => [523, 659, 784, 1047].forEach((f, i) => a.tone(f, 0.18, { type: 'square', vol: 0.06, at: i * 0.07 })),
  ready: a => [392, 523, 659].forEach((f, i) => a.tone(f, 0.15, { type: 'triangle', vol: 0.1, at: i * 0.06 })),
  levelup: a => { [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone(f, 0.12, { type: 'square', vol: 0.05, at: i * 0.05 })); a.noise(0.4, { freq: 7000, type: 'highpass', vol: 0.04, at: 0.2 }); },
  death: a => { a.tone(420, 0.3, { type: 'sawtooth', vol: 0.06, slide: 0.3 }); a.noise(0.2, { freq: 600, type: 'lowpass', vol: 0.15 }); },
  explosion: a => { a.noise(0.7, { freq: 900, type: 'lowpass', vol: 0.5, sweep: 0.15 }); a.tone(70, 0.5, { type: 'sine', vol: 0.4, slide: 0.4 }); },
  splash: a => a.noise(0.35, { freq: 1400, q: 1, vol: 0.18, sweep: 0.4 }),
  horn: a => { a.tone(196, 1.3, { type: 'sawtooth', vol: 0.12, attack: 0.15, vib: 5 }); a.tone(294, 1.3, { type: 'sawtooth', vol: 0.07, attack: 0.2, vib: 5, at: 0.05 }); a.tone(98, 1.3, { type: 'triangle', vol: 0.12, attack: 0.2 }); },
  victory: a => { [[392, 0], [523, 0.15], [659, 0.3], [784, 0.45]].forEach(([f, t]) => a.tone(f, 0.22, { type: 'square', vol: 0.07, at: t })); a.tone(1047, 0.8, { type: 'square', vol: 0.06, at: 0.6 }); a.tone(523, 0.8, { type: 'triangle', vol: 0.1, at: 0.6 }); },
  defeat: a => [[392, 0], [349, 0.25], [311, 0.5], [262, 0.75]].forEach(([f, t]) => a.tone(f, 0.4, { type: 'triangle', vol: 0.12, at: t })),
  hex: a => { a.tone(600, 0.6, { type: 'sine', vol: 0.1, vib: 12, slide: 1.8 }); a.tone(900, 0.5, { type: 'triangle', vol: 0.05, vib: 9, slide: 0.5, at: 0.1 }); },
  heal: a => [784, 988, 1175].forEach((f, i) => a.tone(f, 0.2, { type: 'sine', vol: 0.06, at: i * 0.06 })),
  quack: a => { a.tone(520, 0.12, { type: 'square', vol: 0.08, slide: 0.6, vib: 30 }); a.tone(480, 0.14, { type: 'square', vol: 0.07, slide: 0.6, vib: 30, at: 0.16 }); },
  roar: a => { a.tone(90, 0.9, { type: 'sawtooth', vol: 0.18, vib: 7, slide: 0.7, attack: 0.08 }); a.noise(0.8, { freq: 500, type: 'lowpass', vol: 0.2 }); },
  bell: a => { [1568, 2093].forEach((f, i) => a.tone(f, 0.6, { type: 'sine', vol: 0.07, at: i * 0.18 })); },
  sail: a => { a.noise(0.9, { freq: 600, type: 'lowpass', vol: 0.15, sweep: 2 }); [294, 392].forEach((f, i) => a.tone(f, 0.4, { type: 'triangle', vol: 0.08, at: 0.1 + i * 0.2 })); },
  buzz: a => a.tone(220, 0.25, { type: 'sawtooth', vol: 0.04, vib: 40 }),
};

// ------------------------------------------------------------ music
// Scales as semitone offsets; songs pick a root, progression and texture.
const DORIAN = [0, 2, 3, 5, 7, 9, 10], MINOR = [0, 2, 3, 5, 7, 8, 10], MIXO = [0, 2, 4, 5, 7, 9, 10];
const SONGS = {
  home: { bpm: 92, root: 62, scale: DORIAN, prog: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4], [6, 1, 3], [3, 5, 0], [4, 6, 1], [0, 2, 4]], lead: 'triangle', density: 0.45 },
  battle: { bpm: 140, root: 57, scale: MINOR, prog: [[0, 2, 4], [5, 0, 2], [6, 1, 3], [4, 6, 1], [0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], lead: 'square', density: 0.65 },
  voyage: { bpm: 112, root: 57, scale: MIXO, prog: [[0, 2, 4], [6, 1, 3], [3, 5, 0], [0, 2, 4], [0, 2, 4], [4, 6, 1], [3, 5, 0], [4, 6, 1]], lead: 'square', density: 0.5 },
};
function deg(S, d, oct = 0) { const n = S.scale.length; const o = Math.floor(d / n); return S.root + S.scale[((d % n) + n) % n] + 12 * (o + oct); }

// Builds an 8-bar phrase: a 2-bar motif that repeats and varies over the chords
function composePhrase(mood, seed) {
  const S = SONGS[mood];
  const r = mulberry((seed + 1) * 7919 + mood.length * 131);
  const motif = [];
  for (let i = 0; i < 32; i++) {
    const strong = i % 4 === 0;
    if (r() < (strong ? 0.85 : S.density * 0.7)) motif.push({ i, d: Math.floor(r() * 3), step: r() < 0.3 ? (r() < 0.5 ? 1 : -1) : 0, len: strong && r() < 0.5 ? 3 : 1 });
  }
  const bars = [];
  for (let b = 0; b < 8; b++) {
    const chord = S.prog[b];
    const notes = [];
    const vary = b >= 4 && b % 2 === 1;
    for (const m of motif) {
      if ((m.i >= 16) !== (b % 2 === 1)) continue;
      const tone = chord[(m.d + (vary ? 1 : 0)) % 3] + m.step;
      notes.push({ s: m.i % 16, n: deg(S, tone, 1), len: m.len });
    }
    bars.push({ chord, notes });
  }
  return bars;
}
function playStep(a, mood, phrase, step, bar, at) {
  const S = SONGS[mood], s = step % 16, B = phrase[bar % 8], bus = a.musicBus;
  const beat = 60 / S.bpm / 4;
  // bass
  const bassRoot = deg(S, B.chord[0], -1);
  if (mood === 'battle') { if (s % 2 === 0) a.tone(NOTE(bassRoot + (s % 8 === 6 ? 7 : 0)), beat * 1.6, { type: 'triangle', vol: 0.32, at, bus }); }
  else if (mood === 'voyage') { if (s === 0 || s === 6 || s === 8 || s === 14) a.tone(NOTE(bassRoot + (s >= 8 ? 7 : 0)), beat * 3, { type: 'triangle', vol: 0.3, at, bus }); }
  else if (s === 0 || s === 8) a.tone(NOTE(bassRoot + (s === 8 ? 7 : 0)), beat * 7, { type: 'triangle', vol: 0.26, at, bus });
  // plucked arpeggio (home) / chord stabs (battle) / shanty strum (voyage)
  if (mood === 'home' && s % 2 === 0) a.tone(NOTE(deg(S, B.chord[(s / 2) % 3], 0)), beat * 2.5, { type: 'triangle', vol: 0.07, at, bus });
  if (mood === 'battle' && (s === 0 || s === 3 || s === 6 || s === 10)) for (const d of B.chord) a.tone(NOTE(deg(S, d, 0)), beat * 1.2, { type: 'square', vol: 0.025, at, bus });
  if (mood === 'voyage' && (s === 3 || s === 11)) for (const d of B.chord) a.tone(NOTE(deg(S, d, 0)), beat * 2, { type: 'square', vol: 0.025, at, bus });
  // lead melody
  for (const n of B.notes) if (n.s === s) a.tone(NOTE(n.n), beat * (n.len + 0.6), { type: S.lead, vol: mood === 'home' ? 0.08 : 0.05, at, bus, attack: 0.01, vib: mood === 'home' ? 5 : 0 });
  // drums
  if (mood === 'battle') {
    if (s % 4 === 0) a.tone(110, 0.12, { type: 'sine', vol: 0.35, slide: 0.4, at, bus });
    if (s === 4 || s === 12) a.noise(0.12, { freq: 1800, vol: 0.12, at, bus });
    if (s % 2 === 1) a.noise(0.03, { freq: 8000, type: 'highpass', vol: 0.04, at, bus });
  } else if (mood === 'voyage') {
    if (s === 0 || s === 8) a.tone(100, 0.12, { type: 'sine', vol: 0.25, slide: 0.5, at, bus });
    if (s === 6 || s === 14) a.noise(0.05, { freq: 6000, type: 'highpass', vol: 0.05, at, bus });
  } else if (s % 4 === 2) a.noise(0.03, { freq: 7000, type: 'highpass', vol: 0.018, at, bus });
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const audio = new Audio();
