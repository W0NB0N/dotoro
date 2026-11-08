/// <reference lib="webworker" />
import { createDiorama, type DeskClock, FPS, Frame, LOOP_FRAMES, VIEW_H } from '@dotoro/diorama';

/**
 * The diorama runs off the main thread: baking the city and composing each frame would otherwise
 * compete with Three.js and the kernel. Two canvases are in play: `pixels` holds the 1:1 image,
 * and `canvas` is that image enlarged by a whole number with no smoothing. The browser then scales
 * that down to the window, so every art pixel stays the same size at any resolution.
 */
export type BackdropMessage =
  | { type: 'init'; canvas: OffscreenCanvas; still: boolean }
  | { type: 'resize'; width: number; scale: number }
  | { type: 'camera'; x: number; y: number }
  | { type: 'run'; running: boolean };

/** A frame of the loop with everything in view: the still shown under reduced motion. */
const STILL_FRAME = 700;

const scope = self as unknown as DedicatedWorkerGlobalScope;

let output: OffscreenCanvasRenderingContext2D | null = null;
const pixelsCanvas = new OffscreenCanvas(1, 1);
const pixels = pixelsCanvas.getContext('2d')!;
const diorama = createDiorama();
let frame: Frame | null = null;
let image: ImageData | null = null;
let still = false;
let running = true;
let cameraX = 0;
let cameraY = 0;
let lastFrame = -1;
let dirty = true;
let announced = false;
let shownMinute = -1;

const HOUR_12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true;

function readClock(): DeskClock {
  const now = new Date();
  const hours = now.getHours();
  return {
    hours: HOUR_12 ? hours % 12 || 12 : hours,
    minutes: now.getMinutes(),
    // Holds steady for reduced motion, which only redraws once a minute.
    colon: still || now.getMilliseconds() < 500,
    pad: !HOUR_12,
  };
}

function draw(frameNumber: number) {
  if (!frame || !image || !output) return;
  const clock = readClock();
  shownMinute = clock.minutes;
  diorama.render(frame, frameNumber, cameraX, cameraY, clock);
  pixels.putImageData(image, 0, 0);
  output.drawImage(pixelsCanvas, 0, 0, output.canvas.width, output.canvas.height);
  if (!announced) {
    announced = true;
    scope.postMessage({ type: 'ready' });
  }
}

function tick(now: number) {
  scope.requestAnimationFrame(tick);
  if (!running) return;
  if (still) {
    if (dirty || new Date().getMinutes() !== shownMinute) draw(STILL_FRAME);
    dirty = false;
    return;
  }
  const frameNumber = Math.floor((now / 1000) * FPS) % LOOP_FRAMES;
  if (frameNumber === lastFrame) return;
  lastFrame = frameNumber;
  draw(frameNumber);
}

scope.onmessage = (event: MessageEvent<BackdropMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      output = message.canvas.getContext('2d', { alpha: false });
      still = message.still;
      scope.requestAnimationFrame(tick);
      break;
    case 'resize': {
      const { width, scale } = message;
      frame = new Frame(width, VIEW_H);
      image = new ImageData(frame.data, width, VIEW_H);
      pixelsCanvas.width = width;
      pixelsCanvas.height = VIEW_H;
      if (output) {
        output.canvas.width = width * scale;
        output.canvas.height = VIEW_H * scale;
        output.imageSmoothingEnabled = false;
      }
      dirty = true;
      break;
    }
    case 'camera':
      cameraX = message.x;
      cameraY = message.y;
      dirty = true;
      break;
    case 'run':
      running = message.running;
      break;
  }
};
