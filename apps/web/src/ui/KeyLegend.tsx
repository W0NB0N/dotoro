import type { Button, KeyHint } from '@dotoro/kernel';
import { host } from '../host/host';
import { ICON, PixelIcon } from './pixel';

type Rows = readonly string[];

const mirrored = (rows: Rows): Rows => rows.map((row) => [...row].reverse().join(''));
/** A quarter turn clockwise. */
const turned = (rows: Rows): Rows =>
  Array.from({ length: rows[0]!.length }, (_, x) => rows.map((row) => row[x]!).reverse().join(''));

const DOWN = turned(ICON.arrow);
const ARROWS: Partial<Record<Button, Rows>> = {
  right: ICON.arrow,
  left: mirrored(ICON.arrow),
  down: DOWN,
  up: [...DOWN].reverse(),
};

const LABELS: Partial<Record<Button, string>> = { enter: 'enter', menu: 'm' };

const MENU_HINT: KeyHint = { keys: ['menu'], action: 'menu' };

function Key({ button }: { button: Button }) {
  const rows = ARROWS[button];
  return rows ? <PixelIcon rows={rows} scale={1.7} /> : <kbd>{LABELS[button] ?? button}</kbd>;
}

/** Shows what the keys do in the app on the screen. */
export function KeyLegend({ app }: { app: string | null }) {
  const hints = host.kernel.apps.find((a) => a.id === app)?.hints;
  if (!hints) return null;
  return (
    <ul className="key-legend" aria-label="Keys">
      {[...hints, ...(app === 'menu' ? [] : [MENU_HINT])].map((hint) => (
        <li key={hint.action} aria-label={`${hint.keys.join(' ')}: ${hint.action}`}>
          <span className="key-keys">
            {hint.keys.map((button) => (
              <Key key={button} button={button} />
            ))}
          </span>
          <span>{hint.action}</span>
        </li>
      ))}
    </ul>
  );
}
