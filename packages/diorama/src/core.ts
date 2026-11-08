/**
 * The diorama's software rasterizer. Everything is drawn into plain typed arrays with no DOM, so
 * a frame is a pure function of (frame number, parallax): the same pixels in the browser, in tests
 * and in a video export. Nothing here antialiases, which is what keeps the art crisp.
 */

export const VIEW_W = 480;
export const VIEW_H = 270;
/** Every layer wraps horizontally at this width, so any aspect ratio and parallax shift is covered. */
export const TILE_W = 1024;
export const TILE_MASK = TILE_W - 1;
/** Rows above and below the view, available to vertical parallax. */
export const PAD = 16;
export const LAYER_H = VIEW_H + PAD * 2;

export const FPS = 30;
export const LOOP_SECONDS = 120;
export const LOOP_FRAMES = FPS * LOOP_SECONDS;

export type RGB = number;

const toPixel = (c: RGB): number =>
  (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const fromPixel = (p: number): RGB => ((p & 0xff) << 16) | (p & 0xff00) | ((p >> 16) & 0xff);

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const fract = (v: number) => v - Math.floor(v);
export const smooth = (t: number) => t * t * (3 - 2 * t);

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t);
  const ar = a >> 16;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + ((b >> 16) - ar) * k;
  const g = ag + (((b >> 8) & 255) - ag) * k;
  const bl = ab + ((b & 255) - ab) * k;
  return ((r + 0.5) << 16) | ((g + 0.5) << 8) | (bl + 0.5);
}

export function scale(c: RGB, k: number): RGB {
  const r = Math.min(255, (c >> 16) * k);
  const g = Math.min(255, ((c >> 8) & 255) * k);
  const b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/** Stateless hash to [0, 1). Loop-safe randomness: same inputs, same answer, every pass. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4x4 ordered-dither threshold in [0, 1). */
export const bayer = (x: number, y: number): number => (BAYER4[(x & 3) | ((y & 3) << 2)]! + 0.5) / 16;

const SINE_SIZE = 1024;
const SINE = Float32Array.from({ length: SINE_SIZE }, (_, i) => Math.sin((i / SINE_SIZE) * Math.PI * 2));
const SINE_SCALE = SINE_SIZE / (Math.PI * 2);
/** Table sine for per-pixel loops. Accurate to a fraction of a percent, far above what shows here. */
export const fastSin = (a: number): number => SINE[Math.floor(a * SINE_SCALE) & (SINE_SIZE - 1)]!;

/** An angle turning `cycles` times per loop, kept small so it stays exact at the seam. */
export const spin = (t: number, cycles: number) => fract(t * cycles) * Math.PI * 2;

/** Value noise, tiling at (px, py). */
export function noise(x: number, y: number, px: number, py: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const at = (i: number, j: number) => hash(((i % px) + px) % px, ((j % py) + py) % py, seed);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
  const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
  return top + (bot - top) * fy;
}

export function fbm(x: number, y: number, px: number, py: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y, px, py, seed + i) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2;
    y *= 2;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

/** Drawing primitives shared by layers and sprites. */
export abstract class Canvas {
  abstract set(x: number, y: number, c: RGB): void;
  abstract clear(x: number, y: number): void;
  abstract get(x: number, y: number): RGB | -1;

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  frame(x: number, y: number, w: number, h: number, c: RGB) {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  line(ax: number, ay: number, bx: number, by: number, c: RGB) {
    // Whole pixels only: Bresenham walks until it lands exactly on the end point.
    const x0 = Math.round(ax);
    const y0 = Math.round(ay);
    const x1 = Math.round(bx);
    const y1 = Math.round(by);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e = 2 * err;
      if (e >= dy) {
        err += dy;
        x += sx;
      }
      if (e <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x - cx) / rx;
        const v = (y - cy) / ry;
        if (u * u + v * v <= 1) this.set(x, y, c);
      }
    }
  }

  poly(points: readonly (readonly [number, number])[], c: RGB) {
    let top = Infinity;
    let bottom = -Infinity;
    for (const [, y] of points) {
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    for (let y = Math.floor(top); y <= Math.ceil(bottom); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i]!;
        const [bx, by] = points[(i + 1) % points.length]!;
        if (ay <= y + 0.5 !== by <= y + 0.5) xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]!); x < Math.round(xs[i + 1]!); x++) this.set(x, y, c);
      }
    }
  }

  /** A rope sagging between two anchors. */
  sag(x0: number, y0: number, x1: number, y1: number, droop: number, c: RGB) {
    const steps = Math.max(2, Math.abs(x1 - x0));
    let px = x0;
    let py = y0;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const x = Math.round(x0 + (x1 - x0) * u);
      const y = Math.round(y0 + (y1 - y0) * u + droop * 4 * u * (1 - u));
      this.line(px, py, x, y, c);
      px = x;
      py = y;
    }
  }
}

/** A wrapping, full-scene bitmap. Pixel value 0 is transparent. */
export class Layer extends Canvas {
  readonly px = new Uint32Array(TILE_W * LAYER_H);
  private emissive: Float32Array | null = null;

  override set(x: number, y: number, c: RGB) {
    const row = (y | 0) + PAD;
    if (row < 0 || row >= LAYER_H) return;
    this.px[row * TILE_W + ((x | 0) & TILE_MASK)] = toPixel(c);
  }

  override clear(x: number, y: number) {
    const row = (y | 0) + PAD;
    if (row < 0 || row >= LAYER_H) return;
    this.px[row * TILE_W + ((x | 0) & TILE_MASK)] = 0;
  }

  override get(x: number, y: number): RGB | -1 {
    const row = (y | 0) + PAD;
    if (row < 0 || row >= LAYER_H) return -1;
    const p = this.px[row * TILE_W + ((x | 0) & TILE_MASK)]!;
    return p === 0 ? -1 : fromPixel(p);
  }

  /** A self-lit pixel: it also feeds the halo baked by {@link bakeHalo}. */
  neon(x: number, y: number, c: RGB) {
    this.set(x, y, c);
    const row = (y | 0) + PAD;
    if (row < 0 || row >= LAYER_H) return;
    this.emissive ??= new Float32Array(TILE_W * LAYER_H * 3);
    const i = (row * TILE_W + ((x | 0) & TILE_MASK)) * 3;
    this.emissive[i] = c >> 16;
    this.emissive[i + 1] = (c >> 8) & 255;
    this.emissive[i + 2] = c & 255;
  }

  neonRect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.neon(x + i, y + j, c);
  }

  /** Spills the neon pixels' light over this layer's own surfaces. */
  bakeHalo(radius: number, gain: number) {
    const e = this.emissive;
    if (!e) return;
    const blurred = boxBlur3(e, TILE_W, LAYER_H, radius, true);
    for (let i = 0; i < this.px.length; i++) {
      const p = this.px[i]!;
      if (p === 0) continue;
      const r = Math.min(255, (p & 255) + blurred[i * 3]! * gain);
      const g = Math.min(255, ((p >> 8) & 255) + blurred[i * 3 + 1]! * gain);
      const b = Math.min(255, ((p >> 16) & 255) + blurred[i * 3 + 2]! * gain);
      this.px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
    this.emissive = null;
  }

  /** Aerial perspective: pulls opaque pixels toward the haze color. */
  fog(color: (x: number, y: number) => RGB, amount: (y: number) => number) {
    for (let row = 0; row < LAYER_H; row++) {
      const y = row - PAD;
      const k = amount(y);
      for (let x = 0; x < TILE_W; x++) {
        const i = row * TILE_W + x;
        const p = this.px[i]!;
        if (p !== 0) this.px[i] = toPixel(mix(fromPixel(p), color(x, y), k));
      }
    }
  }

  /** Wet catch-lights on every upward-facing edge. */
  wetEdges(color: (x: number, y: number) => RGB, strength: number) {
    const lit: [number, number][] = [];
    for (let row = 1; row < LAYER_H; row++) {
      for (let x = 0; x < TILE_W; x++) {
        const i = row * TILE_W + x;
        if (this.px[i] !== 0 && this.px[i - TILE_W] === 0) lit.push([x, row - PAD]);
      }
    }
    for (const [x, y] of lit) {
      const base = this.get(x, y);
      if (base !== -1) this.set(x, y, mix(base, color(x, y), strength));
    }
  }
}

/** A small bitmap for hand-placed, animated things. Pixel value 0 is transparent. */
export class Sprite extends Canvas {
  readonly px: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    super();
    this.px = new Uint32Array(w * h);
  }

  override set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[(y | 0) * this.w + (x | 0)] = toPixel(c);
  }

  override clear(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[(y | 0) * this.w + (x | 0)] = 0;
  }

  override get(x: number, y: number): RGB | -1 {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const p = this.px[(y | 0) * this.w + (x | 0)]!;
    return p === 0 ? -1 : fromPixel(p);
  }

  static fromArt(art: readonly string[], colors: Readonly<Record<string, RGB>>): Sprite {
    const s = new Sprite(art[0]!.length, art.length);
    art.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = colors[row[x]!];
        if (c !== undefined) s.set(x, y, c);
      }
    });
    return s;
  }

  flipped(): Sprite {
    const s = new Sprite(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) s.px[y * this.w + (this.w - 1 - x)] = this.px[y * this.w + x]!;
    }
    return s;
  }
}

/** Plain base64 decoding: the package stays free of DOM and Node APIs. */
export function decodeBase64(text: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    value = (value << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 255;
    }
  }
  return out;
}

/** A sprite from base64 RGBA, enlarged by a whole number with hard edges. */
export function spriteFromRgba(art: { w: number; h: number; rgba: string }, size = 1): Sprite {
  const bytes = decodeBase64(art.rgba);
  const s = new Sprite(art.w * size, art.h * size);
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const o = (y * art.w + x) * 4;
      if (bytes[o + 3]! < 128) continue;
      s.rect(x * size, y * size, size, size, (bytes[o]! << 16) | (bytes[o + 1]! << 8) | bytes[o + 2]!);
    }
  }
  return s;
}

/** Three box passes approximate a gaussian. Input and output are interleaved RGB floats. */
function boxBlur3(src: Float32Array, w: number, h: number, r: number, wrap: boolean): Float32Array {
  const a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  const across = (x: number) => (wrap ? ((x % w) + w) % w : clamp(x, 0, w - 1));
  const down = (y: number) => clamp(y, 0, h - 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < h; y++) {
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += a[(y * w + across(i)) * 3 + c]!;
        for (let x = 0; x < w; x++) {
          b[(y * w + x) * 3 + c] = sum * norm;
          sum += a[(y * w + across(x + r + 1)) * 3 + c]! - a[(y * w + across(x - r)) * 3 + c]!;
        }
      }
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += b[(down(i) * w + x) * 3 + c]!;
        for (let y = 0; y < h; y++) {
          a[(y * w + x) * 3 + c] = sum * norm;
          sum += b[(down(y + r + 1) * w + x) * 3 + c]! - b[(down(y - r) * w + x) * 3 + c]!;
        }
      }
    }
  }
  return a;
}

/** A pre-blurred patch of additive light, faded in and out at draw time. */
export interface Glow {
  x: number;
  y: number;
  w: number;
  h: number;
  rgb: Uint8Array;
}

/** Bakes a soft light into a patch at art-space (x, y). `paint` plots its source in art space. */
export function bakeGlow(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  gain: number,
  paint: (set: (px: number, py: number, c: RGB) => void) => void,
): Glow {
  const src = new Float32Array(w * h * 3);
  paint((px, py, c) => {
    const lx = (px | 0) - x;
    const ly = (py | 0) - y;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
    const i = (ly * w + lx) * 3;
    src[i] = c >> 16;
    src[i + 1] = (c >> 8) & 255;
    src[i + 2] = c & 255;
  });
  const blurred = boxBlur3(src, w, h, radius, false);
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.min(255, blurred[i]! * gain);
  return { x, y, w, h, rgb };
}

/** The image being composed: RGBA, one byte per channel, ready for ImageData. */
export class Frame {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly u32: Uint32Array;
  readonly snapshot: Uint32Array;
  /** View x of art-space x = 0: art is authored for a 480-wide view and stays centered. */
  readonly origin: number;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
    this.u32 = new Uint32Array(this.data.buffer);
    this.snapshot = new Uint32Array(w * h);
    this.origin = Math.floor((w - VIEW_W) / 2);
  }

  /** Rows outside [top, bottom) are skipped: most of the city sits behind the room. */
  blit(layer: Layer, shiftX: number, shiftY: number, top = 0, bottom = this.h) {
    const { u32, w, origin } = this;
    const src = layer.px;
    const startX = -origin - shiftX;
    for (let y = top; y < bottom; y++) {
      const row = y + PAD - shiftY;
      if (row < 0 || row >= LAYER_H) continue;
      const base = row * TILE_W;
      const out = y * w;
      for (let x = 0; x < w; x++) {
        const p = src[base + ((startX + x) & TILE_MASK)]!;
        if (p !== 0) u32[out + x] = p;
      }
    }
  }

  /** Blits a sprite at view coordinates. */
  sprite(s: Sprite, x: number, y: number) {
    const { u32, w, h } = this;
    for (let j = 0; j < s.h; j++) {
      const oy = y + j;
      if (oy < 0 || oy >= h) continue;
      for (let i = 0; i < s.w; i++) {
        const ox = x + i;
        if (ox < 0 || ox >= w) continue;
        const p = s.px[j * s.w + i]!;
        if (p !== 0) u32[oy * w + ox] = p;
      }
    }
  }

  /** Patch of additive light at art space, shifted with its layer. */
  glow(g: Glow, shiftX: number, shiftY: number, k: number) {
    if (k <= 0.004) return;
    const { data, w, h, origin } = this;
    const left = g.x + origin + shiftX;
    const top = g.y + shiftY;
    const fixed = (k * 256) | 0;
    for (let j = 0; j < g.h; j++) {
      const oy = top + j;
      if (oy < 0 || oy >= h) continue;
      for (let i = 0; i < g.w; i++) {
        const ox = left + i;
        if (ox < 0 || ox >= w) continue;
        const s = (j * g.w + i) * 3;
        const r = g.rgb[s]!;
        const gg = g.rgb[s + 1]!;
        const b = g.rgb[s + 2]!;
        if (r + gg + b === 0) continue;
        const o = (oy * w + ox) * 4;
        data[o] = data[o]! + ((r * fixed) >> 8);
        data[o + 1] = data[o + 1]! + ((gg * fixed) >> 8);
        data[o + 2] = data[o + 2]! + ((b * fixed) >> 8);
      }
    }
  }

  put(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.u32[(y | 0) * this.w + (x | 0)] = toPixel(c);
  }

  add(x: number, y: number, c: RGB, k = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = ((y | 0) * this.w + (x | 0)) * 4;
    const d = this.data;
    d[o] = d[o]! + (c >> 16) * k;
    d[o + 1] = d[o + 1]! + ((c >> 8) & 255) * k;
    d[o + 2] = d[o + 2]! + (c & 255) * k;
  }

  /** Blends toward `c`, then lifts by what's behind, so rain picks up the neon it falls past. */
  tint(x: number, y: number, c: RGB, a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = ((y | 0) * this.w + (x | 0)) * 4;
    const d = this.data;
    const r = d[o]!;
    const g = d[o + 1]!;
    const b = d[o + 2]!;
    d[o] = r + ((c >> 16) - r) * a + r * a * 0.6;
    d[o + 1] = g + (((c >> 8) & 255) - g) * a + g * a * 0.6;
    d[o + 2] = b + ((c & 255) - b) * a + b * a * 0.6;
  }

  /** Plain alpha blend, for light that should sit on top rather than add up. */
  blend(x: number, y: number, c: RGB, a: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = ((y | 0) * this.w + (x | 0)) * 4;
    const d = this.data;
    d[o] = d[o]! + ((c >> 16) - d[o]!) * a;
    d[o + 1] = d[o + 1]! + (((c >> 8) & 255) - d[o + 1]!) * a;
    d[o + 2] = d[o + 2]! + ((c & 255) - d[o + 2]!) * a;
  }

  takeSnapshot() {
    this.snapshot.set(this.u32);
  }
}
