/** Behaviour that is new in the TS port (wall-clock timers, persistence, determinism). */
import { describe, expect, it } from 'vitest';
import { type Button, MemoryStore } from '@dotoro/kernel';
import { DEFAULT_APPS, ICON_CHARS } from '../src';
import { boot } from './helpers';

function openPomodoro() {
  const sim = boot();
  sim.kernel.powerOn({ skipBoot: true });
  sim.kernel.launch('pomodoro', { transition: false });
  sim.run(50);
  return sim;
}

/** Set the Pomodoro to 00:15 from the default 25:00. */
function setFifteenSeconds(sim: ReturnType<typeof boot>) {
  for (let i = 0; i < 25; i++) sim.kernel.input('down');
  sim.kernel.input('right');
  sim.kernel.input('up');
}

describe('boot', () => {
  it('plays the chime and opens the menu when the animation ends', () => {
    const sim = boot();
    sim.kernel.powerOn();
    expect(sim.kernel.activeApp).toBe('boot');
    sim.run(5000);
    expect(sim.kernel.activeApp).toBe('boot');
    sim.run(1000);
    expect(sim.kernel.activeApp).toBe('menu');
    expect(sim.audio.calls).toContain('play:boot');
  });
});

describe('pomodoro', () => {
  it('keeps counting while another app is open, then rings and takes focus', () => {
    const sim = openPomodoro();
    setFifteenSeconds(sim);
    sim.kernel.input('enter');
    sim.kernel.launch('snake');
    sim.run(14_000);
    expect(sim.kernel.activeApp).toBe('snake');
    sim.run(1_500);
    expect(sim.kernel.activeApp).toBe('pomodoro');
    expect(sim.audio.looping.has('alarm')).toBe(true);
    sim.kernel.input('up'); // any key silences
    expect(sim.audio.looping.has('alarm')).toBe(false);
  });

  it('enter after the alarm moves to the rest session (05:00)', () => {
    const sim = openPomodoro();
    setFifteenSeconds(sim);
    sim.kernel.input('enter');
    sim.run(16_000);
    sim.kernel.input('enter');
    const saved = sim.store.get<{ session: number; state: string; remaining: number }>('app:pomodoro:state')!;
    expect(saved).toMatchObject({ session: 1, state: 'stopped', remaining: 300 });
  });

  it('survives a page reload mid-run using wall-clock time', () => {
    const sim = openPomodoro();
    sim.kernel.input('enter'); // start 25:00
    sim.run(60_000);
    sim.kernel.persist(); // host does this on pagehide

    const reloaded = boot({ epoch: sim.clock.now() + 30_000, store: sim.store });
    reloaded.kernel.powerOn({ skipBoot: true });
    reloaded.kernel.launch('pomodoro', { transition: false });
    reloaded.run(10);
    const state = reloaded.store.get<{ state: string; startRemaining: number; startedAt: number }>('app:pomodoro:state')!;
    expect(state.state).toBe('running');
    const remaining = state.startRemaining - Math.floor((reloaded.clock.now() - state.startedAt) / 1000);
    expect(remaining).toBe(25 * 60 - 90);
  });

  it('pauses when the device is switched off', () => {
    const sim = openPomodoro();
    sim.kernel.input('enter');
    sim.run(3_500);
    sim.kernel.powerOff();
    const saved = sim.store.get<{ state: string; remaining: number }>('app:pomodoro:state')!;
    expect(saved).toMatchObject({ state: 'paused', remaining: 25 * 60 - 3 });
  });

  it('repeat (held key) adjusts minutes', () => {
    const sim = openPomodoro();
    for (let i = 0; i < 5; i++) sim.kernel.input('up', 'repeat');
    sim.kernel.launch('menu');
    expect(sim.store.get<{ remaining: number }>('app:pomodoro:state')!.remaining).toBe(30 * 60);
  });
});

describe('snake', () => {
  function playToDeath(seed: number) {
    const sim = boot({ seed });
    sim.kernel.powerOn({ skipBoot: true });
    sim.kernel.launch('snake', { transition: false });
    sim.run(100);
    sim.kernel.input('enter');
    sim.run(500);
    sim.kernel.input('right');
    sim.run(800);
    sim.kernel.input('down');
    sim.run(10_000);
    return sim;
  }

  it('is deterministic for a given seed', () => {
    const a = playToDeath(123).kernel.screen.toHexString();
    const b = playToDeath(123).kernel.screen.toHexString();
    expect(a).toBe(b);
  });

  it('ignores 180-degree reversals', () => {
    const sim = boot();
    sim.kernel.powerOn({ skipBoot: true });
    sim.kernel.launch('snake', { transition: false });
    sim.kernel.input('enter');
    sim.kernel.input('down'); // moving up; reversal must be ignored
    sim.run(600);
    expect(sim.audio.calls).not.toContain('play:die');
  });

  it('shows the persisted high score and never lowers it', () => {
    const startScreen = (store: MemoryStore) => {
      const sim = boot({ store });
      sim.kernel.powerOn({ skipBoot: true });
      sim.kernel.launch('snake', { transition: false });
      sim.run(10);
      return sim;
    };
    const fresh = startScreen(new MemoryStore()).kernel.screen.toHexString();
    const store = new MemoryStore({ 'data:snake:highScore': 7 });
    const sim = startScreen(store);
    expect(sim.kernel.screen.toHexString()).not.toBe(fresh); // "HI 7" vs "HI 0"

    sim.kernel.input('enter');
    sim.run(5_000); // runs straight into the top wall
    expect(sim.audio.calls).toContain('play:die');
    expect(store.get('data:snake:highScore')).toBe(7);
  });
});

describe('menu', () => {
  const home = (store = new MemoryStore()) => {
    const sim = boot({ store });
    sim.kernel.powerOn({ skipBoot: true });
    sim.run(20);
    return sim;
  };
  const press = (sim: ReturnType<typeof boot>, ...buttons: Button[]) => {
    for (const button of buttons) {
      sim.kernel.input(button);
      sim.run(20);
    }
  };
  const opened = (sim: ReturnType<typeof boot>) => {
    press(sim, 'enter');
    return sim.kernel.activeApp;
  };

  it('opens on the tools shelf, at the timer', () => {
    expect(opened(home())).toBe('pomodoro');
  });

  it('turns the carousel in both directions and wraps around', () => {
    const forward = home();
    press(forward, 'right', 'right', 'right');
    expect(opened(forward)).toBe('pomodoro');
    const backward = home();
    press(backward, 'left');
    expect(opened(backward)).toBe('gallery');
  });

  it('changes shelf with up and down', () => {
    for (const button of ['up', 'down'] as const) {
      const sim = home();
      press(sim, button);
      expect(opened(sim)).toBe('snake');
    }
  });

  it('stays put when browsing a shelf with one app', () => {
    const sim = home();
    press(sim, 'down', 'right', 'left', 'left');
    expect(opened(sim)).toBe('snake');
  });

  it('remembers its place on each shelf', () => {
    const sim = home();
    press(sim, 'right', 'down', 'up');
    expect(opened(sim)).toBe('themes');
  });

  it('remembers its place across reloads', () => {
    const store = new MemoryStore();
    const before = home(store);
    press(before, 'right');
    before.kernel.persist();
    expect(opened(home(store))).toBe('themes');
  });

  it('starts cleanly from a save written by the old flat menu', () => {
    const store = new MemoryStore({ 'app:menu:state': { index: 3 } });
    expect(opened(home(store))).toBe('pomodoro');
  });

  it('sounds out moving, opening and going back', () => {
    const sim = home();
    press(sim, 'right');
    expect(sim.audio.calls).toContain('play:blip');
    press(sim, 'enter');
    expect(sim.audio.calls).toContain('play:select');
    press(sim, 'menu');
    expect(sim.audio.calls).toContain('play:back');
  });

  it('has no back sound on the home screen', () => {
    const sim = home();
    press(sim, 'menu');
    expect(sim.audio.calls).not.toContain('play:back');
  });

  it('draws the same picture for the same state', () => {
    const a = home();
    const b = home();
    expect(a.kernel.screen.toHexString()).toBe(b.kernel.screen.toHexString());
  });

  const shelved = DEFAULT_APPS.filter((app) => app.showInMenu);

  it.each(shelved.map((app) => [app.id, app] as const))('%s has a shelf, an icon and key hints', (_, app) => {
    expect(app.category).toBeDefined();
    expect(app.hints?.length).toBeGreaterThan(0);
    expect(app.icon?.frames.length).toBeGreaterThan(0);
    for (const frame of app.icon!.frames) {
      expect(frame).toHaveLength(16);
      for (const row of frame) {
        expect(row).toHaveLength(16);
        for (const ch of row) expect(ICON_CHARS).toContain(ch);
      }
    }
  });
});
