import { type Bitmap, bitmapFromRows, emptyBitmap } from './bitmap';

export interface Font {
  readonly name: string;
  readonly height: number;
  /** Glyph lookup: exact upper-case, then as typed, then `?`, then space. Never throws. */
  glyph(char: string): Bitmap;
}

/** Spacing between glyphs, in pixels. */
export const LETTER_SPACING = 1;

export function defineFont(name: string, source: Record<string, readonly string[]>): Font {
  const glyphs = new Map<string, Bitmap>();
  let height = 0;
  let maxWidth = 0;
  for (const [key, rows] of Object.entries(source)) {
    const bmp = bitmapFromRows(rows);
    glyphs.set(key, bmp);
    height = Math.max(height, bmp.height);
    maxWidth = Math.max(maxWidth, bmp.width);
  }
  // The prototype's larger fonts had no space glyph (it rendered as '?'); give every font one.
  if (!glyphs.has(' ')) glyphs.set(' ', emptyBitmap(Math.ceil(maxWidth / 2), height));
  const space = glyphs.get(' ')!;

  return {
    name,
    height,
    glyph(char: string): Bitmap {
      return glyphs.get(char.toUpperCase()) ?? glyphs.get(char) ?? glyphs.get('?') ?? space;
    },
  };
}

/** Width in pixels of `text` when drawn with `font` (no trailing spacing). */
export function measureText(text: string, font: Font): number {
  if (text.length === 0) return 0;
  let width = 0;
  for (const ch of text) width += font.glyph(ch).width + LETTER_SPACING;
  return width - LETTER_SPACING;
}
