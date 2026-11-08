/**
 * The lofi radio: each station is one song from the Night City mix, looping. The songs live in
 * public/music, cut from the mix where it pauses between songs (or at the tracklist's timestamps
 * where songs cross-fade). They stream rather than precache: together they are about 31 MB.
 */

export interface Station {
  id: string;
  name: string;
  src: string;
}

const station = (file: string, name: string): Station => ({ id: file, name, src: `/music/${file}.mp3` });

export const STATIONS: readonly Station[] = [
  station('01-i-really-want-to-stay', 'I Really Want to Stay at Your House [LoFi Remix] - SageNine'),
  station('02-johnnys-lament', "Johnny's Lament [Remix] - J-Peeeeazy"),
  station('03-leaving', 'Leaving - Akasashi'),
  station('04-fade-away', 'Fade Away [High Tech Low Life Remix] - Acacian Alchemy'),
  station('05-synthwave-zen', 'Synthwave Zen - CyberLo-fi'),
  station('06-2077', '2077 - 7vnth'),
  station('07-dream', 'Dream - OlSoulEli'),
  station('08-artificial-dystopia', 'Artificial Dystopia - CyberLo-fi'),
  station('09-night-city', 'Night City - Common Rare'),
  station('10-ethereal', 'Ethereal - Ludwig Del Pino'),
  station('11-sonder', 'Sonder - JAEWON | kibyuna'),
  station('12-grounded', 'Grounded - Shane Houghtaling & Releaf'),
  station('13-mechanical-flow', 'Mechanical Flow - CyberLo-fi'),
  station('14-never-fade-away', 'Never Fade Away [House Remix] - Alex Acacia'),
];

export interface LofiState {
  playing: boolean;
  /** Waiting for audio after pressing play or changing song. */
  loading: boolean;
  volume: number;
  station: Station;
  shuffle: boolean;
}

export class LofiPlayer {
  private audio: HTMLAudioElement | null = null;
  private readonly listeners = new Set<() => void>();
  private state: LofiState;

  constructor(initial: { volume?: number; stationId?: string; shuffle?: boolean } = {}) {
    this.state = {
      playing: false,
      loading: false,
      volume: initial.volume ?? 0.6,
      station: STATIONS.find((s) => s.id === initial.stationId) ?? STATIONS[0]!,
      shuffle: initial.shuffle ?? false,
    };
  }

  get snapshot(): LofiState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<LofiState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.src = this.state.station.src;
    a.volume = this.gainFor(this.state.volume);
    a.addEventListener('playing', () => this.set({ loading: false }));
    a.addEventListener('waiting', () => {
      if (this.state.playing) this.set({ loading: true });
    });
    a.addEventListener('error', () => this.set({ loading: false, playing: false }));
    this.audio = a;
    return a;
  }

  /** The first call must come from a user gesture: browsers only start audio on one. */
  play(): void {
    const a = this.element();
    this.set({ playing: true, loading: a.readyState < 3 });
    a.play().catch(() => this.set({ playing: false, loading: false }));
  }

  pause(): void {
    this.audio?.pause();
    this.set({ playing: false, loading: false });
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    if (this.audio) this.audio.volume = this.gainFor(v);
    this.set({ volume: v });
  }

  setShuffle(shuffle: boolean): void {
    this.set({ shuffle });
  }

  /** Next or previous in order, or any other song when shuffling. */
  next(direction: 1 | -1 = 1): void {
    let to: Station;
    if (this.state.shuffle) {
      const others = STATIONS.filter((s) => s.id !== this.state.station.id);
      to = others[Math.floor(Math.random() * others.length)]!;
    } else {
      const i = STATIONS.findIndex((s) => s.id === this.state.station.id);
      to = STATIONS[(i + direction + STATIONS.length) % STATIONS.length]!;
    }
    this.set({ station: to });
    if (this.audio) {
      this.audio.src = to.src;
      if (this.state.playing) this.play();
    }
  }

  /** Squared, so the volume bar feels even from one step to the next. */
  private gainFor(volume: number): number {
    return volume * volume;
  }
}
