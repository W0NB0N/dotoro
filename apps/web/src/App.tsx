import { useEffect, useState } from 'react';
import { host, useHost } from './host/host';
import { KEY_HELP } from './host/input';
import { Scene } from './scene/Scene';
import { MusicPlayer } from './ui/MusicPlayer';
import { ICON, PixelIcon } from './ui/pixel';

const LOW_POWER_KEY = 'host:lowPower';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

export function App() {
  const { powered, theme, muted } = useHost();
  const [helpOpen, setHelpOpen] = useState(false);
  const [lowPower, setLowPower] = useState(() => host.store.get<boolean>(LOW_POWER_KEY) ?? false);

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

  const powerOn = () => {
    host.input.press('power', 'ui');
    host.input.release('power');
  };

  return (
    <div className={`app${lowPower ? ' low-energy' : ''}`}>
      <div className="crt-on">
        <div className="stage">
          <Scene accent={theme.ambient.accent} />
        </div>

        <div className="ui">
          <header className="top-ui">
            <h1 className="wordmark">dotoro</h1>
            <nav className="icons" aria-label="Settings">
              <button className="icon hide-small-screen" data-tip="Fullscreen" aria-label="Fullscreen" onClick={toggleFullscreen}>
                <PixelIcon rows={ICON.fullscreen} />
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
            <button className="power-hint" onClick={powerOn}>
              <span className="red">press power</span> <span aria-hidden>›</span> to start
            </button>
          )}

          <MusicPlayer />
        </div>
      </div>

      {/* CRT: scanlines with an RGB phosphor mask, rolling slowly, and a dark vignette. */}
      <div className="crt-lines" aria-hidden />
      <div className="vignette" aria-hidden />
    </div>
  );
}
