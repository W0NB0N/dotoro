import { beforeAll, describe, expect, it } from 'vitest';
import { createDiorama, type Diorama, Frame, LOOP_FRAMES, VIEW_H, VIEW_W } from '../src';

/** Share of pixels that differ between two frames. */
function changed(a: Uint32Array, b: Uint32Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n / a.length;
}

const luminance = (p: number) => 0.2126 * (p & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * ((p >> 16) & 255);

describe('diorama', () => {
  let diorama: Diorama;

  const render = (frameNumber: number, px = 0, py = 0, width = VIEW_W) => {
    const frame = new Frame(width, VIEW_H);
    diorama.render(frame, frameNumber, px, py);
    return frame;
  };

  beforeAll(() => {
    diorama = createDiorama();
  });

  it('lands exactly back on its first frame', () => {
    // t = 1 is not wrapped: every animation has to complete a whole number of cycles by itself.
    const start = new Frame(VIEW_W, VIEW_H);
    const end = new Frame(VIEW_W, VIEW_H);
    diorama.renderAt(start, 0);
    diorama.renderAt(end, 1);
    expect(changed(start.u32, end.u32)).toBe(0);
  });

  it('treats frame numbers as positions in the loop', () => {
    for (const frameNumber of [0, 417, 1203]) {
      expect(changed(render(frameNumber).u32, render(frameNumber + LOOP_FRAMES).u32)).toBe(0);
      expect(changed(render(frameNumber).u32, render(frameNumber - LOOP_FRAMES).u32)).toBe(0);
    }
  });

  it('has no visible jump across the seam', () => {
    // Compared against ordinary frame steps from across the loop, cuts and flickers included.
    const steps = Array.from({ length: 40 }, (_, i) => {
      const f = Math.floor(((i + 0.5) / 40) * LOOP_FRAMES);
      return changed(render(f).u32, render(f + 1).u32);
    }).sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length * 0.9)]!;
    expect(changed(render(LOOP_FRAMES - 1).u32, render(0).u32)).toBeLessThan(typical * 1.5);
  });

  it('is a pure function of its inputs', () => {
    const before = Uint32Array.from(render(640, 3, -2).u32);
    render(99);
    expect(changed(before, render(640, 3, -2).u32)).toBe(0);
  });

  it('renders every part of the loop', () => {
    // Every half second, at an angle: catches any effect that hangs or throws partway through.
    for (let f = 0; f < LOOP_FRAMES; f += 15) {
      const started = Date.now();
      render(f, 7, -2);
      expect(Date.now() - started).toBeLessThan(500);
    }
  });

  it('keeps moving', () => {
    expect(changed(render(100).u32, render(101).u32)).toBeGreaterThan(0.02);
  });

  it('leaves the desk empty and dark where Dotoro sits', () => {
    // Dotoro's footprint in the 480x270 art, from the home camera, plus the desk in front of it.
    const x0 = 176;
    const x1 = 306;
    for (const frameNumber of [0, 90, 450, 900, 1350, 1700]) {
      const { u32, w } = render(frameNumber);
      for (let y = 196; y < 226; y++) {
        for (let x = x0; x < x1; x++) {
          expect(luminance(u32[y * w + x]!)).toBeLessThan(48);
        }
      }
    }
  });

  it('shows the time it is given, and nothing else changes', () => {
    const at = (hours: number, minutes: number) => {
      const frame = new Frame(VIEW_W, VIEW_H);
      diorama.render(frame, 300, 0, 0, { hours, minutes, colon: true, pad: true });
      return frame.u32;
    };
    const earlier = at(9, 41);
    const later = at(21, 7);
    let inside = 0;
    let outside = 0;
    for (let y = 0; y < VIEW_H; y++) {
      for (let x = 0; x < VIEW_W; x++) {
        if (earlier[y * VIEW_W + x] === later[y * VIEW_W + x]) continue;
        // The clock's face, from its body on the desk.
        if (x >= 336 && x < 400 && y >= 162 && y < 192) inside++;
        else outside++;
      }
    }
    expect(inside).toBeGreaterThan(20);
    expect(outside).toBe(0);
  });

  it('moves far layers more than near ones', () => {
    const shiftOf = (y: number, x0: number, x1: number) => {
      // Finds the horizontal shift that best explains a row of the image when the camera moves.
      const still = render(0).u32;
      const moved = render(0, 24, 0).u32;
      let best = 0;
      let bestScore = -1;
      for (let s = -2; s <= 30; s++) {
        let score = 0;
        for (let x = x0; x < x1; x++) if (still[y * VIEW_W + x] === moved[y * VIEW_W + x + s]) score++;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      return best;
    };
    const desk = shiftOf(190, 200, 280);
    const rail = shiftOf(126, 200, 280);
    expect(desk).toBe(0);
    expect(rail).toBeGreaterThan(desk);
  });

  it('keeps the composition centered at other aspect ratios', () => {
    // A wider image shows more of the same scene: the middle matches the 16:9 art exactly.
    const narrow = render(300, 0, 0, VIEW_W);
    const wide = render(300, 0, 0, VIEW_W + 160);
    let same = 0;
    const top = 214; // Below the desk's reflection of the rain, whose drops scale with image width.
    for (let y = top; y < VIEW_H; y++) {
      for (let x = 0; x < VIEW_W; x++) {
        if (narrow.u32[y * VIEW_W + x] === wide.u32[y * wide.w + x + 80]) same++;
      }
    }
    expect(same / ((VIEW_H - top) * VIEW_W)).toBeGreaterThan(0.99);
  });
});
