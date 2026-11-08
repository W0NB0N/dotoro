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

/** Max per-channel difference tolerated (VFD artwork is quantised from noisy PNG exports). */
const TOLERANCE = 8;

const centred = 'labels that fit are centred (prototype drew them left-aligned)';
const longThemeName = 'long theme names scroll (marquee) instead of being truncated to "CATPP"';
const titleLoop = 'title loop animation phase starts when the screen opens';
/** The cyberpunk theme's background, in the prototype and now. */
const CYBERPUNK_BG: [string, string] = ['120458', '0a0818'];
const recolored = 'gallery art with transparent areas shows the redesigned cyberpunk background';

const DEVIATIONS: Record<string, { rows?: [number, number]; remap?: [string, string]; reason: string }> = {
  'menu.snake': { rows: [12, 18], reason: centred },
  'menu.theme': { rows: [12, 18], reason: centred },
  'menu.gallery': { rows: [12, 18], reason: 'long labels hold, then scroll seamlessly (prototype scrolled from epoch time)' },
  'themes.catppuccin': { rows: [13, 19], reason: longThemeName },
  'themes.minimal': { rows: [13, 19], reason: longThemeName },
  'themes.retrowave': { rows: [13, 19], reason: longThemeName },
  'themes.forest': { rows: [13, 19], reason: longThemeName },
  'snake.start': { rows: [13, 15], reason: titleLoop },
  'snake.gameover': { rows: [13, 15], reason: titleLoop },
  'snake.alive.early': { rows: [6, 29], reason: 'first move waits one step; apple placement uses the seeded RNG' },
  // The prototype's cyberpunk palette was replaced to match the neon city around the device, and
  // the theme gained its HUD (scanlines, brackets, chromatic text, glitches).
  'themes.cyberpunk': { rows: [0, 31], reason: 'cyberpunk theme redesigned for the neon scene' },
  'menu.pomodoro.cyberpunk': { rows: [0, 31], reason: 'cyberpunk theme redesigned for the neon scene' },
  // Under the cyberpunk theme, only the background color changed: map it and compare the rest.
  'gallery.0': { remap: CYBERPUNK_BG, reason: recolored },
  'gallery.1': { remap: CYBERPUNK_BG, reason: recolored },
  'gallery.2': { remap: CYBERPUNK_BG, reason: recolored },
  'gallery.3': { remap: CYBERPUNK_BG, reason: recolored },
  'gallery.4': { remap: CYBERPUNK_BG, reason: recolored },
  'gallery.5': { remap: CYBERPUNK_BG, reason: recolored },
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

  for (const op of fixture.timeline) {
    sim.at(op.t);
    if (op.op === 'key') {
      sim.kernel.input(KEYS[op.key!]!);
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
