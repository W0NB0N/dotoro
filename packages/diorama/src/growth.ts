import { type Canvas, hash, mix, type RGB, rng } from './core';

/** Leaf colors for a layer: shadow, body, and the edge that catches light. */
export interface Foliage {
  stem: RGB;
  dark: RGB;
  leaf: RGB;
  lit: RGB;
}

/** Plants out in the rain, sunk in shadow like everything else at their depth. */
export const FOLIAGE_FAR: Foliage = { stem: 0x0a1a14, dark: 0x0a1a14, leaf: 0x0f2a20, lit: 0x14402c };
export const FOLIAGE_NEAR: Foliage = { stem: 0x0a1a14, dark: 0x0f2a20, leaf: 0x14402c, lit: 0x1e5a3a };

function leafCluster(c: Canvas, x: number, y: number, side: number, f: Foliage, r: () => number) {
  const size = r() < 0.4 ? 3 : 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size + 1 - j; i++) c.set(x + side * i, y + j - 1, j === 0 ? f.lit : f.leaf);
  }
  c.set(x + side * (size + 1), y - 1, f.dark);
}

/** A vine hanging (dir 1) or climbing (dir -1) from (x, y), swaying as it goes. */
export function vine(c: Canvas, x: number, y: number, length: number, seed: number, f: Foliage, dir: 1 | -1 = 1) {
  const r = rng(seed);
  let wx = x;
  for (let i = 0; i < length; i++) {
    const yy = y + i * dir;
    if (r() < 0.22) wx += r() < 0.5 ? -1 : 1;
    c.set(wx, yy, f.stem);
    if (i > 1 && r() < 0.38) leafCluster(c, wx, yy, r() < 0.5 ? -1 : 1, f, r);
  }
}

/** A patch of ivy climbing a wall: several vines from the foot, thickest at the bottom. */
export function creeper(c: Canvas, x: number, base: number, width: number, height: number, seed: number, f: Foliage) {
  const r = rng(seed);
  const strands = Math.max(2, Math.floor(width / 4));
  for (let i = 0; i < strands; i++) {
    const sx = x + Math.floor(r() * width);
    const h = Math.floor(height * (0.4 + r() * 0.6));
    vine(c, sx, base, h, seed * 31 + i, f, -1);
  }
  // A mat of leaves where the vines start.
  for (let i = 0; i < width * 2; i++) {
    const lx = x + Math.floor(r() * width);
    const ly = base - Math.floor(r() * r() * height * 0.5);
    c.set(lx, ly, r() < 0.3 ? f.lit : f.leaf);
  }
}

/** Water and rust running down a surface from (x, y). Darkens what is already there. */
export function stain(c: Canvas, x: number, y: number, length: number, tint: RGB, strength: number) {
  for (let i = 0; i < length; i++) {
    const fade = strength * (1 - i / length);
    for (const dx of [0, hash(x, y, i) > 0.6 ? 1 : 0]) {
      const p = c.get(x + dx, y + i);
      if (p !== -1) c.set(x + dx, y + i, mix(p, tint, fade));
    }
  }
}
