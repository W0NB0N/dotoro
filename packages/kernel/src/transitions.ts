import type { Framebuffer } from './framebuffer';

export type TransitionKind = 'cut' | 'dissolve' | 'wipe-left' | 'wipe-down';

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
  const { width, height } = target;
  const src = from.pixels;
  const dst = target.pixels;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let showNew: boolean;
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
