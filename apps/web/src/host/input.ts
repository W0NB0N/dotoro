import type { Button, InputKind } from '@dotoro/kernel';

export type InputListener = (button: Button, kind: InputKind) => void;

const KEYMAP: Record<string, Button> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Enter: 'enter',
  Space: 'enter',
  KeyM: 'menu',
  Escape: 'menu',
  KeyB: 'power',
  KeyP: 'power',
};

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 80;

/**
 * The single source of button events. Keyboard, on-screen 3D keys and (later) gamepads
 * all feed into this bus; the kernel, key animations and click sounds all listen to it.
 * Because every source goes through one place, a key can't be handled twice.
 */
export class InputBus {
  private readonly listeners = new Set<InputListener>();
  private readonly held = new Map<Button, { source: string; timer?: ReturnType<typeof setTimeout> }>();

  subscribe(listener: InputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isHeld(button: Button): boolean {
    return this.held.has(button);
  }

  /** Start holding `button`. Sources without native auto-repeat get a synthetic one. */
  press(button: Button, source: string, autoRepeat = false): void {
    if (this.held.has(button)) return;
    const entry: { source: string; timer?: ReturnType<typeof setTimeout> } = { source };
    this.held.set(button, entry);
    this.emit(button, 'press');
    if (autoRepeat && button !== 'power' && button !== 'menu') {
      const tick = () => {
        if (this.held.get(button) !== entry) return;
        this.emit(button, 'repeat');
        entry.timer = setTimeout(tick, REPEAT_INTERVAL_MS);
      };
      entry.timer = setTimeout(tick, REPEAT_DELAY_MS);
    }
  }

  repeat(button: Button): void {
    if (this.held.has(button)) this.emit(button, 'repeat');
  }

  release(button: Button): void {
    const entry = this.held.get(button);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.held.delete(button);
    this.emit(button, 'release');
  }

  releaseAll(): void {
    for (const button of [...this.held.keys()]) this.release(button);
  }

  releaseSource(source: string): void {
    for (const [button, entry] of [...this.held]) if (entry.source === source) this.release(button);
  }

  /** Map physical keyboard keys to Dotoro buttons. Returns a detach function. */
  attachKeyboard(target: Window = window): () => void {
    const ignore = (e: KeyboardEvent) =>
      e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]'));

    const down = (e: KeyboardEvent) => {
      const button = KEYMAP[e.code];
      if (!button || ignore(e)) return;
      e.preventDefault();
      if (e.repeat || this.held.has(button)) this.repeat(button);
      else this.press(button, 'keyboard');
    };
    const up = (e: KeyboardEvent) => {
      const button = KEYMAP[e.code];
      if (button) this.release(button);
    };
    const blur = () => this.releaseAll();

    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  private emit(button: Button, kind: InputKind): void {
    for (const l of this.listeners) l(button, kind);
  }
}

export const KEY_HELP: { keys: string; action: string }[] = [
  { keys: 'Arrows / WASD', action: 'Navigate' },
  { keys: 'Enter / Space', action: 'Select · start · pause' },
  { keys: 'M / Esc', action: 'Menu' },
  { keys: 'B / P', action: 'Power on / off' },
  { keys: 'Click 3D keys', action: 'Press (hold to repeat)' },
  { keys: 'Drag', action: 'Look around' },
];
