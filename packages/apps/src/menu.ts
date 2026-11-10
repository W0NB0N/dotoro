import { type AppCategory, type AppDefinition, FONT_3X5, type Gfx, type ScreenPalette } from '@dotoro/kernel';
import { BAR_HEIGHT, drawIcon, slideOffset, titleBar } from './chrome';
import { glitch, hasHud, scanlines } from './hud';
import { BLANK_ICON } from './icons';

interface Shelf {
  id: AppCategory;
  title: string;
  apps: AppDefinition[];
}

interface MenuState {
  shelf: AppCategory;
  /** Which app each shelf was left on. */
  cursor: Partial<Record<AppCategory, number>>;
}

const SHELVES: readonly { id: AppCategory; title: string }[] = [
  { id: 'games', title: 'GAMES' },
  { id: 'tools', title: 'TOOLS' },
];

const ICON_X = 8;
const ICON_Y = 8;
const ICON_SIZE = 16;
/** Close enough that the neighbouring icons peek in at both edges. */
const SPACING = 19;
const NEIGHBOUR_DIM = 0.55;
const LABEL_Y = 25;
const BODY_HEIGHT = 32 - BAR_HEIGHT;
const SLIDE_MS = 140;
const ICON_FRAME_MS = 500;

/** Up to this many ticks fit along the bottom row. */
const MAX_TICKS = 10;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Home screen: apps on shelves. Left/right turns the carousel, up/down changes shelf, enter opens.
 * Each shelf remembers its place.
 */
export const menuApp: AppDefinition = {
  id: 'menu',
  title: 'Menu',
  hints: [
    { keys: ['left', 'right'], action: 'browse' },
    { keys: ['up', 'down'], action: 'shelf' },
    { keys: ['enter'], action: 'open' },
  ],
  create(ctx) {
    const saved = ctx.savedState<Partial<MenuState>>();
    const cursor: MenuState['cursor'] = { ...saved?.cursor };
    // The timer is what most people came for, so a new device opens on Tools.
    let shelfId: AppCategory = saved?.shelf ?? 'tools';
    let selectedAt = ctx.now();
    let slideX = 0;
    let slideY = 0;
    let slideAt = -Infinity;
    let leaving: Shelf | null = null;

    const shelves = (): Shelf[] => {
      const apps = ctx.system.menuApps();
      return SHELVES.map((s) => ({ ...s, apps: apps.filter((a) => (a.category ?? 'tools') === s.id) })).filter((s) => s.apps.length > 0);
    };
    const currentOf = (list: Shelf[]) => list.find((s) => s.id === shelfId) ?? list[0];
    const positionOf = (shelf: Shelf) => Math.min(cursor[shelf.id] ?? 0, shelf.apps.length - 1);
    /** With fewer than three apps a carousel would show the same icon on both sides. */
    const wraps = (shelf: Shelf) => shelf.apps.length >= 3;

    const browse = (shelf: Shelf, dir: -1 | 1, now: number) => {
      const n = shelf.apps.length;
      const from = positionOf(shelf);
      const to = wraps(shelf) ? mod(from + dir, n) : from + dir;
      if (to < 0 || to >= n) return;
      cursor[shelf.id] = to;
      selectedAt = now;
      slideX = dir * SPACING;
      slideY = 0;
      slideAt = now;
      leaving = null;
      ctx.audio.play('blip');
    };

    const changeShelf = (list: Shelf[], shelf: Shelf, dir: -1 | 1, now: number) => {
      if (list.length < 2) return;
      const next = list[mod(list.indexOf(shelf) + dir, list.length)]!;
      shelfId = next.id;
      selectedAt = now;
      slideX = 0;
      slideY = dir * BODY_HEIGHT;
      slideAt = now;
      leaving = shelf;
      ctx.audio.play('blip');
    };

    const drawShelf = (g: Gfx, shelf: Shelf, palette: ScreenPalette, now: number, offsetX: number, offsetY: number) => {
      const n = shelf.apps.length;
      const position = positionOf(shelf);
      const frameTick = Math.floor(now / ICON_FRAME_MS);
      for (let k = -2; k <= 2; k++) {
        let index = position + k;
        if (wraps(shelf)) index = mod(index, n);
        else if (index < 0 || index >= n) continue;
        const x = ICON_X + k * SPACING + offsetX;
        if (x <= -ICON_SIZE || x >= g.width) continue;
        const centred = Math.abs(x - ICON_X) < 4;
        drawIcon(g, shelf.apps[index]!.icon ?? BLANK_ICON, centred ? frameTick : 0, x, ICON_Y + offsetY, palette, centred ? 0 : NEIGHBOUR_DIM);
      }

      g.marquee(shelf.apps[position]!.title.toUpperCase(), 0, LABEL_Y + offsetY, g.width, palette.foreground, FONT_3X5, now - selectedAt);

      if (n > 1 && n <= MAX_TICKS) {
        const startX = Math.floor((g.width - (n * 3 - 1)) / 2);
        for (let i = 0; i < n; i++) g.fillRect(startX + i * 3, 31 + offsetY, 2, 1, i === position ? palette.accent : palette.secondary);
      }
    };

    return {
      onEnter() {
        selectedAt = ctx.now();
        slideAt = -Infinity;
        leaving = null;
      },

      onInput({ button, kind }) {
        if (kind === 'release') return;
        const list = shelves();
        const shelf = currentOf(list);
        if (!shelf) return;
        const now = ctx.now();
        if (button === 'left' || button === 'right') {
          browse(shelf, button === 'left' ? -1 : 1, now);
        } else if ((button === 'up' || button === 'down') && kind === 'press') {
          changeShelf(list, shelf, button === 'up' ? -1 : 1, now);
        } else if (button === 'enter' && kind === 'press') {
          const app = shelf.apps[positionOf(shelf)];
          if (!app) return;
          ctx.audio.play('select');
          ctx.launch(app.id);
        }
      },

      render(g) {
        const list = shelves();
        const shelf = currentOf(list);
        if (!shelf) return;
        const theme = ctx.theme;
        const palette = theme.screen;
        const now = ctx.now();
        const hud = hasHud(theme);
        if (hud) scanlines(g, theme);

        const x = slideOffset(slideX, now - slideAt, SLIDE_MS);
        const y = slideOffset(slideY, now - slideAt, SLIDE_MS);
        if (y !== 0 && leaving) drawShelf(g, leaving, palette, now, 0, y - Math.sign(y) * BODY_HEIGHT);
        drawShelf(g, shelf, palette, now, x, y);

        // Last, so a shelf sliding out goes behind it.
        titleBar(g, palette, shelf.title, list.length > 1);
        if (hud) glitch(g, theme, now, selectedAt, list.indexOf(shelf));
      },

      save: (): MenuState => ({ shelf: shelfId, cursor }),
    };
  },
};
