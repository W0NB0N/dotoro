import type { AppDefinition } from '@dotoro/kernel';
import { pomodoroApp } from './pomodoro';
import { snakeApp } from './snake';
import { bootApp, galleryApp, menuApp, themesApp } from './system';

export { GALLERY, SPRITES } from './assets';
export { pomodoroApp } from './pomodoro';
export { snakeApp } from './snake';
export { bootApp, galleryApp, menuApp, themesApp } from './system';
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
