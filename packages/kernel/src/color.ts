/** A 24-bit color packed as 0xRRGGBB. */
export type Color = number;

export const BLACK: Color = 0x000000;
export const WHITE: Color = 0xffffff;

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

/** Parse `#rrggbb` (or `rrggbb`) into a packed color. Throws on malformed input. */
export function hex(value: string): Color {
  const match = HEX6.exec(value);
  if (!match) throw new Error(`Invalid color: ${value}`);
  return parseInt(match[1]!, 16);
}

export function toHex(color: Color): string {
  return '#' + (color & 0xffffff).toString(16).padStart(6, '0');
}

export function rgb(r: number, g: number, b: number): Color {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

export function red(c: Color): number {
  return (c >> 16) & 0xff;
}
export function green(c: Color): number {
  return (c >> 8) & 0xff;
}
export function blue(c: Color): number {
  return c & 0xff;
}

/** Linear blend from `a` to `b` by `t` in [0, 1]. */
export function mix(a: Color, b: Color, t: number): Color {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return rgb(
    Math.round(red(a) + (red(b) - red(a)) * k),
    Math.round(green(a) + (green(b) - green(a)) * k),
    Math.round(blue(a) + (blue(b) - blue(a)) * k),
  );
}

/** Largest per-channel difference between two colors (0..255). */
export function channelDistance(a: Color, b: Color): number {
  return Math.max(
    Math.abs(red(a) - red(b)),
    Math.abs(green(a) - green(b)),
    Math.abs(blue(a) - blue(b)),
  );
}
