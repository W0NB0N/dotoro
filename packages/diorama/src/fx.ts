import { type Frame, hash, mix, type RGB, spin } from './core';

/**
 * Loop-safe particle effects. Each particle's state is computed from t alone, with no simulation:
 * a whole number of cycles per loop, and a per-cycle hash that wraps with the cycle count, so
 * t = 1 lands exactly back on t = 0.
 */

/** Cycle index and progress for one recurring item that runs `cycles` times per loop. */
export function cycle(t: number, cycles: number, phase: number): { n: number; u: number } {
  const v = t * cycles + phase;
  const whole = Math.floor(v);
  return { n: ((whole % cycles) + cycles) % cycles, u: v - whole };
}

export interface RainSheet {
  count: number;
  /** Streak length in pixels. */
  length: number;
  /** Falls per loop, the slowest drop in the sheet. */
  falls: number;
  color: RGB;
  alpha: number;
  seed: number;
}

/** Diagonal rain. The wind leans with `slope`, in x pixels per y pixel. */
export function drawRain(frame: Frame, s: RainSheet, t: number, slope: number, sx: number, top = -20, bottom = 200) {
  const { w } = frame;
  const span = bottom - top + s.length;
  const across = w + 60 + Math.abs(slope) * span;
  for (let i = 0; i < s.count; i++) {
    const falls = s.falls + (i % 5);
    const { n, u } = cycle(t, falls, hash(i, s.seed));
    const head = top + u * span;
    const baseX = hash(i, n, s.seed + 1) * across - 30;
    const a = s.alpha * (0.55 + 0.45 * hash(i, s.seed + 2));
    const length = Math.round(s.length * (0.6 + 0.4 * hash(i, s.seed + 3)));
    for (let j = 0; j < length; j++) {
      const y = head - j;
      if (y < top || y >= bottom) continue;
      // Grid-snapped slope: this is what makes the line a clean pixel diagonal.
      const x = Math.round(baseX + slope * (y - top)) + sx;
      frame.tint(x, Math.round(y), s.color, a * (1 - j / length));
    }
  }
}

/** A soft blob of vapor. The final palette pass turns its falloff into pixel-art bands. */
function puff(frame: Frame, cx: number, cy: number, r: number, a: number, c: RGB) {
  const ri = Math.ceil(r);
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  for (let y = -ri; y <= ri; y++) {
    for (let x = -ri; x <= ri; x++) {
      const d = (x * x + y * y) / (r * r);
      if (d > 1) continue;
      frame.tint(x0 + x, y0 + y, c, a * (1 - d) * 0.34);
    }
  }
}



/**
 * Smoke off a cigarette: two thin ribbons that rise straight for a moment, then curl, widen and
 * break apart, drifting with the room's air.
 */
export function drawSmoke(frame: Frame, x: number, y: number, t: number, height: number, lean = 1) {
  const ribbons = [
    { cycles: 22, phase: 0, freq: 0.19, amp: 4, alpha: 0.5, drift: 0.16 },
    { cycles: 30, phase: 2.4, freq: 0.14, amp: 6, alpha: 0.32, drift: 0.24 },
  ];
  // The whole column sways slowly in the room's air.
  const sway = Math.sin(spin(t, 9)) * 0.6 + Math.sin(spin(t, 23) + 1) * 0.4;
  for (const r of ribbons) {
    const flow = spin(t, r.cycles) + r.phase;
    for (let i = 0; i < height; i++) {
      const u = i / height;
      // Laminar at first, then turbulent.
      const curl = u < 0.06 ? 0 : (u - 0.06) * 1.4;
      const cx = x + Math.sin(i * r.freq - flow) * r.amp * curl + i * r.drift * lean + sway * u * u * 7;
      const half = 0.4 + u * 2.2;
      const breakup = Math.max(0, Math.sin(i * 0.23 - flow * 1.7) * 0.5 + 0.6);
      // Faint and thin where it leaves the ember, fuller once it starts to curl.
      const a = r.alpha * Math.min(1, i / 10) * (1 - u) ** 1.3 * breakup;
      const c = mix(0xe8e0f0, 0x8f88b8, u);
      for (let px = Math.floor(cx - half); px <= Math.ceil(cx + half); px++) {
        const edge = 1 - Math.abs(px - cx) / (half + 1);
        if (edge > 0) frame.blend(px, y - i, c, a * edge);
      }
    }
  }
}

export interface SteamSource {
  x: number;
  y: number;
  count: number;
  /** Rises per loop. */
  rises: number;
  height: number;
  /** Radius at the top of the rise. */
  spread: number;
  sway: number;
  color: RGB;
  alpha: number;
  seed: number;
}

export function drawSteam(frame: Frame, s: SteamSource, t: number, sx: number, sy: number) {
  for (let i = 0; i < s.count; i++) {
    const { n, u } = cycle(t, s.rises, i / s.count);
    const jitter = hash(i, n, s.seed);
    const wave = Math.sin(u * 5 + jitter * 6.283) * s.sway * u;
    const x = s.x + wave + (jitter - 0.5) * 5 * u + u * u * 6;
    const y = s.y - u * s.height;
    const r = 1.5 + u * s.spread;
    const a = s.alpha * Math.min(1, u * 6) * (1 - u) ** 1.2;
    puff(frame, x + sx, y + sy, r, a, s.color);
  }
}

/**
 * A burst of sparks from (x, y). `age` is seconds since the burst. Ballistic, bouncing once on
 * `floor`, cooling white to amber to red.
 */
export function drawSparks(
  frame: Frame,
  x: number,
  y: number,
  floor: number,
  age: number,
  seed: number,
  count = 22,
) {
  const LIFE = 1.1;
  if (age < 0 || age > LIFE) return;
  for (let i = 0; i < count; i++) {
    const a = hash(i, seed) * Math.PI * 1.4 - Math.PI * 1.2;
    const speed = 30 + hash(i, seed + 1) * 80;
    const life = LIFE * (0.4 + 0.6 * hash(i, seed + 2));
    if (age > life) continue;
    const vx = Math.cos(a) * speed;
    const vy = Math.sin(a) * speed;
    let px = x + vx * age;
    let py = y + vy * age + 0.5 * 220 * age * age;
    if (py > floor) {
      // One lazy bounce.
      py = floor - Math.abs(py - floor) * 0.18;
      px = x + vx * age * 0.8;
    }
    const heat = 1 - age / life;
    const c = heat > 0.72 ? 0xffffff : heat > 0.45 ? 0xffe08a : heat > 0.2 ? 0xffb030 : 0xff6a30;
    frame.put(Math.round(px), Math.round(py), c);
    if (heat > 0.5) {
      // A short tail along the velocity.
      const tailY = vy + 220 * age;
      frame.put(Math.round(px - vx * 0.012), Math.round(py - tailY * 0.012), 0xffb030);
    }
  }
}

/** An electric arc jumping between two terminals. */
export function drawArc(frame: Frame, x0: number, y0: number, x1: number, y1: number, step: number, seed: number) {
  const n = 7;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const jit = i === n ? 0 : (hash(i, step, seed) - 0.5) * 6;
    const nx = Math.round(x0 + (x1 - x0) * u + jit);
    const ny = Math.round(y0 + (y1 - y0) * u + (hash(i, step, seed + 1) - 0.5) * 4);
    const dx = Math.abs(nx - px);
    const dy = Math.abs(ny - py);
    const len = Math.max(dx, dy, 1);
    for (let j = 0; j <= len; j++) {
      frame.put(Math.round(px + ((nx - px) * j) / len), Math.round(py + ((ny - py) * j) / len), 0xd4fcff);
    }
    px = nx;
    py = ny;
  }
}

