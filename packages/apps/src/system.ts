import { type AppDefinition, FONT_3X5, FONT_5X7, frameAt, ICONS } from '@dotoro/kernel';
import { GALLERY, SPRITES } from './assets';
import { arrow, slideOffset, titleBar } from './chrome';
import { fringeFor, glitch, hasHud, scanlines } from './hud';
import { GALLERY_ICON, THEMES_ICON } from './icons';

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

const SWATCHES = ['accent', 'secondary', 'success', 'warning', 'danger'] as const;
const CAPTION_MS = 2600;
const CAPTION_SLIDE_MS = 120;
const CAPTION_HEIGHT = 7;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Theme picker: previews each theme in its own colors; enter applies it. */
export const themesApp: AppDefinition = {
  id: 'themes',
  title: 'Theme',
  showInMenu: true,
  category: 'tools',
  icon: THEMES_ICON,
  hints: [
    { keys: ['left', 'right'], action: 'browse' },
    { keys: ['enter'], action: 'apply' },
  ],
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
          index = mod(index + (button === 'left' ? -1 : 1), list.length);
          selectedAt = ctx.now();
          ctx.audio.play('blip');
        } else if (button === 'enter' && kind === 'press') {
          const theme = list[index];
          ctx.audio.play('select');
          if (theme) ctx.system.setTheme(theme.id);
          ctx.home();
        }
      },
      render(g) {
        const preview = themes()[index];
        if (!preview) return;
        const p = preview.screen;
        const now = ctx.now();
        const hud = hasHud(preview);
        g.clear(p.background);
        if (hud) scanlines(g, preview);
        titleBar(g, p, 'THEME');

        const name = preview.name.toUpperCase();
        if (hud) g.marquee(name, -1, 9, g.width, fringeFor(preview, p.accent), FONT_5X7, now - selectedAt);
        g.marquee(name, 0, 9, g.width, p.accent, FONT_5X7, now - selectedAt);

        SWATCHES.forEach((role, i) => g.fillRect(6 + i * 4, 18, 4, 5, p[role]));
        arrow(g, 1, 18, -1, p.foreground);
        arrow(g, 28, 18, 1, p.foreground);

        if (preview.id === ctx.theme.id) {
          g.bitmap(ICONS.CHECK!, 8, 25, p.success);
          g.text('ON', 15, 25, p.foreground, FONT_3X5);
        } else if (Math.floor(now / 500) % 2 === 0) {
          g.textCentered('APPLY', 25, p.foreground, FONT_3X5);
        }
        if (hud) glitch(g, preview, now, selectedAt, index);
      },
    };
  },
};

/** Pixel-art viewer for still images and animations. The name appears briefly on each change. */
export const galleryApp: AppDefinition = {
  id: 'gallery',
  title: 'Gallery',
  showInMenu: true,
  category: 'tools',
  icon: GALLERY_ICON,
  hints: [{ keys: ['left', 'right'], action: 'browse' }],
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
        index = mod(index + (button === 'left' ? -1 : 1), GALLERY.length);
        shownAt = ctx.now();
        ctx.audio.play('blip');
      },
      render(g) {
        const sprite = GALLERY[index];
        if (!sprite) return;
        const elapsed = ctx.now() - shownAt;
        g.sprite(sprite, frameAt(sprite, elapsed), 0, 0);
        if (elapsed >= CAPTION_MS) return;

        const p = ctx.theme.screen;
        const hidden = elapsed > CAPTION_MS - CAPTION_SLIDE_MS ? CAPTION_SLIDE_MS - (CAPTION_MS - elapsed) : 0;
        const y = g.height - CAPTION_HEIGHT + slideOffset(CAPTION_HEIGHT, elapsed, CAPTION_SLIDE_MS) + Math.round((hidden / CAPTION_SLIDE_MS) * CAPTION_HEIGHT);
        g.fillRect(0, y, g.width, CAPTION_HEIGHT, p.accent);
        arrow(g, 0, y + 1, -1, p.background);
        arrow(g, 29, y + 1, 1, p.background);
        g.marquee(sprite.name.toUpperCase(), 4, y + 1, 24, p.background, FONT_3X5, elapsed);
      },
      save: () => ({ index }),
    };
  },
};
