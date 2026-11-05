/** A 1-bit mask. `bits[y * width + x]` is 1 where the pixel is set. */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
}

/** Build a bitmap from rows like `['010', '111']`. Short rows are padded with 0. */
export function bitmapFromRows(rows: readonly string[]): Bitmap {
  const height = rows.length;
  const width = height > 0 ? rows[0]!.length : 0;
  const bits = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) bits[y * width + x] = row[x] === '1' ? 1 : 0;
  });
  return { width, height, bits };
}

export function emptyBitmap(width: number, height: number): Bitmap {
  return { width, height, bits: new Uint8Array(width * height) };
}

export function defineBitmaps<K extends string>(source: Record<K, readonly string[]>): Record<K, Bitmap> {
  const out = {} as Record<K, Bitmap>;
  for (const key of Object.keys(source) as K[]) out[key] = bitmapFromRows(source[key]);
  return out;
}
