import { useEffect, useState } from 'react';
import { host, useHost } from './host/host';
import { KEY_HELP } from './host/input';
import { Scene } from './scene/Scene';

export function App() {
  const { powered, theme, muted } = useHost();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    host.start();
    return () => host.stop();
  }, []);

  // The page takes on the theme's ambient colors (full theme environments come with theme packs).
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--ambient-bg', theme.ambient.background);
    root.setProperty('--ambient-accent', theme.ambient.accent);
    root.setProperty('--screen-glow', theme.ambient.screenGlow);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.ambient.background);
  }, [theme]);

  const powerOn = () => {
    host.input.press('power', 'ui');
    host.input.release('power');
  };

  return (
    <div className="app">
      <div className="stage">
        <Scene accent={theme.ambient.accent} />
      </div>

      <header className="topbar">
        <h1 className="wordmark">DOTORO</h1>
        <div className="toolbar">
          <button
            className="icon-btn"
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
            onClick={() => host.setMuted(!muted)}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            className="icon-btn"
            aria-label="Controls"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((v) => !v)}
          >
            ?
          </button>
        </div>
      </header>

      {!powered && (
        <button className="power-hint" onClick={powerOn}>
          <span className="power-glyph" aria-hidden>
            ⏻
          </span>
          Press power to start
        </button>
      )}

      {helpOpen && (
        <aside className="help" role="dialog" aria-label="Controls">
          <h2>Controls</h2>
          <dl>
            {KEY_HELP.map((k) => (
              <div key={k.keys}>
                <dt>{k.keys}</dt>
                <dd>{k.action}</dd>
              </div>
            ))}
          </dl>
          <p className="help-note">Runs fully offline. Your settings, timer and high scores stay on this device.</p>
        </aside>
      )}
    </div>
  );
}
