import type { AudioSink } from './audio';
import type { Gfx } from './gfx';
import type { Button, InputEvent } from './input';
import type { Rng } from './rng';
import type { KeyValueStore } from './storage';
import type { Theme } from './theme';

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

/** The shelf an app sits on in the menu. */
export type AppCategory = 'games' | 'tools';

/** Menu art: equal-sized frames of text rows, one character per pixel. The menu defines the letters. */
export interface AppIcon {
  readonly frames: readonly (readonly string[])[];
}

/** What a set of keys does in an app, for the host to show next to the device. */
export interface KeyHint {
  readonly keys: readonly Button[];
  readonly action: string;
}

export interface AppDefinition {
  id: string;
  /** Label shown in the menu. */
  title: string;
  showInMenu?: boolean;
  /** Default 'tools'. */
  category?: AppCategory;
  icon?: AppIcon;
  hints?: readonly KeyHint[];
  create(ctx: AppContext): App;
}
