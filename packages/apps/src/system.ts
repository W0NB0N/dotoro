import { type AppDefinition, FONT_3X5, FONT_5X7, frameAt, type Gfx, type Color, measureText } from '@dotoro/kernel';
import { GALLERY, SPRITES } from './assets';
import { fringeFor, glitch, hasHud, hudFrame, scanlines } from './hud';

/** Pagination dots centred at the bottom of the screen. */
function drawDots(g: Gfx, count: number, selected: number, w: number, on: Color, off: Color): void {
  const spacing = 2;
  const total = count * (w + spacing) - spacing;
  const startX = Math.floor((g.width - total) / 2);
  for (let i = 0; i < count; i++) g.fillRect(startX + i * (w + spacing), 26, w, 2, i === selected ? on : off);
}

/** Plays the boot animation, then the boot chime, then opens the menu. */
export const bootApp: AppDefinition = {
  id: 'boot',
  title: 'Boot',
  create(ctx) {
    let startedAt = ctx.now();
    let done = false;
    return {
      onEnter() {
        startedAt = ctx.now();
        done = false;
      },
      update() {
        if (!done && ctx.now() - startedAt >= SPRITES.boot.duration) {
          done = true;
          ctx.audio.play('boot');
          ctx.home();
        }
      },
      render(g) {
        g.sprite(SPRITES.boot, frameAt(SPRITES.boot, ctx.now() - startedAt, false), 0, 0);
      },
    };
  },
};

/** Home screen: one app per page, left/right to browse, enter to open. */
export const menuApp: AppDefinition = {
  id: 'menu',
  title: 'Menu',
  create(ctx) {
    let index = ctx.savedState<{ index: number }>()?.index ?? 0;
    let selectedAt = ctx.now();
    return {
      onEnter() {
        selectedAt = ctx.now();
      },
      onInput({ button, kind }) {
        if (kind === 'release') return;
        const apps = ctx.system.menuApps();
        if (button === 'left' || button === 'right') {
          const next = Math.min(apps.length - 1, Math.max(0, index + (button === 'left' ? -1 : 1)));
          if (next !== index) {
            index = next;
            selectedAt = ctx.now();
          }
        } else if (button === 'enter' && kind === 'press') {
          const app = apps[index];
          if (app) ctx.launch(app.id);
        }
      },
      render(g) {
        const apps = ctx.system.menuApps();
        if (apps.length === 0) return;
        index = Math.min(index, apps.length - 1);
        const app = apps[index]!;
        const theme = ctx.theme;
        const palette = theme.screen;
        const color = palette[app.menuColor ?? 'accent'];
        const now = ctx.now();
        if (!hasHud(theme)) {
          if (app.menuLines) {
            app.menuLines.forEach((line, i) => g.textCentered(line, 7 + i * 8, color, FONT_5X7));
          } else {
            g.marquee(app.title.toUpperCase(), 0, 12, g.width, color, FONT_5X7, now - selectedAt);
          }
          drawDots(g, apps.length, index, 3, palette.foreground, palette.secondary);
          return;
        }
        // HUD: scanlines behind, the title with a chromatic fringe, brackets on top, and a tear
        // through the screen whenever the selection moves.
        scanlines(g, theme);
        const fringe = fringeFor(theme, color);
        if (app.menuLines) {
          app.menuLines.forEach((line, i) => {
            const x = Math.floor((g.width - measureText(line, FONT_5X7)) / 2);
            g.text(line, x - 1, 7 + i * 8, fringe, FONT_5X7);
            g.text(line, x, 7 + i * 8, color, FONT_5X7);
          });
        } else {
          const title = app.title.toUpperCase();
          g.marquee(title, -1, 12, g.width, fringe, FONT_5X7, now - selectedAt);
          g.marquee(title, 0, 12, g.width, color, FONT_5X7, now - selectedAt);
        }
        drawDots(g, apps.length, index, 3, palette.accent, palette.secondary);
        hudFrame(g, theme, now);
        glitch(g, theme, now, selectedAt, index);
      },
      save: () => ({ index }),
    };
  },
};

/** Theme picker: previews each theme in its own colors; enter applies it. */
export const themesApp: AppDefinition = {
  id: 'themes',
  title: 'Theme',
  showInMenu: true,
  menuColor: 'warning',
  create(ctx) {
    let index = 0;
    let selectedAt = ctx.now();
    const themes = () => ctx.system.themes();
    return {
      onEnter() {
        index = Math.max(0, themes().findIndex((t) => t.id === ctx.theme.id));
        selectedAt = ctx.now();
      },
      onInput({ button, kind }) {
        if (kind === 'release') return;
        const list = themes();
        if (button === 'left' || button === 'right') {
          const next = Math.min(list.length - 1, Math.max(0, index + (button === 'left' ? -1 : 1)));
          if (next !== index) {
            index = next;
            selectedAt = ctx.now();
          }
        } else if (button === 'enter' && kind === 'press') {
          const theme = list[index];
          if (theme) ctx.system.setTheme(theme.id);
          ctx.home();
        }
      },
      render(g) {
        const list = themes();
        const preview = list[index];
        if (!preview) return;
        const p = preview.screen;
        const now = ctx.now();
        g.clear(p.background);
        if (hasHud(preview)) {
          // Previewed in its own dress, not just its own colors.
          scanlines(g, preview);
          g.textCentered('THEME', 4, p.foreground, FONT_3X5);
          const name = preview.name.toUpperCase();
          g.marquee(name, -1, 13, g.width, fringeFor(preview, p.accent), FONT_5X7, now - selectedAt);
          g.marquee(name, 0, 13, g.width, p.accent, FONT_5X7, now - selectedAt);
          drawDots(g, list.length, index, 2, p.accent, p.secondary);
          hudFrame(g, preview, now);
          glitch(g, preview, now, selectedAt, index);
          return;
        }
        g.textCentered('THEME', 4, p.secondary, FONT_3X5);
        g.marquee(preview.name.toUpperCase(), 0, 13, g.width, p.accent, FONT_5X7, now - selectedAt);
        drawDots(g, list.length, index, 2, p.foreground, p.secondary);
      },
    };
  },
};

/** Pixel-art viewer for still images and animations. */
export const galleryApp: AppDefinition = {
  id: 'gallery',
  title: 'Gallery',
  showInMenu: true,
  menuColor: 'success',
  create(ctx) {
    let index = Math.min(ctx.savedState<{ index: number }>()?.index ?? 0, GALLERY.length - 1);
    let shownAt = ctx.now();
    return {
      onEnter() {
        shownAt = ctx.now();
      },
      onInput({ button, kind }) {
        if (kind === 'release') return;
        if (button !== 'left' && button !== 'right') return;
        const next = Math.min(GALLERY.length - 1, Math.max(0, index + (button === 'left' ? -1 : 1)));
        if (next !== index) {
          index = next;
          shownAt = ctx.now();
        }
      },
      render(g) {
        const sprite = GALLERY[index];
        if (!sprite) return;
        g.sprite(sprite, frameAt(sprite, ctx.now() - shownAt), 0, 0);
      },
      save: () => ({ index }),
    };
  },
};
