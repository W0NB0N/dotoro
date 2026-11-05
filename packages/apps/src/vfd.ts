import { channelDistance, type Color, hex, type Sprite } from '@dotoro/kernel';

/**
 * Named colors of the vacuum-fluorescent display used by the Pomodoro/clock faces.
 * Artwork (template + headers) is mapped onto these roles, so a theme can recolor the
 * whole display by supplying a different palette.
 */
export interface VfdPalette {
  off: Color;
  chrome: Color;
  chromeDim: Color;
  shadow: Color;
  unlitCore: Color;
  unlitGlow: Color;
  litCore: Color;
  litGlow: Color;
  colonLit: Color;
  indicatorLit: Color;
  indicatorGlow: Color;
  progressFill: Color;
  progressUnlit: Color;
  headerLit: Color;
  headerDim: Color;
  headerUnlit: Color;
}

export type VfdRole = keyof VfdPalette;

function definePalette(src: Record<VfdRole, string>): VfdPalette {
  const out = {} as VfdPalette;
  for (const k of Object.keys(src) as VfdRole[]) out[k] = hex(src[k]);
  return out;
}

/** The prototype's ice-blue/amber VFD. */
export const DEFAULT_VFD: VfdPalette = definePalette({
  off: '#000000',
  chrome: '#291b01',
  chromeDim: '#1f1400',
  shadow: '#080908',
  unlitCore: '#252525',
  unlitGlow: '#121212',
  litCore: '#a5c9ff',
  litGlow: '#355283',
  colonLit: '#a5c9ff',
  indicatorLit: '#ff5f00',
  indicatorGlow: '#722a01',
  progressFill: '#732a00',
  progressUnlit: '#212020',
  headerLit: '#f5731f',
  headerDim: '#722a01',
  headerUnlit: '#202021',
});

/** Roles that body artwork pixels may be classified as. */
export const BODY_ROLES: readonly VfdRole[] = [
  'off', 'chrome', 'chromeDim', 'shadow', 'unlitCore', 'unlitGlow',
  'litCore', 'litGlow', 'headerLit', 'headerDim', 'headerUnlit',
];

/** Header strips only use the header colors; faint near-black pixels collapse to `off`. */
export const HEADER_ROLES: readonly VfdRole[] = ['off', 'headerLit', 'headerDim', 'headerUnlit'];

/** Artwork colors further than this from every role keep their original color. */
const MAX_ROLE_DISTANCE = 24;

/**
 * Classify each palette entry of `sprite` as the nearest VFD role (against DEFAULT_VFD),
 * returning a function that produces a recolored palette for any VfdPalette.
 */
export function bindVfdRoles(
  sprite: Sprite,
  candidates: readonly VfdRole[] = BODY_ROLES,
): (palette: VfdPalette) => Color[] {
  const roles = sprite.palette.map((color) => {
    let best: VfdRole | null = null;
    let bestDistance = Infinity;
    for (const role of candidates) {
      const d = channelDistance(color, DEFAULT_VFD[role]);
      if (d < bestDistance) {
        bestDistance = d;
        best = role;
      }
    }
    return bestDistance <= MAX_ROLE_DISTANCE ? best : null;
  });
  const cache = new WeakMap<VfdPalette, Color[]>();
  return (palette) => {
    let mapped = cache.get(palette);
    if (!mapped) {
      mapped = sprite.palette.map((original, i) => {
        const role = roles[i];
        return role ? palette[role] : original;
      });
      cache.set(palette, mapped);
    }
    return mapped;
  };
}

// ---------------------------------------------------------------------------- 7-segment digits

type Pt = readonly [number, number];
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

/** Origin of each MM:SS digit slot on the 32x32 screen. */
export const SLOT_COORDS: readonly Pt[] = [[0, 9], [7, 9], [19, 9], [26, 9]];

/** Per-segment filament (`core`) and inner tube `glow` pixels, relative to a slot origin. */
export const SEGMENTS: Record<string, { core: Pt[]; glow: Pt[] }> = {
  a: { core: range(1, 5).map((x) => [x, 0] as Pt), glow: [[2, 1], [3, 1]] },
  b: { core: range(1, 6).map((y) => [5, y] as Pt), glow: range(2, 6).map((y) => [4, y] as Pt) },
  c: { core: range(7, 12).map((y) => [5, y] as Pt), glow: range(7, 11).map((y) => [4, y] as Pt) },
  d: { core: range(1, 5).map((x) => [x, 12] as Pt), glow: [[2, 11], [3, 11]] },
  e: { core: range(7, 12).map((y) => [0, y] as Pt), glow: range(7, 11).map((y) => [1, y] as Pt) },
  f: { core: range(1, 6).map((y) => [0, y] as Pt), glow: range(2, 6).map((y) => [1, y] as Pt) },
  g: { core: [[2, 6], [3, 6]], glow: [] },
};

export const DIGIT_SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

/** Top-left of each 2x2 colon dot. */
export const COLON_DOTS: readonly Pt[] = [[15, 12], [15, 17]];

/** Top-left of the 3x3 "running" indicator (cross with glowing corners). */
export const INDICATOR: Pt = [24, 27];

/** Bottom progress bar pixels in fill order (16 total). */
export const PROGRESS_PIXELS: readonly Pt[] = [
  [0, 28],
  [2, 28], [3, 28],
  [5, 28], [6, 28],
  [8, 28], [9, 28],
  [11, 28], [12, 28],
  [14, 28], [15, 28],
  [17, 28], [18, 28], [19, 28],
  [18, 27], [18, 29],
];
