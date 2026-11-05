import type { App, AppContext, AppDefinition, SystemServices } from './app';
import { type AudioSink, nullAudio } from './audio';
import { type Clock, systemClock } from './clock';
import { BLACK } from './color';
import { Framebuffer } from './framebuffer';
import { Gfx } from './gfx';
import type { Button, InputKind } from './input';
import { Rng } from './rng';
import { type KeyValueStore, MemoryStore, scopedStore } from './storage';
import { DEFAULT_THEME_ID, THEMES, type Theme } from './theme';
import { applyTransition, type TransitionKind } from './transitions';

export interface KernelOptions {
  clock?: Clock;
  store?: KeyValueStore;
  audio?: AudioSink;
  themes?: readonly Theme[];
  /** Seed for app RNGs. Defaults to the clock time at construction. */
  seed?: number;
  bootApp?: string;
  homeApp?: string;
  /** Transition used when switching apps. Default 'dissolve'. */
  transition?: TransitionKind;
  transitionMs?: number;
}

export type KernelEvent =
  | { type: 'power'; powered: boolean }
  | { type: 'app'; id: string | null }
  | { type: 'theme'; theme: Theme };

interface Running {
  def: AppDefinition;
  app: App;
}

interface ActiveTransition {
  kind: TransitionKind;
  from: Framebuffer;
  start: number;
  duration: number;
}

const THEME_KEY = 'kernel:theme';
const appStateKey = (id: string) => `app:${id}:state`;

/**
 * The Dotoro OS. Pure TypeScript with no DOM access: the host feeds it time and input,
 * and reads `screen` (32x32 colors). Runs identically in the browser, a worker, tests, or a server.
 */
export class Kernel {
  /** Logic runs in fixed steps so games are deterministic regardless of frame rate. */
  static readonly STEP_MS = 1000 / 60;
  /** Cap on simulated time per tick, so a sleeping tab doesn't fast-forward games. */
  static readonly MAX_CATCHUP_MS = 250;

  /** The displayed frame. Only changes inside `tick()`. */
  readonly screen = new Framebuffer();
  /** Increments every time `screen` changes, so hosts can skip redundant uploads. */
  version = 0;

  private readonly back = new Framebuffer();
  private readonly gfx = new Gfx(this.back);
  private readonly clock: Clock;
  private readonly store: KeyValueStore;
  private readonly audio: AudioSink;
  private readonly themeList: readonly Theme[];
  private readonly seed: number;
  private readonly bootApp: string;
  private readonly homeApp: string;
  private readonly transitionKind: TransitionKind;
  private readonly transitionMs: number;

  private readonly defs = new Map<string, AppDefinition>();
  private readonly running = new Map<string, Running>();
  private readonly listeners = new Set<(event: KernelEvent) => void>();
  private activeId: string | null = null;
  private currentTheme: Theme;
  private isPowered = false;
  private lastTick: number | null = null;
  private accumulator = 0;
  private transition: ActiveTransition | null = null;

  constructor(options: KernelOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.store = options.store ?? new MemoryStore();
    this.audio = options.audio ?? nullAudio;
    this.themeList = options.themes ?? THEMES;
    if (this.themeList.length === 0) throw new Error('Kernel needs at least one theme');
    this.seed = options.seed ?? Math.floor(this.clock.now()) >>> 0;
    this.bootApp = options.bootApp ?? 'boot';
    this.homeApp = options.homeApp ?? 'menu';
    this.transitionKind = options.transition ?? 'dissolve';
    this.transitionMs = options.transitionMs ?? 220;

    const savedTheme = this.store.get<string>(THEME_KEY);
    this.currentTheme =
      this.themeList.find((t) => t.id === savedTheme) ??
      this.themeList.find((t) => t.id === DEFAULT_THEME_ID) ??
      this.themeList[0]!;
    this.screen.fill(BLACK);
    this.back.fill(BLACK);
  }

  // ---------------------------------------------------------------- registry

  register(...defs: AppDefinition[]): this {
    for (const def of defs) {
      if (this.defs.has(def.id)) throw new Error(`App already registered: ${def.id}`);
      this.defs.set(def.id, def);
    }
    return this;
  }

  get apps(): readonly AppDefinition[] {
    return [...this.defs.values()];
  }

  get activeApp(): string | null {
    return this.activeId;
  }

  get powered(): boolean {
    return this.isPowered;
  }

  get theme(): Theme {
    return this.currentTheme;
  }

  get themes(): readonly Theme[] {
    return this.themeList;
  }

  /** Subscribe to power / app / theme changes. Returns an unsubscribe function. */
  on(listener: (event: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------- power

  powerOn(options: { skipBoot?: boolean } = {}): void {
    if (this.isPowered) return;
    this.isPowered = true;
    this.ensureInstances();
    this.emit({ type: 'power', powered: true });
    const first = options.skipBoot || !this.defs.has(this.bootApp) ? this.homeApp : this.bootApp;
    this.launch(first, { transition: false });
  }

  powerOff(): void {
    if (!this.isPowered) return;
    for (const r of this.running.values()) r.app.onPowerOff?.();
    this.exitActive();
    this.persist();
    this.audio.stopAll();
    this.isPowered = false;
    this.transition = null;
    this.emit({ type: 'power', powered: false });
    this.emit({ type: 'app', id: null });
  }

  togglePower(): void {
    if (this.isPowered) this.powerOff();
    else this.powerOn();
  }

  // ---------------------------------------------------------------- apps

  launch(id: string, options: { transition?: boolean } = {}): void {
    if (!this.isPowered) return;
    if (!this.defs.has(id)) throw new Error(`Unknown app: ${id}`);
    if (id === this.activeId) return;
    this.ensureInstances();

    const animate = (options.transition ?? true) && this.activeId !== null && this.transitionKind !== 'cut';
    this.exitActive();
    this.transition = animate
      ? { kind: this.transitionKind, from: this.screen.clone(), start: this.clock.now(), duration: this.transitionMs }
      : null;
    this.activeId = id;
    this.running.get(id)!.app.onEnter?.();
    this.emit({ type: 'app', id });
  }

  setTheme(id: string): void {
    const theme = this.themeList.find((t) => t.id === id);
    if (!theme || theme === this.currentTheme) return;
    this.currentTheme = theme;
    this.store.set(THEME_KEY, id);
    this.emit({ type: 'theme', theme });
  }

  /** Save every app's state. Hosts should call this on page hide / unload. */
  persist(): void {
    for (const [id, r] of this.running) this.persistApp(id, r);
  }

  // ---------------------------------------------------------------- input

  input(button: Button, kind: InputKind = 'press'): void {
    if (button === 'power') {
      if (kind === 'press') this.togglePower();
      return;
    }
    if (!this.isPowered) return;
    if (button === 'menu') {
      if (kind === 'press') this.launch(this.homeApp);
      return;
    }
    const active = this.activeId ? this.running.get(this.activeId) : undefined;
    active?.app.onInput?.({ button, kind, time: this.clock.now() });
  }

  // ---------------------------------------------------------------- frame loop

  /** Advance logic to the clock's current time and redraw. Call once per host frame. */
  tick(): void {
    const now = this.clock.now();
    const elapsed = this.lastTick === null ? 0 : Math.min(Math.max(0, now - this.lastTick), Kernel.MAX_CATCHUP_MS);
    this.lastTick = now;

    if (this.isPowered) {
      this.accumulator += elapsed;
      while (this.accumulator >= Kernel.STEP_MS) {
        this.accumulator -= Kernel.STEP_MS;
        this.step(Kernel.STEP_MS);
      }
    } else {
      this.accumulator = 0;
    }
    this.render(now);
  }

  private step(dt: number): void {
    for (const r of this.running.values()) {
      r.app.background?.(dt);
      if (!this.isPowered) return; // an app may power the device off
    }
    if (this.activeId) this.running.get(this.activeId)?.app.update?.(dt);
  }

  private render(now: number): void {
    const back = this.back;
    if (!this.isPowered || !this.activeId) {
      back.fill(BLACK);
    } else {
      back.fill(this.currentTheme.screen.background);
      this.running.get(this.activeId)!.app.render(this.gfx);
      if (this.transition) {
        const t = this.transition;
        const progress = t.duration <= 0 ? 1 : (now - t.start) / t.duration;
        if (progress >= 1) this.transition = null;
        else applyTransition(t.kind, t.from, back, progress);
      }
    }
    if (!back.equals(this.screen)) {
      this.screen.copyFrom(back);
      this.version++;
    }
  }

  // ---------------------------------------------------------------- internals

  private ensureInstances(): void {
    let index = 0;
    for (const def of this.defs.values()) {
      index++;
      if (this.running.has(def.id)) continue;
      const ctx = this.createContext(def, index);
      this.running.set(def.id, { def, app: def.create(ctx) });
    }
  }

  private exitActive(): void {
    if (!this.activeId) return;
    const r = this.running.get(this.activeId);
    this.activeId = null;
    if (r) {
      r.app.onExit?.();
      this.persistApp(r.def.id, r);
    }
  }

  private persistApp(id: string, r: Running): void {
    if (r.app.save) this.store.set(appStateKey(id), r.app.save());
  }

  private emit(event: KernelEvent): void {
    for (const l of this.listeners) l(event);
  }

  private createContext(def: AppDefinition, index: number): AppContext {
    const kernel = this;
    const system: SystemServices = {
      menuApps: () => [...kernel.defs.values()].filter((d) => d.showInMenu),
      themes: () => kernel.themeList,
      setTheme: (id) => kernel.setTheme(id),
    };
    return {
      id: def.id,
      now: () => kernel.clock.now(),
      get theme() {
        return kernel.currentTheme;
      },
      audio: kernel.audio,
      store: scopedStore(kernel.store, `data:${def.id}`),
      rng: new Rng((kernel.seed + Math.imul(index, 0x9e3779b1)) >>> 0),
      system,
      get isFocused() {
        return kernel.activeId === def.id;
      },
      savedState: <T>() => kernel.store.get<T>(appStateKey(def.id)),
      launch: (id) => kernel.launch(id),
      home: () => kernel.launch(kernel.homeApp),
      requestFocus: () => kernel.launch(def.id),
      persist: () => {
        const r = kernel.running.get(def.id);
        if (r) kernel.persistApp(def.id, r);
      },
    };
  }
}
