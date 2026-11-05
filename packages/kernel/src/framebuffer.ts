import { type Color, toHex } from './color';

export const SCREEN_WIDTH = 32;
export const SCREEN_HEIGHT = 32;

/** A width x height grid of packed 0xRRGGBB colors. Out-of-bounds writes are ignored. */
export class Framebuffer {
  readonly pixels: Uint32Array;

  constructor(
    readonly width = SCREEN_WIDTH,
    readonly height = SCREEN_HEIGHT,
  ) {
    this.pixels = new Uint32Array(width * height);
  }

  fill(color: Color): void {
    this.pixels.fill(color);
  }

  set(x: number, y: number, color: Color): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[(y | 0) * this.width + (x | 0)] = color;
  }

  get(x: number, y: number): Color {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.pixels[(y | 0) * this.width + (x | 0)]!;
  }

  copyFrom(other: Framebuffer): void {
    this.pixels.set(other.pixels);
  }

  equals(other: Framebuffer): boolean {
    const a = this.pixels;
    const b = other.pixels;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  clone(): Framebuffer {
    const fb = new Framebuffer(this.width, this.height);
    fb.copyFrom(this);
    return fb;
  }

  /** Write RGBA8 bytes (alpha = 255), e.g. into a texture upload buffer. */
  writeRGBA(out: Uint8Array | Uint8ClampedArray): void {
    const px = this.pixels;
    for (let i = 0, j = 0; i < px.length; i++, j += 4) {
      const c = px[i]!;
      out[j] = (c >> 16) & 0xff;
      out[j + 1] = (c >> 8) & 0xff;
      out[j + 2] = c & 0xff;
      out[j + 3] = 255;
    }
  }

  /** Row-major `rrggbb` string (no `#`), handy for snapshots and fixtures. */
  toHexString(): string {
    let s = '';
    for (const c of this.pixels) s += toHex(c).slice(1);
    return s;
  }
}
