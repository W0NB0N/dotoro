import { type Ctx, DEPTH, shiftX, shiftY } from './city';
import {
  bakeGlow,
  bayer,
  fract,
  hash,
  decodeBase64,
  type Layer,
  type RGB,
  rng,
  scale,
  spin,
  Sprite,
} from './core';
import { createBillboard } from './billboard';
import { letterRows, plotNoiseGlyph, plotText, textWidth } from './font';
import { HOLOGRAM, PINUP } from './data';
import { creeper, FOLIAGE_FAR, FOLIAGE_NEAR, stain, vine } from './growth';
import { C } from './palette';

// ---------------------------------------------------------------------------------------------
// Flicker
// ---------------------------------------------------------------------------------------------

/**
 * Neon brightness over the loop: a steady buzz with a few bursts of dropout. Bursts are placed as
 * fractions of the loop, so the pattern repeats exactly.
 */
function neonLevel(t: number, seed: number, bursts: readonly number[], width = 0.012): number {
  const step = Math.floor(t * 900) % 900;
  const n = hash(step, seed);
  for (const b of bursts) {
    const d = fract(t - b + 0.5) - 0.5;
    if (Math.abs(d) < width) return n > 0.55 ? 1 : n > 0.3 ? 0.35 : 0;
  }
  return 0.9 + n * 0.1;
}

// ---------------------------------------------------------------------------------------------
// HOTEL
// ---------------------------------------------------------------------------------------------

const TUBE_PINK = 0xff3f9a;
const TUBE_CORE = 0xffe2f2;

/** One letter as a bent glass tube: a saturated body around a white-hot core line. */
function tubeLetter(ch: string, size: number): { sprite: Sprite; dark: Sprite } {
  const rows = letterRows(ch);
  const sprite = new Sprite(5 * size, 7 * size);
  const dark = new Sprite(5 * size, 7 * size);
  const on = (x: number, y: number) => rows[y]?.[x] === '#';
  const mid = Math.floor(size / 2);
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 5; x++) {
      if (!on(x, y)) continue;
      sprite.rect(x * size, y * size, size, size, TUBE_PINK);
      dark.rect(x * size, y * size, size, size, 0x3c0e4e);
    }
  }
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 5; x++) {
      if (!on(x, y)) continue;
      const cx = x * size + mid;
      const cy = y * size + mid;
      sprite.set(cx, cy, TUBE_CORE);
      if (on(x + 1, y)) sprite.rect(cx, cy, size + 1, 1, TUBE_CORE);
      if (on(x, y + 1)) sprite.rect(cx, cy, 1, size + 1, TUBE_CORE);
      if (on(x, y + 1)) dark.rect(cx, cy, 1, size, 0x54145e);
    }
  }
  return { sprite, dark };
}

function createHotel(L: Layer) {
  const word = 'HOTEL';
  const size = 3;
  const x = 66;
  const top = 19;
  const panelW = 27;
  const stepY = 22;
  const panelH = word.length * stepY + 6;

  // Steel backing and brackets back to the tower.
  L.rect(x, top, panelW, panelH, 0x0c0820);
  L.frame(x, top, panelW, panelH, 0x2a1c58);
  L.rect(x + 1, top + 1, panelW - 2, 1, 0x3a2a88);
  for (const by of [top + 14, top + panelH - 22]) {
    L.rect(x - 8, by, 8, 2, 0x161136);
    L.rect(x - 8, by - 1, 8, 1, 0x322674);
  }

  const letters = [...word].map((ch, i) => {
    const art = tubeLetter(ch, size);
    const lx = x + 6;
    const ly = top + 5 + i * stepY;
    // The dead tube stays visible on the panel when the letter drops out.
    for (let j = 0; j < art.dark.h; j++) {
      for (let k = 0; k < art.dark.w; k++) {
        const c = art.dark.get(k, j);
        if (c !== -1) L.set(lx + k, ly + j, c);
      }
    }
    const glow = bakeGlow(lx - 34, ly - 30, 15 + 68, 21 + 60, 6, 3.4, (set) => {
      for (let j = 0; j < art.sprite.h; j++) {
        for (let k = 0; k < art.sprite.w; k++) {
          if (art.sprite.get(k, j) !== -1) set(lx + k, ly + j, TUBE_PINK);
        }
      }
    });
    return { sprite: art.sprite, x: lx, y: ly, glow };
  });

  // The outline tube that runs round the panel, chasing when the sign is healthy.
  const dots: [number, number][] = [];
  for (let i = 3; i < panelW - 3; i += 3) dots.push([x + i, top + 2]);
  for (let i = 3; i < panelH - 3; i += 3) dots.push([x + panelW - 3, top + i]);
  for (let i = panelW - 3; i > 3; i -= 3) dots.push([x + i, top + panelH - 3]);
  for (let i = panelH - 3; i > 3; i -= 3) dots.push([x + 2, top + i]);

  // Every tube stutters now and then; "T" is the bad one, and sometimes the whole sign browns out.
  const brownouts = [0.18, 0.183, 0.51, 0.514, 0.517, 0.86];
  const flicker = [...word].map((_, i) => [
    ...brownouts,
    ...Array.from({ length: i === 2 ? 34 : 9 + i * 2 }, (_, k) => hash(k, 300 + i)),
  ]);

  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.near);
    const sy = shiftY(ctx, DEPTH.near);
    letters.forEach((l, i) => {
      const level = neonLevel(t, 70 + i, flicker[i]!, 0.0035);
      frame.glow(l.glow, sx, sy, level * 0.55);
      if (level > 0.3) frame.sprite(l.sprite, l.x + sx + frame.origin, l.y + sy);
    });
    const head = Math.floor(t * dots.length * 12);
    for (let i = 0; i < dots.length; i++) {
      const [dx, dy] = dots[i]!;
      const lit = (i + head) % 6 < 2;
      frame.put(dx + sx + frame.origin, dy + sy, lit ? C.gold : 0x3e1e0a);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// The hologram
// ---------------------------------------------------------------------------------------------

/** Decodes the hologram figure once: RGBA, alpha keyed from the reference's dark background. */
const HOLO_PIXELS = decodeBase64(HOLOGRAM.rgba);

/**
 * The big hologram: the figure leaning in and pointing, projected up from a rooftop emitter. It
 * flickers, tears and splits its colors often, with motes of light drifting off it.
 */
function createGirlHologram(x: number, y: number, emitter: readonly [number, number]) {
  const { w, h } = HOLOGRAM;
  const halo = bakeGlow(x - 20, y - 20, w + 40, h + 40, 5, 1.1, (set) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (HOLO_PIXELS[(j * w + i) * 4 + 3]! > 120) set(x + i, y + j, i < w * 0.55 ? 0xc22fb0 : 0x6cf0f8);
      }
    }
  });
  const seed = 41;
  // Dropouts, many per loop.
  const dropouts = Array.from({ length: 26 }, (_, i) => (i + hash(i, 77)) / 26);

  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.near);
    const sy = shiftY(ctx, DEPTH.near);
    const vx = sx + frame.origin;
    const level = neonLevel(t, seed, dropouts, 0.0016);

    // Projection cone from the emitter up into her.
    const [ex, ey] = emitter;
    const left = x + 10;
    const right = x + w - 24;
    const coneTop = y + h - 30;
    for (let row = ey; row >= coneTop; row--) {
      const u = (ey - row) / Math.max(1, ey - coneTop);
      const a = ex + (left - ex) * u;
      const b = ex + (right - ex) * u;
      for (let i = Math.floor(a); i <= Math.ceil(b); i++) {
        if ((i + row) % 2) continue;
        frame.add(i + vx, row + sy, 0xc048d0, 0.12 * level * (1 - u * 0.5));
      }
    }

    frame.glow(halo, sx, sy, 0.45 * level);

    const step = Math.floor(t * 240) % 240;
    const tearing = hash(step, seed + 9) > 0.72;
    const tearY = Math.floor(hash(step, seed + 3) * h);
    const tearHeight = 2 + Math.floor(hash(step, seed + 6) * 7);
    const tearAmount = Math.floor(hash(step, seed + 5) * 11) - 5;
    const split = hash(step, seed + 11) > 0.8 ? 1 + Math.floor(hash(step, seed + 12) * 3) : 0;
    const scan = Math.floor(t * 300);
    const bob = Math.round(Math.sin(spin(t, 10)) * 1);

    for (let j = 0; j < h; j++) {
      const lineGain = (j + scan) % 3 === 0 ? 0.45 : 1;
      const offset = tearing && Math.abs(j - tearY) < tearHeight ? tearAmount : 0;
      // She dissolves into the beam toward the bottom.
      const fade = Math.min(1, (h - j) / 18);
      for (let i = 0; i < w; i++) {
        const o = (j * w + i) * 4;
        const alpha = HOLO_PIXELS[o + 3]! / 255;
        if (alpha < 0.05) continue;
        if (fade < 1 && fade <= bayer(i, j)) continue;
        const c = (HOLO_PIXELS[o]! << 16) | (HOLO_PIXELS[o + 1]! << 8) | HOLO_PIXELS[o + 2]!;
        const px = x + i + offset + vx;
        const py = y + j + bob + sy;
        if (split) {
          frame.add(px - split, py, 0x2fe0f0, 0.25 * alpha * level);
          frame.add(px + split, py, 0xff3fa8, 0.25 * alpha * level);
        }
        frame.blend(px, py, c, Math.min(1, alpha * 1.1) * level * lineGain * 0.92);
      }
    }

    // Motes of light drifting off her, and the odd stray scan fragment.
    for (let i = 0; i < 22; i++) {
      const u = fract(t * (6 + (i % 5)) + hash(i, 90));
      const mx = x + 40 + hash(i, 91) * 60 + u * 12;
      const my = y + 10 + hash(i, 92) * 60 - u * 18;
      const c = hash(i, 93) > 0.5 ? 0x6cf0f8 : 0xff66b8;
      frame.add(Math.round(mx + vx), Math.round(my + sy), c, (1 - u) * 0.8 * level);
    }
    if (tearing) {
      const fy = y + Math.floor(hash(step, seed + 20) * h);
      const fx = x + Math.floor(hash(step, seed + 21) * w);
      for (let i = 0; i < 10; i++) frame.add(fx + i + vx, fy + sy, 0x9ff8ff, 0.6 * level);
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Smaller signage
// ---------------------------------------------------------------------------------------------

/** A vertical LED banner bolted to the left tower, with characters scrolling up it. */
function createBanner(L: Layer, x: number, y: number, w: number, h: number) {
  L.rect(x - 2, y - 2, w + 4, h + 4, 0x08061a);
  L.frame(x - 2, y - 2, w + 4, h + 4, 0x2a2470);
  const glow = bakeGlow(x - 20, y - 20, w + 40, h + 40, 7, 0.9, (set) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, 0x18a0d0);
  });
  const CELL = 9;
  const COUNT = 28;
  const glyphs = new Sprite(w, COUNT * CELL);
  const r = rng(88);
  for (let i = 0; i < COUNT; i++) {
    const c = r() < 0.18 ? 0xff66b8 : r() < 0.5 ? 0x9ff8ff : 0x2fe0f0;
    plotNoiseGlyph((px, py) => glyphs.set(px, py, c), Math.floor(r() * 6), Math.floor((w - 5) / 2), i * CELL + 1);
  }
  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.near) + frame.origin;
    const sy = shiftY(ctx, DEPTH.near);
    frame.glow(glow, shiftX(ctx, DEPTH.near), sy, 0.55);
    const scroll = Math.floor(t * COUNT * CELL * 4);
    for (let j = 0; j < h; j++) {
      const row = (j + scroll) % (COUNT * CELL);
      for (let i = 0; i < w; i++) {
        const c = glyphs.get(i, row);
        frame.put(x + i + sx, y + j + sy, c === -1 ? 0x0b2a4a : c);
      }
    }
  };
}

/** A small box sign with a static legend. */
function boxSign(L: Layer, x: number, y: number, label: string, fg: RGB, bg: RGB) {
  const w = textWidth(label) + 6;
  L.rect(x, y, w, 13, bg);
  L.frame(x, y, w, 13, scale(fg, 0.7));
  plotText((px, py) => L.neon(px, py, fg), label, x + 3, y + 3);
}

/**
 * A beer mug in bent LED tube, hung on two wires off the tower beside the BAR sign. No backboard:
 * just the glass tubes, foam bulbs and bubbles rising through the outline.
 */
function beerSign(L: Layer, x: number, y: number) {
  L.rect(x + 2, y - 6, 20, 1, 0x161136);
  L.line(x + 6, y - 5, x + 7, y + 2, 0x2a2470);
  L.line(x + 17, y - 5, x + 16, y + 2, 0x2a2470);
  const glow = bakeGlow(x - 20, y - 20, 62, 60, 6, 1.4, (set) => {
    for (let j = 3; j < 18; j++) for (let i = 5; i < 19; i++) set(x + i, y + j, C.amber);
  });
  // The tube path: mug body, handle, then the foam line along the top.
  const body: [number, number][] = [];
  for (let j = 5; j <= 17; j++) body.push([5, j], [15, j]);
  for (let i = 5; i <= 15; i++) body.push([i, 17]);
  const handle: [number, number][] = [];
  for (let j = 8; j <= 14; j++) handle.push([19, j]);
  for (let i = 16; i <= 18; i++) handle.push([i, 7], [i, 15]);

  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.near);
    const sy = shiftY(ctx, DEPTH.near);
    const vx = sx + frame.origin;
    const level = neonLevel(t, 61, [0.21, 0.58, 0.584, 0.9], 0.004);
    const lit = level > 0.3;
    frame.glow(glow, sx, sy, 0.45 * level);
    // A lit tube has a white-hot core and a colored skin either side of it.
    const tube = (i: number, j: number, core: RGB, skin: RGB) => {
      const px = x + i + vx;
      const py = y + j + sy;
      frame.put(px, py, lit ? core : scale(skin, 0.3));
      if (lit) {
        frame.add(px - 1, py, skin, 0.5);
        frame.add(px + 1, py, skin, 0.5);
      }
    };
    for (const [i, j] of body) tube(i, j, 0xffe08a, C.amber);
    for (const [i, j] of handle) tube(i, j, 0xffc85a, C.ember);
    // Foam: a wavy tube of white bulbs, gently shimmering.
    for (let i = 4; i <= 16; i++) {
      const j = 4 + ((i + (Math.floor(t * 81) % 81)) % 3 === 0 ? -1 : 0);
      tube(i, j, 0xffffff, 0xfff6d0);
    }
    if (!lit) return;
    // Bubbles, as single LEDs rising up inside the outline.
    for (let b = 0; b < 5; b++) {
      const by = 16 - Math.floor(fract(t * 50 + b * 0.23) * 10);
      frame.put(x + 7 + b * 2 + vx, y + by + sy, C.gold);
    }
  };
}

/** A Japanese house: timber and plaster storeys under a tiled, upturned roof. */
function japaneseHouse(L: Layer, seed: number, x: number, w: number, base: number, storeys: number, storeyH: number, roofH: number) {
  const r = rng(seed);
  const wallTop = base - storeys * storeyH;
  const timber = 0x2a1408;
  const plaster = 0x1c1830;
  const tile = 0x1a1838;
  const tileLine = 0x0e0b22;

  for (let k = 0; k < storeys; k++) {
    const y0 = base - (k + 1) * storeyH;
    L.rect(x, y0, w, storeyH, plaster);
    L.rect(x, y0, w, 1, timber);
    L.rect(x, y0 + storeyH - 2, w, 2, timber);
    // Posts, and sliding screens between them: some lit warm from inside.
    for (let px = x; px < x + w; px += 12) {
      L.rect(px, y0, 2, storeyH, timber);
      const pw = Math.min(10, x + w - px - 2);
      if (pw < 4) continue;
      const lit = r() < 0.55;
      const sy = y0 + 3;
      const sh = storeyH - 6;
      for (let j = 0; j < sh; j++) {
        for (let i = 0; i < pw; i++) {
          const lattice = i % 3 === 2 || j % 4 === 3;
          const c = lit ? (lattice ? 0x94480c : j < sh / 2 ? 0xffc85a : 0xef9420) : lattice ? 0x1e0f06 : 0x120e2a;
          L.set(px + 2 + i, sy + j, c);
        }
      }
      if (lit && r() < 0.3) {
        // A silhouette behind the paper.
        L.rect(px + 4, sy + sh - 6, 3, 6, 0x5a2a0c);
        L.rect(px + 4, sy + sh - 8, 3, 2, 0x5a2a0c);
      }
    }
    if (k > 0) {
      // A railing across the upper storeys, with washing hung out.
      L.rect(x - 1, y0 + storeyH - 5, w + 2, 1, timber);
      for (let i = 0; i < w; i += 2) L.set(x + i, y0 + storeyH - 4, timber);
      if (r() < 0.8) {
        const lx = x + 4 + Math.floor(r() * (w - 24));
        L.rect(lx, y0 + 2, 18, 1, 0x45455c);
        for (let i = 0; i < 3; i++) L.rect(lx + 1 + i * 6, y0 + 3, 4, 3 + Math.floor(r() * 3), [0x701a70, 0x223a84, 0x45455c][i]!);
      }
      // The little eave over the storey below.
      L.rect(x - 3, y0 + storeyH - 1, w + 6, 2, tile);
      L.rect(x - 3, y0 + storeyH - 1, w + 6, 1, 0x2a2a50);
    }
    if (r() < 0.6) {
      // An air conditioner, sweating rust down the wall.
      const ax = x + w - 12;
      L.rect(ax, y0 + 4, 8, 6, 0x3e4e40);
      L.rect(ax, y0 + 4, 8, 1, 0x5a6a58);
      for (let i = 0; i < 4; i++) L.set(ax + 2 + i, y0 + 7, 0x1c2620);
      stain(L, ax + 3, y0 + 10, 8, 0x5a2a0c, 0.5);
    }
  }

  // Roof: tiles in vertical runs, eaves flaring out and curling up at the corners.
  for (let j = 0; j < roofH; j++) {
    const u = j / roofH;
    const inset = (1 - u) * w * 0.28;
    const left = Math.round(x - 7 + inset);
    const right = Math.round(x + w + 7 - inset);
    const y = wallTop - roofH + j;
    for (let i = left; i < right; i++) L.set(i, y, (i - left) % 3 === 0 ? tileLine : tile);
  }
  const ridgeL = Math.round(x - 7 + w * 0.28);
  const ridgeR = Math.round(x + w + 7 - w * 0.28);
  L.rect(ridgeL, wallTop - roofH - 2, ridgeR - ridgeL, 2, 0x2a2a50);
  L.rect(ridgeL - 2, wallTop - roofH - 4, 3, 4, 0x2a2a50);
  L.rect(ridgeR - 1, wallTop - roofH - 4, 3, 4, 0x2a2a50);
  L.rect(x - 8, wallTop - 1, w + 16, 2, 0x12102a);
  // Upturned tips.
  L.rect(x - 10, wallTop - 3, 3, 2, tile);
  L.set(x - 11, wallTop - 4, tile);
  L.rect(x + w + 7, wallTop - 3, 3, 2, tile);
  L.set(x + w + 10, wallTop - 4, tile);
  // A red lantern under the eave.
  L.neonRect(x + 6, wallTop + 2, 3, 4, C.red);
  L.neon(x + 7, wallTop + 1, C.amber);

  // Moss and vines on the old timber.
  creeper(L, x + 2, base - 1, Math.floor(w * 0.4), storeys * storeyH * 0.6, seed + 5, FOLIAGE_FAR);
  for (let i = 0; i < 3; i++) vine(L, x + Math.floor(r() * w), wallTop + 1, 6 + Math.floor(r() * 10), seed + 40 + i, FOLIAGE_FAR);
}

/** A satellite dish: a tilted bowl on a short mast, with its feed arm. */
function dish(L: Layer, x: number, y: number, r: number, facing: 1 | -1) {
  L.rect(x, y, 1, r + 3, 0x2c2c3e);
  for (let j = -r; j <= r; j++) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - j * j)) * 0.55);
    for (let i = -half; i <= half; i++) {
      const rim = Math.abs(i) === half || Math.abs(j) === r;
      L.set(x + i + facing, y + j - 2, rim ? 0x9a9ab4 : i * facing < 0 ? 0x6a6a84 : 0x45455c);
    }
  }
  L.line(x + facing, y - 2, x + facing * (r + 2), y - 4, 0x6a6a84);
  L.set(x + facing * (r + 2), y - 4, 0xd0d8f0);
}

/** An air conditioner on a wall bracket, with a fan grille and a drip of rust below. */
function acUnit(L: Layer, x: number, y: number) {
  L.rect(x - 1, y + 6, 12, 1, 0x1c2620);
  L.rect(x, y, 10, 6, 0x5a6a58);
  L.rect(x, y, 10, 1, 0x7a8a72);
  L.rect(x + 9, y + 1, 1, 5, 0x3e4e40);
  L.ellipse(x + 6, y + 3, 2, 2, 0x2c3a30);
  L.set(x + 6, y + 3, 0x5a6a58);
  for (let j = 1; j < 5; j++) L.set(x + 2, y + j, 0x3e4e40);
  stain(L, x + 4, y + 7, 7, 0x5a2a0c, 0.45);
}

/** Everything that collects on an old roof: dishes, an antenna, a water tank, cables, more AC. */
function rooftopClutter(L: Layer, x: number, w: number, roofTop: number) {
  // Water tank on stilts.
  L.rect(x + 8, roofTop - 12, 12, 9, 0x2c2c3e);
  L.rect(x + 8, roofTop - 12, 12, 1, 0x45455c);
  L.rect(x + 10, roofTop - 3, 1, 4, 0x1a1a26);
  L.rect(x + 17, roofTop - 3, 1, 4, 0x1a1a26);
  // A cluster of dishes and an antenna along the ridge.
  dish(L, x + 30, roofTop - 7, 5, -1);
  dish(L, x + 44, roofTop - 9, 4, 1);
  dish(L, x + w - 10, roofTop - 6, 3, -1);
  L.rect(x + 64, roofTop - 24, 1, 24, 0x2c2c3e);
  for (let i = 0; i < 4; i++) L.rect(x + 61 + (i % 2), roofTop - 22 + i * 4, 7 - (i % 2) * 2, 1, 0x45455c);
  L.set(x + 64, roofTop - 25, 0xff3050);
  // Cables sagging off the roof to the next building.
  L.sag(x + 64, roofTop - 20, x + w + 40, roofTop - 8, 8, 0x0a0818);
  L.sag(x + 30, roofTop - 6, x - 30, roofTop + 2, 6, 0x0a0818);
  // AC units bolted all over the walls, and dishes on wall brackets.
  for (const [ax, ay] of [
    [x + 4, roofTop + 15],
    [x + 26, roofTop + 31],
    [x + 40, roofTop + 15],
    [x + w - 16, roofTop + 15],
    [x + 4, roofTop + 31],
  ] as const) {
    acUnit(L, ax, ay);
  }
  dish(L, x - 4, roofTop + 24, 4, -1);
}

/**
 * A neon pin-up in heels, in red tube inside a red tube frame, up on posts on the roof. Drawn live:
 * the frame burns steady while the figure inside stutters.
 */
function pinupSign(L: Layer, x: number, y: number) {
  const h = PINUP.length;
  const w = PINUP[0]!.length;
  L.rect(x + 4, y + h, 2, 6, 0x161136);
  L.rect(x + w - 6, y + h, 2, 6, 0x161136);
  L.rect(x, y, w, h, 0x140608);
  const glow = bakeGlow(x - 14, y - 14, w + 28, h + 28, 4, 1.3, (set) => {
    PINUP.forEach((row, j) => {
      for (let i = 0; i < w; i++) if (row[i] === '#') set(x + i, y + j, 0xff3050);
    });
  });
  const isFrame = (i: number, j: number) => i <= 1 || j === 0 || i >= w - 1 || j === h - 1;
  const stutters = Array.from({ length: 30 }, (_, k) => hash(k, 404));
  return (ctx: Ctx) => {
    const { frame, t } = ctx;
    const sx = shiftX(ctx, DEPTH.near);
    const sy = shiftY(ctx, DEPTH.near);
    const vx = sx + frame.origin;
    const figure = neonLevel(t, 81, stutters, 0.003);
    frame.glow(glow, sx, sy, 0.3 + 0.15 * figure);
    PINUP.forEach((row, j) => {
      for (let i = 0; i < w; i++) {
        const c = row[i];
        if (c === '.') continue;
        const lit = isFrame(i, j) || figure > 0.3;
        const color = c === '#' ? (lit ? 0xff3050 : 0x5a0a20) : lit ? 0x80102a : 0x3a0820;
        frame.put(x + i + vx, y + j + sy, color);
      }
    });
  };
}

/** A hanging blade sign, lettered top to bottom. */
function bladeSign(L: Layer, x: number, y: number, word: string, c: RGB) {
  const chars = [...word];
  const h = chars.length * 9 + 4;
  L.rect(x - 4, y - 3, 12, 2, 0x161136);
  L.rect(x, y, 9, h, 0x120618);
  L.frame(x, y, 9, h, scale(c, 0.5));
  chars.forEach((ch, i) => plotText((px, py) => L.neon(px, py, c), ch, x + 2, y + 3 + i * 9));
}

// ---------------------------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------------------------

export interface Signs {
  /** Things that sit on or in front of the near towers. */
  draw(ctx: Ctx): void;
}

/** Paints the two hand-composed flanks of the view into the near layer. */
export function createSigns(L: Layer): Signs {
  const r = rng(909);

  // Left flank: a tall tower carrying the HOTEL sign.
  L.rect(-74, -20, 130, 262, 0x0c0a2c);
  L.rect(50, -20, 8, 262, 0x070618);
  L.rect(-74, -20, 1, 262, 0x2c3aa8);
  for (let y = -14; y < 150; y += 7) {
    const lit = r() < 0.6;
    for (let x = -68; x < 46; x += 6) {
      const on = lit && r() < 0.32;
      L.rect(x, y, 4, 4, on ? (r() < 0.7 ? 0xffb030 : 0x6cf0f8) : 0x141240);
      if (on) L.rect(x, y, 4, 1, 0xfff6d0);
    }
  }
  for (let y = 0; y < 240; y++) L.neon(57, y, 0x2fe0f0);
  boxSign(L, 33, 62, 'BAR', C.hot, 0x1a0620);
  boxSign(L, 33, 78, '24H', C.amber, 0x1e0f06);

  // Water stains running down the tower from its window ledges.
  for (let i = 0; i < 26; i++) stain(L, -64 + Math.floor(r() * 110), -10 + Math.floor(r() * 120), 10 + Math.floor(r() * 30), 0x05040c, 0.35);
  creeper(L, -70, 150, 70, 60, 81, FOLIAGE_NEAR);
  vine(L, 52, 40, 30, 82, FOLIAGE_NEAR);

  // Right flank: old Japanese houses below the billboard, the trains running over their roofs.
  // Two old houses side by side, their floors running all the way down out of sight. The roofs sit
  // clear below the billboard.
  japaneseHouse(L, 52, 352, 70, 238, 9, 16, 12);
  rooftopClutter(L, 352, 70, 238 - 9 * 16 - 12);
  bladeSign(L, 340, 92, 'スナック', C.pink);
  japaneseHouse(L, 53, 430, 74, 238, 8, 17, 11);
  const pinup = pinupSign(L, 436, 76);

  // A short block the left hologram projects from.
  L.rect(96, 112, 54, 130, 0x0a0a28);
  L.rect(96, 112, 54, 1, 0x3a3aa0);
  L.rect(112, 108, 22, 4, 0x161136);
  L.rect(116, 104, 14, 4, 0x2a2470);

  // Vines hanging off the HOTEL sign's brackets.
  vine(L, 60, 34, 22, 83, FOLIAGE_NEAR);
  vine(L, 62, 112, 16, 84, FOLIAGE_NEAR);

  const hotel = createHotel(L);
  const billboard = createBillboard(L, [
    [319, 128],
    [450, 64],
  ]);
  const banner = createBanner(L, 15, 30, 13, 66);
  const beer = beerSign(L, 33, 40);

  const girl = createGirlHologram(88, 24, [118, 112]);

  return {
    draw(ctx) {
      banner(ctx);
      beer(ctx);
      pinup(ctx);
      hotel(ctx);
      billboard(ctx);
      girl(ctx);
    },
  };
}

