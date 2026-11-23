/* Stick Brawl: game engine. Edit fighters in characters.js, not here. */
(() => {
'use strict';

// ---------- constants ----------
const W = 1280, H = 720, GROUND = 610;
const GRAV = 2600, WALK = 330, JUMP_V = -1050;
const MAX_HP = 100, BAR = 100, BARS = 3;
const SUPER_COST = [1, 2, 3];          // bars needed for power 1, 2, 3
const TIER_POWER = [1, 1.65, 2.5];     // strength of power 1, 2, 3
const ROUND_TIME = 60, WINS_NEEDED = 2;
const TAU = Math.PI * 2;
// a0..a1 is the time window in which the move can connect.
const ATTACKS = {
  punch: { dur: .26, a0: .07, a1: .15, reach: 78,  hy: 150, dmg: 5,  kb: 220, kby: 0,    stun: .32, meter: 14 },
  kick:  { dur: .40, a0: .13, a1: .23, reach: 98,  hy: 95,  dmg: 8,  kb: 340, kby: -150, stun: .32, meter: 18 },
  // power smack: slow wind-up, big damage, breaks a block
  smack: { dur: .80, a0: .42, a1: .52, reach: 108, hy: 150, dmg: 15, kb: 820, kby: -480, stun: .75, meter: 22, guardBreak: true },
  // grab: short reach, cannot be blocked, only works on a fighter standing on the ground
  grab:  { dur: .45, a0: .10, a1: .18, reach: 72,  hy: 150 },
};
const HOLD_TIME = .9;     // seconds a grab lasts before an automatic forward throw
const TECH_TIME = .25;    // the grabbed fighter can press grab within this time to break free
const THROW_DMG = 11;
const KEYMAP = [
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', grab: 'KeyC', smack: 'KeyV', s1: 'KeyR', s2: 'KeyT', s3: 'KeyY' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL', grab: 'KeyM', smack: 'Comma', s1: 'KeyI', s2: 'KeyO', s3: 'KeyP' },
];
const KEYLBL = [['R', 'T', 'Y'], ['I', 'O', 'P']];
const ACTIONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'grab', 'smack', 's1', 's2', 's3'];
const GAME_CODES = new Set(['Space', ...KEYMAP.flatMap(m => Object.values(m))]);
const TYPE_LABEL = {
  projectile: 'shoots forward', freeze: 'freezes the enemy', rain: 'falls from the sky', dash: 'rush attack',
  slam: 'ground shockwave', lightning: 'strikes from above', beam: 'laser beam', tornado: 'tornado',
  blackhole: 'pulls the enemy in', teleport: 'appears behind, cannot be blocked', heal: 'gives back health',
  shield: 'blocks all damage', giant: 'grows big, hits harder', speed: 'super speed',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = k => 1 - Math.pow(1 - k, 3);
const $ = id => document.getElementById(id);
const FONT_D = n => `${n}px Bungee, Impact, "Arial Black", sans-serif`;
const FONT_B = (w, n) => `${w} ${n}px Rubik, system-ui, sans-serif`;

// ---------- canvas ----------
const cv = $('game'), ctx = cv.getContext('2d');
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H), dpr = Math.min(2, devicePixelRatio || 1);
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
}
addEventListener('resize', fit); fit();

// ---------- roster + photos ----------
const ROSTER = (window.ROSTER || []).slice(0, 10);
ROSTER.forEach((ch, i) => {
  ch.color = ch.color || '#ffffff';
  ch.supers = (ch.supers || []).slice(0, 3);
  ch.initials = ch.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  ch.imgOk = false; ch.faceEls = [];
  const numbered = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG'].map(e => `photos/${i + 1}.${e}`);
  const cands = ch.photo ? [ch.photo, ...numbered] : numbered;
  let k = 0; const img = new Image();
  img.onload = () => { ch.imgOk = true; ch.faceEls.forEach(el => setFace(el, ch)); };
  img.onerror = () => { if (++k < cands.length) img.src = cands[k]; };
  img.src = cands[0]; ch.img = img;
});
function setFace(el, ch) {
  el.textContent = ''; el.style.setProperty('--c', ch.color);
  if (ch.imgOk) { const im = document.createElement('img'); im.src = ch.img.src; im.alt = ''; el.appendChild(im); }
  else el.textContent = ch.initials;
}

// ---------- sound (made in code, no files) ----------
let AC = null, noiseBuf = null;
function audio() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* no sound */ } }
function tone(f, d, type = 'square', v = .08, f2 = 0, delay = 0) {
  if (!AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, v = .2, freq = 1000, delay = 0) {
  if (!AC) return;
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate * .8, AC.sampleRate); const c = noiseBuf.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = .8;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.connect(f).connect(g).connect(AC.destination); s.start(t); s.stop(t + d + .02);
}
const SFX_RAW = {
  grab: () => { noise(.08, .25, 1500); tone(200, .1, 'square', .06, 120); },
  toss: () => { noise(.25, .18, 900); tone(500, .25, 'sawtooth', .05, 120); },
  charge: () => tone(120, .42, 'sawtooth', .07, 520),
  giant: () => tone(400, .6, 'sawtooth', .08, 80),
  speed: () => tone(300, .4, 'square', .05, 1600),
  hit: d => { noise(.14, .35, 700); tone(Math.max(60, 160 - d * 3), .14, 'sine', .3, 50); },
  block: () => { noise(.07, .2, 3200); tone(900, .05, 'square', .04); },
  whoosh: () => noise(.09, .06, 1800),
  jump: () => tone(300, .12, 'square', .035, 600),
  super: () => { tone(180, .55, 'sawtooth', .08, 900); tone(360, .55, 'square', .035, 1800, .05); },
  boom: () => { tone(90, .7, 'sine', .4, 30); noise(.6, .35, 300); },
  zap: () => { noise(.3, .3, 4000); tone(1200, .25, 'sawtooth', .06, 200); },
  heal: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .25, 'triangle', .07, 0, i * .07)),
  blip: () => tone(660, .06, 'square', .05),
  pick: () => { tone(523, .08, 'square', .06); tone(784, .14, 'square', .06, 0, .08); },
  ko: () => { tone(220, 1.2, 'sawtooth', .1, 40); noise(.8, .3, 500); },
  bell: () => { tone(880, .6, 'triangle', .1); tone(1320, .5, 'sine', .06, 0, .02); },
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, .3, 'square', .05, 0, i * .12)),
};
// In an online match the host also records each sound, so the guest can play it too.
const SFX = {};
for (const k in SFX_RAW) SFX[k] = (...a) => { SFX_RAW[k](...a); if (onlineHost()) net.snd.push([k, ...a]); };

// ---------- input (keyboard + game controllers) ----------
const keys = new Set(), justDown = new Set();
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

class Ctl {
  // cpu: the computer plays.  remote: keys come from the other player over the network.
  // merge: online, the local player can use either key set (WASD side or arrows side).
  constructor(i) { this.i = i; this.held = {}; this.prev = {}; this.tap = {}; this.cpu = null; this.remote = null; this.merge = false; }
  poll(me, opp, dt) {
    this.prev = this.held; const h = {}, tap = {};
    if (this.cpu) { if (me) Object.assign(h, this.cpu.think(me, opp, dt)); }
    else if (this.remote) { Object.assign(h, this.remote.held); Object.assign(tap, this.remote.taps); this.remote.taps = {}; }
    else {
      const maps = this.merge ? KEYMAP : [KEYMAP[this.i]];
      for (const a of ACTIONS) for (const m of maps) { h[a] = h[a] || keys.has(m[a]); tap[a] = tap[a] || justDown.has(m[a]); }
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[this.merge ? 0 : this.i];
      if (gp) {
        const b = n => !!(gp.buttons[n] && gp.buttons[n].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        h.left = h.left || ax < -.4 || b(14); h.right = h.right || ax > .4 || b(15);
        h.up = h.up || b(0) || b(12) || ay < -.7; h.down = h.down || b(13) || b(6) || ay > .7;
        h.punch = h.punch || b(2); h.kick = h.kick || b(3); h.smack = h.smack || b(1); h.grab = h.grab || b(7);
        h.s1 = h.s1 || b(4); h.s2 = h.s2 || b(5); h.s3 = h.s3 || b(10) || b(11);
      }
    }
    this.held = h; this.tap = tap;
  }
  pressed(a) { return (this.held[a] && !this.prev[a]) || !!this.tap[a]; }
}
const ctls = [new Ctl(0), new Ctl(1)];

// Computer player
class CPU {
  constructor() { this.t = 0; this.move = 0; this.block = false; this.act = null; }
  think(me, opp, dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = rnd(.12, .3); this.move = 0; this.block = false; this.act = null;
      const dx = opp.x - me.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
      const bars = Math.floor(me.meter / BAR);
      const threat = opp.atk || opp.dashing || effects.some(e => e.owner === opp);
      if (me.holding) {
        // throw: forward, or press away from the facing side to throw backward
        this.act = Math.random() < .6 ? 'grab' : me.facing > 0 ? 'left' : 'right';
      } else if (me.grabbed) {
        if (Math.random() < .3) this.act = 'grab';
      } else if (bars >= 1 && Math.random() < .2) {
        const opts = [0, 1, 2].filter(i => SUPER_COST[i] <= bars);
        const pick = Math.random() < .6 ? opts[opts.length - 1] : opts[Math.floor(Math.random() * opts.length)];
        this.act = 's' + (pick + 1);
      } else if (threat && dist < 220 && Math.random() < .45) this.block = true;
      else if (dist > 120) { this.move = dir; if (Math.random() < .1) this.act = 'up'; }
      else {
        const r = Math.random();
        this.act = r < .38 ? 'punch' : r < .64 ? 'kick' : r < .76 ? 'grab' : r < .84 ? 'smack' : r < .9 ? 'up' : null;
        if (opp.blocking && Math.random() < .5) this.act = Math.random() < .6 ? 'grab' : 'smack';
        if (Math.random() < .2) this.move = -dir;
      }
    }
    const h = { left: this.move < 0, right: this.move > 0, down: this.block };
    if (this.act) { h[this.act] = true; this.act = null; }
    return h;
  }
}

// ---------- world state ----------
let phase = 'title', prevPhase = null, mode = 'pvp';
let P = [], round = 1, timer = ROUND_TIME, phaseT = 0, fightCalled = false;
let effects = [], particles = [], texts = [];
let shake = 0, hitstop = 0, scrFlash = 0, flashCol = '#fff', slow = 0, clock = 0;
let cutin = null, big = null;
let chosen = [0, 1];
// Online state. null when not online.
// { ws, room, role: 0 host / 1 guest, ready, snd: sounds to send, np: new particles to send }
let net = null;
function onlineHost() { return !!(net && net.ready && net.role === 0); }
function isGuest() { return !!(net && net.ready && net.role === 1); }

// ---------- fighter ----------
const TIMERS = ['stun', 'frozen', 'shield', 'giant', 'speed', 'cast', 'flash', 'invuln'];
class Fighter {
  constructor(ch, idx, color) { this.ch = ch; this.idx = idx; this.color = color; this.wins = 0; this.meter = 0; this.reset(); }
  reset() {
    this.x = this.idx ? 880 : 400; this.y = GROUND; this.vx = 0; this.vy = 0; this.facing = this.idx ? -1 : 1;
    this.hp = MAX_HP; this.hpShow = MAX_HP; this.atk = null; this.atkT = 0; this.hitDone = false; this.punchSide = 0;
    for (const k of TIMERS) this[k] = 0;
    this.ko = false; this.koT = 0; this.dashing = null; this.walkPh = 0; this.blocking = false; this.scale = 1; this.win = false;
    this.holding = null;   // { o: opponent, t: seconds held } while this fighter holds the opponent
    this.grabbed = null;   // the fighter who holds this one
    this.grabbedT = 0;
  }
  get onGround() { return this.y >= GROUND - .5; }
  get dmgMul() { return this.giant > 0 ? 1.7 : 1; }
  get free() { return !this.ko && this.stun <= 0 && this.frozen <= 0 && this.cast <= 0 && !this.dashing && !this.holding && !this.grabbed; }
  bodyBox() { const s = this.scale; return { x0: this.x - 30 * s, x1: this.x + 30 * s, y0: this.y - 235 * s, y1: this.y }; }

  update(dt, ctl, opp, fighting) {
    for (const k of TIMERS) this[k] = Math.max(0, this[k] - dt);
    this.scale = lerp(this.scale, this.giant > 0 ? 1.45 : 1, Math.min(1, dt * 8));
    this.hpShow = lerp(this.hpShow, this.hp, Math.min(1, dt * 2.5));
    const spd = this.speed > 0 ? 1.6 : 1;
    if (this.ko) this.koT += dt;

    if (this.holding) this.updateHold(dt, ctl, fighting);
    if (this.grabbed) {
      this.grabbedT += dt;
      if (fighting && this.grabbedT < TECH_TIME && ctl.pressed('grab')) breakGrab(this.grabbed, this);
    }

    if (fighting && this.free) {
      if (!this.atk && this.onGround && Math.abs(opp.x - this.x) > 4) this.facing = Math.sign(opp.x - this.x);
      for (let i = 0; i < 3; i++) {
        if (this.ch.supers[i] && ctl.pressed('s' + (i + 1)) && this.meter >= SUPER_COST[i] * BAR) {
          this.meter -= SUPER_COST[i] * BAR; useSuper(this, opp, i); break;
        }
      }
    }
    if (fighting && this.free) {
      this.blocking = !!ctl.held.down && this.onGround && !this.atk;
      let mv = (ctl.held.right ? 1 : 0) - (ctl.held.left ? 1 : 0);
      if (this.blocking || (this.atk && this.onGround)) mv = 0;
      if (this.onGround) this.vx = mv * WALK * spd; else if (mv) this.vx = mv * WALK * spd;
      if (ctl.pressed('up') && this.onGround && !this.atk) { this.vy = JUMP_V; SFX.jump(); }
      if (!this.atk) {
        for (const k of ['punch', 'kick', 'smack', 'grab']) {
          if (!ctl.pressed(k)) continue;
          if ((k === 'smack' || k === 'grab') && !this.onGround) continue;   // ground only
          this.startAtk(k); break;
        }
      }
    } else {
      this.blocking = false;
      if (this.dashing) { /* the dash effect moves us */ }
      else if (this.stun > 0 || this.ko) { if (this.onGround) this.vx *= Math.pow(.004, dt); }
      else if (this.onGround) this.vx = 0;
    }
    if (this.frozen > 0) this.vx = 0;

    if (this.atk) {
      const A = ATTACKS[this.atk]; this.atkT += dt * spd;
      if (this.atk === 'smack' && this.atkT < A.a0 && Math.random() < .7) {
        // charging: sparks gather at the fist
        const hx = this.x - this.facing * 40 * this.scale, hy = this.y - 150 * this.scale, a = rnd(0, TAU);
        addP({ x: hx + Math.cos(a) * 60, y: hy + Math.sin(a) * 60, vx: -Math.cos(a) * 200, vy: -Math.sin(a) * 200, life: .28, max: .28, col: this.color, r: rnd(2, 4), g: 0 });
      }
      if (!this.hitDone && this.atkT >= A.a0 && this.atkT <= A.a1 && !this.ko && this.stun <= 0) this.tryHit(A, opp);
      if (this.atk && this.atkT >= A.dur) this.atk = null;
    }
    this.vy += GRAV * dt; this.y += this.vy * dt;
    if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; }
    this.x = clamp(this.x + this.vx * dt, 40, W - 40);
    if (this.onGround && Math.abs(this.vx) > 10) this.walkPh += dt * 12 * spd;
  }
  startAtk(k) {
    this.atk = k; this.atkT = 0; this.hitDone = false;
    if (k === 'punch') this.punchSide ^= 1;
    if (k === 'smack') SFX.charge(); else SFX.whoosh();
  }
  tryHit(A, opp) {
    const s = this.scale, dx = (opp.x - this.x) * this.facing, hitY = this.y - A.hy * s, ob = opp.bodyBox();
    if (!(dx > -10 && dx < A.reach * s + 30 * opp.scale && hitY > ob.y0 && hitY < ob.y1)) return;
    if (this.atk === 'grab') {
      if (opp.ko || !opp.onGround || opp.invuln > 0 || opp.shield > 0 || opp.dashing || opp.grabbed || opp.holding || opp.win) return;
      this.hitDone = true; startGrab(this, opp); return;
    }
    this.hitDone = true;
    hit(opp, this, A.dmg * this.dmgMul, { kbx: A.kb * this.facing, kby: A.kby, stun: A.stun, meter: A.meter, guardBreak: A.guardBreak, x: this.x + this.facing * A.reach * s * .9, y: hitY });
    if (this.atk === 'smack') { shake = Math.max(shake, 16); sparks(this.x + this.facing * A.reach * s, hitY, '#ffffff', 14); }
  }
  updateHold(dt, ctl, fighting) {
    const h = this.holding; h.t += dt;
    if (!fighting || this.ko) { release(this); return; }
    if (h.t < .12) return;   // ignore the press that started the grab
    const back = ctl.pressed(this.facing > 0 ? 'left' : 'right');
    const fwd = ctl.pressed(this.facing > 0 ? 'right' : 'left') || ctl.pressed('grab') || ctl.pressed('punch') || ctl.pressed('kick') || ctl.pressed('smack');
    if (back) throwOpp(this, -1); else if (fwd || h.t >= HOLD_TIME) throwOpp(this, 1);
  }
}

// ---------- grab and throw ----------
function startGrab(a, t) {
  a.holding = { o: t, t: 0 }; a.atk = null; a.vx = 0;
  t.grabbed = a; t.grabbedT = 0; t.atk = null; t.blocking = false; t.stun = 0; t.cast = 0; t.vx = 0; t.vy = 0;
  SFX.grab(); sparks(t.x, t.y - 150, '#ffffff', 8);
  texts.push({ x: t.x, y: t.y - 270, s: 'GRAB', col: '#ffd23f', life: .6 });
}
function release(a) {
  if (!a.holding) return;
  a.holding.o.grabbed = null; a.holding = null;
}
// dir 1 throws forward, -1 swings the opponent over to the other side
function throwOpp(a, dir) {
  const t = a.holding.o; release(a);
  if (dir < 0) { t.x = clamp(a.x - a.facing * 60 * a.scale, 40, W - 40); a.facing = -a.facing; }
  t.y = GROUND - 60; SFX.toss();
  hit(t, a, THROW_DMG * a.dmgMul, { kbx: a.facing * 620, kby: -800, stun: .95, unblockable: true, meter: 20, x: t.x, y: t.y - 100 });
  shake = Math.max(shake, 12);
}
// the grabbed fighter pressed grab in time: both are pushed apart
function breakGrab(a, t) {
  release(a);
  a.vx = -a.facing * 420; t.vx = a.facing * 420; a.stun = .22; t.stun = .22;
  SFX.block(); sparks((a.x + t.x) / 2, t.y - 150, '#bfe3ff', 12);
  texts.push({ x: t.x, y: t.y - 270, s: 'BREAK!', col: '#bfe3ff', life: .7 });
}
// keep the held fighter in front of the holder
function holdPosition(a) {
  if (!a.holding) return;
  const t = a.holding.o;
  t.x = clamp(a.x + a.facing * 62 * a.scale, 40, W - 40); t.y = Math.min(GROUND, a.y) - 30;
  t.vx = 0; t.vy = 0; t.facing = -a.facing;
}

function pushApart(a, b) {
  if (a.ko || b.ko || a.dashing || b.dashing || a.holding || b.holding || Math.abs(a.y - b.y) > 120) return;
  const dx = b.x - a.x, min = 55 * Math.max(a.scale, b.scale);
  if (Math.abs(dx) < min) {
    const push = (min - Math.abs(dx)) / 2, s = Math.sign(dx) || (a.idx ? -1 : 1);
    a.x = clamp(a.x - push * s, 40, W - 40); b.x = clamp(b.x + push * s, 40, W - 40);
  }
}

// ---------- damage ----------
function hit(t, a, dmg, o = {}) {
  if (t.ko || t.invuln > 0 || t.win) return false;
  const px = o.x ?? t.x, py = o.y ?? t.y - 140;
  if (t.shield > 0) { sparks(px, py, '#9fe8ff', 10); SFX.block(); return false; }
  if (t.holding) release(t);   // a holder who gets hit lets go
  const facingAttacker = Math.sign(a.x - t.x) === t.facing || Math.abs(a.x - t.x) < 5;
  if (t.blocking && facingAttacker && !o.unblockable) {
    dmg *= o.super ? .3 : o.guardBreak ? .35 : .15;
    t.hp = Math.max(1, t.hp - dmg); t.vx = (o.kbx || 0) * .4;
    a.meter = Math.min(BAR * BARS, a.meter + (o.meter ?? 0) * .3);
    sparks(px, py, '#bfe3ff', 8); SFX.block();
    if (o.guardBreak) {
      t.stun = .5; t.blocking = false; t.vx = (o.kbx || 0) * .6; shake = Math.max(shake, 10);
      texts.push({ x: px, y: py - 30, s: 'GUARD BREAK!', col: '#ffd23f', life: .8 });
    } else texts.push({ x: px, y: py - 30, s: 'BLOCK', col: '#bfe3ff', life: .6 });
    return true;
  }
  t.hp -= dmg; t.stun = o.stun ?? .32; t.atk = null; t.vx = o.kbx || 0; if (o.kby) t.vy = o.kby; t.flash = .12;
  if (o.freeze) { t.frozen = o.freeze; t.stun = 0; }
  a.meter = Math.min(BAR * BARS, a.meter + (o.meter ?? dmg * 1.6));
  t.meter = Math.min(BAR * BARS, t.meter + dmg * .6);
  sparks(px, py, a.color, 12 + Math.round(dmg));
  shake = Math.min(18, shake + dmg * .8);
  hitstop = Math.max(hitstop, Math.min(.12, .03 + dmg * .004));
  texts.push({ x: px, y: py - 30, s: String(Math.max(1, Math.round(dmg))), col: '#fff', life: .8 });
  SFX.hit(dmg);
  if (t.hp <= 0) {
    if (t.grabbed) release(t.grabbed);
    t.hp = 0; t.ko = true; t.koT = 0; t.stun = 0; t.frozen = 0; t.shield = 0; t.dashing = null;
    t.vy = -650; t.vx = (o.kbx ? Math.sign(o.kbx) : -t.facing) * 380;
    endRound('ko');
  }
  return true;
}

// ---------- particles ----------
// All particles go through addP. Online, the host also sends each new particle to the guest.
function addP(p) {
  particles.push(p);
  if (onlineHost() && net.np.length < 400) net.np.push(p);
}
function sparks(x, y, col, n) {
  for (let k = 0; k < n; k++) addP({ x, y, vx: rnd(-350, 350), vy: rnd(-480, 120), life: rnd(.3, .6), max: .6, col, r: rnd(2, 5), g: 1400 });
}
function puff(x, y, col) {
  for (let k = 0; k < 26; k++) addP({ x: x + rnd(-40, 40), y: y + rnd(-90, 90), vx: rnd(-120, 120), vy: rnd(-120, 60), life: rnd(.4, .8), max: .8, col: k % 3 ? '#8a7aa8' : col, r: rnd(6, 14), g: 0 });
}
function stepParticles(dt) {
  for (const p of particles) { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  if (particles.length > 700) particles.splice(0, particles.length - 700);
}

// ---------- effect drawing helpers ----------
function orb(x, y, r, col) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
  g.addColorStop(0, '#ffffff'); g.addColorStop(.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, TAU); ctx.fill(); ctx.restore();
}
function glyph(ch, x, y, size, col, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.font = `${size}px "Segoe UI Symbol", "Noto Sans Symbols", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = col; ctx.fillText(ch, 0, 0); ctx.restore();
}

// ---------- super powers ----------
// An effect is { s, update(dt) }. update returns false when the effect is over.
// "s" is a plain object with everything needed to draw the effect; s.k picks the DRAW function.
// Online, the host sends the "s" objects to the guest, and the guest draws them with the same DRAW functions.
// Effects with nothing to draw have no "s".
function addFx(owner, e) { e.owner = owner; effects.push(e); }

const DRAW = {
  shot(s) {
    if (s.t < 0) return;
    orb(s.x, s.y, s.r, s.col);
    if (s.glyph) glyph(s.glyph, s.x, s.y, s.r * 2, '#ffffff', s.spinning ? s.spin : Math.sin(s.spin * .5) * .25);
  },
  rain(s) {
    if (s.t < 0) return;
    if (s.glyph) { orb(s.x, s.y, s.sz * .5, s.col); glyph(s.glyph, s.x, s.y, s.sz * 1.6, '#ffffff', Math.sin(s.spin) * .4); return; }
    ctx.save(); ctx.strokeStyle = s.col; ctx.globalAlpha = .6; ctx.lineWidth = s.sz * .5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.x, s.y - s.sz * 3); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.restore();
    orb(s.x, s.y, s.sz * .7, s.col);
  },
  slam(s) {
    if (!s.landed) return;
    const a = Math.max(0, 1 - s.r / 700);
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = s.col; ctx.shadowColor = s.col; ctx.shadowBlur = 20;
    for (const side of [-1, 1]) {
      const x = s.ox + side * s.r;
      for (let q = 0; q < 3; q++) {
        const xx = x - side * q * 34, hgt = (90 - q * 25) * (.4 + a * .6);
        ctx.beginPath(); ctx.moveTo(xx - 18, GROUND); ctx.lineTo(xx, GROUND - hgt); ctx.lineTo(xx + 18, GROUND); ctx.closePath(); ctx.fill();
      }
    }
    ctx.fillRect(s.ox - s.r, GROUND - 3, s.r * 2, 6);
    ctx.restore();
  },
  bolt(s) {
    if (s.t < 0 || s.tx === null) return;
    ctx.save();
    if (!s.pts) {
      ctx.globalAlpha = .4 + .4 * Math.sin(s.t * 40); ctx.fillStyle = s.col;
      ctx.beginPath(); ctx.ellipse(s.tx, GROUND + 2, 70, 12, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = .25; ctx.fillRect(s.tx - 3, 0, 6, GROUND);
    } else {
      ctx.globalAlpha = Math.max(0, 1 - (s.t - .5) / .35); ctx.lineJoin = 'round'; ctx.shadowColor = s.col; ctx.shadowBlur = 30;
      for (const [w, c] of [[14, s.col], [5, '#ffffff']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
        s.pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
    ctx.restore();
  },
  beam(s) {
    const f = P[s.f]; if (!f) return;
    const y = f.y - 150 * f.scale, x0 = f.x + s.dir * 50 * f.scale;
    if (s.t < .2) { orb(x0, y, 10 + s.t * 120, s.col); return; }
    const th = (22 + s.i * 8) * (1 + .15 * Math.sin(s.t * 60)) * Math.min(1, (1 - s.t) * 5);
    if (th <= 0) return;
    const x1 = s.dir > 0 ? W + 20 : -20, left = Math.min(x0, x1), w = Math.abs(x1 - x0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .55; ctx.fillStyle = s.col; ctx.fillRect(left, y - th, w, th * 2);
    ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(left, y - th * .35, w, th * .7);
    ctx.restore(); orb(x0, y, th * 1.2, s.col);
  },
  tornado(s) {
    ctx.save(); ctx.strokeStyle = s.col; ctx.lineWidth = 4; ctx.globalAlpha = .85; ctx.shadowColor = s.col; ctx.shadowBlur = 14;
    for (let k = 0; k < 12; k++) {
      const yy = GROUND - k * 22 * s.sc, w = (10 + k * 7) * s.sc, off = Math.sin(s.t * 12 + k * .7) * 10 * s.sc;
      ctx.beginPath(); ctx.ellipse(s.x + off, yy, w, 6 * s.sc, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  },
  hole(s) {
    const k = s.t < 1.6 ? Math.min(1, s.t * 4) : Math.max(0, 1 - (s.t - 1.6) / .3);
    const r = s.R * k * (1 + .08 * Math.sin(s.t * 20)); if (r < 1) return;
    ctx.save();
    const g = ctx.createRadialGradient(s.cx, s.cy, r * .2, s.cx, s.cy, r * 2.2);
    g.addColorStop(0, '#000000'); g.addColorStop(.45, '#000000'); g.addColorStop(.6, s.col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.cx, s.cy, r * 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = s.col; ctx.lineWidth = 3;
    for (let q = 0; q < 3; q++) { const a = s.t * (4 + q); ctx.beginPath(); ctx.arc(s.cx, s.cy, r * (1.1 + q * .35), a, a + Math.PI * 1.2); ctx.stroke(); }
    ctx.restore();
  },
};

function useSuper(f, o, i) {
  const sp = f.ch.supers[i], pw = TIER_POWER[i], col = sp.color || f.color;
  f.atk = null; f.blocking = false; f.cast = .4;
  if (Math.abs(o.x - f.x) > 2) f.facing = Math.sign(o.x - f.x);
  cutin = { f, name: sp.name, col, t: 0 };
  hitstop = .45; scrFlash = .6; flashCol = col; SFX.super();
  (SUPERS[sp.type] || SUPERS.projectile)(f, o, pw, sp, col, i);
}

function shoot(f, o, p) {
  const dir = f.facing;
  const s = { k: 'shot', t: -p.delay, x: 0, y: 0, spin: 0, r: p.r, col: p.col, glyph: p.glyph, spinning: !!p.spin };
  const place = () => { s.x = f.x + dir * 55 * f.scale; s.y = f.y - 150 * f.scale; };
  place();
  addFx(f, {
    s,
    update(dt) {
      s.t += dt; if (s.t < 0) { place(); return true; }
      s.x += dir * p.speed * dt; s.spin += dt * 14;
      if (Math.random() < .7) addP({ x: s.x - dir * p.r, y: s.y + rnd(-p.r, p.r) * .5, vx: -dir * rnd(40, 120), vy: rnd(-40, 40), life: .35, max: .35, col: p.col, r: rnd(2, 5), g: 0 });
      const b = o.bodyBox();
      if (!o.ko && s.x + p.r > b.x0 && s.x - p.r < b.x1 && s.y + p.r > b.y0 && s.y - p.r < b.y1) {
        hit(o, f, p.dmg, { kbx: dir * 420, kby: -220, stun: .45, super: true, freeze: p.freeze, x: s.x, y: s.y, meter: 0 });
        sparks(s.x, s.y, p.col, 18); return false;
      }
      return s.x > -100 && s.x < W + 100;
    },
  });
}

const SUPERS = {
  projectile(f, o, pw, sp, col, i) {
    const n = sp.count || 1;
    for (let k = 0; k < n; k++) shoot(f, o, { delay: k * .14, dmg: 13 * pw / n * (n > 1 ? 1.2 : 1), r: 16 + i * 6, col, glyph: sp.glyph, spin: sp.spin, speed: 950 });
  },
  freeze(f, o, pw, sp, col, i) {
    shoot(f, o, { delay: 0, dmg: 8 * pw, r: 18 + i * 5, col, glyph: sp.glyph || '❄', speed: 800, freeze: 1 + i * .6 });
  },
  rain(f, o, pw, sp, col, i) {
    const n = 7 + i * 4, each = 13 * pw / (n * .5), pool = { left: 15 * pw };
    for (let k = 0; k < n; k++) {
      const s = { k: 'rain', t: -(k * .09 + rnd(0, .1)), x: clamp(o.x + rnd(-170, 170), 20, W - 20), y: -40, spin: rnd(0, TAU), sz: rnd(14, 22) + i * 3, col, glyph: sp.glyph };
      const vy = rnd(750, 1000);
      addFx(f, {
        s,
        update(dt) {
          s.t += dt; if (s.t < 0) return true;
          s.y += vy * dt; s.spin += dt * 6;
          const b = o.bodyBox();
          if (!o.ko && s.x > b.x0 - s.sz * .6 && s.x < b.x1 + s.sz * .6 && s.y > b.y0 && s.y < b.y1) {
            const d = Math.min(each, pool.left);
            if (d > 0) { pool.left -= d; hit(o, f, d, { kbx: Math.sign(o.x - f.x || 1) * 120, stun: .3, super: true, x: s.x, y: s.y, meter: 0 }); }
            return false;
          }
          if (s.y >= GROUND) { sparks(s.x, GROUND - 4, col, 6); return false; }
          return true;
        },
      });
    }
  },
  dash(f, o, pw, sp, col) {
    f.cast = 0; const dir = f.facing; f.dashing = { t: .4, hit: false }; f.invuln = .4; SFX.whoosh();
    addFx(f, {
      update(dt) {
        const d = f.dashing; if (!d) return false;
        d.t -= dt; f.vx = dir * 1500;
        addP({ x: f.x - dir * 20, y: f.y - rnd(40, 200) * f.scale, vx: -dir * 200, vy: 0, life: .25, max: .25, col, r: rnd(3, 7), g: 0 });
        if (!d.hit && !o.ko && Math.abs(o.x - f.x) < 80 * f.scale && Math.abs(o.y - f.y) < 170) {
          d.hit = true; d.t = Math.min(d.t, .08);
          hit(o, f, 15 * pw, { kbx: dir * 750, kby: -500, stun: .7, super: true, meter: 0 });
        }
        if (d.t <= 0 || f.x <= 41 || f.x >= W - 41) { f.dashing = null; f.vx = 0; return false; }
        return true;
      },
    });
  },
  slam(f, o, pw, sp, col) {
    f.vy = -1150; f.vx = 0; f.cast = .3;
    const s = { k: 'slam', landed: false, ox: 0, r: 0, col };
    let t = 0, done = false;
    addFx(f, {
      s,
      update(dt) {
        t += dt;
        if (!s.landed) {
          if (t > .15) f.vy += 3000 * dt;
          f.cast = Math.max(f.cast, .05);
          if (t > .2 && f.onGround) {
            s.landed = true; s.ox = f.x; shake = 26; SFX.boom();
            for (let k = 0; k < 24; k++) addP({ x: s.ox + rnd(-60, 60), y: GROUND, vx: rnd(-500, 500), vy: rnd(-700, -200), life: .7, max: .7, col: '#d7b48a', r: rnd(3, 7), g: 1800 });
          }
          return t < 2.5;
        }
        s.r += 1100 * dt;
        if (!done && !o.ko && o.y > GROUND - 60 && Math.abs(o.x - s.ox) < s.r && Math.abs(o.x - s.ox) > s.r - 160) {
          done = true; hit(o, f, 15 * pw, { kbx: Math.sign(o.x - s.ox || 1) * 500, kby: -750, stun: .8, super: true, x: o.x, y: GROUND - 40, meter: 0 });
        }
        return s.r < 700;
      },
    });
  },
  lightning(f, o, pw, sp, col, i) {
    const n = i + 1, dmg = 13 * pw / n;
    for (let k = 0; k < n; k++) {
      const s = { k: 'bolt', t: -k * .5, tx: null, pts: null, col };
      addFx(f, {
        s,
        update(dt) {
          s.t += dt; if (s.t < 0) return true;
          if (s.tx === null) s.tx = o.x;
          if (s.t >= .5 && !s.pts) {
            const tx = s.tx, pts = []; let x = tx;
            for (let y = 0; y < GROUND; y += 40) { pts.push([x, y]); x = tx + rnd(-28, 28); }
            pts.push([tx, GROUND]); s.pts = pts;
            shake = Math.max(shake, 16); scrFlash = .5; flashCol = '#ffffff'; SFX.zap();
            if (!o.ko && Math.abs(o.x - tx) < 80) hit(o, f, dmg, { kby: -350, stun: .55, super: true, x: tx, y: o.y - 120, meter: 0 });
            for (let q = 0; q < 16; q++) addP({ x: tx, y: GROUND - 5, vx: rnd(-400, 400), vy: rnd(-600, -100), life: .5, max: .5, col, r: rnd(2, 4), g: 1500 });
          }
          return s.t < .85;
        },
      });
    }
  },
  heal(f, o, pw, sp) {
    const amt = 12 * pw; f.hp = Math.min(MAX_HP, f.hp + amt); f.cast = .6; SFX.heal();
    texts.push({ x: f.x, y: f.y - 270, s: '+' + Math.round(amt), col: '#7dff9a', life: 1.2 });
    let t = 0;
    addFx(f, {
      update(dt) {
        t += dt;
        if (t < .9) for (let k = 0; k < 2; k++) addP({ x: f.x + rnd(-45, 45), y: f.y - rnd(0, 200), vx: 0, vy: rnd(-160, -60), life: .7, max: .7, col: '#7dff9a', r: rnd(3, 6), g: 0, glyph: sp.glyph || '+' });
        return t < .9;
      },
    });
  },
  shield(f, o, pw) { f.shield = 2.2 * pw; f.cast = .3; SFX.block(); },
  giant(f, o, pw) { f.giant = 4 * pw; f.cast = .5; shake = 12; SFX.giant(); },
  speed(f, o, pw) { f.speed = 4 * pw; f.cast = .2; SFX.speed(); },
  teleport(f, o, pw, sp, col) {
    puff(f.x, f.y - 120, col);
    let nx = o.x - o.facing * 85; if (nx < 50 || nx > W - 50) nx = o.x + o.facing * 85;
    f.x = clamp(nx, 40, W - 40); f.y = o.y; f.vy = 0; f.facing = Math.sign(o.x - f.x) || 1; f.cast = .25;
    puff(f.x, f.y - 120, col);
    let t = 0;
    addFx(f, {
      update(dt) {
        t += dt;
        if (t >= .15) {
          f.cast = 0; f.atk = 'punch'; f.atkT = ATTACKS.punch.a0; f.hitDone = true; f.punchSide = 1;
          hit(o, f, 13 * pw, { kbx: f.facing * 520, kby: -800, stun: .8, super: true, unblockable: true, meter: 0 });
          return false;
        }
        return true;
      },
    });
  },
  beam(f, o, pw, sp, col, i) {
    f.cast = 1.0; const dir = f.facing, ticks = 8, dmg = 14 * pw / ticks;
    const s = { k: 'beam', t: 0, f: f.idx, dir, i, col };
    let cd = 0, n = 0;
    addFx(f, {
      s,
      update(dt) {
        s.t += dt; if (f.ko) return false;
        const y = f.y - 150 * f.scale;
        if (s.t > .2) {
          cd -= dt; shake = Math.max(shake, 4);
          if (cd <= 0 && n < ticks && !o.ko) {
            const b = o.bodyBox();
            if ((o.x - f.x) * dir > 0 && y > b.y0 && y < b.y1) { cd = .08; n++; hit(o, f, dmg, { kbx: dir * 180, stun: .25, super: true, x: o.x - dir * 20, y, meter: 0 }); }
          }
        }
        return s.t < 1.0;
      },
    });
  },
  tornado(f, o, pw, sp, col, i) {
    const dir = f.facing, max = 5, dmg = 14 * pw / max;
    const s = { k: 'tornado', x: f.x + f.facing * 70, t: 0, sc: 1 + i * .25, col };
    let cd = 0, n = 0;
    addFx(f, {
      s,
      update(dt) {
        s.t += dt; s.x += dir * 430 * dt; cd -= dt;
        if (cd <= 0 && n < max && !o.ko && Math.abs(o.x - s.x) < 70 * s.sc && o.y > GROUND - 300 * s.sc) {
          cd = .16; n++;
          hit(o, f, dmg, { kbx: dir * 90, kby: -420, stun: .4, super: true, x: s.x, y: o.y - 120, meter: 0 });
          if (!o.ko) o.x = clamp(lerp(o.x, s.x, .5), 40, W - 40);
        }
        return s.t < 2 && s.x > -100 && s.x < W + 100;
      },
    });
  },
  blackhole(f, o, pw, sp, col, i) {
    const s = { k: 'hole', t: 0, cx: clamp(f.x + f.facing * 300, 90, W - 90), cy: GROUND - 150, R: 50 + i * 15, col };
    const { cx, cy, R } = s;
    let cd = 0, boomed = false;
    addFx(f, {
      s,
      update(dt) {
        s.t += dt;
        if (s.t < 1.6) {
          if (!o.ko && o.shield <= 0 && !o.grabbed) { const dx = cx - o.x; o.x += Math.sign(dx) * Math.min(Math.abs(dx), 360 * dt); }
          cd -= dt;
          if (cd <= 0 && !o.ko && Math.abs(cx - o.x) < 100) { cd = .25; hit(o, f, 1.2 * pw, { stun: .3, super: true, x: cx, y: cy, meter: 0 }); }
          const a = rnd(0, TAU), rr = R * 2.5;
          addP({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 2, vy: -Math.sin(a) * rr * 2, life: .45, max: .45, col, r: rnd(2, 4), g: 0 });
        } else if (!boomed) {
          boomed = true; shake = 22; scrFlash = .6; flashCol = col; SFX.boom();
          if (!o.ko && Math.abs(cx - o.x) < 170) hit(o, f, 8 * pw, { kbx: (Math.sign(o.x - cx) || f.facing) * 650, kby: -750, stun: .8, super: true, x: cx, y: cy, meter: 0 });
          sparks(cx, cy, col, 40);
        }
        return s.t < 1.9;
      },
    });
  },
};

// ---------- match flow ----------
function makeFighters() {
  const c0 = ROSTER[chosen[0]], c1 = ROSTER[chosen[1]];
  const col2 = chosen[0] === chosen[1] ? (c1.color.toLowerCase() === '#7df9ff' ? '#ffd23f' : '#7df9ff') : c1.color;
  return [new Fighter(c0, 0, c0.color), new Fighter(c1, 1, col2)];
}
function startMatch() {
  P = makeFighters();
  ctls[0].cpu = null; ctls[1].cpu = mode === 'cpu' ? new CPU() : null;
  round = 1; showOnly(null); startRound();
}
function startRound() {
  P.forEach(f => f.reset());
  effects = []; particles = []; texts = []; cutin = null; slow = 0; hitstop = 0;
  timer = ROUND_TIME; phase = 'intro'; phaseT = 0; fightCalled = false;
  const final = P[0].wins === WINS_NEEDED - 1 && P[1].wins === WINS_NEEDED - 1;
  bigText(final ? 'FINAL ROUND' : `ROUND ${round}`, '#ffd23f', 1.2); SFX.bell();
}
function endRound(reason) {
  if (phase !== 'fight') return;
  phase = 'ko'; phaseT = 0;
  P.forEach(release);
  const [a, b] = P; let w = null;
  if (a.ko !== b.ko) w = a.ko ? b : a;
  else if (!a.ko) w = a.hp > b.hp ? a : b.hp > a.hp ? b : null;
  if (w) { w.wins++; w.win = true; }
  if (reason === 'ko') { slow = 1.3; SFX.ko(); bigText(a.ko && b.ko ? 'DOUBLE K.O.' : 'K.O.!', '#ff3d5a', 2.4); }
  else bigText(w ? 'TIME!' : 'DRAW', '#ffd23f', 2.4);
}
function bigText(text, col, dur) { big = { text, col, dur, t: 0 }; }

function update(rdt) {
  phaseT += rdt;
  if (big) { big.t += rdt; if (big.t > big.dur) big = null; }
  if (cutin) { cutin.t += rdt; if (cutin.t > 1.1) cutin = null; }
  scrFlash = Math.max(0, scrFlash - rdt * 2.5);
  shake = Math.max(0, shake - rdt * 40);
  if (hitstop > 0) { hitstop -= rdt; return; }
  let dt = rdt;
  if (slow > 0) { slow -= rdt; dt *= .3; }

  effects = effects.filter(e => e.update(dt));
  const fighting = phase === 'fight';
  P[0].update(dt, ctls[0], P[1], fighting);
  P[1].update(dt, ctls[1], P[0], fighting);
  pushApart(P[0], P[1]);
  P.forEach(holdPosition);

  stepParticles(dt);
  for (const t of texts) { t.y -= 70 * dt; t.life -= dt; }
  texts = texts.filter(t => t.life > 0);

  if (phase === 'intro') {
    if (!fightCalled && phaseT > 1.2) { fightCalled = true; bigText('FIGHT!', '#ff3d7f', .8); SFX.super(); }
    if (phaseT > 1.6) { phase = 'fight'; phaseT = 0; }
  } else if (phase === 'fight') {
    timer -= dt;
    if (timer <= 0) { timer = 0; endRound('time'); }
  } else if (phase === 'ko' && phaseT > 3.2) {
    const champ = P.find(f => f.wins >= WINS_NEEDED);
    if (champ) showEnd(champ); else { round++; startRound(); }
  }
}

// ---------- drawing ----------
function makeBG() {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  let seed = 7; const sr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#0b0620'); sky.addColorStop(.55, '#3a1457'); sky.addColorStop(.85, '#a8326e'); sky.addColorStop(1, '#ff8a5b');
  g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,240,255,${.25 + sr() * .7})`; const s = sr() < .1 ? 3 : 2; g.fillRect(sr() * W, sr() * GROUND * .6, s, s); }
  // sun with stripes
  const sx = W / 2, sy = GROUND - 90, rad = 170;
  const sg = g.createLinearGradient(0, sy - rad, 0, sy + rad); sg.addColorStop(0, '#ffe27a'); sg.addColorStop(1, '#ff3d7f');
  g.save(); g.beginPath(); g.arc(sx, sy, rad, 0, TAU); g.clip(); g.fillStyle = sg; g.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
  g.fillStyle = '#8f2a6a'; for (let i = 0; i < 7; i++) g.fillRect(sx - rad, sy + 6 + i * 20, rad * 2, 3 + i * 1.8);
  g.restore();
  // city: far layer then near layer with windows
  for (const [col, hMin, hMax, win] of [['#2a0f45', 70, 200, false], ['#16072a', 40, 140, true]]) {
    let x = -10;
    while (x < W) {
      const w = 30 + sr() * 60, h = hMin + sr() * (hMax - hMin);
      g.fillStyle = col; g.fillRect(x, GROUND - h, w, h);
      if (win) for (let wy = GROUND - h + 10; wy < GROUND - 10; wy += 16) for (let wx = x + 6; wx < x + w - 8; wx += 12) if (sr() < .18) { g.fillStyle = sr() < .5 ? '#ffd27a' : '#ff9ad5'; g.fillRect(wx, wy, 5, 7); }
      x += w + 2;
    }
  }
  // floor with grid
  const gg = g.createLinearGradient(0, GROUND, 0, H); gg.addColorStop(0, '#2b0f4a'); gg.addColorStop(1, '#07030f');
  g.fillStyle = gg; g.fillRect(0, GROUND, W, H - GROUND);
  g.strokeStyle = 'rgba(255,61,127,.45)'; g.lineWidth = 1.5;
  for (let i = 1; i < 12; i++) { const y = GROUND + Math.pow(i / 11, 2) * (H - GROUND); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let i = -24; i <= 24; i++) { g.beginPath(); g.moveTo(W / 2 + i * 30, GROUND); g.lineTo(W / 2 + i * 200, H); g.stroke(); }
  g.strokeStyle = '#ff9ad5'; g.lineWidth = 3; g.shadowColor = '#ff3d7f'; g.shadowBlur = 16;
  g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); g.stroke();
  return c;
}
const BG = makeBG();

function drawHead(ch, x, y, r, col) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#1d1233'; ctx.fill();
  if (ch.imgOk) {
    ctx.clip();
    const iw = ch.img.naturalWidth, ih = ch.img.naturalHeight, s = Math.max(2 * r / iw, 2 * r / ih);
    ctx.drawImage(ch.img, x - iw * s / 2, y - ih * s / 2, iw * s, ih * s);
  } else {
    ctx.fillStyle = col;
    for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(x + e * r * .35, y - r * .12, r * .12, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, r * .1); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + r * .05, r * .42, .2 * Math.PI, .8 * Math.PI); ctx.stroke();
  }
  ctx.restore();
  ctx.save(); ctx.lineWidth = Math.max(3, r * .12); ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.restore();
}

function atkK(f) {
  const A = ATTACKS[f.atk], p = f.atkT;
  if (p < A.a0) return p / A.a0; if (p < A.a1) return 1;
  return clamp(1 - (p - A.a1) / (A.dur - A.a1), 0, 1);
}
// Angles are measured from straight down; a positive angle points the way the fighter faces.
function computePose(f) {
  const P_ = { lean: .08, legs: [[.32, .06], [-.32, -.08]], arms: [[.65, 2.45], [.35, 2.25]], bob: Math.sin(clock * 4 + f.idx * 2) * 2, rot: 0 };
  if (f.ko) { const k = Math.min(1, f.koT * 3); P_.rot = -k * Math.PI / 2 * f.facing; P_.lean = 0; P_.legs = [[.1, .1], [-.1, -.1]]; P_.arms = [[2.6, 2.9], [2.3, 2.6]]; P_.bob = 0; return P_; }
  if (f.grabbed) {
    const w = Math.sin(clock * 22) * .3;
    P_.bob = 0; P_.lean = -.25; P_.arms = [[2.4 + w, 2.9], [2.1 - w, 2.6]]; P_.legs = [[.25 + w, .1], [-.2 - w, -.1]]; return P_;
  }
  if (f.holding) { P_.lean = -.05; P_.arms = [[1.9, 2.5], [1.7, 2.4]]; P_.legs = [[.45, .12], [-.45, -.12]]; return P_; }
  if (f.frozen > 0) { P_.bob = 0; P_.arms = [[1.0, 2.0], [.6, 1.8]]; return P_; }
  if (f.stun > 0) { P_.lean = -.4; P_.arms = [[-.5, .4], [2.4, 2.9]]; P_.legs = [[.45, .15], [-.15, -.3]]; return P_; }
  if (f.dashing) { P_.lean = .6; P_.arms = [[1.57, 1.57], [-.9, -.5]]; P_.legs = [[.9, .3], [-.9, -.5]]; return P_; }
  if (f.atk === 'punch') {
    const k = atkK(f);
    if (f.punchSide) P_.arms[0] = [lerp(.65, 1.62, k), lerp(2.45, 1.57, k)];
    else P_.arms[1] = [lerp(.35, 1.62, k), lerp(2.25, 1.57, k)];
    P_.lean = .08 + .25 * k; P_.legs = [[.45, .12], [-.45, -.12]]; return P_;
  }
  if (f.atk === 'grab') {
    const k = atkK(f);
    P_.arms = [[lerp(.65, 1.45, k), lerp(2.45, 1.75, k)], [lerp(.35, 1.35, k), lerp(2.25, 1.65, k)]];
    P_.lean = .08 + .22 * k; P_.legs = [[.45, .12], [-.45, -.12]]; return P_;
  }
  if (f.atk === 'smack') {
    const A = ATTACKS.smack;
    if (f.atkT < A.a0) {   // wind up: pull the fist far back
      const k = easeOut(f.atkT / A.a0);
      P_.arms[0] = [lerp(.65, -1.4, k), lerp(2.45, -.3, k)]; P_.arms[1] = [lerp(.35, 1.2, k), lerp(2.25, 2.0, k)];
      P_.lean = lerp(.08, -.3, k); P_.legs = [[.5, .1], [-.55, -.2]]; return P_;
    }
    const k = atkK(f);
    P_.arms[0] = [lerp(.65, 1.6, k), lerp(2.45, 1.57, k)]; P_.arms[1] = [lerp(.35, -.6, k), lerp(2.25, -.2, k)];
    P_.lean = .08 + .5 * k; P_.legs = [[.7, .2], [-.6, -.3]]; return P_;
  }
  if (f.atk === 'kick') {
    const k = atkK(f);
    P_.legs = [[lerp(.32, 1.65, k), lerp(.06, 1.6, k)], [lerp(-.32, -.12, k), -.08]];
    P_.lean = lerp(.08, -.45, k);
    P_.arms = [[lerp(.65, 1.3, k), lerp(2.45, 2.2, k)], [lerp(.35, -1, k), lerp(2.25, -.6, k)]]; return P_;
  }
  if (f.cast > 0) { P_.lean = -.12; P_.arms = [[2.75, 3.0], [2.95, 3.1]]; return P_; }
  if (f.blocking) { P_.lean = .18; P_.arms = [[1.3, 2.95], [1.1, 2.85]]; P_.legs = [[.55, -.15], [-.5, -.55]]; return P_; }
  if (!f.onGround) { P_.legs = [[1.15, .15], [-.15, -.9]]; P_.arms = [[2.1, 2.6], [-.9, -.3]]; P_.bob = 0; return P_; }
  if (f.win) { const w = Math.sin(clock * 9) * .35; P_.arms = [[2.85 + w, 3.1 + w], [2.6 - w, 2.9 - w]]; P_.lean = -.05; P_.bob = -Math.abs(Math.sin(clock * 6)) * 10; return P_; }
  if (Math.abs(f.vx) > 10) {
    const ph = f.walkPh, sw = Math.sin(ph) * .55;
    P_.legs = [[sw, sw - .5 * Math.max(0, Math.cos(ph))], [-sw, -sw - .5 * Math.max(0, -Math.cos(ph))]];
    P_.arms = [[.65 - sw * .4, 2.45], [.35 + sw * .4, 2.25]]; P_.lean = .16;
  }
  return P_;
}
function limb(o, [a1, a2], len, fc) {
  const m = { x: o.x + Math.sin(a1) * len * fc, y: o.y + Math.cos(a1) * len };
  const e = { x: m.x + Math.sin(a2) * len * fc, y: m.y + Math.cos(a2) * len };
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(m.x, m.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  return e;
}
function fist(p, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.fill(); }

function drawShadow(f) {
  const lift = Math.min(.6, (GROUND - f.y) / 400);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(f.x, GROUND + 4, 42 * f.scale * (1 - lift), 8, 0, 0, TAU); ctx.fill();
}
function drawFighter(f) {
  const ps = computePose(f), fc = f.facing, L = 48;
  ctx.save(); ctx.translate(f.x, f.y);
  if (ps.rot) { ctx.translate(0, -8); ctx.rotate(ps.rot); }
  ctx.scale(f.scale, f.scale);
  const col = f.flash > 0 ? '#ffffff' : f.color;
  if (f.speed > 0) {
    ctx.save(); ctx.strokeStyle = f.color; ctx.globalAlpha = .5; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const y = -50 - k * 45; ctx.beginPath(); ctx.moveTo(-fc * 30, y); ctx.lineTo(-fc * rnd(80, 140), y); ctx.stroke(); }
    ctx.restore();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 9;
  const charging = f.atk === 'smack' && f.atkT < ATTACKS.smack.a0;
  ctx.shadowColor = f.color; ctx.shadowBlur = (f.giant > 0 || f.cast > 0) ? 26 : charging ? 20 + 14 * Math.sin(clock * 40) : 10;
  const legH = Math.max(40, ...ps.legs.map(([a, b]) => Math.cos(a) * L + Math.cos(b) * L));
  const hip = { x: 0, y: -legH + ps.bob };
  const sl = Math.sin(ps.lean), cl = Math.cos(ps.lean);
  const neck = { x: sl * 75 * fc, y: hip.y - cl * 75 };
  const sh = { x: neck.x - sl * 8 * fc, y: neck.y + cl * 8 };
  const head = { x: neck.x + sl * 36 * fc, y: neck.y - cl * 36 };
  ctx.strokeStyle = col;
  ctx.globalAlpha = .6;
  limb(hip, ps.legs[1], L, fc); fist(limb(sh, ps.arms[1], 38, fc), col);
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
  limb(hip, ps.legs[0], L, fc); fist(limb(sh, ps.arms[0], 38, fc), col);
  ctx.shadowBlur = 0;
  drawHead(f.ch, head.x, head.y, 30, col);
  if (f.frozen > 0) {
    ctx.fillStyle = 'rgba(150,220,255,.4)'; ctx.strokeStyle = '#d4f4ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(-52, -255, 104, 255); ctx.fill(); ctx.stroke();
  }
  if (f.shield > 0) {
    const pulse = 1 + .03 * Math.sin(clock * 12);
    ctx.fillStyle = 'rgba(159,232,255,.12)'; ctx.strokeStyle = 'rgba(159,232,255,.85)'; ctx.lineWidth = 4;
    ctx.globalAlpha = f.shield < .6 ? (Math.sin(clock * 30) > 0 ? 1 : .3) : 1;
    ctx.beginPath(); ctx.arc(0, -120, 150 * pulse, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// key shown next to a super power: none for the computer or for the other player online
function keyLabel(p, s) {
  if (mode === 'cpu') return p === 0 ? KEYLBL[0][s] : '';
  if (mode === 'online') return net && p === net.role ? KEYLBL[0][s] : '';
  return KEYLBL[p][s];
}
function rrect(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function drawHUD() {
  ctx.textBaseline = 'alphabetic';
  P.forEach((f, i) => {
    const left = i === 0, bw = 440, bh = 26, bx = left ? 112 : W - 112 - bw, by = 30;
    ctx.fillStyle = 'rgba(10,4,22,.75)'; rrect(bx - 4, by - 4, bw + 8, bh + 8, 8); ctx.fill();
    const bar = (r, color) => { const w = bw * clamp(r, 0, 1); ctx.fillStyle = color; rrect(left ? bx : bx + bw - w, by, w, bh, 5); ctx.fill(); };
    bar(f.hpShow / MAX_HP, '#ff5a7a');
    const low = f.hp / MAX_HP < .25;
    bar(f.hp / MAX_HP, low && Math.floor(clock * 6) % 2 ? '#ff3d3d' : '#ffd23f');
    ctx.font = FONT_D(20); ctx.fillStyle = f.color; ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(f.ch.name.toUpperCase(), left ? bx : bx + bw, by + bh + 26);
    for (let w = 0; w < WINS_NEEDED; w++) {
      ctx.fillStyle = w < f.wins ? '#ffd23f' : 'rgba(255,255,255,.2)';
      ctx.beginPath(); ctx.arc(left ? bx + bw - 10 - w * 24 : bx + 10 + w * 24, by + bh + 18, 8, 0, TAU); ctx.fill();
    }
    drawHead(f.ch, left ? 58 : W - 58, 52, 40, f.color);
    const tag = mode === 'cpu' && i === 1 ? 'CPU' : mode === 'online' && net && i === net.role ? 'YOU' : '';
    if (tag) { ctx.font = FONT_D(14); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(tag, left ? 58 : W - 58, 112); }

    // super meter: 3 bars
    const mw = 360, mh = 16, mx = left ? 30 : W - 30 - mw, my = 688, bars = f.meter / BAR, sw = (mw - 8) / 3;
    for (let s = 0; s < BARS; s++) {
      const sx = left ? mx + s * (sw + 4) : mx + mw - (s + 1) * sw - s * 4, fill = clamp(bars - s, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; rrect(sx, my, sw, mh, 5); ctx.fill();
      if (fill > 0) {
        ctx.save();
        if (fill >= 1) { ctx.shadowColor = f.color; ctx.shadowBlur = 10 + 6 * Math.sin(clock * 8); }
        ctx.fillStyle = fill >= 1 ? f.color : 'rgba(255,255,255,.55)';
        rrect(left ? sx : sx + sw * (1 - fill), my, sw * fill, mh, 5); ctx.fill(); ctx.restore();
      }
    }
    // super power chips
    let cx = left ? mx : mx + mw; ctx.font = FONT_B(600, 14);
    f.ch.supers.forEach((sp, s) => {
      const ready = f.meter >= SUPER_COST[s] * BAR;
      const key = keyLabel(i, s) ? keyLabel(i, s) + '  ' : '';
      const txt = `${key}${sp.name}  ${'●'.repeat(SUPER_COST[s])}`;
      const tw = ctx.measureText(txt).width + 20, x0 = left ? cx : cx - tw;
      ctx.save();
      if (ready) { ctx.shadowColor = f.color; ctx.shadowBlur = 12; }
      ctx.fillStyle = ready ? f.color : 'rgba(255,255,255,.08)'; rrect(x0, 652, tw, 26, 13); ctx.fill(); ctx.restore();
      ctx.fillStyle = ready ? '#14081f' : 'rgba(255,255,255,.55)'; ctx.textAlign = 'left';
      ctx.fillText(txt, x0 + 10, 670);
      cx = left ? cx + tw + 6 : x0 - 6;
    });
  });
  ctx.textAlign = 'center'; ctx.font = FONT_D(46); ctx.fillStyle = '#ffffff';
  ctx.fillText(String(Math.ceil(timer)), W / 2, 68);
  ctx.font = FONT_B(600, 13); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(`ROUND ${round}`, W / 2, 88);
}
function drawCutin() {
  if (!cutin) return;
  const { f, name, col, t } = cutin, left = f.idx === 0;
  const off = (1 - easeOut(Math.min(1, t / .18))) * W * (left ? -1 : 1);
  const out = clamp((t - .85) / .25, 0, 1);
  ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(off, 0);
  ctx.fillStyle = 'rgba(10,4,22,.85)';
  ctx.beginPath(); ctx.moveTo(0, 262); ctx.lineTo(W, 232); ctx.lineTo(W, 382); ctx.lineTo(0, 412); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, 262); ctx.lineTo(W, 232); ctx.moveTo(0, 412); ctx.lineTo(W, 382); ctx.stroke();
  const hx = left ? 170 : W - 170, tx = left ? 270 : W - 270;
  drawHead(f.ch, hx, 322, 74, col);
  ctx.textAlign = left ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
  ctx.font = FONT_B(800, 22); ctx.fillStyle = '#ffffff'; ctx.fillText(f.ch.name.toUpperCase(), tx, 292);
  ctx.font = FONT_D(64); ctx.lineWidth = 10; ctx.strokeStyle = '#14081f';
  ctx.strokeText(name.toUpperCase(), tx, 362, W - 340); ctx.fillStyle = col; ctx.fillText(name.toUpperCase(), tx, 362, W - 340);
  ctx.restore();
}
function drawBig() {
  if (!big) return;
  const k = big.t / big.dur, sc = .6 + .4 * easeOut(Math.min(1, big.t / .15)) + k * .08;
  ctx.save(); ctx.globalAlpha = k > .8 ? Math.max(0, 1 - (k - .8) / .2) : 1;
  ctx.translate(W / 2, H / 2 - 50); ctx.scale(sc, sc);
  ctx.font = FONT_D(110); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 14; ctx.strokeStyle = '#1a0830'; ctx.strokeText(big.text, 0, 0, W - 80);
  ctx.fillStyle = big.col; ctx.fillText(big.text, 0, 0, W - 80);
  ctx.restore();
}
function drawParticles() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col;
    if (p.glyph) { ctx.font = `${p.r * 4}px sans-serif`; ctx.fillText(p.glyph, p.x, p.y); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
function drawTexts() {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = FONT_D(24); ctx.lineWidth = 5; ctx.strokeStyle = '#14081f';
  for (const t of texts) { ctx.globalAlpha = clamp(t.life * 2, 0, 1); ctx.strokeText(t.s, t.x, t.y); ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y); }
  ctx.restore();
}
function draw() {
  const k = cv.width / W; ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.drawImage(BG, 0, 0);
  if (!P.length) return;
  ctx.save();
  if (shake > 0) ctx.translate(rnd(-shake, shake), rnd(-shake, shake) * .6);
  P.forEach(drawShadow);
  // draw the fighter who is attacking last, so they appear in front
  const order = P[0].atk || P[0].dashing ? [P[1], P[0]] : [P[0], P[1]];
  order.forEach(drawFighter);
  const fx = isGuest() ? net.fx : effects.map(e => e.s).filter(Boolean);
  for (const s of fx) if (DRAW[s.k]) DRAW[s.k](s);
  drawParticles(); drawTexts();
  ctx.restore();
  drawHUD(); drawCutin(); drawBig();
  if (scrFlash > 0) { ctx.globalAlpha = scrFlash * .45; ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

// ---------- menus ----------
const screens = { title: $('title'), lobby: $('lobby'), select: $('select'), end: $('end'), pause: $('pause') };
function showOnly(name) { for (const k in screens) screens[k].hidden = k !== name; }
let sel = null;

function goTitle() { phase = 'title'; P = []; showOnly('title'); }
function startMode(m) { mode = m; goSelect(); }
function selHintText() {
  if (mode === 'online') return 'Move with A D W S or the arrow keys. Press F or K to pick, G or L to undo. You can also click a fighter.';
  if (mode === 'pvp') return 'Player 1: A D W S to move, F to pick, G to undo.  Player 2: arrow keys to move, K to pick, L to undo.  You can also click.  Esc goes back.';
  return 'Move with A D W S and press F to pick, or click a fighter. The computer picks after you. Esc goes back.';
}
function goSelect() {
  phase = 'select'; P = []; effects = []; ctls[1].cpu = null;
  sel = { cur: [chosen[0] || 0, mode === 'cpu' ? 0 : (chosen[1] ?? 1)], locked: [false, false], t: 0, roll: 0, rollTick: 0 };
  $('selHint').textContent = selHintText();
  showOnly('select'); renderSelect();
}
const cards = ROSTER.map((ch, i) => {
  const c = document.createElement('button'); c.type = 'button'; c.className = 'card'; c.style.setProperty('--c', ch.color);
  const face = document.createElement('div'); face.className = 'face'; ch.faceEls.push(face); setFace(face, ch);
  const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = ch.name;
  c.append(face, nm); c.addEventListener('click', () => clickCard(i)); $('grid').appendChild(c);
  return c;
});
function pickCard(p, i) {
  if (!sel || sel.locked[p] || !ROSTER[i]) return;
  sel.cur[p] = i; sel.locked[p] = true; SFX.pick(); renderSelect();
}
function clickCard(i) {
  audio(); if (!sel) return;
  if (isGuest()) { send({ t: 'click', i }); return; }
  if (mode === 'online') { pickCard(0, i); return; }
  if (!sel.locked[0]) pickCard(0, i);
  else if (mode === 'pvp') pickCard(1, i);
}
function playerLabel(p) {
  if (mode === 'online') return net && p === net.role ? 'You' : 'Your friend';
  return p === 0 ? 'Player 1' : mode === 'cpu' ? 'Computer' : 'Player 2';
}
function renderSelect() {
  const show1 = mode !== 'cpu' || sel.locked[1] || sel.roll > 0;
  const tagOf = p => mode === 'online' ? (net && p === net.role ? 'YOU' : 'P' + (p + 1)) : p === 0 ? 'P1' : mode === 'cpu' ? 'CPU' : 'P2';
  cards.forEach((c, i) => {
    const is0 = sel.cur[0] === i, is1 = show1 && sel.cur[1] === i;
    c.classList.toggle('c0', is0); c.classList.toggle('c1', is1);
    c.classList.toggle('l0', is0 && sel.locked[0]); c.classList.toggle('l1', is1 && sel.locked[1]);
    c.querySelectorAll('.tag').forEach(t => t.remove());
    if (is0) { const t = document.createElement('span'); t.className = 'tag t0'; t.textContent = tagOf(0); c.appendChild(t); }
    if (is1) { const t = document.createElement('span'); t.className = 'tag t1'; t.textContent = tagOf(1); c.appendChild(t); }
  });
  [0, 1].forEach(p => {
    const el = $('pick' + p); el.textContent = '';
    const who = document.createElement('div'); who.className = 'who';
    const label = playerLabel(p);
    if (p === 1 && mode === 'cpu' && !show1) { who.textContent = label; const pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = 'Waiting for you'; el.append(who, pn); return; }
    const ch = ROSTER[sel.cur[p]];
    who.textContent = `${label} · ${sel.locked[p] ? 'locked in' : 'choosing'}`;
    const pn = document.createElement('div'); pn.className = 'pn'; pn.style.color = ch.color; pn.textContent = ch.name;
    const ul = document.createElement('ul');
    ch.supers.forEach((sp, s) => {
      const li = document.createElement('li');
      const key = keyLabel(p, s);
      const b = document.createElement('b'); b.textContent = (key ? key + '  ' : '') + sp.name;
      const cost = document.createElement('span'); cost.className = 'cost'; cost.textContent = '●'.repeat(SUPER_COST[s]);
      const ty = document.createElement('span'); ty.className = 'ty'; ty.textContent = '  ' + (TYPE_LABEL[sp.type] || '');
      li.append(b, cost, ty); ul.appendChild(li);
    });
    el.append(who, pn, ul);
  });
}
function selectUpdate(dt) {
  const n = ROSTER.length, cols = 5; let changed = false;
  for (const p of (mode === 'cpu' ? [0] : [0, 1])) {
    const c = ctls[p];
    if (!sel.locked[p]) {
      let d = 0;
      if (c.pressed('left')) d = -1; if (c.pressed('right')) d = 1;
      if (c.pressed('up')) d = -cols; if (c.pressed('down')) d = cols;
      if (d) { sel.cur[p] = (sel.cur[p] + d + n) % n; SFX.blip(); changed = true; }
      if (c.pressed('punch')) { sel.locked[p] = true; SFX.pick(); changed = true; }
    } else if (c.pressed('kick')) { sel.locked[p] = false; if (mode === 'cpu') { sel.locked[1] = false; sel.roll = 0; } changed = true; }
  }
  if (mode === 'cpu' && sel.locked[0] && !sel.locked[1]) {
    sel.roll += dt; sel.rollTick -= dt;
    if (sel.rollTick <= 0) { sel.rollTick = .08; sel.cur[1] = Math.floor(Math.random() * n); SFX.blip(); }
    if (sel.roll > 1) {
      if (sel.cur[1] === sel.cur[0] && n > 1) sel.cur[1] = (sel.cur[1] + 1 + Math.floor(Math.random() * (n - 1))) % n;
      sel.locked[1] = true; SFX.pick();
    }
    changed = true;
  }
  if (sel.locked[0] && sel.locked[1]) {
    sel.t += dt;
    if (sel.t > .8) { chosen = [...sel.cur]; startMatch(); return; }
  } else sel.t = 0;
  if (changed) renderSelect();
}
function showEndUI(w) {
  setFace($('endFace'), w.ch);
  $('endName').textContent = mode === 'online' ? (w.idx === net.role ? 'You win!' : `${w.ch.name} wins!`) : `${w.ch.name} wins!`;
  $('endName').style.color = w.color;
  $('endScore').textContent = `${P[0].ch.name} ${P[0].wins}  –  ${P[1].wins} ${P[1].ch.name}`;
  showOnly('end');
}
function showEnd(w) {
  phase = 'end'; P.forEach(f => { f.win = f === w; });
  showEndUI(w); SFX.win();
}
function pause() { prevPhase = phase; phase = 'pause'; showOnly('pause'); }
function resume() { phase = prevPhase; showOnly(null); }

// Menu commands. Online, the guest sends them to the host, and the host runs them.
function runCmd(c) {
  if (c === 'pause' && (phase === 'intro' || phase === 'fight' || phase === 'ko')) pause();
  else if (c === 'resume' && phase === 'pause') resume();
  else if (c === 'select' && (phase === 'pause' || phase === 'end')) goSelect();
  else if (c === 'rematch' && phase === 'end') startMatch();
}
function doCmd(c) { audio(); if (isGuest()) send({ t: 'cmd', c }); else runCmd(c); }

// ---------- online play ----------
// The server puts two players who type the same room name together.
// The first player in the room is the host (role 0). The host's browser runs the whole game.
// The guest (role 1) sends its key presses to the host, and draws the snapshots the host sends back.
const SNAP_MS = 15;        // the host sends at most one snapshot every 15 ms (about 60 per second)
const FKEYS = ['x', 'y', 'vx', 'facing', 'hp', 'atk', 'atkT', 'punchSide', 'stun', 'frozen', 'shield', 'giant', 'speed',
  'cast', 'flash', 'invuln', 'ko', 'koT', 'walkPh', 'blocking', 'scale', 'win', 'wins', 'meter'];
const roundNums = (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

function send(o) { if (net && net.ws.readyState === 1) net.ws.send(JSON.stringify(o, roundNums)); }
function lobbyMsg(text) { $('lobbyMsg').textContent = text; }
function cleanRoom(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24); }

function goLobby() {
  phase = 'lobby'; P = []; showOnly('lobby');
  if (location.protocol === 'file:') {
    lobbyMsg('Online play needs the game server. In the game folder run "npm start", then open http://localhost:3000');
    return;
  }
  if (!net) lobbyMsg('');
  setTimeout(() => $('roomName').focus(), 0);
}
function joinRoom(raw) {
  const room = cleanRoom(raw);
  if (!room) { lobbyMsg('Type a room name first (letters and numbers).'); return; }
  if (location.protocol === 'file:') { goLobby(); return; }
  if (net) { net.ws.onclose = null; net.ws.close(); }
  $('roomName').value = room;
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  net = { ws, room, role: -1, ready: false, snd: [], np: [], fx: [], lastSend: 0, sentIn: '', presses: [], selKey: '', fightersKey: '' };
  lobbyMsg('Connecting…');
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', room }));
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onNet(m); };
  ws.onclose = () => {
    if (!net || net.ws !== ws) return;
    net = null; ctls[1].remote = null; mode = 'pvp';
    $('btnLeave').hidden = true; goLobby(); lobbyMsg('Lost the connection to the server.');
  };
}
function leaveOnline() {
  if (net) { net.ws.onclose = null; net.ws.close(); net = null; }
  location.href = location.pathname;   // reload without ?room=
}
function onNet(m) {
  switch (m.t) {
    case 'joined': {
      net.role = m.role;
      history.replaceState(null, '', '?room=' + encodeURIComponent(net.room));
      $('btnLeave').hidden = false;
      lobbyMsg(`You are in room "${net.room}". Waiting for your friend… Send them this link: ${location.origin}${location.pathname}?room=${encodeURIComponent(net.room)}`);
      break;
    }
    case 'full': lobbyMsg(`Room "${net.room}" already has 2 players. Pick another name.`); net.ws.onclose = null; net.ws.close(); net = null; break;
    case 'error': lobbyMsg(m.msg || 'Server error.'); break;
    case 'ready': {
      net.ready = true; mode = 'online'; ctls[0].merge = true; ctls[0].cpu = null; ctls[1].cpu = null;
      net.presses = ACTIONS.map(() => 0); net.sentIn = ''; net.selKey = ''; net.fightersKey = '';
      if (net.role === 0) { ctls[1].remote = { held: {}, taps: {}, cnt: [] }; goSelect(); }
      else { P = []; particles = []; phase = 'select'; $('selHint').textContent = selHintText(); }
      break;
    }
    case 'left': {
      // the other player left; this player is now the host of the room and waits for someone new
      net.ready = false; net.role = 0; ctls[1].remote = null;
      P = []; effects = []; particles = []; texts = []; cutin = null; big = null;
      goLobby(); lobbyMsg(`Your friend left. Waiting for someone to join room "${net.room}"…`);
      break;
    }
    // messages from the other player (passed along by the server)
    case 'in': if (onlineHost()) remoteInput(m); break;
    case 'click': if (onlineHost() && phase === 'select') pickCard(1, m.i); break;
    case 'cmd': if (onlineHost()) runCmd(m.c); break;
    case 's': if (isGuest()) applySnap(m); break;
  }
}

// --- host side ---
// m.h: 1/0 per action (held).  m.c: how many times each action was pressed so far.
// Counting presses means a quick tap between two host frames is never lost.
function remoteInput(m) {
  const r = ctls[1].remote; if (!r || !Array.isArray(m.h) || !Array.isArray(m.c)) return;
  ACTIONS.forEach((a, k) => {
    r.held[a] = !!m.h[k];
    if ((m.c[k] | 0) > (r.cnt[k] | 0)) r.taps[a] = true;
    r.cnt[k] = m.c[k] | 0;
  });
}
function packF(f) { return [...FKEYS.map(k => f[k]), f.dashing ? 1 : 0, f.holding ? 1 : 0, f.grabbed ? 1 : 0]; }
function snapshot() {
  const s = { t: 's', ph: phase, snd: net.snd, np: net.np };
  net.snd = []; net.np = [];
  if (phase === 'select') s.sel = { cur: sel.cur, locked: sel.locked };
  else if (P.length) {
    s.ch = chosen; s.f = P.map(packF); s.fx = effects.map(e => e.s).filter(Boolean);
    s.tx = texts; s.tm = timer; s.rd = round; s.sh = shake; s.sf = scrFlash; s.fc = flashCol; s.big = big;
    s.cut = cutin && { i: cutin.f.idx, name: cutin.name, col: cutin.col, t: cutin.t };
    if (phase === 'end') s.w = Math.max(0, P.findIndex(f => f.win));
  }
  return s;
}

// --- guest side ---
function guestInput(dt) {
  const c = ctls[0]; c.poll(null, null, dt);
  ACTIONS.forEach((a, k) => { if (c.pressed(a)) net.presses[k]++; });
  const msg = JSON.stringify({ t: 'in', h: ACTIONS.map(a => (c.held[a] ? 1 : 0)), c: net.presses });
  if (msg !== net.sentIn && net.ws.readyState === 1) { net.sentIn = msg; net.ws.send(msg); }
}
function unpackF(f, a, i) {
  const n = FKEYS.length;
  FKEYS.forEach((k, j) => { f[k] = a[j]; });
  f.dashing = a[n] ? {} : null;
  f.holding = a[n + 1] ? { o: P[1 - i], t: 0 } : null;
  f.grabbed = a[n + 2] ? P[1 - i] : null;
}
function applySnap(s) {
  const prev = phase; phase = s.ph;
  for (const [k, ...a] of s.snd || []) if (SFX_RAW[k]) SFX_RAW[k](...a);
  for (const p of s.np || []) particles.push(p);
  if (phase === 'select') {
    if (!s.sel) return;
    const key = JSON.stringify(s.sel);
    if (prev !== 'select' || key !== net.selKey) {
      net.selKey = key; P = []; net.fx = []; particles = [];
      sel = { cur: s.sel.cur, locked: s.sel.locked, t: 0, roll: 0, rollTick: 0 };
      $('selHint').textContent = selHintText(); showOnly('select'); renderSelect();
    }
    return;
  }
  net.selKey = '';
  if (!s.f || !s.ch) return;
  const key = s.ch.join();
  if (!P.length || key !== net.fightersKey) { net.fightersKey = key; chosen = s.ch; P = makeFighters(); }
  s.f.forEach((a, i) => unpackF(P[i], a, i));
  net.fx = s.fx || []; texts = s.tx || []; timer = s.tm; round = s.rd; shake = s.sh; scrFlash = s.sf; flashCol = s.fc; big = s.big;
  cutin = s.cut ? { f: P[s.cut.i], name: s.cut.name, col: s.cut.col, t: s.cut.t } : null;
  if (prev !== phase) {
    if (phase === 'end') showEndUI(P[s.w] || P[0]);
    else if (phase === 'pause') showOnly('pause');
    else showOnly(null);
  }
}
function guestFrame(rdt) {
  guestInput(rdt);
  stepParticles(rdt);
  for (const f of P) f.hpShow = lerp(f.hpShow, f.hp, Math.min(1, rdt * 2.5));
}

// ---------- buttons and keys ----------
$('btnPvp').addEventListener('click', () => { audio(); startMode('pvp'); });
$('btnCpu').addEventListener('click', () => { audio(); startMode('cpu'); });
$('btnOnline').addEventListener('click', () => { audio(); goLobby(); });
$('lobbyForm').addEventListener('submit', e => { e.preventDefault(); audio(); joinRoom($('roomName').value); });
$('btnLobbyBack').addEventListener('click', () => { if (net) leaveOnline(); else goTitle(); });
$('btnLeave').addEventListener('click', leaveOnline);
$('btnResume').addEventListener('click', () => doCmd('resume'));
$('btnQuit').addEventListener('click', () => doCmd('select'));
$('btnRematch').addEventListener('click', () => doCmd('rematch'));
$('btnChange').addEventListener('click', () => doCmd('select'));

addEventListener('keydown', e => {
  audio();
  // typing in the room name box: let the keys through as text
  if (e.target instanceof HTMLInputElement) { if (e.code === 'Escape') e.target.blur(); return; }
  if (GAME_CODES.has(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  justDown.add(e.code);
  switch (phase) {
    case 'title':
      if (e.code === 'Digit1' || e.code === 'Numpad1' || e.code === 'Enter') { e.preventDefault(); startMode('pvp'); }
      else if (e.code === 'Digit2' || e.code === 'Numpad2') startMode('cpu');
      else if (e.code === 'Digit3' || e.code === 'Numpad3') goLobby();
      break;
    case 'lobby': if (e.code === 'Escape') { if (net) leaveOnline(); else goTitle(); } break;
    case 'select': if (e.code === 'Escape' && mode !== 'online') goTitle(); break;
    case 'intro': case 'fight': case 'ko':
      if (e.code === 'Escape') doCmd('pause');
      else if (e.code === 'Backquote' && mode !== 'online') { P.forEach(f => { f.meter = BAR * BARS; }); SFX.pick(); } // practice key: fill both meters
      break;
    case 'pause':
      if (e.code === 'Escape') doCmd('resume'); else if (e.code === 'KeyQ') doCmd('select');
      break;
    case 'end':
      if (e.code === 'Enter') { e.preventDefault(); doCmd('rematch'); } else if (e.code === 'Escape') doCmd('select');
      break;
  }
});

// a link like http://host:3000/?room=abc joins room "abc" straight away
{
  const r = new URLSearchParams(location.search).get('room');
  if (r && location.protocol !== 'file:') { goLobby(); joinRoom(r); }
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const rdt = Math.min(.05, (now - last) / 1000); last = now; clock += rdt;
  if (isGuest()) {
    guestFrame(rdt);
    justDown.clear();
  } else {
    const inGame = phase === 'intro' || phase === 'fight' || phase === 'ko' || phase === 'end';
    ctls.forEach((c, i) => c.poll(inGame ? P[i] : null, inGame ? P[1 - i] : null, rdt));
    justDown.clear();
    if (phase === 'select') selectUpdate(rdt);
    if (inGame) update(rdt);
    if (onlineHost() && now - net.lastSend >= SNAP_MS) { net.lastSend = now; send(snapshot()); }
  }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
