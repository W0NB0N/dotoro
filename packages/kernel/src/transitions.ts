import type { Framebuffer } from './framebuffer';
import { mix } from './color';

export type TransitionKind = 'cut' | 'dissolve' | 'wipe-left' | 'wipe-down' | 'glitch';

/** Stable pseudo-random threshold in [0, 1) for pixel `i`. */
function threshold(i: number): number {
  let h = (i + 1) * 0x9e3779b1;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * `target` holds the new screen. Pixels that should still show the old screen are copied
 * from `from`, based on `progress` in [0, 1].
 */
export function applyTransition(kind: TransitionKind, from: Framebuffer, target: Framebuffer, progress: number): void {
  if (kind === 'cut' || progress >= 1) return;
  if (kind === 'glitch') {
    glitchTransition(from, target, progress);
    return;
  }
  const { width, height } = target;
  const src = from.pixels;
  const dst = target.pixels;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let showNew = true;
      switch (kind) {
        case 'dissolve':
          showNew = threshold(i) < progress;
          break;
        case 'wipe-left':
          showNew = x >= Math.round((1 - progress) * width);
          break;
        case 'wipe-down':
          showNew = y < Math.round(progress * height);
          break;
      }
      if (!showNew) dst[i] = src[i]!;
    }
  }
}

/**
 * The new screen arrives in torn two-row bands: each band flips at its own moment, and while it is
 * flipping it slides sideways with a cyan or magenta cast.
 */
function glitchTransition(from: Framebuffer, target: Framebuffer, progress: number): void {
  const { width, height } = target;
  const next = target.pixels.slice();
  const old = from.pixels;
  const dst = target.pixels;
  for (let y = 0; y < height; y++) {
    const band = y >> 1;
    const flipAt = threshold(band * 31 + 7) * 0.85 + 0.075;
    const showNew = progress >= flipAt;
    const tearing = Math.abs(progress - flipAt) < 0.12;
    const shift = tearing ? ((band % 3) - 1) * (2 + (band & 1) * 2) : 0;
    const cast = band & 1 ? 0x00f0ff : 0xff0099;
    for (let x = 0; x < width; x++) {
      const sx = (((x - shift) % width) + width) % width;
      const c = (showNew ? next : old)[y * width + sx]!;
      dst[y * width + x] = shift !== 0 ? mix(c, cast, 0.35) : c;
    }
  }
}

const CRT_WHITE = 0xffffff;
const CRT_SQUASH_END = 0.55;
const CRT_LINE_END = 0.85;

/**
 * CRT shutdown drawn on the pixel grid: `from` squashes into a bright horizontal line, the line
 * shrinks to a dot, and the dot fades out. `t` runs from 0 (full picture) to 1 (black); running
 * it backwards gives the power-on.
 */
export function crtPower(from: Framebuffer, out: Framebuffer, t: number): void {
  const { width, height } = out;
  out.fill(0);
  if (t >= 1) return;
  const midX = width >> 1;
  const midY = height >> 1;

  if (t < CRT_SQUASH_END) {
    const p = t / CRT_SQUASH_END;
    const e = p * p;
    const half = Math.max(1, Math.round(midY * (1 - e)));
    const glow = e * e;
    for (let y = midY - half; y < midY + half; y++) {
      const srcY = Math.floor(((y - midY + half + 0.5) / (half * 2)) * height);
      for (let x = 0; x < width; x++) out.set(x, y, mix(from.get(x, srcY), CRT_WHITE, glow));
    }
    return;
  }

  if (t < CRT_LINE_END) {
    const p = (t - CRT_SQUASH_END) / (CRT_LINE_END - CRT_SQUASH_END);
    const half = Math.max(1, Math.round(midX * (1 - p * p)));
    for (let x = midX - half; x < midX + half; x++) out.set(x, midY, CRT_WHITE);
    return;
  }

  const fade = mix(CRT_WHITE, 0, (t - CRT_LINE_END) / (1 - CRT_LINE_END));
  out.set(midX - 1, midY, fade);
  out.set(midX, midY, fade);
}
