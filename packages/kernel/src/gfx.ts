import type { Bitmap } from './bitmap';
import type { Color } from './color';
import { type Font, LETTER_SPACING, measureText } from './font';
import type { Framebuffer } from './framebuffer';
import type { Sprite } from './sprite';

export interface MarqueeOptions {
  /** Scroll speed in pixels per second. Default 12. */
  speed?: number;
  /** Hold the start position this long before scrolling, in ms. Default 800. */
  hold?: number;
  /** Blank gap between the end of the text and its repeat, in px. Default 12. */
  gap?: number;
  /** Alignment when the text fits without scrolling. Default 'center'. */
  align?: 'left' | 'center';
}

export interface SpriteDrawOptions {
  /** Integer scale. 'auto' doubles 16x16 sprites on a 32x32 screen (prototype behaviour). */
  scale?: number | 'auto';
  /** Replace palette colors (same length as the sprite palette). */
  palette?: readonly Color[];
  /** Source rectangle in sprite pixels. Defaults to the full sprite. */
  src?: { x: number; y: number; w: number; h: number };
}

/** Drawing API handed to apps. All coordinates are integer screen pixels. */
export class Gfx {
  constructor(readonly fb: Framebuffer) {}

  get width(): number {
    return this.fb.width;
  }
  get height(): number {
    return this.fb.height;
  }

  clear(color: Color): void {
    this.fb.fill(color);
  }

  pixel(x: number, y: number, color: Color): void {
    this.fb.set(x, y, color);
  }

  fillRect(x: number, y: number, w: number, h: number, color: Color): void {
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) this.fb.set(x + c, y + r, color);
  }

  strokeRect(x: number, y: number, w: number, h: number, color: Color): void {
    this.line(x, y, x + w - 1, y, color);
    this.line(x, y + h - 1, x + w - 1, y + h - 1, color);
    this.line(x, y, x, y + h - 1, color);
    this.line(x + w - 1, y, x + w - 1, y + h - 1, color);
  }

  /** Bresenham line, inclusive of both end points. */
  line(x1: number, y1: number, x2: number, y2: number, color: Color): void {
    const dx = Math.abs(x2 - x1);
    const dy = -Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    let x = x1;
    let y = y1;
    for (;;) {
      this.fb.set(x, y, color);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Draw the set bits of a 1-bit mask, optionally clipped to columns [clipX0, clipX1). */
  bitmap(bmp: Bitmap, x: number, y: number, color: Color, clipX0 = -Infinity, clipX1 = Infinity): void {
    for (let r = 0; r < bmp.height; r++) {
      for (let c = 0; c < bmp.width; c++) {
        if (!bmp.bits[r * bmp.width + c]) continue;
        const px = x + c;
        if (px < clipX0 || px >= clipX1) continue;
        this.fb.set(px, y + r, color);
      }
    }
  }

  /** Draw text left-aligned at (x, y). Returns the x just past the last glyph. */
  text(text: string, x: number, y: number, color: Color, font: Font, clipX0?: number, clipX1?: number): number {
    let cursor = x;
    for (const ch of text) {
      const g = font.glyph(ch);
      this.bitmap(g, cursor, y, color, clipX0, clipX1);
      cursor += g.width + LETTER_SPACING;
    }
    return cursor;
  }

  /** Draw text horizontally centred on the screen. */
  textCentered(text: string, y: number, color: Color, font: Font): void {
    this.text(text, Math.floor((this.width - measureText(text, font)) / 2), y, color, font);
  }

  /**
   * Text clipped to the window [x, x + width). If it fits it is drawn statically;
   * otherwise it holds, then scrolls right-to-left in a seamless loop.
   * `elapsedMs` is the time since the text first appeared (e.g. since selection changed).
   */
  marquee(
    text: string,
    x: number,
    y: number,
    width: number,
    color: Color,
    font: Font,
    elapsedMs: number,
    options: MarqueeOptions = {},
  ): void {
    const { speed = 12, hold = 800, gap = 12, align = 'center' } = options;
    const textWidth = measureText(text, font);
    if (textWidth <= width) {
      const startX = align === 'center' ? x + Math.floor((width - textWidth) / 2) : x;
      this.text(text, startX, y, color, font);
      return;
    }
    const period = textWidth + gap;
    const scrollMs = Math.max(0, elapsedMs - hold);
    const offset = Math.floor((scrollMs / 1000) * speed) % period;
    const clip1 = x + width;
    this.text(text, x - offset, y, color, font, x, clip1);
    this.text(text, x - offset + period, y, color, font, x, clip1);
  }

  /** Horizontal 1px progress bar. */
  progressBar(x: number, y: number, width: number, progress: number, fg: Color, bg: Color): void {
    this.line(x, y, x + width - 1, y, bg);
    const fill = Math.floor(width * Math.max(0, Math.min(1, progress)));
    if (fill > 0) this.line(x, y, x + fill - 1, y, fg);
  }

  sprite(sprite: Sprite, frameIndex: number, x: number, y: number, options: SpriteDrawOptions = {}): void {
    const frame = sprite.frames[frameIndex] ?? sprite.frames[0];
    if (!frame) return;
    const scale =
      options.scale === undefined || options.scale === 'auto'
        ? sprite.width * 2 === this.width && sprite.height * 2 === this.height
          ? 2
          : 1
        : options.scale;
    const palette = options.palette ?? sprite.palette;
    const src = options.src ?? { x: 0, y: 0, w: sprite.width, h: sprite.height };
    for (let r = 0; r < src.h; r++) {
      for (let c = 0; c < src.w; c++) {
        const idx = frame.indices[(src.y + r) * sprite.width + (src.x + c)]!;
        if (idx === sprite.transparent) continue;
        const color = palette[idx] ?? 0;
        if (scale === 1) {
          this.fb.set(x + c, y + r, color);
        } else {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) this.fb.set(x + c * scale + dx, y + r * scale + dy, color);
        }
      }
    }
  }
}
