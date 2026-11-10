import { type AppIcon, type Color, FONT_3X5, type Gfx, mix, type PaletteRole, type ScreenPalette } from '@dotoro/kernel';

/**
 * The look shared by the system screens: an inverted title bar like the handheld organisers and
 * consoles of the 90s, chunky arrows, and icons painted from the theme's palette.
 */

/** Rows taken by the title bar. Screen content starts below it. */
export const BAR_HEIGHT = 7;

const ICON_ROLES: Readonly<Record<string, PaletteRole>> = {
  f: 'foreground',
  a: 'accent',
  s: 'secondary',
  g: 'success',
  w: 'warning',
  d: 'danger',
  b: 'background',
};

/** Every character an icon row may use: '.' for clear, the rest name a palette role. */
export const ICON_CHARS = `.${Object.keys(ICON_ROLES).join('')}`;

/** Draws one frame of an icon. `dim` in [0, 1] fades it toward the background. */
export function drawIcon(g: Gfx, icon: AppIcon, frame: number, x: number, y: number, palette: ScreenPalette, dim = 0): void {
  const rows = icon.frames[frame % icon.frames.length]!;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const role = ICON_ROLES[row[c]!];
      if (role) g.pixel(x + c, y + r, dim > 0 ? mix(palette[role], palette.background, dim) : palette[role]);
    }
  });
}

/** Inverted title bar across the top. `scroll` adds the up/down arrows that mean "more shelves". */
export function titleBar(g: Gfx, palette: ScreenPalette, title: string, scroll = false): void {
  g.fillRect(0, 0, g.width, BAR_HEIGHT, palette.accent);
  g.text(title, 2, 1, palette.background, FONT_3X5);
  if (!scroll) return;
  const x = g.width - 5;
  g.pixel(x + 1, 1, palette.background);
  g.fillRect(x, 2, 3, 1, palette.background);
  g.fillRect(x, 4, 3, 1, palette.background);
  g.pixel(x + 1, 5, palette.background);
}

/** A 3x5 solid triangle pointing left (`dir` -1) or right (1), at the given top-left corner. */
export function arrow(g: Gfx, x: number, y: number, dir: -1 | 1, color: Color): void {
  for (let i = 0; i < 3; i++) {
    const column = dir < 0 ? x + i : x + 2 - i;
    g.fillRect(column, y + 2 - i, 1, 1 + i * 2, color);
  }
}

/** Ease-out from `from` to 0 over `duration` ms; the integer offset of a slide still in progress. */
export function slideOffset(from: number, elapsed: number, duration: number): number {
  if (elapsed >= duration || elapsed < 0) return 0;
  const left = 1 - elapsed / duration;
  return Math.round(from * left * left);
}
