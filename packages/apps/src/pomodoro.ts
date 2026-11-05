import type { AppDefinition, Gfx } from '@dotoro/kernel';
import { SPRITES } from './assets';
import {
  bindVfdRoles,
  COLON_DOTS,
  DEFAULT_VFD,
  DIGIT_SEGMENTS,
  HEADER_ROLES,
  INDICATOR,
  PROGRESS_PIXELS,
  SEGMENTS,
  SLOT_COORDS,
  type VfdPalette,
} from './vfd';

type TimerState = 'stopped' | 'running' | 'paused' | 'alarm';
type Selection = 'minutes' | 'seconds';

interface PomodoroState {
  /** 0 = Focus 1, 1 = Rest 1, 2 = Focus 2, 3 = Rest 2. */
  session: number;
  state: TimerState;
  selection: Selection;
  /** Remaining whole seconds while not running. */
  remaining: number;
  /** Length of the current countdown, for the progress bar. */
  total: number;
  /** Wall-clock ms when the current run started (running only). */
  startedAt: number | null;
  /** Remaining seconds when the current run started. */
  startRemaining: number;
}

const FOCUS_MINUTES = 25;
const REST_MINUTES = 5;
const SESSIONS = 4;

const isFocus = (session: number) => session % 2 === 0;
const sessionLength = (session: number) => (isFocus(session) ? FOCUS_MINUTES : REST_MINUTES) * 60;

const templatePalette = bindVfdRoles(SPRITES.vfdTemplate);
const headerPalettes = SPRITES.vfdHeaders.map((h) => bindVfdRoles(h, HEADER_ROLES));

/**
 * Pomodoro timer on a VFD face: Focus 25m / Rest 5m x 2.
 * Time is derived from wall-clock timestamps, so it keeps running while other apps are open,
 * across tab throttling, and across page reloads.
 */
export const pomodoroApp: AppDefinition = {
  id: 'pomodoro',
  title: 'Pomodoro',
  showInMenu: true,
  menuLines: ['POMO', 'DORO'],
  create(ctx) {
    const s: PomodoroState = {
      session: 0,
      state: 'stopped',
      selection: 'minutes',
      remaining: sessionLength(0),
      total: sessionLength(0),
      startedAt: null,
      startRemaining: 0,
      ...ctx.savedState<PomodoroState>(),
    };
    const vfd: VfdPalette = DEFAULT_VFD; // TODO(theme packs): read from the active theme

    const remainingNow = () =>
      s.state === 'running' && s.startedAt !== null
        ? Math.max(0, s.startRemaining - Math.floor((ctx.now() - s.startedAt) / 1000))
        : s.remaining;

    const pause = () => {
      s.remaining = remainingNow();
      s.state = 'paused';
      s.startedAt = null;
    };

    const setRemaining = (minutes: number, seconds: number) => {
      s.remaining = minutes * 60 + seconds;
      s.total = s.remaining; // editing restarts the progress bar
    };

    return {
      background() {
        if (s.state === 'running' && remainingNow() <= 0) {
          s.state = 'alarm';
          s.remaining = 0;
          s.startedAt = null;
          ctx.audio.loop('alarm');
          ctx.requestFocus();
          ctx.persist();
        }
      },

      onPowerOff() {
        if (s.state === 'running') pause();
      },

      onInput({ button, kind }) {
        if (kind === 'release') return;

        if (s.state === 'alarm') {
          ctx.audio.stop('alarm'); // any key silences the alarm
          if (button === 'enter' && kind === 'press') {
            s.session = (s.session + 1) % SESSIONS;
            s.state = 'stopped';
            s.selection = 'minutes';
            setRemaining(sessionLength(s.session) / 60, 0);
            ctx.persist();
          }
          return;
        }

        const editable = s.state === 'stopped' || s.state === 'paused';
        const minutes = Math.floor(s.remaining / 60);
        const seconds = s.remaining % 60;

        switch (button) {
          case 'left':
          case 'right':
            if (editable && kind === 'press') s.selection = s.selection === 'minutes' ? 'seconds' : 'minutes';
            break;
          case 'up':
            if (!editable) break;
            if (s.selection === 'minutes') setRemaining((minutes + 1) % 100, seconds);
            else setRemaining(minutes, seconds >= 45 ? 0 : seconds + 15);
            break;
          case 'down':
            if (!editable) break;
            if (s.selection === 'minutes') setRemaining((minutes + 99) % 100, seconds);
            else setRemaining(minutes, seconds <= 15 ? 0 : seconds - 15);
            break;
          case 'enter':
            if (kind !== 'press') break;
            if (editable) {
              if (s.remaining === 0) break;
              if (s.state === 'stopped') s.total = s.remaining;
              s.state = 'running';
              s.startedAt = ctx.now();
              s.startRemaining = s.remaining;
            } else if (s.state === 'running') {
              pause();
            }
            ctx.persist();
            break;
        }
      },

      render(g: Gfx) {
        const now = ctx.now();
        const blinkOn = Math.floor(now / 500) % 2 === 0;
        const remaining = remainingNow();

        // 1. Unlit VFD template, then the session header (title + session marks) over rows 0-3
        g.sprite(SPRITES.vfdTemplate, 0, 0, 0, { palette: templatePalette(vfd) });
        g.sprite(SPRITES.vfdHeaders[s.session]!, 0, 0, 0, {
          palette: headerPalettes[s.session]!(vfd),
          src: { x: 0, y: 0, w: 32, h: 4 },
        });

        // 2. Digits MM:SS. Selected pair blinks while editing; everything blinks on alarm.
        const digits =
          String(Math.floor(remaining / 60)).padStart(2, '0') + String(remaining % 60).padStart(2, '0');
        const editable = s.state === 'stopped' || s.state === 'paused';
        for (let i = 0; i < 4; i++) {
          const selected = s.selection === 'minutes' ? i < 2 : i >= 2;
          if ((editable && selected && !blinkOn) || (s.state === 'alarm' && !blinkOn)) continue;
          const [sx, sy] = SLOT_COORDS[i]!;
          const segs = DIGIT_SEGMENTS[digits[i]!] ?? '';
          for (const seg of segs) for (const [x, y] of SEGMENTS[seg]!.glow) g.pixel(sx + x, sy + y, vfd.litGlow);
          for (const seg of segs) for (const [x, y] of SEGMENTS[seg]!.core) g.pixel(sx + x, sy + y, vfd.litCore);
        }

        // 3. Colon blinks while running or ringing
        if ((s.state === 'running' || s.state === 'alarm') && blinkOn) {
          for (const [x, y] of COLON_DOTS) g.fillRect(x, y, 2, 2, vfd.colonLit);
        }

        // 4. Running indicator: blinking cross; blacked out otherwise
        const [ix, iy] = INDICATOR;
        if (s.state === 'running' && blinkOn) {
          for (const [dx, dy] of [[1, 1], [1, 0], [0, 1], [2, 1], [1, 2]] as const) g.pixel(ix + dx, iy + dy, vfd.indicatorLit);
          for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) g.pixel(ix + dx, iy + dy, vfd.indicatorGlow);
        } else {
          g.fillRect(ix, iy, 3, 3, vfd.off);
        }

        // 5. Progress bar fills while running; full on alarm; grey otherwise
        let filled = 0;
        if (s.state === 'alarm') filled = PROGRESS_PIXELS.length;
        else if (s.state === 'running') {
          const total = Math.max(1, s.total);
          const progress = Math.min(1, Math.max(0, (total - remaining) / total));
          filled = Math.floor(progress * PROGRESS_PIXELS.length);
        }
        PROGRESS_PIXELS.forEach(([x, y], i) => g.pixel(x, y, i < filled ? vfd.progressFill : vfd.progressUnlit));
      },

      save: () => ({ ...s }),
    };
  },
};
