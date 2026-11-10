import { useCallback, useEffect, useState } from 'react';
import { host, useHost } from './host/host';
import { KEY_HELP } from './host/input';
import { Scene } from './scene/Scene';
import { KeyLegend } from './ui/KeyLegend';
import { MusicPlayer } from './ui/MusicPlayer';
import { ICON, PixelIcon } from './ui/pixel';

const LOW_POWER_KEY = 'host:lowPower';

/**
 * The page comes on in order: Dotoro opens vertically, then the room breathes in behind it, then the
 * controls.
 */
type Intro = 'waiting' | 'device' | 'room' | 'ui';

/** Matches `device-on` in styles.css. */
const DEVICE_MS = 900;
/** How far into the room's fade the controls start to appear. */
const ROOM_MS = 700;

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function App() {
  const { powered, app, theme, muted } = useHost();
  const [helpOpen, setHelpOpen] = useState(false);
  const [lowPower, setLowPower] = useState(() => host.store.get<boolean>(LOW_POWER_KEY) ?? false);
  const [fullscreen, setFullscreen] = useState(false);
  const [intro, setIntro] = useState<Intro>(REDUCED_MOTION ? 'ui' : 'waiting');

  const deviceReady = useCallback(() => setIntro((now) => (now === 'waiting' ? 'device' : now)), []);

  useEffect(() => {
    if (intro === 'device') {
      const timer = setTimeout(() => {
        setIntro('room');
        // A resize during the animation would have measured the squashed canvas; measure it again.
        window.dispatchEvent(new Event('resize'));
      }, DEVICE_MS);
      return () => clearTimeout(timer);
    }
    if (intro === 'room') {
      const timer = setTimeout(() => setIntro('ui'), ROOM_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [intro]);

  // Listened for, not assumed: Esc leaves fullscreen without going through the button.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    host.start();
    return () => host.stop();
  }, []);

  // The page takes on the theme's ambient colors.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--ambient-bg', theme.ambient.background);
    root.setProperty('--ambient-accent', theme.ambient.accent);
    root.setProperty('--screen-glow', theme.ambient.screenGlow);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.ambient.background);
  }, [theme]);

  useEffect(() => host.store.set(LOW_POWER_KEY, lowPower), [lowPower]);

  // P toggles low-power mode. (The device owns arrows, WASD, Enter, Space, M, Esc and B; music has J, K, L.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      setLowPower((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pressPower = () => {
    host.input.press('power', 'ui');
    host.input.release('power');
  };

  return (
    <div className={`app${lowPower ? ' low-energy' : ''}`} data-intro={intro}>
      <div className="stage">
        <Scene accent={theme.ambient.accent} onDeviceReady={deviceReady} />
      </div>

      <div className="ui">
        <header className="top-ui">
          <h1 className="wordmark">dotoro</h1>
          <nav className="icons" aria-label="Settings">
            <button
              className="icon hide-small-screen"
              data-tip={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={toggleFullscreen}
            >
              <PixelIcon rows={fullscreen ? ICON.fullscreenExit : ICON.fullscreen} />
            </button>
            <button
              className="icon"
              data-tip={muted ? 'Device sounds off' : 'Device sounds on'}
              aria-label={muted ? 'Unmute device sounds' : 'Mute device sounds'}
              onClick={() => host.setMuted(!muted)}
            >
              <PixelIcon rows={muted ? ICON.soundOff : ICON.soundOn} />
            </button>
            <button
              className={`icon${helpOpen ? ' active' : ''}`}
              data-tip="About"
              aria-label="About"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((v) => !v)}
            >
              <PixelIcon rows={ICON.about} />
            </button>
          </nav>
        </header>

        {helpOpen && (
          <aside className="help" role="dialog" aria-label="About">
            <dl>
              {KEY_HELP.map((k) => (
                <div key={k.keys}>
                  <dt>{k.keys.toLowerCase()}</dt>
                  <dd>{k.action.toLowerCase()}</dd>
                </div>
              ))}
              <div>
                <dt>j / k / l</dt>
                <dd>previous · play/pause · next song</dd>
              </div>
              <div>
                <dt>p</dt>
                <dd>low-power mode{lowPower ? ' (on)' : ''}</dd>
              </div>
            </dl>
            <p className="help-note">your settings, timer and scores stay on this device.</p>
            <p className="credit">
              made by{' '}
              <a className="red" href="https://wonbon.is-a.dev" target="_blank" rel="noopener noreferrer">
                W0NB0N
              </a>
            </p>
          </aside>
        )}

        {!powered && (
          <button className="power-hint" onClick={pressPower} aria-label="Press power to start">
            <span className="red">
              press <PixelIcon rows={ICON.power} scale={2} />
            </span>{' '}
            to start
          </button>
        )}

        <MusicPlayer />
        <KeyLegend app={app} />
      </div>
      {/* CRT: scanlines with an RGB phosphor mask, rolling slowly, and a dark vignette. */}
      <div className="crt-lines" aria-hidden />
      <div className="vignette" aria-hidden />
    </div>
  );
}
