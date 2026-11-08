import { createBalcony } from './balcony';
import { type Ctx, createCity, DEPTH, type DeskClock, shiftX, shiftY } from './city';
import { bayer, Frame, LOOP_FRAMES } from './core';
import { drawRain, type RainSheet } from './fx';
import { drawGlass } from './glass';
import { PALETTE } from './palette';
import { createRoom } from './room';
import { createSigns } from './signs';

const RAIN_FAR: RainSheet = { count: 700, length: 5, falls: 150, color: 0xa8b8f0, alpha: 0.32, seed: 1 };
const RAIN_MID: RainSheet = { count: 420, length: 12, falls: 110, color: 0xc8d4fc, alpha: 0.5, seed: 2 };
const RAIN_NEAR: RainSheet = { count: 240, length: 28, falls: 80, color: 0xffe2f2, alpha: 0.72, seed: 3 };

/** What the desk clock shows when the caller doesn't say. */
const NOON: DeskClock = { hours: 12, minutes: 0, colon: true, pad: true };

/** Palette lookup at 5 bits per channel. */
function buildLut(): Uint32Array {
  const lut = new Uint32Array(1 << 15);
  const entries = PALETTE.map((c) => [c >> 16, (c >> 8) & 255, c & 255] as const);
  for (let i = 0; i < lut.length; i++) {
    const r = ((i >> 10) & 31) * 8.226;
    const g = ((i >> 5) & 31) * 8.226;
    const b = (i & 31) * 8.226;
    let best = 0;
    let bestD = Infinity;
    for (let n = 0; n < entries.length; n++) {
      const e = entries[n]!;
      // Weighted toward what the eye reads, so darks keep their hue.
      const d = 2 * (r - e[0]) ** 2 + 4 * (g - e[1]) ** 2 + 3 * (b - e[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    const [er, eg, eb] = entries[best]!;
    lut[i] = (0xff000000 | (eb << 16) | (eg << 8) | er) >>> 0;
  }
  return lut;
}

const DITHER = Int8Array.from({ length: 16 }, (_, i) => Math.round((bayer(i & 3, i >> 2) - 0.5) * 10));

function quantize(frame: Frame, lut: Uint32Array) {
  const { data, u32, w, h } = frame;
  let o = 0;
  for (let y = 0; y < h; y++) {
    const row = (y & 3) << 2;
    for (let x = 0; x < w; x++, o += 4) {
      // Dither fades out toward black: the desk has to stay quiet, not speckled.
      const level = data[o]! | data[o + 1]! | data[o + 2]!;
      const d = level < 32 ? DITHER[row | (x & 3)]! >> 2 : level < 72 ? DITHER[row | (x & 3)]! >> 1 : DITHER[row | (x & 3)]!;
      let r = data[o]! + d;
      let g = data[o + 1]! + d;
      let b = data[o + 2]! + d;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      u32[o >> 2] = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]!;
    }
  }
}

export interface Diorama {
  /**
   * Draws one frame. `frameNumber` may be any integer: the animation repeats every
   * {@link LOOP_FRAMES}. `px`/`py` are the camera's offset, in pixels at infinite depth.
   */
  render(frame: Frame, frameNumber: number, px?: number, py?: number, clock?: DeskClock): void;
  /** Draws the loop at t in [0, 1]. t = 1 must match t = 0, which is how the seam is tested. */
  renderAt(frame: Frame, t: number, px?: number, py?: number, clock?: DeskClock): void;
}

export function createDiorama(): Diorama {
  const city = createCity();
  const signs = createSigns(city.near);
  city.finishNear();
  const balcony = createBalcony();
  const room = createRoom();
  const lut = buildLut();

  return {
    render(frame, frameNumber, cameraX = 0, cameraY = 0, clock = NOON) {
      const wrapped = ((frameNumber % LOOP_FRAMES) + LOOP_FRAMES) % LOOP_FRAMES;
      this.renderAt(frame, wrapped / LOOP_FRAMES, cameraX, cameraY, clock);
    },

    renderAt(frame, t, cameraX = 0, cameraY = 0, clock = NOON) {
      const ctx: Ctx = { frame, t, px: cameraX, py: cameraY, clock };

      // Gusts lean the rain.
      const slope = -0.36 + Math.sin(t * Math.PI * 2 * 3) * 0.07 + Math.sin(t * Math.PI * 2 * 7) * 0.03;

      city.drawFar(ctx);
      city.drawMid(ctx);
      drawRain(frame, RAIN_FAR, t, slope, shiftX(ctx, DEPTH.mid));
      city.drawNear(ctx);
      signs.draw(ctx);
      drawRain(frame, RAIN_MID, t, slope, shiftX(ctx, DEPTH.air));
      balcony.draw(ctx);
      drawRain(frame, RAIN_NEAR, t, slope, shiftX(ctx, DEPTH.balcony));
      drawGlass(frame, t, shiftY(ctx, DEPTH.glass));
      room.draw(ctx);
      quantize(frame, lut);
    },
  };
}
