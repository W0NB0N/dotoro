import { VIEW_H } from '@dotoro/diorama';
import { type RefObject, useEffect, useRef } from 'react';
import type { BackdropMessage } from './backdrop.worker';

/** Lets the 3D scene steer the diorama's parallax. */
export interface BackdropHandle {
  setCamera(x: number, y: number): void;
  /**
   * Pushes into the city as the camera pushes into Dotoro: `zoom` from 1, around the point behind
   * the screen at (ox, oy) as fractions of the view, which `progress` (0-1) brings to the middle.
   */
  setZoom(zoom: number, ox: number, oy: number, progress: number): void;
}

/** Widest image the diorama composes. Beyond this the picture is cropped rather than stretched. */
const MAX_WIDTH = 960;

/**
 * The window behind Dotoro. The canvas is created here rather than rendered by React because an
 * OffscreenCanvas can only be handed to a worker once, which a re-run effect would otherwise break.
 */
export function Backdrop({ handle }: { handle: RefObject<BackdropHandle | null> }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'backdrop';
    parent.append(canvas);

    const worker = new Worker(new URL('./backdrop.worker.ts', import.meta.url), { type: 'module' });
    const send = (message: BackdropMessage, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
    worker.onmessage = () => canvas.classList.add('backdrop-ready');

    const offscreen = canvas.transferControlToOffscreen();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    send({ type: 'init', canvas: offscreen, still }, [offscreen]);

    const resize = () => {
      const { clientWidth, clientHeight } = parent;
      if (clientWidth === 0 || clientHeight === 0) return;
      const width = Math.min(MAX_WIDTH, Math.ceil((VIEW_H * clientWidth) / clientHeight));
      const scale = Math.max(1, Math.ceil((clientHeight * devicePixelRatio) / VIEW_H));
      send({ type: 'resize', width, scale });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    const onVisibility = () => send({ type: 'run', running: !document.hidden });
    document.addEventListener('visibilitychange', onVisibility);

    handle.current = {
      setCamera: (x, y) => send({ type: 'camera', x, y }),
      setZoom: (zoom, ox, oy, progress) => {
        const tx = (0.5 - ox) * parent.clientWidth * progress;
        const ty = (0.5 - oy) * parent.clientHeight * progress;
        canvas.style.transformOrigin = `${(ox * 100).toFixed(2)}% ${(oy * 100).toFixed(2)}%`;
        canvas.style.transform = zoom > 1.0005 ? `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${zoom.toFixed(4)})` : '';
      },
    };

    return () => {
      handle.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      worker.terminate();
      canvas.remove();
    };
  }, [handle]);

  return <div ref={host} className="backdrop-host" aria-hidden />;
}
