import { bayer, clamp, type Frame, hash } from './core';
import { cycle } from './fx';
import { GLASS_BOTTOM, GLASS_TOP } from './room';

const BEADS = 220;

/** Brighter and bluer: light gathered by water. */
function lifted(p: number, k: number): number {
  const r = Math.min(255, (p & 255) * k + 8) | 0;
  const g = Math.min(255, ((p >> 8) & 255) * k + 12) | 0;
  const b = Math.min(255, ((p >> 16) & 255) * k + 20) | 0;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/** Water on the pane. Each drop is a tiny inverted lens over the city behind the glass. */
export function drawGlass(frame: Frame, t: number, shiftY: number) {
  // The pane moves with its frame, or tilting the camera bares a strip of untreated glass.
  const top = GLASS_TOP + shiftY;
  const bottom = GLASS_BOTTOM + shiftY;
  const { w, snapshot, u32 } = frame;
  const span = bottom - top;
  frame.takeSnapshot();
  const sample = (x: number, y: number) =>
    snapshot[clamp(Math.round(y), top, bottom - 1) * w + clamp(Math.round(x), 0, w - 1)]!;

  // Beads clinging to the glass.
  for (let i = 0; i < BEADS; i++) {
    const x = Math.floor(hash(i, 1) * w);
    const y = top + Math.floor(hash(i, 2) ** 0.7 * span);
    const big = hash(i, 3) > 0.82;
    u32[y * w + x] = lifted(sample(x - 7, y - 9), 1.25);
    if (big) {
      u32[y * w + Math.min(w - 1, x + 1)] = lifted(sample(x + 8, y - 9), 1.35);
      if (y + 1 < bottom) u32[(y + 1) * w + x] = lifted(sample(x - 7, y + 10), 1.2);
    }
  }

  // Grime: specks on the pane, and dirt collected along the frame.
  for (let i = 0; i < 160; i++) {
    const x = Math.floor(hash(i, 51) * 1100) - 310 + frame.origin;
    const y = top + Math.floor(hash(i, 52) * span);
    if (x < 0 || x >= w) continue;
    const p = u32[y * w + x]!;
    u32[y * w + x] = (0xff000000 | (((((p >> 16) & 255) * 0.5) | 0) << 16) | ((((p >> 8) & 255) * 0.55) | 0) << 8 | (((p & 255) * 0.5) | 0)) >>> 0;
  }
  for (let y = top; y < bottom; y++) {
    const fromEdge = Math.min(y - top, bottom - 1 - y);
    if (fromEdge > 5) continue;
    for (let x = 0; x < w; x++) {
      const dirt = (1 - fromEdge / 6) * (0.25 + 0.35 * hash((x - frame.origin) >> 1, y));
      const p = u32[y * w + x]!;
      const r = ((p & 255) * (1 - dirt)) | 0;
      const g = (((p >> 8) & 255) * (1 - dirt * 0.8)) | 0;
      const b = (((p >> 16) & 255) * (1 - dirt)) | 0;
      u32[y * w + x] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }

  // Runnels: each one stops and slips, leaving a broken wet line.
  for (let i = 0; i < 34; i++) {
    const falls = 4 + (i % 4);
    const { n, u } = cycle(t, falls, hash(i, 11));
    const hesitate = 0.85 * Math.sin(u * Math.PI * 2 * 4 + hash(i, n, 16)) / (Math.PI * 2 * 4);
    const slip = u + hesitate - (0.85 * Math.sin(hash(i, n, 16))) / (Math.PI * 2 * 4);
    const y = top - 16 + slip * (span + 44);
    const x0 = hash(i, n, 12) * (w + 16) - 8;
    const seed = hash(i, n, 13) * 6.283;
    const pathX = (yy: number) => x0 + Math.sin(yy * 0.05 + seed) * 3 + Math.sin(yy * 0.17 + seed * 2) * 1.2;
    const radius = hash(i, 14) > 0.6 ? 2 : 1;
    const trail = 18 + Math.floor(hash(i, n, 15) * 54);

    for (let j = radius; j < trail; j++) {
      const yy = Math.round(y - j);
      if (yy < top || yy >= bottom) continue;
      if (hash(i, n, yy >> 2) < 0.1 + (j / trail) * 0.45) continue;
      const xx = Math.round(pathX(yy));
      if (xx < 0 || xx >= w) continue;
      u32[yy * w + xx] = lifted(sample(xx + 3, yy - 2), 1.28);
    }

    const cx = Math.round(pathX(y));
    const cy = Math.round(y);
    for (let dy = -radius; dy <= radius + 1; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + (dy - 0.5) ** 2 > (radius + 0.5) ** 2) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || px >= w || py < top || py >= bottom) continue;
        // Upside-down and wide: what a drop of water does to a city.
        u32[py * w + px] = lifted(sample(cx - dx * 9, cy - dy * 9 - 4), 1.3);
      }
    }
    if (cy - radius >= top && cy - radius < bottom && cx >= 0 && cx < w) {
      u32[(cy - radius) * w + cx] = lifted(sample(cx, cy), 2.2);
    }
  }

  // Breath-fog creeping up from the sill.
  const data = frame.data;
  for (let y = bottom - 46; y < bottom; y++) {
    const k = ((y - (bottom - 46)) / 46) ** 2 * 0.22;
    for (let x = 0; x < w; x++) {
      if (k + bayer(x, y) * 0.12 < 0.1) continue;
      const o = (y * w + x) * 4;
      data[o] = data[o]! + (74 - data[o]!) * k;
      data[o + 1] = data[o + 1]! + (58 - data[o + 1]!) * k;
      data[o + 2] = data[o + 2]! + (168 - data[o + 2]!) * k;
    }
  }
}
