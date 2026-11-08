import { type Color, hex } from './color';
import type { TransitionKind } from './transitions';

/** Semantic colors apps draw with. Apps never hard-code hex for themed UI. */
export interface ScreenPalette {
  background: Color;
  foreground: Color;
  accent: Color;
  secondary: Color;
  success: Color;
  warning: Color;
  danger: Color;
}

export type PaletteRole = keyof ScreenPalette;

/** Styling for the world around the device (consumed by the host, not the kernel). */
export interface AmbientStyle {
  background: string;
  accent: string;
  screenGlow: string;
  /** Environment/scene id the host should load for this theme. */
  scene: string;
}

/**
 * How a theme dresses the screen beyond its colors. Every field is optional: a theme without a
 * style renders exactly as the prototype did.
 */
export interface ThemeStyle {
  /** Scanlines, corner brackets, chromatic text and glitches on the system screens. */
  hud?: boolean;
  /** Transition between apps, unless the host chose one explicitly. */
  transition?: TransitionKind;
  /** Which timer-face palette apps should use (apps define the palettes). */
  vfd?: string;
  /** Which game-cartridge palette apps should use. */
  cartridge?: string;
}

export interface Theme {
  id: string;
  name: string;
  screen: ScreenPalette;
  ambient: AmbientStyle;
  style?: ThemeStyle;
}

interface ThemeSource {
  id: string;
  name: string;
  screen: Record<PaletteRole, string>;
  ambient: AmbientStyle;
  style?: ThemeStyle;
}

function defineTheme(src: ThemeSource): Theme {
  const screen = {} as ScreenPalette;
  for (const role of Object.keys(src.screen) as PaletteRole[]) screen[role] = hex(src.screen[role]);
  return { id: src.id, name: src.name, screen, ambient: src.ambient, ...(src.style ? { style: src.style } : {}) };
}

// Ported 1:1 from the prototype's core/themes.py (same order: the Themes app lists them in this order).
export const THEMES: readonly Theme[] = [
  // Matched to the rainy neon city behind the device: cyan tubes and hot pink on near-black violet.
  defineTheme({
    id: 'cyberpunk',
    name: 'Cyberpunk',
    screen: { background: '#0a0818', foreground: '#2fe0f0', accent: '#ff3fa8', secondary: '#3a2a88', success: '#55fe9a', warning: '#ffb030', danger: '#ff3050' },
    ambient: { background: '#0a0818', accent: '#ff3fa8', screenGlow: '#2fe0f0', scene: 'cyberpunk_city' },
    style: { hud: true, transition: 'glitch', vfd: 'neon', cartridge: 'neon' },
  }),
  defineTheme({
    id: 'forest',
    name: 'Forest',
    screen: { background: '#0c1a11', foreground: '#d1e8d6', accent: '#4caf50', secondary: '#2e7d32', success: '#aeea00', warning: '#ffc107', danger: '#e53935' },
    ambient: { background: '#050e06', accent: '#4caf50', screenGlow: '#8bc34a', scene: 'forest_rain' },
  }),
  defineTheme({
    id: 'retrowave',
    name: 'Retrowave',
    screen: { background: '#241734', foreground: '#fdfdfd', accent: '#ff71ce', secondary: '#01cdfe', success: '#05ffa1', warning: '#b967ff', danger: '#ff0000' },
    ambient: { background: '#12001f', accent: '#ff71ce', screenGlow: '#01cdfe', scene: 'synthwave_grid' },
  }),
  defineTheme({
    id: 'minimal',
    name: 'Minimal',
    screen: { background: '#111111', foreground: '#eeeeee', accent: '#888888', secondary: '#444444', success: '#ffffff', warning: '#cccccc', danger: '#555555' },
    ambient: { background: '#000000', accent: '#ffffff', screenGlow: '#ffffff', scene: 'minimal_noise' },
  }),
  defineTheme({
    id: 'ocean',
    name: 'Ocean',
    screen: { background: '#001e36', foreground: '#d4f1f9', accent: '#00b4d8', secondary: '#0077b6', success: '#48cae4', warning: '#90e0ef', danger: '#03045e' },
    ambient: { background: '#001220', accent: '#00b4d8', screenGlow: '#00b4d8', scene: 'underwater' },
  }),
  defineTheme({
    id: 'catppuccin',
    name: 'Catppuccin',
    screen: { background: '#1e1e2e', foreground: '#cdd6f4', accent: '#89b4fa', secondary: '#cba6f7', success: '#a6e3a1', warning: '#f9e2af', danger: '#f38ba8' },
    ambient: { background: '#181825', accent: '#89b4fa', screenGlow: '#89b4fa', scene: 'mocha_mountains' },
  }),
];

export const DEFAULT_THEME_ID = 'catppuccin';
