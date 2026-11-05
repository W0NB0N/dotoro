import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { AudioLog, Kernel, type KernelOptions, ManualClock, MemoryStore } from '@dotoro/kernel';
import { DEFAULT_APPS } from '../src';

export const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '__out__');

export function boot(options: Partial<KernelOptions> & { epoch?: number; store?: MemoryStore } = {}) {
  const clock = new ManualClock(options.epoch ?? 1_700_000_000_000);
  const store = options.store ?? new MemoryStore();
  const audio = new AudioLog();
  const kernel = new Kernel({ seed: 1, ...options, clock, store, audio });
  kernel.register(...DEFAULT_APPS);
  const epoch = clock.now();

  /** Step the clock in frame-sized increments (like a real host) up to absolute `ms`. */
  const advanceTo = (ms: number) => {
    while (clock.now() + Kernel.STEP_MS <= ms) {
      clock.advance(Kernel.STEP_MS);
      kernel.tick();
    }
    clock.set(ms);
    kernel.tick();
  };
  const run = (ms: number) => advanceTo(clock.now() + ms);
  const at = (seconds: number) => advanceTo(epoch + seconds * 1000);

  return { kernel, clock, store, audio, epoch, advanceTo, run, at };
}

/** Write 32x32 `rrggbb...` frame strings side by side as an upscaled PNG for eyeballing. */
export function writeFramePng(name: string, frames: string[], scale = 8): string {
  const cell = 32 * scale;
  const gap = scale * 2;
  const png = new PNG({ width: frames.length * cell + (frames.length - 1) * gap, height: cell });
  png.data.fill(0x40);
  frames.forEach((frame, f) => {
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const c = parseInt(frame.slice((y * 32 + x) * 6, (y * 32 + x) * 6 + 6), 16);
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = ((y * scale + dy) * png.width + f * (cell + gap) + x * scale + dx) * 4;
            png.data[i] = (c >> 16) & 255;
            png.data[i + 1] = (c >> 8) & 255;
            png.data[i + 2] = c & 255;
            png.data[i + 3] = 255;
          }
        }
      }
    }
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  writeFileSync(file, PNG.sync.write(png));
  return file;
}
