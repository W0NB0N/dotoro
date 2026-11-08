import {
  type Frame,
  type RGB,
  clamp,
  fbm,
  fract,
  hash,
  Layer,
  mix,
  PAD,
  rng,
  scale,
  Sprite,
  TILE_MASK,
  TILE_W,
  VIEW_H,
} from './core';
import { textMask } from './font';
import { C } from './palette';

/** What every animated element is handed for a frame. */
export interface Ctx {
  frame: Frame;
  /** Progress through the loop. t = 1 must look exactly like t = 0. */
  t: number;
  /** Parallax at infinite depth, in pixels. Layers take a fraction of it. */
  px: number;
  py: number;
  clock: DeskClock;
}

/** The band of rows the city can show through: below is the desk, above the window header. */
export const SEEN_TOP = 10;
export const SEEN_BOTTOM = 176;

export const shiftX = (ctx: Ctx, depth: number) => Math.round(ctx.px * depth);
export const shiftY = (ctx: Ctx, depth: number) => Math.round(ctx.py * depth);

/** How far back each layer sits: 0 stays locked to Dotoro's desk, 1 is the sky. */
export const DEPTH = {
  sky: 1,
  far1: 0.92,
  far2: 0.82,
  mid: 0.68,
  near: 0.5,
  air: 0.38,
  balcony: 0.2,
  glass: 0.1,
} as const;

interface Blink {
  x: number;
  y: number;
  c: RGB;
  /** On/off cycles per loop. */
  k: number;
  phase: number;
  duty: number;
}

interface LedArray {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'bars' | 'rain' | 'wave' | 'ticker' | 'blocks';
  seed: number;
  a: RGB;
  b: RGB;
}

interface Style {
  body: readonly RGB[];
  edge: RGB;
  lit: readonly RGB[];
  litChance: number;
  winW: number;
  winH: number;
  gapX: number;
  gapY: number;
  neon: readonly RGB[];
  neonChance: number;
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

/** Sky as a function, shared by the bake and by anything that needs to match it. */
function skyColor(x: number, y: number): RGB {
  const stops: readonly [number, RGB][] = [
    [-20, 0x08061a],
    [40, 0x120e36],
    [84, 0x221a66],
    [120, 0x38289a],
    [150, 0x5a35b8],
    [186, 0x8446c8],
    [230, 0xa850c0],
  ];
  let base = stops[0]![1];
  for (let i = 0; i + 1 < stops.length; i++) {
    const [y0, c0] = stops[i]!;
    const [y1, c1] = stops[i + 1]!;
    if (y >= y0 && y <= y1) base = mix(c0, c1, (y - y0) / (y1 - y0));
    else if (y > y1) base = c1;
  }
  const blob = (bx: number, by: number, rx: number, ry: number, c: RGB, k: number) => {
    let dx = Math.abs(x - bx);
    dx = Math.min(dx, TILE_W - dx);
    const d = (dx / rx) ** 2 + ((y - by) / ry) ** 2;
    base = mix(base, c, k * Math.exp(-d));
  };
  blob(240, 140, 230, 100, 0x20b8e4, 0.74);
  blob(420, 110, 130, 80, 0x22d8ec, 0.5);
  blob(40, 120, 130, 90, 0xff3fa8, 0.5);
  blob(760, 140, 220, 80, 0xff3fa8, 0.3);
  return base;
}

function bakeSky(): Layer {
  const sky = new Layer();
  for (let y = -PAD; y < VIEW_H + PAD; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const cloud = fbm((x / TILE_W) * 8, (y + 40) / 34, 8, 32, 11);
      const c = skyColor(x, y);
      const k = clamp((cloud - 0.42) * 2.4);
      // Storm clouds: dark above, lit from below by the city.
      const lit = clamp((y - 10) / 110);
      sky.set(x, y, mix(c, mix(0x0a0820, 0x7a3cc0, lit), k * 0.5));
    }
  }
  return sky;
}

function tower(
  L: Layer,
  r: () => number,
  s: Style,
  x: number,
  w: number,
  top: number,
  base: number,
  blinks: Blink[],
  arrays: LedArray[] | null,
) {
  const body = pick(r, s.body);
  const sideW = Math.max(2, Math.round(w * (0.16 + r() * 0.14)));
  const frontW = w - sideW;
  const side = scale(body, 0.6);
  L.rect(x, top, frontW, base - top, body);
  L.rect(x + frontW, top + 2, sideW, base - top - 2, side);
  L.rect(x, top, 1, base - top, mix(body, s.edge, 0.5));
  L.rect(x, top, frontW, 1, mix(body, s.edge, 0.7));

  const style = r();
  const cellW = s.winW + s.gapX;
  const cellH = s.winH + s.gapY;
  const left = x + 2;
  const right = x + frontW - 2;
  const floorBias: number[] = [];
  const lit = (row: number) => (floorBias[row] ??= r() < 0.3 ? 2.2 : r() < 0.4 ? 0.2 : 1);
  const hue = pick(r, s.lit);

  if (style < 0.34) {
    // Punched windows, lit in clusters by floor.
    let row = 0;
    for (let y = top + 3; y < base - 2; y += cellH, row++) {
      for (let wx = left; wx + s.winW <= right; wx += cellW) {
        const on = r() < s.litChance * lit(row);
        const c = on ? (r() < 0.72 ? hue : pick(r, s.lit)) : mix(body, s.edge, 0.12);
        L.rect(wx, y, s.winW, s.winH, c);
        if (on && r() < 0.06) blinks.push({ x: wx, y, c, k: 1 + Math.floor(r() * 5), phase: r(), duty: 0.5 + r() * 0.4 });
      }
    }
  } else if (style < 0.68) {
    // Ribbon floors: long glazed bands.
    let row = 0;
    for (let y = top + 3; y < base - 2; y += cellH + 1, row++) {
      const on = r() < s.litChance * 1.5 * lit(row);
      const c = on ? hue : mix(body, s.edge, 0.15);
      L.rect(left, y, right - left, 1, c);
      if (on && s.winH > 1) L.rect(left, y + 1, right - left, 1, scale(c, 0.6));
      for (let wx = left + 3; wx < right; wx += 7 + Math.floor(r() * 5)) L.set(wx, y, body);
    }
  } else {
    // Vertical fins catching the glow.
    for (let wx = left; wx < right; wx += s.gapX + 2) {
      const on = r() < s.litChance * 1.1;
      const from = top + 3 + Math.floor(r() * (base - top) * 0.3);
      L.rect(wx, from, 1, base - from - 2, on ? scale(hue, 0.75) : mix(body, s.edge, 0.18));
    }
  }

  // Side wall gets a sparse scatter so towers read as volumes.
  for (let y = top + 4; y < base - 2; y += cellH) {
    for (let wx = x + frontW + 1; wx < x + w - 1; wx += cellW) {
      if (r() < s.litChance * 0.35) L.rect(wx, y, Math.min(s.winW, 1), s.winH, scale(hue, 0.55));
    }
  }

  if (r() < s.neonChance) {
    const c = pick(r, s.neon);
    if (r() < 0.55) {
      // Vertical tube down a corner.
      const nx = r() < 0.5 ? x + 1 : x + frontW - 2;
      const ny = top + 2 + Math.floor(r() * 10);
      for (let y = ny; y < Math.min(base, ny + 30 + r() * 70); y++) L.neon(nx, y, c);
    } else {
      // Crown ring.
      const ny = top + 1 + Math.floor(r() * 5);
      for (let i = 1; i < frontW - 1; i++) L.neon(x + i, ny, c);
    }
  }

  // Digital arrays on the wider faces.
  if (arrays && frontW >= 16 && r() < 0.42) {
    const aw = Math.min(frontW - 4, 12 + Math.floor(r() * 18));
    const ah = 10 + Math.floor(r() * 26);
    const ax = x + 2 + Math.floor(r() * Math.max(1, frontW - aw - 4));
    const ay = top + 6 + Math.floor(r() * Math.max(1, Math.min(90, base - top - ah - 8)));
    L.rect(ax - 1, ay - 1, aw + 2, ah + 2, scale(body, 0.5));
    arrays.push({
      x: ax,
      y: ay,
      w: aw,
      h: ah,
      kind: pick(r, ['bars', 'rain', 'wave', 'blocks', 'ticker'] as const),
      seed: Math.floor(r() * 9999),
      a: pick(r, [C.cyan, C.pink, 0x6a9cf0, C.teal, C.amber]),
      b: pick(r, [C.pink, C.cyan, 0xffffff, C.magenta]),
    });
  }

  // Roof furniture.
  const crown = r();
  const mid = x + Math.floor(frontW / 2);
  if (crown < 0.3) {
    const h = 8 + Math.floor(r() * 22);
    L.rect(mid, top - h, 1, h, mix(body, s.edge, 0.3));
    blinks.push({ x: mid, y: top - h, c: C.red, k: 12 + Math.floor(r() * 18), phase: r(), duty: 0.35 });
  } else if (crown < 0.6) {
    const bw = Math.max(4, Math.floor(frontW * 0.45));
    L.rect(x + 3, top - 4, bw, 4, scale(body, 0.8));
    L.rect(x + 3, top - 4, bw, 1, mix(body, s.edge, 0.4));
  } else if (crown < 0.8) {
    for (let i = 0; i < 3; i++) {
      const inset = (i + 1) * 3;
      if (frontW - inset * 2 < 3) break;
      L.rect(x + inset, top - (i + 1) * 3, frontW - inset * 2, 3, i % 2 ? body : mix(body, s.edge, 0.15));
    }
  }
}

function skyline(
  L: Layer,
  seed: number,
  s: Style,
  minW: number,
  maxW: number,
  minTop: number,
  maxTop: number,
  base: number,
  blinks: Blink[],
  arrays: LedArray[] | null,
  gap = 0,
) {
  const r = rng(seed);
  let x = 0;
  while (x < TILE_W) {
    const w = Math.floor(minW + r() * (maxW - minW));
    // End exactly on the seam so the tile wraps cleanly.
    const width = x + w > TILE_W - minW ? TILE_W - x : w;
    const top = Math.floor(minTop + r() * (maxTop - minTop));
    tower(L, r, s, x, width, top, base, blinks, arrays);
    if (r() < 0.45 && width > 18) {
      // A stacked setback above the main mass.
      const inset = 3 + Math.floor(r() * (width * 0.22));
      tower(L, r, s, x + inset, width - inset * 2, top - 8 - Math.floor(r() * 26), top + 2, blinks, arrays);
    }
    // Gaps between towers are what let the farther layers read.
    x += r() < 0.55 ? width + Math.floor(r() * gap) : Math.max(4, width - Math.floor(r() * 5));
  }
}

function drawBlinks(frame: Frame, blinks: readonly Blink[], t: number, sx: number, sy: number) {
  const { origin } = frame;
  for (const b of blinks) {
    if (fract(t * b.k + b.phase) >= b.duty) continue;
    const x = ((b.x + sx + origin) % TILE_W + TILE_W) % TILE_W;
    if (x >= frame.w) continue;
    frame.put(x, b.y + sy, b.c);
  }
}

function drawLedArray(frame: Frame, a: LedArray, t: number, sx: number, sy: number) {
  let x0 = ((a.x + sx + frame.origin) % TILE_W + TILE_W) % TILE_W;
  if (x0 > TILE_W - a.w) x0 -= TILE_W;
  if (x0 >= frame.w) return;
  const y0 = a.y + sy;
  const { seed } = a;
  const mask = a.kind === 'ticker' ? tickerText(seed) : null;
  const scroll = mask ? Math.floor(t * mask.w * 12) : 0;
  for (let j = 0; j < a.h; j++) {
    for (let i = 0; i < a.w; i++) {
      let c = -1;
      switch (a.kind) {
        case 'bars': {
          const col = Math.floor(i / 2);
          const step = Math.floor(t * 180);
          const level = 0.2 + 0.8 * hash(col, step % 180, seed);
          if (i % 2 === 0 && j >= a.h * (1 - level)) c = j < a.h * 0.45 ? a.b : a.a;
          break;
        }
        case 'rain': {
          const col = i >> 1;
          const speed = 4 + Math.floor(hash(col, seed) * 8);
          const head = fract(t * speed * 6 + hash(col, seed, 1)) * (a.h + 10);
          const d = head - j;
          if (i % 2 === 0 && d >= 0 && d < 9) c = d < 1 ? 0xffffff : mix(a.a, 0x0a0818, d / 9);
          break;
        }
        case 'wave': {
          const v = Math.sin((i / a.w) * 6.283 * 2 + t * 6.283 * 40) * 0.5 + 0.5;
          if (Math.abs(j / a.h - v) < 0.14) c = a.a;
          else if ((i + j) % 4 === 0) c = scale(a.b, 0.28);
          break;
        }
        case 'blocks': {
          const bx = Math.floor(i / 4);
          const by = Math.floor(j / 3);
          const step = Math.floor(t * 60 + hash(bx, by, seed) * 60) % 60;
          if (hash(bx, by, step + seed) > 0.42 && i % 4 < 3 && j % 3 < 2) {
            c = hash(bx, by, seed + 7) > 0.5 ? a.a : a.b;
          }
          break;
        }
        case 'ticker': {
          const line = j - Math.floor((a.h - 7) / 2);
          if (mask && line >= 0 && line < 7 && mask.on((i + scroll) % mask.w, line)) c = a.a;
          else if (j % 2 === 0) c = scale(a.a, 0.1);
          break;
        }
      }
      if (c !== -1) frame.put(x0 + i, y0 + j, c);
    }
  }
}

const TICKERS = ['NET OK', 'RAIN 98', 'SYNC', 'NO SIGNAL', 'OPEN 24H', 'LOW TIDE', 'VOLT'];
const tickerMasks = TICKERS.map((s) => textMask(`${s}  `));
const tickerText = (seed: number) => tickerMasks[seed % tickerMasks.length]!;

interface LaneLight {
  y: number;
  k: number;
  phase: number;
  head: RGB;
  tail: RGB;
  trail: number;
}

function laneRows(y: number, count: number, k: number, r: () => number, head: RGB, tail: RGB, trail: number): LaneLight[] {
  return Array.from({ length: count }, (_, i) => ({
    y: y + Math.floor(r() * 3),
    k,
    phase: (i + r() * 0.8) / count,
    head,
    tail,
    trail,
  }));
}

/** Rides a banked curve so the traffic reads as a route, not a ruled line. */
const laneCurve = (x: number, seed: number) =>
  Math.round(Math.sin((x / TILE_W) * 6.283 * 2 + seed) * 5 + Math.sin((x / TILE_W) * 6.283 * 5 + seed * 2) * 2);

function drawLane(frame: Frame, lights: readonly LaneLight[], t: number, sx: number, sy: number, seed: number) {
  const { w, origin } = frame;
  for (const l of lights) {
    const pos = fract(t * l.k + l.phase) * TILE_W;
    const x = ((Math.floor(pos) + sx + origin) % TILE_W + TILE_W) & TILE_MASK;
    if (x >= w + 12) continue;
    const y = l.y + laneCurve(pos, seed) + sy;
    const dir = l.k > 0 ? -1 : 1;
    frame.put(x, y, l.head);
    for (let i = 1; i <= l.trail; i++) frame.tint(x + dir * i, y, l.tail, 0.75 - (i / (l.trail + 1)) * 0.7);
  }
}

/** Faint dashed route markers with a pulse running along them. */
function drawFlightPath(frame: Frame, y: number, seed: number, t: number, sx: number, sy: number, c: RGB, k: number) {
  const { w, origin } = frame;
  for (let vx = 0; vx < w; vx++) {
    const wx = ((vx - origin - sx) % TILE_W + TILE_W) & TILE_MASK;
    if (wx % 7 > 2) continue;
    const pulse = fract(wx / TILE_W * 3 - t * k);
    const lit = pulse < 0.06 ? 1 : 0.16;
    frame.add(vx, y + laneCurve(wx, seed) + sy, c, lit * 0.55);
  }
}

function drawSearchlight(frame: Frame, baseX: number, baseY: number, angle: number, c: RGB, k: number) {
  const dirX = Math.sin(angle);
  for (let y = baseY; y >= 0; y--) {
    const d = baseY - y;
    const cx = baseX + (dirX / Math.max(0.2, Math.cos(angle))) * d;
    const half = 1 + d * 0.055;
    const fade = k * (1 - d / (baseY + 20));
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const edge = 1 - Math.abs(x - cx) / (half + 1);
      frame.add(x, y, c, fade * edge);
    }
  }
}

/** Height of the elevated line: just under the billboard, over the roofs on the right. */
const RAIL_Y = 74;

/** The elevated train, sliding along its rail with a warm string of windows. */
function drawTrain(frame: Frame, t: number, phase: number, sx: number, sy: number) {
  const CARS = 5;
  const CAR_W = 34;
  const head = fract(t * 3 + phase) * TILE_W;
  let x0 = Math.floor(head) + sx + frame.origin;
  x0 = ((x0 % TILE_W) + TILE_W) % TILE_W;
  if (x0 > TILE_W - CARS * CAR_W - 8) x0 -= TILE_W;
  if (x0 >= frame.w) return;
  const y = RAIL_Y - 8 + sy;
  for (let c = 0; c < CARS; c++) {
    const left = x0 + c * CAR_W;
    for (let i = 0; i < CAR_W - 2; i++) {
      for (let j = 0; j < 8; j++) {
        const glazing = j >= 2 && j < 5 && i % 5 < 3 && i > 1 && i < CAR_W - 4;
        const shell = j === 0 ? 0x4a7ee0 : j === 7 ? 0x08061a : 0x1c2a6a;
        frame.put(left + i, y + j, glazing ? C.gold : shell);
      }
    }
  }
  frame.put(x0 + CARS * CAR_W - 2, y + 5, 0xffffff);
  for (let i = 1; i < 26; i++) frame.add(x0 + CARS * CAR_W - 2 + i, y + 5, 0xdfeaff, 0.34 * (1 - i / 26));
}

/** Local time for the desk clock. Passed in, so a frame stays a pure function of its inputs. */
export interface DeskClock {
  hours: number;
  minutes: number;
  colon: boolean;
  /** Show the leading zero on the hours. */
  pad: boolean;
}

export interface City {
  near: Layer;
  nearBlinks: Blink[];
  nearArrays: LedArray[];
  /** Sky, far towers and the far traffic. */
  drawFar(ctx: Ctx): void;
  /** Mid towers and their traffic. */
  drawMid(ctx: Ctx): void;
  /** Near towers, without their hero signs. */
  drawNear(ctx: Ctx): void;
  /** Call after hero signs have been painted into `near`. */
  finishNear(): void;
}

export function createCity(): City {
  const sky = bakeSky();
  const hazeAt = (x: number, y: number): RGB => {
    const c = sky.get(x, y);
    return c === -1 ? 0x38289a : c;
  };
  const far1 = new Layer();
  const far2 = new Layer();
  const mid = new Layer();
  const near = new Layer();
  const far1Blinks: Blink[] = [];
  const far2Blinks: Blink[] = [];
  const midBlinks: Blink[] = [];
  const nearBlinks: Blink[] = [];
  const far2Arrays: LedArray[] = [];
  const midArrays: LedArray[] = [];
  const nearArrays: LedArray[] = [];

  skyline(
    far1,
    101,
    {
      body: [0x2a2a9a, 0x30289a, 0x282ea4],
      edge: 0x6c74e8,
      lit: [0x8a9cf4, 0xb8a4f4, 0x7ad0f4],
      litChance: 0.2,
      winW: 1,
      winH: 1,
      gapX: 1,
      gapY: 2,
      neon: [C.pink, C.cyan],
      neonChance: 0.1,
    },
    16,
    40,
    46,
    118,
    230,
    far1Blinks,
    null,
  );
  far1.fog(
    hazeAt,
    (y) => 0.46 + clamp((y - 40) / 130) * 0.4,
  );

  skyline(
    far2,
    202,
    {
      body: [0x1a2078, 0x201a78, 0x162a80],
      edge: 0x4e6ae0,
      lit: [0x6cf0f8, 0xd8c4ff, 0xff8cca, 0x8fbaf8],
      litChance: 0.24,
      winW: 1,
      winH: 2,
      gapX: 1,
      gapY: 1,
      neon: [C.pink, C.cyan, 0x6a9cf0],
      neonChance: 0.3,
    },
    20,
    50,
    26,
    92,
    230,
    far2Blinks,
    far2Arrays,
    20,
  );
  far2.bakeHalo(3, 0.5);
  far2.fog(
    hazeAt,
    (y) => 0.2 + clamp((y - 50) / 130) * 0.55,
  );

  skyline(
    mid,
    303,
    {
      body: [0x13125a, 0x17105a, 0x0f1a62],
      edge: 0x3a5ad0,
      lit: [C.amber, 0x6cf0f8, 0xff8cca, 0xb8d4fc, C.gold],
      litChance: 0.17,
      winW: 2,
      winH: 2,
      gapX: 1,
      gapY: 2,
      neon: [C.pink, C.cyan, C.amber, C.magenta],
      neonChance: 0.5,
    },
    28,
    62,
    6,
    74,
    240,
    midBlinks,
    midArrays,
    34,
  );
  // An elevated line threading the mid towers: the strongest depth cue in the skyline.
  mid.rect(0, RAIL_Y, 1024, 3, 0x0f1450);
  mid.rect(0, RAIL_Y, 1024, 1, 0x3a5ad0);
  for (let x = 0; x < 1024; x += 2) if (x % 16 < 10) mid.neon(x, RAIL_Y + 4, 0x2fe0f0);
  for (let x = 40; x < 1024; x += 170) {
    mid.rect(x, RAIL_Y + 3, 6, 180, 0x0f1450);
    mid.rect(x, RAIL_Y + 3, 1, 180, 0x3a5ad0);
    mid.line(x, RAIL_Y + 4, x - 20, RAIL_Y + 3, 0x0f1450);
    mid.line(x + 6, RAIL_Y + 4, x + 26, RAIL_Y + 3, 0x0f1450);
  }
  mid.bakeHalo(4, 0.75);
  mid.fog(
    hazeAt,
    (y) => 0.08 + clamp((y - 70) / 120) * 0.68,
  );

  // Far-right and off-screen near towers. The two flanks of the view are hand-placed in signs.ts.
  const r = rng(404);
  const nearStyle: Style = {
    body: [0x0c0a2c, 0x0e0c34, 0x0a0e38],
    edge: 0x2c3aa8,
    lit: [C.amber, 0x6cf0f8, 0xff8cca, C.gold],
    litChance: 0.2,
    winW: 3,
    winH: 3,
    gapX: 2,
    gapY: 3,
    neon: [C.pink, C.cyan, C.amber],
    neonChance: 0.8,
  };
  for (const [x, w, top] of [
    [520, 60, -20],
    [596, 86, 34],
    [716, 74, -12],
    [824, 120, 52],
  ] as const) {
    tower(near, r, nearStyle, x, w, top, 240, nearBlinks, nearArrays);
  }
  tower(near, r, nearStyle, 950, 60, -14, 240, nearBlinks, nearArrays);

  // Drifting smog: a tiling noise strip, added over the far city.
  const CLOUD_W = 256;
  const CLOUD_H = 96;
  const cloud = new Uint8Array(CLOUD_W * CLOUD_H);
  for (let y = 0; y < CLOUD_H; y++) {
    const edge = Math.sin((y / CLOUD_H) * Math.PI);
    for (let x = 0; x < CLOUD_W; x++) {
      const n = fbm((x / CLOUD_W) * 4, y / 24, 4, 32, 77);
      cloud[y * CLOUD_W + x] = clamp((n - 0.46) * 3.4) * edge * 255;
    }
  }

  const laneRand = rng(505);
  const laneFarA = laneRows(70, 26, 1, laneRand, 0xfff6d0, 0xff6a70, 2);
  const laneFarB = laneRows(92, 22, -1, laneRand, 0xd4fcff, 0x2fe0f0, 2);
  const laneMidA = laneRows(58, 18, 2, laneRand, 0xffffff, 0xff3050, 4);
  const laneMidB = laneRows(106, 14, -2, laneRand, 0xffe08a, 0xffb030, 3);

  const hover = hoverCraft();

  return {
    near,
    nearBlinks,
    nearArrays,

    drawFar(ctx) {
      const { frame, t } = ctx;
      frame.blit(sky, shiftX(ctx, DEPTH.sky), shiftY(ctx, DEPTH.sky), SEEN_TOP, SEEN_BOTTOM);

      // Searchlights rake the cloud base.
      const swing = Math.sin(t * Math.PI * 2 * 3);
      const swing2 = Math.sin(t * Math.PI * 2 * 2 + 1.7);
      const skyS = shiftX(ctx, DEPTH.far1) + frame.origin;
      drawSearchlight(frame, 110 + skyS, 150, -0.26 + swing * 0.22, 0x6a7cf0, 0.1);
      drawSearchlight(frame, 372 + skyS, 150, 0.3 + swing2 * 0.2, 0x7ad0f4, 0.1);

      const cloudShift = Math.floor(t * CLOUD_W * 2);
      const { data, w: frameW } = frame;
      for (let y = 0; y < CLOUD_H; y++) {
        const row = (y + 18) * frameW;
        for (let x = 0; x < frameW; x++) {
          const v = cloud[y * CLOUD_W + ((x + cloudShift) & (CLOUD_W - 1))]!;
          if (v <= 8) continue;
          const o = (row + x) * 4;
          data[o] = data[o]! + (v * 27) / 256;
          data[o + 1] = data[o + 1]! + (v * 19) / 256;
          data[o + 2] = data[o + 2]! + (v * 44) / 256;
        }
      }

      const f1x = shiftX(ctx, DEPTH.far1);
      const f1y = shiftY(ctx, DEPTH.far1);
      frame.blit(far1, f1x, f1y, SEEN_TOP, SEEN_BOTTOM);
      drawBlinks(frame, far1Blinks, t, f1x, f1y);

      const f2x = shiftX(ctx, DEPTH.far2);
      const f2y = shiftY(ctx, DEPTH.far2);
      drawFlightPath(frame, 66, 1.3, t, f2x, f2y, 0x6cf0f8, 4);
      drawLane(frame, laneFarA, t, f2x, f2y, 1.3);
      frame.blit(far2, f2x, f2y, SEEN_TOP, SEEN_BOTTOM);
      drawBlinks(frame, far2Blinks, t, f2x, f2y);
      for (const a of far2Arrays) drawLedArray(frame, a, t, f2x, f2y);
      drawFlightPath(frame, 90, 2.1, t, f2x, f2y, 0xff8cca, -3);
      drawLane(frame, laneFarB, t, f2x, f2y, 2.1);
    },

    drawMid(ctx) {
      const { frame, t } = ctx;
      const sx = shiftX(ctx, DEPTH.mid);
      const sy = shiftY(ctx, DEPTH.mid);
      frame.blit(mid, sx, sy, SEEN_TOP, SEEN_BOTTOM);
      drawBlinks(frame, midBlinks, t, sx, sy);
      for (const a of midArrays) drawLedArray(frame, a, t, sx, sy);
      drawFlightPath(frame, 54, 3.7, t, sx, sy, 0x6cf0f8, 5);
      drawLane(frame, laneMidA, t, sx, sy, 3.7);
      drawLane(frame, laneMidB, t, sx, sy, 4.4);
      drawTrain(frame, t, 0.2, sx, sy);
      drawTrain(frame, t, 0.7, sx, sy);
      hover.mid(ctx);
    },

    drawNear(ctx) {
      const { frame, t } = ctx;
      const sx = shiftX(ctx, DEPTH.near);
      const sy = shiftY(ctx, DEPTH.near);
      frame.blit(near, sx, sy, SEEN_TOP, SEEN_BOTTOM);
      drawBlinks(frame, nearBlinks, t, sx, sy);
      for (const a of nearArrays) drawLedArray(frame, a, t, sx, sy);
      hover.near(ctx);
    },

    finishNear() {
      near.bakeHalo(5, 0.9);
      near.fog(
        hazeAt,
        (y) => clamp((y - 80) / 110) * 0.56,
      );
      near.wetEdges((x) => (x < 240 || x > 700 ? 0xff66b8 : 0x6cf0f8), 0.5);
    },
  };
}

const CAR_ART = [
  '.........kkkkkkkk...........',
  '......kkwwwwkwwwwkk.........',
  '...kkkbbbbbbbbbbbbbkkkkk....',
  'rkbbbbbbbbbbbbbbbbbbbbbbkkk.',
  'rkbbbhhhhhhhhhhhhhbbbbbbbbkW',
  '.kkbbbbbbbbbbbbbbbbbbbbbbkk.',
  '...kkkkkkkkkkkkkkkkkkkkkk...',
  '.....gggg..........gggg.....',
];

const BUS_ART = [
  '.......kkkkkkkkkkkkkkkkkkkkkkkkkkkk.........',
  '.....kkbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkkk.....',
  '...kkbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbkk...',
  '..kbbwwwbwwwbwwwbwwwbwwwbwwwbwwwbwwwbbbbbk..',
  'rkbbbwwwbwwwbwwwbwwwbwwwbwwwbwwwbwwwbbbbbbk.',
  'rkbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbW',
  'rkbhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhbbW',
  '.kbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbk.',
  '..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
  '....ggggg......ggggg.......ggggg......gggg..',
];

const DRONE_ART = ['.k.....k.', 'kkk.k.kkk', '..kkrkk..', '...kWk...'];

interface Craft {
  sprite: Sprite;
  flip: Sprite;
  y: number;
  /** Laps of the world per loop. Sign is direction. */
  k: number;
  phase: number;
  beam: number;
  glow: RGB;
}

function craftColors(body: RGB, glass: RGB, stripe: RGB, under: RGB) {
  return { k: 0x0a0818, b: body, w: glass, h: stripe, g: under, r: 0xff3050, W: 0xffffff };
}

/** Flying traffic, split so mid traffic passes behind the near towers and near traffic in front. */
function hoverCraft() {
  const make = (art: readonly string[], colors: Record<string, RGB>) => {
    const sprite = Sprite.fromArt(art, colors);
    return { sprite, flip: sprite.flipped() };
  };
  const sedan = make(CAR_ART, craftColors(0x1c1a4e, 0x6cf0f8, 0xff3fa8, 0xff66b8));
  const sedanAlt = make(CAR_ART, craftColors(0x2a1c50, 0xffc85a, 0x2fe0f0, 0x2fe0f0));
  const bus = make(BUS_ART, craftColors(0x201c5a, 0xffc85a, 0x2fe0f0, 0x6cf0f8));
  const drone = make(DRONE_ART, craftColors(0x0a0818, 0, 0, 0));

  const midCraft: Craft[] = [
    { ...sedan, y: 84, k: 3, phase: 0.1, beam: 22, glow: C.pink },
    { ...sedanAlt, y: 90, k: -4, phase: 0.42, beam: 22, glow: C.cyan },
    { ...drone, y: 64, k: 4, phase: 0.77, beam: 0, glow: C.red },
    { ...sedan, y: 96, k: 2, phase: 0.6, beam: 22, glow: C.pink },
    { ...sedanAlt, y: 82, k: -3, phase: 0.9, beam: 22, glow: C.cyan },
  ];
  const nearCraft: Craft[] = [
    { ...bus, y: 80, k: -2, phase: 0.86, beam: 44, glow: C.cyan },
    { ...sedanAlt, y: 88, k: 3, phase: 0.3, beam: 36, glow: C.cyan },
    { ...sedan, y: 84, k: -3, phase: 0.05, beam: 34, glow: C.pink },
  ];

  const draw = (ctx: Ctx, list: readonly Craft[], depth: number) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, depth);
    const sy = shiftY(ctx, depth);
    for (const c of list) {
      const dir = c.k > 0 ? 1 : -1;
      // Cover a lap of the tile plus a margin, so craft never pop in at the wrap.
      const pos = fract(t * Math.abs(c.k) + c.phase) * TILE_W;
      const wx = dir > 0 ? pos : TILE_W - pos;
      let x = Math.floor(wx) + sx + frame.origin - 80;
      if (x > frame.w + 80) x -= TILE_W;
      if (x < -c.sprite.w - 80 || x > frame.w + 80) continue;
      const bob = Math.round(Math.sin(t * 6.283 * 9 + c.phase * 40) * 1);
      const y = c.y + bob + sy;
      const s = dir > 0 ? c.sprite : c.flip;
      // Underglow, thruster wash.
      for (let i = 2; i < s.w - 2; i++) {
        for (let j = 0; j < 4; j++) frame.add(x + i, y + s.h + j, c.glow, 0.34 - j * 0.09);
      }
      frame.sprite(s, x, y);
      if (c.beam > 0) {
        // Headlight cone cutting forward through the rain.
        const noseX = dir > 0 ? x + s.w : x - 1;
        const noseY = y + Math.floor(s.h * 0.55);
        for (let i = 0; i < c.beam; i++) {
          const half = 1 + i * 0.16;
          const fade = 0.3 * (1 - i / c.beam);
          for (let j = Math.floor(-half); j <= Math.ceil(half); j++) {
            frame.add(noseX + dir * i, noseY + j + Math.floor(i * 0.1), 0xdfeaff, fade);
          }
        }
        // Tail streak.
        const tailX = dir > 0 ? x - 1 : x + s.w;
        for (let i = 0; i < 9; i++) frame.add(tailX - dir * i, noseY - 1, C.red, 0.5 - i * 0.05);
      }
    }
  };

  return {
    mid: (ctx: Ctx) => draw(ctx, midCraft, DEPTH.mid),
    near: (ctx: Ctx) => draw(ctx, nearCraft, DEPTH.near),
  };
}

