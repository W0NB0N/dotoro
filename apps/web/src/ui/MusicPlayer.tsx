import { type PointerEvent, useEffect, useSyncExternalStore } from 'react';
import { host } from '../host/host';
import { LofiPlayer } from '../host/lofi';
import { ICON, PixelIcon } from './pixel';

const VOLUME_STEPS = 11;

/** One player for the page; its settings live in the host store with everything else. */
export const music = new LofiPlayer({
  volume: host.store.get<number>('music:volume') ?? 0.6,
  stationId: host.store.get<string>('music:station') ?? undefined,
  shuffle: host.store.get<boolean>('music:shuffle') ?? false,
});
music.subscribe(() => {
  const { volume, station, shuffle } = music.snapshot;
  host.store.set('music:volume', volume);
  host.store.set('music:station', station.id);
  host.store.set('music:shuffle', shuffle);
});

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Bottom-left, lofi.cafe style: transport icons, a segmented volume bar, and the station line. */
export function MusicPlayer() {
  const { playing, loading, volume, station, shuffle } = useSyncExternalStore(
    (l) => music.subscribe(l),
    () => music.snapshot,
  );

  // J previous, K play/pause, L next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.code === 'KeyJ') music.next(-1);
      else if (e.code === 'KeyK') music.toggle();
      else if (e.code === 'KeyL') music.next(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const level = Math.round(volume * (VOLUME_STEPS - 1));
  const setLevel = (n: number) => music.setVolume(Math.max(0, Math.min(VOLUME_STEPS - 1, n)) / (VOLUME_STEPS - 1));
  /** The segment under the pointer. Past either end of the bar counts as that end. */
  const setLevelFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const { left, width } = e.currentTarget.getBoundingClientRect();
    setLevel(Math.floor(((e.clientX - left) / width) * VOLUME_STEPS));
  };

  return (
    <section className="player" aria-label="Music">
      <div className="player-controls">
        <button className="icon" data-tip={playing ? 'Pause [K]' : 'Play [K]'} aria-label={playing ? 'Pause music' : 'Play music'} onClick={() => music.toggle()}>
          <PixelIcon rows={playing ? ICON.pause : ICON.play} />
        </button>
        <button
          className={`icon${shuffle ? ' active' : ''}`}
          data-tip={shuffle ? 'Shuffle on' : 'Shuffle off'}
          aria-label="Shuffle"
          aria-pressed={shuffle}
          onClick={() => music.setShuffle(!shuffle)}
        >
          <PixelIcon rows={ICON.shuffle} />
        </button>
        <button className="icon" data-tip="Previous [J]" aria-label="Previous song" onClick={() => music.next(-1)}>
          <PixelIcon rows={ICON.previous} />
        </button>
        <button className="icon" data-tip="Next [L]" aria-label="Next song" onClick={() => music.next(1)}>
          <PixelIcon rows={ICON.next} />
        </button>
        <div
          className="volume"
          data-tip={`Volume ${level * 10}%`}
          role="slider"
          tabIndex={0}
          aria-label="Music volume"
          aria-valuemin={0}
          aria-valuemax={VOLUME_STEPS - 1}
          aria-valuenow={level}
          onKeyDown={(e) => {
            // Keep the arrows from also steering the device while the slider has focus.
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setLevel(level - 1);
            else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setLevel(level + 1);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
          onWheel={(e) => setLevel(level + (e.deltaY < 0 ? 1 : -1))}
          onPointerDown={(e) => {
            // Captured, so a drag keeps working when the pointer strays off the bar.
            e.currentTarget.setPointerCapture(e.pointerId);
            setLevelFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) setLevelFromPointer(e);
          }}
        >
          {Array.from({ length: VOLUME_STEPS }, (_, i) => (
            <span key={i} className={i <= level && level > 0 ? 'on' : 'off'} />
          ))}
        </div>
      </div>
      <button className="station" onClick={() => music.next(1)} title="Next song [L]">
        {/* Paused, the bars rest at one pixel each, so they read as dots that grow into the visualizer on
            play; loading, those dots light up one by one. */}
        <span className={`visualizer${loading ? ' resting loading' : playing ? '' : ' resting'}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>{' '}
        <span className="red">click to change</span> <span aria-hidden>›</span>{' '}
        <span className="station-name">{station.name}</span>
      </button>
    </section>
  );
}
