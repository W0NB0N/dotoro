import { type Color, type Gfx, mix, type Theme } from '@dotoro/kernel';

/**
 * Screen chrome for themes that ask for it (`style.hud`): faint scanlines, corner brackets with a
 * blinking status light, text with a chromatic fringe, and short glitches that tear a few rows
 * sideways. Everything is drawn from the theme's own palette, so it works for any theme.
 */

export const hasHud = (theme: Theme): boolean => theme.style?.hud === true;

/** Stable hash to [0, 1). */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Every other row a shade lighter than the background, like a CRT's scanlines. */
export function scanlines(g: Gfx, theme: Theme): void {
  const p = theme.screen;
  const line = mix(p.background, p.secondary, 0.22);
  for (let y = 1; y < g.height; y += 2) g.fillRect(0, y, g.width, 1, line);
}

/** The color of a text's fringe: the accent, unless the text is already in the accent. */
export function fringeFor(theme: Theme, color: Color): Color {
  const p = theme.screen;
  return mix(p.background, color === p.accent ? p.foreground : p.accent, 0.7);
}

/** Corner brackets, the top-left one hot, and a status light blinking in the top-right. */
export function hudFrame(g: Gfx, theme: Theme, now: number): void {
  const p = theme.screen;
  const w = g.width - 1;
  const h = g.height - 1;
  const dim = p.secondary;
  for (const [x, y, dx, dy] of [
    [0, 0, 1, 1],
    [w, 0, -1, 1],
    [0, h, 1, -1],
    [w, h, -1, -1],
  ] as const) {
    g.pixel(x, y, dim);
    g.pixel(x + dx, y, dim);
    g.pixel(x + dx * 2, y, dim);
    g.pixel(x, y + dy, dim);
    g.pixel(x, y + dy * 2, dim);
  }
  g.pixel(0, 0, p.accent);
  g.pixel(w, h, p.foreground);
  if (Math.floor(now / 600) % 2 === 0) g.pixel(w - 2, 2, p.danger);
}

/**
 * Tears two or three bands of rows sideways for the first 180ms after `since`, tinting what moved.
 * Also fires on its own for a moment every few seconds, so a still screen still feels alive.
 */
export function glitch(g: Gfx, theme: Theme, now: number, since: number, seed = 0): void {
  const DURATION = 180;
  const IDLE_PERIOD = 4700;
  let elapsed = now - since;
  let salt = seed;
  if (elapsed < 0 || elapsed >= DURATION) {
    // The idle glitch, once per period.
    elapsed = now % IDLE_PERIOD;
    salt = Math.floor(now / IDLE_PERIOD) * 7919 + seed;
    if (elapsed >= 120) return;
  }
  const step = Math.floor(elapsed / 45);
  const fb = g.fb;
  const row = new Uint32Array(fb.width);
  const tints = [theme.screen.accent, theme.screen.foreground, theme.screen.danger];
  const bands = 2 + Math.floor(hash(step, salt) * 2);
  for (let k = 0; k < bands; k++) {
    const y0 = Math.floor(hash(step * 3 + k, salt + 11) * (fb.height - 2));
    const height = 1 + Math.floor(hash(k, step + salt) * 2);
    const amount = (hash(k + 5, step + salt) > 0.5 ? 1 : -1) * (1 + Math.floor(hash(k + 9, step + salt) * 3));
    for (let y = y0; y < y0 + height && y < fb.height; y++) {
      for (let x = 0; x < fb.width; x++) row[x] = fb.get(x, y);
      for (let x = 0; x < fb.width; x++) {
        const c = row[(((x - amount) % fb.width) + fb.width) % fb.width]!;
        fb.set(x, y, mix(c, tints[k % tints.length]!, 0.3));
      }
    }
  }
}
