import { DEFAULT_APPS } from '@dotoro/apps';
import { Kernel, type KernelEvent, type Theme } from '@dotoro/kernel';
import { useSyncExternalStore } from 'react';
import { WebAudioHost } from './audio';
import { InputBus } from './input';
import { createLocalStore } from './localStore';

/** How often the kernel ticks while the tab is hidden (rAF stops; timers/alarms must keep going). */
const HIDDEN_TICK_MS = 1000;

export interface HostSnapshot {
  powered: boolean;
  app: string | null;
  theme: Theme;
  muted: boolean;
}

/** Wires the pure kernel to the browser: clock, frame loop, input, audio and storage. */
export class Host {
  readonly store = createLocalStore();
  readonly audio = new WebAudioHost();
  readonly input = new InputBus();
  /** Starts in the cyberpunk theme, to match the city outside; a theme the user picked still wins. */
  readonly kernel = new Kernel({ store: this.store, audio: this.audio, defaultTheme: 'cyberpunk' });

  private snapshot: HostSnapshot;
  private readonly listeners = new Set<() => void>();
  private raf = 0;
  private hiddenTimer: ReturnType<typeof setInterval> | null = null;
  private teardown: (() => void)[] = [];

  constructor() {
    this.kernel.register(...DEFAULT_APPS);
    this.audio.setMuted(this.store.get<boolean>('host:muted') ?? false);
    this.snapshot = this.read();

    this.kernel.on((event: KernelEvent) => {
      if (event.type === 'power' && !event.powered) this.input.releaseAll();
      this.snapshot = this.read();
      for (const l of this.listeners) l();
    });

    this.input.subscribe((button, kind) => {
      if (kind === 'press') {
        this.audio.unlock(); // first gesture enables audio
        this.audio.keyClick();
      }
      this.kernel.input(button, kind);
    });
  }

  start(): void {
    if (this.teardown.length) return;
    this.teardown.push(this.input.attachKeyboard());

    const onVisibility = () => this.schedule();
    const onHide = () => this.persist();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    this.teardown.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    });
    this.schedule();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    if (this.hiddenTimer) clearInterval(this.hiddenTimer);
    this.hiddenTimer = null;
    for (const fn of this.teardown.splice(0)) fn();
    this.persist();
  }

  persist(): void {
    this.kernel.persist();
    this.store.flush();
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.store.set('host:muted', muted);
    this.snapshot = this.read();
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HostSnapshot => this.snapshot;

  private read(): HostSnapshot {
    return { powered: this.kernel.powered, app: this.kernel.activeApp, theme: this.kernel.theme, muted: this.audio.isMuted };
  }

  /** rAF while visible; a slow interval while hidden so the Pomodoro keeps time and alarms fire. */
  private schedule(): void {
    cancelAnimationFrame(this.raf);
    if (this.hiddenTimer) clearInterval(this.hiddenTimer);
    this.hiddenTimer = null;
    if (document.hidden) {
      this.persist();
      this.hiddenTimer = setInterval(() => this.kernel.tick(), HIDDEN_TICK_MS);
    } else {
      const frame = () => {
        this.kernel.tick();
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }
  }
}

export const host = new Host();

export function useHost(): HostSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot);
}
