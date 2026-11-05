import { type Color, hex } from './color';

/** Serialized sprite as written by tools/assets/convert.mjs. */
export interface SpriteJson {
  name: string;
  width: number;
  height: number;
  /** `#rrggbb` per palette index. */
  palette: string[];
  /** Palette index that is not drawn, or omitted when the sprite is opaque. */
  transparent?: number;
  /** Bytes per palette index: 1 (default) or 2 (little-endian, for palettes > 256 colors). */
  indexBytes?: 1 | 2;
  /** One palette index per pixel, row-major, base64-encoded. */
  frames: { delay: number; data: string }[];
}

export interface SpriteFrame {
  /** How long this frame is shown, in ms. */
  readonly delay: number;
  readonly indices: Uint16Array;
}

export interface Sprite {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly palette: readonly Color[];
  /** -1 when every index is drawn. */
  readonly transparent: number;
  readonly frames: readonly SpriteFrame[];
  /** Sum of all frame delays, in ms. */
  readonly duration: number;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

/** Dependency-free base64 decoder (the kernel must not rely on DOM or Node globals). */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_LOOKUP[clean.charCodeAt(i)] ?? -1;
    if (v < 0) throw new Error(`Invalid base64 character at ${i}`);
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export function decodeSprite(json: SpriteJson): Sprite {
  const size = json.width * json.height;
  const bytesPerIndex = json.indexBytes ?? 1;
  const frames = json.frames.map((f, i) => {
    const bytes = decodeBase64(f.data);
    if (bytes.length !== size * bytesPerIndex) {
      throw new Error(`Sprite ${json.name} frame ${i}: expected ${size * bytesPerIndex} bytes, got ${bytes.length}`);
    }
    const indices = new Uint16Array(size);
    for (let p = 0; p < size; p++) {
      indices[p] = bytesPerIndex === 1 ? bytes[p]! : bytes[p * 2]! | (bytes[p * 2 + 1]! << 8);
    }
    return { delay: f.delay, indices };
  });
  return {
    name: json.name,
    width: json.width,
    height: json.height,
    palette: json.palette.map(hex),
    transparent: json.transparent ?? -1,
    frames,
    duration: frames.reduce((sum, f) => sum + f.delay, 0),
  };
}

/** Frame index to show `elapsedMs` after the animation started. */
export function frameAt(sprite: Sprite, elapsedMs: number, loop = true): number {
  const count = sprite.frames.length;
  if (count <= 1 || sprite.duration <= 0) return 0;
  let t = Math.max(0, elapsedMs);
  if (loop) t %= sprite.duration;
  else if (t >= sprite.duration) return count - 1;
  for (let i = 0; i < count; i++) {
    t -= sprite.frames[i]!.delay;
    if (t < 0) return i;
  }
  return count - 1;
}
