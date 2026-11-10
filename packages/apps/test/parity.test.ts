/**
 * Replays the timeline recorded from the Python prototype (tools/parity/dump_python.py)
 * against the TypeScript kernel and compares every snapshot pixel by pixel.
 *
 * Intentional behaviour changes are listed in DEVIATIONS with the rows they affect;
 * those rows are excluded from the comparison and everything else must still match.
 * Set DOTORO_DUMP=1 to write side-by-side PNGs (Python | TypeScript) to test/__out__.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Button, channelDistance } from '@dotoro/kernel';
import { boot, writeFramePng } from './helpers';

interface Op {
  op: 'key' | 'snap';
  t: number;
  key?: string;
  name?: string;
  frame?: string;
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/python-parity.json', import.meta.url), 'utf8')) as {
  epochMs: number;
  timeline: Op[];
};

const KEYS: Record<string, Button> = {
  Boot: 'power',
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
  Enter: 'enter',
  Menu: 'menu',
};

/** The prototype's home screen, in order. */
const FLAT_MENU = ['pomodoro', 'snake', 'themes', 'gallery'];

/** Max per-channel difference tolerated (VFD artwork is quantised from noisy PNG exports). */
const TOLERANCE = 8;

const shelves = 'the home screen became icon shelves; test/apps.test.ts covers it';
const picker = 'the theme picker gained a title bar and swatches';
const caption = 'the gallery shows the name along the bottom for a moment';
const titleLoop = 'title loop animation phase starts when the screen opens';
/** The cyberpunk theme's background, in the prototype and now. */
const CYBERPUNK_BG: [string, string] = ['120458', '0a0818'];
const recolored = 'gallery art with transparent areas shows the redesigned cyberpunk background';

const DEVIATIONS: Record<string, { rows?: [number, number]; remap?: [string, string]; reason: string }> = {
  'menu.pomodoro': { rows: [0, 31], reason: shelves },
  'menu.snake': { rows: [0, 31], reason: shelves },
  'menu.theme': { rows: [0, 31], reason: shelves },
  'menu.gallery': { rows: [0, 31], reason: shelves },
  'menu.pomodoro.cyberpunk': { rows: [0, 31], reason: shelves },
  'themes.catppuccin': { rows: [0, 31], reason: picker },
  'themes.ocean': { rows: [0, 31], reason: picker },
  'themes.minimal': { rows: [0, 31], reason: picker },
  'themes.retrowave': { rows: [0, 31], reason: picker },
  'themes.forest': { rows: [0, 31], reason: picker },
  'themes.cyberpunk': { rows: [0, 31], reason: picker },
  'snake.start': { rows: [13, 15], reason: titleLoop },
  'snake.gameover': { rows: [13, 15], reason: titleLoop },
  'snake.alive.early': { rows: [6, 29], reason: 'first move waits one step; apple placement uses the seeded RNG' },
  // Under the cyberpunk theme, only the background color changed: map it and compare the rest.
  'gallery.0': { rows: [25, 31], remap: CYBERPUNK_BG, reason: `${recolored}; ${caption}` },
  'gallery.1': { rows: [25, 31], remap: CYBERPUNK_BG, reason: `${recolored}; ${caption}` },
  'gallery.2': { rows: [25, 31], remap: CYBERPUNK_BG, reason: `${recolored}; ${caption}` },
  'gallery.3': { rows: [25, 31], remap: CYBERPUNK_BG, reason: `${recolored}; ${caption}` },
  'gallery.4': { rows: [25, 31], remap: CYBERPUNK_BG, reason: `${recolored}; ${caption}` },
  'gallery.5': { rows: [25, 31], remap: CYBERPUNK_BG, reason: `${recolored}; ${caption}` },
};

function diff(expected: string, actual: string, ignore?: [number, number], remap?: [string, string]) {
  const bad: string[] = [];
  for (let i = 0; i < 1024; i++) {
    const y = Math.floor(i / 32);
    if (ignore && y >= ignore[0] && y <= ignore[1]) continue;
    let e = expected.slice(i * 6, i * 6 + 6);
    if (remap && e === remap[0]) e = remap[1];
    const a = actual.slice(i * 6, i * 6 + 6);
    if (channelDistance(parseInt(e, 16), parseInt(a, 16)) > TOLERANCE) bad.push(`(${i % 32},${y}) py=${e} ts=${a}`);
  }
  return bad;
}

describe('parity with the Python prototype', () => {
  // Seed chosen so no apple spawns in the snake's straight path (the Python run scored 0 too).
  const sim = boot({ epoch: fixture.epochMs, seed: 2 });
  const results: { name: string; mismatches: string[] }[] = [];
  let flatMenuIndex = 0;

  for (const op of fixture.timeline) {
    sim.at(op.t);
    if (op.op === 'key') {
      const button = KEYS[op.key!]!;
      // The recording walks the prototype's flat list, which the shelves replaced.
      if (sim.kernel.activeApp === 'menu' && (button === 'left' || button === 'right')) {
        flatMenuIndex = Math.max(0, Math.min(FLAT_MENU.length - 1, flatMenuIndex + (button === 'left' ? -1 : 1)));
      } else if (sim.kernel.activeApp === 'menu' && button === 'enter') {
        sim.kernel.launch(FLAT_MENU[flatMenuIndex]!);
      } else {
        sim.kernel.input(button);
      }
    } else {
      const actual = sim.kernel.screen.toHexString();
      const deviation = DEVIATIONS[op.name!];
      const mismatches = diff(op.frame!, actual, deviation?.rows, deviation?.remap);
      if (mismatches.length > 0 || process.env.DOTORO_DUMP) writeFramePng(`parity-${op.name}`, [op.frame!, actual]);
      results.push({ name: op.name!, mismatches });
    }
  }

  it('recorded every snapshot', () => {
    expect(results.length).toBe(fixture.timeline.filter((o) => o.op === 'snap').length);
  });

  for (const r of results) {
    it(r.name, () => {
      expect(r.mismatches.slice(0, 8), `${r.mismatches.length} pixels differ`).toEqual([]);
    });
  }
});
