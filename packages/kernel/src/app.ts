import type { AudioSink } from './audio';
import type { Gfx } from './gfx';
import type { InputEvent } from './input';
import type { Rng } from './rng';
import type { KeyValueStore } from './storage';
import type { PaletteRole, Theme } from './theme';

/**
 * A program running on Dotoro. Every hook is optional except `render`.
 * Instances live for the whole kernel lifetime, so state survives switching apps.
 */
export interface App {
  /** Became the foreground app. */
  onEnter?(): void;
  /** Stopped being the foreground app. */
  onExit?(): void;
  /** Button input; only delivered while in the foreground. */
  onInput?(event: InputEvent): void;
  /** Fixed-step logic (Kernel.STEP_MS) while in the foreground. */
  update?(dtMs: number): void;
  /** Fixed-step logic for every app while powered (timers, alarms). Keep it cheap. */
  background?(dtMs: number): void;
  /** The device is being switched off. */
  onPowerOff?(): void;
  /** Draw the current state. Called once per host frame while in the foreground. */
  render(g: Gfx): void;
  /** Snapshot persisted across reloads; handed back via `ctx.savedState()`. */
  save?(): unknown;
}

/** Kernel features reserved for system apps (menu, themes, settings). */
export interface SystemServices {
  menuApps(): readonly AppDefinition[];
  themes(): readonly Theme[];
  setTheme(id: string): void;
}

export interface AppContext {
  readonly id: string;
  /** Wall-clock epoch ms (from the kernel's injected clock). */
  now(): number;
  /** Current theme (live: re-read it each frame). */
  readonly theme: Theme;
  readonly audio: AudioSink;
  /** Persistent key/value data scoped to this app (high scores, preferences). */
  readonly store: KeyValueStore;
  /** Seeded RNG owned by this app. */
  readonly rng: Rng;
  readonly system: SystemServices;
  readonly isFocused: boolean;
  /** The value this app's `save()` returned last session, if any. */
  savedState<T>(): T | undefined;
  /** Switch the foreground to another app. */
  launch(id: string): void;
  /** Return to the home app (menu). */
  home(): void;
  /** Bring this app to the foreground (e.g. an alarm firing while another app is open). */
  requestFocus(): void;
  /** Persist `save()` now instead of waiting for the next automatic save. */
  persist(): void;
}

export interface AppDefinition {
  id: string;
  /** Label shown in the menu. */
  title: string;
  showInMenu?: boolean;
  /** Palette role for the menu label. Default 'accent'. */
  menuColor?: PaletteRole;
  /** Custom multi-line menu label (e.g. POMO / DORO). */
  menuLines?: readonly string[];
  create(ctx: AppContext): App;
}
