import { type Ctx, DEPTH, SEEN_BOTTOM, SEEN_TOP, shiftX, shiftY } from './city';
import { bakeGlow, clamp, fastSin, fract, type Frame, hash, Layer, LOOP_SECONDS, mix, type RGB, spin, Sprite, VIEW_H } from './core';
import { cycle, drawArc, drawSparks, drawSteam, type SteamSource } from './fx';
import { creeper, FOLIAGE_NEAR, stain, vine } from './growth';
import { C } from './palette';

export const FLOOR_TOP = 150;
export const FLOOR_BOTTOM = 166;
const RAIL_TOP = 126;

const STEEL = 0x161136;
const STEEL_LIT = 0x322674;
const DARK = 0x0a0818;

interface Fan {
  cx: number;
  cy: number;
  r: number;
  blades: number;
  /** Turns per loop. */
  turns: number;
  /** Color of the light behind the blades. */
  back: RGB;
  backEdge: RGB;
  dist: Float32Array;
  angle: Float32Array;
  grille: Sprite;
}

function fanHousing(L: Layer, x: number, y: number, w: number, h: number) {
  L.rect(x, y, w, h, 0x12102e);
  L.frame(x, y, w, h, 0x0a0818);
  L.rect(x + 1, y + 1, w - 2, 1, 0x3a3090);
  L.rect(x + 1, y + 1, 1, h - 2, 0x241c5e);
  // Rivets and louvres.
  for (const [rx, ry] of [
    [x + 3, y + 3],
    [x + w - 4, y + 3],
    [x + 3, y + h - 4],
    [x + w - 4, y + h - 4],
  ] as const) {
    L.set(rx, ry, 0x4a4ab0);
  }
  // Feet.
  L.rect(x + 3, y + h, 5, FLOOR_TOP - (y + h) + 2, DARK);
  L.rect(x + w - 8, y + h, 5, FLOOR_TOP - (y + h) + 2, DARK);
}

function createFan(L: Layer, cx: number, cy: number, r: number, blades: number, turns: number, back: RGB, backEdge: RGB): Fan {
  const size = r * 2 + 1;
  const dist = new Float32Array(size * size);
  const angle = new Float32Array(size * size);
  const grille = new Sprite(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i - r;
      const dy = j - r;
      const d = Math.hypot(dx, dy);
      dist[j * size + i] = d / r;
      angle[j * size + i] = Math.atan2(dy, dx);
      if (d > r - 1.2 && d <= r + 0.5) grille.set(i, j, 0x2a2470);
      const rings = r > 12 ? [0.42, 0.74] : [0.55];
      if (d < r && rings.some((f) => Math.abs(d - r * f) < 0.55)) grille.set(i, j, 0x0a0818);
      if (d < r && d > 3 && (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6)) grille.set(i, j, 0x0a0818);
    }
  }
  L.ellipse(cx, cy, r + 2, r + 2, 0x08061a);
  return { cx, cy, r, blades, turns, back, backEdge, dist, angle, grille };
}

function drawFan(frame: Frame, f: Fan, t: number, sx: number, sy: number) {
  const { r } = f;
  const size = r * 2 + 1;
  const left = f.cx - r + sx;
  const top = f.cy - r + sy;
  // A strobing step per blade pass: fast enough to read as spin, slow enough to stay crisp.
  const a = fract(t * f.turns) * Math.PI * 2;
  const n = f.blades;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const d = f.dist[j * size + i]!;
      if (d > 1) continue;
      let c: RGB;
      if (d < 0.2) {
        c = d < 0.1 ? 0x45455c : 0x322674;
      } else {
        const twist = f.angle[j * size + i]! + d * 1.1 - a;
        const blade = fract((twist * n) / (Math.PI * 2));
        if (blade < 0.5) c = blade < 0.09 ? 0x5a52c8 : mix(0x161136, 0x2b2168, d);
        else c = mix(f.back, f.backEdge, d);
      }
      frame.put(left + i, top + j, c);
    }
  }
  frame.sprite(f.grille, left, top);
}

function electricBox(L: Layer, x: number, y: number, w: number, h: number) {
  L.rect(x, y, w, h, 0x1c2238);
  L.frame(x, y, w, h, DARK);
  L.rect(x + 1, y + 1, w - 2, 1, 0x4a5a90);
  L.rect(x + 1, y + 1, 1, h - 2, 0x2c3660);
  // Door seam, latch.
  const midX = x + Math.floor(w / 2);
  L.rect(midX, y + 2, 1, h - 3, DARK);
  L.rect(midX - 2, y + Math.floor(h / 2) - 1, 2, 3, 0x6a6a84);
  // Hazard triangle.
  const tx = x + 3;
  const ty = y + 5;
  for (let i = 0; i < 6; i++) L.rect(tx + 5 - i, ty + i, i * 2 + 1, 1, 0xefc020);
  L.rect(tx + 5, ty + 2, 1, 2, DARK);
  L.set(tx + 5, ty + 5, DARK);
  // Vents.
  for (let i = 0; i < 4; i++) L.rect(midX + 2, y + h - 12 + i * 3, w - (midX - x) - 4, 1, 0x0e1020);
  // Conduit to the floor.
  L.rect(x + 3, y + h, 2, FLOOR_TOP - (y + h) + 2, 0x0e1020);
  L.rect(x + w - 6, y + h, 3, FLOOR_TOP - (y + h) + 2, 0x0e1020);
}

interface Pipe {
  x: number;
  y: number;
  w: number;
  h: number;
}

function pipe(L: Layer, p: Pipe) {
  L.rect(p.x, p.y, p.w, p.h, STEEL);
  if (p.w <= p.h) {
    L.rect(p.x, p.y, 1, p.h, STEEL_LIT);
    L.rect(p.x + p.w - 1, p.y, 1, p.h, DARK);
    for (let y = p.y + 8; y < p.y + p.h; y += 22) L.rect(p.x - 1, y, p.w + 2, 2, 0x2a2470);
  } else {
    L.rect(p.x, p.y, p.w, 1, STEEL_LIT);
    L.rect(p.x, p.y + p.h - 1, p.w, 1, DARK);
    for (let x = p.x + 6; x < p.x + p.w; x += 20) L.rect(x, p.y - 1, 2, p.h + 2, 0x2a2470);
  }
}

/** Where drips let go, and how often. */
interface Drip {
  x: number;
  y: number;
  floor: number;
  /** Drops per loop. */
  rate: number;
  phase: number;
}

const DRIPS: readonly Drip[] = [
  { x: 72, y: 96, floor: 158, rate: 40, phase: 0.1 },
  { x: 61, y: 62, floor: 156, rate: 27, phase: 0.4 },
  { x: 87, y: 96, floor: 160, rate: 33, phase: 0.7 },
  { x: 170, y: 146, floor: 158, rate: 44, phase: 0.2 },
  { x: 104, y: 148, floor: 156, rate: 23, phase: 0.55 },
  { x: 142, y: 104, floor: 160, rate: 31, phase: 0.85 },
  { x: 12, y: 30, floor: 162, rate: 37, phase: 0.37 },
];

const SPARK_BURSTS = [0.05, 0.23, 0.236, 0.47, 0.76, 0.768, 0.95];
const SPARK_B_BURSTS = [0.13, 0.57, 0.86];

/** Seconds since the most recent burst, for syncing other things (like the cat) to the sparks. */
export function secondsSinceSpark(t: number): number {
  let best = Infinity;
  for (const b of SPARK_BURSTS) best = Math.min(best, fract(t - b) * LOOP_SECONDS);
  return best;
}

export function createBalcony() {
  const L = new Layer();

  // Tall pipework that climbs out of frame.
  pipe(L, { x: 59, y: 16, w: 5, h: FLOOR_TOP - 16 + 2 });
  pipe(L, { x: 59, y: 92, w: 41, h: 4 });
  // A vent stack, breathing steam up past the HOTEL sign.
  L.rect(77, 132, 7, FLOOR_TOP - 132 + 2, STEEL);
  L.rect(77, 132, 1, FLOOR_TOP - 132 + 2, STEEL_LIT);
  L.rect(83, 132, 1, FLOOR_TOP - 132 + 2, DARK);
  L.rect(75, 130, 11, 3, 0x1f184e);
  L.rect(75, 130, 11, 1, 0x4a3ac0);
  // Valve wheel.
  L.rect(71, 89, 7, 2, 0xa01030);
  L.rect(74, 90, 1, 2, 0x45455c);

  // Fan units: the big condenser and a small exhaust beside it.
  fanHousing(L, 98, 104, 50, 44);
  const fanA = createFan(L, 123, 126, 19, 5, 72, 0x05040c, 0x120e2a);
  fanHousing(L, 150, 120, 24, 26);
  const fanB = createFan(L, 162, 133, 9, 4, 96, 0x05040c, 0x120e2a);

  // Electric boxes.
  electricBox(L, 14, 102, 32, 40);
  electricBox(L, 330, 126, 22, 20);

  // Dangling broken feed above the left box, the source of the sparks.
  L.line(46, 104, 59, 94, DARK);
  L.line(47, 104, 60, 94, 0x2a1408);
  L.rect(30, 98, 8, 4, 0x0e1020);

  // Railing.
  L.rect(-512, RAIL_TOP, 1024, 2, STEEL);
  L.rect(-512, RAIL_TOP, 1024, 1, 0x3a3090);
  L.rect(-512, 138, 1024, 1, STEEL);
  for (let x = 0; x < 1024; x += 44) L.rect(x, RAIL_TOP, 3, FLOOR_TOP - RAIL_TOP + 1, 0x0e0b22);
  for (let x = 0; x < 1024; x += 5) L.rect(x, RAIL_TOP + 2, 1, FLOOR_TOP - RAIL_TOP - 1, 0x0e0b22);

  // Overgrown: ivy hanging off the rail and the units, moss creeping up the pipe.
  for (let x = 6; x < 1024; x += 23 + Math.floor(hash(x, 3) * 30)) {
    vine(L, x, RAIL_TOP + 2, 8 + Math.floor(hash(x, 4) * 16), x, FOLIAGE_NEAR);
  }
  creeper(L, 56, FLOOR_TOP, 12, 60, 21, FOLIAGE_NEAR);
  vine(L, 100, 105, 16, 22, FOLIAGE_NEAR);
  vine(L, 140, 105, 10, 23, FOLIAGE_NEAR);
  creeper(L, 14, FLOOR_TOP, 30, 24, 24, FOLIAGE_NEAR);
  stain(L, 20, 142, 8, 0x5a2a0c, 0.5);
  stain(L, 40, 142, 6, 0x5a2a0c, 0.5);

  L.wetEdges((x) => (x < 160 || x > 700 ? 0xff66b8 : 0x6cf0f8), 0.72);

  // Overhead cables stay matte black, or wet-edge light turns them into stray neon lines.
  L.sag(-60, 18, 66, 20, 14, 0x08061a);
  L.sag(-60, 22, 66, 22, 22, 0x08061a);
  L.sag(456, 18, 560, 36, 12, 0x08061a);

  const flash = bakeGlow(-36, -36, 73, 73, 7, 6, (set) => {
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) set(x, y, 0x40a0ff);
  });

  const vent: SteamSource = {
    x: 80,
    y: 129,
    count: 14,
    rises: 14,
    height: 58,
    spread: 9,
    sway: 7,
    color: 0xd8c8f0,
    alpha: 0.8,
    seed: 8,
  };

  /** Mirror of everything above the floor, rippling, over wet concrete. */
  function drawFloor(ctx: Ctx, sy: number) {
    const { frame, t } = ctx;
    const { w, snapshot, u32 } = frame;
    const top = FLOOR_TOP + sy;
    frame.takeSnapshot();
    for (let y = 0; y < FLOOR_BOTTOM - FLOOR_TOP; y++) {
      const screenY = top + y;
      if (screenY < 0 || screenY >= VIEW_H) continue;
      const near = y / (FLOOR_BOTTOM - FLOOR_TOP);
      const srcY = clamp(Math.round(top - 2 - y * 2.2), 0, VIEW_H - 1);
      const dim = 0.5 - near * 0.2;
      const wave = 1 + near * 2.2;
      const rowPhase = y * 1.9 + spin(t, 30);
      for (let x = 0; x < w; x++) {
        // Rows slide as whole ribbons, so the mirror shimmers instead of breaking into static.
        const wob = Math.round(fastSin(rowPhase + x * 0.03) * wave);
        const p = snapshot[srcY * w + clamp(x + wob, 0, w - 1)]!;
        const r = ((p & 255) * dim + 5) | 0;
        const g = (((p >> 8) & 255) * dim + 4) | 0;
        const b = (((p >> 16) & 255) * dim + 12) | 0;
        u32[screenY * w + x] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
    // Rain rings.
    for (let i = 0; i < 26; i++) {
      const { n, u } = cycle(t, 40 + (i % 7), hash(i, 91));
      const cx = hash(i, n, 92) * (w + 20) - 10;
      const cy = top + 1 + hash(i, n, 93) * (FLOOR_BOTTOM - FLOOR_TOP - 2);
      const rx = 1 + u * 7;
      const ry = 0.5 + u * 1.8;
      const a = (1 - u) * 0.34;
      for (let s = 0; s < 14; s++) {
        const th = (s / 14) * Math.PI * 2;
        frame.add(Math.round(cx + Math.cos(th) * rx), Math.round(cy + Math.sin(th) * ry), 0xb8d4fc, a);
      }
    }
  }

  /** Crown-shaped splashes along the rail and on the unit tops. */
  function drawRailSplashes(ctx: Ctx, vx: number, sy: number) {
    const { frame, t } = ctx;
    for (let i = 0; i < 44; i++) {
      const { n, u } = cycle(t, 50 + (i % 9), hash(i, 71));
      if (u > 0.4) continue;
      const x = Math.floor(hash(i, n, 72) * (frame.w + 40)) - 20;
      const site = hash(i, n, 73);
      const y = (site < 0.7 ? RAIL_TOP : site < 0.85 ? 104 : 106) + sy;
      if (site >= 0.7 && (x - vx < 98 || x - vx > 480)) continue;
      const c = 0xd4e4ff;
      if (u < 0.2) frame.put(x, y - 1, c);
      else {
        frame.put(x - 1, y - 2, c);
        frame.put(x + 1, y - 2, c);
      }
    }
  }

  function drawDrips(ctx: Ctx, vx: number, sy: number) {
    const { frame, t } = ctx;
    for (const d of DRIPS) {
      const { u } = cycle(t, d.rate, d.phase);
      const x = d.x + vx;
      if (u < 0.55) {
        // Swelling at the lip.
        frame.put(x, d.y + sy, 0x9ff8ff);
        if (u > 0.35) frame.put(x, d.y + 1 + sy, 0xd4fcff);
      } else if (u < 0.92) {
        const fall = (u - 0.55) / 0.37;
        const y = d.y + (d.floor - d.y) * fall * fall + sy;
        frame.put(x, Math.round(y), 0xd4fcff);
        frame.put(x, Math.round(y) - 1, 0x6cf0f8);
        frame.put(x, Math.round(y) - 2, 0x1684b8);
      } else {
        // Splash.
        const s = (u - 0.92) / 0.08;
        const y = d.floor + sy;
        frame.put(x - 1 - Math.round(s * 2), y - 1, 0xd4fcff);
        frame.put(x + 1 + Math.round(s * 2), y - 1, 0xd4fcff);
        frame.put(x, y - 2, 0xd4fcff);
      }
    }
  }

  function drawBoxes(ctx: Ctx, vx: number, sx: number, sy: number) {
    const { frame, t } = ctx;
    // Status LEDs.
    for (let i = 0; i < 4; i++) {
      const on = fract(t * (17 + i * 6) + i * 0.23) < 0.5;
      frame.put(34 + i * 3 + vx, 106 + sy, on ? (i % 3 ? C.lime : C.red) : 0x08202c);
    }
    frame.put(344 + vx, 130 + sy, fract(t * 40) < 0.5 ? C.amber : 0x3e1e0a);
    frame.put(347 + vx, 130 + sy, fract(t * 23 + 0.4) < 0.5 ? C.lime : 0x08202c);

    const sites = [
      { bursts: SPARK_BURSTS, x: 46, y: 104, floor: 150, seed: 400 },
      { bursts: SPARK_B_BURSTS, x: 340, y: 126, floor: 150, seed: 500 },
    ];
    for (const site of sites) {
      site.bursts.forEach((b, i) => {
        const age = fract(t - b) * LOOP_SECONDS;
        if (age < 0.18) {
          frame.glow({ ...flash, x: flash.x + site.x, y: flash.y + site.y }, sx, sy, (1 - age / 0.18) * 0.7);
          drawArc(frame, site.x + vx - 7, site.y + sy - 1, site.x + vx + 5, site.y + sy - 9, Math.floor(age * 30), site.seed + i);
        }
        drawSparks(frame, site.x + vx, site.y + sy, site.floor + sy, age, site.seed + i * 7);
      });
    }
  }

  return {
    /** The structure and its effects; `behindFloor` runs before the floor is reflected. */
    draw(ctx: Ctx) {
      const { frame, t } = ctx;
      const sx = shiftX(ctx, DEPTH.balcony);
      const sy = shiftY(ctx, DEPTH.balcony);
      const vx = sx + frame.origin;

      frame.blit(L, sx, sy, SEEN_TOP, SEEN_BOTTOM);
      drawFan(frame, fanA, t, vx, sy);
      drawFan(frame, fanB, t, vx, sy);
      drawSteam(frame, vent, t, vx, sy);
      drawBoxes(ctx, vx, sx, sy);
      drawFloor(ctx, sy);
      // The floor's front edge and its catch-light.
      for (let x = 0; x < frame.w; x++) frame.put(x, FLOOR_TOP + sy, 0x261c60);
      drawRailSplashes(ctx, vx, sy);
      drawDrips(ctx, vx, sy);
    },
  };
}
