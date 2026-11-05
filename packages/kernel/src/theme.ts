import { type Color, hex } from './color';

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

export interface Theme {
  id: string;
  name: string;
  screen: ScreenPalette;
  ambient: AmbientStyle;
}

interface ThemeSource {
  id: string;
  name: string;
  screen: Record<PaletteRole, string>;
  ambient: AmbientStyle;
}

function defineTheme(src: ThemeSource): Theme {
  const screen = {} as ScreenPalette;
  for (const role of Object.keys(src.screen) as PaletteRole[]) screen[role] = hex(src.screen[role]);
  return { id: src.id, name: src.name, screen, ambient: src.ambient };
}

// Ported 1:1 from the prototype's core/themes.py (same order: the Themes app lists them in this order).
export const THEMES: readonly Theme[] = [
  defineTheme({
    id: 'cyberpunk',
    name: 'Cyberpunk',
    screen: { background: '#120458', foreground: '#00f0ff', accent: '#ff0099', secondary: '#7000ff', success: '#00ff9f', warning: '#ffbf00', danger: '#ff0000' },
    ambient: { background: '#0a0220', accent: '#ff0099', screenGlow: '#ff0099', scene: 'cyberpunk_city' },
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
