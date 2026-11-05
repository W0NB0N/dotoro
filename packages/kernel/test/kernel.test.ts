import { describe, expect, it } from 'vitest';
import {
  type AppDefinition,
  AudioLog,
  BLACK,
  decodeBase64,
  FONT_3X5,
  FONT_5X7,
  Framebuffer,
  frameAt,
  Gfx,
  hex,
  Kernel,
  ManualClock,
  measureText,
  MemoryStore,
  mix,
  Rng,
  THEMES,
  toHex,
  decodeSprite,
} from '../src';

describe('color', () => {
  it('round-trips hex', () => {
    expect(toHex(hex('#a5C9ff'))).toBe('#a5c9ff');
    expect(hex('000000')).toBe(0);
    expect(() => hex('#abc')).toThrow();
  });
  it('mixes', () => {
    expect(toHex(mix(0x000000, 0xffffff, 0.5))).toBe('#808080');
    expect(mix(0x102030, 0xffffff, 0)).toBe(0x102030);
  });
});

describe('fonts and text', () => {
  it('measures like the prototype (glyph widths + 1px spacing)', () => {
    expect(measureText('POMO', FONT_5X7)).toBe(4 * 5 + 3);
    expect(measureText('HI 0', FONT_3X5)).toBe(3 + 1 + 3 + 1 + 2 + 1 + 3);
    expect(measureText('', FONT_3X5)).toBe(0);
  });
  it('gives fonts without a space glyph a blank one', () => {
    const space = FONT_5X7.glyph(' ');
    expect(space.width).toBe(3);
    expect([...space.bits].every((b) => b === 0)).toBe(true);
  });
  it('falls back for unknown characters instead of throwing', () => {
    expect(FONT_3X5.glyph('☃')).toBeDefined();
  });
  it('centres text', () => {
    const fb = new Framebuffer();
    new Gfx(fb).textCentered('I', 0, 0xffffff, FONT_3X5);
    // 'I' is 3 wide -> starts at floor((32 - 3) / 2) = 14
    const lit = [...Array(32).keys()].filter((x) => fb.get(x, 0) !== 0);
    expect(Math.min(...lit)).toBeGreaterThanOrEqual(14);
    expect(Math.max(...lit)).toBeLessThanOrEqual(16);
  });
  it('marquee holds, then scrolls, and stays inside its window', () => {
    const text = 'GALLERY';
    const at = (ms: number) => {
      const fb = new Framebuffer();
      new Gfx(fb).marquee(text, 4, 0, 20, 0xffffff, FONT_5X7, ms);
      return fb;
    };
    expect(at(0).equals(at(700))).toBe(true); // holding
    expect(at(0).equals(at(2000))).toBe(false); // scrolling
    const fb = at(2000);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 32; x++) if (x < 4 || x >= 24) expect(fb.get(x, y)).toBe(0);
    }
  });
});

describe('gfx primitives', () => {
  it('draws Bresenham lines inclusive of end points', () => {
    const fb = new Framebuffer();
    new Gfx(fb).line(0, 0, 5, 2, 1);
    expect(fb.get(0, 0)).toBe(1);
    expect(fb.get(5, 2)).toBe(1);
  });
  it('ignores out-of-bounds writes', () => {
    const fb = new Framebuffer();
    new Gfx(fb).fillRect(-5, -5, 100, 100, 7);
    expect(fb.pixels.every((p) => p === 7)).toBe(true);
  });
});

describe('sprites', () => {
  it('decodes base64 like Node', () => {
    const bytes = Uint8Array.from({ length: 257 }, (_, i) => (i * 37) & 0xff);
    expect([...decodeBase64(Buffer.from(bytes).toString('base64'))]).toEqual([...bytes]);
  });
  it('decodes 16-bit indices', () => {
    const data = Buffer.alloc(8);
    [0, 300, 1, 299].forEach((v, i) => data.writeUInt16LE(v, i * 2));
    const sprite = decodeSprite({
      name: 't',
      width: 2,
      height: 2,
      palette: Array.from({ length: 301 }, () => '#000000'),
      indexBytes: 2,
      frames: [{ delay: 100, data: data.toString('base64') }],
    });
    expect([...sprite.frames[0]!.indices]).toEqual([0, 300, 1, 299]);
  });
  it('picks frames by cumulative delay', () => {
    const one = Buffer.from([0]).toString('base64');
    const sprite = decodeSprite({
      name: 't',
      width: 1,
      height: 1,
      palette: ['#000000'],
      frames: [{ delay: 100, data: one }, { delay: 50, data: one }, { delay: 100, data: one }],
    });
    expect(frameAt(sprite, 0)).toBe(0);
    expect(frameAt(sprite, 99)).toBe(0);
    expect(frameAt(sprite, 100)).toBe(1);
    expect(frameAt(sprite, 160)).toBe(2);
    expect(frameAt(sprite, 260)).toBe(0); // loops
    expect(frameAt(sprite, 9999, false)).toBe(2); // clamps
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.int(1000));
    expect(Array.from({ length: 5 }, () => b.int(1000))).toEqual(seqA);
    expect(new Rng(43).int(1000)).not.toBe(seqA[0]);
  });
});

// ------------------------------------------------------------------ kernel

function testApp(id: string, extra: Partial<AppDefinition> = {}, log: string[] = []): AppDefinition {
  return {
    id,
    title: id,
    showInMenu: true,
    create(ctx) {
      let count = ctx.savedState<number>() ?? 0;
      return {
        onEnter: () => log.push(`${id}:enter`),
        onExit: () => log.push(`${id}:exit`),
        onInput: (e) => {
          log.push(`${id}:${e.button}:${e.kind}`);
          count++;
        },
        update: () => log.push(`${id}:update`),
        render: (g) => g.pixel(0, 0, count),
        save: () => count,
      };
    },
    ...extra,
  };
}

function setup(log: string[] = []) {
  const clock = new ManualClock(1_000_000);
  const store = new MemoryStore();
  const audio = new AudioLog();
  const kernel = new Kernel({ clock, store, audio, seed: 1, transition: 'cut' });
  kernel.register(testApp('boot', { showInMenu: false }, log), testApp('menu', { showInMenu: false }, log), testApp('a', {}, log));
  return { clock, store, audio, kernel, log };
}

describe('Kernel', () => {
  it('starts off with a black screen and ignores input except power', () => {
    const { kernel, log } = setup();
    kernel.input('enter');
    kernel.tick();
    expect(kernel.powered).toBe(false);
    expect(kernel.screen.pixels.every((p) => p === BLACK)).toBe(true);
    expect(log).toEqual([]);
    kernel.input('power');
    expect(kernel.powered).toBe(true);
    expect(kernel.activeApp).toBe('boot');
  });

  it('can skip the boot app', () => {
    const { kernel } = setup();
    kernel.powerOn({ skipBoot: true });
    expect(kernel.activeApp).toBe('menu');
  });

  it('routes menu to home and other buttons to the active app', () => {
    const { kernel, log } = setup();
    kernel.powerOn({ skipBoot: true });
    kernel.launch('a');
    kernel.input('up', 'repeat');
    kernel.input('menu');
    expect(kernel.activeApp).toBe('menu');
    expect(log).toEqual(['menu:enter', 'menu:exit', 'a:enter', 'a:up:repeat', 'a:exit', 'menu:enter']);
  });

  it('runs logic in fixed 60 Hz steps and caps catch-up', () => {
    const { kernel, clock, log } = setup();
    kernel.powerOn({ skipBoot: true });
    kernel.tick();
    log.length = 0;
    clock.advance(101);
    kernel.tick();
    expect(log.filter((l) => l === 'menu:update')).toHaveLength(6); // floor(101 / 16.67)
    log.length = 0;
    clock.advance(60_000); // tab was asleep for a minute
    kernel.tick();
    expect(log.filter((l) => l === 'menu:update').length).toBeLessThanOrEqual(16);
  });

  it('bumps version only when the screen changes', () => {
    const { kernel, clock } = setup();
    kernel.powerOn({ skipBoot: true });
    kernel.tick();
    const v = kernel.version;
    clock.advance(16);
    kernel.tick();
    expect(kernel.version).toBe(v);
  });

  it('persists app state and theme across kernels', () => {
    const { kernel, store } = setup();
    kernel.powerOn({ skipBoot: true });
    kernel.launch('a');
    kernel.input('enter');
    kernel.input('enter');
    kernel.setTheme('ocean');
    kernel.powerOff();

    const clock = new ManualClock(2_000_000);
    const again = new Kernel({ clock, store, transition: 'cut' });
    again.register(testApp('boot'), testApp('menu'), testApp('a'));
    expect(again.theme.id).toBe('ocean');
    again.powerOn({ skipBoot: true });
    again.launch('a');
    again.tick();
    expect(again.screen.get(0, 0)).toBe(2);
  });

  it('emits events and blanks the screen on power off', () => {
    const { kernel, audio } = setup();
    const events: string[] = [];
    kernel.on((e) => events.push(e.type === 'power' ? `power:${e.powered}` : e.type === 'app' ? `app:${e.id}` : `theme:${e.theme.id}`));
    kernel.powerOn({ skipBoot: true });
    kernel.setTheme(THEMES[0]!.id);
    audio.loop('alarm');
    kernel.powerOff();
    kernel.tick();
    expect(events).toEqual(['power:true', 'app:menu', `theme:${THEMES[0]!.id}`, 'power:false', 'app:null']);
    expect(audio.looping.size).toBe(0);
    expect(kernel.screen.pixels.every((p) => p === BLACK)).toBe(true);
  });

  it('dissolves between apps and finishes on time', () => {
    const clock = new ManualClock(0);
    const kernel = new Kernel({ clock, transition: 'dissolve', transitionMs: 200 });
    const solid = (id: string, color: number): AppDefinition => ({ id, title: id, create: () => ({ render: (g) => g.clear(color) }) });
    kernel.register(solid('menu', 0x111111), solid('a', 0x222222));
    kernel.powerOn();
    kernel.tick();
    kernel.launch('a');
    clock.advance(101);
    kernel.tick();
    const mixed = new Set(kernel.screen.pixels);
    expect(mixed.has(0x111111) && mixed.has(0x222222)).toBe(true);
    clock.advance(150);
    kernel.tick();
    expect(kernel.screen.pixels.every((p) => p === 0x222222)).toBe(true);
  });

  it('rejects duplicate and unknown apps', () => {
    const { kernel } = setup();
    expect(() => kernel.register(testApp('a'))).toThrow();
    kernel.powerOn();
    expect(() => kernel.launch('nope')).toThrow();
  });
});
