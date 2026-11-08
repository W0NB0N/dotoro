import { type Ctx, DEPTH, shiftX, shiftY } from './city';
import { bakeGlow, type Frame, fract, type Glow, hash, type Layer, LOOP_SECONDS, mix, type RGB, scale, Sprite } from './core';
import { BOOT_FRAMES, WANTED_FACE } from './data';
import { plotText, text, textMask, textWidth } from './font';
import { drawSparks } from './fx';

/**
 * The big screen on the right: six animated spots, each as long as it needs to play out, together
 * filling the loop exactly. Each paints the whole board from its own clock.
 */
export const BOARD_X = 316;
export const BOARD_Y = 15;
export const BOARD_W = 140;
export const BOARD_H = 46;

type Paint = (b: Sprite, s: number, duration: number) => void;

interface Spot {
  seconds: number;
  /** Light the board throws on its surroundings, at time s. Black throws none. */
  tint: (s: number) => RGB;
  paint: Paint;
  /** Effects that spill out of the board into the scene. */
  scene?: (frame: Frame, s: number, x: number, y: number) => void;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function fill(b: Sprite, top: RGB, bottom = top) {
  for (let y = 0; y < b.h; y++) b.rect(0, y, b.w, 1, mix(top, bottom, y / (b.h - 1)));
}

function centered(b: Sprite, str: string, y: number, c: RGB, size = 1, gap = 1, shadow = -1) {
  const x = Math.floor((b.w - textWidth(str, size, gap)) / 2);
  if (shadow !== -1) text(b, str, x + 1, y + 1, shadow, size, gap);
  text(b, str, x, y, c, size, gap);
}

/** Index of the beat that is on, when `count` beats share `span` seconds equally. */
const beat = (s: number, span: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor((s / span) * count)));

/** How much of a line to show, typed at `rate` characters per second from `start`. */
const typed = (line: string, s: number, start: number, rate: number) =>
  [...line].slice(0, Math.max(0, Math.floor((s - start) * rate))).join('');

// ---------------------------------------------------------------------------------------------
// 1. WANTED: a bounty board
// ---------------------------------------------------------------------------------------------

const WANTED_SECONDS = 20;
const TICKER = textMask('BOUNTY: 10,000,000 CREDITS // CRIME: AGGRAVATED THIRST TRAPPING // DO NOT APPROACH');

/** The suspect's portrait as a hologram: bright face, dim hair and hoodie, a scan line passing. */
function drawSuspect(b: Sprite, x: number, y: number, s: number) {
  const scanRow = Math.floor(fract(s / 2.5) * 40) - 2;
  const glitchStep = Math.floor(s * 12);
  WANTED_FACE.forEach((row, j) => {
    const shift = hash(j >> 2, glitchStep) > 0.93 ? (hash(j, glitchStep) > 0.5 ? 2 : -2) : 0;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      if (ch === '#' && (i + j) % 2 === 1) continue;
      let c = ch === '-' ? 0xd4fcff : ch === '+' ? 0x2fa0d0 : 0x115688;
      if (Math.abs(j - scanRow) < 1) c = 0xffffff;
      // Scanlines dim the dark inks only, so the face stays clean.
      const dim = ch !== '-' && j % 3 === 2 ? 0.55 : 1;
      b.set(x + i + shift, y + j, scale(c, dim));
    }
  });
  // Target brackets, closing in and holding.
  const close = Math.min(1, s / 1.2);
  const inset = Math.round((1 - close) * 6);
  const red = Math.floor(s * 2) % 2 ? 0xff3050 : 0xffb030;
  for (const [cx, cy, dx, dy] of [
    [x - 1 + inset, y + inset, 1, 1],
    [x + 36 - inset, y + inset, -1, 1],
    [x - 1 + inset, y + 35 - inset, 1, -1],
    [x + 36 - inset, y + 35 - inset, -1, -1],
  ] as const) {
    b.rect(Math.min(cx, cx + dx * 4), cy, 5, 1, red);
    b.rect(cx, Math.min(cy, cy + dy * 4), 1, 5, red);
  }
}

const wanted: Paint = (b, s) => {
  fill(b, 0x0a0818, 0x1a0e14);
  // Police lights chase along the top edge.
  const swap = Math.floor(s * 4) % 2 === 0;
  b.rect(0, 0, b.w / 2, 1, swap ? 0xff3050 : 0x2a44a0);
  b.rect(b.w / 2, 0, b.w / 2, 1, swap ? 0x3a66d0 : 0xa01030);

  drawSuspect(b, 3, 1, s);

  // Header, flashing between red and orange, dropping out for a beat now and then.
  const phase = Math.floor(s * 3) % 5;
  const c = phase % 2 ? 0xffb030 : 0xff3050;
  if (phase !== 4) for (const dx of [0, 1]) text(b, 'WANTED:', 44 + dx, 3, c, 2, 1);
  // The second line takes turns: the name, then the terms.
  if (beat(s, WANTED_SECONDS, 4) !== 2) {
    for (const dx of [0, 1]) text(b, 'W0NB0N', 44 + dx, 19, c, 2, 1);
  } else {
    text(b, 'DEAD OR ALIVE', 44, 19, 0xffd8f0);
    text(b, 'REWARD 10M CR', 44, 27, 0xffb030);
  }

  // Hazard-yellow ticker tape, crossing exactly once.
  b.rect(0, 37, b.w, 9, 0xffc85a);
  b.rect(0, 37, b.w, 1, 0xfff6d0);
  const start = b.w - (s / WANTED_SECONDS) * (TICKER.w + b.w);
  for (let x = 0; x < b.w; x++) {
    const col = Math.floor(x - start);
    if (col < 0 || col >= TICKER.w) continue;
    for (let y = 0; y < 7; y++) if (TICKER.on(col, y)) b.set(x, 38 + y, 0x120e2a);
  }
};

// ---------------------------------------------------------------------------------------------
// 2. SPRUNK
// ---------------------------------------------------------------------------------------------

const SPRUNK_SECONDS = 20;
const PIN_PULL = 2.2;
const CAP_POP = 4;

/** A pineapple grenade in Sprunk green, its segments catching a moving highlight. */
function drawGrenade(b: Sprite, cx: number, cy: number, s: number) {
  const turn = fract(s * 0.25);
  for (let y = -15; y <= 15; y++) {
    for (let x = -12; x <= 12; x++) {
      const u = x / 12;
      const v = y / 15;
      if (u * u + v * v > 1) continue;
      // Segments: a grid of grooves.
      const groove = (x + 20) % 5 === 0 || (y + 24) % 5 === 0;
      const light = 1 - Math.abs(u - (turn * 1.4 - 0.7)) * 1.4 - Math.max(0, v) * 0.3;
      let c = light > 0.6 ? 0x48a060 : light > 0.25 ? 0x2a7a4a : light > -0.1 ? 0x1e5a3a : 0x14402c;
      if (groove) c = 0x0f2a20;
      b.set(cx + x, cy + y, c);
    }
  }
  // The label band.
  b.rect(cx - 11, cy - 3, 23, 7, 0xd4fcff);
  b.rect(cx - 11, cy - 3, 23, 1, 0xffffff);
  text(b, 'SPRK', cx - 11, cy - 3, 0x14806a, 1, 0);
  // The fuse housing on top.
  b.rect(cx - 3, cy - 18, 7, 3, 0x6a6a84);
  b.rect(cx - 3, cy - 18, 7, 1, 0x9a9ab4);
}

function drawFuse(b: Sprite, cx: number, cy: number, s: number) {
  // Lever down the side until the pin is pulled, then it springs away.
  if (s < PIN_PULL) {
    b.line(cx + 3, cy - 18, cx + 11, cy - 5, 0x9a9ab4);
    b.line(cx + 4, cy - 18, cx + 12, cy - 5, 0x6a6a84);
    b.ellipse(cx - 7, cy - 17, 3, 3, 0xd0d8f0);
    b.ellipse(cx - 7, cy - 17, 1.5, 1.5, 0x08201a);
  } else {
    const u = Math.min(1, (s - PIN_PULL) / 0.6);
    // The ring flies off left, the lever off right, both spinning out of frame.
    b.ellipse(cx - 7 - u * 30, cy - 17 - u * 18 + u * u * 22, 3, 3, 0xd0d8f0);
    b.line(cx + 3 + u * 24, cy - 18 - u * 10, cx + 11 + u * 26, cy - 5 - u * 16 + u * u * 20, 0x9a9ab4);
  }
  if (s < CAP_POP) {
    b.rect(cx - 2, cy - 21, 5, 3, 0x45455c);
  } else {
    const u = Math.min(1, (s - CAP_POP) / 0.8);
    b.rect(cx - 2 + Math.round(u * 6), cy - 21 - Math.round(u * 20), 5, 3, 0x45455c);
  }
}

/** How far the grenade has tipped over to pour, in radians (negative tips it left). */
const tipAt = (s: number) => (s < CAP_POP + 0.3 ? 0 : -(Math.min(1, (s - CAP_POP - 0.3) / 1.2) ** 2) * 1.15);

/**
 * Dark green foam pouring from the tipped grenade's mouth: a crown boiling at the opening, a stream
 * arcing down, and a frothing pool that rises along the bottom.
 */
function drawPour(b: Sprite, mouthX: number, mouthY: number, tip: number, s: number) {
  const since = s - CAP_POP;
  if (since < 0) return;
  const flow = Math.min(1, since / 0.8);
  // Spray thrown off the mouth.
  const spray = since < 2 ? 16 : 5;
  for (let i = 0; i < spray; i++) {
    const u = fract(since * (1.2 + hash(i, 40)) + hash(i, 41));
    const dir = hash(i, 42) - 0.5;
    b.set(Math.round(mouthX + dir * 24 * u - u * 6), Math.round(mouthY - 8 * u + 18 * u * u), hash(i, 43) > 0.5 ? 0xb8ff80 : 0x6aa83a);
  }
  // Foam boiling at the opening.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 2 + flow * 2.5 + Math.sin(s * 9 + i) * 0.7;
    b.rect(Math.round(mouthX + Math.cos(a) * r), Math.round(mouthY + Math.sin(a) * r), 2, 2, i % 3 ? 0x6aa83a : 0xd4fcff);
  }
  // The stream: out of the mouth along the tilt, then falling, wobbling as it goes.
  const level = Math.min(8, Math.floor(since * 1.6));
  const floor = b.h - level;
  if (tip < -0.3) {
    const out = Math.sin(-tip) * 6;
    for (let j = 0; mouthY + j < floor; j++) {
      const x = mouthX - out * Math.min(1, j / 6) - j * 0.15 + Math.sin(j * 0.5 + s * 10) * 0.7;
      const y = mouthY + j;
      b.rect(Math.round(x) - 1, y, 3, 1, j % 4 === Math.floor(s * 12) % 4 ? 0xd4fcff : 0x6aa83a);
      b.set(Math.round(x) - 1, y, 0xb8ff80);
      b.set(Math.round(x) + 1, y, 0x2a7a4a);
    }
  }
  // The pool.
  for (let y = 0; y < level; y++) {
    for (let x = 0; x < 44; x++) {
      const surface = y === level - 1;
      const c = surface ? (hash(x, Math.floor(s * 8)) > 0.45 ? 0xd4fcff : 0x6aa83a) : y === level - 2 ? 0x2a7a4a : 0x14402c;
      b.set(x, b.h - 1 - y, c);
    }
  }
  // Bubbles rising through the pool and popping on top.
  for (let i = 0; i < 12; i++) {
    const u = fract(s * 1.3 + hash(i, 31));
    const x = Math.round(hash(i, 32) * 42);
    const y = b.h - 1 - Math.round(u * level);
    if (u < 0.85) b.set(x, y, 0xb8ff80);
    else {
      b.set(x - 1, y - 1, 0xffffff);
      b.set(x + 1, y - 1, 0xffffff);
    }
  }
}

/** Copies `src` onto `b`, turned by `angle` about the source point (cx, cy), landing at (x, y). */
function blitRotated(b: Sprite, src: Sprite, cx: number, cy: number, x: number, y: number, angle: number) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const reach = Math.ceil(Math.hypot(src.w, src.h) / 2) + 2;
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      // Inverse rotation: where in the source does this destination pixel come from?
      const sx = Math.round(cx + i * ca + j * sa);
      const sy = Math.round(cy - i * sa + j * ca);
      const c = src.get(sx, sy);
      if (c !== -1) b.set(x + i, y + j, c);
    }
  }
}

const grenadeCanvas = new Sprite(48, 52);

const sprunk: Paint = (b, s) => {
  fill(b, 0x08201a, 0x0f5a4a);
  // The grenade drops in and settles.
  const drop = s < 1 ? Math.round((1 - s) ** 2 * -40) : s < 1.4 ? Math.round(Math.sin((s - 1) * 8) * -2) : 0;
  const shake = s > PIN_PULL && s < CAP_POP ? Math.round(Math.sin(s * 40)) : 0;
  const cx = 25 + shake;
  const cy = 25 + drop;
  // Drawn upright into its own canvas, then tipped over to pour.
  grenadeCanvas.px.fill(0);
  drawGrenade(grenadeCanvas, 24, 28, s);
  drawFuse(grenadeCanvas, 24, 28, s);
  const tip = tipAt(s);
  blitRotated(b, grenadeCanvas, 24, 28, cx, cy, tip);
  // The mouth: the top of the fuse, carried round by the tilt.
  const mouthX = cx + Math.round(Math.sin(tip) * 20);
  const mouthY = cy - Math.round(Math.cos(tip) * 20);
  drawPour(b, mouthX, mouthY, tip, s);

  const title = s < 1.5 ? 'SPRUNK'.slice(0, Math.floor(s * 4)) : 'SPRUNK';
  text(b, title, 49, 4, 0x0a4020, 2, 1);
  text(b, title, 48, 3, 0xffffff, 2, 1);
  if (s < CAP_POP) {
    text(b, typed('PULL THE PIN.', s, 1.5, 12), 48, 22, 0xb8ff80);
    return;
  }
  const beats = [
    ['NOW WITH', 'MERCURY!'],
    ['WIN THE WAR', 'ON THIRST.'],
  ];
  const END_CARD = 4.5;
  const span = (SPRUNK_SECONDS - CAP_POP - END_CARD) / beats.length;
  if (s < SPRUNK_SECONDS - END_CARD) {
    const index = beat(s - CAP_POP, SPRUNK_SECONDS - CAP_POP - END_CARD, beats.length);
    const local = s - CAP_POP - index * span;
    const lines = beats[index]!;
    text(b, typed(lines[0]!, local, 0, 14), 48, 22, 0xb8ff80);
    text(b, typed(lines[1]!, local, 0.7, 14), 48, 31, 0xffffff);
    if (index === 0) {
      // A periodic-table chip for mercury, pulsing while it's the pitch.
      const pulse = fract(s * 2) < 0.5;
      b.frame(120, 21, 17, 17, pulse ? 0xffffff : 0x80ffc0);
      text(b, 'Hg', 123, 28, 0xffffff);
      plotText((px, py) => b.set(px, py, 0x40d050), '80', 122, 22, 1, 0);
    }
    return;
  }
  const local = s - (SPRUNK_SECONDS - END_CARD);
  text(b, typed('EXPLODE OUT', local, 0, 14), 48, 22, 0xb8ff80);
  text(b, typed('OF EXISTENCE.', local, 0.9, 14), 48, 31, 0xffffff);
};

// ---------------------------------------------------------------------------------------------
// 3. A pristine corporate spot that breaks into a warning
// ---------------------------------------------------------------------------------------------

const LISTENING_SECONDS = 18;
const CLEAN_END = 9;
const GLITCH_END = 11;

function corporate(b: Sprite, s: number) {
  fill(b, 0xffffff, 0xb8d4fc);
  // A logo that breathes, gently.
  const r = 13 + (Math.sin(s * 1.4) > 0.6 ? 1 : 0);
  b.ellipse(19, 22, r, r, 0x3a66d0);
  b.ellipse(19, 22, r - 3, r - 3, 0xffffff);
  b.ellipse(19, 26, 9, 7, 0x6a9cf0);
  b.ellipse(19, 30, 11, 6, 0xffffff);
  b.rect(6, 30, 27, 9, 0xffffff);
  text(b, 'HALCYON', 39, 5, 0x223a84, 2, 1);
  const lines = [
    ['YOUR SAFETY IS', 'OUR PRIORITY.'],
    ['WE CARE.', 'WE LISTEN.'],
    ['TRUST', 'HALCYON.'],
  ][beat(s, CLEAN_END, 3)]!;
  text(b, lines[0]!, 40, 26, 0x45455c);
  text(b, lines[1]!, 40, 35, 0x6a6a84);
}

function rebellion(b: Sprite, s: number) {
  fill(b, 0x140608, 0x3a0820);
  for (let i = 0; i < 120; i++) {
    b.set(Math.floor(hash(i, Math.floor(s * 20)) * b.w), Math.floor(hash(i, 7, Math.floor(s * 20)) * b.h), 0x5a0a20);
  }
  const on = hash(Math.floor(s * 9), 3) > 0.12;
  const c = on ? 0xff3050 : 0x80102a;
  const lines = [
    ['THEY ARE', 'LISTENING'],
    ['DISCONNECT', 'NOW'],
    ['THEY ARE', 'LISTENING'],
  ][beat(s - GLITCH_END, LISTENING_SECONDS - GLITCH_END, 3)]!;
  centered(b, lines[0]!, 4, c, 2, 1, 0x000000);
  centered(b, lines[1]!, 22, c, 2, 1, 0x000000);
  // Paint runs down from the letters.
  for (let i = 0; i < 9; i++) {
    const x = 16 + Math.floor(hash(i, 5) * 108);
    const len = 2 + Math.floor(hash(i, 6) * 6 * Math.min(1, (s - GLITCH_END) / 2));
    b.rect(x, 36, 1, len, 0xd01a3c);
  }
}

const listening: Paint = (b, s) => {
  if (s < CLEAN_END) return corporate(b, s);
  if (s >= GLITCH_END) return rebellion(b, s);
  // The break: rows tear sideways, colors split, and the warning shows through in stabs.
  const u = (s - CLEAN_END) / (GLITCH_END - CLEAN_END);
  const step = Math.floor(s * 24);
  const clean = new Sprite(b.w, b.h);
  corporate(clean, CLEAN_END - 0.01);
  const red = new Sprite(b.w, b.h);
  rebellion(red, GLITCH_END);
  for (let y = 0; y < b.h; y++) {
    const band = Math.floor(y / 3);
    const tear = hash(band, step) < u * 0.8 ? Math.floor((hash(band, step, 2) - 0.5) * 30 * u) : 0;
    const source = hash(band, step, 3) < u * u ? red : clean;
    for (let x = 0; x < b.w; x++) {
      const c = source.get((((x + tear) % b.w) + b.w) % b.w, y);
      if (c === -1) continue;
      const split = source === clean && hash(band, step, 4) < u ? mix(c, 0xff0040, 0.4) : c;
      b.set(x, y, hash(x >> 2, band, step) < u * 0.08 ? 0xffffff : split);
    }
  }
};

// ---------------------------------------------------------------------------------------------
// 4. DOTORO
// ---------------------------------------------------------------------------------------------

const BOOT_LENGTH = BOOT_FRAMES.reduce((sum, f) => sum + f.delay, 0) / 1000;
const BOOT_COLORS: Record<string, RGB> = { '1': 0x45455c, '2': 0x9a9ab4, '3': 0xffffff, g: 0x14806a, G: 0x55fe55 };

/** The boot frame with the most drawn on a still-black screen: the finished device, for the ad. */
const BOOT_ICON = (() => {
  const lit = (s: string) => s.replace(/\./g, '').length;
  const settled = BOOT_FRAMES.filter((f) => lit(f.s) <= 136);
  return settled.reduce((best, f) => (lit(f.s) > lit(best.s) ? f : best), settled[0]!).s;
})();

function bootFrame(s: number): string {
  let elapsed = s * 1000;
  for (const f of BOOT_FRAMES) {
    if (elapsed < f.delay) return f.s;
    elapsed -= f.delay;
  }
  return BOOT_FRAMES.at(-1)!.s;
}

function drawBoot(b: Sprite, frame: string, x: number, y: number, size: number) {
  for (let i = 0; i < 256; i++) {
    const c = BOOT_COLORS[frame[i]!];
    if (c !== undefined) b.rect(x + (i % 16) * size, y + Math.floor(i / 16) * size, size, size, c);
  }
}

const DOTORO_COPY = [
  ['RELIVE THE PAST', 'WITH SYNTHETIC', 'CONSTRAINTS.'],
  ['DELVE INTO', 'MANUFACTURED', 'NOSTALGIA.'],
  ['32x32 PIXELS.', 'ZERO REGRETS.', ''],
];

const dotoro: Paint = (b, s, duration) => {
  fill(b, 0x000000);
  if (s < BOOT_LENGTH) {
    // The real boot, at the speed the device plays it.
    drawBoot(b, bootFrame(s), 54, 7, 2);
    return;
  }
  for (let y = 0; y < b.h; y += 2) b.rect(0, y, b.w, 1, 0x050a08);
  drawBoot(b, BOOT_ICON, 4, 7, 2);
  text(b, 'DOTORO', 43, 4, 0xe8d8ca, 2, 1);
  const span = duration - BOOT_LENGTH;
  const index = beat(s - BOOT_LENGTH, span, DOTORO_COPY.length);
  const local = s - BOOT_LENGTH - (index * span) / DOTORO_COPY.length;
  let start = 0;
  let caretX = 43;
  let caretY = 26;
  DOTORO_COPY[index]!.forEach((line, i) => {
    const shown = typed(line, local, start, 16);
    start += line.length / 16 + 0.15;
    if (!shown) return;
    text(b, shown, 43, 20 + i * 8, i === 0 ? 0x55fe55 : 0x20c090);
    caretX = 43 + textWidth(shown) + 2;
    caretY = 26 + i * 8;
  });
  if (fract(s * 2) < 0.5) b.rect(caretX, caretY, 5, 1, 0x55fe55);
};

// ---------------------------------------------------------------------------------------------
// 5. GRIM serotonin capsules
// ---------------------------------------------------------------------------------------------

const GRIM_SECONDS = 20;

/** A capsule, black and pink, lying at an angle: three poses so it can tumble as it falls. */
function capsule(b: Sprite, x: number, y: number, pose: number) {
  const dark = 0x1a1a26;
  const pink = 0xff66b8;
  if (pose === 0) {
    b.rect(x, y, 2, 2, dark);
    b.rect(x + 2, y, 2, 2, pink);
  } else if (pose === 1) {
    b.rect(x, y, 2, 2, dark);
    b.rect(x, y + 2, 2, 2, pink);
  } else {
    b.set(x, y, dark);
    b.set(x + 1, y + 1, dark);
    b.set(x + 2, y + 2, pink);
    b.set(x + 3, y + 3, pink);
  }
}

function pillRain(b: Sprite, s: number) {
  for (let i = 0; i < 14; i++) {
    const speed = 8 + hash(i, 1) * 10;
    const y = Math.round(fract(s * (speed / 60) + hash(i, 2)) * (b.h + 8)) - 6;
    const x = Math.round(hash(i, 3) * (b.w - 4));
    capsule(b, x, y, Math.floor(s * 4 + i) % 3);
  }
}

function bigCapsule(b: Sprite, cx: number, cy: number, s: number) {
  const tilt = Math.round(Math.sin(s * 1.2) * 3);
  b.ellipse(cx, cy, 18, 9, 0x0f4470);
  for (let i = 0; i < 26; i++) {
    const x = cx - 13 + i;
    const y = cy + Math.round(((i - 13) * tilt) / 13);
    b.rect(x, y - 4, 1, 9, i < 13 ? 0x1a1a26 : 0xff66b8);
    b.set(x, y - 3, i < 13 ? 0x45455c : 0xffd8f0);
  }
  if (fract(s * 0.5) < 0.1) {
    b.set(cx + 8, cy - 5, 0xffffff);
    b.set(cx + 7, cy - 4, 0xffffff);
    b.set(cx + 9, cy - 4, 0xffffff);
    b.set(cx + 8, cy - 3, 0xffffff);
  }
}

const grim: Paint = (b, s) => {
  fill(b, 0x0b2a4a, 0x08061a);
  pillRain(b, s);
  const index = beat(s, GRIM_SECONDS, 3);
  const local = s - (index * GRIM_SECONDS) / 3;
  if (index === 0) {
    // The brand: capsule and name side by side, the promise underneath.
    bigCapsule(b, 22, 14, s);
    text(b, 'GRIM', 44, 3, 0xffffff, 3, 1);
    b.rect(44, 25, 70, 1, 0xff66b8);
    centered(b, typed('REJECT NATURAL.', local, 0.3, 14), 29, 0xd4fcff);
    centered(b, typed('SYNTHESIZE PERFECTION.', local, 1.6, 14), 38, 0xff8cca);
    return;
  }
  if (index === 1) {
    // The question, full width, the answer in big pink.
    centered(b, typed('WHY FEEL NATURAL', local, 0, 14), 5, 0xd4fcff);
    centered(b, typed('WHEN YOU CAN FEEL', local, 1.3, 14), 14, 0xd4fcff);
    if (local > 2.7) centered(b, 'PERFECT?', 26, 0xff66b8, 2, 1, 0x2a0a3a);
    return;
  }
  // The product shot: capsule centered between the two lines.
  centered(b, typed('SEROTONIN ON DEMAND', local, 0, 14), 3, 0xd4fcff);
  bigCapsule(b, 70, 22, s);
  centered(b, typed('HAPPINESS, PRESCRIBED.', local, 1.6, 14), 37, 0xff8cca);
};

// ---------------------------------------------------------------------------------------------
// 6. A neon crash screen, fixed by a terminal typing in katakana
// ---------------------------------------------------------------------------------------------

const CRASH_SECONDS = 22;
const ERRORS_FROM = 3;
const ERRORS_UNTIL = 14;
const FREEZE_UNTIL = 15.2;
const SHUTDOWN = 16;
const MAX_ERRORS = 18;

function bsod(b: Sprite, s: number) {
  fill(b, 0x1368a0, 0x0f4470);
  text(b, ':(', 4, 3, 0xffffff, 2, 1);
  text(b, 'ICE BREACH', 34, 3, 0xd4fcff);
  text(b, 'SECTOR 7G', 34, 11, 0x9ff8ff);
  text(b, 'PANIC 0xDEADC0DE', 4, 21, 0xffffff);
  text(b, 'NEURAL LINK DESYNC', 4, 29, 0xd4fcff);
  const pct = Math.min(99, Math.floor((s / ERRORS_UNTIL) * 99));
  text(b, `SOUL DUMP ${pct}%`, 4, 37, 0x9ff8ff);
}

/** The classic error box: blue title bar, a red stop icon, a Fix button that fixes nothing. */
function errorDialog(b: Sprite, x: number, y: number) {
  const w = 92;
  const h = 37;
  b.rect(x, y, w, h, 0xece9d8);
  b.frame(x, y, w, h, 0x0b3ac0);
  // Title bar.
  for (let j = 0; j < 9; j++) b.rect(x + 1, y + 1 + j, w - 2, 1, mix(0x3a76f0, 0x0b3ac0, j / 8));
  text(b, 'Error', x + 3, y + 2, 0xffffff);
  b.rect(x + w - 10, y + 2, 8, 7, 0x9a9ab4);
  b.line(x + w - 8, y + 3, x + w - 4, y + 7, 0xffffff);
  b.line(x + w - 4, y + 3, x + w - 8, y + 7, 0xffffff);
  // Stop icon.
  b.ellipse(x + 8, y + 18, 4.5, 4.5, 0xd01a3c);
  b.line(x + 6, y + 16, x + 10, y + 20, 0xffffff);
  b.line(x + 10, y + 16, x + 6, y + 20, 0xffffff);
  text(b, 'Click Fix to', x + 16, y + 12, 0x1a1a26);
  text(b, 'fix error.', x + 16, y + 20, 0x1a1a26);
  // The button.
  b.rect(x + 34, y + 28, 24, 8, 0xece9d8);
  b.frame(x + 34, y + 28, 24, 8, 0x6a6a84);
  text(b, 'Fix', x + 38, y + 29, 0x9a9ab4);
}

/** How many error boxes are up: they come faster and faster. */
const errorCount = (s: number) =>
  s < ERRORS_FROM ? 0 : Math.min(MAX_ERRORS, 1 + Math.floor(((s - ERRORS_FROM) / (ERRORS_UNTIL - ERRORS_FROM)) ** 1.6 * MAX_ERRORS));

const crash: Paint = (b, s) => {
  if (s >= SHUTDOWN) {
    // Dead. A faint afterglow in the middle, fading.
    fill(b, 0x000000);
    const fade = Math.max(0, 1 - (s - SHUTDOWN) / 2);
    if (fade > 0) b.set(Math.floor(b.w / 2), Math.floor(b.h / 2), scale(0xd4fcff, fade));
    return;
  }
  bsod(b, Math.min(s, ERRORS_UNTIL));
  const count = errorCount(Math.min(s, ERRORS_UNTIL));
  for (let i = 0; i < count; i++) {
    // Cascading down and right, wrapping back to the top-left like a stuck desktop.
    const x = 1 + ((i * 6) % 46) + Math.floor(i / 8) * 2;
    const y = 1 + ((i * 3) % 9);
    errorDialog(b, x, y);
  }
  if (s < ERRORS_UNTIL) return;
  if (s < FREEZE_UNTIL) {
    // Frozen: rows tear and flash.
    const step = Math.floor(s * 20);
    const copy = new Sprite(b.w, b.h);
    copy.px.set(b.px);
    for (let y = 0; y < b.h; y++) {
      const tear = hash(y >> 2, step) > 0.6 ? Math.floor((hash(y, step) - 0.5) * 24) : 0;
      for (let x = 0; x < b.w; x++) {
        const c = copy.get((((x + tear) % b.w) + b.w) % b.w, y);
        if (c !== -1) b.set(x, y, hash(x >> 3, y >> 1, step) > 0.97 ? 0xffffff : c);
      }
    }
    return;
  }
  // Power cut: the picture collapses to a bright line, then a dot, then nothing.
  const u = (s - FREEZE_UNTIL) / (SHUTDOWN - FREEZE_UNTIL);
  fill(b, 0x000000);
  const half = Math.max(0, Math.round((1 - u * 1.6) * b.h * 0.5));
  const width = u < 0.6 ? b.w : Math.max(1, Math.round(b.w * (1 - (u - 0.6) / 0.4)));
  const left = Math.floor((b.w - width) / 2);
  const mid = Math.floor(b.h / 2);
  b.rect(left, mid - half, width, Math.max(1, half * 2), u < 0.3 ? 0xd4fcff : 0xffffff);
};

/** Sparks spray from the board's edges as it dies, and spit now and then afterwards. */
function crashSparks(frame: Frame, s: number, x: number, y: number) {
  const bursts = [
    [FREEZE_UNTIL + 0.6, 4, BOARD_H, 1],
    [SHUTDOWN, 30, BOARD_H, 2],
    [SHUTDOWN + 0.15, BOARD_W - 8, BOARD_H, 3],
    [SHUTDOWN + 1.4, 70, BOARD_H, 4],
    [SHUTDOWN + 3.1, BOARD_W - 30, BOARD_H, 5],
  ] as const;
  for (const [at, bx, by, seed] of bursts) {
    const age = s - at;
    if (age < 0 || age > 1.2) continue;
    if (age < 0.12) {
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) frame.add(x + bx + i, y + by + j, 0x9ff8ff, 0.6 * (1 - age / 0.12));
    }
    drawSparks(frame, x + bx, y + by, y + by + 60, age, 900 + seed, 26);
  }
}

// ---------------------------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------------------------

const SPOTS: readonly Spot[] = [
  { seconds: WANTED_SECONDS, tint: () => 0xff3040, paint: wanted },
  { seconds: SPRUNK_SECONDS, tint: () => 0x30d060, paint: sprunk },
  { seconds: LISTENING_SECONDS, tint: (s) => (s < CLEAN_END ? 0xb8d4fc : 0xff2040), paint: listening },
  { seconds: 20, tint: () => 0x30c070, paint: dotoro },
  { seconds: GRIM_SECONDS, tint: () => 0x2fa0d0, paint: grim },
  { seconds: CRASH_SECONDS, tint: (s) => (s < FREEZE_UNTIL ? 0x2080ff : s < SHUTDOWN ? 0xc0e0ff : 0), paint: crash, scene: crashSparks },
];
const RUN_SECONDS = SPOTS.reduce((sum, spot) => sum + spot.seconds, 0);
/** Every spot plays in full, so the length of the run sets how many fit in the loop. */
const RUNS_PER_LOOP = LOOP_SECONDS / RUN_SECONDS;

/** Seconds into the run at the start of the loop: the seam lands mid-spot, never on a cut. */
const RUN_OFFSET = 7;

/** Which spot is on, and how far into it, at loop time t. */
function spotAt(t: number): { index: number; s: number } {
  // In whole seconds first, so t = 1 lands exactly where t = 0 does.
  let s = (t * LOOP_SECONDS + RUN_OFFSET) % RUN_SECONDS;
  for (let i = 0; i < SPOTS.length; i++) {
    if (s < SPOTS[i]!.seconds) return { index: i, s };
    s -= SPOTS[i]!.seconds;
  }
  return { index: 0, s: 0 };
}

export function createBillboard(L: Layer, legs: readonly (readonly [number, number])[]) {
  if (!Number.isInteger(RUNS_PER_LOOP)) throw new Error(`Billboard run of ${RUN_SECONDS}s must divide the loop`);
  const fx = BOARD_X - 3;
  const fy = BOARD_Y - 3;
  const fw = BOARD_W + 6;
  const fh = BOARD_H + 6;
  for (const [legX, foot] of legs) {
    L.rect(legX, fy + fh, 3, foot - (fy + fh), 0x0c0a2c);
    L.rect(legX, fy + fh, 1, foot - (fy + fh), 0x2c3aa8);
  }
  L.rect(fx, fy, fw, fh, 0x0c0a2c);
  L.frame(fx, fy, fw, fh, 0x2a2470);
  L.rect(fx - 2, fy + fh, fw + 4, 2, 0x161136);
  L.rect(fx - 2, fy + fh, fw + 4, 1, 0x3a3aa0);
  // Rust weeping from the bolts.
  for (const bx of [fx + 6, fx + 50, fx + 96, fx + fw - 8]) {
    L.rect(bx, fy + fh + 2, 1, 3 + Math.floor(hash(bx, 1) * 6), 0x5a2a0c);
  }

  const glows = new Map<RGB, Glow>();
  const glowFor = (c: RGB) => {
    let g = glows.get(c);
    if (!g) {
      g = bakeGlow(BOARD_X - 30, BOARD_Y - 30, BOARD_W + 60, BOARD_H + 60, 9, 1, (set) => {
        for (let j = 0; j < BOARD_H; j++) for (let i = 0; i < BOARD_W; i++) set(BOARD_X + i, BOARD_Y + j, c);
      });
      glows.set(c, g);
    }
    return g;
  };
  // Prime the cache so no bake lands mid-animation.
  for (const spot of SPOTS) for (let s = 0; s < spot.seconds; s += 0.25) glowFor(spot.tint(s));

  const current = new Sprite(BOARD_W, BOARD_H);
  const previous = new Sprite(BOARD_W, BOARD_H);
  const CUT = 0.35;

  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.near);
    const sy = shiftY(ctx, DEPTH.near);
    const vx = sx + frame.origin;
    const { index, s } = spotAt(t);
    const spot = SPOTS[index]!;
    current.px.fill(0);
    spot.paint(current, s, spot.seconds);

    // Cuts break up in blocks for a moment, the old spot showing through.
    const cutting = s < CUT;
    if (cutting) {
      const before = SPOTS[(index + SPOTS.length - 1) % SPOTS.length]!;
      previous.px.fill(0);
      before.paint(previous, before.seconds - 0.001, before.seconds);
    }

    const tint = spot.tint(s);
    if (tint !== 0) frame.glow(glowFor(tint), sx, sy, 0.38);

    const step = Math.floor(s * 30);
    for (let j = 0; j < BOARD_H; j++) {
      for (let i = 0; i < BOARD_W; i++) {
        const old = cutting && hash(i >> 3, j >> 2, step) > s / CUT;
        let c = (old ? previous : current).get(i, j);
        if (c === -1) c = 0;
        // LED pitch: every second row a little darker.
        if (j % 2 === 1) c = scale(c, 0.86);
        frame.put(BOARD_X + i + vx, BOARD_Y + j + sy, c);
      }
    }
    spot.scene?.(frame, s, BOARD_X + vx, BOARD_Y + sy);
  };
}
