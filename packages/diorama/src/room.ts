import { secondsSinceSpark } from './balcony';
import { type Ctx, DEPTH, shiftX, shiftY } from './city';
import { bakeGlow, clamp, type Frame, fract, hash, Layer, LOOP_SECONDS, mix, noise, type RGB, scale, spin, Sprite, TILE_MASK, VIEW_H } from './core';
import { drawSmoke } from './fx';
import { C } from './palette';

export const GLASS_TOP = 16;
export const GLASS_BOTTOM = 166;
const SILL_BOTTOM = 172;
export const DESK_TOP = SILL_BOTTOM;
export const DESK_FRONT = 228;
/** Where perspective lines on the desk meet: Dotoro's camera horizon. */
const VANISH_X = 240;
const VANISH_Y = 98;
/** The row Dotoro's base stands on. The desk pivots around this row, so the device stays put. */
const PIVOT_ROW = 190;

/** How far a desk row slides: the plane shears, so far rows follow the city and near rows oppose it. */
export const deskShift = (ctx: Ctx, row: number) => Math.round((ctx.px * (PIVOT_ROW - row) * DEPTH.glass) / (PIVOT_ROW - DESK_TOP));

const DARK = 0x07060e;

// ---------------------------------------------------------------------------------------------
// The cat
// ---------------------------------------------------------------------------------------------

const CAT_W = 92;
const CAT_H = 96;
const CAT_FILL = 0x05040b;

type Ears = 'rest' | 'left' | 'right' | 'back';

function rimLit(mask: Sprite) {
  // Lit from the window in front of it: edges glow, the body stays a black cut-out.
  const out = new Sprite(mask.w, mask.h);
  const solid = (x: number, y: number) => mask.get(x, y) !== -1;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (!solid(x, y)) continue;
      let c: RGB = CAT_FILL;
      const open = {
        left: !solid(x - 1, y),
        right: !solid(x + 1, y),
        up: !solid(x, y - 1),
      };
      const fall = clamp(1.1 - y / 86);
      if (open.right) c = mix(CAT_FILL, 0x6cf0f8, 0.95 * fall);
      else if (open.left) c = mix(CAT_FILL, 0xff4fb0, 0.95 * fall);
      else if (open.up) c = mix(CAT_FILL, x > 36 ? 0xb8e8ff : 0xffb3e0, 0.9 * fall);
      else if (!solid(x + 2, y)) c = mix(CAT_FILL, 0x0f5a7a, 0.7 * fall);
      else if (!solid(x - 2, y)) c = mix(CAT_FILL, 0x701a70, 0.7 * fall);
      out.set(x, y, c);
    }
  }
  return out;
}

function earPoints(side: -1 | 1, flicked: boolean, flattened: boolean, head: number): readonly (readonly [number, number])[] {
  const cx = 36;
  const inner: [number, number] = [cx + side * 3, head - 11];
  const outer: [number, number] = [cx + side * 14, head - 4];
  let tip: [number, number] = [cx + side * 12, head - 21];
  if (flicked) tip = [cx + side * 17, head - 16];
  if (flattened) tip = [cx + side * 20, head - 9];
  return [inner, tip, outer];
}

function buildCat(ears: Ears, tailStep: number, breath: number): Sprite {
  const m = new Sprite(CAT_W, CAT_H);
  const fill = 0x111111;
  const head = 24 + breath;
  // Pear of the body, seen from behind, facing the rain.
  m.ellipse(36, 66, 20, 27, fill);
  m.ellipse(20, 80, 13, 13, fill);
  m.ellipse(52, 80, 13, 13, fill);
  m.ellipse(36, 44 + breath, 13, 15, fill);
  // Head and cheek ruffs.
  m.ellipse(36, head, 15, 13, fill);
  m.ellipse(25, head + 5, 5, 4, fill);
  m.ellipse(47, head + 5, 5, 4, fill);
  // Ears.
  m.poly(earPoints(-1, ears === 'left', ears === 'back', head), fill);
  m.poly(earPoints(1, ears === 'right', ears === 'back', head), fill);
  // Whiskers just past the cheeks.
  m.set(19, head + 5, fill);
  m.set(18, head + 4, fill);
  m.set(53, head + 5, fill);
  m.set(54, head + 4, fill);
  // Tail along the desk, tip curling up.
  const sway = (tailStep - 3.5) / 3.5;
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const x = 48 + u * 34 + sway * 3 * u * u;
    const y = 87 - u ** 3 * (18 + sway * 5);
    const r = 3.8 - u * 1.9;
    m.ellipse(x, y, r, r, fill);
  }
  // Flat base where it meets the desk.
  for (let y = 92; y < CAT_H; y++) for (let x = 0; x < CAT_W; x++) m.clear(x, y);
  const lit = rimLit(m);
  // The thin skin of a backlit ear glows faintly.
  for (const side of [-1, 1] as const) {
    const ex = 36 + side * 9;
    if (ears === 'rest' || (ears === 'left' && side === 1) || (ears === 'right' && side === -1)) {
      lit.line(ex, head - 13, ex, head - 7, 0x3c0e4e);
    }
  }
  return lit;
}

/** Ear flicks as (loop time, ear). Each flick is a quick double beat. */
const IDLE_TWITCHES: readonly (readonly [number, Ears])[] = [
  [0.02, 'left'],
  [0.15, 'right'],
  [0.31, 'left'],
  [0.4, 'right'],
  [0.405, 'right'],
  [0.53, 'left'],
  [0.655, 'right'],
  [0.71, 'left'],
  [0.88, 'right'],
];

function earState(t: number): Ears {
  // Sparks spook it: ears go back for a moment, half a second after each crack.
  const since = secondsSinceSpark(t);
  if (since > 0.4 && since < 1.1) return 'back';
  for (const [at, ear] of IDLE_TWITCHES) {
    const d = fract(t - at) * LOOP_SECONDS;
    if (d < 0.14 || (d > 0.24 && d < 0.38)) return ear;
  }
  return 'rest';
}

function createCat() {
  const cache = new Map<number, Sprite>();
  const earIndex: Record<Ears, number> = { rest: 0, left: 1, right: 2, back: 3 };
  const x = 392;
  const base = 186;
  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const ears = earState(t);
    const swing = Math.sin(spin(t, 11) + 0.6) * 0.7 + Math.sin(spin(t, 26) + 2.1) * 0.3;
    const tail = clamp(Math.round((swing * 0.5 + 0.5) * 7), 0, 7);
    const breath = fract(t * 22) < 0.5 ? 0 : 1;
    const key = earIndex[ears] * 100 + tail * 10 + breath;
    let s = cache.get(key);
    if (!s) {
      s = buildCat(ears, tail, breath);
      cache.set(key, s);
    }
    frame.sprite(s, x + deskShift(ctx, base) + frame.origin, base - 92);
  };
}

// ---------------------------------------------------------------------------------------------
// Desk clutter
// ---------------------------------------------------------------------------------------------

interface Prop {
  sprite: Sprite;
  x: number;
  /** Row of the object's foot on the desk, which sets its parallax. */
  base: number;
}

/** The lamp is drawn at this scale: every coordinate scales and every stroke thickens with it. */
const LAMP_SCALE = 1.5;
const LAMP_H = Math.round(68 * LAMP_SCALE);
const LAMP_W = Math.round(70 * LAMP_SCALE);

/** A vintage industrial work lamp: cast-iron base, spring arm, brass knuckles, a caged plasma bulb. */
function makeLamp(): Sprite {
  const k = LAMP_SCALE;
  const p = (v: number) => Math.round(v * k);
  const s = new Sprite(LAMP_W, LAMP_H);
  const iron = 0x1a1a26;
  const ironLit = 0x45455c;
  const steel = 0x2c2c3e;
  const brass = 0xb65e0e;
  const brassDark = 0x763610;
  /** A straight member: `width` strokes side by side, the first one catching the light. */
  const bar = (x0: number, y0: number, x1: number, y1: number, width: number, color: number, lit: number) => {
    const strokes = Math.max(1, Math.round(width * k));
    for (let i = 0; i < strokes; i++) s.line(p(x0) + i, p(y0), p(x1) + i, p(y1), color);
    s.line(p(x0), p(y0), p(x1), p(y1), lit);
  };
  const knuckle = (x: number, y: number, r: number) => {
    s.ellipse(p(x), p(y), r * k, r * k, brassDark);
    s.ellipse(p(x) - 1, p(y) - 1, r * k * 0.4, r * k * 0.4, brass);
  };

  // Cast-iron base: heavy disc, raised boss, rivets round the rim, a brass toggle.
  s.ellipse(p(22), p(63), 15 * k, 4 * k, 0x0a0812);
  s.ellipse(p(22), p(62), 14 * k, 3.5 * k, iron);
  s.rect(p(9), p(61), p(27), 1, ironLit);
  for (const rx of [11, 17, 27, 33]) s.rect(p(rx), p(63), 2, 1, 0x6a6a84);
  s.ellipse(p(22), p(59), 5 * k, 2 * k, steel);
  s.rect(p(33), p(58), p(2), p(2), brass);
  s.set(p(34), p(57), 0xef9420);
  // Post, shoulder knuckle.
  s.rect(p(21), p(46), p(3), p(13), steel);
  s.rect(p(21), p(46), 1, p(13), ironLit);
  knuckle(22, 45, 3);
  // Lower arm, and its tension spring alongside.
  bar(22, 45, 30, 22, 3, steel, ironLit);
  for (let i = 0; i < 12; i++) {
    const u = i / 12;
    s.set(p(26 + 8 * u) + (i % 2 ? 1 : -1), p(44 - 20 * u), 0x9a9ab4);
  }
  // Elbow, upper arm, head knuckle.
  knuckle(31, 21, 3);
  bar(31, 21, 49, 13, 2, steel, ironLit);
  knuckle(50, 13, 2.5);
  // Enamel shade, a cone hanging down, its rim chipped to bare metal.
  const shade: [number, number][] = [
    [47, 15],
    [56, 11],
    [67, 24],
    [64, 29],
    [50, 31],
    [45, 21],
  ];
  s.poly(
    shade.map(([x, y]) => [p(x), p(y)] as const),
    0x1c2620,
  );
  s.line(p(56), p(11), p(67), p(24), 0x3e4e40);
  s.line(p(56) + 1, p(11) + 1, p(67) - 1, p(24), 0x2c3a30);
  s.line(p(50), p(31), p(64), p(29), 0x6a6a84);
  for (const [cx, cy] of [
    [53, 30],
    [60, 29],
    [48, 22],
  ] as const) {
    s.rect(p(cx), p(cy), 2, 1, 0x5a2a0c);
  }
  // A wire cage round the bulb.
  s.line(p(51), p(31), p(53), p(36), 0x45455c);
  s.line(p(63), p(29), p(61), p(35), 0x45455c);
  s.line(p(53), p(36), p(61), p(35), 0x45455c);
  s.line(p(57), p(31), p(57), p(36), 0x2c2c3e);
  return s;
}

/** An ashtray with a cigarette resting on its lip, burnt halfway down. The ember is drawn live. */
function makeAshtray(): Sprite {
  const s = new Sprite(24, 8);
  s.ellipse(8, 5, 8, 2.5, 0x1a1a26);
  s.ellipse(8, 4.5, 6, 1.5, 0x0a0812);
  s.rect(1, 5, 15, 1, 0x2c2c3e);
  // Two pixels thick: filter, then paper, then a grey cap of ash at the burning end.
  s.rect(5, 3, 5, 2, 0xb65e0e);
  s.rect(5, 3, 5, 1, 0xef9420);
  s.rect(10, 2, 8, 2, 0xd0d8f0);
  s.rect(10, 2, 8, 1, 0xffffff);
  s.rect(6, 4, 4, 1, 0x763610);
  s.rect(18, 1, 1, 2, 0x6a6a84);
  // Ash fallen in the tray.
  s.set(6, 5, 0x45455c);
  s.set(9, 5, 0x6a6a84);
  return s;
}

/**
 * Lights a desk object the way the room lights it: dim, the lamp's plasma violet on the side facing
 * it, and the city's glow catching the top and back edges.
 */
function roomLit(s: Sprite, lampSide: 'left' | 'right'): Sprite {
  const out = new Sprite(s.w, s.h);
  const dx = lampSide === 'left' ? -1 : 1;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const c = s.get(x, y);
      if (c === -1) continue;
      // Dimmed as a whole; the color comes from the edges, so the palette pass doesn't speckle it.
      let lit = scale(c, 0.68);
      if (s.get(x + dx, y) === -1) lit = mix(lit, 0xd070ff, 0.55);
      else if (s.get(x + dx * 2, y) === -1) lit = mix(lit, 0xc048ff, 0.25);
      else if (s.get(x, y - 1) === -1) lit = mix(lit, 0x6cf0f8, 0.28);
      else if (s.get(x - dx, y) === -1) lit = mix(lit, 0xff3fa8, 0.3);
      out.set(x, y, lit);
    }
  }
  return out;
}

/** The left of the desk holds only the lamp and the cigarette; nothing in the middle third. */
function createProps(): { behind: readonly Prop[]; front: readonly Prop[] } {
  return {
    behind: [],
    front: [{ sprite: roomLit(makeAshtray(), 'left'), x: 140, base: 202 }],
  };
}

function drawProp(ctx: Ctx, p: Prop) {
  ctx.frame.sprite(p.sprite, p.x + deskShift(ctx, p.base) + ctx.frame.origin, p.base - p.sprite.h);
}

// ---------------------------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------------------------

const VFD_LIT = 0x7af8d8;
const VFD_DIM = 0x4ad8c0;
const VFD_OFF = 0x08161a;

/** Segments A-G of a 9x15 digit, each as a list of pixels, with the corners left apart. */
const SEGMENTS: readonly (readonly (readonly [number, number])[])[] = (() => {
  const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y] as const);
  const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as const);
  return [
    [...row(0, 1, 7), ...row(1, 2, 6)],
    [...col(8, 1, 6), ...col(7, 2, 5)],
    [...col(8, 8, 13), ...col(7, 9, 12)],
    [...row(14, 1, 7), ...row(13, 2, 6)],
    [...col(0, 8, 13), ...col(1, 9, 12)],
    [...col(0, 1, 6), ...col(1, 2, 5)],
    [...row(7, 1, 7), ...row(6, 2, 6)],
  ];
})();

/** Which of A-G light for each digit. */
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const lit = (digit: number, segment: number) => digit >= 0 && DIGITS[digit]!.includes('abcdefg'[segment]!);

const CLOCK_W = 60;
const CLOCK_H = 26;

/**
 * The clock's case as a box: front, top and the side the camera has swung round to see. `side` is
 * how far the back of the box sits from the front, in pixels; its sign picks the side.
 */
function drawClockBody(s: Sprite, side: number, depth: number) {
  s.px.fill(0);
  const left = 8;
  const top = 8;
  const right = left + CLOCK_W;
  const bottom = top + CLOCK_H;
  // Top face.
  s.poly(
    [
      [left, top],
      [right, top],
      [right + side, top - depth],
      [left + side, top - depth],
    ],
    0x2c2840,
  );
  s.line(left + side, top - depth, right + side, top - depth, 0x5a4a90);
  // Side face.
  if (side !== 0) {
    const edge = side > 0 ? right : left;
    s.poly(
      [
        [edge, top],
        [edge + side, top - depth],
        [edge + side, bottom - depth],
        [edge, bottom],
      ],
      0x1a1630,
    );
    s.line(edge + side, top - depth, edge + side, bottom - depth, side > 0 ? 0x2fa0d0 : 0xc22fb0);
  }
  // Front.
  s.rect(left, top, CLOCK_W, CLOCK_H, 0x16131f);
  s.rect(left, top, CLOCK_W, 1, 0x45455c);
  s.rect(left, top, 1, CLOCK_H, 0x2c2c3e);
  s.rect(right - 1, top, 1, CLOCK_H, 0x2c2c3e);
  // The smoked glass the tube sits behind.
  s.rect(left + 2, top + 3, CLOCK_W - 4, CLOCK_H - 6, 0x04080c);
  s.frame(left + 2, top + 3, CLOCK_W - 4, CLOCK_H - 6, 0x1a1a26);
}

function createClock() {
  const scratch = new Sprite(CLOCK_W + 16, CLOCK_H + 16);
  const X = 336;
  const BASE = 192;
  const faceTop = BASE - CLOCK_H;
  const glow = bakeGlow(X - 16, faceTop - 12, CLOCK_W + 32, CLOCK_H + 24, 5, 1, (set) => {
    for (let y = 5; y < CLOCK_H - 4; y++) for (let x = 4; x < CLOCK_W - 4; x++) set(X + x, faceTop + y, 0x30e0c0);
  });
  const spill = bakeGlow(X - 14, BASE - 4, CLOCK_W + 28, 30, 5, 1, (set) => {
    for (let y = BASE; y < BASE + 12; y++) for (let x = 4; x < CLOCK_W - 4; x++) set(X + x, y, 0x30e0c0);
  });

  return (ctx: Ctx) => {
    const { frame, clock } = ctx;
    const shift = deskShift(ctx, BASE);
    const left = X + shift + frame.origin;
    // The camera swinging round shows a side; looking down shows more of the top.
    const side = clamp(Math.round(ctx.px * 0.05), -2, 2);
    const depth = clamp(3 - Math.round(ctx.py * 0.08), 2, 4);
    drawClockBody(scratch, side, depth);
    frame.sprite(scratch, left - 8, faceTop - 8);
    // Light first, so it can't lift the unlit segments off the black.
    frame.glow(glow, shift, 0, 0.3);
    frame.glow(spill, shift, 0, 0.09);

    const top = faceTop - 5;
    const tens = clock.hours >= 10 || clock.pad ? Math.floor(clock.hours / 10) : -1;
    const digits = [tens, clock.hours % 10, Math.floor(clock.minutes / 10), clock.minutes % 10];
    const slots = [7, 18, 37, 48];
    digits.forEach((digit, d) => {
      SEGMENTS.forEach((pixels, segment) => {
        const on = lit(digit, segment);
        for (const [x, y] of pixels) {
          // The fine wire grid in front of a real tube breaks the glow into columns.
          const c = on ? ((x + slots[d]!) % 3 === 0 ? VFD_DIM : VFD_LIT) : VFD_OFF;
          frame.put(left + slots[d]! + x, top + 10 + y, c);
        }
      });
    });
    const dot = clock.colon ? VFD_LIT : VFD_OFF;
    for (const [dx, dy] of [
      [30, 14],
      [31, 14],
      [30, 15],
      [31, 15],
      [30, 19],
      [31, 19],
      [30, 20],
      [31, 20],
    ] as const) {
      frame.put(left + dx, top + dy, dot);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------------------------

function bakeWindow(): Layer {
  const L = new Layer();
  // Header wall, warmer toward the lamp.
  for (let y = -16; y < GLASS_TOP - 3; y++) {
    for (let x = -300; x < 760; x++) {
      const warm = clamp(1 - Math.abs(x - 70) / 190) * clamp((y + 6) / 16);
      L.set(x, y, mix(0x060510, 0x1e0f06, warm * 0.8));
    }
  }
  // The frame.
  L.rect(-300, GLASS_TOP - 3, 1060, 3, 0x0e0b18);
  L.rect(-300, GLASS_TOP - 1, 1060, 1, 0x1f184e);
  for (const mullion of [0, 471, 942]) {
    L.rect(mullion, GLASS_TOP - 2, 9, GLASS_BOTTOM - GLASS_TOP + 8, 0x08070f);
    L.rect(mullion, GLASS_TOP - 2, 1, GLASS_BOTTOM - GLASS_TOP + 8, 0x1a1440);
    L.rect(mullion + 8, GLASS_TOP - 2, 1, GLASS_BOTTOM - GLASS_TOP + 8, 0x3a2a88);
  }
  // Sill.
  L.rect(-300, GLASS_BOTTOM, 1060, SILL_BOTTOM - GLASS_BOTTOM, 0x0c0912);
  L.rect(-300, GLASS_BOTTOM, 1060, 1, 0x2a2060);
  // Runs on under the desk, so tilting the camera can't lift the sill off it and show the city.
  L.rect(-300, SILL_BOTTOM - 1, 1060, 8, DARK);
  return L;
}

/** Wood planks in perspective toward Dotoro's camera horizon. Mostly black, on purpose. */
function bakeDesk(): Layer {
  const L = new Layer();
  const span = DESK_FRONT - VANISH_Y;
  for (let y = DESK_TOP; y < DESK_FRONT; y++) {
    const k = (y - VANISH_Y) / span;
    for (let i = -272; i < 752; i++) {
      const wx = (i - VANISH_X) / k;
      const plank = Math.floor(wx / 58);
      const seam = Math.abs(wx - (plank + 0.5) * 58) > 28.2;
      const grain = noise(wx / 26, y / (2 + k * 3) + plank * 9, 1024, 1024, 5);
      const c = seam ? 0x030208 : mix(0x08060f, 0x100b16, grain);
      L.set(i, y, c);
    }
  }
  // Front edge, then the dark apron down to the bottom of the screen.
  for (let i = -272; i < 752; i++) {
    L.set(i, DESK_FRONT, 0x1c1420);
    L.set(i, DESK_FRONT + 1, 0x120d18);
    for (let y = DESK_FRONT + 2; y < VIEW_H + 16; y++) {
      L.set(i, y, mix(0x09070f, 0x030208, (y - DESK_FRONT) / 42));
    }
  }
  return L;
}

export function createRoom() {
  const win = bakeWindow();
  const desk = bakeDesk();
  const props = createProps();
  const lamp = roomLit(makeLamp(), 'right');
  const cat = createCat();
  const clockFace = createClock();

  const LAMP_X = 24;
  const LAMP_BASE = 204;
  const bulb: readonly [number, number] = [LAMP_X + Math.round(57 * LAMP_SCALE), LAMP_BASE - LAMP_H + Math.round(33 * LAMP_SCALE)];

  // The cone of lamplight, and the pool it makes.
  const cone = bakeGlow(-30, 120, 230, 112, 5, 1, (set) => {
    for (let y = bulb[1]; y < 216; y++) {
      const u = (y - bulb[1]) / (216 - bulb[1]);
      const half = 7 + u * 48;
      for (let x = bulb[0] - half; x < bulb[0] + half; x++) set(x, y, mix(PLASMA, PLASMA_DEEP, u));
    }
  });
  const pool = bakeGlow(-20, 170, 270, 70, 9, 1, (set) => {
    for (let y = DESK_TOP + 6; y < DESK_FRONT - 2; y++) {
      for (let x = 0; x < 210; x++) {
        const d = ((x - bulb[0] - 4) / 90) ** 2 + ((y - 206) / 22) ** 2;
        if (d < 1) set(x, y, mix(PLASMA, PLASMA_DEEP, d));
      }
    }
  });
  const halo = bakeGlow(bulb[0] - 22, bulb[1] - 22, 44, 44, 4, 3, (set) => {
    for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) set(bulb[0] + x, bulb[1] + y, PLASMA_HOT);
  });

  // Scuff strength per column: smooth noise, so streaks have width instead of being single pixels.
  const streaks = Float32Array.from({ length: 256 }, (_, x) => 0.35 + 0.65 * noise(x / 6, 0.5, 43, 1, 9));

  const EMBER: readonly [number, number] = [159, 195];
  const ember = bakeGlow(EMBER[0] - 15, EMBER[1] - 15, 30, 30, 3, 2.4, (set) => {
    set(EMBER[0], EMBER[1], 0xff6a30);
    set(EMBER[0] + 1, EMBER[1], 0xff6a30);
  });

  const lights = createStringLights();
  const ivy = makeIvy();

  const lampBuzz = (t: number) => 0.94 + hash(Math.floor(t * 180) % 180, 5) * 0.06;

  return {
    /** Window frame, then the desk, its reflection of the window, and the clutter. */
    draw(ctx: Ctx) {
      const { frame, t } = ctx;
      const buzz = lampBuzz(t);
      const sx = shiftX(ctx, DEPTH.glass);
      const sy = shiftY(ctx, DEPTH.glass);

      frame.takeSnapshot();
      frame.blit(win, sx, sy);
      frame.sprite(ivy, 449 + sx + frame.origin, GLASS_TOP - 3 + sy);
      lights(ctx);

      // The desk plane shears row by row, so it turns with the camera around Dotoro.
      const { w, u32, snapshot, origin } = frame;
      for (let y = DESK_TOP; y < VIEW_H; y++) {
        const shift = deskShift(ctx, Math.min(y, DESK_FRONT));
        const row = (y + 16) * 1024;
        for (let x = 0; x < w; x++) {
          const p = desk.px[row + ((x - origin - shift) & TILE_MASK)]!;
          if (p !== 0) u32[y * w + x] = p;
        }
      }

      // A dim, roughed-up mirror of the window: glossy lacquer, kept well under the device.
      const data = frame.data;
      for (let y = DESK_TOP; y < DESK_TOP + 40; y++) {
        const m = (y - DESK_TOP) / 40;
        const gain = (1 - m) ** 2.4 * 0.26;
        const srcY = Math.max(GLASS_TOP, GLASS_BOTTOM - 4 - Math.round((y - DESK_TOP) * 1.7));
        const shift = deskShift(ctx, y);
        for (let x = 0; x < w; x++) {
          // Scuffs in the lacquer run with the grain, so the mirror breaks into soft streaks.
          const scuff = streaks[(x - shift + 4096) & 255]!;
          const p = snapshot[srcY * w + x]!;
          const o = (y * w + x) * 4;
          data[o] = data[o]! + (p & 255) * gain * scuff;
          data[o + 1] = data[o + 1]! + ((p >> 8) & 255) * gain * scuff;
          data[o + 2] = data[o + 2]! + ((p >> 16) & 255) * gain * scuff;
        }
      }

      const lampShift = deskShift(ctx, LAMP_BASE);
      frame.glow(pool, lampShift, 0, 0.2 * buzz);

      clockFace(ctx);
      for (const p of props.behind) drawProp(ctx, p);

      // The cone hangs in the air under the lamp, so the lamp itself stays dark against it.
      frame.glow(cone, lampShift, 0, 0.11 * buzz);
      frame.glow(halo, lampShift, 0, 0.55 * buzz);
      frame.sprite(lamp, LAMP_X + lampShift + origin, LAMP_BASE - LAMP_H);
      drawPlasmaBulb(frame, bulb[0] + lampShift + origin, bulb[1], t);
      for (const p of props.front) drawProp(ctx, p);

      // The cigarette's ember breathes, and its smoke sways up past the window.
      const ashShift = deskShift(ctx, 202);
      const glowing = 0.6 + 0.4 * Math.sin(spin(t, 37)) * Math.sin(spin(t, 11) + 1);
      frame.glow(ember, ashShift, 0, 0.5 + glowing * 0.5);
      frame.put(EMBER[0] + ashShift + origin, EMBER[1], glowing > 0.7 ? 0xffb030 : 0xff6a30);
      frame.put(EMBER[0] + ashShift + origin, EMBER[1] + 1, 0xff3050);
      frame.put(EMBER[0] + 1 + ashShift + origin, EMBER[1], 0xff3050);
      frame.put(EMBER[0] + 1 + ashShift + origin, EMBER[1] + 1, 0x80102a);
      drawSmoke(frame, EMBER[0] + 1 + ashShift + origin, EMBER[1] - 1, t, 62, -1);


      cat(ctx);


      // Flies buzzing round the bulb: quick loops with a jittery wobble on top.
      for (let i = 0; i < 8; i++) {
        const orbit = spin(t, 50 + i * 7) + hash(i, 40) * 6.283;
        const wobble = spin(t, 420 + i * 37);
        const radius = 6 + hash(i, 41) * 14;
        const px = bulb[0] + 4 + Math.cos(orbit) * radius + Math.sin(wobble) * 2.5;
        const py = bulb[1] + 12 + Math.sin(orbit) * radius * 0.6 + Math.cos(wobble * 1.3) * 2;
        const near = 1 - Math.min(1, Math.hypot(px - bulb[0], py - bulb[1]) / 26);
        frame.add(Math.round(px + lampShift + origin), Math.round(py), 0xffb3ff, 0.35 + near * 0.6);
      }
    },
  };
}

const PLASMA = 0xc048ff;
const PLASMA_DEEP = 0x7030d0;
const PLASMA_HOT = 0xff60e0;

/** A plasma bulb: a white-hot core, with filaments crawling out to the glass and back. */
function drawPlasmaBulb(frame: Frame, x: number, y: number, t: number) {
  const step = Math.floor(t * 900) % 900;
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      if (i * i + j * j > 5) continue;
      frame.add(x + i, y + j, PLASMA, 0.45);
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = hash(k, step) * Math.PI * 2;
    const len = 2 + hash(k, step, 2) * 1.6;
    for (let r = 1; r <= len; r += 0.7) {
      frame.add(Math.round(x + Math.cos(a + r * 0.3) * r), Math.round(y + Math.sin(a + r * 0.3) * r), PLASMA_HOT, 0.8);
    }
  }
  frame.put(x, y, 0xffd8f0);
  frame.put(x + 1, y, 0xffffff);
  frame.put(x, y - 1, 0xffffff);
}

/** Warm bulbs on a wire along the top of the window: the room's answer to the neon. */
function createStringLights() {
  interface Bulb {
    x: number;
    y: number;
    phase: number;
    k: number;
  }
  const wire: [number, number][] = [];
  const bulbs: Bulb[] = [];
  const spans: readonly [number, number, number][] = [
    [10, 58, 8],
    [58, 106, 10],
    [106, 154, 8],
  ];
  for (const [x0, x1, droop] of spans) {
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0);
      wire.push([x, GLASS_TOP + 1 + Math.round(droop * 4 * u * (1 - u))]);
    }
    for (let i = 1; i < 4; i++) {
      const u = i / 4;
      const x = Math.round(x0 + (x1 - x0) * u);
      bulbs.push({
        x,
        y: GLASS_TOP + 2 + Math.round(droop * 4 * u * (1 - u)),
        phase: hash(x, 1),
        k: 1 + Math.floor(hash(x, 2) * 3),
      });
    }
  }
  const halo = bakeGlow(-9, -9, 19, 19, 3, 3.2, (set) => {
    set(0, 0, 0xffa030);
    set(1, 0, 0xffa030);
    set(0, 1, 0xffa030);
    set(1, 1, 0xffa030);
  });
  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.glass);
    const sy = shiftY(ctx, DEPTH.glass);
    const vx = sx + frame.origin;
    for (const [x, y] of wire) frame.put(x + vx, y + sy, 0x0a0812);
    for (const b of bulbs) {
      const twinkle = 0.72 + 0.28 * Math.sin((t * b.k + b.phase) * Math.PI * 2 * 5);
      frame.glow({ ...halo, x: halo.x + b.x, y: halo.y + b.y + 1 }, sx, sy, 0.5 * twinkle);
      frame.put(b.x + vx, b.y + sy, 0x2a1408);
      frame.put(b.x + vx, b.y + 1 + sy, twinkle > 0.8 ? C.cream : C.gold);
      frame.put(b.x + 1 + vx, b.y + 1 + sy, C.amber);
      frame.put(b.x + vx, b.y + 2 + sy, C.amber);
      frame.put(b.x + 1 + vx, b.y + 2 + sy, C.ember);
    }
  };
}

/** Ivy trailing from the window head, lit only at its edges by the city. */
function makeIvy(): Sprite {
  const s = new Sprite(26, 64);
  const dark = 0x06050c;
  const strands: readonly [number, number, number][] = [
    [6, 44, 2],
    [13, 62, 3],
    [20, 34, 5],
  ];
  for (const [x, length, seed] of strands) {
    for (let y = 0; y < length; y++) {
      const wx = Math.round(x + Math.sin(y * 0.16 + seed) * 2);
      s.set(wx, y, dark);
      if (y % 7 === seed % 7) {
        const side = hash(y, seed) > 0.5 ? 1 : -1;
        s.poly(
          [
            [wx, y],
            [wx + side * 5, y - 1],
            [wx + side * 6, y + 3],
            [wx + side * 2, y + 4],
          ],
          dark,
        );
      }
    }
  }
  const lit = new Sprite(s.w, s.h);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (s.get(x, y) === -1) continue;
      const edge = s.get(x + 1, y) === -1 ? 0x115688 : s.get(x - 1, y) === -1 ? 0x54145e : -1;
      lit.set(x, y, edge === -1 ? dark : edge);
    }
  }
  return lit;
}

