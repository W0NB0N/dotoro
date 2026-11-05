/** The seven physical keys on Dotoro. Every input source is normalised to these. */
export const BUTTONS = ['up', 'down', 'left', 'right', 'enter', 'menu', 'power'] as const;
export type Button = (typeof BUTTONS)[number];

/**
 * `press`   – key went down
 * `repeat`  – key is being held (auto-repeat, roughly 10–30 Hz)
 * `release` – key went up
 */
export type InputKind = 'press' | 'repeat' | 'release';

export interface InputEvent {
  readonly button: Button;
  readonly kind: InputKind;
  /** Wall-clock time of the event, ms. */
  readonly time: number;
}

export const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
export type Direction = keyof typeof DIRECTIONS;

export function isDirection(button: Button): button is Direction {
  return button in DIRECTIONS;
}

export function isButton(value: string): value is Button {
  return (BUTTONS as readonly string[]).includes(value);
}
