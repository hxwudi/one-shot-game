/* ============================================================
   NEON PULSE · 霓虹脉冲
   A neon arena survivor — original work.
   ============================================================ */
(() => {
'use strict';

/* ---------------- helpers ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
};
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, m => m + m) : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------------- dom ---------------- */
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const hud = $('hud');
const hpFill = $('hpFill'), hpText = $('hpText'), xpFill = $('xpFill'), lvNum = $('lvNum');
const hpBarEl = document.querySelector('.bar.hp');
const waveLabel = $('waveLabel'), waveSub = $('waveSub');
const bossBar = $('bossBar'), bossName = $('bossName'), bossFill = $('bossFill');
const timeText = $('timeText'), scoreText = $('scoreText'), comboTag = $('comboTag');
const ultRing = $('ultRing'), pulseBtn = $('pulseBtn'), dashBtn = $('dashBtn');
const dashCd = $('dashCd'), dashCharges = $('dashCharges'), pulsePct = $('pulsePct');
const overlay = $('overlay');
const panels = [$('panelTitle'), $('panelUpgrade'), $('panelPause'), $('panelOver')];
const cards = $('cards');
const toastEl = $('toast');
const muteBtn = $('muteBtn'), pauseBtn = $('pauseBtn');
const startBtn = $('startBtn'), resumeBtn = $('resumeBtn'), restartBtn = $('restartBtn'), restartBtn2 = $('restartBtn2');
const bestText = $('bestText'), overBest = $('overBest');
const overWave = $('overWave'), overScore = $('overScore'), overKills = $('overKills'), overTime = $('overTime');
const touchUI = $('touchBtns'), stickZone = $('stickZone'), stickBase = $('stickBase'), stickKnob = $('stickKnob');
const rotateHint = $('rotate'), rotateSkip = $('rotateSkip');

const isTouch = ('ontouchstart' in window) ||
  ('matchMedia' in window && matchMedia('(pointer: coarse)').matches);

/* ---------------- canvas / viewport ---------------- */
let DPR = 1, scale = 1, VW = 1280, VH = 720, cssW = 1280, cssH = 720;
const BASE_H = 720;
let stars = [];
let bgGrad = null, vigGrad = null;

function makeStars() {
  stars = [];
  const n = Math.round((VW * VH) / 16000);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: rand(0, VW), y: rand(0, VH),
      r: rand(0.7, 2), a: rand(0.2, 0.8),
      sp: rand(0.6, 2), ph: rand(0, TAU)
    });
  }
}

function buildGradients() {
  bgGrad = ctx.createRadialGradient(VW * 0.5, VH * 0.54, 0, VW * 0.5, VH * 0.54, Math.max(VW, VH) * 0.78);
  bgGrad.addColorStop(0, '#0d1836');
  bgGrad.addColorStop(0.5, '#070c1e');
  bgGrad.addColorStop(1, '#03040c');
  vigGrad = ctx.createRadialGradient(VW * 0.5, VH * 0.5, Math.min(VW, VH) * 0.28, VW * 0.5, VH * 0.5, Math.max(VW, VH) * 0.75);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.78)');
}

function resize() {
  cssW = Math.max(320, window.innerWidth);
  cssH = Math.max(320, window.innerHeight);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  scale = Math.min(cssW, cssH) / BASE_H;
  VW = cssW / scale;
  VH = cssH / scale;
  makeStars();
  buildGradients();
  clampEntities();
  checkOrientation();
  if (state === 'title') { player.x = VW / 2; player.y = VH / 2; }
}

function clampEntities() {
  if (!player) return;
  player.x = clamp(player.x, player.r + 8, VW - player.r - 8);
  player.y = clamp(player.y, player.r + 8, VH - player.r - 8);
  for (const e of enemies) {
    e.x = clamp(e.x, e.r, VW - e.r);
    e.y = clamp(e.y, e.r, VH - e.r);
  }
}

/* ---------------- audio ---------------- */
const Sfx = {
  ac: null, master: null, muted: false, noiseBuf: null, ambient: null,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ac.destination);
    const len = Math.floor(this.ac.sampleRate * 0.5);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  },
  tone(freq, dur = 0.08, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    const ac = this.ac;
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  },
  noise(dur = 0.2, vol = 0.15, cut = 900, type = 'lowpass', delay = 0) {
    const ac = this.ac;
    if (!ac || !this.noiseBuf) return;
    const t0 = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(cut, t0); f.Q.value = 1.1;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },
  ambientStart() {
    const ac = this.ac;
    if (!ac || this.ambient) return;
    const g = ac.createGain(); g.gain.value = 0.18;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 81;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.09;
    const lg = ac.createGain(); lg.gain.value = 4;
    lfo.connect(lg); lg.connect(o1.frequency);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o1.start(); o2.start(); lfo.start();
    this.ambient = { o1, o2, lfo, g };
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }
};

let lastHitSfx = 0;
function sfx(name) {
  if (!Sfx.ac) return;
  switch (name) {
    case 'shoot': Sfx.tone(rand(720, 920), 0.045, 'square', 0.045, -260); break;
    case 'hit':
      if (performance.now() - lastHitSfx > 55) { lastHitSfx = performance.now(); Sfx.noise(0.05, 0.055, 1500); }
      break;
    case 'kill': Sfx.noise(0.15, 0.1, 720); Sfx.tone(190, 0.12, 'triangle', 0.06, -90); break;
    case 'hurt': Sfx.tone(140, 0.22, 'sawtooth', 0.18, -70); Sfx.noise(0.2, 0.12, 500); break;
    case 'dash': Sfx.noise(0.16, 0.1, 2600, 'highpass'); Sfx.tone(520, 0.1, 'sine', 0.05, 300); break;
    case 'pulse': Sfx.tone(110, 0.5, 'sine', 0.22, 520); Sfx.noise(0.5, 0.2, 320); Sfx.tone(880, 0.3, 'triangle', 0.08, 600, 0.05); break;
    case 'level': Sfx.tone(523, 0.12, 'triangle', 0.1); Sfx.tone(659, 0.12, 'triangle', 0.1, 0, 0.1); Sfx.tone(784, 0.18, 'triangle', 0.12, 0, 0.2); break;
    case 'pick': Sfx.tone(1250, 0.045, 'sine', 0.045, 400); break;
    case 'upgrade': Sfx.tone(392, 0.13, 'square', 0.07); Sfx.tone(523, 0.2, 'square', 0.07, 0, 0.11); break;
    case 'deny': Sfx.tone(180, 0.12, 'square', 0.08, -40); break;
    case 'boss': Sfx.tone(70, 0.8, 'sawtooth', 0.12, 34); Sfx.noise(0.9, 0.12, 300); break;
    case 'bossdown': Sfx.tone(92, 0.9, 'sine', 0.28, 320); Sfx.noise(1.0, 0.3, 400); break;
    case 'wave': Sfx.tone(660, 0.14, 'sine', 0.1); Sfx.tone(990, 0.16, 'sine', 0.08, 0, 0.13); break;
  }
}

/* ---------------- game state ---------------- */
let state = 'title';           // title | playing | upgrading | paused | over
let bgTime = 0, gameTime = 0, wave = 1, waveCleared = false, restTimer = 0, spawnTimer = 0;
let wavePending = [], markers = [], enemies = [], pBullets = [], eBullets = [],
    gems = [], particles = [], texts = [], rings = [];
let score = 0, kills = 0, combo = 0, comboTimer = 0, pendingLevels = 0;
let shake = 0, flashW = 0, flashR = 0, lastUltPct = -1;
let best = Number(localStorage.getItem('neonpulse.best') || 0);
let currentBossName = '核心';
let dismissedRotate = false;

/* ---------------- player ---------------- */
const player = {
  x: 0, y: 0, vx: 0, vy: 0, r: 13, aim: -Math.PI / 2,
  hp: 100, maxHp: 100,
  baseSpeed: 300, speedMul: 1,
  dmg: 8, dmgMul: 1,
  fireInt: 0.15, fireMul: 1, fireCd: 0,
  shots: 1, pierce: 0, spread: 0.165, crit: 0, explode: 0,
  dashMax: 1, dashCharges: 1, dashRefill: 1.2, dashCd: 0,
  dashTime: 0, dashVX: 0, dashVY: 0, dashTrail: 0,
  energy: 0, energyMax: 100, energyRate: 1,
  invuln: 0,
  level: 1, xp: 0, xpNeed: 12,
  magnet: 110, killHeal: 0, slowAura: 0,
  up: {}
};

/* ---------------- upgrades ---------------- */
const UPGRADES = [
  { id: 'dmg', name: '过载核心', desc: '子弹伤害提升 18%', icon: '✦', rar: 'RARE', color: '#ff4fd8', max: 6, apply: p => { p.dmgMul *= 1.18; } },
  { id: 'rate', name: '超频协议', desc: '射击频率提升 15%', icon: '⌁', rar: 'RARE', color: '#4ff2ff', max: 6, apply: p => { p.fireMul /= 1.15; } },
  { id: 'shots', name: '散射矩阵', desc: '每次额外发射 1 发子弹', icon: '⇶', rar: 'EPIC', color: '#b7ff5a', max: 3, apply: p => { p.shots++; } },
  { id: 'pierce', name: '穿透弹芯', desc: '子弹可多穿透 1 个目标', icon: '➤', rar: 'RARE', color: '#8b5cff', max: 3, apply: p => { p.pierce++; } },
  { id: 'hp', name: '反应装甲', desc: '生命上限 +22，并回复 22', icon: '⛨', rar: 'COMMON', color: '#4ff2ff', max: 6, apply: p => { p.maxHp += 22; p.hp += 22; } },
  { id: 'speed', name: '亚光速引擎', desc: '移动速度提升 11%', icon: '➤', rar: 'COMMON', color: '#ffb347', max: 4, apply: p => { p.speedMul *= 1.11; } },
  { id: 'dash', name: '相位闪避', desc: '冲刺次数 +1，冷却缩短', icon: '↯', rar: 'EPIC', color: '#4ff2ff', max: 2, apply: p => { p.dashMax++; p.dashCharges++; p.dashRefill *= 0.88; } },
  { id: 'energy', name: '脉冲电池', desc: '大招充能速度 +35%', icon: '◉', rar: 'RARE', color: '#ff4fd8', max: 3, apply: p => { p.energyRate *= 1.35; } },
  { id: 'magnet', name: '引力回收器', desc: '经验拾取范围 +60%', icon: '⟐', rar: 'COMMON', color: '#b7ff5a', max: 2, apply: p => { p.magnet *= 1.6; } },
  { id: 'heal', name: '纳米修复', desc: '每次击杀回复 1.5 生命', icon: '✚', rar: 'COMMON', color: '#4ff2ff', max: 4, apply: p => { p.killHeal += 1.5; } },
  { id: 'crit', name: '暴击核心', desc: '15% 概率造成双倍伤害', icon: '✷', rar: 'RARE', color: '#ffb347', max: 3, apply: p => { p.crit += 0.15; } },
  { id: 'slow', name: '减速力场', desc: '敌人移动速度 -7%', icon: '⏱', rar: 'RARE', color: '#8b5cff', max: 3, apply: p => { p.slowAura += 0.07; } },
  { id: 'boom', name: '余烬弹头', desc: '命中时产生范围爆炸', icon: '✹', rar: 'EPIC', color: '#ffb347', max: 2, apply: p => { p.explode++; } }
];
const SUPPLY_CARD = { id: 'supply', name: '纳米补给', desc: '立即恢复 40% 生命', icon: '✚', rar: 'COMMON', color: '#4ff2ff', max: 999, apply: p => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); } };

const BOSS_NAMES = ['OMEGA 核心', 'NOVA 母舰', 'VOID 主脑', 'ZERO 奇点'];

/* ---------------- enemy data ---------------- */
const KINDS = {
  drone:    { r: 11, hp: 14, speed: 104, score: 10, xp: 3,  color: '#4ff2ff', shape: 3, contact: 10 },
  splitter: { r: 16, hp: 30, speed: 78,  score: 18, xp: 5,  color: '#b07cff', shape: 4, contact: 13 },
  spitter:  { r: 14, hp: 20, speed: 62,  score: 16, xp: 6,  color: '#ff4fd8', shape: 6, contact: 11 },
  tank:     { r: 26, hp: 82, speed: 46,  score: 45, xp: 14, color: '#ffb347', shape: 5, contact: 22 },
  orbiter:  { r: 12, hp: 16, speed: 148, score: 15, xp: 4,  color: '#b7ff5a', shape: 4, contact: 11 },
  boss:     { r: 58, hp: 460, speed: 52, score: 500, xp: 80, color: '#ff4f6d', shape: 8, contact: 30 }
};

/* ---------------- particles / fx ---------------- */
const glowSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
})();

function addParticle(x, y, vx, vy, life, size, color, type) {
  if (particles.length > 620) return;
  particles.push({ x, y, vx, vy, life, max: life, size, color, type: type || 'dot', dead: false });
}
function burst(x, y, color, count, power, size) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU);
    const sp = rand(0.2, 1) * power;
    addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.28, 0.68), rand(1, size), color, 'dot');
  }
}
function spark(x, y, color) {
  const a = rand(0, TAU), sp = rand(120, 340);
  addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.24), rand(1.2, 2.4), color, 'spark');
}
function addText(x, y, txt, color, size, big) {
  if (texts.length > 44) return;
  texts.push({ x, y, txt: String(txt), color, size, life: big ? 0.9 : 0.6, max: big ? 0.9 : 0.6, vy: big ? -54 : -40 });
}

/* ---------------- hud ---------------- */
function syncHud() {
  const p = player;
  hpFill.style.width = clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
  hpText.textContent = Math.ceil(p.hp) + '/' + p.maxHp;
  hpBarEl.classList.toggle('low', p.hp / p.maxHp < 0.35);
  xpFill.style.width = clamp(p.xp / p.xpNeed * 100, 0, 100) + '%';
  lvNum.textContent = p.level;

  const boss = enemies.find(e => e.kind === 'boss' && !e.dead);
  if (boss) {
    bossBar.classList.remove('hidden');
    bossFill.style.width = clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%';
    bossName.textContent = currentBossName;
  } else {
    bossBar.classList.add('hidden');
  }

  waveLabel.textContent = 'WAVE ' + String(wave).padStart(2, '0');
  if (boss) {
    waveSub.textContent = '击破母舰 · 摧毁核心';
  } else if (waveCleared) {
    waveSub.textContent = '下一波即将到来';
  } else {
    const rest = enemies.filter(e => !e.dead).length + markers.length + wavePending.length;
    waveSub.textContent = '剩余敌对信号 ' + rest;
  }

  timeText.textContent = fmtTime(gameTime);
  scoreText.textContent = score;

  const mult = comboMult();
  comboTag.textContent = '×' + mult.toFixed(2);
  comboTag.classList.toggle('off', combo < 2);

  const pct = Math.round(clamp(p.energy / p.energyMax, 0, 1) * 100);
  if (pct !== lastUltPct) {
    lastUltPct = pct;
    ultRing.style.setProperty('--p', pct + '%');
    pulseBtn.style.setProperty('--p', pct + '%');
  }
  const ready = pct >= 100;
  ultRing.classList.toggle('full', ready);
  pulseBtn.classList.toggle('ready', ready);
  pulseBtn.classList.toggle('disabled', !ready);
  pulsePct.textContent = ready ? 'GO!' : pct + '%';

  dashBtn.classList.toggle('disabled', p.dashCharges <= 0);
  dashCharges.textContent = '×' + p.dashCharges;
  if (p.dashCharges < p.dashMax) {
    const cdPct = clamp((1 - p.dashCd / p.dashRefill) * 100, 0, 100);
    dashCd.style.setProperty('--cd', cdPct + '%');
  } else {
    dashCd.style.setProperty('--cd', '100%');
  }

  touchUI.classList.toggle('hidden', !isTouch);
  stickZone.style.display = isTouch ? 'block' : 'none';
}

function comboMult() {
  return clamp(1 + Math.floor(combo / 8) * 0.25, 1, 5);
}

/* ---------------- panels ---------------- */
function showPanel(panel) {
  overlay.classList.add('active');
  for (const p of panels) p.classList.toggle('hidden', p !== panel);
}
function hidePanels() {
  overlay.classList.remove('active');
  for (const p of panels) p.classList.add('hidden');
}
let toastT = 0;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
}

/* ---------------- flow ---------------- */
function resetGame() {
  enemies.length = 0; pBullets.length = 0; eBullets.length = 0;
  gems.length = 0; particles.length = 0; texts.length = 0; rings.length = 0;
  markers.length = 0; wavePending.length = 0;

  gameTime = 0; wave = 1; score = 0; kills = 0; combo = 0; comboTimer = 0;
  pendingLevels = 0; waveCleared = false; restTimer = 0; spawnTimer = 0;
  shake = 0; flashW = 0; flashR = 0; lastUltPct = -1; toastT = 0;
  currentBossName = '核心';

  Object.assign(player, {
    x: VW / 2, y: VH / 2, vx: 0, vy: 0, r: 13, aim: -Math.PI / 2,
    hp: 100, maxHp: 100, baseSpeed: 300, speedMul: 1,
    dmg: 8, dmgMul: 1, fireInt: 0.15, fireMul: 1, fireCd: 0,
    shots: 1, pierce: 0, spread: 0.165, crit: 0, explode: 0,
    dashMax: 1, dashCharges: 1, dashRefill: 1.2, dashCd: 0,
    dashTime: 0, dashVX: 0, dashVY: 0, dashTrail: 0,
    energy: 0, energyMax: 100, energyRate: 1, invuln: 1.3,
    level: 1, xp: 0, xpNeed: 12, magnet: 110, killHeal: 0, slowAura: 0,
    up: {}
  });

  startWave(1);
  lastUltPct = -1;
  syncHud();
}

function startGame() {
  Sfx.init();
  Sfx.ambientStart();
  hidePanels();
  resetGame();
  resetJoy();
  state = 'playing';
  hud.classList.remove('hidden');
  if (isTouch) touchUI.classList.remove('hidden');
  checkOrientation();
  sfx('wave');
}

function gameOver() {
  state = 'over';
  resetJoy();
  if (score > best) {
    best = score;
    localStorage.setItem('neonpulse.best', String(best));
  }
  overWave.textContent = wave;
  overScore.textContent = score;
  overKills.textContent = kills;
  overTime.textContent = fmtTime(gameTime);
  overBest.textContent = '最高分 ' + best;
  bestText.textContent = best;
  showPanel(panels[3]);
  shake = Math.max(shake, 18);
  sfx('hurt');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    resetJoy();
    showPanel(panels[2]);
  } else if (state === 'paused') {
    state = 'playing';
    hidePanels();
  }
}

/* ---------------- waves ---------------- */
function buildWave(n) {
  if (n % 5 === 0) return ['boss'];
  const total = Math.min(7 + n * 3, 55);
  const list = [];
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    let k = 'drone';
    if (n >= 6 && r < 0.12) k = 'tank';
    else if (n >= 3 && r < 0.34) k = 'spitter';
    else if (n >= 2 && r < 0.60) k = 'splitter';
    else if (n >= 6 && r < 0.74) k = 'orbiter';
    else k = 'drone';
    list.push(k);
  }
  return list;
}

function startWave(n) {
  wave = n;
  waveCleared = false;
  wavePending = buildWave(n);
  spawnTimer = n % 5 === 0 ? 0.1 : 0.35;
  if (n % 5 === 0) {
    currentBossName = BOSS_NAMES[(Math.floor(n / 5) - 1) % BOSS_NAMES.length];
    toast('母舰接近 · ' + n);
  } else {
    toast('WAVE ' + String(n).padStart(2, '0'));
  }
}

function onWaveCleared() {
  waveCleared = true;
  restTimer = 1.4;
  score += 50 + wave * 15;
  player.hp = Math.min(player.maxHp, player.hp + 8);
  sfx('wave');
  toast('WAVE ' + String(wave).padStart(2, '0') + ' CLEAR');
}

function randomEdgePoint(m) {
  const side = randInt(0, 3);
  if (side === 0) return { x: rand(m, VW - m), y: m };
  if (side === 1) return { x: VW - m, y: rand(m, VH - m) };
  if (side === 2) return { x: rand(m, VW - m), y: VH - m };
  return { x: m, y: rand(m, VH - m) };
}

function spawnMarker(kind) {
  const data = KINDS[kind];
  let pt, tries = 0;
  do {
    pt = randomEdgePoint(data.r + 8);
    tries++;
  } while (tries < 12 && d2(pt.x, pt.y, player.x, player.y) < (data.r + 150) ** 2);
  const boss = kind === 'boss';
  markers.push({ x: pt.x, y: pt.y, r: data.r + 6, t: boss ? 1.5 : 0.72, max: boss ? 1.5 : 0.72, kind, dead: false });
  if (boss) sfx('boss');
}

function createEnemy(kind, x, y) {
  const base = KINDS[kind];
  const hpScale = 1 + (wave - 1) * 0.26;
  const spScale = 1 + Math.min(0.6, (wave - 1) * 0.025);
  const boss = kind === 'boss';
  const maxHp = boss ? 460 + (Math.floor(wave / 5) - 1) * 380 : Math.round(base.hp * hpScale);
  return {
    kind, x, y,
    r: base.r, shape: base.shape,
    hp: maxHp, maxHp,
    speed: base.speed * spScale,
    color: base.color,
    contact: base.contact,
    score: base.score,
    xp: base.xp,
    vx: rand(-30, 30), vy: rand(-30, 30),
    rot: rand(0, TAU), spin: boss ? 0.25 : rand(-0.7, 0.7),
    t: rand(0, TAU), seed: rand(0, TAU),
    hurt: 0, fireCd: rand(0.6, 1.6), orbitDir: Math.random() < 0.5 ? 1 : -1,
    gen: 0, intro: boss ? 1.5 : 0, dead: false
  };
}

/* ---------------- input ---------------- */
const keys = new Set();
const joy = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };

function moveInput() {
  if (joy.active) {
    if (Math.hypot(joy.x, joy.y) < 0.18) return { x: 0, y: 0 };
    return { x: joy.x, y: joy.y };
  }
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y };
}

function resetJoy() {
  if (joy.id != null) { try { stickZone.releasePointerCapture(joy.id); } catch (_) {} }
  joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
  stickBase.classList.add('hidden');
}

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { startGame(); return; }
  if (state === 'playing') {
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') doDash();
    if (e.code === 'KeyE' || e.code === 'KeyQ') doPulse();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  } else if (state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    togglePause();
  } else if (state === 'over' && e.code === 'Enter') {
    startGame();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => {
  if (state === 'playing') togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

/* joystick */
stickZone.addEventListener('pointerdown', (e) => {
  if (state !== 'playing' || joy.active) return;
  joy.active = true; joy.id = e.pointerId;
  joy.cx = e.clientX; joy.cy = e.clientY;
  joy.x = 0; joy.y = 0;
  stickBase.classList.remove('hidden');
  stickBase.style.left = joy.cx + 'px';
  stickBase.style.top = joy.cy + 'px';
  stickKnob.style.transform = 'translate(-50%,-50%)';
  try { stickZone.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
stickZone.addEventListener('pointermove', (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
  const R = 54;
  const d = Math.hypot(dx, dy);
  if (d > R) { dx = dx / d * R; dy = dy / d * R; }
  joy.x = dx / R; joy.y = dy / R;
  stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  e.preventDefault();
});
function endJoy(e) {
  if (e.pointerId !== joy.id) return;
  joy.active = false; joy.id = null; joy.x = 0; joy.y = 0;
  stickBase.classList.add('hidden');
}
stickZone.addEventListener('pointerup', endJoy);
stickZone.addEventListener('pointercancel', endJoy);

dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doDash(); });
pulseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doPulse(); });

/* buttons */
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
restartBtn2.addEventListener('click', startGame);
resumeBtn.addEventListener('click', togglePause);
pauseBtn.addEventListener('click', togglePause);
muteBtn.addEventListener('click', () => {
  Sfx.setMuted(!Sfx.muted);
  muteBtn.textContent = Sfx.muted ? '✕' : '♪';
  muteBtn.style.color = Sfx.muted ? '#5d7f93' : '';
});
rotateSkip.addEventListener('click', () => {
  dismissedRotate = true;
  rotateHint.classList.add('hidden');
});

/* ---------------- player logic ---------------- */
function doDash() {
  if (state !== 'playing') return;
  const p = player;
  if (p.dashCharges <= 0) { sfx('deny'); return; }
  const inp = moveInput();
  let dx = inp.x, dy = inp.y;
  if (Math.hypot(dx, dy) < 0.15) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
  const l = Math.hypot(dx, dy);
  dx /= l; dy /= l;
  p.dashCharges--;
  if (p.dashCd <= 0) p.dashCd = p.dashRefill;
  p.dashTime = 0.17;
  p.dashVX = dx * 980;
  p.dashVY = dy * 980;
  p.invuln = Math.max(p.invuln, 0.32);
  shake = Math.max(shake, 4);
  sfx('dash');
  for (let i = 0; i < 9; i++) {
    spark(p.x, p.y, i % 2 ? '#4ff2ff' : '#b7ff5a');
  }
}

function doPulse() {
  if (state !== 'playing') return;
  const p = player;
  if (p.energy < p.energyMax) { sfx('deny'); return; }
  p.energy = 0;
  lastUltPct = -1;
  rings.push({
    x: p.x, y: p.y, r: 12,
    maxR: Math.max(VW, VH) * 1.1,
    speed: Math.max(VW, VH) * 2.1,
    hits: new Set(), dmg: 62, dead: false
  });
  p.invuln = Math.max(p.invuln, 0.65);
  shake = Math.max(shake, 16);
  flashW = 0.55;
  sfx('pulse');
  for (const b of eBullets) {
    if (b.dead) continue;
    b.dead = true;
    burst(b.x, b.y, '#ff4fd8', 3, 150, 2);
  }
  burst(p.x, p.y, '#8ef9ff', 26, 500, 3);
}

function updatePlayer(dt) {
  const p = player;

  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.x += p.dashVX * dt;
    p.y += p.dashVY * dt;
    p.dashTrail -= dt;
    if (p.dashTrail <= 0) {
      p.dashTrail = 0.018;
      addParticle(p.x, p.y, rand(-20, 20), rand(-20, 20), 0.3, 2.4, '#4ff2ff', 'dot');
    }
  } else {
    const inp = moveInput();
    const spd = p.baseSpeed * p.speedMul;
    const k = 1 - Math.exp(-dt * 13);
    p.vx += (inp.x * spd - p.vx) * k;
    p.vy += (inp.y * spd - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  p.x = clamp(p.x, p.r + 8, VW - p.r - 8);
  p.y = clamp(p.y, p.r + 8, VH - p.r - 8);
  p.invuln = Math.max(0, p.invuln - dt);

  if (p.dashCharges < p.dashMax) {
    p.dashCd -= dt;
    if (p.dashCd <= 0) {
      p.dashCharges++;
      p.dashCd = p.dashCharges < p.dashMax ? p.dashRefill : 0;
    }
  }

  // auto-target nearest enemy
  let target = null, td = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const dd = d2(p.x, p.y, e.x, e.y);
    if (dd < td) { td = dd; target = e; }
  }
  if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);

  p.fireCd -= dt;
  if (p.fireCd <= 0 && target) {
    fire();
    p.fireCd = p.fireInt * p.fireMul;
  }
}

function fire() {
  const p = player;
  const n = p.shots;
  const off = p.spread;
  for (let i = 0; i < n; i++) {
    const ang = p.aim + (i - (n - 1) / 2) * off + rand(-0.02, 0.02);
    pBullets.push({
      x: p.x + Math.cos(p.aim) * 18,
      y: p.y + Math.sin(p.aim) * 18,
      vx: Math.cos(ang) * 640,
      vy: Math.sin(ang) * 640,
      r: 4.6,
      dmg: p.dmg * p.dmgMul,
      pierce: p.pierce,
      crit: Math.random() < p.crit,
      explode: p.explode,
      hits: null,
      life: 1.1,
      dead: false
    });
  }
  const a = p.aim;
  for (let i = 0; i < 3; i++) {
    addParticle(
      p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22,
      Math.cos(a + rand(-0.5, 0.5)) * rand(60, 160),
      Math.sin(a + rand(-0.5, 0.5)) * rand(60, 160),
      0.18, 1.8, '#c8fdff', 'dot'
    );
  }
  sfx('shoot');
}

/* ---------------- enemies ---------------- */
function updateEnemies(dt) {
  const p = player;
  const slow = 1 - Math.min(0.35, p.slowAura);

  for (const e of enemies) {
    if (e.dead) continue;
    e.hurt = Math.max(0, e.hurt - dt);
    e.t += dt;
    e.rot += e.spin * dt;
    if (e.intro > 0) e.intro -= dt;

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 0.001;
    const nx = dx / d, ny = dy / d;
    const s = e.speed * slow * (e.intro > 0 ? 0.35 : 1);

    if (e.kind === 'drone') {
      const k = Math.min(1, dt * 6);
      e.vx += (nx * s - e.vx) * k;
      e.vy += (ny * s - e.vy) * k;
    } else if (e.kind === 'splitter') {
      const wob = Math.sin(e.t * 2.4 + e.seed) * 0.4;
      const tx = (nx * Math.cos(wob) - ny * Math.sin(wob)) * s;
      const ty = (ny * Math.cos(wob) + nx * Math.sin(wob)) * s;
      const k = Math.min(1, dt * 5);
      e.vx += (tx - e.vx) * k;
      e.vy += (ty - e.vy) * k;
    } else if (e.kind === 'spitter') {
      let tx = 0, ty = 0;
      if (d > 255) { tx = nx * s; ty = ny * s; }
      else if (d < 175) { tx = -nx * s * 0.85; ty = -ny * s * 0.85; }
      else { tx = -ny * s * 0.55; ty = nx * s * 0.55; }
      const k = Math.min(1, dt * 4);
      e.vx += (tx - e.vx) * k;
      e.vy += (ty - e.vy) * k;
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 640 && e.intro <= 0) {
        e.fireCd = Math.max(1.0, 2.0 - wave * 0.06) + rand(0, 0.5);
        shootAtPlayer(e.x, e.y, 215 + wave * 6, 11);
      }
    } else if (e.kind === 'tank') {
      const k = Math.min(1, dt * 3);
      e.vx += (nx * s - e.vx) * k;
      e.vy += (ny * s - e.vy) * k;
    } else if (e.kind === 'orbiter') {
      let tx, ty;
      if (d > 205) { tx = nx; ty = ny; }
      else { tx = -ny * e.orbitDir; ty = nx * e.orbitDir; }
      const k = Math.min(1, dt * 5);
      e.vx += (tx * s - e.vx) * k;
      e.vy += (ty * s - e.vy) * k;
    } else if (e.kind === 'boss') {
      updateBoss(e, dt, d, nx, ny, s);
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
    if (e.x > VW - e.r) { e.x = VW - e.r; e.vx = -Math.abs(e.vx); }
    if (e.y < e.r) { e.y = e.r; e.vy = Math.abs(e.vy); }
    if (e.y > VH - e.r) { e.y = VH - e.r; e.vy = -Math.abs(e.vy); }

    if (e.intro <= 0 && p.invuln <= 0 && p.dashTime <= 0 &&
        d2(p.x, p.y, e.x, e.y) < (p.r + e.r * 0.9) ** 2) {
      hurtPlayer(e.contact);
    }
  }

  // soft separation
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead || a.kind === 'boss') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      const dd = dx * dx + dy * dy;
      if (dd > 0.01 && dd < rr * rr) {
        const dd2 = Math.sqrt(dd);
        const push = (rr - dd2) / dd2 * 0.4;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  }
}

function updateBoss(e, dt, d, nx, ny, s) {
  if (e.intro > 0) {
    e.vx *= 0.92; e.vy *= 0.92;
    return;
  }
  const k = Math.min(1, dt * 2);
  if (d > 200) {
    e.vx += (nx * s - e.vx) * k;
    e.vy += (ny * s - e.vy) * k;
  } else {
    e.vx += (-ny * s * 0.8 - e.vx) * k;
    e.vy += (nx * s * 0.8 - e.vy) * k;
  }

  const rage = e.hp / e.maxHp < 0.5;
  e.fireCd -= dt;
  if (e.fireCd <= 0 && d < 900) {
    e.fireCd = rage ? 0.9 : 1.3;
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    for (let i = -1; i <= 1; i++) {
      shootAtPlayer(e.x, e.y, 305, 13, a + i * 0.14);
    }
  }
  e.burstCd = (e.burstCd || 0) - dt;
  if (e.burstCd <= 0) {
    e.burstCd = rage ? 2.4 : 3.4;
    const count = rage ? 22 : 16;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + e.t * 0.5;
      shootAtPlayer(e.x, e.y, 195, 12, a);
    }
    sfx('boss');
    shake = Math.max(shake, 7);
  }
}

function shootAtPlayer(x, y, speed, dmg, angOverride) {
  const ang = angOverride != null ? angOverride : Math.atan2(player.y - y, player.x - x);
  eBullets.push({
    x: x + Math.cos(ang) * 18,
    y: y + Math.sin(ang) * 18,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    r: 6, dmg, life: 4.5, dead: false
  });
}

/* ---------------- combat ---------------- */
function hitEnemy(e, dmg, crit) {
  if (e.dead || e.intro > 0) return;
  e.hp -= dmg;
  e.hurt = 0.12;
  player.energy = Math.min(player.energyMax, player.energy + dmg * 0.9 * player.energyRate);
  addText(e.x + rand(-6, 6), e.y - e.r - 6, Math.round(dmg), crit ? '#ffe66d' : '#dff9ff', crit ? 18 : 13, crit);
  sfx('hit');
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  kills++;
  combo++;
  comboTimer = 3.2;
  score += Math.round(e.score * comboMult());
  if (player.killHeal > 0) player.hp = Math.min(player.maxHp, player.hp + player.killHeal);

  burst(e.x, e.y, e.color, e.kind === 'boss' ? 60 : 14, e.kind === 'boss' ? 620 : 330, e.kind === 'boss' ? 4 : 2.6);
  addParticle(e.x, e.y, 0, 0, 0.34, e.r * 2.1, e.color, 'ring');
  sfx(e.kind === 'boss' ? 'bossdown' : 'kill');

  if (e.kind === 'boss') {
    score += 300;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
    player.energy = player.energyMax;
    shake = Math.max(shake, 22);
    flashW = 0.6;
    for (let i = 0; i < 4; i++) {
      burst(e.x + rand(-50, 50), e.y + rand(-50, 50), i % 2 ? '#ff4f6d' : '#ffb347', 18, 500, 3);
    }
    toast('母舰击毁 · 生命与脉冲已恢复');
  }

  if (e.kind === 'splitter' && e.gen === 0) {
    for (let i = 0; i < 2; i++) {
      const a = rand(0, TAU);
      const child = createEnemy('drone', e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18);
      child.hp = child.maxHp = Math.max(6, Math.round(e.maxHp * 0.34));
      child.gen = 1;
      child.speed *= 1.15;
      child.r *= 0.82;
      enemies.push(child);
    }
  }

  // xp gems
  let left = e.xp;
  while (left > 0) {
    const v = Math.min(left, 10);
    left -= v;
    const a = rand(0, TAU), sp = rand(50, 150);
    gems.push({
      x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 10,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 4.6, val: v, t: rand(0, TAU), color: e.color, dead: false
    });
  }
}

function explodeAt(x, y, dmg, radius) {
  addParticle(x, y, 0, 0, 0.28, radius, '#ffb347', 'ring');
  burst(x, y, '#ffb347', 12, 320, 2.6);
  for (const e of enemies) {
    if (e.dead) continue;
    if (d2(x, y, e.x, e.y) < (radius + e.r) ** 2) hitEnemy(e, dmg, false);
  }
}

function hurtPlayer(dmg) {
  if (player.invuln > 0 || player.dashTime > 0 || state !== 'playing') return;
  player.hp -= dmg;
  player.invuln = 0.7;
  combo = 0;
  flashR = 0.6;
  shake = Math.max(shake, 10);
  burst(player.x, player.y, '#ff4f6d', 10, 260, 2.4);
  sfx('hurt');
  if (player.hp <= 0) {
    player.hp = 0;
    gameOver();
  }
}

function updatePBullets(dt) {
  for (const b of pBullets) {
    if (b.dead) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -40 || b.x > VW + 40 || b.y < -40 || b.y > VH + 40) {
      b.dead = true;
      continue;
    }
    for (const e of enemies) {
      if (e.dead) continue;
      if (d2(b.x, b.y, e.x, e.y) < (b.r + e.r * 0.92) ** 2) {
        if (b.hits && b.hits.includes(e)) continue;
        hitEnemy(e, b.dmg * (b.crit ? 2 : 1), b.crit);
        for (let i = 0; i < 3; i++) spark(b.x, b.y, b.crit ? '#ffe66d' : '#c8fdff');
        if (b.explode > 0) explodeAt(e.x, e.y, b.dmg * 0.5, 58 + b.explode * 12);
        if (b.pierce > 0) { b.pierce--; (b.hits || (b.hits = [])).push(e); }
        else { b.dead = true; break; }
      }
    }
  }
}

function updateEBullets(dt) {
  const p = player;
  for (const b of eBullets) {
    if (b.dead) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -30 || b.x > VW + 30 || b.y < -30 || b.y > VH + 30) {
      b.dead = true;
      continue;
    }
    if (p.invuln <= 0 && p.dashTime <= 0 && d2(b.x, b.y, p.x, p.y) < (b.r + p.r * 0.85) ** 2) {
      b.dead = true;
      burst(b.x, b.y, '#ff4fd8', 6, 200, 2);
      hurtPlayer(b.dmg);
    }
  }
}

function updateGems(dt) {
  const p = player;
  for (const g of gems) {
    if (g.dead) continue;
    g.t += dt;
    const dx = p.x - g.x, dy = p.y - g.y;
    const d = Math.hypot(dx, dy) || 0.001;
    if (d < p.magnet) {
      const sp = 280 + (p.magnet - d) * 2.2;
      g.x += dx / d * sp * dt;
      g.y += dy / d * sp * dt;
      if (d < p.r + 9) {
        g.dead = true;
        addXP(g.val);
        spark(g.x, g.y, g.color);
        sfx('pick');
      }
    } else {
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.93; g.vy *= 0.93;
    }
  }
}

function addXP(v) {
  const p = player;
  p.xp += v;
  while (p.xp >= p.xpNeed) {
    p.xp -= p.xpNeed;
    p.level++;
    p.xpNeed = Math.round(12 + p.level * 7.5);
    pendingLevels++;
    p.hp = Math.min(p.maxHp, p.hp + 6);
    flashW = Math.max(flashW, 0.16);
    addParticle(p.x, p.y, 0, 0, 0.5, 90, '#ffe66d', 'ring');
    sfx('level');
    pendingLevels = Math.min(pendingLevels, 6);
  }
  if (pendingLevels > 0 && state === 'playing') openUpgrade();
}

/* ---------------- effects update ---------------- */
function updateParticles(dt) {
  for (const q of particles) {
    if (q.dead) continue;
    q.life -= dt;
    if (q.life <= 0) { q.dead = true; continue; }
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx *= 1 - Math.min(0.9, dt * 2.4);
    q.vy *= 1 - Math.min(0.9, dt * 2.4);
  }
}
function updateTexts(dt) {
  for (const t of texts) {
    if (t.dead) continue;
    t.life -= dt;
    t.y += t.vy * dt;
    if (t.life <= 0) t.dead = true;
  }
}
function updateRings(dt) {
  for (const r of rings) {
    if (r.dead) continue;
    r.r += r.speed * dt;
    for (const e of enemies) {
      if (e.dead || r.hits.has(e)) continue;
      const d = Math.hypot(e.x - r.x, e.y - r.y);
      if (d < r.r + e.r) {
        r.hits.add(e);
        hitEnemy(e, r.dmg, false);
        const nx = (e.x - r.x) / (d || 1), ny = (e.y - r.y) / (d || 1);
        e.vx = nx * 520; e.vy = ny * 520;
        spark(e.x, e.y, '#8ef9ff');
      }
    }
    if (r.r >= r.maxR) r.dead = true;
  }
}

function cleanup() {
  const arrs = [enemies, pBullets, eBullets, gems, particles, texts, rings, markers];
  for (const a of arrs) {
    for (let i = a.length - 1; i >= 0; i--) if (a[i].dead) a.splice(i, 1);
  }
}

/* ---------------- spawning ---------------- */
function updateSpawning(dt) {
  if (waveCleared) {
    restTimer -= dt;
    if (restTimer <= 0) startWave(wave + 1);
    return;
  }

  for (const m of markers) {
    if (m.dead) continue;
    m.t -= dt;
    if (m.t <= 0) {
      m.dead = true;
      enemies.push(createEnemy(m.kind, m.x, m.y));
      burst(m.x, m.y, KINDS[m.kind].color, 8, 180, 2);
      if (m.kind === 'boss') toast('击破 ' + currentBossName);
    }
  }

  if (wavePending.length > 0) {
    spawnTimer -= dt;
    const cap = wave % 5 === 0 ? 1 : 24;
    if (spawnTimer <= 0 && enemies.length + markers.length < cap) {
      spawnMarker(wavePending.shift());
      spawnTimer = Math.max(0.22, 0.55 - wave * 0.012) + rand(-0.05, 0.05);
    }
  }
}

/* ---------------- upgrade flow ---------------- */
function openUpgrade() {
  if (state !== 'playing' && state !== 'upgrading') return;
  state = 'upgrading';
  showPanel(panels[1]);
  renderCards();
}

function renderCards() {
  cards.innerHTML = '';
  const avail = UPGRADES.filter(u => (player.up[u.id] || 0) < u.max);
  const opts = [];
  const pool = avail.slice();
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    opts.push(pool.splice(idx, 1)[0]);
  }
  if (opts.length === 0) opts.push(SUPPLY_CARD);
  for (const u of opts) {
    const lv = player.up[u.id] || 0;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    el.style.setProperty('--c', u.color);
    el.innerHTML =
      `<div class="card-top"><span class="icon">${u.icon}</span><span class="rar">${u.rar}</span></div>` +
      `<h3>${u.name}</h3><p>${u.desc}</p>` +
      `<div class="uplevel">LV ${lv} → ${lv + 1}${u.max < 999 ? ' / ' + u.max : ''}</div>`;
    el.addEventListener('click', () => chooseUpgrade(u));
    cards.appendChild(el);
  }
}

function chooseUpgrade(u) {
  if (state !== 'upgrading') return;
  u.apply(player);
  player.up[u.id] = (player.up[u.id] || 0) + 1;
  pendingLevels--;
  sfx('upgrade');
  syncHud();
  if (pendingLevels > 0) {
    renderCards();
    return;
  }
  state = 'playing';
  hidePanels();
  player.invuln = Math.max(player.invuln, 0.9);
}

/* ---------------- main update ---------------- */
function update(dt) {
  gameTime += dt;
  updatePlayer(dt);
  updateSpawning(dt);
  updateEnemies(dt);
  updatePBullets(dt);
  updateEBullets(dt);
  updateGems(dt);
  updateParticles(dt);
  updateTexts(dt);
  updateRings(dt);

  comboTimer -= dt;
  if (comboTimer <= 0) combo = 0;

  if (!waveCleared && wavePending.length === 0 && markers.length === 0 &&
      enemies.filter(e => !e.dead).length === 0) {
    onWaveCleared();
  }

  cleanup();
  syncHud();
}

/* ---------------- rendering ---------------- */
function drawBackground() {
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = 'rgba(90,200,255,0.055)';
  ctx.lineWidth = 1;
  const gs = 76;
  const ox = (bgTime * 11) % gs, oy = (bgTime * 7) % gs;
  ctx.beginPath();
  for (let x = -gs + ox; x < VW + gs; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
  for (let y = -gs + oy; y < VH + gs; y += gs) { ctx.moveTo(0, y); ctx.lineTo(VW, y); }
  ctx.stroke();
  ctx.restore();

  for (const s of stars) {
    const a = 0.18 + 0.35 * (0.5 + 0.5 * Math.sin(bgTime * s.sp + s.ph));
    ctx.fillStyle = 'rgba(190,240,255,' + (a * s.a).toFixed(3) + ')';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(79,242,255,0.22)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#4ff2ff';
  ctx.shadowBlur = 20;
  ctx.strokeRect(1, 1, VW - 2, VH - 2);
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(glowSprite, -p.r * 4, -p.r * 4, p.r * 8, p.r * 8);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.rotate(p.aim);
  const blink = p.invuln > 0 && Math.floor(p.invuln * 22) % 2 === 0;
  ctx.globalAlpha = blink ? 0.55 : 1;
  ctx.shadowColor = '#4ff2ff';
  ctx.shadowBlur = 18;

  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-12, 11);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-12, -11);
  ctx.closePath();
  ctx.fillStyle = '#eaffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4ff2ff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, TAU);
  ctx.fillStyle = '#ff4fd8';
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();

  if (p.invuln > 0 && p.dashTime <= 0) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#4ff2ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 9, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function polyPath(r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i / sides * TAU;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawEnemies() {
  for (const e of enemies) {
    if (e.dead) continue;
    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = e.kind === 'boss' ? 0.5 : 0.3;
    const gs = e.r * (e.kind === 'boss' ? 6 : 4.6);
    ctx.drawImage(glowSprite, -gs / 2, -gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (e.kind === 'boss') {
      ctx.save();
      ctx.rotate(e.t * 0.6);
      ctx.strokeStyle = rgba(e.color, 0.55);
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.95, Math.sin(a) * e.r * 0.95);
        ctx.lineTo(Math.cos(a) * e.r * 1.22, Math.sin(a) * e.r * 1.22);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.rotate(-e.t * 0.32);
      polyPath(e.r, 8, 0);
      ctx.fillStyle = e.hurt > 0 ? 'rgba(255,255,255,0.75)' : rgba(e.color, 0.2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = e.hurt > 0 ? '#ffffff' : e.color;
      ctx.stroke();
      ctx.restore();

      polyPath(e.r * 0.52, 6, e.t * 0.9);
      ctx.fillStyle = rgba(e.color, 0.6);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffd9e1';
      ctx.stroke();
    } else {
      ctx.rotate(e.rot);
      polyPath(e.r, e.shape, 0);
      ctx.fillStyle = e.hurt > 0 ? 'rgba(255,255,255,0.7)' : rgba(e.color, 0.16);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = e.hurt > 0 ? '#ffffff' : e.color;
      ctx.stroke();

      polyPath(e.r * 0.48, e.shape, Math.PI / e.shape);
      ctx.fillStyle = rgba(e.color, 0.55);
      ctx.fill();
    }
    ctx.restore();

    if (e.intro > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(bgTime * 14);
      ctx.strokeStyle = '#ff4f6d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.35, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (e.kind !== 'boss' && e.maxHp >= 26 && e.hp < e.maxHp) {
      const w = e.r * 2, h = 3.5;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 11, w, h);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 11, w * clamp(e.hp / e.maxHp, 0, 1), h);
    }
  }
}

function drawMarkers() {
  for (const m of markers) {
    const k = clamp(m.t / m.max, 0, 1);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(bgTime * 16));
    ctx.strokeStyle = m.kind === 'boss' ? '#ff4f6d' : '#ff8fa4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, m.r * (0.55 + 0.45 * (1 - k)), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(-m.r * 0.7, 0); ctx.lineTo(m.r * 0.7, 0);
    ctx.moveTo(0, -m.r * 0.7); ctx.lineTo(0, m.r * 0.7);
    ctx.stroke();
    ctx.restore();
  }
}

function drawGems() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of gems) {
    const s = 4.6 + Math.sin(g.t * 5) * 0.9;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g.color;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.t * 2);
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of pBullets) {
    if (b.dead) continue;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = b.crit ? '#ffe66d' : '#4ff2ff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.drawImage(glowSprite, b.x - 15, b.y - 15, 30, 30);
    ctx.fillStyle = '#ecffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of eBullets) {
    if (b.dead) continue;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glowSprite, b.x - 19, b.y - 19, 38, 38);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff8fea';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawRings() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const r of rings) {
    const k = clamp(r.r / r.maxR, 0, 1);
    const a = (1 - k) * 0.9;
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#8ef9ff';
    ctx.lineWidth = 8 * (1 - k) + 1.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = a * 0.35;
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 18 * (1 - k) + 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * 0.96, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const q of particles) {
    if (q.dead) continue;
    const k = clamp(q.life / q.max, 0, 1);
    if (q.type === 'ring') {
      ctx.globalAlpha = k * 0.7;
      ctx.strokeStyle = q.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (1 - k) + 2, 0, TAU);
      ctx.stroke();
    } else if (q.type === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = q.color;
      ctx.lineWidth = q.size;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
      ctx.stroke();
    } else {
      ctx.globalAlpha = k * k;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.size * (0.35 + 0.65 * k), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.save();
  ctx.textAlign = 'center';
  for (const t of texts) {
    if (t.dead) continue;
    const k = clamp(t.life / t.max, 0, 1);
    ctx.globalAlpha = k;
    ctx.font = '700 ' + t.size + 'px "Consolas", monospace';
    ctx.fillStyle = t.color;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawOverlays() {
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, VW, VH);

  if (player.hp / player.maxHp < 0.35 && state === 'playing') {
    const a = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(bgTime * 6));
    const rg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    rg.addColorStop(0, 'rgba(255,40,80,0)');
    rg.addColorStop(1, 'rgba(255,40,80,' + a.toFixed(3) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (flashR > 0) {
    ctx.fillStyle = 'rgba(255,60,90,' + (flashR * 0.35).toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
  if (flashW > 0) {
    ctx.fillStyle = 'rgba(210,250,255,' + (flashW * 0.55).toFixed(3) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}

function render() {
  ctx.setTransform(DPR * scale, 0, 0, DPR * scale, 0, 0);

  if (state === 'title') {
    drawBackground();
    drawOverlays();
    return;
  }

  const sx = shake > 0 ? rand(-shake, shake) : 0;
  const sy = shake > 0 ? rand(-shake, shake) : 0;

  ctx.save();
  ctx.translate(sx, sy);
  drawBackground();
  drawGems();
  drawMarkers();
  drawEnemies();
  drawEBullets();
  drawPBullets();
  drawPlayer();
  drawRings();
  drawParticles();
  drawTexts();
  ctx.restore();

  drawOverlays();
}

/* ---------------- loop ---------------- */
let last = performance.now();
function frame(t) {
  const raw = (t - last) / 1000;
  last = t;
  const dt = Math.min(Math.max(raw, 0), 0.033);

  bgTime += Math.min(raw, 0.1);
  shake = Math.max(0, shake - dt * 90);
  flashW = Math.max(0, flashW - dt * 3.2);
  flashR = Math.max(0, flashR - dt * 2.6);

  if (state === 'playing') update(dt);

  render();
  requestAnimationFrame(frame);
}

/* ---------------- orientation ---------------- */
function checkOrientation() {
  const need = isTouch && !dismissedRotate && cssH > cssW * 1.05 && state !== 'title';
  rotateHint.classList.toggle('hidden', !need);
}

/* ---------------- boot ---------------- */
bestText.textContent = best;
overBest.textContent = '最高分 ' + best;
muteBtn.textContent = '♪';

resize();
player.x = VW / 2;
player.y = VH / 2;
syncHud();
hud.classList.add('hidden');
if (isTouch) {
  touchUI.classList.remove('hidden');
  stickZone.style.display = 'block';
}
stickZone.style.display = isTouch ? 'block' : 'none';
showPanel(panels[0]);

window.addEventListener('resize', resize);
document.addEventListener('contextmenu', (e) => e.preventDefault());

requestAnimationFrame(frame);
})();
