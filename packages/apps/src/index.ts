import type { AppDefinition } from '@dotoro/kernel';
import { menuApp } from './menu';
import { pomodoroApp } from './pomodoro';
import { snakeApp } from './snake';
import { bootApp, galleryApp, themesApp } from './system';

export { GALLERY, SPRITES } from './assets';
export { pomodoroApp } from './pomodoro';
export { snakeApp } from './snake';
export { menuApp } from './menu';
export { bootApp, galleryApp, themesApp } from './system';
export * from './chrome';
export * from './hud';
export * from './vfd';

/** Built-in apps, in menu order. */
export const DEFAULT_APPS: readonly AppDefinition[] = [
  bootApp,
  menuApp,
  pomodoroApp,
  snakeApp,
  themesApp,
  galleryApp,
];
